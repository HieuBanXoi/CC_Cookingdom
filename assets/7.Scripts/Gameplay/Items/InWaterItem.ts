import { _decorator, Node, Vec3, tween, Tween, Enum } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { Sink } from './Sink';
import { CuttingBoard } from './CuttingBoard';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { Ply_TimerEvent } from '../../Core/Base/Ply_TimerEvent';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { HandTutManager } from '../../Managers/HandTutManager';
import { PhaseManager } from '../../Managers/PhaseManager';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { World } from '../../Managers/World';
import { PoolType } from '../../Core/Pool/PoolMember';
import { WaterSplash } from '../Effects/WaterSplash';
import { Trash, ITrashOwner } from './Trash';

const { ccclass, property } = _decorator;

export enum InWaterMoveDestination {
    Water = 0,
    CuttingBoard = 1,
    Plate = 2
}
Enum(InWaterMoveDestination);

@ccclass('InWaterItem')
export class InWaterItem extends Item implements ITrashOwner {

    @property({ type: Node, tooltip: 'Water position / anchor target' })
    public waterTarget: Node = null!;

    @property({ type: Node, tooltip: 'Cutting board target node' })
    public cuttingBoardTarget: Node = null!;

    @property({ type: Node, tooltip: 'Plate target node' })
    public plateTarget: Node = null!;

    @property({ type: [Node], tooltip: 'Child objects attached to this item' })
    public childObject: Node[] = [];

    @property({ type: [Trash], tooltip: 'Trash attached to this item. Locked until CanTrashDrag(); the board is released only once all are cleared.' })
    public trashObj: Trash[] = [];

    // --- DRAG FROM WATER ---
    @property({ type: Node, tooltip: 'Water ripple / splash effect node on drag' })
    public waterFx: Node = null!;

    @property({ tooltip: 'Scale item when dragged out of water' })
    public scaleOnDragFromWater: boolean = true;

    @property({ tooltip: 'Target scale when dragging from water' })
    public dragFromWaterScale: Vec3 = new Vec3(1, 1, 1);

    @property({ min: 0, tooltip: 'Scale transition duration in seconds' })
    public dragFromWaterScaleDuration: number = 0.2;

    // --- BOB EFFECT (Integrated directly into InWaterItem) ---
    @property({ tooltip: 'Enable water bobbing effect' })
    public enableBobEffect: boolean = true;

    @property({ tooltip: 'Bobbing offset vector (usually along Y axis)' })
    public bobOffset: Vec3 = new Vec3(0, 15, 0);

    @property({ min: 0.01, tooltip: 'Duration of one bob cycle in seconds' })
    public bobDuration: number = 0.6;

    @property({ tooltip: 'Play bob effect immediately on enable' })
    public playBobOnEnable: boolean = false;

    // --- TIMER & REFERENCES ---
    @property({ type: Ply_TimerEvent, tooltip: 'Timer event component reference' })
    public ply_TimerEvent: Ply_TimerEvent | null = null;

    @property({ type: Sink, tooltip: 'Sink reference' })
    public sink: Sink | null = null;

    @property({ tooltip: 'Is item currently inside water' })
    public isInWater: boolean = false;

    @property({ tooltip: 'Is item currently on cutting board' })
    public isOnCuttingBoard: boolean = false;

    @property({ tooltip: 'Is item currently on plate' })
    public isOnPlate: boolean = false;

    @property({ tooltip: 'Has item been cleaned in water' })
    public isClean: boolean = false;

    @property({ tooltip: 'Has cutting phase completed' })
    public isCutDone: boolean = false;

    // --- JUMP TO PLATE ---
    @property({ min: 0, tooltip: 'Jump arc power' })
    public jumpToPlatePower: number = 120;

    @property({ min: 0, tooltip: 'Jump duration in seconds' })
    public jumpToPlateDuration: number = 0.5;

    @property({ tooltip: 'Automatically jump to plate after cutting is done' })
    public jumpToPlateAfterCutDone: boolean = true;

    @property({ type: Node, tooltip: 'Food shadow on plate' })
    public plateFoodShadow: Node | null = null;

    @property({ tooltip: 'Punch scale offset on plate' })
    public platePunchScale: Vec3 = new Vec3(0.1, -0.1, 0);

    @property({ min: 0, tooltip: 'Punch duration on plate in seconds' })
    public platePunchDuration: number = 0.3;

    // --- EVENTS ---
    @property({ type: Ply_Event, tooltip: 'Triggered when move to cutting board is complete' })
    public onMoveToCuttingBoardComplete: Ply_Event = new Ply_Event();

    protected isMoving: boolean = false;
    private initialized: boolean = false;
    private moveDestination: InWaterMoveDestination = InWaterMoveDestination.Water;
    private waterDragOriginalScale: Vec3 = new Vec3(1, 1, 1);
    private wasInWaterOnDrag: boolean = false;
    private readonly handleBeginDragInWater = (): void => this.OnBeginDragInWater();
    private readonly handleDropSuccessInWater = (target?: Node): void => {
        this.OnDropSuccessInWater();
        this.OnDropSuccessMovement(target || null);
    };

    // Bob effect internal variables
    private startBobLocalPos: Vec3 = new Vec3(0, 0, 0);
    private bobTween: Tween<Node> | null = null;

    public get IsBobPlaying(): boolean {
        return this.bobTween !== null;
    }

    protected onLoad(): void {
        super.onLoad();
        this.InitializeMovement();
    }

    protected start(): void {
        this.InitializeMovement();
    }

    protected onEnable(): void {
        if (this.initialized) {
            this.SubscribeMovementEvents();
        }

        if (this.playBobOnEnable) {
            this.PlayBobEffect();
        }
    }

    protected onDisable(): void {
        this.UnsubscribeMovementEvents();
        this.StopBobEffect(false);
        this.SetWaterFxActive(false);
        this.wasInWaterOnDrag = false;
    }

    protected update(dt: number): void {
        if (this.isMoving) return;

        // Do not update target position if dragging or returning to start
        if (this.itemDraggable && (this.itemDraggable.IsDragging || this.itemDraggable.IsReturningToStart)) {
            return;
        }

        if (this.isOnPlate && this.plateTarget && this.plateTarget.isValid) {
            this.node.setWorldPosition(this.plateTarget.worldPosition);
        } else if (this.isOnCuttingBoard && this.cuttingBoardTarget && this.cuttingBoardTarget.isValid) {
            this.node.setWorldPosition(this.cuttingBoardTarget.worldPosition);
        }
    }

    // =========================================================
    // BOB EFFECT (Merged from Ply_BobEffect)
    // =========================================================

    public CacheBobStartPosition(): void {
        Vec3.copy(this.startBobLocalPos, this.node.position);
    }

    public PlayBobEffect(): void {
        if (!this.enableBobEffect) return;

        this.StopBobEffect(false);
        this.CacheBobStartPosition();

        const targetPos = new Vec3(
            this.startBobLocalPos.x + this.bobOffset.x,
            this.startBobLocalPos.y + this.bobOffset.y,
            this.startBobLocalPos.z + this.bobOffset.z
        );

        this.node.setPosition(this.startBobLocalPos);

        this.bobTween = tween(this.node)
            .to(this.bobDuration, { position: targetPos }, { easing: 'sineInOut' })
            .to(this.bobDuration, { position: this.startBobLocalPos }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    public StopBobEffect(resetPosition: boolean = true): void {
        if (this.bobTween) {
            this.bobTween.stop();
            this.bobTween = null;
        }

        if (resetPosition && this.node && this.node.isValid) {
            this.node.setPosition(this.startBobLocalPos);
        }
    }

    public PlayAnim(isTrue: boolean): void {
        if (!this.isInWater || this.isOnPlate) return;

        if (isTrue) {
            this.PlayBobEffect();
        } else {
            this.StopBobEffect();
        }
    }

    // =========================================================
    // WATER & TIMER CONTROLS
    // =========================================================

    public StartTimer(): void {
        if (this.sink && this.sink.isWaterIn && this.isInWater && !this.isOnPlate && !this.isClean) {
            this.ply_TimerEvent?.StartTimer();
        }
    }

    public StartWaterEffects(): void {
        if (!this.sink || !this.sink.isWaterIn || !this.isInWater || this.isOnPlate) return;

        this.PlayBobEffect();

        if (!this.isClean) {
            this.ply_TimerEvent?.StartTimer();
        }
    }

    public StopWaterEffects(): void {
        this.StopBobEffect();
        this.ply_TimerEvent?.StopTimer();
    }

    public override ShouldPlayBobEffectAfterReturn(): boolean {
        return this.isInWater && this.sink !== null && this.sink.isWaterIn;
    }

    public override OnDragFailReturnComplete(): void {
        super.OnDragFailReturnComplete();
        this.ResetWaterDragState(true);
        if (this.ShouldPlayBobEffectAfterReturn()) {
            this.PlayBobEffect();
        }
    }

    // =========================================================
    // GAMEPLAY STATE TRANSITIONS
    // =========================================================

    public SetClean(): void {
        this.InitializeMovement();
        this.isClean = true;
        this.isCutDone = false;
        this.ply_TimerEvent?.StopTimer();

        if (this.itemMoveToTarget) {
            this.itemMoveToTarget.scaleOnMove = true;
        }

        this.SpawnBlinkEffect();
        this.ConfigureNextTarget();
        this.SetCuttingBoardAsDefaultTarget();
    }

    public CutDone(): void {
        this.InitializeMovement();
        if (!this.isOnCuttingBoard || this.isOnPlate || this.isMoving || this.isCutDone) return;

        this.itemType = ItemType.None;
        this.isCutDone = true;
        // HandTutManager.Ins?.ItemDone(this.node);
        // PhaseManager.Ins?.DoOneStep();

        if (this.itemClickable) {
            this.itemClickable.enabled = false;
        }

        this.StopBobEffect(false);

        if (!this.jumpToPlateAfterCutDone) {
            this.TryReleaseCuttingBoard();
            return;
        }

        this.ConfigureNextTarget();
        this.UpdateDragAvailability();

        if (this.itemDraggable) {
            this.itemDraggable.enabled = true;
        }
    }

    public MoveToWater(): void {
        if (this.itemMoveToTarget) {
            this.itemMoveToTarget.rotate360DuringJump = false;
        }
        this.OnMoveIntoWaterComplete();
    }

    public MoveToCurrentTarget(): void {
        this.InitializeMovement();
        if (this.isMoving || !this.itemMoveToTarget) return;

        this.moveDestination = this.GetNextDestination();
        const destination = this.GetDestinationTarget(this.moveDestination);
        if (!destination) {
            console.warn(`[InWaterItem] ${this.node.name} is missing the ${this.moveDestination} target.`);
            return;
        }

        if (this.moveDestination === InWaterMoveDestination.CuttingBoard) {
            this.StopBobEffect(false);
        }

        this.isMoving = true;
        this.UpdateDragAvailability();
        this.itemMoveToTarget.ExecuteMove2D(destination);
    }

    protected OnMoveToCuttingBoard(): void {
        // Subclasses can override
    }

    public OnMoveIntoWaterComplete(): void {
        const wasInWater = this.isInWater;
        this.isInWater = true;
        this.isOnCuttingBoard = false;
        this.isOnPlate = false;
        this.onProcess = true;

        if (this.sink) {
            this.sink.RegisterInWaterItem(this);
            HandTutManager.Ins?.RegisterItemInWater(this);
            this.SetPlateFoodShadowActive(true);
            this.SpawnWaterSplashOnEnter(wasInWater);
            if (this.sink.isWaterIn) {
                this.StartWaterEffects();
            }
        }

        this.ConfigureNextTarget();
    }

    protected SpawnWaterSplashOnEnter(wasInWater: boolean): void {
        if (wasInWater || !this.sink || !this.sink.isWaterIn) return;

        Ply_SoundManager.Ins?.PlayFx(FxType.FoodToWater);

        const splashParent = this.sink.waterSplashPos;
        if (!splashParent?.isValid || !this.waterTarget?.isValid) return;

        const splash = World.instance?.poolManager?.spawnType<WaterSplash>(
            PoolType.WaterSplash,
            this.waterTarget.worldPosition,
        );
        if (!splash) return;

        splash.node.setParent(splashParent);
        splash.node.setWorldPosition(this.waterTarget.worldPosition);
        splash.Play(1);
    }

    public OnMoveToCuttingBoardComplete(): void {
        this.StopBobEffect(false);
        this.ply_TimerEvent?.StopTimer();
        this.sink?.UnregisterInWaterItem(this);
        HandTutManager.Ins?.UnregisterItemInWater(this);

        Tween.stopAllByTarget(this.node);
        if (this.cuttingBoardTarget && this.cuttingBoardTarget.isValid) {
            this.node.setWorldPosition(this.cuttingBoardTarget.worldPosition);
        }

        this.isInWater = false;
        this.isOnCuttingBoard = true;
        this.isOnPlate = false;
        this.onProcess = true;
        this.itemType = ItemType.FoodOnCuttingBoard;

        // On the board the food is often locked while it waits (for the knife,
        // for a tween...). Taps on it then are not mistakes: no break heart.
        this.DisableBreakHeartOnBlockedTap();

        this.OnMoveToCuttingBoard();

        const cuttingBoard = this.GetTargetItem(this.cuttingBoardTarget) as CuttingBoard | null;
        cuttingBoard?.IsFoodOn(true);
        cuttingBoard?.Punch();

        this.ConfigureNextTarget();

        if (this.itemDraggable) {
            this.itemDraggable.enabled = false;
        }

        this.ApplyDragFromWaterScale();
        this.onMoveToCuttingBoardComplete?.invoke();
    }

    public OnMoveToPlateComplete(): void {
        this.StopBobEffect(false);
        this.ply_TimerEvent?.StopTimer();
        this.sink?.UnregisterInWaterItem(this);
        HandTutManager.Ins?.UnregisterItemInWater(this);

        this.TryReleaseCuttingBoard();

        this.isInWater = false;
        this.isOnCuttingBoard = false;
        this.isOnPlate = true;
        this.onProcess = false;

        this.SetPlateFoodShadowActive(false);

        if (this.itemDraggable) {
            this.itemDraggable.returnTransform = this.plateTarget;
            this.itemDraggable.targetItemType = ItemType.None;
            this.itemDraggable.enabled = false;
        }

        if (this.plateTarget && this.plateTarget.isValid) {
            const plateScale = this.plateTarget.scale.clone();
            const punchScale = new Vec3(
                plateScale.x + this.platePunchScale.x,
                plateScale.y + this.platePunchScale.y,
                plateScale.z + this.platePunchScale.z
            );
            tween(this.plateTarget)
                .to(this.platePunchDuration * 0.5, { scale: punchScale }, { easing: 'sineOut' })
                .to(this.platePunchDuration * 0.5, { scale: plateScale }, { easing: 'sineIn' })
                .start();
        }

        this.SpawnHeart();
    }

    // =========================================================
    // INITIALIZATION & EVENT BINDINGS
    // =========================================================

    protected InitializeMovement(): void {
        if (this.initialized) return;

        this.cacheComponents(true);
        if (!this.ply_TimerEvent) {
            this.ply_TimerEvent = this.getComponent(Ply_TimerEvent) || this.getComponentInChildren(Ply_TimerEvent);
        }

        this.initialized = true;
        Vec3.copy(this.waterDragOriginalScale, this.node.scale);

        // Trash starts locked; CanTrashDrag() unlocks it later.
        for (const trash of this.trashObj) {
            if (!trash) continue;
            trash.owner = this;
            if (!trash.IsCleared) trash.DisableDrag();
        }

        this.SubscribeMovementEvents();
        this.ConfigureNextTarget();
        this.UpdateDragAvailability();
    }

    private SubscribeMovementEvents(): void {
        if (this.itemDraggable) {
            this.itemDraggable.onBeginDrag.removeListener(this.handleBeginDragInWater);
            this.itemDraggable.onDropSuccess.removeListener(this.handleDropSuccessInWater);

            this.itemDraggable.onBeginDrag.addListener(this.handleBeginDragInWater);
            this.itemDraggable.onDropSuccess.addListener(this.handleDropSuccessInWater);
        }

        if (this.itemMoveToTarget) {
            this.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.HandleMoveComplete, this);
            this.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.HandleMoveComplete, this);
        }
    }

    private UnsubscribeMovementEvents(): void {
        if (this.itemDraggable) {
            this.itemDraggable.onBeginDrag.removeListener(this.handleBeginDragInWater);
            this.itemDraggable.onDropSuccess.removeListener(this.handleDropSuccessInWater);
        }

        if (this.itemMoveToTarget) {
            this.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.HandleMoveComplete, this);
        }
    }

    private HandleMoveComplete(): void {
        this.isMoving = false;

        switch (this.moveDestination) {
            case InWaterMoveDestination.Water:
                this.OnMoveIntoWaterComplete();
                break;
            case InWaterMoveDestination.CuttingBoard:
                this.OnMoveToCuttingBoardComplete();
                break;
            default:
                this.OnMoveToPlateComplete();
                break;
        }

        this.UpdateDragAvailability();
    }

    // =========================================================
    // DRAG FROM WATER HANDLERS
    // =========================================================

    private OnBeginDragInWater(): void {
        this.wasInWaterOnDrag = this.isInWater;
        if (!this.wasInWaterOnDrag) return;

        // The item must stay still while the player is dragging it. Its bob
        // effect is restarted only after a failed drop returns it to water.
        // ItemDraggable has already reparented this node, so resetting the
        // cached local bob position would cause a visible drag offset.
        this.StopBobEffect(false);

        Vec3.copy(this.waterDragOriginalScale, this.node.scale);

        if (this.scaleOnDragFromWater) {
            tween(this.node)
                .to(this.dragFromWaterScaleDuration, { scale: this.dragFromWaterScale }, { easing: 'sineOut' })
                .start();
        }

        this.SetWaterFxActive(true);
    }

    private OnDropSuccessInWater(): void {
        this.ResetWaterDragState(false);
    }

    /** Called after a successful drop. Subclasses may replace the normal movement. */
    protected OnDropSuccessMovement(_target: Node | null): void {
        this.MoveToCurrentTarget();
    }

    private ResetWaterDragState(restoreScale: boolean): void {
        if (!this.wasInWaterOnDrag) return;

        if (!this.scaleOnDragFromWater) {
            this.SetWaterFxActive(false);
            this.wasInWaterOnDrag = false;
            return;
        }

        if (restoreScale) {
            tween(this.node)
                .to(this.dragFromWaterScaleDuration, { scale: this.waterDragOriginalScale }, { easing: 'sineOut' })
                .start();
        } else {
            this.node.setScale(this.dragFromWaterScale);
        }

        this.SetWaterFxActive(false);
        this.wasInWaterOnDrag = false;
    }

    private SetWaterFxActive(isActive: boolean): void {
        if (this.waterFx && this.waterFx.isValid) {
            this.waterFx.active = isActive;
        }
    }

    private ApplyDragFromWaterScale(): void {
        if (this.scaleOnDragFromWater) {
            this.node.setScale(this.dragFromWaterScale);
        }
    }

    // =========================================================
    // DESTINATIONS & TARGET HELPERS
    // =========================================================

    protected ConfigureNextTarget(): void {
        if (!this.itemDraggable || !this.itemMoveToTarget) return;

        if (this.isInWater && !this.isClean) {
            this.itemDraggable.targetItemType = ItemType.None;
            this.itemDraggable.returnTransform = this.waterTarget;
            this.itemMoveToTarget.defaultTarget = null!;
            return;
        }

        const nextDestination = this.GetNextDestination();
        const nextTarget = this.GetDestinationTarget(nextDestination);
        const targetItem = nextDestination === InWaterMoveDestination.Water
            ? this.sink
            : this.GetTargetItem(nextTarget);

        if (targetItem) {
            this.itemDraggable.targetItemType = targetItem.itemType;
        } else if (nextDestination === InWaterMoveDestination.Water) {
            console.warn(`[InWaterItem] ${this.node.name} needs a Sink reference to use as its initial drop target.`);
        }

        if (nextTarget) {
            this.itemMoveToTarget.defaultTarget = nextTarget;
        }

        if (this.isOnPlate) {
            this.itemDraggable.returnTransform = this.plateTarget;
        } else if (this.isOnCuttingBoard) {
            this.itemDraggable.returnTransform = this.cuttingBoardTarget;
        } else if (this.isInWater) {
            this.itemDraggable.returnTransform = this.waterTarget;
        }
    }

    private GetNextDestination(): InWaterMoveDestination {
        if (!this.isClean) return InWaterMoveDestination.Water;
        if (!this.isCutDone) return InWaterMoveDestination.CuttingBoard;
        return InWaterMoveDestination.Plate;
    }

    private GetDestinationTarget(destination: InWaterMoveDestination): Node | null {
        switch (destination) {
            case InWaterMoveDestination.Water:
                return this.waterTarget;
            case InWaterMoveDestination.CuttingBoard:
                return this.cuttingBoardTarget;
            case InWaterMoveDestination.Plate:
                return this.plateTarget;
            default:
                return null;
        }
    }

    protected GetTargetItem(target: Node | null): Item | null {
        if (!target || !target.isValid) return null;
        const targetItem = ComponentCache.get(target, Item) || target.getComponent(Item);
        if (!targetItem) {
            console.warn(`[InWaterItem] Target ${target.name} needs an Item component to provide ItemType.`);
        }
        return targetItem;
    }

    protected UpdateDragAvailability(): void {
        if (!this.itemDraggable) return;

        this.itemDraggable.isDraggable = !this.isMoving
            && !this.isOnPlate
            && (!this.isOnCuttingBoard || this.isCutDone);
    }

    private SetCuttingBoardAsDefaultTarget(): void {
        if (this.itemMoveToTarget && this.cuttingBoardTarget) {
            this.itemMoveToTarget.defaultTarget = this.cuttingBoardTarget;
        }

        if (this.itemDraggable && this.cuttingBoardTarget) {
            const cuttingBoardItem = this.GetTargetItem(this.cuttingBoardTarget);
            if (cuttingBoardItem) {
                this.itemDraggable.targetItemType = cuttingBoardItem.itemType;
            }
        }
    }

    protected SetPlateFoodShadowActive(isActive: boolean): void {
        if (this.plateFoodShadow && this.plateFoodShadow.isValid) {
            this.plateFoodShadow.active = isActive;
        }
    }

    protected override GetEffectSpawnPosition(): Vec3 {
        if (this.isOnPlate && this.plateTarget && this.plateTarget.isValid) {
            return this.plateTarget.worldPosition.clone();
        }
        return super.GetEffectSpawnPosition();
    }

    // =========================================================
    // EXTERNAL HELPERS & UTILITIES
    // =========================================================

    public ResetChildRotate(): void {
        if (this.childObject && this.childObject.length > 0) {
            for (let i = 0; i < this.childObject.length; i++) {
                const child = this.childObject[i];
                if (child && child.isValid) {
                    tween(child)
                        .to(0.1, { eulerAngles: new Vec3(0, 0, 0) })
                        .start();
                }
            }
        }
    }

    public EnableKnife(): void {
        this.knife.active = true;
        Ply_SoundManager.Ins?.PlayFx(FxType.KnifePlace);
    }

    

    /** Unlocks every attached Trash so the player can throw it into the TrashBin. */
    public CanTrashDrag(): void {
        for (const trash of this.trashObj) {
            if (!trash?.isValid) continue;
            trash.owner = this;
            trash.EnableDrag();
        }
    }

    public IsAllTrashCleared(): boolean {
        for (const trash of this.trashObj) {
            if (trash?.isValid && !trash.IsCleared) return false;
        }
        return true;
    }

    /** ITrashOwner: a trash landed in the bin. */
    public OnTrashCleared(_trash: Trash): void {
        this.TryReleaseCuttingBoard();
    }

    /** The board is handed back to the next food only when this item is cut AND all its trash is gone. */
    protected TryReleaseCuttingBoard(): void {
        if (!this.isCutDone || !this.IsAllTrashCleared()) return;
        const cuttingBoard = this.GetTargetItem(this.cuttingBoardTarget) as CuttingBoard | null;
        cuttingBoard?.IsFoodOn(false);
    }

    /** Kept for existing scene bindings. The knife reference now lives on Item. */
    public CanKnifeCut(): void {
        this.EnableKnife();
    }
}
