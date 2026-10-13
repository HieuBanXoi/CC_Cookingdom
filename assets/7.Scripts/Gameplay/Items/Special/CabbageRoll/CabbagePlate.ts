import { _decorator, Node } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';

const { ccclass, property } = _decorator;

/**
 * Last plate holding the rolled cabbages. Hands out its slots in order
 * (1 -> 4) and spawns a heart once every slot is filled.
 */
@ccclass('CabbagePlate')
export class CabbagePlate extends Item {
    @property({ type: [Node], tooltip: 'Chỗ đặt cabbage theo thứ tự. Trống = các con của node "CabbagePos".' })
    public slots: Node[] = [];

    private reservedCount = 0;
    private arrivedCount = 0;

    protected onLoad(): void {
        super.onLoad();
        if (this.slots.length === 0) {
            const holder = this.node.getChildByName('CabbagePos');
            if (holder) this.slots = holder.children.slice();
        }
    }

    /** Takes the next free slot; the plate stops accepting drops once full. */
    public ReserveSlot(): Node | null {
        if (this.reservedCount >= this.slots.length) return null;
        const slot = this.slots[this.reservedCount++];
        if (this.reservedCount >= this.slots.length) this.itemType = ItemType.None;
        return slot;
    }

    public OnCabbageArrived(): void {
        this.arrivedCount++;
        if (this.arrivedCount < this.slots.length) return;
        this.ItemDone();
        this.SpawnHeart();
    }
}
