import { _decorator, Node, tween, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { ItemType } from '../Items/ItemType';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';
import { StrawberryFx } from './StrawberryFx';
import { StrawberryMixSpoon } from './StrawberryMixSpoon';
import { StrawberryBakingDish } from './StrawberryBakingDish';
import { StrawberryOven } from './StrawberryOven';

const { ccclass, property } = _decorator;

/**
 * Phase 3 bowl. Collects sugar + vanilla, then the spoon jumps in for
 * stirring (mix frames cross-fade with the stir progress). Afterwards it
 * rises, the baking dish slides in and the bowl is dragged onto it to pour.
 * The bowl then leaves and the oven slides in.
 * itemType = Bowl (pour target). ItemDraggable.targetItemType = BakingDish.
 */
@ccclass('StrawberryMixBowl')
export class StrawberryMixBowl extends Item {
    @property({ min: 1 })
    public totalIngredients = 2;

    @property({ type: [Node], tooltip: 'Contents before mixing (strawberries, sugar, vanilla): fade out as mixing starts.' })
    public baseLayers: Node[] = [];

    @property({ type: [Node], tooltip: 'Mixing frames in order: each fades in, the previous one fades out.' })
    public mixFrames: Node[] = [];

    @property(StrawberryMixSpoon)
    public spoon: StrawberryMixSpoon | null = null;

    @property(StrawberryBakingDish)
    public bakingDish: StrawberryBakingDish | null = null;

    @property(StrawberryOven)
    public oven: StrawberryOven | null = null;

    @property({ tooltip: 'Local offset the bowl rises by after stirring.' })
    public moveUpOffset = new Vec3(0, 160, 0);

    @property({ tooltip: 'World offset from the dish centre where the bowl tilts to pour.' })
    public pourOffset = new Vec3(-170, 190, 0);

    @property({ tooltip: 'Z rotation while pouring (negative = tilt right).' })
    public pourTilt = -60;

    @property({ min: 0.1 })
    public pourDuration = 1.2;

    @property({ tooltip: 'World offset the bowl leaves by after pouring.' })
    public exitOffset = new Vec3(-900, 200, 0);

    private ingredientCount = 0;

    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);

    protected onLoad(): void {
        super.onLoad();
        this.itemType = ItemType.Bowl;
        this.itemDraggable?.DisableComponent();
        for (const frame of this.mixFrames) {
            if (!frame) continue;
            frame.active = true;
            StrawberryFx.SetOpacity(frame, 0);
        }
        if (this.spoon) this.spoon.node.active = false;
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    /** Called by a pourer once its content is in the bowl. */
    public AddIngredient(): void {
        this.ingredientCount++;
        StrawberryFx.Punch(this.node, 0.04, 0.18);
        if (this.ingredientCount < this.totalIngredients) return;

        this.spoon?.JumpIn(p => this.ApplyMix(p), () => this.OnStirDone());
    }

    /**
     * progress 0..1 over N frames: frame k fades in during [k, k+1] (in units of 1/N);
     * the layer under it fades out over the second half of that span.
     */
    private ApplyMix(progress: number): void {
        const count = this.mixFrames.length;
        if (count === 0) return;
        const t = progress * count;
        const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

        const baseAlpha = 1 - clamp01((t - 0.5) * 2);
        for (const layer of this.baseLayers) StrawberryFx.SetOpacity(layer, baseAlpha * 255);

        for (let k = 0; k < count; k++) {
            const fadeIn = clamp01(t - k);
            const fadeOut = k < count - 1 ? clamp01((t - (k + 1) - 0.5) * 2) : 0;
            StrawberryFx.SetOpacity(this.mixFrames[k], fadeIn * (1 - fadeOut) * 255);
        }
    }

    private OnStirDone(): void {
        this.ApplyMix(1);
        const up = this.node.position.clone().add(this.moveUpOffset);
        tween(this.node).to(0.4, { position: up }, { easing: 'quadOut' }).start();

        const dish = this.bakingDish;
        if (!dish) return;
        this.itemDraggable?.SetTargetItemType(dish.node);
        dish.Enter(() => this.EnableItemDraggable());
    }

    private OnDropSuccess(target: Node): void {
        const dish = target.getComponent(StrawberryBakingDish);
        if (!dish) {
            this.itemDraggable?.ReturnToStartWithoutHeart();
            return;
        }

        this.itemDraggable?.DisableComponent();
        this.ItemDone();

        const pourPos = StrawberryFx.OffsetWorld(dish.node.worldPosition, this.pourOffset, dish.node.parent);
        pourPos.z = this.node.worldPosition.z;
        tween(this.node)
            .to(0.3, { worldPosition: pourPos }, { easing: 'quadOut' })
            .to(0.3, { eulerAngles: new Vec3(0, 0, this.pourTilt) }, { easing: 'quadOut' })
            .call(() => this.PourInto(dish))
            .start();
    }

    private PourInto(dish: StrawberryBakingDish): void {
        Ply_SoundManager.Ins?.PlayFx(FxType.Cream);
        for (const frame of this.mixFrames) StrawberryFx.Fade(frame, 0, this.pourDuration);
        for (const layer of this.baseLayers) StrawberryFx.Fade(layer, 0, this.pourDuration);
        dish.ShowContent(this.pourDuration);

        tween(this.node)
            .delay(this.pourDuration)
            .call(() => this.Leave())
            .start();
    }

    private Leave(): void {
        const exitPos = StrawberryFx.OffsetWorld(this.node.worldPosition, this.exitOffset, this.bakingDish?.node.parent ?? null);
        StrawberryFx.Fade(this.node, 0, 0.5);
        tween(this.node)
            .to(0.5, { worldPosition: exitPos, eulerAngles: new Vec3() }, { easing: 'quadIn' })
            .call(() => {
                this.node.active = false;
                this.oven?.Enter(() => this.bakingDish?.EnableToOven());
            })
            .start();
    }
}
