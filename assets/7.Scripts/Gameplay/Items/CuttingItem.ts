import { _decorator, Node, Vec3, tween, Tween, Enum } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { CuttingBoard } from './CuttingBoard';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { ComponentCache } from '../../Core/Base/CacheComponent';

const { ccclass, property } = _decorator;

export enum CuttingMoveDestination {
    CuttingBoard = 0,
    Plate = 1
}
Enum(CuttingMoveDestination);

/**
 * A food item that goes straight to the cutting board, gets cut, then jumps
 * to the plate. Same flow as InWaterItem without the sink / water phase.
 */
@ccclass('CuttingItem')
export class CuttingItem extends Item {

    @property({ type: Node, tooltip: 'Cutting board target node' })
    public cuttingBoardTarget: Node = null!;

    @property({ type: Node, tooltip: 'Plate target node' })
    public plateTarget: Node = null!;

    @property({ type: [Node], tooltip: 'Child objects attached to this item' })
    public childObject: Node[] = [];

    @property({ type: [Node], tooltip: 'Trash / waste objects attached to this item' })
    public trashObj: Node[] = [];

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
    @property({ type: Ply_Event, tooltip: 'Triggered when move to cutting board is complete' })
    public onMoveToCuttingBoardComplete: Ply_Event = new Ply_Event();

    protected isMoving: boolean = false;
    private initialized: boolean = false;
    private moveDestination: CuttingMoveDestination = CuttingMoveDestination.CuttingBoard;
    private readonly handleDropSuccess = (target?: Node): void => this.OnDropSuccessMovement(target || null);

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

        if (this.isOnPlate && this.plateTarget && this.plateTarget.isValid) {
            this.node.setWorldPosition(this.plateTarget.worldPosition);
        } else if (this.isOnCuttingBoard && this.cuttingBoardTarget && this.cuttingBoardTarget.isValid) {
            this.node.setWorldPosition(this.cuttingBoardTarget.worldPosition);
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
            const cuttingBoard = this.GetTargetItem(this.cuttingBoardTarget) as CuttingBoard | null;
            cuttingBoard?.IsFoodOn(false);
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
        const destination = this.GetDestinationTarget(this.moveDestination);
        if (!destination) {
            console.warn(`[CuttingItem] ${this.node.name} is missing the ${this.moveDestination} target.`);
            return;
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
        const cuttingBoard = this.GetTargetItem(this.cuttingBoardTarget) as CuttingBoard | null;
        cuttingBoard?.IsFoodOn(false);

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
        this.initialized = true;

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
    protected OnDropSuccessMovement(_target: Node | null): void {
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
            // Plate: use its Item type when present, otherwise ItemType.Plate.
            const targetItem = this.GetTargetItem(nextTarget);
            this.itemDraggable.targetItemType = targetItem ? targetItem.itemType : ItemType.Plate;
        }

        if (nextTarget) {
            this.itemMoveToTarget.defaultTarget = nextTarget;
        }

        // Before reaching the board the item returns to wherever it was placed in the scene.
        if (this.isOnPlate) {
            this.itemDraggable.returnTransform = this.plateTarget;
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
                return this.plateTarget;
            default:
                return null;
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
        if (this.isOnPlate && this.plateTarget && this.plateTarget.isValid) {
            return this.plateTarget.worldPosition.clone();
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

    public CanTrashDrag(): void {
        for (let i = 0; i < this.trashObj.length; i++) {
            const trash = this.trashObj[i];
            if (trash && trash.isValid) {
                trash.active = true;
            }
        }
    }
}
