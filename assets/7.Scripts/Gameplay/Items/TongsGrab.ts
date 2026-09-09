import { _decorator, Component, Node, UITransform, Vec3 } from 'cc';
import { ItemDraggable } from './ItemDraggable';
import { StoveCooking, StoveFoodSlot } from './StoveCooking';
import { Item } from './Item';

const { ccclass, property } = _decorator;

/** Picks cooked foods from Stove slots and places them on a plate. */
@ccclass('TongsGrab')
export class TongsGrab extends Item {
    @property({ type: Node, tooltip: 'Point used to find cooked food.' }) public tongPoint: Node | null = null;
    @property({ type: Node, tooltip: 'Food parent/position while held.' }) public foodPos: Node | null = null;

    private draggable: ItemDraggable | null = null;
    private stove: StoveCooking | null = null;
    private heldSlot: StoveFoodSlot | null = null;
    private placedDuringCurrentDrag = false;
    private readonly blockedCookingSlotsThisDrag = new Set<StoveFoodSlot>();

    protected onLoad(): void {
        this.draggable = this.getComponent(ItemDraggable);
        this.stove = this.node.scene?.getComponentInChildren(StoveCooking) ?? null;
        this.tongPoint ??= this.FindByNames(this.node, ['TongFront']);
        this.foodPos ??= this.FindByNames(this.node, ['FoodPos']);
        this.draggable?.DisableSpawnBreakHeartOnDropFail();
    }

    protected onEnable(): void {
        this.draggable ??= this.getComponent(ItemDraggable);
        this.draggable?.onBeginDrag.addListener(this.OnBeginDrag);
        this.draggable?.onDropSuccess.addListener(this.OnDropSuccess);
        this.draggable?.onDropFail.addListener(this.OnDropFail);
    }

    protected onDisable(): void {
        this.draggable?.onBeginDrag.removeListener(this.OnBeginDrag);
        this.draggable?.onDropSuccess.removeListener(this.OnDropSuccess);
        this.draggable?.onDropFail.removeListener(this.OnDropFail);
        this.ReturnHeldFood();
    }

    protected update(): void {
        if (!this.draggable?.IsDragging || !this.stove || !this.foodPos) return;
        const point = (this.tongPoint ?? this.node).worldPosition;

        // Placing is triggered as soon as the tong point sweeps across this
        // slot's dedicated plate target; releasing the tong is not required.
        if (this.heldSlot) {
            const target = this.heldSlot.plateTarget;
            if (target && target.activeInHierarchy && this.IsPointInside(point, target)) {
                const slot = this.heldSlot;
                this.draggable.ConsumeCurrentDropFail();
                this.stove.PlaceOnPlate(slot);
                this.heldSlot = null;
                this.placedDuringCurrentDrag = true;
            }
            return;
        }

        const slot = this.stove.TryGrabAtPoint(point);
        if (slot) {
            const food = this.stove.GrabWithTongs(slot, this.foodPos);
            if (food) this.heldSlot = slot;
            return;
        }

        const cookingSlot = this.stove.GetCookingSlotAtPoint(point);
        if (cookingSlot && !this.blockedCookingSlotsThisDrag.has(cookingSlot)) {
            this.blockedCookingSlotsThisDrag.add(cookingSlot);
            this.stove.ShowCookingFoodBlockedFeedback(point);
        }
    }

    /** Current next Tong interaction point, used by HandTutManager. */
    public GetHandTutTarget(): Node | null {
        return this.GetHandTutRoute()[0] ?? null;
    }

    /** Tong → cooked FoodOnStove → that food's dedicated plate target. */
    public GetHandTutRoute(): Node[] {
        if (this.heldSlot?.plateTarget?.activeInHierarchy) return [this.heldSlot.plateTarget];
        if (!this.stove) return [];
        const slot = this.stove.slots.find(candidate => candidate.ready && !candidate.heldByTongs);
        if (!slot?.done?.activeInHierarchy) return [];
        return slot.plateTarget?.activeInHierarchy ? [slot.done, slot.plateTarget] : [slot.done];
    }

    private readonly OnDropFail = (): void => {
        // Food may already have flown to its plate target while the Tong is
        // still being dragged. Do not consume this drop: ItemDraggable must
        // return Tong to start on every pointer-up.
        if (this.placedDuringCurrentDrag) {
            this.placedDuringCurrentDrag = false;
            return;
        }
        if (!this.heldSlot || !this.stove) return;
        const point = (this.tongPoint ?? this.node).worldPosition;
        const slot = this.heldSlot;
        this.heldSlot = null;

        const target = slot.plateTarget;
        if (target && target.activeInHierarchy && this.IsPointInside(point, target)) {
            this.draggable?.ConsumeCurrentDropFail();
            this.stove.PlaceOnPlate(slot);
            this.draggable?.ReturnToStart(false);
            return;
        }
        // The Tong is allowed to be released empty without feedback, but
        // dropping a held cooked piece away from its own plate is a mistake.
        this.SpawnBreakHeart();
        this.stove.ReturnFromTongs(slot);
    };

    private readonly OnBeginDrag = (): void => {
        this.placedDuringCurrentDrag = false;
        this.blockedCookingSlotsThisDrag.clear();
    };

    private readonly OnDropSuccess = (): void => {
        this.placedDuringCurrentDrag = false;
        if (this.heldSlot && this.stove) {
            this.stove.ReturnFromTongs(this.heldSlot);
            this.heldSlot = null;
        }
        // A normal drop onto another item must also restore Tong.
        this.draggable?.ReturnToStart(false);
    };

    private ReturnHeldFood(): void {
        if (!this.heldSlot || !this.stove) return;
        this.stove.ReturnFromTongs(this.heldSlot);
        this.heldSlot = null;
    }

    private IsPointInside(worldPoint: Vec3, node: Node): boolean {
        const transform = node.getComponent(UITransform);
        if (!transform) return false;
        const local = transform.convertToNodeSpaceAR(worldPoint);
        const left = -transform.anchorX * transform.width;
        const bottom = -transform.anchorY * transform.height;
        return local.x >= left && local.x <= left + transform.width
            && local.y >= bottom && local.y <= bottom + transform.height;
    }

    private FindByNames(root: Node | null, names: string[]): Node | null {
        if (!root) return null;
        if (names.some(name => name.toLowerCase() === root.name.toLowerCase())) return root;
        for (const child of root.children) {
            const found = this.FindByNames(child, names);
            if (found) return found;
        }
        return null;
    }
}
