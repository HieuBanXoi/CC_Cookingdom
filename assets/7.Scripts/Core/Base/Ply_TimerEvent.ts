import { _decorator, Tween, tween } from 'cc';
import { Ply_EventHandlerComponent } from './Ply_EventHandlerComponent';
import { Ply_Event } from './Ply_Event';

const { ccclass, property } = _decorator;

@ccclass('Ply_TimerEvent')
export class Ply_TimerEvent extends Ply_EventHandlerComponent {

    @property({ min: 0, tooltip: 'Default timer duration in seconds' })
    public duration: number = 1.0;

    @property({ tooltip: 'Automatically start timer when node is enabled' })
    public playOnEnable: boolean = false;

    @property({ tooltip: 'Automatically disable this node when timer finishes' })
    public autoDisableOnComplete: boolean = false;

    @property({ type: Ply_Event, tooltip: 'Triggered when timer starts' })
    public onTimerStart: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered when timer completes' })
    public onTimerComplete: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered when timer is stopped manually' })
    public onTimerStop: Ply_Event = new Ply_Event();

    private timerTween: Tween<object> | null = null;
    private isRunning: boolean = false;

    public get IsRunning(): boolean {
        return this.isRunning;
    }

    protected onEnable(): void {
        if (this.playOnEnable) {
            this.StartTimer();
        }
    }

    protected onDisable(): void {
        this.killTimerTween();
    }

    public StartTimer(customDuration?: number): void {
        this.killTimerTween();

        const time = (customDuration !== undefined && customDuration >= 0) ? customDuration : this.duration;
        this.isRunning = true;
        this.onTimerStart.invoke();

        if (time <= 0) {
            this.CompleteTimer();
            return;
        }

        const state = { t: 0 };
        this.timerTween = tween(state)
            .delay(time)
            .call(() => {
                this.CompleteTimer();
            })
            .start();
    }

    public StopTimer(): void {
        if (!this.isRunning && !this.timerTween) return;

        this.killTimerTween();
        this.onTimerStop.invoke();
    }

    public RestartTimer(): void {
        this.StartTimer(this.duration);
    }

    private CompleteTimer(): void {
        this.isRunning = false;
        this.timerTween = null;
        this.onTimerComplete.invoke();

        if (this.autoDisableOnComplete && this.node && this.node.isValid) {
            this.node.active = false;
        }
    }

    private killTimerTween(): void {
        if (this.timerTween) {
            this.timerTween.stop();
            this.timerTween = null;
        }
        this.isRunning = false;
    }
}
