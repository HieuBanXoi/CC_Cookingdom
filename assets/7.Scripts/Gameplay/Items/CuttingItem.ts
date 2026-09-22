import { _decorator, Node, Vec3, tween, Tween, Enum } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { CuttingBoard } from './CuttingBoard';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Trash, ITrashOwner } from './Trash';
import { Plate } from './Plate';

const { ccclass, property } = _decorator;

export enum CuttingMoveDestination {
    CuttingBoard = 0,
    Plate = 1
}
Enum(CuttingMoveDestination);

export enum PlateTargetMode {
    /** One landing point (plateTarget) on a shared plate Item. */
    FixedPlateTarget = 0,
    /** The food lands on any free Plate of plateTargets; the one it is dropped on wins. */
    PlateList = 1
}
Enum(PlateTargetMode);

/**
 * A food item that goes straight to the cutting board, gets cut, then jumps
 * to the plate. Same flow as InWaterItem without the sink / water phase.
 */
@ccclass('CuttingItem')
export class CuttingItem extends Item implements ITrashOwner {

    @property({ type: Node, tooltip: 'Cutting board target node' })
    public cuttingBoardTarget: Node = null!;

    @property({ type: Enum(PlateTargetMode), tooltip: 'FixedPlateTarget: land on plateTarget. PlateList: land on whichever free Plate of plateTargets the food is dropped on.' })
    public plateTargetMode: PlateTargetMode = PlateTargetMode.FixedPlateTarget;

    @property({ type: Node, tooltip: '[FixedPlateTarget] Plate landing point. Can be a plain node: several items may share one plate but land on different points.' })
    public plateTarget: Node = null!;

    @property({ type: [Plate], tooltip: '[PlateList] Plates this food may land on (one food per plate). All must have itemType = plateTargetItemType and a UITransform covering the drop area.' })
    public plateTargets: Plate[] = [];

    @property({ type: Enum(ItemType), tooltip: 'ItemType accepted as the plate drop target (the shared plate Item), independent of plateTarget.' })
    public plateTargetItemType: ItemType = ItemType.Plate;

    @property({ type: [Node], tooltip: 'Child objects attached to this item' })
    public childObject: Node[] = [];

    @property({ type: [Trash], tooltip: 'Trash attached to this item. Locked until CanTrashDrag(); the board is released only once all are cleared.' })
    public trashObj: Trash[] = [];

    @property({ tooltip: 'Is item currently on cutting board' })
    public isOnCuttingBoard: boolean = false;

    @property({ tooltip: 'Is item currently on plate' })
    public isOnPlate: boolean = false;

    @property({ tooltip: 'Has cutting phase completed' })
    public isCutDone: boolean = false;

    // --- JUMP TO PLATE ---
    @property({ min: 0, tooltip: 'Jump arc power' })
    public jumpToPlatePower: number = 120;

    @property({ min: 0, tooltip: 'Jump duration in seconds' })
    public jumpToPlateDuration: number = 0.5;

    @property({ tooltip: 'Automatically allow dragging to the plate after cutting is done' })
    public jumpToPlateAfterCutDone: boolean = true;

    @property({ type: Node, tooltip: 'Food shadow on plate' })
    public plateFoodShadow: Node | null = null;

    @property({ tooltip: 'Punch scale offset on plate' })
    public platePunchScale: Vec3 = new Vec3(0.1, -0.1, 0);

    @property({ min: 0, tooltip: 'Punch duration on plate in seconds' })
    public platePunchDuration: number = 0.3;

    // --- EVENTS ---
    private plateStepCounted: boolean = false;

    @property({ type: Ply_Event, tooltip: 'Triggered when move to cutting board is complete' })
    public onMoveToCuttingBoardComplete: Ply_Event = new Ply_Event();

    protected isMoving: boolean = false;
    private initialized: boolean = false;
    private moveDestination: CuttingMoveDestination = CuttingMoveDestination.CuttingBoard;
    /** [PlateList] The plate this food is flying to / sitting on. */
    private currentPlate: Plate | null = null;
    private readonly handleDropSuccess = (target?: Node): void => this.OnDropSuccessMovement(target || null);

    public get CurrentPlate(): Plate | null {
        return this.currentPlate;
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
    }

    protected onDisable(): void {
        this.UnsubscribeMovementEvents();
    }

    protected update(dt: number): void {
        if (this.isMoving) return;

        // Do not update target position if dragging or returning to start
        if (this.itemDraggable && (this.itemDraggable.IsDragging || this.itemDraggable.IsReturningToStart)) {
            return;
        }

        if (this.isOnPlate) {
            const plateTarget = this.GetPlateTargetNode();
            if (plateTarget && plateTarget.isValid) {
                this.node.setWorldPosition(plateTarget.worldPosition);
            }
        } else if (this.isOnCuttingBoard && this.cuttingBoardTarget && this.cuttingBoardTarget.isValid) {
            this.node.setWorldPosition(this.cuttingBoardTarget.worldPosition);
        }

        // Waiting to be dragged to a plate: other foods may take plates in the
        // meantime, so keep the hand-tut target on a plate that is still free.
        if (this.isCutDone && !this.isOnPlate && this.plateTargetMode === PlateTargetMode.PlateList) {
            this.RefreshPlateHandTutTarget();
        }
    }

    // =========================================================
    // GAMEPLAY STATE TRANSITIONS
    // =========================================================

    public override CutDone(): void {
        this.InitializeMovement();
        if (!this.isOnCuttingBoard || this.isOnPlate || this.isMoving || this.isCutDone) return;

        this.itemType = ItemType.None;
        this.isCutDone = true;

        if (this.itemClickable) {
            this.itemClickable.enabled = false;
        }

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

    public MoveToCurrentTarget(): void {
        this.InitializeMovement();
        if (this.isMoving || !this.itemMoveToTarget) return;

        this.moveDestination = this.GetNextDestination();

        // [PlateList] No plate chosen by a drop (e.g. called from an Inspector
        // event): take the first free one.
        if (this.moveDestination === CuttingMoveDestination.Plate
            && this.plateTargetMode === PlateTargetMode.PlateList
            && !this.currentPlate?.isValid) {
            this.currentPlate = this.GetFirstFreePlate();
        }

        const destination = this.GetDestinationTarget(this.moveDestination);
        if (!destination) {
            console.warn(`[CuttingItem] ${this.node.name} is missing the ${this.moveDestination} target.`);
            return;
        }

        // Reserve the plate right away so no other food picks it while this one is flying.
        if (this.moveDestination === CuttingMoveDestination.Plate) {
            this.currentPlate?.IsFoodOn(true);
        }

        this.isMoving = true;
        this.UpdateDragAvailability();
        this.itemMoveToTarget.ExecuteMove2D(destination);
    }

    /** Alias for Inspector bindings. */
    public MoveToCuttingBoard(): void {
        this.MoveToCurrentTarget();
    }

    protected OnMoveToCuttingBoard(): void {
        // Subclasses can override
    }

    public OnMoveToCuttingBoardComplete(): void {
        Tween.stopAllByTarget(this.node);
        if (this.cuttingBoardTarget && this.cuttingBoardTarget.isValid) {
            this.node.setWorldPosition(this.cuttingBoardTarget.worldPosition);
        }

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

        this.onMoveToCuttingBoardComplete?.invoke();
    }

    public OnMoveToPlateComplete(): void {
        this.TryReleaseCuttingBoard();

        this.isOnCuttingBoard = false;
        this.isOnPlate = true;
        this.onProcess = false;
        this.ItemDone();

        this.SetPlateFoodShadowActive(false);

        if (this.itemDraggable) {
            this.itemDraggable.returnTransform = this.GetPlateTargetNode()!;
            this.itemDraggable.targetItemType = ItemType.None;
            this.itemDraggable.enabled = false;
        }

        const punchNode = this.GetPlatePunchNode();
        if (punchNode && punchNode.isValid) {
            const plateScale = punchNode.scale.clone();
            const punchScale = new Vec3(
                plateScale.x + this.platePunchScale.x,
                plateScale.y + this.platePunchScale.y,
                plateScale.z + this.platePunchScale.z
            );
            tween(punchNode)
                .to(this.platePunchDuration * 0.5, { scale: punchScale }, { easing: 'sineOut' })
                .to(this.platePunchDuration * 0.5, { scale: plateScale }, { easing: 'sineIn' })
                .start();
        }

        this.SpawnHeart();

        // Landing on the plate completes the step once its trash is gone too.
        this.TryCountPlateStep();
    }

    // =========================================================
    // INITIALIZATION & EVENT BINDINGS
    // =========================================================

    protected InitializeMovement(): void {
        if (this.initialized) return;

        this.cacheComponents(true);
        this.initialized = true;

        // The board may be occupied (its Item reports None) when this item is
        // still in the pile, so the hand tutorial must check the target's type.
        this.requireMatchingTargetTypeForHandTut = true;

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
            this.itemDraggable.onDropSuccess.removeListener(this.handleDropSuccess);
            this.itemDraggable.onDropSuccess.addListener(this.handleDropSuccess);
        }

        if (this.itemMoveToTarget) {
            this.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.HandleMoveComplete, this);
            this.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.HandleMoveComplete, this);
        }
    }

    private UnsubscribeMovementEvents(): void {
        if (this.itemDraggable) {
            this.itemDraggable.onDropSuccess.removeListener(this.handleDropSuccess);
        }

        if (this.itemMoveToTarget) {
            this.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.HandleMoveComplete, this);
        }
    }

    private HandleMoveComplete(): void {
        this.isMoving = false;

        switch (this.moveDestination) {
            case CuttingMoveDestination.CuttingBoard:
                this.OnMoveToCuttingBoardComplete();
                break;
            default:
                this.OnMoveToPlateComplete();
                break;
        }

        this.UpdateDragAvailability();
    }

    /** Called after a successful drop. Subclasses may replace the normal movement. */
    protected OnDropSuccessMovement(target: Node | null): void {
        // [PlateList] The drop only matched by ItemType, so make sure the plate
        // is one of ours and still free before flying to it.
        if (this.plateTargetMode === PlateTargetMode.PlateList
            && this.GetNextDestination() === CuttingMoveDestination.Plate) {
            const plate = this.FindPlateInList(target);
            if (!plate) {
                this.itemDraggable?.ReturnToStart(true);
                return;
            }
            this.currentPlate = plate;
        }

        this.MoveToCurrentTarget();
    }

    // =========================================================
    // DESTINATIONS & TARGET HELPERS
    // =========================================================

    protected ConfigureNextTarget(): void {
        if (!this.itemDraggable || !this.itemMoveToTarget) return;

        const nextDestination = this.GetNextDestination();
        const nextTarget = this.GetDestinationTarget(nextDestination);

        if (nextDestination === CuttingMoveDestination.CuttingBoard) {
            // Always aim for the board. Its Item may report None while another
            // food occupies it, so do not copy its current itemType.
            this.itemDraggable.targetItemType = ItemType.CuttingBoard;
        } else {
            // Plate: the drop target is the shared plate Item; plateTarget is only the landing point.
            this.itemDraggable.targetItemType = this.plateTargetItemType;
        }

        if (nextTarget) {
            this.itemMoveToTarget.defaultTarget = nextTarget;
        }

        // Before reaching the board the item returns to wherever it was placed in the scene.
        if (this.isOnPlate) {
            this.itemDraggable.returnTransform = this.GetPlateTargetNode()!;
        } else if (this.isOnCuttingBoard) {
            this.itemDraggable.returnTransform = this.cuttingBoardTarget;
        }
    }

    private GetNextDestination(): CuttingMoveDestination {
        if (!this.isCutDone) return CuttingMoveDestination.CuttingBoard;
        return CuttingMoveDestination.Plate;
    }

    private GetDestinationTarget(destination: CuttingMoveDestination): Node | null {
        switch (destination) {
            case CuttingMoveDestination.CuttingBoard:
                return this.cuttingBoardTarget;
            case CuttingMoveDestination.Plate:
                return this.GetPlateTargetNode();
            default:
                return null;
        }
    }

    // --- PLATE TARGET (FixedPlateTarget / PlateList) ---

    /**
     * Landing point for the plate phase. FixedPlateTarget: plateTarget.
     * PlateList: the chosen plate, or the first free one while none is chosen
     * yet (used as the hand-tut target before the drop).
     */
    protected GetPlateTargetNode(): Node | null {
        if (this.plateTargetMode === PlateTargetMode.FixedPlateTarget) return this.plateTarget;

        const plate = this.currentPlate?.isValid ? this.currentPlate : this.GetFirstFreePlate();
        return plate ? plate.LandingPoint : null;
    }

    /** Node that punches when the food lands: the plate itself, never a bare landing point. */
    protected GetPlatePunchNode(): Node | null {
        if (this.plateTargetMode === PlateTargetMode.FixedPlateTarget) return this.plateTarget;
        return this.currentPlate?.isValid ? this.currentPlate.node : null;
    }

    protected GetFirstFreePlate(): Plate | null {
        for (const plate of this.plateTargets) {
            if (plate?.isValid && plate.IsFree) return plate;
        }
        return null;
    }

    /** The Plate of plateTargets the drop landed on, if it is still free. The drop target is the plate node itself or a child of it. */
    protected FindPlateInList(target: Node | null): Plate | null {
        let current: Node | null = target;
        while (current) {
            const plate = ComponentCache.get(current, Plate) || current.getComponent(Plate);
            if (plate) {
                return this.plateTargets.indexOf(plate) >= 0 && plate.IsFree ? plate : null;
            }
            current = current.parent;
        }
        return null;
    }

    /**
     * [PlateList] Keeps ItemMoveToTarget.defaultTarget (the hand-tut destination)
     * on a free plate: the current one stays while it is free, otherwise the
     * first free plate of the list takes over.
     */
    private RefreshPlateHandTutTarget(): void {
        if (!this.itemMoveToTarget || this.currentPlate?.isValid) return;

        const currentTargetPlate = this.FindPlateInList(this.itemMoveToTarget.defaultTarget);
        if (currentTargetPlate) return;

        const target = this.GetFirstFreePlate()?.LandingPoint ?? null;
        if (target) {
            this.itemMoveToTarget.defaultTarget = target;
        }
    }

    protected GetTargetItem(target: Node | null): Item | null {
        if (!target || !target.isValid) return null;
        const targetItem = ComponentCache.get(target, Item) || target.getComponent(Item);
        if (!targetItem) {
            console.warn(`[CuttingItem] Target ${target.name} needs an Item component to provide ItemType.`);
        }
        return targetItem;
    }

    protected UpdateDragAvailability(): void {
        if (!this.itemDraggable) return;

        this.itemDraggable.isDraggable = !this.isMoving
            && !this.isOnPlate
            && (!this.isOnCuttingBoard || this.isCutDone);
    }

    protected SetPlateFoodShadowActive(isActive: boolean): void {
        if (this.plateFoodShadow && this.plateFoodShadow.isValid) {
            this.plateFoodShadow.active = isActive;
        }
    }

    protected override GetEffectSpawnPosition(): Vec3 {
        const plateTarget = this.isOnPlate ? this.GetPlateTargetNode() : null;
        if (plateTarget && plateTarget.isValid) {
            return plateTarget.worldPosition.clone();
        }
        return super.GetEffectSpawnPosition();
    }

    // =========================================================
    // EXTERNAL HELPERS & UTILITIES
    // =========================================================

    public ResetChildRotate(): void {
        for (let i = 0; i < this.childObject.length; i++) {
            const child = this.childObject[i];
            if (child && child.isValid) {
                tween(child)
                    .to(0.1, { eulerAngles: new Vec3(0, 0, 0) })
                    .start();
            }
        }
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
        this.TryCountPlateStep();
    }

    /**
     * One gameplay step = the food is on its plate AND every trash it shed is
     * in the bin, whichever of the two happens last. Counted once.
     */
    protected TryCountPlateStep(): void {
        if (this.plateStepCounted || !this.isOnPlate || !this.IsAllTrashCleared()) return;
        this.plateStepCounted = true;
        this.DoOneStep();
    }

    /** The board is handed back to the next food only when this item is cut AND all its trash is gone. */
    protected TryReleaseCuttingBoard(): void {
        if (!this.isCutDone || !this.IsAllTrashCleared()) return;
        const cuttingBoard = this.GetTargetItem(this.cuttingBoardTarget) as CuttingBoard | null;
        cuttingBoard?.IsFoodOn(false);
    }
}
