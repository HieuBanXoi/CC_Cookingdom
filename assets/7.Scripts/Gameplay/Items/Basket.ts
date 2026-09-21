import { _decorator, math, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { Sink } from './Sink';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { World } from '../../Managers/World';
import { PoolType } from '../../Core/Pool/PoolMember';
import { WaterSplash } from '../Effects/WaterSplash';

const { ccclass, property } = _decorator;

/**
 * A basket of food that is washed as one piece.
 *
 * 1. Only the basket can be dragged; the food inside it is locked. It can only
 *    be dropped into a sink that already holds water.
 * 2. In the basin the dirt fades away and the water nodes light up. Each tap
 *    dips the basket into the water and takes one step of the water away.
 * 3. The tap after the last dip sends the basket back to where it started.
 *    The food inside becomes draggable, the basket does not.
 *
 * While the basket sits in the basin the sink is locked, so no other item can
 * be dropped into it.
 */
@ccclass('Basket')
export class Basket extends Item {
    @property({ type: Sink, tooltip: 'Sink this basket is washed in.' })
    public sink: Sink | null = null;

    @property({ type: Node, tooltip: 'Landing point inside the basin. Defaults to the sink node.' })
    public waterTarget: Node | null = null;

    @property({ type: [Item], tooltip: 'Food inside the basket. Locked until the basket is washed and back home.' })
    public containedItems: Item[] = [];

    // --- DIRT / WATER VISUALS ---
    @property({ type: [Node], tooltip: 'Dirt visuals. Faded out when the basket lands in the water.' })
    public dirtNodes: Node[] = [];

    @property({ min: 0, tooltip: 'Dirt fade-out duration in seconds.' })
    public dirtFadeDuration = 0.35;

    @property({ type: [Node], tooltip: 'Water visuals. Turned on in the basin, then faded one step per dip.' })
    public waterNodes: Node[] = [];

    @property({ min: 0, tooltip: 'Water fade-in duration in the basin. 0 = show instantly.' })
    public waterFadeInDuration = 0.25;

    // --- DIPPING ---
    @property({ min: 1, tooltip: 'Taps that dip the basket. The tap after the last one sends it back home.' })
    public requiredDips = 3;

    @property({ type: Vec3, tooltip: 'Local offset of one dip (usually downwards, into the water).' })
    public dipOffset = new Vec3(0, -40, 0);

    @property({ min: 0.01, tooltip: 'Duration of the downwards part of a dip.' })
    public dipDownDuration = 0.12;

    @property({ min: 0.01, tooltip: 'Duration of the upwards part of a dip.' })
    public dipUpDuration = 0.2;

    @property({ type: Vec3, tooltip: 'Scale offset applied while the basket is pushed under water (squash).' })
    public dipSquashScale = new Vec3(0.06, -0.06, 0);

    @property({ tooltip: 'Spawn a water splash on every dip.' })
    public spawnSplashOnDip = true;

    // --- EVENTS ---
    @property({ type: Ply_Event, tooltip: 'Triggered once the basket has landed in the water.' })
    public onEnteredSink: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered on every dip.' })
    public onDip: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered after the last dip, while the basket is still in the basin.' })
    public onWashed: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered once the basket is back home and its food is unlocked.' })
    public onReturnedHome: Ply_Event = new Ply_Event();

    private isInSink = false;
    private isMoving = false;
    private isReturningHome = false;
    private dipCount = 0;
    private readonly sinkRestPosition = new Vec3();
    private readonly baseScale = new Vec3(1, 1, 1);

    private readonly onDropSuccess = (target?: Node): void => this.OnDropSuccess(target ?? null);
    private readonly onClick = (): void => this.OnClick();
    private readonly onReturnComplete = (): void => this.OnReturnedHome();
    private readonly onMoveComplete = (): void => this.OnArrivedInSink();

    public get IsInSink(): boolean {
        return this.isInSink;
    }

    public get DipCount(): number {
        return this.dipCount;
    }

    /** Where the basket lands inside the basin. */
    public get DropPoint(): Node | null {
        if (this.waterTarget?.isValid) return this.waterTarget;
        return this.sink?.isValid ? this.sink.node : null;
    }

    /** The basket may only go into a sink that already holds water and is free. */
    public CanEnterSink(): boolean {
        return !!this.sink?.isValid && this.sink.isWaterIn && !this.sink.IsLocked;
    }

    protected onLoad(): void {
        super.onLoad();
        Vec3.copy(this.baseScale, this.node.scale);

        // The sink reports ItemType.None while it has no water, so the hand
        // tutorial must check the target type before pointing at it.
        this.requireMatchingTargetTypeForHandTut = true;

        this.LockContainedItems();
        this.SetWaterNodesActive(false);
        // Tapping the basket only does something once it floats in the basin.
        this.DisableItemClickable();
        this.RefreshDropTarget();
    }

    protected onEnable(): void {
        this.cacheComponents();

        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onReturnComplete);
        this.itemDraggable?.onReturnToStartComplete.addListener(this.onReturnComplete);
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemClickable?.onClick.addListener(this.onClick);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onReturnComplete);
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    protected update(): void {
        // The basin fills and drains while the player works, so keep the drop
        // target in sync: an empty sink must reject the basket.
        if (this.isInSink || this.isMoving || this.isDone) return;
        this.RefreshDropTarget();
    }

    // =========================================================
    // 1. DRAG INTO THE SINK
    // =========================================================

    /** Accepts the sink as a drop target only while it holds water and is free. */
    private RefreshDropTarget(): void {
        if (!this.itemDraggable) return;

        const wantedType = this.CanEnterSink() ? this.sink!.UnlockedItemType : ItemType.None;
        if (this.itemDraggable.targetItemType !== wantedType) {
            this.itemDraggable.targetItemType = wantedType;
        }

        const dropPoint = this.DropPoint;
        if (this.itemMoveToTarget && dropPoint && this.itemMoveToTarget.defaultTarget !== dropPoint) {
            this.itemMoveToTarget.defaultTarget = dropPoint;
        }
    }

    private OnDropSuccess(_target: Node | null): void {
        if (this.isInSink || this.isMoving) return;

        // The basin can have drained between the drag start and the release.
        if (!this.CanEnterSink()) {
            this.itemDraggable?.ReturnToStart(true);
            return;
        }

        this.MoveToSink();
    }

    /** Sends the basket into the basin. Also callable from a Ply_Event. */
    public MoveToSink(): void {
        if (this.isInSink || this.isMoving) return;

        const dropPoint = this.DropPoint;
        this.isMoving = true;
        this.DisableItemDraggable();

        if (!this.itemMoveToTarget || !dropPoint) {
            this.OnArrivedInSink();
            return;
        }
        this.itemMoveToTarget.ExecuteMove2D(dropPoint);
    }

    // =========================================================
    // 2. IN THE BASIN
    // =========================================================

    private OnArrivedInSink(): void {
        this.isMoving = false;
        if (this.isInSink) return;
        this.isInSink = true;
        this.onProcess = true;

        // Resting transform the dips bounce around. Read it after the move
        // reparented the basket to its landing point.
        Vec3.copy(this.sinkRestPosition, this.node.position);
        Vec3.copy(this.baseScale, this.node.scale);

        // Nothing else may be dropped in while the basket occupies the basin.
        this.sink?.SetLocked(true);
        this.PlayEnterSplash();

        for (const dirt of this.dirtNodes) {
            this.FadeNode(dirt, 0, this.dirtFadeDuration);
        }

        this.SetWaterNodesActive(true);
        for (const water of this.waterNodes) {
            this.FadeNode(water, 255, this.waterFadeInDuration, 0);
        }

        this.DisableItemDraggable();
        this.EnableItemClickable();
        this.onEnteredSink.invoke();
    }

    private OnClick(): void {
        if (!this.isInSink || this.isReturningHome) return;

        // The tap after the last dip takes the basket back out.
        if (this.dipCount >= this.requiredDips) {
            this.ReturnHome();
            return;
        }

        this.dipCount++;
        this.Dip();
        this.FadeWaterToCurrentStep();
        this.onDip.invoke();

        if (this.dipCount >= this.requiredDips) this.onWashed.invoke();
    }

    /** Pushes the basket under water and lets it bounce back up. */
    private Dip(): void {
        Tween.stopAllByTarget(this.node);
        Ply_SoundManager.Ins?.PlayFx(FxType.FoodToWater);
        if (this.spawnSplashOnDip) this.SpawnSplash();

        const downPosition = new Vec3(
            this.sinkRestPosition.x + this.dipOffset.x,
            this.sinkRestPosition.y + this.dipOffset.y,
            this.sinkRestPosition.z + this.dipOffset.z,
        );
        const squashScale = new Vec3(
            this.baseScale.x + this.dipSquashScale.x,
            this.baseScale.y + this.dipSquashScale.y,
            this.baseScale.z + this.dipSquashScale.z,
        );

        tween(this.node)
            .to(this.dipDownDuration, { position: downPosition, scale: squashScale }, { easing: 'sineIn' })
            .to(this.dipUpDuration, { position: this.sinkRestPosition.clone(), scale: this.baseScale.clone() }, { easing: 'backOut' })
            .start();
    }

    /** One dip = one step of water gone; the last dip leaves nothing. */
    private FadeWaterToCurrentStep(): void {
        const remaining = math.clamp01(1 - this.dipCount / this.requiredDips);
        const targetOpacity = Math.round(255 * remaining);
        const duration = this.dipDownDuration + this.dipUpDuration;

        for (const water of this.waterNodes) {
            this.FadeNode(water, targetOpacity, duration);
        }
    }

    // =========================================================
    // 3. BACK HOME
    // =========================================================

    /** Sends the basket back to where it was before it went into the sink. */
    public ReturnHome(): void {
        if (this.isReturningHome || !this.isInSink) return;
        this.isReturningHome = true;
        this.DisableItemClickable();

        // Cancel a dip still in flight so the basket leaves from its rest pose.
        Tween.stopAllByTarget(this.node);
        this.node.setPosition(this.sinkRestPosition);
        this.node.setScale(this.baseScale);

        if (!this.itemDraggable) {
            this.OnReturnedHome();
            return;
        }

        // ItemDraggable still holds the position the basket was dragged from,
        // which is exactly "where it was before it moved into the sink".
        this.itemDraggable.ReturnToStart(false, false);
    }

    private OnReturnedHome(): void {
        // onReturnToStartComplete also fires on an ordinary failed drop.
        if (!this.isReturningHome) return;
        this.isReturningHome = false;
        this.isInSink = false;
        this.onProcess = false;

        this.sink?.SetLocked(false);
        this.UnlockContainedItems();

        this.DisableItemDraggable();
        this.DisableItemClickable();
        this.ItemDone();
        this.onReturnedHome.invoke();
    }

    // =========================================================
    // CONTAINED FOOD
    // =========================================================

    public LockContainedItems(): void {
        for (const item of this.containedItems) {
            if (!item?.isValid) continue;
            item.DisableItemDraggable();
        }
    }

    public UnlockContainedItems(): void {
        for (const item of this.containedItems) {
            if (!item?.isValid) continue;
            item.EnableItemDraggable();
        }
    }

    // =========================================================
    // HELPERS
    // =========================================================

    private SetWaterNodesActive(isActive: boolean): void {
        for (const water of this.waterNodes) {
            if (!water?.isValid) continue;
            water.active = isActive;
        }
    }

    private PlayEnterSplash(): void {
        Ply_SoundManager.Ins?.PlayFx(FxType.FoodToWater);
        this.SpawnSplash();
    }

    private SpawnSplash(): void {
        const splashParent = this.sink?.waterSplashPos;
        const dropPoint = this.DropPoint;
        if (!splashParent?.isValid || !dropPoint?.isValid) return;

        const splash = World.instance?.poolManager?.spawnType<WaterSplash>(
            PoolType.WaterSplash,
            dropPoint.worldPosition,
        );
        if (!splash) return;

        splash.node.setParent(splashParent);
        splash.node.setWorldPosition(dropPoint.worldPosition);
        splash.Play(1);
    }

    /**
     * Tweens a node's UIOpacity. `from` < 0 keeps the current opacity as the
     * start value; a node faded to 0 is deactivated once it arrives.
     */
    private FadeNode(target: Node | null, to: number, duration: number, from: number = -1): void {
        if (!target?.isValid) return;

        const opacity = target.getComponent(UIOpacity) ?? target.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        if (from >= 0) opacity.opacity = from;

        if (duration <= 0) {
            opacity.opacity = to;
            target.active = to > 0;
            return;
        }

        target.active = true;
        tween(opacity)
            .to(duration, { opacity: to }, { easing: 'sineOut' })
            .call(() => { if (to <= 0) target.active = false; })
            .start();
    }
}
