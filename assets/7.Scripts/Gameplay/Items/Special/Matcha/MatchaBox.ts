import { _decorator, Node, sp, Tween, tween, Vec3 } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { PlayFallIn } from '../../../Effects/FallIn';

const { ccclass, property } = _decorator;

/**
 * Matcha box: receives the powder from the Grinder, then its lid can be put
 * on (lid -> lidPos). With the lid on, the character cheers once and the
 * phase gets a step.
 */
@ccclass('MatchaBox')
export class MatchaBox extends Item {
    // ---------- Tab: Powder ----------
    @property({ group: { name: 'Powder', id: 'box', displayOrder: 0 }, type: Node, tooltip: 'Bột trong hộp (MATCHA_POWDER3): bật khi grinder đổ, rơi xuống từ mờ đến rõ.' })
    public powder: Node | null = null;

    @property({ group: { name: 'Powder', id: 'box' }, tooltip: 'Bột rơi từ cao bao nhiêu (đơn vị local).' })
    public powderFallHeight: number = 120;

    @property({ group: { name: 'Powder', id: 'box' }, min: 0.01, tooltip: 'Thời gian bột rơi (giây).' })
    public powderFallDuration: number = 0.6;

    @property({ group: { name: 'Powder', id: 'box' }, range: [0, 1, 0.05], slide: true, tooltip: 'Độ rõ lúc bắt đầu rơi (0.2 = 20%).' })
    public powderStartOpacity: number = 0.2;

    @property({ group: { name: 'Powder', id: 'box' }, tooltip: 'Trong lúc đổ, vẽ bột đè lên dụng cụ đang đổ (grinder), xong thì trả bột về hộp.' })
    public powderAboveSource: boolean = true;

    // ---------- Tab: Lid ----------
    @property({ group: { name: 'Lid', id: 'box', displayOrder: 1 }, type: Item, tooltip: 'Nắp hộp (MATCHA_BOX_2-1), kéo thả vào hộp sau khi có bột.' })
    public lid: Item | null = null;

    @property({ group: { name: 'Lid', id: 'box' }, type: Node, tooltip: 'Vị trí nắp (NapPos).' })
    public lidPos: Node | null = null;

    // ---------- Tab: Finish ----------
    @property({ group: { name: 'Finish', id: 'box', displayOrder: 2 }, type: sp.Skeleton, tooltip: 'Spine nhân vật chơi anim khi đậy nắp xong.' })
    public spine: sp.Skeleton | null = null;

    @property({ group: { name: 'Finish', id: 'box' }, tooltip: 'Anim chơi 1 lần khi đậy nắp xong.' })
    public cheerAnimation: string = 'GAME-ACTION/idle-sit-cheer';

    @property({ group: { name: 'Finish', id: 'box' }, tooltip: 'Anim lặp lại sau khi cheer xong. Trống = giữ cheer.' })
    public idleAnimation: string = '3-NORMAL/idle-sit';

    @property({ group: { name: 'Finish', id: 'box' }, tooltip: 'Đậy nắp xong thì gọi PhaseManager.DoOneStep().' })
    public doPhaseStep: boolean = true;

    // ---------- Tab: Bubble ----------
    @property({ group: { name: 'Bubble', id: 'box', displayOrder: 3 }, type: Node, tooltip: 'Bubble chat của capy: vào game thì zoom 0 -> 1, hoàn thành món thì ẩn đi.' })
    public bubble: Node | null = null;

    @property({ group: { name: 'Bubble', id: 'box' }, min: 0, tooltip: 'Chờ bao lâu (giây) sau khi vào game mới hiện bubble.' })
    public bubbleShowDelay: number = 0.3;

    @property({ group: { name: 'Bubble', id: 'box' }, min: 0.01, tooltip: 'Thời gian zoom hiện bubble (giây).' })
    public bubbleShowDuration: number = 0.4;

    @property({ group: { name: 'Bubble', id: 'box' }, min: 0.01, tooltip: 'Thời gian zoom ẩn bubble (giây).' })
    public bubbleHideDuration: number = 0.25;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'box', displayOrder: 4 }, type: Ply_Event })
    public onPowderIn: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'box' }, type: Ply_Event })
    public onLidClosed: Ply_Event = new Ply_Event();

    private hasPowder = false;
    private powderParent: Node | null = null;
    private powderSibling = -1;
    private powderFalling = false;
    private restorePending = false;
    private readonly powderLocalPos = new Vec3();
    private bubbleScale = new Vec3(1, 1, 1);
    private lidReady = false;
    private readonly onLidDropped = (): void => this.OnLidDropped();
    private readonly onLidArrived = (): void => this.OnLidArrived();

    protected onLoad(): void {
        super.onLoad();
        if (this.powder) this.powder.active = false;
        // The box is only a drop target.
        this.DisableItemDraggable();
        this.LockLid();
        this.ShowBubble();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.lid?.itemDraggable?.onDropSuccess.removeListener(this.onLidDropped);
        this.lid?.itemDraggable?.onDropSuccess.addListener(this.onLidDropped);
        this.lid?.itemMoveToTarget?.onComplete.removeListener(this.onLidArrived);
        this.lid?.itemMoveToTarget?.onComplete.addListener(this.onLidArrived);
    }

    protected onDisable(): void {
        this.lid?.itemDraggable?.onDropSuccess.removeListener(this.onLidDropped);
        this.lid?.itemMoveToTarget?.onComplete.removeListener(this.onLidArrived);
    }

    /** Called by Grinder while it pours. `source` = the pouring tool (powder is drawn above it). */
    public ReceivePowder(source?: Node): void {
        if (this.hasPowder) return;
        this.hasPowder = true;
        if (source && this.powderAboveSource) this.LiftPowderAbove(source);

        const onLanded = (): void => {
            this.powderFalling = false;
            if (this.restorePending) this.RestorePowderLayer();
            this.onPowderIn.invoke();
            this.EnableLid();
        };
        if (this.powder) {
            this.powderFalling = true;
            PlayFallIn(this.powder, this.powderFallHeight, this.powderFallDuration, this.powderStartOpacity, onLanded);
        } else {
            onLanded();
        }
    }

    /** Bubble pops in (scale 0 -> its scene scale). */
    private ShowBubble(): void {
        const bubble = this.bubble;
        if (!bubble) return;
        this.bubbleScale.set(bubble.scale);
        Tween.stopAllByTarget(bubble);
        bubble.active = true;
        bubble.setScale(0, 0, 0);
        tween(bubble)
            .delay(this.bubbleShowDelay)
            .to(this.bubbleShowDuration, { scale: this.bubbleScale.clone() }, { easing: 'backOut' })
            .start();
    }

    private HideBubble(): void {
        const bubble = this.bubble;
        if (!bubble || !bubble.active) return;
        Tween.stopAllByTarget(bubble);
        tween(bubble)
            .to(this.bubbleHideDuration, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
            .call(() => { bubble.active = false; })
            .start();
    }

    /** Moves the powder right above `source` in draw order, keeping its look. */
    private LiftPowderAbove(source: Node): void {
        const powder = this.powder;
        const layer = source.parent;
        if (!powder || !layer || powder.parent === layer) return;
        this.powderParent = powder.parent;
        this.powderSibling = powder.getSiblingIndex();
        Vec3.copy(this.powderLocalPos, powder.position);
        this.ReparentKeepWorld(powder, layer);
        powder.setSiblingIndex(source.getSiblingIndex() + 1);
    }

    /** Puts the powder back in the box once the pouring tool has left. */
    public RestorePowderLayer(): void {
        const powder = this.powder;
        const parent = this.powderParent;
        if (!powder || !parent?.isValid) return;
        // Still falling: put it back once it has landed.
        if (this.powderFalling) {
            this.restorePending = true;
            return;
        }
        this.restorePending = false;
        this.powderParent = null;
        this.ReparentKeepWorld(powder, parent);
        powder.setPosition(this.powderLocalPos);
        if (this.powderSibling >= 0) powder.setSiblingIndex(this.powderSibling);
    }

    private ReparentKeepWorld(node: Node, parent: Node): void {
        const pos = node.worldPosition.clone();
        const scale = node.worldScale.clone();
        const rot = node.worldRotation.clone();
        node.setParent(parent);
        node.setWorldPosition(pos);
        node.setWorldScale(scale);
        node.setWorldRotation(rot);
    }

    private EnableLid(): void {
        const lid = this.lid;
        if (!lid?.itemDraggable) return;
        this.lidReady = true;
        lid.isDone = false;
        lid.itemDraggable.SetTargetItemType(this.node);
        if (this.lidPos && lid.itemMoveToTarget) lid.itemMoveToTarget.defaultTarget = this.lidPos;
        lid.EnableItemDraggable();
        HandTutManager.Ins?.RegisterTutorialItem(lid, false);
    }

    /** Not its turn: the lid can be dragged around but not dropped. */
    private LockLid(): void {
        const lid = this.lid;
        if (!lid?.itemDraggable) return;
        lid.itemDraggable.targetItemType = ItemType.None;
        lid.EnableItemDraggable();
    }

    private OnLidDropped(): void {
        if (!this.lidReady) return;
        this.lidReady = false;
        this.lid!.itemDraggable?.DisableComponent();
        HandTutManager.Ins?.RegisterCorrectAction();
        this.lid!.itemMoveToTarget?.ExecuteMove();
    }

    private OnLidArrived(): void {
        const lid = this.lid;
        if (!lid || lid.isDone) return;
        lid.ItemDone();
        if (lid.itemDraggable) lid.itemDraggable.targetItemType = ItemType.None;
        this.itemType = ItemType.None;
        this.ItemDone();

        // Cheer once the punch (if any) has settled.
        const move = lid.itemMoveToTarget;
        const finish = (): void => this.Finish();
        if (move) move.WhenPunchDone(finish);
        else finish();
    }

    private Finish(): void {
        this.HideBubble();
        if (this.spine && this.cheerAnimation) {
            this.spine.setAnimation(0, this.cheerAnimation, false);
            if (this.idleAnimation) this.spine.addAnimation(0, this.idleAnimation, true, 0);
        }
        this.onLidClosed.invoke();
        if (this.doPhaseStep) this.DoOneStep();
    }
}
