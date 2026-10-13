import { _decorator, EventTouch, Node, Tween, tween, Vec3 } from 'cc';
import { HandTutHint, Item } from '../../Common/Item';
import { ItemMoveToTarget } from '../../Common/ItemMoveToTarget';
import { ItemType } from '../../Common/ItemType';
import { CuttingBoard } from '../Cutting/CuttingBoard';
import { CabbagePlate } from './CabbagePlate';
import { NodeFx } from '../../../../Utils/NodeFx';
import { GameManager } from '../../../../Managers/GameManager';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { InputManager } from '../../../../Managers/InputManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

enum CabbageState {
    Idle,
    MovingToBoard,
    WaitingSauce,
    Rolling,
    Rolled,
    MovingToPlate,
    OnPlate,
}

/**
 * Cabbage roll: drag onto the board -> SauceSpoon brings sauce -> two upward
 * swipes roll it -> drag onto CabbagePlate.
 * ItemDraggable.targetItemType starts as CuttingBoard (defaultTarget = board);
 * after rolling it switches to the plate.
 */
@ccclass('Cabbage')
export class Cabbage extends Item {
    @property({ type: CuttingBoard, tooltip: 'Thớt nhận cabbage.' })
    public cuttingBoard: CuttingBoard | null = null;

    @property({ type: CabbagePlate, tooltip: 'Đĩa cuối nhận cabbage đã cuốn.' })
    public plate: CabbagePlate | null = null;

    // ---------- Tab: Visual ----------
    @property({ group: { name: 'Visual', id: 'cabbage', displayOrder: 0 }, type: Node, tooltip: 'Trống = con "cabbage_base".' })
    public baseNode: Node | null = null;

    @property({ group: { name: 'Visual', id: 'cabbage' }, type: Node, tooltip: 'Trống = con "cabbage_Back".' })
    public backNode: Node | null = null;

    @property({ group: { name: 'Visual', id: 'cabbage' }, type: Node, tooltip: 'Trống = con "cabbage_sauce".' })
    public sauceNode: Node | null = null;

    @property({ group: { name: 'Visual', id: 'cabbage' }, type: Node, tooltip: 'Trống = con "cabbage_Cover".' })
    public coverNode: Node | null = null;

    @property({ group: { name: 'Visual', id: 'cabbage' }, type: Node, tooltip: 'Trống = con "cabbage_RollDone".' })
    public rollDoneNode: Node | null = null;

    @property({ group: { name: 'Visual', id: 'cabbage' }, type: Node, tooltip: 'Trống = con "cabbage_OnPlate".' })
    public onPlateNode: Node | null = null;

    // ---------- Tab: Roll ----------
    @property({ group: { name: 'Roll', id: 'cabbage', displayOrder: 1 }, min: 1, tooltip: 'Quãng vuốt lên tối thiểu (pixel UI) cho mỗi lần cuốn.' })
    public minSwipeDistance = 60;

    @property({ group: { name: 'Roll', id: 'cabbage' }, min: 0, tooltip: 'Độ punch Y sau lần cuốn 1.' })
    public rollPunchStrength = 0.12;

    @property({ group: { name: 'Roll', id: 'cabbage' }, tooltip: 'Cover + sauce chạy lên bao nhiêu (local) ở lần cuốn 2.' })
    public rollUpDistance = 80;

    @property({ group: { name: 'Roll', id: 'cabbage' }, min: 0.01, tooltip: 'Thời gian cover + sauce chạy lên.' })
    public rollUpDuration = 0.25;

    @property({ group: { name: 'Roll', id: 'cabbage' }, tooltip: 'Độ cao nhảy sau khi cuốn xong (local).' })
    public jumpHeight = 150;

    @property({ group: { name: 'Roll', id: 'cabbage' }, min: 0.01, tooltip: 'Tổng thời gian nhảy + xoay 1 vòng.' })
    public jumpDuration = 0.6;

    @property({ group: { name: 'Roll', id: 'cabbage' }, min: 0, tooltip: 'Độ punch X khi chạm đất.' })
    public landPunchStrength = 0.15;

    @property({ group: { name: 'Roll', id: 'cabbage' }, min: 1, tooltip: 'Độ dài vuốt của hand tut.' })
    public handTutSwipeDistance = 150;

    // ---------- Tab: Plate ----------
    @property({ group: { name: 'Plate', id: 'cabbage', displayOrder: 2 }, tooltip: 'Góc xoay thêm (độ) khi bay lên đĩa.' })
    public plateRotation = 90;

    /** The cabbage the hand tut walks through every step, until it lands on the plate. */
    private static guided: Cabbage | null = null;
    private static guideFinished = false;

    private state = CabbageState.Idle;
    private rollCount = 0;
    private isBusy = false;
    private touchStartY = 0;
    private hasProcessedCurrentSwipe = false;
    private isSwipeBound = false;

    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);

    public get IsWaitingSauce(): boolean {
        return this.state === CabbageState.WaitingSauce;
    }

    protected onLoad(): void {
        super.onLoad();
        this.baseNode ??= this.node.getChildByName('cabbage_base');
        this.backNode ??= this.node.getChildByName('cabbage_Back');
        this.sauceNode ??= this.node.getChildByName('cabbage_sauce');
        this.coverNode ??= this.node.getChildByName('cabbage_Cover');
        this.rollDoneNode ??= this.node.getChildByName('cabbage_RollDone');
        this.onPlateNode ??= this.node.getChildByName('cabbage_OnPlate');
        this.ShowOnly(this.baseNode);
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.OnMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.OnMoveComplete, this);
        if (this.state === CabbageState.Rolling) this.BindSwipe();
    }

    protected start(): void {
        if (!Cabbage.guideFinished && !Cabbage.guided) Cabbage.Guide(this);
    }

    protected onDestroy(): void {
        if (Cabbage.guided === this) Cabbage.guided = null;
        Cabbage.guideFinished = false;
        super.onDestroy?.();
    }

    /** Hints only this cabbage (and the spoon) without the idle delay. */
    private static Guide(cabbage: Cabbage): void {
        const handTut = HandTutManager.Ins;
        if (!handTut) return;
        Cabbage.guided = cabbage;
        const spoon = (cabbage.node.scene?.getComponentsInChildren('SauceSpoon')[0] as Item | undefined) ?? null;
        handTut.RegisterNoDelayItem(cabbage, 'guidedCabbage');
        handTut.RegisterNoDelayItem(spoon, 'guidedCabbageSpoon');
        handTut.RestrictTo([cabbage, spoon]);
    }

    private static FinishGuide(cabbage: Cabbage): void {
        if (Cabbage.guided !== cabbage) return;
        Cabbage.guided = null;
        Cabbage.guideFinished = true;
        const handTut = HandTutManager.Ins;
        if (!handTut) return;
        handTut.RemoveNoDelayItem(cabbage.node);
        const spoon = cabbage.node.scene?.getComponentsInChildren('SauceSpoon')[0] as Item | undefined;
        if (spoon) handTut.RemoveNoDelayItem(spoon.node);
        handTut.ClearRestriction();
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.OnMoveComplete, this);
        this.UnbindSwipe();
    }

    private OnDropSuccess(target: Node): void {
        if (this.state === CabbageState.Idle) {
            this.state = CabbageState.MovingToBoard;
            // The player picked another cabbage first: guide that one instead.
            if (!Cabbage.guideFinished && Cabbage.guided !== this) Cabbage.Guide(this);
            this.cuttingBoard?.IsFoodOn(true);
            this.itemDraggable?.DisableComponent();
            this.itemMoveToTarget?.ExecuteMove2D(this.cuttingBoard?.node ?? target);
            return;
        }

        if (this.state === CabbageState.Rolled) {
            const slot = this.plate?.ReserveSlot() ?? null;
            if (!slot) {
                this.itemDraggable?.ReturnToStartWithoutHeart();
                return;
            }
            this.state = CabbageState.MovingToPlate;
            this.cuttingBoard?.IsFoodOn(false);
            this.itemDraggable?.DisableComponent();
            const move = this.itemMoveToTarget;
            if (!move) return;
            move.ExecuteMove2D(slot);
            // ExecuteMove2D stops every tween on the node, so rotate afterwards.
            tween(this.node)
                .to(move.duration, { angle: this.node.angle + this.plateRotation }, { easing: 'sineOut' })
                .start();
        }
    }

    private OnMoveComplete(): void {
        if (this.state === CabbageState.MovingToBoard) {
            this.state = CabbageState.WaitingSauce;
            this.itemType = ItemType.CabbageOnBoard;
            this.cuttingBoard?.Punch();
            return;
        }

        if (this.state === CabbageState.MovingToPlate) {
            this.state = CabbageState.OnPlate;
            this.ShowOnly(this.onPlateNode);
            if (this.itemDraggable) this.itemDraggable.isDraggable = false;
            this.ItemDone();
            this.DoOneStep();
            this.plate?.OnCabbageArrived();
            Cabbage.FinishGuide(this);
        }
    }

    /** Called by SauceSpoon when its sauce lands on this cabbage. */
    public ApplySauce(): boolean {
        if (this.state !== CabbageState.WaitingSauce) return false;

        this.state = CabbageState.Rolling;
        this.itemType = ItemType.None;
        this.rollCount = 0;
        this.onProcess = true;
        NodeFx.FadeIn(this.sauceNode, 0.15);
        Ply_SoundManager.Ins?.PlayFx(FxType.Cream);
        this.BindSwipe();
        return true;
    }

    // ---------- Swipe ----------

    private BindSwipe(): void {
        if (this.isSwipeBound) return;
        this.isSwipeBound = true;
        this.node.on(Node.EventType.TOUCH_START, this.OnTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.OnTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.OnTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.OnTouchEnd, this);
    }

    /** The node listener swallows touches, so drop it before ItemDraggable needs them again. */
    private UnbindSwipe(): void {
        if (!this.isSwipeBound) return;
        this.isSwipeBound = false;
        this.node.off(Node.EventType.TOUCH_START, this.OnTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.OnTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.OnTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.OnTouchEnd, this);
    }

    private OnTouchStart(event: EventTouch): void {
        if (this.state !== CabbageState.Rolling || !GameManager.Ins?.IsPlaying()) return;
        InputManager.Ins?.RegisterFirstMove();
        HandTutManager.Ins?.OnGameplayDragBegin();
        this.touchStartY = event.getUILocation().y;
        this.hasProcessedCurrentSwipe = false;
    }

    private OnTouchMove(event: EventTouch): void {
        this.TryRoll(event.getUILocation().y);
    }

    private OnTouchEnd(event: EventTouch): void {
        this.TryRoll(event.getUILocation().y);
        HandTutManager.Ins?.OnGameplayDragEnd();
    }

    private TryRoll(currentY: number): void {
        if (this.state !== CabbageState.Rolling || this.isBusy || this.hasProcessedCurrentSwipe) return;
        if (!GameManager.Ins?.IsPlaying()) return;
        if (currentY - this.touchStartY < this.minSwipeDistance) return;

        this.hasProcessedCurrentSwipe = true;
        this.rollCount++;
        HandTutManager.Ins?.RegisterCorrectAction();
        Ply_SoundManager.Ins?.PlayFx(FxType.Rolling);

        if (this.rollCount === 1) this.RollFirst();
        else this.RollSecond();
    }

    private RollFirst(): void {
        this.isBusy = true;
        Ply_SoundManager.Ins?.PlayFx(FxType.Wipe);
        this.SetActive(this.baseNode, false);
        this.SetActive(this.backNode, true);
        this.SetActive(this.coverNode, true);
        Tween.stopAllByTarget(this.node);
        NodeFx.Punch(this.node, 'y', this.rollPunchStrength, 0.3, undefined, () => this.isBusy = false);
    }

    private RollSecond(): void {
        this.isBusy = true;
        this.UnbindSwipe();

        const runUp = (node: Node | null): void => {
            if (!node?.isValid || !node.active) return;
            const to = node.position.clone();
            to.y += this.rollUpDistance;
            tween(node).to(this.rollUpDuration, { position: to }, { easing: 'quadIn' }).start();
            NodeFx.FadeOut(node, this.rollUpDuration);
        };
        runUp(this.coverNode);
        runUp(this.sauceNode);
        NodeFx.FadeOut(this.backNode, this.rollUpDuration);

        this.scheduleOnce(() => {
            this.ShowOnly(this.rollDoneNode);
            this.JumpAndLand();
        }, this.rollUpDuration);
    }

    private JumpAndLand(): void {
        const start = this.node.position.clone();
        const top = start.clone();
        top.y += this.jumpHeight;
        const startAngle = this.node.angle;
        const half = this.jumpDuration * 0.5;

        Tween.stopAllByTarget(this.node);
        Ply_SoundManager.Ins?.PlayFx(FxType.Wipe);
        tween(this.node)
            .to(half, { position: top }, { easing: 'quadOut' })
            .to(half, { position: start }, { easing: 'quadIn' })
            .start();
        tween(this.node)
            .to(this.jumpDuration, { angle: startAngle - 360 }, { easing: 'linear' })
            .call(() => {
                this.node.angle = startAngle;
                Ply_SoundManager.Ins?.PlayFx(FxType.Wipe2);
                NodeFx.Punch(this.node, 'x', this.landPunchStrength, 0.3, undefined, () => this.OnRollDone());
            })
            .start();
    }

    private OnRollDone(): void {
        this.isBusy = false;
        this.state = CabbageState.Rolled;
        this.onProcess = false;
        this.requireMatchingTargetTypeForHandTut = true;
        if (this.plate) this.itemDraggable?.SetTargetItemType(this.plate.node);
        this.EnableItemDraggable();
    }

    // ---------- Hand tut ----------

    public override GetHandTutHint(): HandTutHint | null {
        if (this.state !== CabbageState.Rolling || this.isBusy) return null;
        const center = this.node.worldPosition;
        const half = this.handTutSwipeDistance * 0.5;
        return {
            kind: 'drag',
            from: new Vec3(center.x, center.y - half, center.z),
            to: new Vec3(center.x, center.y + half, center.z),
        };
    }

    // ---------- Helpers ----------

    private ShowOnly(visible: Node | null): void {
        const all = [this.baseNode, this.backNode, this.sauceNode, this.coverNode, this.rollDoneNode, this.onPlateNode];
        for (const node of all) {
            if (!node?.isValid) continue;
            node.active = node === visible;
            if (node === visible) NodeFx.SetOpacity(node, 255);
        }
    }

    private SetActive(node: Node | null, active: boolean): void {
        if (!node?.isValid) return;
        node.active = active;
        if (active) NodeFx.SetOpacity(node, 255);
    }
}
