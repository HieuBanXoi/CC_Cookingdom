import { _decorator, Node, sp } from 'cc';
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

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'box', displayOrder: 3 }, type: Ply_Event })
    public onPowderIn: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'box' }, type: Ply_Event })
    public onLidClosed: Ply_Event = new Ply_Event();

    private hasPowder = false;
    private lidReady = false;
    private readonly onLidDropped = (): void => this.OnLidDropped();
    private readonly onLidArrived = (): void => this.OnLidArrived();

    protected onLoad(): void {
        super.onLoad();
        if (this.powder) this.powder.active = false;
        // The box is only a drop target.
        this.DisableItemDraggable();
        this.LockLid();
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

    /** Called by Grinder while it pours. */
    public ReceivePowder(): void {
        if (this.hasPowder) return;
        this.hasPowder = true;

        const onLanded = (): void => {
            this.onPowderIn.invoke();
            this.EnableLid();
        };
        if (this.powder) {
            PlayFallIn(this.powder, this.powderFallHeight, this.powderFallDuration, this.powderStartOpacity, onLanded);
        } else {
            onLanded();
        }
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
        if (this.spine && this.cheerAnimation) {
            this.spine.setAnimation(0, this.cheerAnimation, false);
            if (this.idleAnimation) this.spine.addAnimation(0, this.idleAnimation, true, 0);
        }
        this.onLidClosed.invoke();
        if (this.doPhaseStep) this.DoOneStep();
    }
}
