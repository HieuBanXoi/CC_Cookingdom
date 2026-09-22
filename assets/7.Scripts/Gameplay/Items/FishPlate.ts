import { _decorator, Node, Tween, tween, Vec3 } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { InWaterItem } from './InWaterItem';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { Ply_Event } from '../../Core/Base/Ply_Event';

const { ccclass, property } = _decorator;

/**
 * FishPlate: the plate the raw fish start on and the cut fish come back to.
 *
 * 1. Raw fish sit on the plate until they are dragged into the sink. While any
 *    of them is still here the plate reports ItemType.None, so a cut fish
 *    cannot be dropped on it. Once the last raw fish leaves, the plate takes
 *    its type back and the cut fish waiting on the board get their drag target
 *    refreshed.
 * 2. The first cut fish lands normally (InWaterItem jump + plate punch + heart).
 * 3. Every next cut fish disappears on landing; the first one grows to
 *    `stackScale` with a light punch, as if the fish was added to the pile.
 *
 * The fish must use this plate node (or one of its children) as their
 * InWaterItem.plateTarget.
 */
@ccclass('FishPlate')
export class FishPlate extends Item {
    @property({ type: [InWaterItem], tooltip: 'Raw fish that start on this plate. Empty = every InWaterItem found in the children.' })
    public fishes: InWaterItem[] = [];

    @property({ min: 0, tooltip: 'Scale of the first landed fish once another fish is added, relative to its landing scale.' })
    public stackScale = 1.3;

    @property({ min: 0, tooltip: 'Extra overshoot of the punch when a fish is added (0.08 = 8%).' })
    public stackPunchScale = 0.08;

    @property({ min: 0, tooltip: 'Duration of the grow + punch in seconds.' })
    public stackPunchDuration = 0.3;

    @property({ tooltip: 'Spawn a heart on the plate when a fish is added to the pile (the hidden fish cannot show its own).' })
    public spawnHeartOnStack = true;

    @property({ type: Ply_Event, tooltip: 'Triggered each time a cut fish lands on the plate.' })
    public onFishLanded: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered once every fish is back on the plate.' })
    public onAllFishLanded: Ply_Event = new Ply_Event();

    /** ItemType restored when no raw fish is left on the plate (the one configured in the Inspector, normally Plate). */
    private plateItemType: ItemType = ItemType.Plate;

    /** Raw fish that have not been dropped into the sink yet. */
    private readonly rawFish = new Set<InWaterItem>();
    /** Cut fish that landed here, in landing order. */
    private readonly landedFish: InWaterItem[] = [];
    private readonly listeners = new Map<InWaterItem, { onDropSuccess: (target?: Node) => void; onMoveComplete: (target: Node) => void }>();

    /** Scale of the first fish when it landed; the pile grows from here. */
    private stackBaseScale: Vec3 = new Vec3(1, 1, 1);
    private stackTween: Tween<Node> | null = null;
    private allLandedRaised = false;

    public get RawFishCount(): number {
        return this.rawFish.size;
    }

    public get LandedFishCount(): number {
        return this.landedFish.length;
    }

    public get IsFree(): boolean {
        return this.rawFish.size === 0 && this.node.activeInHierarchy;
    }

    protected onLoad(): void {
        super.onLoad();
        if (this.itemType !== ItemType.None) {
            this.plateItemType = this.itemType;
        }
        this.CollectFish();
        this.RefreshPlateState();
    }

    protected onEnable(): void {
        this.cacheComponents();
        for (const fish of this.fishes) this.Subscribe(fish);
        this.RefreshPlateState();
    }

    protected onDisable(): void {
        for (const fish of this.fishes) this.Unsubscribe(fish);
    }

    // =========================================================
    // FISH TRACKING
    // =========================================================

    private CollectFish(): void {
        if (this.fishes.length === 0) {
            this.fishes = this.getComponentsInChildren(InWaterItem);
        }

        this.rawFish.clear();
        for (const fish of this.fishes) {
            if (!fish?.isValid) continue;
            if (this.IsFishStillRaw(fish)) this.rawFish.add(fish);
        }
    }

    /** A fish that has not entered the sink / board / plate yet is still lying on this plate. */
    private IsFishStillRaw(fish: InWaterItem): boolean {
        return !fish.isInWater && !fish.isOnCuttingBoard && !fish.isOnPlate && !fish.isClean;
    }

    private Subscribe(fish: InWaterItem): void {
        if (!fish?.isValid || this.listeners.has(fish)) return;

        const handlers = {
            onDropSuccess: (target?: Node): void => this.OnFishDropSuccess(fish, target || null),
            onMoveComplete: (target: Node): void => this.OnFishMoveComplete(fish, target),
        };
        this.listeners.set(fish, handlers);

        fish.itemDraggable?.onDropSuccess.removeListener(handlers.onDropSuccess);
        fish.itemDraggable?.onDropSuccess.addListener(handlers.onDropSuccess);
        fish.node.off(ItemMoveToTarget.EVENT_COMPLETE, handlers.onMoveComplete, this);
        fish.node.on(ItemMoveToTarget.EVENT_COMPLETE, handlers.onMoveComplete, this);
    }

    private Unsubscribe(fish: InWaterItem): void {
        const handlers = this.listeners.get(fish);
        if (!handlers) return;
        this.listeners.delete(fish);
        if (!fish?.isValid) return;

        fish.itemDraggable?.onDropSuccess.removeListener(handlers.onDropSuccess);
        fish.node.off(ItemMoveToTarget.EVENT_COMPLETE, handlers.onMoveComplete, this);
    }

    /** The first successful drop of a raw fish is always into the sink: it has left the plate. */
    private OnFishDropSuccess(fish: InWaterItem, _target: Node | null): void {
        if (!this.rawFish.has(fish)) return;
        this.rawFish.delete(fish);
        this.RefreshPlateState();
    }

    private OnFishMoveComplete(fish: InWaterItem, target: Node): void {
        if (!this.IsPlateTarget(target)) return;
        // InWaterItem handles the same event (isOnPlate, plate punch, heart).
        // Wait a frame so the pile logic runs after it whatever the bind order.
        this.scheduleOnce(() => {
            if (!fish?.isValid || !fish.isOnPlate) return;
            this.OnFishLanded(fish);
        }, 0);
    }

    /** True for this plate node or any of its children (the fish's plateTarget). */
    private IsPlateTarget(target: Node | null): boolean {
        let current: Node | null = target;
        while (current?.isValid) {
            if (current === this.node) return true;
            current = current.parent;
        }
        return false;
    }

    // =========================================================
    // PLATE AVAILABILITY
    // =========================================================

    /**
     * The plate only accepts a cut fish once every raw fish is gone. Cut fish
     * already waiting on the board picked the plate type when they were cut,
     * so their drag target is refreshed here.
     */
    private RefreshPlateState(): void {
        this.itemType = this.rawFish.size === 0 ? this.plateItemType : ItemType.None;

        for (const fish of this.fishes) {
            if (!fish?.isValid || !fish.isCutDone || fish.isOnPlate) continue;
            fish.itemDraggable?.SetTargetItemType(this.node);
        }
    }

    // =========================================================
    // LANDING
    // =========================================================

    private OnFishLanded(fish: InWaterItem): void {
        if (this.landedFish.indexOf(fish) !== -1) return;
        this.landedFish.push(fish);

        if (this.landedFish.length === 1) {
            // First fish: the normal InWaterItem landing, just remember its size.
            Vec3.copy(this.stackBaseScale, fish.node.scale);
        } else {
            this.StackFish(fish);
        }

        this.onFishLanded.invoke();

        if (!this.allLandedRaised && this.landedFish.length >= this.fishes.length) {
            this.allLandedRaised = true;
            this.onAllFishLanded.invoke();
        }
    }

    /** The added fish vanishes and the first one grows with a light punch. */
    private StackFish(fish: InWaterItem): void {
        // The heart InWaterItem spawned is parented to the fish: release it before hiding.
        fish.TurnOffActiveEffect();
        fish.node.active = false;

        const first = this.landedFish[0];
        if (!first?.node?.isValid) return;

        const target = this.stackBaseScale.clone().multiplyScalar(this.stackScale);
        const overshoot = target.clone().multiplyScalar(1 + this.stackPunchScale);

        if (this.stackTween) {
            this.stackTween.stop();
            this.stackTween = null;
        }

        const halfTime = Math.max(0.01, this.stackPunchDuration * 0.5);
        this.stackTween = tween(first.node)
            .to(halfTime, { scale: overshoot }, { easing: 'sineOut' })
            .to(halfTime, { scale: target }, { easing: 'sineIn' })
            .call(() => {
                this.stackTween = null;
                first.node.setScale(target);
            })
            .start();

        if (this.spawnHeartOnStack) this.SpawnHeart();
    }
}
