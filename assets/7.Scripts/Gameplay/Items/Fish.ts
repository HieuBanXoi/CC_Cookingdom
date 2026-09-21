import { _decorator, Enum, Node, Tween, tween, UIOpacity } from 'cc';
import { InWaterItem } from './InWaterItem';
import { ItemType } from './ItemType';
import { Knife } from './Knife';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Ply_Event } from '../../Core/Base/Ply_Event';

const { ccclass, property } = _decorator;

/**
 * Fish: washed in the sink, then dried on the cutting board.
 *
 * 1. In the sink the timer completes -> SetClean() fades the dirt away.
 * 2. Dragged to the board -> the wet nodes light up and the fish becomes
 *    FoodWet, so a dragged Paper can sweep over it.
 * 3. The paper wipes it -> the wet nodes fade out, the fish goes back to
 *    FoodOnCuttingBoard and hands itself to the knife.
 */
@ccclass('Fish')
export class Fish extends InWaterItem {
    @property({ type: Node, tooltip: 'Dirt visual on the raw fish. Faded out once the fish is clean in the sink.' })
    public dirtNode: Node | null = null;

    @property({ min: 0, tooltip: 'Dirt fade-out duration in seconds.' })
    public dirtFadeDuration = 0.35;

    @property({ type: [Node], tooltip: 'Water / wet drop nodes. Turned on when the fish lands on the cutting board, faded out by the paper.' })
    public waterWetNodes: Node[] = [];

    @property({ min: 0, tooltip: 'Fade-in duration of the wet nodes on the cutting board. 0 = show instantly.' })
    public waterFadeInDuration = 0.2;

    @property({ min: 0, tooltip: 'Fade-out duration of the wet nodes when the paper wipes the fish.' })
    public waterFadeOutDuration = 0.35;

    @property({ type: Enum(ItemType), tooltip: 'Type the fish takes on the board so Paper.wipeTargetType can find it.' })
    public wetItemType: ItemType = ItemType.FoodWet;

    @property({ type: Enum(ItemType), tooltip: 'Type the fish goes back to once the paper dried it (the type the knife is dropped on).' })
    public driedItemType: ItemType = ItemType.FoodOnCuttingBoard;

    @property({ tooltip: 'Hand the fish to Item.knife once the paper dried it.' })
    public setKnifeTargetAfterPaperClean = true;

    @property({ type: Ply_Event, tooltip: 'Triggered once the dirt has faded away in the sink.' })
    public onDirtCleaned: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered once the paper dried the fish (hook for the knife animation).' })
    public onPaperCleaned: Ply_Event = new Ply_Event();

    private isDirtCleaned = false;
    private isWet = false;
    private isPaperCleaned = false;

    public get IsPaperCleaned(): boolean {
        return this.isPaperCleaned;
    }

    protected onLoad(): void {
        super.onLoad();
        // The fish only gets wet once it is on the board.
        this.SetWetNodesActive(false);
    }

    // =========================================================
    // 1. SINK: the dirt goes away
    // =========================================================

    public override SetClean(): void {
        super.SetClean();
        if (this.isDirtCleaned) return;
        this.isDirtCleaned = true;

        this.FadeNode(this.dirtNode, 0, this.dirtFadeDuration, -1, () => this.onDirtCleaned.invoke());
    }

    // =========================================================
    // 2. CUTTING BOARD: the fish is wet
    // =========================================================

    /** Called by InWaterItem once the fish has arrived on the cutting board. */
    protected override OnMoveToCuttingBoard(): void {
        super.OnMoveToCuttingBoard();
        if (this.isPaperCleaned) return;

        this.isWet = true;
        this.SetWetNodesActive(true);
        for (const wetNode of this.waterWetNodes) {
            this.FadeNode(wetNode, 255, this.waterFadeInDuration, 0);
        }

        // Paper looks for this type while it is being dragged.
        this.itemType = this.wetItemType;
    }

    // =========================================================
    // 3. PAPER: the fish is dried
    // =========================================================

    /** A dragged Paper swept over the fish (Paper -> Item.PaperOn). */
    public override PaperOn(): void {
        super.PaperOn();
        if (!this.isWet || this.isPaperCleaned) return;

        this.isWet = false;
        this.isPaperCleaned = true;
        // Out of the paper's reach from here on, whatever the fade does.
        this.itemType = this.driedItemType;

        for (const wetNode of this.waterWetNodes) {
            this.FadeNode(wetNode, 0, this.waterFadeOutDuration);
        }

        if (this.waterFadeOutDuration > 0) {
            this.scheduleOnce(() => this.OnPaperCleanComplete(), this.waterFadeOutDuration);
        } else {
            this.OnPaperCleanComplete();
        }
    }

    /** The wet nodes are gone: hand the fish over to the knife. */
    protected OnPaperCleanComplete(): void {
        if (this.setKnifeTargetAfterPaperClean) this.SetKnifeTarget();
        this.onPaperCleaned.invoke();
    }

    /** Lets the assigned knife be dropped on this fish. */
    public SetKnifeTarget(): void {
        if (!this.knife?.isValid) {
            console.warn(`[Fish] Assign Item.knife on "${this.node.name}" to enable cutting.`);
            return;
        }
        ComponentCache.get(this.knife, Knife)?.SetTarget(this.node);
    }

    // =========================================================
    // HELPERS
    // =========================================================

    private SetWetNodesActive(isActive: boolean): void {
        for (const wetNode of this.waterWetNodes) {
            if (!wetNode?.isValid) continue;
            wetNode.active = isActive;
        }
    }

    /**
     * Tweens a node's UIOpacity. `from` < 0 keeps the current opacity as the
     * start value; a node faded to 0 is deactivated once it arrives.
     */
    private FadeNode(target: Node | null, to: number, duration: number, from: number = -1, onComplete?: () => void): void {
        if (!target?.isValid) {
            onComplete?.();
            return;
        }

        const opacity = target.getComponent(UIOpacity) ?? target.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        if (from >= 0) opacity.opacity = from;

        if (duration <= 0) {
            opacity.opacity = to;
            target.active = to > 0;
            onComplete?.();
            return;
        }

        target.active = true;
        tween(opacity)
            .to(duration, { opacity: to }, { easing: 'sineOut' })
            .call(() => {
                if (to <= 0) target.active = false;
                onComplete?.();
            })
            .start();
    }
}
