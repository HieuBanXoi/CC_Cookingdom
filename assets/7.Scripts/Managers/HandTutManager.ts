import { _decorator, Enum, input, Input, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { Item } from '../Gameplay/Items/Item';
import { ItemType } from '../Gameplay/Items/ItemType';
import { ItemStirring } from '../Gameplay/Items/ItemStirring';
import { ItemDragRaycastTarget } from '../Gameplay/Items/ItemDragRaycastTarget';
import { InWaterItem } from '../Gameplay/Items/InWaterItem';
import { SinkBlock } from '../Gameplay/Items/SinkBlock';
import { SinkButton } from '../Gameplay/Items/SinkButton';
import { PlasticPeeler } from '../Gameplay/Items/PlasticPeeler';
import { LastBowl } from '../Gameplay/Items/LastBowl';
import { Ply_Singleton } from '../Core/Base/Ply_Singleton';
import { ComponentCache } from '../Core/Base/CacheComponent';

const { ccclass, property } = _decorator;

export enum TypeHind {
    None = 0,
    Click,
    Drag,
    Stir,
}
Enum(TypeHind);

/**
 * Idle guidance for the currently playable cooking action.
 *
 * Add this component to a manager node, then assign a hand node under the
 * Canvas and the ordered list of tutorial items in the Inspector.
 */
@ccclass('HandTutManager')
export class HandTutManager extends Ply_Singleton<HandTutManager> {
    @property({ type: [Item], tooltip: 'Items in gameplay/tutorial priority order.' })
    public items: Item[] = [];

    @property({ type: SinkBlock, tooltip: 'Drain block guided before sink-water items can be processed.' })
    public sinkBlock: SinkBlock | null = null;

    @property({ type: SinkButton, tooltip: 'Water button guided after the drain block is in place.' })
    public sinkButton: SinkButton | null = null;

    @property({ type: [InWaterItem], tooltip: 'Items currently waiting in the sink. Updated automatically by InWaterItem.' })
    public itemsInWater: InWaterItem[] = [];

    @property({ type: PlasticPeeler, tooltip: 'PlasticPeeler reference for plastic peeling guidance.' })
    public plasticPeeler: PlasticPeeler | null = null;

    @property({ tooltip: 'Relative start Y offset from maskTarget for plastic peel tutorial' })
    public plasticPeelStartY: number = 200;

    @property({ tooltip: 'Relative end Y offset from maskTarget for plastic peel tutorial' })
    public plasticPeelEndY: number = -200;

    @property({ type: LastBowl, tooltip: 'LastBowl reference for powder rotation guidance.' })
    public lastBowl: LastBowl | null = null;

    @property({ min: 10, tooltip: 'Radius for the LastBowl rotation hand tutorial gesture in pixels.' })
    public lastBowlRotateRadius: number = 80;

    @property({ tooltip: 'Show sink block/button guidance before regular item guidance at the start.' })
    public showSinkWaterTutorialOnStart = true;

    @property(Node)
    public handNode: Node = null!;

    @property({ tooltip: 'Wait for StartHandTut() instead of beginning automatically.' })
    public waitForStartSignal = false;

    @property({ min: 0 }) public idleDelay = 5;
    @property({ min: 0 }) public firstHandTutDelay = 5;
    @property({ min: 0 }) public shortIdleDelay = 0.5;
    @property({ min: 0 }) public noDelayItemCount = 3;
    @property({ min: 0 }) public breakHeartNoDelayThreshold = 3;
    @property({ min: 0 }) public maxHandTutShowCount = 0;

    @property({ min: 0.01 }) public moveDuration = 1.2;
    @property({ min: 0.01, tooltip: 'Fade duration after the drag hand reaches its target.' }) public dragFadeDuration = 0.25;
    @property({ min: 0.01 }) public clickScaleDuration = 0.35;
    @property({ min: 0 }) public waitAtEndDuration = 0.2;
    @property public clickScaleMultiplier = 1.25;

    @property({type:Item})
    public currentItemHandTut: Item | null = null;

    @property({ type: Enum(TypeHind), readonly: true })
    public TypeHind: TypeHind = TypeHind.None;

    private idleTimer = 0;
    private isStarted = false;
    private isPaused = false;
    private isPointerDown = false;
    private isGameplayDragging = false;
    private shownCount = 0;
    private hasShownFirstHint = false;
    private consecutiveDropFails = 0;
    private forceNoDelay = false;
    private handDefaultScale = new Vec3(1, 1, 1);
    private handDefaultAlpha = 255;
    private handOpacity: UIOpacity | null = null;
    private currentHintToken = 0;
    private activeAuxTween: Tween<object> | null = null;
    private activeFadeTween: Tween<UIOpacity> | null = null;
    private boundItems = new Set<Item>();
    private boundPlasticPeelers = new Set<PlasticPeeler>();
    private boundLastBowls = new Set<LastBowl>();
    private isWaitingInitialSinkWaterTutorial = false;

    protected onLoad(): void {
        super.onLoad();
        if (this.handNode) {
            Vec3.copy(this.handDefaultScale, this.handNode.scale);
            this.handOpacity = this.handNode.getComponentInChildren(UIOpacity);
            this.handDefaultAlpha = this.handOpacity?.opacity ?? 255;
            this.handNode.active = false;
        }

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected start(): void {
        this.plasticPeeler ??= this.node.scene?.getComponentInChildren(PlasticPeeler) || null;
        this.lastBowl ??= this.node.scene?.getComponentInChildren(LastBowl) || null;
        this.bindConfiguredItems();
        this.isStarted = !this.waitForStartSignal;
        this.isWaitingInitialSinkWaterTutorial = this.showSinkWaterTutorialOnStart;
    }

    protected update(deltaTime: number): void {
        this.removeCompletedItems();
        if (!this.isStarted || this.isPaused || !this.handNode) return;

        // A phase can deactivate an item while its hint is already playing.
        // Hide it immediately so the hand never points to invisible content.
        if (this.currentItemHandTut
            && (!this.currentItemHandTut.node.activeInHierarchy || this.currentItemHandTut.isDone)) {
            this.hideHandTut();
            this.resetIdleTimer();
            return;
        }

        if (this.isPointerDown || this.isGameplayDragging) {
            this.resetIdleTimer();
            this.hideHandTut();
            return;
        }

        this.idleTimer += deltaTime;
        if (!this.handNode.active && this.idleTimer >= this.getCurrentDelay()) {
            this.idleTimer = 0;
            this.showNextHandTut();
        }
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.hideHandTut();
    }

    public StartHandTut(): void {
        this.isPaused = false;
        this.isStarted = true;
        this.resetIdleTimer();
    }

    public StartHandTutNoDelay(): void {
        this.forceNoDelay = true;
        this.StartHandTut();
        this.showNextHandTut();
    }

    /** Stops the idle timer and hides the current hint during a phase transition. */
    public PauseHandTut(): void {
        this.isPaused = true;
        this.isPointerDown = false;
        this.isGameplayDragging = false;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    /** Marks the Item on this node (or one of its parents) as tutorial-complete. */
    public ItemDone(node: Node): void {
        const item = ComponentCache.get(node, Item) || node.getComponent(Item);
        if (!item) return;

        const index = this.items.indexOf(item);
        if (index >= 0) this.items.splice(index, 1);
        this.RegisterCorrectAction();
    }

    public RegisterCorrectAction(): void {
        this.isGameplayDragging = false;
        this.consecutiveDropFails = 0;
        this.forceNoDelay = false;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    public RegisterBreakHeartDropFail(): void {
        this.isGameplayDragging = false;
        this.consecutiveDropFails++;
        if (this.consecutiveDropFails >= this.breakHeartNoDelayThreshold) {
            this.forceNoDelay = true;
            this.resetIdleTimer();
        }
    }

    /** Adds an item to the tutorial queue at runtime and requests a fast hint. */
    public RegisterTutorialItem(item: Item): void {
        if (!item || !item.isValid) return;

        if (!this.items.includes(item)) {
            this.items.push(item);
        }
        this.bindConfiguredItems();
        this.forceNoDelay = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    /** Called by InWaterItem immediately after it arrives in the sink. */
    public RegisterItemInWater(item: InWaterItem): void {
        if (!item || this.itemsInWater.includes(item)) return;

        this.itemsInWater.push(item);
        this.forceNoDelay = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    public UnregisterItemInWater(item: InWaterItem): void {
        const index = this.itemsInWater.indexOf(item);
        if (index >= 0) this.itemsInWater.splice(index, 1);
    }

    /** SinkBlock calls this after it has moved to its new position. */
    public SinkBlockMoveDone(sinkBlock: SinkBlock): void {
        if (this.sinkBlock && sinkBlock !== this.sinkBlock) return;
        if (!this.isWaitingInitialSinkWaterTutorial && !this.hasInWaterItemNeedingHandTut()) return;

        this.forceNoDelay = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    /** SinkButton calls this after the configured faucet has been turned on. */
    public WaterToggleDone(sinkButton: SinkButton): void {
        if (this.sinkButton && sinkButton !== this.sinkButton) return;

        this.isWaitingInitialSinkWaterTutorial = false;
        this.RegisterCorrectAction();
    }

    /**
     * Shows drag hand tutorial for PlasticPeeler (dragging down to peel plastic wrap).
     * When called manually (e.g. from event/code), it sets the active peeler and waits for idleDelay unless noDelay is true.
     */
    public ShowPlasticPeelerHandTut(peeler?: PlasticPeeler | null, noDelay: boolean = false): void {
        const targetPeeler = peeler || this.plasticPeeler;
        if (!targetPeeler || !targetPeeler.node.activeInHierarchy || targetPeeler.GetProgress() >= 1) return;

        this.plasticPeeler = targetPeeler;
        this.bindPlasticPeeler(targetPeeler);

        if (!noDelay) {
            this.hideHandTut();
            this.resetIdleTimer();
            return;
        }

        const baseNode = targetPeeler.maskTarget || targetPeeler.node;
        const basePos = baseNode.worldPosition.clone();

        const startPos = new Vec3(basePos.x, basePos.y + this.plasticPeelStartY, basePos.z);
        const endPos = new Vec3(basePos.x, basePos.y + this.plasticPeelEndY, basePos.z);

        this.playMoveHint(startPos, endPos);
        this.currentItemHandTut = null;
        this.TypeHind = TypeHind.Drag;
    }

    /**
     * Shows circular rotation/stirring hand tutorial for LastBowl (rotating powder mix).
     * When called manually (e.g. from LastBowl.HandlePowderComplete()), it sets the active bowl and waits for idleDelay unless noDelay is true.
     */
    public ShowLastBowlRotateHandTut(lastBowlTarget?: LastBowl | null, noDelay: boolean = false): void {
        const targetLastBowl = lastBowlTarget || this.lastBowl;
        if (!targetLastBowl || !targetLastBowl.node.activeInHierarchy) return;

        this.lastBowl = targetLastBowl;
        this.bindLastBowl(targetLastBowl);

        if (!noDelay) {
            this.hideHandTut();
            this.resetIdleTimer();
            return;
        }

        const rotateNode = targetLastBowl.powderCompleteRotateNode || targetLastBowl.node;
        const centerPos = rotateNode.worldPosition.clone();
        const radius = this.lastBowlRotateRadius || 80;

        this.playCircularRotationHint(centerPos, radius);
        this.currentItemHandTut = targetLastBowl;
        this.TypeHind = TypeHind.Stir;
    }

    /** Alias for ShowLastBowlRotateHandTut. */
    public ShowLastBowlHandTut(lastBowlTarget?: LastBowl | null, noDelay: boolean = false): void {
        this.ShowLastBowlRotateHandTut(lastBowlTarget, noDelay);
    }

    private onTouchStart(): void {
        if (this.isPaused) return;
        this.isPointerDown = true;
        if (!this.isStarted) this.StartHandTut();
        this.hideHandTut();
        this.resetIdleTimer();
    }

    private onTouchEnd(): void {
        this.isPointerDown = false;
        this.isGameplayDragging = false;
        this.resetIdleTimer();
    }

    private bindConfiguredItems(): void {
        for (const item of this.items) {
            if (!item || this.boundItems.has(item)) continue;
            this.boundItems.add(item);
            item.itemClickable?.onClick.addListener(() => this.RegisterCorrectAction());
            item.itemDraggable?.onBeginDrag.addListener(() => this.OnGameplayDragBegin());
            item.itemDraggable?.onDropSuccess.addListener(() => this.RegisterCorrectAction());
            item.itemDraggable?.onDropFail.addListener(() => this.RegisterBreakHeartDropFail());
            item.itemStirring?.onStirComplete.addListener(() => this.RegisterCorrectAction());
        }
        if (this.plasticPeeler) this.bindPlasticPeeler(this.plasticPeeler);
        if (this.lastBowl) this.bindLastBowl(this.lastBowl);
    }

    private bindPlasticPeeler(peeler: PlasticPeeler): void {
        if (!peeler || this.boundPlasticPeelers.has(peeler)) return;
        this.boundPlasticPeelers.add(peeler);
        peeler.onPeelStart.addListener(() => this.OnGameplayDragBegin());
        peeler.onPeelDragEnd.addListener(() => this.OnGameplayDragEnd());
        peeler.onPeelComplete.addListener(() => this.RegisterCorrectAction());
    }

    private bindLastBowl(lastBowl: LastBowl): void {
        if (!lastBowl || this.boundLastBowls.has(lastBowl)) return;
        this.boundLastBowls.add(lastBowl);

        const rotateNode = lastBowl.powderCompleteRotateNode;
        if (rotateNode && rotateNode.isValid) {
            rotateNode.on(Node.EventType.TOUCH_START, () => this.OnGameplayDragBegin(), this);
        }
        lastBowl.onPowderRotationComplete.addListener(() => this.RegisterCorrectAction());
    }

    public OnGameplayDragBegin(): void {
        this.isGameplayDragging = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    public OnGameplayDragEnd(): void {
        this.isPointerDown = false;
        this.isGameplayDragging = false;
        this.resetIdleTimer();
    }

    private isPlasticPeelerReady(peeler: PlasticPeeler | null): boolean {
        const targetPeeler = peeler || this.plasticPeeler;
        return !!targetPeeler && targetPeeler.node.activeInHierarchy && targetPeeler.enabled && targetPeeler.GetProgress() < 1;
    }

    private showNextHandTut(): void {
        if (!this.canShowMore()) {
            this.currentItemHandTut = null;
            return;
        }
        this.bindConfiguredItems();

        if (this.isWaitingInitialSinkWaterTutorial) {
            if (this.showSinkWaterHandTut(false)) return;
            this.isWaitingInitialSinkWaterTutorial = false;
        }

        // Priority 1: If PlasticPeeler is active on cutting board and not yet peeled, guide peeling plastic wrap
        if (this.isPlasticPeelerReady(this.plasticPeeler)) {
            this.ShowPlasticPeelerHandTut(this.plasticPeeler, true);
            return;
        }

        const item = this.getFirstTutorialReadyItem();
        if (!item) {
            if (this.lastBowl && this.lastBowl.node.activeInHierarchy && this.lastBowl.foodCountIn >= 4 && !this.lastBowl.isDone) {
                this.ShowLastBowlRotateHandTut(this.lastBowl, true);
                return;
            }

            if (this.showSinkWaterHandTut(true)) return;
            this.currentItemHandTut = null;
            return;
        }

        const dragRaycastTarget = item.getComponent(ItemDragRaycastTarget);
        const profileTarget = item.interactionProfile?.TutorialTarget;
        const raycastDefaultTarget = item.itemMoveToTarget?.defaultTarget;

        if (item.interactionProfile?.IsExplicitDragMode && this.isDraggableReady(item) && profileTarget?.isValid) {
            this.playMoveHint(item.node, profileTarget);
            this.currentItemHandTut = item;
            this.TypeHind = TypeHind.Drag;
        } else if (dragRaycastTarget && this.isDraggableReady(item) && raycastDefaultTarget?.isValid) {
            // This interaction changes its accepted ItemType dynamically while
            // dragging, so the hint must always use its configured default target.
            this.playMoveHint(item.node, raycastDefaultTarget);
            this.currentItemHandTut = item;
            this.TypeHind = TypeHind.Drag;
        } else if (this.isClickableReady(item)) {
            this.playClickHint(item.node);
            this.currentItemHandTut = item;
            this.TypeHind = TypeHind.Click;
        } else if (this.isDraggableReady(item) && this.hasValidDragTarget(item)) {
            this.playMoveHint(item.node, item.itemMoveToTarget!.defaultTarget);
            this.currentItemHandTut = item;
            this.TypeHind = TypeHind.Drag;
        } else if (this.isStirringReady(item)) {
            this.playStirringHint(item.itemStirring!);
            this.currentItemHandTut = item;
            this.TypeHind = TypeHind.Stir;
        }
    }

    private getFirstTutorialReadyItem(): Item | null {
        // Current processing items always have priority, while retaining the
        // Inspector list order and skipping invalid entries.
        for (const item of this.items) {
            if (!item?.onProcess || !this.canShowTutorialForItem(item)) continue;
            return item;
        }

        // If nothing is currently processing, fall back to the ordered list.
        for (const item of this.items) {
            if (!this.canShowTutorialForItem(item)) continue;
            return item;
        }

        return null;
    }

    /** Sink setup always has priority over items currently inside the water. */
    private showSinkWaterHandTut(requireInWaterItem: boolean): boolean {
        if (requireInWaterItem && !this.hasInWaterItemNeedingHandTut()) return false;

        if (this.sinkBlock && this.sinkBlock.node.activeInHierarchy && !this.sinkBlock.IsInside) {
            const target = this.sinkBlock.insideDefaultTarget;
            if (target?.isValid && this.sinkBlock.itemDraggable?.CanDrag()) {
                this.playMoveHint(this.sinkBlock.node, target);
                this.currentItemHandTut = this.sinkBlock;
                this.TypeHind = TypeHind.Drag;
                return true;
            }
        }

        if (this.shouldShowWaterToggleHandTut()) {
            this.playClickHint(this.sinkButton!.node);
            this.currentItemHandTut = null;
            this.TypeHind = TypeHind.Click;
            return true;
        }

        return false;
    }

    private hasInWaterItemNeedingHandTut(): boolean {
        for (let i = this.itemsInWater.length - 1; i >= 0; i--) {
            const item = this.itemsInWater[i];
            if (!item || !item.isValid || item.isDone || !item.isInWater || item.isOnPlate || !item.node.activeInHierarchy) {
                this.itemsInWater.splice(i, 1);
                continue;
            }
            return true;
        }
        return false;
    }

    private shouldShowWaterToggleHandTut(): boolean {
        const button = this.sinkButton;
        if (!button || !button.node.activeInHierarchy || !button.enabled) return false;
        const sink = button.sink || this.sinkBlock?.sink;
        return !sink || !sink.isWaterDrop;
    }

    private canShowTutorialForItem(item: Item): boolean {
        if (!item || item.isDone || !item.node.activeInHierarchy) return false;

        const hasDragRaycastTarget = !!item.getComponent(ItemDragRaycastTarget);

        // Draggable items with no target type are normally not tutorial
        // candidates. ItemDragRaycastTarget is the exception: it chooses the
        // accepted type during the drag, but still needs a default-target hint.
        const hasExplicitDragTarget = !!item.interactionProfile?.IsExplicitDragMode
            && !!item.interactionProfile.TutorialTarget?.isValid;
        if (item.itemDraggable?.enabled
            && item.itemDraggable.targetItemType === ItemType.None
            && !hasDragRaycastTarget
            && !hasExplicitDragTarget) {
            return false;
        }

        return this.isClickableReady(item)
            || (hasDragRaycastTarget && this.isDraggableReady(item) && !!item.itemMoveToTarget?.defaultTarget?.isValid)
            || (this.isDraggableReady(item) && (hasExplicitDragTarget || this.hasValidDragTarget(item)))
            || this.isStirringReady(item);
    }

    private isClickableReady(item: Item): boolean {
        return !!item.itemClickable?.enabled && item.itemClickable.canClick;
    }

    private isDraggableReady(item: Item): boolean {
        return !!item.itemDraggable?.enabled && item.itemDraggable.CanDrag();
    }

    /** Validates the configured drag target, including optional type matching. */
    private hasValidDragTarget(item: Item): boolean {
        if (item.interactionProfile?.IsExplicitDragMode) {
            return !!item.interactionProfile.TutorialTarget?.isValid;
        }
        const target = item.itemMoveToTarget?.defaultTarget;
        const draggable = item.itemDraggable;
        if (!target || !target.isValid || !draggable) return false;
        if (!item.requireMatchingTargetTypeForHandTut) return true;

        const targetItem = target.getComponent(Item);
        return !!targetItem && targetItem.itemType === draggable.targetItemType;
    }

    private isStirringReady(item: Item): boolean {
        return !!item.itemStirring?.enabled && !item.itemStirring.IsDone;
    }

    private playClickHint(target: Node): void {
        const token = this.prepareHand(target.worldPosition);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            tween(this.handNode)
                .to(this.clickScaleDuration, { scale: this.handDefaultScale.clone().multiplyScalar(this.clickScaleMultiplier) }, { easing: 'sineOut' })
                .to(this.clickScaleDuration, { scale: this.handDefaultScale }, { easing: 'sineIn' })
                .delay(this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private playMoveHint(start: Node | Vec3, end: Node | Vec3): void {
        const startPosition = start instanceof Node ? start.worldPosition.clone() : start.clone();
        const endPosition = end instanceof Node ? end.worldPosition.clone() : end.clone();
        const token = this.prepareHand(startPosition);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            this.handNode.setWorldPosition(startPosition);
            this.setHandAlpha(this.handDefaultAlpha);
            tween(this.handNode)
                .to(this.moveDuration, { worldPosition: endPosition }, { easing: 'sineInOut' })
                .call(() => this.fadeHandAfterDrag())
                .delay(this.dragFadeDuration + this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private playStirringHint(stirring: ItemStirring): void {
        const center = (stirring.centerPoint ?? stirring.node).worldPosition.clone();
        const radius = Math.max(1, stirring.stirRadius);
        const start = new Vec3(center.x + radius, center.y, center.z);
        const token = this.prepareHand(start);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            const state = { angle: 0 };
            this.activeAuxTween = tween(state)
                .to(this.moveDuration, { angle: Math.PI * 2 }, {
                    onUpdate: value => {
                        const angle = (value as { angle: number }).angle;
                        this.handNode.setWorldPosition(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z);
                    },
                })
                .delay(this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private playCircularRotationHint(center: Vec3, radius: number): void {
        const start = new Vec3(center.x + radius, center.y, center.z);
        const token = this.prepareHand(start);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            const state = { angle: 0 };
            this.activeAuxTween = tween(state)
                .to(this.moveDuration, { angle: Math.PI * 2 }, {
                    onUpdate: value => {
                        const angle = (value as { angle: number }).angle;
                        this.handNode.setWorldPosition(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z);
                    },
                })
                .delay(this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private prepareHand(position: Vec3): number {
        this.hideHandTut();
        this.currentHintToken++;
        this.handNode.setWorldPosition(position);
        this.handNode.setScale(this.handDefaultScale);
        this.setHandAlpha(this.handDefaultAlpha);
        this.handNode.active = true;
        this.shownCount++;
        this.hasShownFirstHint = true;
        this.forceNoDelay = false;
        return this.currentHintToken;
    }

    private hideHandTut(): void {
        this.currentHintToken++;
        this.currentItemHandTut = null;
        this.TypeHind = TypeHind.None;
        this.activeAuxTween?.stop();
        this.activeAuxTween = null;
        this.activeFadeTween?.stop();
        this.activeFadeTween = null;
        if (!this.handNode) return;
        Tween.stopAllByTarget(this.handNode);
        this.handNode.setScale(this.handDefaultScale);
        this.setHandAlpha(this.handDefaultAlpha);
        this.handNode.active = false;
    }

    private isHintCurrent(token: number): boolean {
        return !!this.handNode?.isValid && this.handNode.activeInHierarchy && token === this.currentHintToken;
    }

    private setHandAlpha(alpha: number): void {
        if (this.handOpacity) this.handOpacity.opacity = alpha;
    }

    /** Starts only after the hand reaches the drag destination. */
    private fadeHandAfterDrag(): void {
        if (!this.handOpacity) {
            this.setHandAlpha(0);
            return;
        }

        this.activeFadeTween?.stop();
        this.activeFadeTween = tween(this.handOpacity)
            .to(this.dragFadeDuration, { opacity: 0 }, { easing: 'sineOut' })
            .call(() => this.activeFadeTween = null)
            .start();
    }

    private getCurrentDelay(): number {
        if (this.forceNoDelay || this.shownCount < this.noDelayItemCount) return this.shortIdleDelay;
        return this.hasShownFirstHint ? this.idleDelay : this.firstHandTutDelay;
    }

    private canShowMore(): boolean {
        return this.maxHandTutShowCount <= 0 || this.shownCount < this.maxHandTutShowCount;
    }

    private resetIdleTimer(): void {
        this.idleTimer = 0;
    }

    private removeCompletedItems(): void {
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (!this.items[i] || this.items[i].isDone) this.items.splice(i, 1);
        }
    }
}
