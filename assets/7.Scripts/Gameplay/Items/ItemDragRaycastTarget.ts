import { _decorator, Enum, Node, UITransform, Vec3 } from 'cc';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Ply_EventHandlerComponent } from '../../Core/Base/Ply_EventHandlerComponent';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Item } from './Item';
import { ItemDraggable } from './ItemDraggable';
import { ItemType } from './ItemType';

const { ccclass, property, requireComponent } = _decorator;

/**
 * While dragging, finds the Item under the configured point and can switch the
 * draggable item's accepted type and move target to that Item.
 *
 * Cocos UI uses UITransform hit regions instead of Unity Physics raycasts.
 */
@ccclass('ItemDragRaycastTarget')
@requireComponent(ItemDraggable)
export class ItemDragRaycastTarget extends Ply_EventHandlerComponent {
    @property({ type: Enum(ItemType), tooltip: 'Only Items with this type can be found.' })
    public targetToFind: ItemType = ItemType.None;

    @property({ type: Enum(ItemType), tooltip: 'Accepted drop type while a target is found.' })
    public targetItemTypeWhenHit: ItemType = ItemType.None;

    @property({ type: Enum(ItemType), tooltip: 'Accepted drop type restored after a failed drop.' })
    public targetItemTypeOnDropFail: ItemType = ItemType.None;

    @property({ type: Node, tooltip: 'Point tested against targets. Uses this item when empty.' })
    public raycastPoint: Node | null = null;

    @property({ tooltip: 'Set ItemMoveToTarget.defaultTarget to the target currently found.' })
    public updateMoveDefaultTarget: boolean = false;

    @property({ tooltip: 'Only invoke target-found events after the target changes.' })
    public invokeOnlyWhenTargetChanged: boolean = true;

    @property({ tooltip: 'Allow this component to update the draggable target while dragging.' })
    public targetChangeEnabled: boolean = false;

    @property({ tooltip: 'Restore the configured drop type and default target after a failed drop.' })
    public restoreTargetOnDropFail: boolean = true;

    @property({ tooltip: 'Forget the current target as soon as no matching target is under the point.' })
    public resetCurrentTargetOnNoHit: boolean = false;

    @property({ type: Ply_Event, tooltip: 'Invoked when a matching Item is found.' })
    public onTargetFound: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Invoked with the matching Item as its argument.' })
    public onTargetFoundWithItem: Ply_Event = new Ply_Event();

    private isDragging = false;
    private currentTarget: Item | null = null;
    private originalDefaultTarget: Node | null = null;
    private itemDraggable: ItemDraggable | null = null;
    private ownerItem: Item | null = null;

    private readonly onBeginDrag = (): void => this.HandleBeginDrag();
    private readonly onDropFail = (): void => this.HandleDropFail();

    protected onLoad(): void {
        this.itemDraggable = this.getComponent(ItemDraggable);
        this.ownerItem = ComponentCache.get(this.node, Item) || this.getComponent(Item);
    }

    protected onEnable(): void {
        this.itemDraggable ??= this.getComponent(ItemDraggable);
        this.ownerItem ??= ComponentCache.get(this.node, Item) || this.getComponent(Item);
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onDropFail);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.isDragging = false;
        this.currentTarget = null;
    }

    protected update(): void {
        if (!this.isDragging) return;

        if (!this.itemDraggable?.IsDragging) {
            this.isDragging = false;
            this.currentTarget = null;
            return;
        }

        this.FindTargetUnderPoint();
    }

    public EnableTarget(): void {
        this.targetChangeEnabled = true;
    }

    public DisableTarget(): void {
        this.targetChangeEnabled = false;
    }

    public SetTargetEnabled(isEnabled: boolean): void {
        this.targetChangeEnabled = isEnabled;
    }

    public ChangeTargetToFind(item: Node | null): void {
        if (item) this.targetToFind = ComponentCache.get(item, Item)?.itemType || ItemType.None;
    }

    private HandleBeginDrag(): void {
        this.isDragging = true;
        this.currentTarget = null;
        this.originalDefaultTarget = this.ownerItem?.itemMoveToTarget?.defaultTarget || null;
    }

    private HandleDropFail(): void {
        if (!this.restoreTargetOnDropFail || !this.itemDraggable) return;

        this.itemDraggable.targetItemType = this.targetItemTypeOnDropFail;
        if (this.updateMoveDefaultTarget && this.ownerItem?.itemMoveToTarget) {
            this.ownerItem.itemMoveToTarget.defaultTarget = this.originalDefaultTarget!;
        }

        this.currentTarget = null;
    }

    private FindTargetUnderPoint(): void {
        const foundTarget = this.GetMatchingTarget();
        if (!foundTarget) {
            if (this.resetCurrentTargetOnNoHit) this.currentTarget = null;
            return;
        }

        if (this.invokeOnlyWhenTargetChanged && foundTarget === this.currentTarget) return;

        this.currentTarget = foundTarget;
        if (this.targetChangeEnabled && this.itemDraggable) {
            this.itemDraggable.targetItemType = this.targetItemTypeWhenHit;
            if (this.updateMoveDefaultTarget && this.ownerItem?.itemMoveToTarget) {
                this.ownerItem.itemMoveToTarget.defaultTarget = foundTarget.node;
            }
        }

        this.onTargetFound.invoke();
        this.onTargetFoundWithItem.invoke(foundTarget);
    }

    private GetMatchingTarget(): Item | null {
        if (this.targetToFind === ItemType.None || !this.node.scene) return null;

        const testPoint = (this.raycastPoint?.isValid ? this.raycastPoint : this.node).worldPosition;
        const items = this.node.scene.getComponentsInChildren(Item);
        let bestTarget: Item | null = null;
        let bestZ = Number.POSITIVE_INFINITY;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const item of items) {
            if (!item || item === this.ownerItem || !item.node.activeInHierarchy || item.itemType !== this.targetToFind) continue;

            const uiTransform = item.getComponent(UITransform);
            if (!uiTransform || !this.IsWorldPointInsideUITransform(testPoint, uiTransform)) continue;

            const targetPosition = item.node.worldPosition;
            const distance = Vec3.squaredDistance(testPoint, targetPosition);
            if (targetPosition.z < bestZ || (targetPosition.z === bestZ && distance < bestDistance)) {
                bestTarget = item;
                bestZ = targetPosition.z;
                bestDistance = distance;
            }
        }

        return bestTarget;
    }

    private IsWorldPointInsideUITransform(worldPoint: Vec3, uiTransform: UITransform): boolean {
        const point = uiTransform.convertToNodeSpaceAR(worldPoint);
        const left = -uiTransform.anchorX * uiTransform.width;
        const right = left + uiTransform.width;
        const bottom = -uiTransform.anchorY * uiTransform.height;
        const top = bottom + uiTransform.height;
        return point.x >= left && point.x <= right && point.y >= bottom && point.y <= top;
    }
}
