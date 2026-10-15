import { _decorator, Node, tween } from 'cc';
import { Item } from '../Items/Item';
import { StrawberryFx } from './StrawberryFx';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Phase 1 basket. The strawberries already placed inside it are the landing
 * slots: hidden on load, shown one by one as picked strawberries are dropped.
 * Spawns a heart and finishes the phase step when every slot is filled.
 */
@ccclass('StrawberryBasket')
export class StrawberryBasket extends Item {
    @property({ type: [Node], tooltip: 'Strawberries inside the basket, filled in this order.' })
    public slots: Node[] = [];

    private filledCount = 0;
    private reservedCount = 0;

    protected onLoad(): void {
        super.onLoad();
        for (const slot of this.slots) {
            if (slot) slot.active = false;
        }
    }

    /** Reserves the next free slot for a strawberry that is flying in. */
    public ReserveSlot(): Node | null {
        if (this.reservedCount >= this.slots.length) return null;
        return this.slots[this.reservedCount++];
    }

    /** Shows a reserved slot once its strawberry has landed. */
    public FillSlot(slot: Node): void {
        slot.active = true;
        const base = slot.scale.clone();
        slot.setScale(base.x * 0.6, base.y * 0.6, base.z);
        tween(slot).to(0.2, { scale: base }, { easing: 'backOut' }).start();
        StrawberryFx.Punch(this.node, 0.06, 0.2);
        Ply_SoundManager.Ins?.PlayFx(FxType.FoodPlace);

        this.filledCount++;
        if (this.filledCount < this.slots.length) return;

        this.ItemDone();
        this.SpawnHeart();
        this.DoOneStep();
    }
}
