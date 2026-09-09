import { _decorator, Component, Node, Tween, tween, UITransform, UIOpacity, Vec3 } from 'cc';
import { Item } from './Item';
import { ItemDraggable } from './ItemDraggable';
import { ItemType } from './ItemType';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

enum SeasoningType { None, Chili, Pepper, Salt }

@ccclass('SeasoningFoodTarget')
export class SeasoningFoodTarget {
    @property({ type: Item, tooltip: 'The FoodOil item this configuration controls.' })
    public food: Item | null = null;

    @property({ tooltip: 'This food requires chili before it can be dragged.' }) public needsChili = true;
    @property({ tooltip: 'This food requires pepper before it can be dragged.' }) public needsPepper = true;
    @property({ tooltip: 'This food requires salt before it can be dragged.' }) public needsSalt = true;

    @property({ type: Node, tooltip: 'Chili sprite placed on this food.' }) public chiliSprite: Node | null = null;
    @property({ type: Node, tooltip: 'Pepper sprite placed on this food.' }) public pepperSprite: Node | null = null;
    @property({ type: Node, tooltip: 'Salt sprite placed on this food.' }) public saltSprite: Node | null = null;
}

/** Free-drag spoon: load a seasoning from a pile, then pour it onto FoodOil. */
@ccclass('SpoonSeasoning')
export class SpoonSeasoning extends Item {
    @property({ type: Node, tooltip: 'Point used for spoon hit tests. Uses the spoon node when empty.' })
    public spoonPoint: Node | null = null;

    @property({ type: Node, tooltip: 'Chili source hit area.' }) public chiliSource: Node | null = null;
    @property({ type: Node, tooltip: 'Pepper source hit area.' }) public pepperSource: Node | null = null;
    @property({ type: Node, tooltip: 'Salt source hit area.' }) public saltSource: Node | null = null;
    @property({ type: Node, tooltip: 'Chili sprite displayed on the spoon.' }) public chiliOnSpoon: Node | null = null;
    @property({ type: Node, tooltip: 'Pepper sprite displayed on the spoon.' }) public pepperOnSpoon: Node | null = null;
    @property({ type: Node, tooltip: 'Salt sprite displayed on the spoon.' }) public saltOnSpoon: Node | null = null;
    @property({ min: 0, tooltip: 'Start height above the placed seasoning sprite.' }) public fallDistance = 80;
    @property({ min: 0.01, tooltip: 'Seasoning fall animation duration.' }) public fallDuration = 0.25;
    @property({ range: [0, 1, 0.05], slide: true, tooltip: 'Opacity at the top of the fall.' }) public fallStartOpacity = 0.4;

    @property({ type: [SeasoningFoodTarget], tooltip: 'Required seasonings and placed sprites for each food.' })
    public foodTargets: SeasoningFoodTarget[] = [];

    private ownerItem: Item | null = null;
    private draggable: ItemDraggable | null = null;
    private held = SeasoningType.None;
    private currentFood: Item | null = null;
    private readonly applied = new Map<Item, Set<SeasoningType>>();
    private readonly restingPositions = new Map<Node, Vec3>();
    private spoonComplete = false;

    protected onLoad(): void {
        this.ownerItem = this.getComponent(Item);
        this.draggable = this.getComponent(ItemDraggable);
        this.AutoAssignSceneNodes();
        this.HideAllFoodSeasoningSprites();
        this.SetHeld(SeasoningType.None);
        if (this.draggable) {
            this.draggable.targetItemType = ItemType.None;
            this.draggable.DisableSpawnBreakHeartOnDropFail();
        }
    }

    protected onEnable(): void {
        this.draggable ??= this.getComponent(ItemDraggable);
        this.draggable?.onDropFail.addListener(this.OnSpoonReleased);
    }

    protected onDisable(): void {
        this.draggable?.onDropFail.removeListener(this.OnSpoonReleased);
        this.SetHeld(SeasoningType.None);
        this.currentFood = null;
    }

    protected update(): void {
        if (!this.draggable?.IsDragging) return;

        const source = this.GetSourceAtPoint();
        // Once loaded, the spoon cannot swap to another seasoning. It must
        // pour the held seasoning onto food or be released to clear it.
        if (this.held === SeasoningType.None && source !== SeasoningType.None) {
            this.SetHeld(source);
            this.currentFood = null;
            Ply_SoundManager.Ins?.PlayFx(FxType.PouringSalt);
            return;
        }

        const target = this.GetFoodTargetAtPoint();
        const food = target?.food ?? null;
        if (!food || food === this.currentFood) return;
        this.currentFood = food;
        if (this.held === SeasoningType.None || !this.Requires(target, this.held) || this.HasSeasoning(food, this.held)) return;

        this.ApplySeasoning(target, this.held);
        this.SetHeld(SeasoningType.None);
    }

    /** Current next interaction point, used by HandTutManager. */
    public GetHandTutTarget(): Node | null {
        return this.GetHandTutRoute()[0] ?? null;
    }

    /**
     * Returns seasoning source then its matching food. When the spoon already
     * holds seasoning, only the matching food remains in the route.
     */
    public GetHandTutRoute(): Node[] {
        if (this.held !== SeasoningType.None) {
            const food = this.GetFoodNeedingSeasoning(this.held);
            return food ? [food.node] : [];
        }

        for (const target of this.foodTargets) {
            const food = target.food;
            if (!food?.node.activeInHierarchy || food.itemType !== ItemType.FoodOil) continue;
            const needed = this.GetFirstMissingSeasoning(target, food);
            const source = this.GetSourceNode(needed);
            if (source?.activeInHierarchy) return [source, food.node];
        }

        return [this.chiliSource, this.pepperSource, this.saltSource]
            .filter(node => !!node?.activeInHierarchy) as Node[];
    }

    private AutoAssignSceneNodes(): void {
        const scene = this.node.scene;
        if (!scene) return;
        this.chiliSource ??= this.FindByNames(scene, ['Chilli1', 'Chili1']);
        this.pepperSource ??= this.FindByNames(scene, ['Pepper1']);
        this.saltSource ??= this.FindByNames(scene, ['Salt1']);
        const spoonContents = this.FindByNames(this.node, ['FoodIn']);
        this.chiliOnSpoon ??= this.FindByNames(spoonContents, ['Chili', 'Chilli']);
        this.pepperOnSpoon ??= this.FindByNames(spoonContents, ['Pepper']);
        this.saltOnSpoon ??= this.FindByNames(spoonContents, ['Salt']);
        for (const target of this.foodTargets) {
            if (!target.food) continue;
            target.chiliSprite ??= this.FindByNames(target.food.node, ['Chili', 'Chilli']);
            target.pepperSprite ??= this.FindByNames(target.food.node, ['Pepper']);
            target.saltSprite ??= this.FindByNames(target.food.node, ['Salt']);
        }
    }

    private GetSourceAtPoint(): SeasoningType {
        if (this.IsPointInside(this.chiliSource)) return SeasoningType.Chili;
        if (this.IsPointInside(this.pepperSource)) return SeasoningType.Pepper;
        if (this.IsPointInside(this.saltSource)) return SeasoningType.Salt;
        return SeasoningType.None;
    }

    private GetFoodTargetAtPoint(): SeasoningFoodTarget | null {
        for (const target of this.foodTargets) {
            const food = target.food;
            if (food && food !== this.ownerItem && food.node.activeInHierarchy
                && food.itemType === ItemType.FoodOil && this.IsPointInside(food.node)) return target;
        }
        return null;
    }

    private ApplySeasoning(target: SeasoningFoodTarget, seasoning: SeasoningType): void {
        const food = target.food;
        if (!food) return;
        let set = this.applied.get(food);
        if (!set) {
            set = new Set<SeasoningType>();
            this.applied.set(food, set);
        }
        set.add(seasoning);

        const placedSprite = this.GetPlacedSprite(target, seasoning);
        if (placedSprite) this.PlayFallAnimation(placedSprite);
        Ply_SoundManager.Ins?.PlayFx(FxType.PouringSalt);

        if (this.HasAllRequired(target, set)) {
            food.itemDraggable ??= food.getComponent(ItemDraggable);
            food.itemDraggable?.EnableComponent();
            food.SpawnHeart();
        }

        if (!this.spoonComplete && this.AreAllFoodsSeasoned()) {
            this.spoonComplete = true;
            this.ItemDone();
        }
    }

    private HasSeasoning(food: Item, seasoning: SeasoningType): boolean {
        return this.applied.get(food)?.has(seasoning) ?? false;
    }

    private Requires(target: SeasoningFoodTarget, seasoning: SeasoningType): boolean {
        return (seasoning === SeasoningType.Chili && target.needsChili)
            || (seasoning === SeasoningType.Pepper && target.needsPepper)
            || (seasoning === SeasoningType.Salt && target.needsSalt);
    }

    private HasAllRequired(target: SeasoningFoodTarget, applied: Set<SeasoningType>): boolean {
        return (!target.needsChili || applied.has(SeasoningType.Chili))
            && (!target.needsPepper || applied.has(SeasoningType.Pepper))
            && (!target.needsSalt || applied.has(SeasoningType.Salt));
    }

    private GetPlacedSprite(target: SeasoningFoodTarget, seasoning: SeasoningType): Node | null {
        switch (seasoning) {
            case SeasoningType.Chili: return target.chiliSprite;
            case SeasoningType.Pepper: return target.pepperSprite;
            case SeasoningType.Salt: return target.saltSprite;
            default: return null;
        }
    }

    private GetFoodNeedingSeasoning(seasoning: SeasoningType): Item | null {
        for (const target of this.foodTargets) {
            const food = target.food;
            if (food?.node.activeInHierarchy && food.itemType === ItemType.FoodOil
                && this.Requires(target, seasoning) && !this.HasSeasoning(food, seasoning)) return food;
        }
        return null;
    }

    private GetFirstMissingSeasoning(target: SeasoningFoodTarget, food: Item): SeasoningType {
        if (target.needsChili && !this.HasSeasoning(food, SeasoningType.Chili)) return SeasoningType.Chili;
        if (target.needsPepper && !this.HasSeasoning(food, SeasoningType.Pepper)) return SeasoningType.Pepper;
        if (target.needsSalt && !this.HasSeasoning(food, SeasoningType.Salt)) return SeasoningType.Salt;
        return SeasoningType.None;
    }

    private GetSourceNode(seasoning: SeasoningType): Node | null {
        switch (seasoning) {
            case SeasoningType.Chili: return this.chiliSource;
            case SeasoningType.Pepper: return this.pepperSource;
            case SeasoningType.Salt: return this.saltSource;
            default: return null;
        }
    }

    private AreAllFoodsSeasoned(): boolean {
        return this.foodTargets.length > 0 && this.foodTargets.every(target => {
            const food = target.food;
            return !!food && this.HasAllRequired(target, this.applied.get(food) ?? new Set<SeasoningType>());
        });
    }

    private SetHeld(seasoning: SeasoningType): void {
        this.held = seasoning;
        this.SetActive(this.chiliOnSpoon, seasoning === SeasoningType.Chili);
        this.SetActive(this.pepperOnSpoon, seasoning === SeasoningType.Pepper);
        this.SetActive(this.saltOnSpoon, seasoning === SeasoningType.Salt);
    }

    private HideAllFoodSeasoningSprites(): void {
        for (const target of this.foodTargets) {
            this.SetActive(target.chiliSprite, false);
            this.SetActive(target.pepperSprite, false);
            this.SetActive(target.saltSprite, false);
        }
    }

    private readonly OnSpoonReleased = (): void => {
        this.SetHeld(SeasoningType.None);
        this.currentFood = null;
    };

    private PlayFallAnimation(node: Node): void {
        let resting = this.restingPositions.get(node);
        if (!resting) {
            resting = node.position.clone();
            this.restingPositions.set(node, resting);
        }
        node.active = true;
        node.setPosition(resting.x, resting.y + this.fallDistance, resting.z);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = Math.round(this.fallStartOpacity * 255);
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacity);
        tween(node).to(this.fallDuration, { position: resting.clone() }, { easing: 'quadIn' }).start();
        tween(opacity).to(this.fallDuration, { opacity: 255 }, { easing: 'quadIn' }).start();
    }

    private IsPointInside(target: Node | null): boolean {
        if (!target?.activeInHierarchy) return false;
        const transform = target.getComponent(UITransform);
        if (!transform) return false;
        const local = transform.convertToNodeSpaceAR((this.spoonPoint ?? this.node).worldPosition);
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

    private GetNames(seasoning: SeasoningType): string[] {
        switch (seasoning) {
            case SeasoningType.Chili: return ['Chili', 'Chilli'];
            case SeasoningType.Pepper: return ['Pepper'];
            case SeasoningType.Salt: return ['Salt'];
            default: return [];
        }
    }

    private SetActive(node: Node | null, active: boolean): void {
        if (node?.isValid) node.active = active;
    }
}
