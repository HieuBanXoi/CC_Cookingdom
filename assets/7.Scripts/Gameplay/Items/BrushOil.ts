import { _decorator, Node, Sprite, Tween, tween, UITransform, Vec3 } from 'cc';
import { ItemDraggable } from './ItemDraggable';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { StoveCooking, StoveFoodSlot } from './StoveCooking';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

@ccclass('BrushOilTarget')
export class BrushOilTarget {
    @property({ type: Item, tooltip: 'Food that can be brushed with oil.' })
    public food: Item | null = null;

    @property({ type: Sprite, tooltip: 'Oil overlay displayed on this food.' })
    public oilSprite: Sprite | null = null;
}

/**
 * A freely dragged brush that oils each configured food on two separate contacts.
 * The brushPoint, rather than the brush item's pivot, is used for hit testing.
 */
@ccclass('BrushOil')
export class BrushOil extends Item {
    @property({ type: Node, tooltip: 'Point on the brush used to test whether it touches food.' })
    public brushPoint: Node | null = null;

    @property({ type: [BrushOilTarget], tooltip: 'The three foods and their corresponding oil overlays.' })
    public targets: BrushOilTarget[] = [];

    @property({ range: [0, 1, 0.05], slide: true, tooltip: 'Oil opacity after the first brush pass.' })
    public firstPassOpacity = 0.5;

    @property({ min: 0.01, tooltip: 'Duration of the food punch feedback.' })
    public punchDuration = 0.16;

    @property({ min: 1, tooltip: 'Scale multiplier used by the food punch feedback.' })
    public punchScaleMultiplier = 1.06;

    @property({ tooltip: 'Mark a food done after its second oil pass.' })
    public markFoodDoneOnComplete = true;

    private readonly passCounts = new Map<BrushOilTarget, number>();
    private readonly brushedThisDrag = new Set<BrushOilTarget>();
    private readonly blockedCookingSlotsThisDrag = new Set<StoveFoodSlot>();
    private readonly defaultFoodScales = new Map<Node, Vec3>();
    private didBrushInCurrentDrag = false;
    private stove: StoveCooking | null = null;

    protected onLoad(): void {
        super.onLoad();
        this.stove = this.node.scene?.getComponentInChildren(StoveCooking) ?? null;
        this.ResetOil();
        // This brush is a free-sweeping tool, not a regular drop-to-target item.
        // Keeping the drop type empty guarantees release returns it for the next pass.
        if (this.itemDraggable) {
            this.itemDraggable.targetItemType = ItemType.None;
            // BrushOil is a forgiving free-sweeping tool: releasing it away
            // from food simply returns it, without failure feedback.
            this.itemDraggable.DisableSpawnBreakHeartOnDropFail();
        }
        // The brush must remain usable while the foods wait to be oiled.
        this.itemDraggable?.EnableComponent();
    }

    protected onEnable(): void {
        this.itemDraggable?.onBeginDrag.addListener(this.onBrushDragStart);
        this.itemDraggable?.onDropFail.addListener(this.onBrushDragEnd);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBrushDragStart);
        this.itemDraggable?.onDropFail.removeListener(this.onBrushDragEnd);
    }

    protected update(): void {
        if (!this.itemDraggable?.IsDragging) return;

        for (const target of this.targets) {
            const isOverFood = this.isBrushPointOverFood(target.food);
            if (!isOverFood) {
                // Leaving the food arms it for another pass during this same drag.
                this.brushedThisDrag.delete(target);
                continue;
            }

            if (this.brushedThisDrag.has(target) || this.passCounts.get(target) >= 2) continue;
            this.ApplyBrushPass(target);
        }

        const brushPoint = (this.brushPoint ?? this.node).worldPosition;
        const stoveSlot = this.stove?.GetFoodOnStoveSlotAtPoint(brushPoint);
        if (stoveSlot && !this.blockedCookingSlotsThisDrag.has(stoveSlot)) {
            this.blockedCookingSlotsThisDrag.add(stoveSlot);
            this.stove?.ShowFoodOnStoveBlockedFeedback(brushPoint);
        }
    }

    /** Enable this from the preceding gameplay step when the brush becomes usable. */
    public EnableBrush(): void {
        this.itemDraggable?.EnableComponent();
    }

    /** Disables brush input without altering the oil already applied to food. */
    public DisableBrush(): void {
        this.itemDraggable?.DisableComponent();
    }

    /** The next food that still needs a brush pass, used by HandTutManager. */
    public GetHandTutTarget(): Node | null {
        for (const target of this.targets) {
            if (target.food?.node.activeInHierarchy && (this.passCounts.get(target) ?? 0) < 2) return target.food.node;
        }
        return null;
    }

    /** Clears all pass counts and hides every oil overlay. Useful when restarting the step. */
    public ResetOil(): void {
        this.passCounts.clear();
        this.brushedThisDrag.clear();
        this.blockedCookingSlotsThisDrag.clear();
        this.didBrushInCurrentDrag = false;

        for (const target of this.targets) {
            this.setOilOpacity(target.oilSprite, 0);
            this.SetFoodDraggable(target.food, false);
        }
    }

    private readonly onBrushDragStart = (): void => {
        this.brushedThisDrag.clear();
        this.blockedCookingSlotsThisDrag.clear();
        this.didBrushInCurrentDrag = false;
        Ply_SoundManager.Ins?.PlayFx(FxType.Cream);
    };

    private readonly onBrushDragEnd = (): void => {
        // A completed brush contact is valid gameplay, even though the brush
        // returns to its start because it has no drop target. Marking the
        // release also stops companions such as ItemDragChildRotator from
        // emitting a BreakHeart once their own animation finishes.
        if (this.didBrushInCurrentDrag) {
            this.itemDraggable?.MarkCurrentDropFailHandled();
        }
        this.brushedThisDrag.clear();
    };

    private ApplyBrushPass(target: BrushOilTarget): void {
        const food = target.food;
        if (!food) return;

        const passCount = Math.min(2, (this.passCounts.get(target) ?? 0) + 1);
        this.passCounts.set(target, passCount);
        this.brushedThisDrag.add(target);
        this.didBrushInCurrentDrag = true;

        this.setOilOpacity(target.oilSprite, passCount === 1 ? this.firstPassOpacity : 1);
        this.PunchFood(food.node);
        Ply_SoundManager.Ins?.PlayFx(FxType.Cream);

        if (passCount === 2) {
            // Oiled food advances to seasoning, but stays locked until all
            // three seasonings have been added by the spoon.
            food.itemType = ItemType.FoodOil;
            this.SetFoodDraggable(food, false);
            if (this.markFoodDoneOnComplete) food.ItemDone();
            food.SpawnHeart();
        }
    }

    private SetFoodDraggable(food: Item | null, enabled: boolean): void {
        if (!food) return;

        food.itemDraggable ??= food.getComponent(ItemDraggable);
        if (enabled) {
            food.itemDraggable?.EnableComponent();
        } else {
            food.itemDraggable?.DisableComponent();
        }
    }

    private isBrushPointOverFood(food: Item | null): boolean {
        if (!food?.node.activeInHierarchy) return false;

        const transform = food.getComponent(UITransform) ?? food.getComponentInChildren(UITransform);
        if (!transform) return false;

        const point = (this.brushPoint ?? this.node).worldPosition;
        const localPoint = transform.convertToNodeSpaceAR(point);
        const left = -transform.anchorX * transform.width;
        const bottom = -transform.anchorY * transform.height;
        return localPoint.x >= left && localPoint.x <= left + transform.width
            && localPoint.y >= bottom && localPoint.y <= bottom + transform.height;
    }

    private setOilOpacity(oilSprite: Sprite | null, opacity: number): void {
        if (!oilSprite) return;
        const color = oilSprite.color.clone();
        color.a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
        oilSprite.color = color;
    }

    private PunchFood(foodNode: Node): void {
        let defaultScale = this.defaultFoodScales.get(foodNode);
        if (!defaultScale) {
            defaultScale = foodNode.scale.clone();
            this.defaultFoodScales.set(foodNode, defaultScale);
        }

        Tween.stopAllByTarget(foodNode);
        foodNode.setScale(defaultScale);
        tween(foodNode)
            .to(this.punchDuration * 0.5, { scale: defaultScale.clone().multiplyScalar(this.punchScaleMultiplier) }, { easing: 'sineOut' })
            .to(this.punchDuration * 0.5, { scale: defaultScale.clone() }, { easing: 'sineIn' })
            .start();
    }
}
