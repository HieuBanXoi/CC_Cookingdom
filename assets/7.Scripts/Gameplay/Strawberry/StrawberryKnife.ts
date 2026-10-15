import { _decorator, Node, tween } from 'cc';
import { Item } from '../Items/Item';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Phase 2 knife. Locked until a strawberry is on the board; dropped on the
 * sample it hides itself and lets the sample's cut animation (which has its
 * own knife) play, then reappears in its slot.
 */
@ccclass('StrawberryKnife')
export class StrawberryKnife extends Item {
    @property(Node)
    public idleVisual: Node | null = null;

    @property(Node)
    public dragVisual: Node | null = null;

    private readonly onBeginDrag = (): void => this.ShowDragVisual(true);
    private readonly onReturnComplete = (): void => this.ShowDragVisual(false);
    private readonly onDropSuccess = (): void => this.OnDropSuccess();
    private onCut: (() => void) | null = null;

    protected onLoad(): void {
        super.onLoad();
        this.itemDraggable?.DisableComponent();
        this.ShowDragVisual(false);
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onReturnComplete);
        this.itemDraggable?.onReturnToStartComplete.addListener(this.onReturnComplete);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onReturnComplete);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    /** Lets the knife be dropped on the strawberry now on the board; onCut runs on drop. */
    public Ready(target: Node, onCut: () => void): void {
        this.onCut = onCut;
        this.itemDraggable?.SetTargetItemType(target);
        this.EnableItemDraggable();
    }

    /** Shows the knife back in its slot after the cut animation. */
    public BackToSlot(): void {
        this.ShowDragVisual(false);
        this.node.active = true;
        Ply_SoundManager.Ins?.PlayFx(FxType.KnifePlace);
        const base = this.node.scale.clone();
        this.node.setScale(base.x * 0.7, base.y * 0.7, base.z);
        tween(this.node).to(0.2, { scale: base }, { easing: 'backOut' }).start();
    }

    private OnDropSuccess(): void {
        this.itemDraggable?.DisableComponent();
        this.itemDraggable?.TeleportToStart();
        this.node.active = false;
        const onCut = this.onCut;
        this.onCut = null;
        onCut?.();
    }

    private ShowDragVisual(dragging: boolean): void {
        if (this.idleVisual) this.idleVisual.active = !dragging;
        if (this.dragVisual) this.dragVisual.active = dragging;
    }
}
