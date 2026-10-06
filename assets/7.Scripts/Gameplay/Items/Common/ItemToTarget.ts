import { _decorator, Animation, Node } from 'cc';
import { HandTutManager } from '../../../Managers/HandTutManager';
import { Item } from './Item';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { ItemType } from './ItemType';

const { ccclass, property } = _decorator;

@ccclass('ItemToTargetAnimation')
export class ItemToTargetAnimation {
    @property({ tooltip: 'Parameter/trigger name for an Animation Controller. Leave empty to skip.' })
    public controllerTrigger: string = '';

    @property({ tooltip: 'Clip index on a regular Animation component. Use -1 to skip.' })
    public animationClipIndex: number = -1;
}

/**
 * Moves this item to a fixed target after a successful drop, then plays the
 * configured arrival animations on this item and/or its target item.
 */
@ccclass('ItemToTarget')
export class ItemToTarget extends Item {
    @property(Node)
    public targetPosition: Node = null!;

    @property(Item)
    public targetItem: Item | null = null;

    @property({ type: ItemToTargetAnimation, tooltip: 'Animation to play on this item after it arrives.' })
    public itemArrivalAnimation: ItemToTargetAnimation = new ItemToTargetAnimation();

    @property({ type: ItemToTargetAnimation, tooltip: 'Animation to play on Target Item after this item arrives.' })
    public targetItemArrivalAnimation: ItemToTargetAnimation = new ItemToTargetAnimation();

    @property({ tooltip: 'Immediately hide this item after a successful drop instead of moving it.' })
    public disableItemWhenDrop: boolean = false;

    @property({ tooltip: 'Hide this item (node.active = false) once it arrives, after the arrival animations start.' })
    public hideItemWhenArrive: boolean = false;

    @property({ tooltip: 'Mark this Item complete and remove it from the hand tutorial after arrival.' })
    public itemDoneWhenArrive: boolean = false;

    @property({ tooltip: 'After this item\'s regular Animation clip finishes, call DoneAnimation() (mark done and return without heart).' })
    public doneAnimationWhenItemAnimationFinished: boolean = true;

    @property({ tooltip: 'Bật: giữ Target Item Type của ItemDraggable ngay từ đầu. Tắt: lúc start bỏ target (drop không trúng, HandTut bỏ qua) cho tới khi gọi SetTarget().' })
    public setTargetOnStart: boolean = true;

    private waitingForMoveComplete = false;
    private savedTargetItemType: ItemType = ItemType.None;
    private animationWaitingForDone: Animation | null = null;

    private readonly onDropSuccess = () => this.MoveToCurrentTarget();
    private readonly onMoveComplete = () => {
        if (this.waitingForMoveComplete) this.HandleMoveComplete();
    };

    protected onLoad(): void {
        super.onLoad();

        if (!this.itemDraggable) return;

        if (this.setTargetOnStart) {
            if (this.targetItem) this.SetTarget();
        } else {
            this.savedTargetItemType = this.itemDraggable.targetItemType;
            this.itemDraggable.targetItemType = ItemType.None;
        }
    }

    /**
     * Bindable from a Ply_Event: enables dropping on the target item.
     * With Target Item assigned, points ItemMoveToTarget.defaultTarget at it and
     * uses its type; otherwise restores the type saved at start.
     */
    public SetTarget(): void {
        if (!this.itemDraggable) return;

        if (this.targetItem) {
            if (this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = this.targetItem.node;
            this.itemDraggable.targetItemType = this.targetItem.itemType;
            return;
        }

        if (this.savedTargetItemType === ItemType.None) {
            console.warn(`[ItemToTarget] No target type to set on "${this.node.name}". Assign Target Item or ItemDraggable.targetItemType.`);
            return;
        }
        this.itemDraggable.targetItemType = this.savedTargetItemType;
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.subscribeMovementEvents();
    }

    protected onDisable(): void {
        // ItemMoveToTarget reparents before emitting EVENT_COMPLETE; if the
        // target is inactive (e.g. a bowl layer its arrival animation turns
        // on) this node is deactivated mid-move. Keep listening so the
        // arrival animations still play.
        if (this.waitingForMoveComplete) {
            this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
            return;
        }
        this.unsubscribeMovementEvents();
        this.stopWaitingForItemAnimation();
    }

    public MoveToCurrentTarget(): void {
        if (!this.enabled || this.waitingForMoveComplete) return;

        if (this.disableItemWhenDrop) {
            this.HandleMoveComplete();
            this.node.active = false;
            return;
        }

        if (!this.itemMoveToTarget || !this.targetPosition) {
            console.warn(`[ItemToTarget] Assign ItemMoveToTarget and Target Position on "${this.node.name}".`);
            return;
        }

        this.waitingForMoveComplete = true;
        this.itemMoveToTarget.ExecuteMove2D(this.targetPosition);
    }

    public HandleMoveComplete(): void {
        if (this.waitingForMoveComplete) this.waitingForMoveComplete = false;

        this.itemDraggable?.DisableComponent();
        const hasItemAnimation = this.playItemArrivalAnimation();
        this.playAnimation(this.targetItem, this.targetItemArrivalAnimation);
        this.itemDraggable.targetItemType = ItemType.None;
        if (this.itemDoneWhenArrive) {
            this.ItemDone();
            HandTutManager.Ins?.ItemDone(this.node);
        }
        if (this.hideItemWhenArrive) {
            this.node.active = false;
            return;
        }

        // No arrival animation to wait for: finish right away (return to start).
        if (!hasItemAnimation && this.doneAnimationWhenItemAnimationFinished && !this.disableItemWhenDrop) {
            this.DoneAnimation();
        }
    }

    private subscribeMovementEvents(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    private unsubscribeMovementEvents(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    private playAnimation(item: Item | null, animation: ItemToTargetAnimation): void {
        if (!item || !animation) return;

        if (animation.controllerTrigger.trim()) {
            item.PlayTrigger(animation.controllerTrigger.trim());
            return;
        }

        if (animation.animationClipIndex >= 0) {
            item.PlayClipWithIndex(animation.animationClipIndex);
        }
    }

    /** Returns false when no item arrival animation is configured. */
    private playItemArrivalAnimation(): boolean {
        const config = this.itemArrivalAnimation;
        if (!config) return false;

        if (config.controllerTrigger.trim()) {
            this.PlayTrigger(config.controllerTrigger.trim());
            if (this.doneAnimationWhenItemAnimationFinished) {
                console.warn(`[ItemToTarget] AnimationController cannot emit a generic finish event. Add an Animation Graph event that calls DoneAnimation() on "${this.node.name}".`);
            }
            return true;
        }

        if (config.animationClipIndex < 0) return false;

        const animationComponent = this.animationComponent;
        const clip = animationComponent?.clips[config.animationClipIndex];
        if (!animationComponent || !clip) {
            this.PlayClipWithIndex(config.animationClipIndex);
            return true;
        }

        if (this.doneAnimationWhenItemAnimationFinished) {
            this.stopWaitingForItemAnimation();
            this.animationWaitingForDone = animationComponent;
            animationComponent.once(Animation.EventType.FINISHED, this.onItemAnimationFinished, this);
        }

        animationComponent.play(clip.name);
        return true;
    }

    private readonly onItemAnimationFinished = (): void => {
        this.animationWaitingForDone = null;
        if (this.isValid && this.node.activeInHierarchy) {
            this.DoneAnimation();
        }
    };

    private stopWaitingForItemAnimation(): void {
        this.animationWaitingForDone?.off(Animation.EventType.FINISHED, this.onItemAnimationFinished, this);
        this.animationWaitingForDone = null;
    }
}
