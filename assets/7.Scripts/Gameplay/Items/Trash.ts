import { _decorator, Node } from 'cc';
import { Item, HandTutHint } from './Item';
import { TrashBin } from './TrashBin';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { HandTutManager } from '../../Managers/HandTutManager';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/** Anything that must be cleared from a food or item before it can continue. */
export interface ITrashOwner {
    OnTrashCleared(trash: Trash): void;
}

/**
 * Waste attached to a CuttingItem. Locked until EnableDrag(); dragging it
 * raises the TrashBin, a successful drop throws it in and clears it.
 */
@ccclass('Trash')
export class Trash extends Item {
    @property({ type: TrashBin, tooltip: 'Bin this trash is thrown into.' })
    public trashBin: TrashBin | null = null;

    @property({ tooltip: 'Deactivate this node after it lands in the bin.' })
    public deactivateWhenCleared = true;

    @property({ tooltip: 'On EnableDrag(), detach this trash from its parent (the food) so it stays put when the food moves on.' })
    public detachOnEnableDrag = true;

    @property({ type: Node, tooltip: 'Parent to move to when detaching. Defaults to the grandparent, placed right above the food in draw order.' })
    public detachParent: Node | null = null;

    @property({ type: Ply_Event, tooltip: 'Triggered once the trash landed in the bin.' })
    public onCleared: Ply_Event = new Ply_Event();

    /** Set by the owning CuttingItem so it can track its remaining trash. */
    public owner: ITrashOwner | null = null;

    private isCleared = false;
    private isThrowing = false;
    private isUnlocked = false;
    private binShownByHint = false;

    private readonly onBeginDrag = (): void => this.trashBin?.Show();
    private readonly onDropFail = (): void => this.trashBin?.Hide();
    private readonly onDropSuccess = (target?: Node): void => this.ThrowInto(target ?? null);
    private readonly onMoveComplete = (): void => this.OnLanded();

    public get IsCleared(): boolean {
        return this.isCleared;
    }

    protected onLoad(): void {
        super.onLoad();
        this.ConfigureTarget();
        // Locked until the owner calls EnableDrag(). Disabled (not just
        // isDraggable=false) so touches still reach a clickable food underneath.
        this.DisableItemDraggable();
        // Trash sits on a food on the board; tapping it while locked is just
        // the player waiting, not a mistake.
        this.DisableBreakHeartOnBlockedTap();
    }

    protected onEnable(): void {
        this.cacheComponents();
        // Stay locked until EnableDrag() even if the node was toggled on later.
        if (!this.isUnlocked) this.DisableItemDraggable();
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onDropFail);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    /** Makes the trash draggable and registers it for the hand tutorial. */
    public EnableDrag(): void {
        if (this.isCleared) return;
        this.isUnlocked = true;
        this.node.active = true;
        if (this.detachOnEnableDrag) this.DetachFromParent();
        this.ConfigureTarget();
        this.EnableItemDraggable();
        this.onProcess = true;
    }

    /** The trash -> bin hint belongs to the food this trash came off (no-delay follows the owner). */
    public override GetHandTutRelatedItem(): Item | null {
        const owner = this.owner as unknown;
        return owner instanceof Item && owner.isValid ? owner : null;
    }

    /** Drag hint towards the bin's shown position (the bin itself sits hidden below the screen). */
    public override GetHandTutHint(): HandTutHint | null {
        if (!this.isUnlocked || this.isCleared || this.isThrowing || !this.trashBin) return null;
        if (!this.itemDraggable?.enabled || !this.itemDraggable.CanDrag()) return null;
        return { kind: 'drag', from: this.node.worldPosition.clone(), to: this.trashBin.GetShownWorldPosition() };
    }

    /** Raise the bin while the hand points at it so the player sees where the trash goes. */
    public override OnHandTutShown(): void {
        if (this.binShownByHint || !this.trashBin) return;
        this.binShownByHint = true;
        this.trashBin.Show();
    }

    public override OnHandTutHidden(): void {
        if (!this.binShownByHint) return;
        // The hand hides on touch start, before ItemDraggable.BeginDrag runs.
        // Wait a frame so a drag on this trash keeps the bin up (its own Show()).
        this.scheduleOnce(() => {
            if (!this.binShownByHint) return;
            this.binShownByHint = false;
            this.trashBin?.Hide();
        }, 0);
    }

    public DisableDrag(): void {
        this.isUnlocked = false;
        this.DisableItemDraggable();
    }

    /** Reparents while keeping the world transform; new parent is detachParent or the grandparent. */
    public DetachFromParent(): void {
        const oldParent = this.node.parent;
        if (!oldParent) return;
        const newParent = this.detachParent ?? oldParent.parent;
        if (!newParent || newParent === oldParent) return;

        const worldPos = this.node.worldPosition.clone();
        const worldScale = this.node.worldScale.clone();
        const worldRot = this.node.worldRotation.clone();

        this.node.setParent(newParent);
        this.node.setWorldPosition(worldPos);
        this.node.setWorldScale(worldScale);
        this.node.setWorldRotation(worldRot);

        // Keep drawing above the food it came from.
        if (!this.detachParent && oldParent.parent === newParent) {
            this.node.setSiblingIndex(oldParent.getSiblingIndex() + 1);
        }

        // Otherwise the move-to-bin would put it back under the food when it finishes.
        this.itemMoveToTarget?.RefreshOriginalParent();
    }

    /** Points ItemDraggable / ItemMoveToTarget at the bin (type for the drop, drop point for the move). */
    private ConfigureTarget(): void {
        if (!this.trashBin) return;
        if (this.itemDraggable) this.itemDraggable.targetItemType = this.trashBin.itemType;
        if (this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = this.trashBin.DropPoint;
    }

    private ThrowInto(target: Node | null): void {
        if (this.isThrowing || this.isCleared) return;
        this.isThrowing = true;
        Ply_SoundManager.Ins?.PlayFx(FxType.Wipe);
        this.DisableItemDraggable();

        const bin = target?.getComponent(TrashBin) ?? this.trashBin;
        const dropPoint = bin?.DropPoint ?? target;
        if (!this.itemMoveToTarget || !dropPoint) {
            this.OnLanded();
            return;
        }
        this.itemMoveToTarget.ExecuteMove2D(dropPoint);
    }

    private OnLanded(): void {
        if (!this.isThrowing) return;
        this.isThrowing = false;
        this.isCleared = true;

        this.ItemDone();
        this.trashBin?.Hide();
        if (this.binShownByHint) {
            this.binShownByHint = false;
            this.trashBin?.Hide();
        }
        if (this.deactivateWhenCleared) this.node.active = false;

        this.onCleared.invoke();
        this.owner?.OnTrashCleared(this);
    }
}
