import { _decorator, Enum, Node, UITransform, Vec3 } from 'cc';
import { Item, HandTutHint } from './Item';
import { ItemType } from './ItemType';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { TrashBin } from './TrashBin';
import { PoolMember } from '../../Core/Pool/PoolMember';
import { World } from '../../Managers/World';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Pooled wiping paper spawned by PaperBox. Dragging it raises the TrashBin;
 * sweeping it over any Item whose type is wipeTargetType calls that item's
 * PaperOn() and turns the paper wet. Dropping it on the bin throws it away,
 * dropping it anywhere else leaves it where the player let go - and used up:
 * a paper turns wet on the first drop too, and a wet paper no longer wipes
 * anything, it can only still be dragged into the bin.
 *
 * Prefab setup: Paper + ItemDraggable + ItemMoveToTarget + PoolMember
 * (type = PoolType.Paper), with the Clean / Wet sprite nodes as children.
 */
@ccclass('Paper')
export class Paper extends Item {
    @property({ type: TrashBin, tooltip: 'Bin this paper is thrown into. Usually filled in by PaperBox on spawn.' })
    public trashBin: TrashBin | null = null;

    @property({ type: Node, tooltip: 'Sprite node shown while the paper is still clean.' })
    public cleanNode: Node | null = null;

    @property({ type: Node, tooltip: 'Sprite node shown once the paper has wiped something.' })
    public wetNode: Node | null = null;

    @property({ type: Enum(ItemType), tooltip: 'Items of this type get PaperOn() when the dragged paper sweeps over them.' })
    public wipeTargetType: ItemType = ItemType.None;

    @property({ tooltip: 'Fire PaperOn() again every time the paper re-enters a target it already wiped.' })
    public retriggerOnReenter = false;

    @property({ tooltip: 'Switch from the Clean node to the Wet node the first time a target is wiped.' })
    public becomeWetOnWipe = true;

    @property({ tooltip: 'Turn the paper wet when it is dropped outside the bin, even if it never wiped anything.' })
    public becomeWetOnDrop = true;

    @property({ tooltip: 'Return this paper to its pool after it lands in the bin (otherwise it is only deactivated).' })
    public despawnWhenCleared = true;

    @property({ type: Ply_Event, tooltip: 'Triggered each time this paper wipes a target.' })
    public onWiped: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered once the paper landed in the bin.' })
    public onCleared: Ply_Event = new Ply_Event();

    private poolMember: PoolMember | null = null;
    private spawnScale = new Vec3(1, 1, 1);
    private spawnedFromPool = false;
    private destroyWhenCleared = false;
    private readonly wipeCandidates: Item[] = [];
    private readonly wipedTargets: Node[] = [];
    private isWet = false;
    private isCleared = false;
    private isThrowing = false;
    private binShownByHint = false;

    private readonly onBeginDrag = (): void => this.OnBeginDrag();
    private readonly onDropFail = (): void => this.OnDropFail();
    private readonly onDropSuccess = (target?: Node): void => this.ThrowInto(target ?? null);
    private readonly onMoveComplete = (): void => this.OnLanded();

    public get IsWet(): boolean {
        return this.isWet;
    }

    public get IsCleared(): boolean {
        return this.isCleared;
    }

    protected onLoad(): void {
        super.onLoad();
        this.poolMember ??= this.getComponent(PoolMember);
        Vec3.copy(this.spawnScale, this.node.scale);
        if (this.itemType === ItemType.None) this.itemType = ItemType.Paper;
        this.ConfigureTarget();
        this.ApplyWetSprites();
    }

    protected onEnable(): void {
        this.cacheComponents();
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

    protected update(): void {
        if (this.isCleared || this.isThrowing) return;
        // A used (wet) paper is only good for the bin any more.
        if (this.isWet) return;
        if (!this.itemDraggable?.IsDragging) return;
        this.ScanWipeTargets();
    }

    /**
     * Puts a pooled paper back into its fresh state. Called by PaperBox right
     * after the spawn, before the drag starts. The two flags tell DeSpawn()
     * how this instance has to be disposed of once it lands in the bin.
     */
    public ResetForSpawn(spawnedFromPool: boolean = false, destroyWhenCleared: boolean = false): void {
        this.cacheComponents();
        this.poolMember ??= this.getComponent(PoolMember);
        this.spawnedFromPool = spawnedFromPool;
        this.destroyWhenCleared = destroyWhenCleared;
        // A drag / throw tween may have left the pooled node scaled or rotated.
        this.node.setScale(this.spawnScale);
        this.node.setRotationFromEuler(0, 0, 0);
        this.isWet = false;
        this.isCleared = false;
        this.isThrowing = false;
        this.binShownByHint = false;
        this.isDone = false;
        this.onProcess = true;
        this.wipedTargets.length = 0;
        this.wipeCandidates.length = 0;
        this.ApplyWetSprites();
        this.ConfigureTarget();
        this.EnableItemDraggable();
    }

    /** Points ItemDraggable / ItemMoveToTarget at the bin (drop type + drop point). */
    public ConfigureTarget(): void {
        if (!this.trashBin?.isValid) return;
        if (this.itemDraggable) this.itemDraggable.targetItemType = this.trashBin.itemType;
        if (this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = this.trashBin.DropPoint;
    }

    public SetTrashBin(trashBin: TrashBin | null): void {
        this.trashBin = trashBin;
        this.ConfigureTarget();
    }

    /** Forces the wet look (also used by ResetForSpawn to restore the clean look). */
    public SetWet(isWet: boolean = true): void {
        if (this.isWet === isWet) return;
        this.isWet = isWet;
        this.ApplyWetSprites();
    }

    private ApplyWetSprites(): void {
        if (this.cleanNode?.isValid) this.cleanNode.active = !this.isWet;
        if (this.wetNode?.isValid) this.wetNode.active = this.isWet;
    }

    private OnBeginDrag(): void {
        this.trashBin?.Show();
        if (!this.isWet) this.RefreshWipeCandidates();
    }

    /**
     * A drop outside the bin is not a mistake: the paper simply stays where the
     * player let go, so the failed-drop heart and the return tween are consumed.
     * The paper counts as used from here on, whether or not it wiped anything,
     * so the player has to bin it and take a fresh one out of the box.
     */
    private OnDropFail(): void {
        this.trashBin?.Hide();
        if (this.becomeWetOnDrop) this.SetWet(true);
        this.itemDraggable?.ConsumeCurrentDropFail();
        // It is still parented to InputManager.draggingNode after the drag, so
        // move it back under its own parent without changing where it looks.
        this.itemDraggable?.RestoreOriginalParent();
        this.itemMoveToTarget?.RefreshOriginalParent();
    }

    /** Collects the items this paper can wipe once, at the start of the drag. */
    private RefreshWipeCandidates(): void {
        this.wipeCandidates.length = 0;
        if (this.wipeTargetType === ItemType.None) return;

        const scene = this.node.scene;
        if (!scene) return;

        const items = scene.getComponentsInChildren('Item') as Item[];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item || item.node === this.node) continue;
            if (item.itemType !== this.wipeTargetType) continue;
            this.wipeCandidates.push(item);
        }
    }

    /** World-space AABB overlap against every candidate, once per frame while dragging. */
    private ScanWipeTargets(): void {
        if (this.wipeCandidates.length === 0) return;

        const myTransform = this.getComponent(UITransform);
        if (!myTransform) return;
        const myRect = myTransform.getBoundingBoxToWorld();

        for (let i = 0; i < this.wipeCandidates.length; i++) {
            const target = this.wipeCandidates[i];
            if (!target?.isValid || !target.node.activeInHierarchy) continue;

            const targetTransform = target.getComponent(UITransform);
            if (!targetTransform) continue;

            const isOverlapping = myRect.intersects(targetTransform.getBoundingBoxToWorld());
            const wipedIndex = this.wipedTargets.indexOf(target.node);

            if (!isOverlapping) {
                // Forget it again only when the same target may fire twice.
                if (wipedIndex !== -1 && this.retriggerOnReenter) {
                    this.wipedTargets.splice(wipedIndex, 1);
                }
                continue;
            }

            if (wipedIndex !== -1) continue;
            this.wipedTargets.push(target.node);
            this.Wipe(target);
        }
    }

    private Wipe(target: Item): void {
        if (this.becomeWetOnWipe) this.SetWet(true);
        target.PaperOn();
        this.onWiped.invoke();
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
        this.onProcess = false;

        this.ItemDone();
        this.trashBin?.Hide();
        if (this.binShownByHint) {
            this.binShownByHint = false;
            this.trashBin?.Hide();
        }

        this.onCleared.invoke();
        this.DeSpawn();
    }

    /** Returns the paper to its pool, destroys a one-off instance, or just hides it. */
    public DeSpawn(): void {
        if (!this.despawnWhenCleared) {
            this.node.active = false;
            return;
        }

        this.poolMember ??= this.getComponent(PoolMember);
        if (this.spawnedFromPool && this.poolMember && World.instance?.poolManager) {
            World.instance.poolManager.despawn(this.poolMember);
            return;
        }

        if (this.destroyWhenCleared) {
            this.node.destroy();
            return;
        }
        this.node.active = false;
    }

    /** Drag hint towards the bin's shown position (the bin itself sits hidden below the screen). */
    public override GetHandTutHint(): HandTutHint | null {
        if (this.isCleared || this.isThrowing || !this.trashBin) return null;
        if (!this.itemDraggable?.enabled || !this.itemDraggable.CanDrag()) return null;
        return { kind: 'drag', from: this.node.worldPosition.clone(), to: this.trashBin.GetShownWorldPosition() };
    }

    /** Raise the bin while the hand points at it so the player sees where the paper goes. */
    public override OnHandTutShown(): void {
        if (this.binShownByHint || !this.trashBin) return;
        this.binShownByHint = true;
        this.trashBin.Show();
    }

    public override OnHandTutHidden(): void {
        if (!this.binShownByHint) return;
        // The hand hides on touch start, before ItemDraggable.BeginDrag runs.
        // Wait a frame so a drag on this paper keeps the bin up (its own Show()).
        this.scheduleOnce(() => {
            if (!this.binShownByHint) return;
            this.binShownByHint = false;
            this.trashBin?.Hide();
        }, 0);
    }
}
