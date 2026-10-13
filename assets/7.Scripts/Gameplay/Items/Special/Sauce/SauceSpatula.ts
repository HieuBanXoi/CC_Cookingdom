import { _decorator, Node } from 'cc';
import { Spatula } from '../Cooking/Spatula';

const { ccclass, property } = _decorator;

/**
 * Spatula for the sauce pot: shows its "in pot" sprite while stirring, then
 * goes back to the default sprite, rotates back and returns home for good.
 */
@ccclass('SauceSpatula')
export class SauceSpatula extends Spatula {
    @property({ type: Node, tooltip: 'Sprite mặc định (spatula_2).' })
    public defaultSprite: Node | null = null;

    @property({ type: Node, tooltip: 'Sprite khi ở trong nồi (spatula_OnPot).' })
    public onPotSprite: Node | null = null;

    protected onLoad(): void {
        super.onLoad();
        this.ShowOnPot(false);
    }

    public override StartStir(): void {
        super.StartStir();
        if (this.itemStirring?.enabled) this.ShowOnPot(true);
    }

    public override FinishStir(): void {
        super.FinishStir();
        this.ShowOnPot(false);
        // Spatula re-enables ItemDraggable once home; keep it from being dragged again.
        if (this.itemDraggable) this.itemDraggable.isDraggable = false;
        this.ItemDone();
    }

    private ShowOnPot(onPot: boolean): void {
        if (this.defaultSprite) this.defaultSprite.active = !onPot;
        if (this.onPotSprite) this.onPotSprite.active = onPot;
    }
}
