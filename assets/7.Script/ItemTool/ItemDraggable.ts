import { _decorator, Component, Node, Vec3, tween, Tween, Enum, input, Input, EventTouch, UITransform } from 'cc';
import { Ply_Event } from '../Tool/Ply_Event';
import { Ply_SoundManager, FxType } from '../Tool/Ply_SoundManager';
import { InputManager } from './InputManager';
import { ItemType } from './ItemType';
import { Item } from './Item';

const { ccclass, property } = _decorator;

@ccclass('ItemDraggable')
export class ItemDraggable extends Component {

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

    @property({ type: Ply_Event })
    public onBeginDrag: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event })
    public onDropSuccess: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event })
    public onDropFail: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event })
    public onReturnToStartComplete: Ply_Event = new Ply_Event();

    public item: Item | null = null;

    private originalParent: Node | null = null;
    private originalSiblingIndex: number = 0;
    private originalLocalPos: Vec3 = new Vec3();
    private originalScale: Vec3 = new Vec3();
    private originalWorldPos: Vec3 = new Vec3();

    private isDraggingSession: boolean = false;
    private isReturningToStart: boolean = false;
    private isForceReturningToStart: boolean = false;
    private spawnHeartOnReturnComplete: boolean = true;
    private consumeCurrentDropFail: boolean = false;

    private cachedReturnPosition: Vec3 = new Vec3();
    private hasCachedReturnPosition: boolean = false;

    public get IsDragging(): boolean {
        return this.isDraggingSession;
    }

    public get IsReturningToStart(): boolean {
        return this.isReturningToStart;
    }

    protected onLoad() {
        this.item = this.getComponent(Item);
        this.originalParent = this.node.parent;
        this.originalSiblingIndex = this.node.getSiblingIndex();
        Vec3.copy(this.originalLocalPos, this.node.position);
        Vec3.copy(this.originalScale, this.node.scale);
        Vec3.copy(this.originalWorldPos, this.node.worldPosition);

        // Ensure node has a valid UITransform for touch events
        let uiTransform = this.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = this.addComponent(UITransform);
            uiTransform.setContentSize(100, 100);
        }

        if (this.cacheStartPosWhenStart) {
            Vec3.copy(this.cachedReturnPosition, this.returnTransform ? this.returnTransform.worldPosition : this.node.worldPosition);
            this.hasCachedReturnPosition = true;
        }

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    private onTouchStart(event: EventTouch) {
        this.BeginDrag();
    }

    private onTouchMove(event: EventTouch) {
        if (!this.isDraggingSession) return;
        const uiDelta = event.getUIDelta();
        const curPos = this.node.worldPosition.clone();
        this.node.setWorldPosition(new Vec3(curPos.x + uiDelta.x, curPos.y + uiDelta.y, curPos.z));
    }

    private onTouchEnd(event: EventTouch) {
        this.EndDrag();
    }

    public BeginDrag(): boolean {
        if (!this.CanDrag()) return false;

        Tween.stopAllByTarget(this.node);
        this.isReturningToStart = false;
        this.isForceReturningToStart = false;
        this.SetShadowActive(false);
        this.PlayBeginDragSound();

        // Cache original parent and sibling index before moving to draggingNode
        if (this.node.parent && (!InputManager.Ins || this.node.parent !== InputManager.Ins.draggingNode)) {
            this.originalParent = this.node.parent;
            this.originalSiblingIndex = this.node.getSiblingIndex();
        }

        // Move to InputManager.Ins.draggingNode to display on top of other elements
        if (InputManager.Ins && InputManager.Ins.draggingNode && InputManager.Ins.draggingNode.isValid && InputManager.Ins.draggingNode.activeInHierarchy) {
            const worldPos = this.node.worldPosition.clone();
            const worldScale = this.node.worldScale.clone();
            this.node.setParent(InputManager.Ins.draggingNode);
            this.node.setWorldPosition(worldPos);
            this.node.setWorldScale(worldScale);
        }

        const scaled = this.originalScale.clone().multiplyScalar(this.dragScaleMultiplier);
        tween(this.node)
            .to(this.dragScaleDuration, { scale: scaled }, { easing: 'backOut' })
            .start();

        this.isDraggingSession = true;
        this.onBeginDrag.invoke();
        return true;
    }

    public EndDrag() {
        if (!this.CanDrag() || !this.isDraggingSession) return;
        this.isDraggingSession = false;
        this.consumeCurrentDropFail = false;

        if (this.targetItemType === ItemType.None) {
            this.ResetScale();
            this.onDropFail.invoke();
            if (!this.consumeCurrentDropFail) {
                if (this.returnToStartOnDragFailed) {
                    this.ReturnToStart(this.spawnBreakHeartOnDropFail);
                } else {
                    this.FinalizeFailedDrag(this.spawnBreakHeartOnDropFail);
                }
            } else {
                this.SetShadowActive(true);
            }
            return;
        }

        // Drop Success
        this.ResetScale();
        this.SetShadowActive(true);
        this.onDropSuccess.invoke();
    }

    public ReturnToStart(spawnHeart: boolean = true) {
        this.spawnHeartOnReturnComplete = spawnHeart;
        this.isReturningToStart = true;
        Tween.stopAllByTarget(this.node);

        const targetPos = this.hasCachedReturnPosition ? this.cachedReturnPosition :
            (this.returnTransform ? this.returnTransform.worldPosition : this.originalWorldPos);

        tween(this.node)
            .to(0.3, { worldPosition: targetPos }, { easing: 'quartOut' })
            .call(() => this.OnReturnToStartComplete())
            .start();
    }

    public TeleportToStart() {
        this.isReturningToStart = false;
        this.isForceReturningToStart = false;
        Tween.stopAllByTarget(this.node);
        this.ResetScale();

        const targetPos = this.hasCachedReturnPosition ? this.cachedReturnPosition :
            (this.returnTransform ? this.returnTransform.worldPosition : this.originalWorldPos);

        this.node.setWorldPosition(targetPos);
        this.RestoreOriginalParent();
    }

    public RestoreOriginalParent() {
        if (this.originalParent && this.originalParent.isValid && this.node.parent !== this.originalParent) {
            const worldPos = this.node.worldPosition.clone();
            const worldScale = this.node.worldScale.clone();
            this.node.setParent(this.originalParent);
            this.node.setWorldPosition(worldPos);
            this.node.setWorldScale(worldScale);
            if (this.originalSiblingIndex >= 0 && this.originalSiblingIndex < this.originalParent.children.length) {
                this.node.setSiblingIndex(this.originalSiblingIndex);
            }
        }
    }

    public CanDrag(): boolean {
        if (!this.enabled || !this.isDraggable) return false;
        
        // Auto-heal stuck returning flags if not currently tweening
        if (this.isForceReturningToStart && !this.isDraggingSession) {
            this.isForceReturningToStart = false;
        }
        return true;
    }

    private ResetScale() {
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this.originalScale);
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

    private FinalizeFailedDrag(spawnHeart: boolean) {
        this.isForceReturningToStart = false;
        this.isReturningToStart = false;
        this.RestoreOriginalParent();
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
    }
}
