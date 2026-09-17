import { _decorator, Node } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';

const { ccclass, property } = _decorator;

/**
 * A plate that holds one food. Used by CuttingItem in PlateList mode: the
 * food may land on any free plate of its list. Like CuttingBoard, an occupied
 * plate reports ItemType.None so it stops accepting drops and hand-tut hints.
 */
@ccclass('Plate')
export class Plate extends Item {

    @property({ tooltip: 'True while a food sits on (or is flying to) this plate.' })
    public isFoodOn: boolean = false;

    @property({ type: Node, tooltip: 'Where the food lands. Empty = this plate node.' })
    public foodPoint: Node | null = null;

    /** ItemType restored when the plate is freed (the one configured in the Inspector, normally Plate). */
    private plateItemType: ItemType = ItemType.Plate;

    protected onLoad(): void {
        super.onLoad();
        if (this.itemType !== ItemType.None) {
            this.plateItemType = this.itemType;
        }
        this.IsFoodOn(this.isFoodOn);
    }

    /** Landing point for the food. */
    public get LandingPoint(): Node {
        return this.foodPoint?.isValid ? this.foodPoint : this.node;
    }

    public get IsFree(): boolean {
        return !this.isFoodOn && this.node.activeInHierarchy;
    }

    public IsFoodOn(isFoodOn: boolean): void {
        this.isFoodOn = isFoodOn;
        this.itemType = isFoodOn ? ItemType.None : this.plateItemType;
    }
}
