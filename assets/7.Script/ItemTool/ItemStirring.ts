import { _decorator, Node, Vec2, Enum, EventTouch } from 'cc';
import { Ply_SoundManager, FxType } from '../Tool/Ply_SoundManager';
import { Ply_Event } from '../Tool/Ply_Event';
import { Ply_EventHandlerComponent } from '../Tool/Ply_EventHandlerComponent';

const { ccclass, property } = _decorator;

export enum StirMovementMode {
    Circle = 0,
    Line
}
Enum(StirMovementMode);

@ccclass('StirMilestone')
export class StirMilestone {
    @property({ tooltip: 'Progress threshold from 0 to 1' })
    public distanceThreshold: number = 0.5;

    @property({ type: Ply_Event, tooltip: 'On milestone reached event' })
    public onMilestoneReached: Ply_Event = new Ply_Event();

    public isReached: boolean = false;
}

@ccclass('ItemStirring')
export class ItemStirring extends Ply_EventHandlerComponent {

    @property
    public stirRadius: number = 1.2;

    @property(Node)
    public stirrerTransform: Node = null!;

    @property(Node)
    public centerPoint: Node = null!;

    @property({ type: Enum(StirMovementMode) })
    public movementMode: StirMovementMode = StirMovementMode.Circle;

    @property
    public lineLength: number = 2.0;

    @property
    public lineDirection: Vec2 = new Vec2(0, 1);

    @property({ type: [StirMilestone] })
    public milestones: StirMilestone[] = [];

    @property({ type: Ply_Event, tooltip: 'On stir begin event' })
    public onStirBegin: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'On stir complete event' })
    public onStirComplete: Ply_Event = new Ply_Event();

    private isDone: boolean = false;
    private isStirring: boolean = false;
    private hasBegunStir: boolean = false;
    private currentProgress: number = 0;
    private lastTouchPos: Vec2 = new Vec2();

    public get IsDone(): boolean {
        return this.isDone;
    }

    protected onLoad() {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    private onTouchStart(event: EventTouch) {
        this.BeginStir(event);
    }

    private onTouchMove(event: EventTouch) {
        this.Stir(event);
    }

    private onTouchEnd(event: EventTouch) {
        this.EndStir();
    }

    public BeginStir(event?: EventTouch) {
        if (this.isDone || !this.enabled) return;
        this.isStirring = true;

        if (event) {
            const touchPos = event.getUILocation();
            this.lastTouchPos.set(touchPos.x, touchPos.y);
        }

        if (!this.hasBegunStir && this.milestones) {
            for (let i = 0; i < this.milestones.length; i++) {
                if (this.milestones[i]) {
                    this.milestones[i].isReached = false;
                }
            }
        }

        this.hasBegunStir = true;
        if (this.stirrerTransform) this.stirrerTransform.active = true;

        Ply_SoundManager.Ins.PlayFxLoop(FxType.Stirring);
        this.onStirBegin.invoke();
    }

    public ResetStir() {
        this.isDone = false;
        this.currentProgress = 0;
    }

    public Stir(event: EventTouch) {
        if (!this.isStirring || this.isDone || !this.enabled) return;

        const curTouchPos = event.getUILocation();
        const dist = Vec2.distance(this.lastTouchPos, curTouchPos);
        this.lastTouchPos.set(curTouchPos.x, curTouchPos.y);

        this.currentProgress += dist * 0.002;
        if (this.currentProgress > 1.0) this.currentProgress = 1.0;

        if (this.milestones) {
            for (let i = 0; i < this.milestones.length; i++) {
                const milestone = this.milestones[i];
                if (milestone && !milestone.isReached && this.currentProgress >= milestone.distanceThreshold) {
                    milestone.isReached = true;
                    milestone.onMilestoneReached.invoke();
                }
            }
        }

        if (this.currentProgress >= 0.99) {
            this.CompleteStir();
        }
    }

    public EndStir() {
        if (this.isDone) return;
        this.isStirring = false;
        Ply_SoundManager.Ins.StopFxLoop(FxType.Stirring);
    }

    private CompleteStir() {
        if (this.isDone) return;
        this.isDone = true;
        this.isStirring = false;
        Ply_SoundManager.Ins.StopFxLoop(FxType.Stirring);
        this.onStirComplete.invoke();
    }
}
