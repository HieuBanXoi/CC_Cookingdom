import { _decorator, EventTouch, Node, Tween, tween, UIOpacity, Vec2, Vec3 } from 'cc';
import { Item } from './Item';
import { Knife } from './Knife';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { HandTutManager } from '../../Managers/HandTutManager';
import { InputManager } from '../../Managers/InputManager';
import { GameManager } from '../../Managers/GameManager';
import { HandTutHint } from './Item';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { CuttingBoard } from './CuttingBoard';

const { ccclass, property } = _decorator;

/**
 * Counts short left swipes on squid_Foot. Each valid swipe punches squid_Head;
 * after the required count, the foot slides left and fades out.
 */
@ccclass('Squid')
export class Squid extends Item {
    @property({ type: Node, tooltip: 'Node that receives the left-swipe input. Defaults to child squid_Foot.' })
    public squidFoot: Node | null = null;

    @property({ type: Node, tooltip: 'Node punched after each valid swipe. Defaults to child squid_Head.' })
    public squidHead: Node | null = null;

    @property({ type: CuttingBoard, tooltip: 'Board the squid starts on. Freed (itemType = CuttingBoard) once the squid leaves. Defaults to the parent node.' })
    public cuttingBoard: CuttingBoard | null = null;

    @property({ type: Node, tooltip: 'Node that zooms out after squid is complete.' })
    public zoomOutTarget: Node | null = null;

    @property({ type: Vec2, tooltip: 'Initial local position of the zoom target when gameplay starts.' })
    public defaultPosition = new Vec2(0, 0);

    @property({ type: Vec2, tooltip: 'Initial scale of the zoom target when gameplay starts.' })
    public defaultScale = new Vec2(1, 1);

    @property({ type: Vec2, tooltip: 'Target local position after zooming out.' })
    public zoomOutPosition = new Vec2(0, 0);

    @property({ type: Vec2, tooltip: 'Target scale after zooming out.' })
    public zoomOutScale = new Vec2(1, 1);

    @property({ min: 0.01, tooltip: 'Zoom-out duration in seconds.' })
    public zoomOutDuration = 0.5;

    @property({ min: 1, tooltip: 'Number of left swipes required to finish.' })
    public requiredSwipeCount = 5;

    @property({ min: 1, tooltip: 'Minimum leftward drag distance in local UI units.' })
    public minimumLeftDragDistance = 24;

    @property({ min: 1, tooltip: 'Length of the hand-tutorial swipe, in world units.' })
    public handTutSwipeDistance = 120;

    @property({ min: 0, tooltip: 'How far the foot slides left when complete.' })
    public finishMoveLeftDistance = 35;

    @property({ min: 0, tooltip: 'How far the foot shifts left after each valid swipe.' })
    public moveLeftPerSwipe = 12;

    @property({ min: 0.01, tooltip: 'Duration of the foot finish animation in seconds.' })
    public finishDuration = 0.35;

    @property({ min: 1, tooltip: 'Temporary head scale multiplier for each valid swipe.' })
    public headPunchScaleMultiplier = 1.05;

    private swipeCount = 0;
    private isFinished = false;
    private isCutDone = false;
    private touchStartX = 0;
    private hasProcessedCurrentDrag = false;
    private headOriginalScale = new Vec3();

    private readonly onMoveComplete = (): void => this.OnLeftCuttingBoard();
    // Once dropped, the squid is flying to its target: no more dragging (and no drag hint).
    private readonly onDropSuccess = (): void => { if (this.itemDraggable) this.itemDraggable.isDraggable = false; };

    protected onLoad(): void {
        super.onLoad();
        this.squidFoot ??= this.node.getChildByName('squid_Foot');
        this.squidHead ??= this.node.getChildByName('squid_Head');
        this.squidHead && Vec3.copy(this.headOriginalScale, this.squidHead.scale);
        this.cuttingBoard ??= this.node.parent?.getComponent(CuttingBoard) ?? null;
    }

    protected onEnable(): void {
        this.cacheComponents();
        // Dragging the squid is only allowed after it has been cut. Keep the
        // component enabled (so no break-heart feedback) but lock isDraggable.
        if (!this.isCutDone && this.itemDraggable) this.itemDraggable.isDraggable = false;

        this.squidFoot?.on(Node.EventType.TOUCH_START, this.OnFootTouchStart, this);
        this.squidFoot?.on(Node.EventType.TOUCH_MOVE, this.OnFootTouchMove, this);
        this.squidFoot?.on(Node.EventType.TOUCH_END, this.OnFootTouchEnd, this);
        this.squidFoot?.on(Node.EventType.TOUCH_CANCEL, this.OnFootTouchEnd, this);

        // Zoom out only after the squid has been dragged and arrived at its target.
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected start(): void {
        this.ApplyDefaultZoom();
        // Until the squid has left the board and the zoom played, the hand
        // tutorial may only guide the squid itself and the knife.
        HandTutManager.Ins?.RestrictTo([this, this.knife?.getComponent(Item) ?? null]);
    }

    protected onDisable(): void {
        this.UnbindFootTouch();
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    private UnbindFootTouch(): void {
        this.squidFoot?.off(Node.EventType.TOUCH_START, this.OnFootTouchStart, this);
        this.squidFoot?.off(Node.EventType.TOUCH_MOVE, this.OnFootTouchMove, this);
        this.squidFoot?.off(Node.EventType.TOUCH_END, this.OnFootTouchEnd, this);
        this.squidFoot?.off(Node.EventType.TOUCH_CANCEL, this.OnFootTouchEnd, this);
    }

    /** Bound from the cut animation / onKnifeIn. Unlocks dragging and asks for a hand hint. */
    public override CutDone(): void {
        if (this.isCutDone) return;
        this.isCutDone = true;
        super.CutDone();
        this.onProcess = true;
        console.log(`[Squid] CutDone called on item "${this.node.name}"`);
    }

    private OnFootTouchStart(event: EventTouch): void {
        if (this.isFinished) return;
        // The foot swallows this touch, so InputManager / HandTutManager never see it.
        InputManager.Ins?.RegisterFirstMove();
        HandTutManager.Ins?.OnGameplayDragBegin();
        this.touchStartX = event.getUILocation().x;
        this.hasProcessedCurrentDrag = false;
    }

    private OnFootTouchMove(event: EventTouch): void {
        this.TryProcessLeftDrag(event.getUILocation().x);
    }

    private OnFootTouchEnd(event: EventTouch): void {
        this.TryProcessLeftDrag(event.getUILocation().x);
        HandTutManager.Ins?.OnGameplayDragEnd();
    }

    private TryProcessLeftDrag(currentX: number): void {
        if (this.isFinished || this.hasProcessedCurrentDrag) return;
        if (this.touchStartX - currentX < this.minimumLeftDragDistance) return;

        this.hasProcessedCurrentDrag = true;
        this.swipeCount++;
        // One wipe per swipe: hasProcessedCurrentDrag keeps the move events quiet.
        Ply_SoundManager.Ins?.PlayFx(FxType.Wipe);
        this.PunchHead();
        if (this.swipeCount >= this.requiredSwipeCount) {
            this.FinishFoot();
        } else {
            this.MoveFootLeft(this.moveLeftPerSwipe, 0.12);
        }
    }

    private PunchHead(): void {
        if (!this.squidHead?.isValid) return;
        Tween.stopAllByTarget(this.squidHead);
        const punchScale = this.headOriginalScale.clone().multiplyScalar(this.headPunchScaleMultiplier);
        tween(this.squidHead)
            .to(0.08, { scale: punchScale }, { easing: 'sineOut' })
            .to(0.1, { scale: this.headOriginalScale.clone() }, { easing: 'sineIn' })
            .start();
    }

    private FinishFoot(): void {
        if (!this.squidFoot?.isValid) return;
        this.isFinished = true;
        HandTutManager.Ins?.RegisterCorrectAction();
        const opacity = this.squidFoot.getComponent(UIOpacity) ?? this.squidFoot.addComponent(UIOpacity);

        Tween.stopAllByTarget(this.squidFoot);
        tween(this.squidFoot)
            .parallel(
                tween().to(this.finishDuration, { position: this.GetFootPositionShiftedLeft(this.finishMoveLeftDistance) }, { easing: 'sineIn' }),
                tween(opacity).to(this.finishDuration, { opacity: 0 }),
            )
            .call(() => {
                // The invisible foot would keep swallowing touches inside its
                // UITransform and block ItemDraggable on the squid node.
                this.UnbindFootTouch();
                if (this.squidFoot?.isValid) this.squidFoot.active = false;
                ComponentCache.get(this.knife, Knife)?.SetTarget(this.node);
            })
            .start();
    }

    private MoveFootLeft(distance: number, duration: number): void {
        if (!this.squidFoot?.isValid || distance <= 0) return;
        Tween.stopAllByTarget(this.squidFoot);
        tween(this.squidFoot)
            .to(duration, { position: this.GetFootPositionShiftedLeft(distance) }, { easing: 'sineOut' })
            .start();
    }

    private GetFootPositionShiftedLeft(distance: number): Vec3 {
        const targetPosition = this.squidFoot!.position.clone();
        targetPosition.x -= distance;
        return targetPosition;
    }

    /** Swipe-left hint on the foot while the tail phase is still running. */
    public override GetHandTutHint(): HandTutHint | null {
        if (this.isFinished || !this.squidFoot?.activeInHierarchy) return null;
        const from = this.squidFoot.worldPosition.clone();
        const to = new Vec3(from.x - this.handTutSwipeDistance, from.y, from.z);
        return { kind: 'drag', from, to };
    }

    /** The squid started on the board, so free the board for the next food once it arrives at its target. */
    private OnLeftCuttingBoard(): void {
        this.cuttingBoard?.IsFoodOn(false);
        // Nothing left to do with the squid: lock it and drop it from the hand tutorial.
        this.DisableItemDraggable();
        this.ItemDone();
        this.ZoomOut();
    }

    private ZoomOut(): void {
        if (!this.zoomOutTarget?.isValid) {
            HandTutManager.Ins?.ClearRestriction();
            return;
        }
        Tween.stopAllByTarget(this.zoomOutTarget);

        // No gameplay input while the zoom is playing.
        GameManager.Ins?.SetIsPlaying(false);
        tween(this.zoomOutTarget)
            .to(this.zoomOutDuration, {
                position: new Vec3(this.zoomOutPosition.x, this.zoomOutPosition.y, this.zoomOutTarget.position.z),
                scale: new Vec3(this.zoomOutScale.x, this.zoomOutScale.y, this.zoomOutTarget.scale.z),
            }, { easing: 'sineInOut' })
            .call(() => {
                GameManager.Ins?.SetIsPlaying(true);
                // The rest of the kitchen is now reachable for the hand tutorial.
                HandTutManager.Ins?.ClearRestriction();
            })
            .start();
    }

    private ApplyDefaultZoom(): void {
        if (!this.zoomOutTarget?.isValid) return;
        this.zoomOutTarget.setPosition(this.defaultPosition.x, this.defaultPosition.y, this.zoomOutTarget.position.z);
        this.zoomOutTarget.setScale(this.defaultScale.x, this.defaultScale.y, this.zoomOutTarget.scale.z);
    }
}
