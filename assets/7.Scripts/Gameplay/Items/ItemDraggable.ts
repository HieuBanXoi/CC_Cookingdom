import { _decorator, Node, Tween, tween, Vec2, Vec3, Enum, EventTouch, UITransform } from 'cc';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { InputManager } from '../../Managers/InputManager';
import { ItemType } from './ItemType';
import type { Item } from './Item';
import { Ply_EventHandlerComponent } from '../../Core/Base/Ply_EventHandlerComponent';
import { GameManager } from '../../Managers/GameManager';

const { ccclass, property } = _decorator;

@ccclass('ItemDraggable')
export class ItemDraggable extends Ply_EventHandlerComponent {

    @property
    public isDraggable: boolean = true;

    @property(Node)
    public returnTransform: Node = null!;

    @property
    public setParentToReturnTransform: boolean = true;

    @property
    public returnToStartOnDragFailed: boolean = true;

    @property
    public returnToExactReturnTransformPosition: boolean = true;

    @property
    public cacheStartPosWhenStart: boolean = false;

    @property({ type: Enum(ItemType) })
    public targetItemType: ItemType = ItemType.None;

    @property(Node)
    public shadowObject: Node = null!;

    @property
    public playReturnToStartFinishSound: boolean = false;

    @property({ type: Enum(FxType) })
    public returnToStartFinishFxType: FxType = FxType.Failed;

    @property
    public spawnBreakHeartOnDropFail: boolean = true;

    @property
    public playBeginDragSound: boolean = true;

    @property({ type: Enum(FxType) })
    public beginDragFxType: FxType = FxType.Click;

    @property
    public liftOffset: number = 1.0;

    @property
    public dragScaleMultiplier: number = 1.1;

    @property
    public dragScaleDuration: number = 0.15;

    @property({ min: 0, tooltip: 'Break heart on drop fail only if the item was dragged farther than this (world units). A short tap/nudge returns silently.' })
    public minDragDistanceForBreakHeart: number = 30;

    @property({ type: Ply_Event, tooltip: 'On begin drag event' })
    public onBeginDrag: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'On drop success event (Passes target Node)' })
    public onDropSuccess: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'On drop fail event' })
    public onDropFail: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'On return to start complete event' })
    public onReturnToStartComplete: Ply_Event = new Ply_Event();

    public item: Item | null = null;

    private originalParent: Node | null = null;
    private originalSiblingIndex: number = 0;
    private originalLocalPos: Vec3 = new Vec3();
    private originalScale: Vec3 = new Vec3();
    private originalWorldScale: Vec3 = new Vec3();
    private dragStartWorldPos: Vec3 = new Vec3();
    private originalWorldPos: Vec3 = new Vec3();

    private isDraggingSession: boolean = false;
    private isReturningToStart: boolean = false;
    private isForceReturningToStart: boolean = false;
    private spawnHeartOnReturnComplete: boolean = true;
    private enableDraggableOnReturnComplete: boolean = false;
    private currentDropFailIsValidAction: boolean = false;
    private consumeCurrentDropFail: boolean = false;
    private suppressCurrentDropFailEffect: boolean = false;
    private pendingDragDelta: Vec2 = new Vec2();

    private cachedReturnPosition: Vec3 = new Vec3();
    private hasCachedReturnPosition: boolean = false;

    public get IsDragging(): boolean {
        return this.isDraggingSession;
    }

    public get IsReturningToStart(): boolean {
        return this.isReturningToStart;
    }

    public resetInEditor() {
        if (!this.onBeginDrag) this.onBeginDrag = new Ply_Event();
        if (!this.onDropSuccess) this.onDropSuccess = new Ply_Event();
        if (!this.onDropFail) this.onDropFail = new Ply_Event();
        if (!this.onReturnToStartComplete) this.onReturnToStartComplete = new Ply_Event();
    }

    protected onLoad() {
        this.item = this.getComponent('Item') as Item | null;
        this.originalParent = this.node.parent;
        this.originalSiblingIndex = this.node.getSiblingIndex();
        Vec3.copy(this.originalLocalPos, this.node.position);
        Vec3.copy(this.originalScale, this.node.scale);
        Vec3.copy(this.originalWorldScale, this.node.worldScale);
        Vec3.copy(this.originalWorldPos, this.node.worldPosition);

        // Ensure node has a valid UITransform for touch events.
        let uiTransform = this.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = this.addComponent(UITransform);
            uiTransform.setContentSize(100, 100);
        }

        if (this.cacheStartPosWhenStart) {
            Vec3.copy(this.cachedReturnPosition, this.returnTransform ? this.returnTransform.worldPosition : this.node.worldPosition);
            this.hasCachedReturnPosition = true;
        }

    }

    public HandleTouchMove(event: EventTouch) {
        if (!this.isDraggingSession) return;

        // Item positions are in Canvas/UI coordinates, not physical screen
        // pixels. Convert the pointer delta to the same coordinate system so
        // its visible movement stays aligned with the cursor at any canvas
        // scale or aspect ratio.
        const uiDelta = event.getUIDelta();
        this.pendingDragDelta.set(
            this.pendingDragDelta.x + uiDelta.x,
            this.pendingDragDelta.y + uiDelta.y,
        );
    }

    protected update(): void {
        this.ApplyPendingDragMove();
    }

    private ApplyPendingDragMove(): void {
        if (!this.isDraggingSession || (this.pendingDragDelta.x === 0 && this.pendingDragDelta.y === 0)) return;

        const currentPosition = this.node.worldPosition;
        this.node.setWorldPosition(
            currentPosition.x + this.pendingDragDelta.x,
            currentPosition.y + this.pendingDragDelta.y,
            currentPosition.z,
        );
        this.pendingDragDelta.set(0, 0);
    }

    public CompleteTouchDrag() {
        this.ApplyPendingDragMove();
    }

    public BeginDrag(): boolean {
        if (!GameManager.Ins?.IsPlaying() || !this.CanDrag()) return false;

        // A new interaction clears any success/failure feedback still attached
        // to this item (HeartFX or BreakHeartFX).
        this.item?.TurnOffActiveEffect();
        Tween.stopAllByTarget(this.node);
        this.pendingDragDelta.set(0, 0);
        this.isReturningToStart = false;
        this.isForceReturningToStart = false;
        this.suppressCurrentDropFailEffect = false;
        this.currentDropFailIsValidAction = false;
        this.consumeCurrentDropFail = false;
        this.SetShadowActive(false);
        this.PlayBeginDragSound();

        // Cache original parent and sibling index before moving to draggingNode
        if (this.node.parent && (!InputManager.Ins || this.node.parent !== InputManager.Ins.draggingNode)) {
            this.originalParent = this.node.parent;
            this.originalSiblingIndex = this.node.getSiblingIndex();
            Vec3.copy(this.originalLocalPos, this.node.position);
            Vec3.copy(this.originalWorldPos, this.node.worldPosition);
            // The resting scale may have changed since onLoad (ItemMoveToTarget
            // reparenting to a target with another scale, scaleOnMove, ...), so
            // re-cache it from the current local scale.
            Vec3.copy(this.originalScale, this.node.scale);
            Vec3.multiply(this.originalWorldScale, this.originalParent.worldScale, this.originalScale);
        }

        Vec3.copy(this.dragStartWorldPos, this.node.worldPosition);

        // Move to InputManager.Ins.draggingNode to display on top of other elements
        if (InputManager.Ins && InputManager.Ins.draggingNode && InputManager.Ins.draggingNode.isValid && InputManager.Ins.draggingNode.activeInHierarchy) {
            const worldPos = this.node.worldPosition.clone();
            this.node.setParent(InputManager.Ins.draggingNode);
            this.node.setWorldPosition(worldPos);
        }

        // The item may now live under a parent with a different scale than its
        // original one, so start from the world scale rather than originalScale.
        this.node.setWorldScale(this.originalWorldScale);
        const scaled = this.node.scale.clone().multiplyScalar(this.dragScaleMultiplier);
        tween(this.node).to(this.dragScaleDuration, { scale: scaled }, { easing: 'backOut' }).start();

        this.isDraggingSession = true;
        this.onBeginDrag.invoke();
        return true;
    }

    public EndDrag() {
        if (!this.CanDrag() || !this.isDraggingSession) return;
        this.pendingDragDelta.set(0, 0);
        this.isDraggingSession = false;

        const dropTarget = this.FindMatchingDropTarget();
        if (!dropTarget) {
            this.ResetScale();
            this.suppressCurrentDropFailEffect = false;
            this.currentDropFailIsValidAction = false;
            this.consumeCurrentDropFail = false;
            this.onDropFail.invoke();

            // Show the failure feedback at the rejected drop position, before
            // this item starts travelling back to its origin. A tap or a tiny
            // nudge is not a real failed attempt, so it gets no break heart.
            if (this.spawnBreakHeartOnDropFail && !this.suppressCurrentDropFailEffect
                && !this.currentDropFailIsValidAction && this.item && this.HasDraggedFarEnough()) {
                this.item.SpawnBreakHeart();
            }

            if (this.consumeCurrentDropFail) {
                // A listener took the item over completely, so it must not be
                // pulled back to its start position.
                this.SetShadowActive(true);
            } else if (this.returnToStartOnDragFailed) {
                this.ReturnToStart(false);
            } else {
                this.FinalizeFailedDrag(false);
            }

            // currentDropFailIsValidAction stays set until the next drag so a
            // companion spawning its effect later can still see it.
            this.suppressCurrentDropFailEffect = false;
            return;
        }

        // Drop Success
        this.ResetScale();
        this.SetShadowActive(true);
        // Let Pan hide its ingredient bubble for every successful drop.
        // This also supports ItemToTarget configurations whose target is a
        // child node inside a Pan rather than the Pan node itself.
        this.HidePanBubbleHint(dropTarget);
        this.onDropSuccess.invoke(dropTarget);
    }

    /**
     * Stops an in-progress drag without evaluating a drop target.  This is
     * used when gameplay input is locked (for example while a popup is open),
     * so the item cannot accidentally complete a drop or show failure FX.
     */
    public CancelDragForInputLock(): void {
        if (!this.isDraggingSession) return;

        this.pendingDragDelta.set(0, 0);
        this.isDraggingSession = false;
        this.currentDropFailIsValidAction = true;
        this.consumeCurrentDropFail = false;
        this.suppressCurrentDropFailEffect = false;
        this.ResetScale();
        this.ReturnToStart(false);
    }

    public ReturnToStart(spawnHeart: boolean = true, enableDraggableOnComplete: boolean = false) {
        this.spawnHeartOnReturnComplete = spawnHeart;
        this.enableDraggableOnReturnComplete = enableDraggableOnComplete;
        this.isReturningToStart = true;
        Tween.stopAllByTarget(this.node);

        // A canvas resize/orientation change updates the original parent's
        // transform. Returning to the world position cached in onLoad would
        // therefore use the old canvas coordinate system on Web, so resolve the
        // start position from the parent's current transform instead.
        // The item stays under draggingNode (on top) while travelling; parent
        // and sibling index are restored only once it arrives.
        let targetPos: Vec3;
        if (!this.hasCachedReturnPosition && !this.returnTransform && this.originalParent?.isValid) {
            targetPos = Vec3.transformMat4(new Vec3(), this.originalLocalPos, this.originalParent.worldMatrix);
        } else {
            targetPos = this.hasCachedReturnPosition ? this.cachedReturnPosition :
                (this.returnTransform ? this.returnTransform.worldPosition : this.originalWorldPos);
        }

        tween(this.node)
            .to(0.3, { worldPosition: new Vec3(targetPos.x, targetPos.y, this.node.worldPosition.z) }, { easing: 'quartOut' })
            .call(() => this.OnReturnToStartComplete())
            .start();
    }

    /** Returns the item to its start position without spawning a failed-drag heart. */
    public ReturnToStartWithoutHeart() {
        this.ReturnToStart(false, true);
    }

    /**
     * Finds an active Item whose type matches targetItemType and whose
     * UITransform overlaps this item's UITransform (world-space AABBs).
     * When several overlap, the one with the largest overlap area wins.
     */
    private FindMatchingDropTarget(): Node | null {
        if (this.targetItemType === ItemType.None) return null;

        const scene = this.node.scene;
        if (!scene) return null;

        const myTransform = this.getComponent(UITransform);
        if (!myTransform) return null;
        const myRect = myTransform.getBoundingBoxToWorld();

        const items = scene.getComponentsInChildren('Item') as Item[];
        let best: Node | null = null;
        let bestArea = 0;

        for (let i = 0; i < items.length; i++) {
            const otherItem = items[i];
            if (!otherItem || otherItem.node === this.node || !otherItem.node.activeInHierarchy) continue;
            if (otherItem.itemType !== this.targetItemType) continue;

            const targetTransform = otherItem.getComponent(UITransform);
            if (!targetTransform) continue;

            const targetRect = targetTransform.getBoundingBoxToWorld();
            if (!myRect.intersects(targetRect)) continue;

            const overlapW = Math.min(myRect.xMax, targetRect.xMax) - Math.max(myRect.xMin, targetRect.xMin);
            const overlapH = Math.min(myRect.yMax, targetRect.yMax) - Math.max(myRect.yMin, targetRect.yMin);
            const area = overlapW * overlapH;
            if (area > bestArea) {
                bestArea = area;
                best = otherItem.node;
            }
        }

        return best;
    }

    public TeleportToStart() {
        this.isReturningToStart = false;
        this.isForceReturningToStart = false;
        Tween.stopAllByTarget(this.node);
        this.ResetScale();

        if (!this.hasCachedReturnPosition && !this.returnTransform && this.originalParent?.isValid) {
            this.RestoreOriginalParent();
            this.node.setPosition(this.originalLocalPos);
            this.RestoreOriginalSiblingIndex();
            return;
        }

        const targetPos = this.hasCachedReturnPosition ? this.cachedReturnPosition :
            (this.returnTransform ? this.returnTransform.worldPosition : this.originalWorldPos);

        this.node.setWorldPosition(targetPos.x, targetPos.y, this.node.worldPosition.z);
        this.RestoreOriginalParent();
        this.RestoreOriginalSiblingIndex();
    }

    public RestoreOriginalParent() {
        if (this.originalParent && this.originalParent.isValid && this.node.parent !== this.originalParent) {
            const worldPos = this.node.worldPosition.clone();
            const worldScale = this.node.worldScale.clone();
            this.node.setParent(this.originalParent);
            this.node.setWorldPosition(worldPos);
            this.node.setWorldScale(worldScale);
        }
    }

    private RestoreOriginalSiblingIndex() {
        if (this.originalParent?.isValid && this.node.parent === this.originalParent
            && this.originalSiblingIndex >= 0 && this.originalSiblingIndex < this.originalParent.children.length) {
            this.node.setSiblingIndex(this.originalSiblingIndex);
        }
    }

    /** True when the item moved farther than minDragDistanceForBreakHeart since BeginDrag. */
    public HasDraggedFarEnough(): boolean {
        if (this.minDragDistanceForBreakHeart <= 0) return true;
        return Vec3.distance(this.node.worldPosition, this.dragStartWorldPos) >= this.minDragDistanceForBreakHeart;
    }

    public CanDrag(): boolean {
        // Do not start a new drag while this item is tweening back after a
        // failed drop. Otherwise onBeginDrag events can be invoked repeatedly
        // by rapid taps (for example Spoon triggering Food's "Get" animation).
        if (!this.enabled || !this.isDraggable || this.isReturningToStart) return false;
        
        // Auto-heal stuck returning flags if not currently tweening
        if (this.isForceReturningToStart && !this.isDraggingSession) {
            this.isForceReturningToStart = false;
        }
        return true;
    }

    /** Sets the accepted drop type from the Item component on the supplied node. */
    public SetTargetItemType(target: Node | null) {
        const targetItem = target?.getComponent('Item') as Item | null;
        if (!targetItem) {
            console.warn(`[ItemDraggable] Item component not found on target for ${this.node.name}.`);
            return;
        }
        this.item.itemMoveToTarget.defaultTarget = target;
        this.targetItemType = targetItem.itemType;
    }

    /** Disables the break-heart effect for subsequent failed drops. */
    public DisableSpawnBreakHeartOnDropFail(): void {
        this.spawnBreakHeartOnDropFail = false;
    }

    /** Enables the break-heart effect for subsequent failed drops. */
    public EnableSpawnBreakHeartOnDropFail(): void {
        this.spawnBreakHeartOnDropFail = true;
    }

    /** Lets a companion component spawn this failed-drop effect after its own animation finishes. */
    public SuppressCurrentDropFailEffect(): void {
        this.suppressCurrentDropFailEffect = true;
    }

    /**
     * Marks the current release as valid gameplay. Free-sweeping tools such as
     * the brush and the spoon have no drop target, so every release reaches the
     * failed-drop path even when the tool did its job.
     */
    public MarkCurrentDropFailHandled(): void {
        this.currentDropFailIsValidAction = true;
    }

    /**
     * Marks the release as valid and hands the item over to the listener, which
     * then owns its position. Use MarkCurrentDropFailHandled() instead when the
     * item should still travel back to its start.
     */
    public ConsumeCurrentDropFail(): void {
        this.currentDropFailIsValidAction = true;
        this.consumeCurrentDropFail = true;
    }

    /**
     * Spawns the failed-drop effect a companion deferred with
     * SuppressCurrentDropFailEffect(). The release can be marked as valid by
     * another onDropFail listener after that suppression, so the decision is
     * re-checked here rather than at suppression time.
     */
    public SpawnDeferredDropFailEffect(): void {
        if (this.isDraggingSession || this.currentDropFailIsValidAction || !this.spawnBreakHeartOnDropFail) return;
        this.item?.SpawnBreakHeart();
    }

    private ResetScale() {
        Tween.stopAllByTarget(this.node);
        if (!this.originalParent?.isValid || this.node.parent === this.originalParent) {
            this.node.setScale(this.originalScale);
        } else {
            // Still under draggingNode (or the drop target): restore the original
            // world scale so RestoreOriginalParent lands back on originalScale.
            this.node.setWorldScale(this.originalWorldScale);
        }
    }

    private SetShadowActive(isActive: boolean) {
        if (this.shadowObject) {
            this.shadowObject.active = isActive;
        }
    }

    private PlayBeginDragSound() {
        if (!this.playBeginDragSound) return;
        Ply_SoundManager.Ins.PlayFx(this.beginDragFxType);
    }

    private PlayReturnToStartFinishSound() {
        if (!this.playReturnToStartFinishSound) return;
        Ply_SoundManager.Ins.PlayFx(this.returnToStartFinishFxType);
    }

    private HidePanBubbleHint(target: Node): void {
        let current: Node | null = target;
        while (current) {
            const pan = current.getComponent('Pan') as any;
            if (pan?.HideBubbleHintForSuccessfulDrop) {
                pan.HideBubbleHintForSuccessfulDrop();
                return;
            }
            current = current.parent;
        }
    }

    private FinalizeFailedDrag(spawnHeart: boolean) {
        this.isForceReturningToStart = false;
        this.isReturningToStart = false;
        this.RestoreOriginalParent();
        this.RestoreOriginalSiblingIndex();
        // Snap to the exact cached local position to remove any tween drift.
        if (!this.hasCachedReturnPosition && !this.returnTransform && this.node.parent === this.originalParent) {
            this.node.setPosition(this.originalLocalPos);
        }
        this.SetShadowActive(true);
        this.PlayReturnToStartFinishSound();
        this.onReturnToStartComplete.invoke();

        if (spawnHeart && this.item) {
            this.item.OnDragFailReturnComplete();
        }
    }

    private OnReturnToStartComplete() {
        this.FinalizeFailedDrag(this.spawnHeartOnReturnComplete);
        this.spawnHeartOnReturnComplete = true;

        if (this.enableDraggableOnReturnComplete) {
            this.enableDraggableOnReturnComplete = false;
            this.EnableComponent();
        }
    }
}
