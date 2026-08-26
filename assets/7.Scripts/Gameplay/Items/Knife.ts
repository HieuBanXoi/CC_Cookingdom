import { _decorator, Enum, Node, Quat, Tween, tween, Vec3 } from 'cc';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Item } from './Item';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { ItemType } from './ItemType';

const { ccclass, property } = _decorator;

export enum KnifeRotationEase {
    Linear = 0,
    QuadOut,
    BackOut,
}
Enum(KnifeRotationEase);

/** A draggable knife that changes pose while dragged and invokes KnifeIn on its destination. */
@ccclass('Knife')
export class Knife extends Item {
    @property({ type: Node, tooltip: 'Visual shown while the knife is idle.' })
    public knifeIdle: Node | null = null;

    @property({ type: Node, tooltip: 'Visual shown and rotated while the knife is dragged.' })
    public knifeOnDrag: Node | null = null;

    @property({ type: Vec3, tooltip: 'Local Euler rotation offset applied to the drag visual.' })
    public knifeOnDragRotationOffset: Vec3 = new Vec3();

    @property({ min: 0, tooltip: 'Knife drag-rotation tween duration, in seconds.' })
    public knifeOnDragRotateDuration: number = 0.15;

    @property({ type: Enum(KnifeRotationEase) })
    public knifeOnDragRotateEase: KnifeRotationEase = KnifeRotationEase.QuadOut;

    private hasCachedKnifeOnDragRotation = false;
    private knifeOnDragOriginalLocalRotation = new Quat();
    private knifeOnDragRotateTween: Tween<Node> | null = null;

    private readonly onBeginDrag = (): void => this.KnifeOnDrag();
    private readonly onDropFail = (): void => this.KnifeIdle();
    private readonly onDropSuccess = (): void => this.itemMoveToTarget?.ExecuteMove();
    private readonly onMoveComplete = (target: Node): void => this.TargetKnifeFlyEvent(target);

    protected onLoad(): void {
        super.onLoad();
        this.CacheKnifeOnDragRotation();
    }

    protected onEnable(): void {
        this.cacheComponents();

        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onDropFail);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);

        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    protected onDisable(): void {
        this.ResetKnifeOnDragRotation();

        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    public KnifeOnDrag(): void {
        this.CacheKnifeOnDragRotation();
        this.SetKnifeVisualState(false, true);

        const offsetRotation = Quat.fromEuler(
            new Quat(),
            this.knifeOnDragRotationOffset.x,
            this.knifeOnDragRotationOffset.y,
            this.knifeOnDragRotationOffset.z,
        );
        const targetRotation = Quat.multiply(new Quat(), this.knifeOnDragOriginalLocalRotation, offsetRotation);
        this.RotateKnifeOnDragTo(targetRotation);
    }

    public KnifeIdle(): void {
        this.ResetKnifeOnDragRotation();
        this.SetKnifeVisualState(true, false);
    }

    public TargetKnifeFlyEvent(targetNode?: Node): void {
        const target = targetNode || this.itemMoveToTarget?.defaultTarget;
        const targetItem = target ? ComponentCache.get(target, Item) : null;
        targetItem?.KnifeIn();
    }

    /** Configures the item that this knife may be dropped onto. */
    public SetTarget(target: Node): void {
        const targetItem = ComponentCache.get(target, Item);
        if (!targetItem || !this.itemDraggable || !this.itemMoveToTarget) {
            console.warn(`[Knife] Target or required components are missing on "${this.node.name}".`);
            return;
        }

        this.itemDraggable.targetItemType = targetItem.itemType;
        this.itemMoveToTarget.defaultTarget = target;
    }

    public override OnDragFailReturnComplete(): void {
        super.OnDragFailReturnComplete();
        this.PlayKnifeSound();
    }

    public OnKnifeDone(): void {
        if (this.itemDraggable) this.itemDraggable.targetItemType = ItemType.None;
        if (this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = null!;
    }
    public BackToSlot(): void {
        if(this.itemDraggable) this.itemDraggable.ReturnToStartWithoutHeart();
    }

    /** Override or connect a sound event here when a knife-placement sound is available. */
    public PlayKnifeSound(): void {
        // Intentionally left empty: the corresponding Unity sound call was disabled.
    }

    private CacheKnifeOnDragRotation(): void {
        if (this.hasCachedKnifeOnDragRotation || !this.knifeOnDrag?.isValid) return;

        Quat.copy(this.knifeOnDragOriginalLocalRotation, this.knifeOnDrag.rotation);
        this.hasCachedKnifeOnDragRotation = true;
    }

    private ResetKnifeOnDragRotation(): void {
        this.CacheKnifeOnDragRotation();
        if (!this.hasCachedKnifeOnDragRotation) return;

        this.RotateKnifeOnDragTo(this.knifeOnDragOriginalLocalRotation);
    }

    private RotateKnifeOnDragTo(targetRotation: Quat): void {
        if (!this.knifeOnDrag?.isValid) return;

        this.knifeOnDragRotateTween?.stop();
        this.knifeOnDragRotateTween = tween(this.knifeOnDrag)
            .to(this.knifeOnDragRotateDuration, { rotation: targetRotation }, {
                easing: this.GetRotationEasing(),
            })
            .start();
    }

    private SetKnifeVisualState(showIdle: boolean, showOnDrag: boolean): void {
        if (this.knifeIdle?.isValid) this.knifeIdle.active = showIdle;
        if (this.knifeOnDrag?.isValid) this.knifeOnDrag.active = showOnDrag;
    }

    private GetRotationEasing(): string {
        switch (this.knifeOnDragRotateEase) {
            case KnifeRotationEase.BackOut: return 'backOut';
            case KnifeRotationEase.QuadOut: return 'quadOut';
            default: return 'linear';
        }
    }
}
