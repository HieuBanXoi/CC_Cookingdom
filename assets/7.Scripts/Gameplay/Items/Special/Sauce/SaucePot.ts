import { _decorator, Node, Tween, tween, Vec3 } from 'cc';
import { Item } from '../../Common/Item';
import { ItemMoveToTarget } from '../../Common/ItemMoveToTarget';
import { ItemType } from '../../Common/ItemType';
import { PourItem } from './PourItem';
import { StoveButton } from './StoveButton';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { NodeFx } from '../../../../Utils/NodeFx';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Corn sauce pot. Unlocks the steps in order:
 * water -> (salt, stove in any order) -> cornstarch -> spatula stir -> drag the
 * pot onto pourTarget to pour the sauce out (heart + DoOneStep).
 * itemType = Pot (drop target of the pour items and the spatula).
 */
@ccclass('SaucePot')
export class SaucePot extends Item {
    // ---------- Tab: Steps ----------
    @property({ group: { name: 'Steps', id: 'pot', displayOrder: 0 }, type: PourItem })
    public waterBowl: PourItem | null = null;

    @property({ group: { name: 'Steps', id: 'pot' }, type: PourItem })
    public salt: PourItem | null = null;

    @property({ group: { name: 'Steps', id: 'pot' }, type: StoveButton })
    public stoveButton: StoveButton | null = null;

    @property({ group: { name: 'Steps', id: 'pot' }, type: PourItem })
    public cornstarch: PourItem | null = null;

    @property({ group: { name: 'Steps', id: 'pot' }, type: Item, tooltip: 'Spatula khuấy (ItemStirring dùng requiredStirDistance).' })
    public spatula: Item | null = null;

    // ---------- Tab: Boil ----------
    @property({ group: { name: 'Boil', id: 'pot', displayOrder: 1 }, type: Node, tooltip: 'Nước sôi (water_04), rõ dần khi bật bếp.' })
    public boilingNode: Node | null = null;

    @property({ group: { name: 'Boil', id: 'pot' }, min: 0.01 })
    public boilFadeDuration = 0.5;

    @property({ group: { name: 'Boil', id: 'pot' }, type: [Node], tooltip: 'Node lật X liên tục khi sôi (water_04, base_03).' })
    public flipNodes: Node[] = [];

    @property({ group: { name: 'Boil', id: 'pot' }, min: 0.02, tooltip: 'Khoảng thời gian giữa 2 lần lật.' })
    public flipInterval = 0.15;

    // ---------- Tab: Stir ----------
    @property({ group: { name: 'Stir', id: 'pot', displayOrder: 2 }, type: [Node], tooltip: 'Base rõ dần lần lượt theo tiến độ khuấy (base_03 -> base_Done).' })
    public baseNodes: Node[] = [];

    @property({ group: { name: 'Stir', id: 'pot' }, type: [Node], tooltip: 'Mờ dần theo tiến độ khuấy (water_03, water_04, cornstarch_3).' })
    public fadeOutOnStirNodes: Node[] = [];

    @property({ group: { name: 'Stir', id: 'pot' }, type: [Node], tooltip: 'Tắt khi khuấy xong (salt_4). Các base trước base cuối cũng tự tắt.' })
    public hideOnStirDoneNodes: Node[] = [];

    // ---------- Tab: Pour Out ----------
    @property({ group: { name: 'Pour Out', id: 'pot', displayOrder: 3 }, type: Node, tooltip: 'Miệng bát: khi đã nghiêng, tâm dropoutNode nằm đúng điểm này. Trống = ItemMoveToTarget.defaultTarget.' })
    public pourPoint: Node | null = null;

    @property({ group: { name: 'Pour Out', id: 'pot' }, tooltip: 'Góc nghiêng khi đổ (âm = cùng chiều kim đồng hồ).' })
    public tiltAngle = -45;

    @property({ group: { name: 'Pour Out', id: 'pot' }, min: 0.01 })
    public tiltDuration = 0.3;

    @property({ group: { name: 'Pour Out', id: 'pot' }, type: Node, tooltip: 'Dòng sốt chảy ra (base_dropout).' })
    public dropoutNode: Node | null = null;

    @property({ group: { name: 'Pour Out', id: 'pot' }, tooltip: 'Dropout trượt thêm bao nhiêu (world) khi mờ dần.' })
    public dropoutMoveOffset: Vec3 = new Vec3(40, -120, 0);

    @property({ group: { name: 'Pour Out', id: 'pot' }, min: 0.01 })
    public dropoutDuration = 0.8;

    @property({ group: { name: 'Pour Out', id: 'pot' }, type: Item, tooltip: 'Bát nhận sốt (water_bowl): spawn heart ở đây.' })
    public pourTarget: Item | null = null;

    @property({ group: { name: 'Pour Out', id: 'pot' }, type: Node, tooltip: 'Sốt trong bát (base_09), zoom ra khi đổ.' })
    public bowlBaseNode: Node | null = null;

    @property({ group: { name: 'Pour Out', id: 'pot' }, min: 0.01 })
    public returnDuration = 0.4;

    private hasWater = false;
    private hasSalt = false;
    private stoveOn = false;
    private hasCornstarch = false;
    private isStirring = false;
    private stirDone = false;
    private isPouringOut = false;
    private bowlBaseScale = new Vec3(1, 1, 1);
    private moveTarget: Node | null = null;

    private readonly onWater = (): void => this.OnWater();
    private readonly onSalt = (): void => { this.hasSalt = true; this.TryUnlockCornstarch(); };
    private readonly onStove = (): void => this.OnStoveOn();
    private readonly onStoveOff = (): void => this.OnStoveOff();
    private readonly onCornstarch = (): void => this.OnCornstarch();
    private readonly onStirBegin = (): void => { this.isStirring = true; };
    private readonly onStirComplete = (): void => this.OnStirComplete();
    private readonly onDropSuccess = (): void => this.OnDropSuccess();

    protected onLoad(): void {
        super.onLoad();
        if (this.bowlBaseNode) {
            Vec3.copy(this.bowlBaseScale, this.bowlBaseNode.scale);
            this.bowlBaseNode.active = false;
        }
        if (this.boilingNode) this.boilingNode.active = false;
        if (this.dropoutNode) this.dropoutNode.active = false;
        for (const node of this.baseNodes) if (node) node.active = false;
    }

    protected start(): void {
        // Everything after the water waits for its turn.
        this.LockDrop(this.salt);
        this.LockDrop(this.cornstarch);
        this.stoveButton?.DisableItemClickable();
        this.LockDrop(this.spatula);
        this.DisableItemDraggable();
        // Tapping the pot while it is locked gives no break heart.
        this.DisableBreakHeartOnBlockedTap();
        // Other items cache their refs in their own onLoad; bind again now that all have run.
        this.Bind(true);
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.Bind(true);
    }

    protected onDisable(): void {
        this.Bind(false);
        this.unschedule(this.FlipTick);
    }

    private Bind(on: boolean): void {
        const pairs: Array<[Ply_Event | undefined, () => void]> = [
            [this.waterBowl?.onPourComplete, this.onWater],
            [this.salt?.onPourComplete, this.onSalt],
            [this.stoveButton?.onStoveOn, this.onStove],
            [this.stoveButton?.onStoveOff, this.onStoveOff],
            [this.cornstarch?.onPourComplete, this.onCornstarch],
            [this.spatula?.itemStirring?.onStirBegin, this.onStirBegin],
            [this.spatula?.itemStirring?.onStirComplete, this.onStirComplete],
            [this.itemDraggable?.onDropSuccess, this.onDropSuccess],
        ];
        for (const [event, handler] of pairs) {
            event?.removeListener(handler);
            if (on) event?.addListener(handler);
        }
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.OnArrived, this);
        if (on) this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.OnArrived, this);
    }

    // ---------- Steps ----------

    private OnWater(): void {
        this.hasWater = true;
        this.UnlockDrop(this.salt);
        this.stoveButton?.EnableItemClickable();
    }

    private OnStoveOn(): void {
        if (this.stoveOn) return;
        this.stoveOn = true;
        NodeFx.FadeIn(this.boilingNode, this.boilFadeDuration);
        Ply_SoundManager.Ins?.PlayFxLoop(FxType.Frying);
        this.unschedule(this.FlipTick);
        this.schedule(this.FlipTick, this.flipInterval);
        this.TryUnlockCornstarch();
    }

    /** Not its turn yet: still draggable, but it cannot be dropped on the pot (and is not hinted). */
    private LockDrop(item: Item | null): void {
        if (!item?.itemDraggable) return;
        item.EnableItemDraggable();
        item.itemDraggable.targetItemType = ItemType.None;
    }

    private UnlockDrop(item: Item | null): void {
        if (!item?.itemDraggable) return;
        item.EnableItemDraggable();
        item.itemDraggable.SetTargetItemType(this.node);
    }

    private OnStoveOff(): void {
        this.unschedule(this.FlipTick);
        Ply_SoundManager.Ins?.StopFxLoop(FxType.Frying);
        if (this.stirDone) this.EnableItemDraggable();
    }

    private TryUnlockCornstarch(): void {
        if (!this.hasWater || !this.hasSalt || !this.stoveOn || this.hasCornstarch) return;
        this.UnlockDrop(this.cornstarch);
    }

    private OnCornstarch(): void {
        this.hasCornstarch = true;
        this.UnlockDrop(this.spatula);
    }

    private FlipTick(): void {
        for (const node of this.flipNodes) {
            if (!node?.isValid || !node.activeInHierarchy) continue;
            const s = node.scale;
            node.setScale(-s.x, s.y, s.z);
        }
    }

    // ---------- Stir ----------

    protected update(): void {
        if (!this.isStirring || this.stirDone) return;
        this.ApplyStirProgress(this.spatula?.itemStirring?.Progress ?? 0);
    }

    /** Bases appear one after another (top of the list first) while water and cornstarch fade. */
    private ApplyStirProgress(progress: number): void {
        const count = this.baseNodes.length;
        for (let i = 0; i < count; i++) {
            const node = this.baseNodes[i];
            if (!node?.isValid) continue;
            const alpha = Math.min(1, Math.max(0, progress * count - i));
            if (alpha > 0) node.active = true;
            NodeFx.SetOpacity(node, alpha * 255);
        }
        for (const node of this.fadeOutOnStirNodes) {
            if (!node?.isValid || !node.active) continue;
            NodeFx.SetOpacity(node, (1 - progress) * 255);
        }
    }

    private OnStirComplete(): void {
        if (this.stirDone) return;
        this.stirDone = true;
        this.isStirring = false;
        this.ApplyStirProgress(1);
        for (const node of this.fadeOutOnStirNodes) if (node) node.active = false;
        for (const node of this.hideOnStirDoneNodes) if (node) node.active = false;
        // Only the finished base stays visible.
        for (let i = 0; i < this.baseNodes.length - 1; i++) {
            if (this.baseNodes[i]) this.baseNodes[i].active = false;
        }
        // The stove has to be turned off before the sauce can be poured out.
        if (this.stoveButton?.IsOn) this.stoveButton.AllowTurnOff();
        else this.EnableItemDraggable();
    }

    // ---------- Pour out ----------

    private OnDropSuccess(): void {
        if (this.isPouringOut) return;
        this.isPouringOut = true;
        this.itemDraggable?.DisableComponent();
        const point = this.pourPoint ?? this.itemMoveToTarget?.defaultTarget;
        if (point) this.itemMoveToTarget?.ExecuteMove2D(this.GetMoveTarget(point));
    }

    /** A runtime node placed so the tilted pot's stream lands on the pour point. */
    private GetMoveTarget(point: Node): Node {
        if (!this.dropoutNode) return point;
        this.moveTarget ??= new Node('Pot_PourTarget');
        if (this.moveTarget.parent !== point.parent) this.moveTarget.setParent(point.parent);
        this.moveTarget.setWorldPosition(NodeFx.PositionForAnchorAt(this.node, this.dropoutNode, this.tiltAngle, point.worldPosition));
        return this.moveTarget;
    }

    private OnArrived(): void {
        if (!this.isPouringOut) return;
        tween(this.node)
            .to(this.tiltDuration, { angle: this.tiltAngle }, { easing: 'quadOut' })
            .call(() => this.PourOut())
            .start();
    }

    private PourOut(): void {
        Ply_SoundManager.Ins?.PlayFx(FxType.Cream);
        const dropout = this.dropoutNode;
        NodeFx.FadeIn(dropout, 0.15, 0, () => {
            // The sauce left in the pot disappears once the stream shows.
            this.unschedule(this.FlipTick);
            for (const node of this.baseNodes) if (node) node.active = false;

            if (dropout?.isValid) {
                const to = dropout.worldPosition.clone().add(this.dropoutMoveOffset);
                Tween.stopAllByTarget(dropout);
                tween(dropout).to(this.dropoutDuration, { worldPosition: to }, { easing: 'quadIn' }).start();
                NodeFx.FadeOut(dropout, this.dropoutDuration);
            }
            NodeFx.ZoomIn(this.bowlBaseNode, this.dropoutDuration, this.bowlBaseScale);
            this.scheduleOnce(() => this.FinishPour(), this.dropoutDuration);
        });
    }

    private FinishPour(): void {
        // ReturnToStart stops every tween on the node, so rotate back afterwards.
        this.itemDraggable?.ReturnToStart(false, false);
        tween(this.node).to(this.returnDuration, { angle: 0 }, { easing: 'quadOut' }).start();
        if (this.itemDraggable) this.itemDraggable.isDraggable = false;
        this.DisableBreakHeartOnBlockedTap();
        this.ItemDone();

        this.pourTarget?.SpawnHeart();
        this.DoOneStep();
    }
}
