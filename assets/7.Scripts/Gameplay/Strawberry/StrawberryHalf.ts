import { _decorator, Node } from 'cc';
import { Item } from '../Items/Item';
import { StrawberryCutBowl } from './StrawberryCutBowl';

const { ccclass } = _decorator;

/**
 * Phase 2 strawberry half (child of the sample, shown by the cut animation).
 * Dropped on the bowl it leaves a copy stacked in the bowl and hides itself
 * so the sample can be reused for the next strawberry.
 */
@ccclass('StrawberryHalf')
export class StrawberryHalf extends Item {
    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);
    private onPlaced: (() => void) | null = null;

    protected onLoad(): void {
        super.onLoad();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    /** Called by the board when the cut animation finished; onPlaced runs once it is in the bowl. */
    public Ready(onPlaced: () => void): void {
        this.onPlaced = onPlaced;
        this.EnableItemDraggable();
    }

    private OnDropSuccess(target: Node): void {
        const bowl = target.getComponent(StrawberryCutBowl) ?? target.parent?.getComponent(StrawberryCutBowl);
        if (!bowl) {
            this.itemDraggable?.ReturnToStartWithoutHeart();
            return;
        }

        this.itemDraggable?.DisableComponent();
        bowl.AddHalf(this.node);
        this.itemDraggable?.TeleportToStart();
        this.node.active = false;
        const onPlaced = this.onPlaced;
        this.onPlaced = null;
        onPlaced?.();
    }
}
