import { _decorator, Node } from 'cc';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Item } from './Item';
import { ItemType } from './ItemType';

const { ccclass, property } = _decorator;

/**
 * Draggable plate. Dropped on an Item of ItemDraggable.targetItemType, it plays
 * plateTrigger on that item's animation and turns the item's type to None so
 * nothing can be dropped on it any more. The plate itself is then locked and,
 * by default, hidden (the target's animation is expected to show the plate).
 *
 * Node setup: Plate2 + ItemDraggable (targetItemType = the food's type) + ItemMoveToTarget.
 */
@ccclass('Plate2')
export class Plate2 extends Item {
    @property({ tooltip: 'Trigger played on the target Item when the plate is dropped on it.' })
    public plateTrigger = 'Plate';

    @property({ tooltip: 'Snap the plate back to its slot and hide it after a successful drop.' })
    public hideOnDrop = true;

    @property({ type: Ply_Event, tooltip: 'Triggered after the plate was dropped on its target.' })
    public onPlaced: Ply_Event = new Ply_Event();

    private readonly onDropSuccess = (target?: Node): void => this.OnDropSuccess(target);

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    /** Points this plate at target (drop type + defaultTarget), so the hand tutorial guides it there. */
    public SetTarget(target: Node): void {
        this.cacheComponents();
        if (!this.itemDraggable || !this.itemMoveToTarget) {
            console.warn(`[Plate2] ItemDraggable / ItemMoveToTarget missing on "${this.node.name}".`);
            return;
        }
        this.itemDraggable.SetTargetItemType(target);
    }

    /** Removes the hand-tutorial destination of this plate. */
    public ClearTarget(): void {
        this.cacheComponents();
        if (this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = null!;
    }

    private OnDropSuccess(target?: Node): void {
        const targetItem = target?.isValid ? ComponentCache.get(target, Item) ?? target.getComponent(Item) : null;
        if (!targetItem) {
            console.warn(`[Plate2] Drop target of "${this.node.name}" has no Item component.`);
            this.itemDraggable?.ReturnToStartWithoutHeart();
            return;
        }

        targetItem.PlayTrigger(this.plateTrigger);
        targetItem.itemType = ItemType.None;

        this.DisableItemDraggable();
        this.ItemDone();
        if (this.hideOnDrop) {
            // Leave InputManager.draggingNode before hiding, like Knife.ReturnToSlotAndHide().
            this.itemDraggable?.TeleportToStart();
            this.node.active = false;
        } else {
            this.itemDraggable?.RestoreOriginalParent();
        }
        this.onPlaced.invoke(targetItem.node);
    }
}
