import { _decorator, Enum, instantiate, Node, Prefab } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { Paper } from './Paper';
import { TrashBin } from './TrashBin';
import { PoolMember, PoolType } from '../../Core/Pool/PoolMember';
import { World } from '../../Managers/World';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { InputManager } from '../../Managers/InputManager';
import { HandTutManager } from '../../Managers/HandTutManager';

const { ccclass, property } = _decorator;

/**
 * Box of wiping papers. Tapping it takes one Paper out of the pool and hands
 * the running touch straight over to that paper, so a single tap-and-move
 * pulls a paper out and drags it in one gesture.
 *
 * Node setup: PaperBox + ItemClickable (infiniteClick when the box never runs
 * out). Paper comes from PoolType.Paper; drop the Paper prefab into the
 * PoolControl prefab list, or into paperPrefab here as a non-pooled fallback.
 */
@ccclass('PaperBox')
export class PaperBox extends Item {
    @property({ type: Prefab, tooltip: 'Paper prefab. Used when the Paper pool is not available (also the fallback for editor previews).' })
    public paperPrefab: Prefab | null = null;

    @property({ tooltip: 'Take the paper from PoolType.Paper. Falls back to instantiating paperPrefab when the pool has no entry.' })
    public usePool = true;

    @property({ type: Node, tooltip: 'Where a new paper appears. Defaults to this node.' })
    public spawnPoint: Node | null = null;

    @property({ type: Node, tooltip: 'Parent for the spawned paper. Defaults to this box node parent, so the paper is a sibling of the box.' })
    public spawnParent: Node | null = null;

    @property({ type: TrashBin, tooltip: 'Bin the spawned paper is thrown into. Leave empty to keep the prefab value.' })
    public trashBin: TrashBin | null = null;

    @property({ type: Enum(ItemType), tooltip: 'Wipe target type written into the spawned paper. None keeps the prefab value.' })
    public paperWipeTargetType: ItemType = ItemType.None;

    @property({ tooltip: 'Start dragging the new paper with the touch that opened the box, so one gesture does both.' })
    public dragSpawnedPaperImmediately = true;

    @property({ tooltip: 'Register the spawned paper with HandTutManager so the hand can point it at the bin.' })
    public registerPaperForHandTut = true;

    @property({ min: 0, tooltip: 'Maximum number of papers out of the box at the same time. 0 = unlimited.' })
    public maxActivePapers = 0;

    @property({ type: Ply_Event, tooltip: 'Triggered after a paper has been taken out of the box.' })
    public onPaperSpawned: Ply_Event = new Ply_Event();

    private readonly activePapers: Paper[] = [];

    private readonly onClick = (): void => { this.SpawnPaper(); };

    protected onLoad(): void {
        super.onLoad();
        if (this.itemType === ItemType.None) this.itemType = ItemType.PaperBox;
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemClickable?.onClick.addListener(this.onClick);
    }

    protected onDisable(): void {
        this.itemClickable?.onClick.removeListener(this.onClick);
    }

    /** Takes a paper out of the box. Also callable from a Ply_Event / Inspector. */
    public SpawnPaper(): Paper | null {
        this.PurgeFinishedPapers();
        if (this.maxActivePapers > 0 && this.activePapers.length >= this.maxActivePapers) return null;

        const fromPool = this.usePool;
        const paper = fromPool ? this.TakeFromPool() : null;
        const spawned = paper ?? this.InstantiatePaper();
        if (!spawned) {
            console.warn(`[PaperBox] No Paper available for "${this.node.name}". Register the Paper prefab in PoolControl or set paperPrefab.`);
            return null;
        }

        const spawnedFromPool = spawned === paper;
        this.PlacePaper(spawned);
        this.ApplyPaperSettings(spawned);
        spawned.ResetForSpawn(spawnedFromPool, !spawnedFromPool);
        this.activePapers.push(spawned);

        if (this.registerPaperForHandTut) HandTutManager.Ins?.RegisterTutorialItem(spawned);
        this.onPaperSpawned.invoke();

        // The touch that clicked the box is still down, so the paper can take
        // it over and follow the finger without the player lifting it first.
        if (this.dragSpawnedPaperImmediately && spawned.itemDraggable) {
            InputManager.Ins?.BeginDragItem(spawned.itemDraggable);
        }

        return spawned;
    }

    private TakeFromPool(): Paper | null {
        const poolManager = World.instance?.poolManager;
        if (!poolManager?.link?.has(PoolType.Paper)) return null;

        const member: PoolMember | null = poolManager.spawn(PoolType.Paper);
        const paper = member?.node.getComponent(Paper) ?? null;
        if (member && !paper) {
            console.warn(`[PaperBox] The PoolType.Paper prefab has no Paper component.`);
            poolManager.despawn(member);
        }
        return paper;
    }

    private InstantiatePaper(): Paper | null {
        if (!this.paperPrefab) return null;
        return instantiate(this.paperPrefab).getComponent(Paper);
    }

    /** Parents the paper next to the box and puts it on the spawn point. */
    private PlacePaper(paper: Paper): void {
        const parent = this.spawnParent ?? this.node.parent;
        if (parent?.isValid && paper.node.parent !== parent) paper.node.setParent(parent);

        const spawnAt = this.spawnPoint ?? this.node;
        paper.node.setWorldPosition(spawnAt.worldPosition);
        paper.node.active = true;

        // The pooled node was parented to the pool root, so the components that
        // cached a "home" parent have to pick up the new one.
        paper.itemMoveToTarget?.RefreshOriginalParent();
    }

    private ApplyPaperSettings(paper: Paper): void {
        if (this.trashBin?.isValid) paper.trashBin = this.trashBin;
        if (this.paperWipeTargetType !== ItemType.None) paper.wipeTargetType = this.paperWipeTargetType;
    }

    /** Drops papers that went into the bin (or were destroyed) from the active list. */
    private PurgeFinishedPapers(): void {
        for (let i = this.activePapers.length - 1; i >= 0; i--) {
            const paper = this.activePapers[i];
            if (!paper?.isValid || paper.IsCleared || !paper.node.activeInHierarchy) {
                this.activePapers.splice(i, 1);
            }
        }
    }

    /** Number of papers currently out of the box. */
    public get ActivePaperCount(): number {
        this.PurgeFinishedPapers();
        return this.activePapers.length;
    }
}
