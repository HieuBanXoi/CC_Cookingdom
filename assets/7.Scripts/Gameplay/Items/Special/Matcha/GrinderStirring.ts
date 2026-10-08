import { _decorator, Enum, EventTouch, Node, ParticleSystem2D, Vec3 } from 'cc';
import { ItemStirring } from '../../Common/ItemStirring';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { GameManager } from '../../../../Managers/GameManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Turn-the-handle stirring: the player drags around centerPoint, every
 * `360 / frames.length` degrees shows the next frame in the turning direction.
 * Any direction counts toward `turnsToComplete`. Being an ItemStirring,
 * InputManager feeds it touches and HandTutManager shows the circle hint.
 */
@ccclass('GrinderStirring')
export class GrinderStirring extends ItemStirring {
    @property({ group: { name: 'Grind', id: 'grind', displayOrder: 0 }, type: [Node], tooltip: 'Các frame xoay (Grinder_1..8), bật lần lượt theo chiều xoay.' })
    public frames: Node[] = [];

    @property({ group: { name: 'Grind', id: 'grind' }, tooltip: 'Bật: xoay ngược kim đồng hồ thì frame 1→2→3. Tắt: xoay theo kim đồng hồ thì 1→2→3.' })
    public counterClockwiseIsForward: boolean = true;

    @property({ group: { name: 'Grind', id: 'grind' }, min: 0.1, tooltip: 'Số vòng (cộng cả hai chiều) để xay xong.' })
    public turnsToComplete: number = 3;

    @property({ group: { name: 'Grind', id: 'grind' }, min: 0, tooltip: 'Bỏ qua chạm quá gần tâm (px) để góc không nhảy lung tung.' })
    public minTouchRadius: number = 20;

    @property({ group: { name: 'Grind', id: 'grind' }, type: ParticleSystem2D, tooltip: 'Particle bột rơi, chạy khi đang xoay.' })
    public particle: ParticleSystem2D | null = null;

    @property({ group: { name: 'Grind', id: 'grind' }, min: 0, tooltip: 'Ngừng xoay bao lâu (giây) thì tắt particle/âm thanh.' })
    public idleStopDelay: number = 0.15;

    @property({ group: { name: 'Grind', id: 'grind' }, type: Enum(FxType), tooltip: 'Âm thanh lặp lại khi đang xoay.' })
    public grindFx: FxType = FxType.KnifeSwing;

    @property({ group: { name: 'Events', id: 'stir' }, type: Ply_Event, tooltip: 'Tiến độ xay 0..1.' })
    public onProgress: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'stir' }, type: Ply_Event, tooltip: 'Đổi frame (truyền số bước đã quay, + là chiều tiến).' })
    public onFrameChanged: Ply_Event = new Ply_Event();

    private grinding = false;
    private done = false;
    private totalDegrees = 0;
    private stepDegrees = 0;
    private frameIndex = 0;
    /** Net frame steps since start (+ forward, - backward). */
    private netSteps = 0;
    private lastAngle: number | null = null;
    private idleTime = 0;
    private moving = false;

    public get IsDone(): boolean {
        return this.done;
    }

    public get IsStirring(): boolean {
        return this.grinding;
    }

    public get Progress(): number {
        return Math.min(1, this.totalDegrees / (Math.max(0.1, this.turnsToComplete) * 360));
    }

    public get NetSteps(): number {
        return this.netSteps;
    }

    protected onLoad(): void {
        super.onLoad();
        const shown = this.frames.findIndex(frame => frame?.active);
        this.frameIndex = Math.max(0, shown);
        this.ShowFrame(this.frameIndex);
        this.particle?.stopSystem();
    }

    /** Any handle frame counts as the grinder (frames are drawn outside the node rect). */
    public ContainsTouch(worldPoint: Vec3): boolean {
        if (super.ContainsTouch(worldPoint)) return true;
        return this.frames.some(frame => !!frame && ItemStirring.RectContains(frame, worldPoint));
    }

    public BeginStir(event?: EventTouch): void {
        if (!GameManager.Ins?.IsPlaying() || this.done || !this.enabled) return;
        this.grinding = true;
        this.lastAngle = event ? this.AngleOf(event) : null;
        this.onStirBegin.invoke();
    }

    public Stir(event: EventTouch): void {
        if (!this.grinding || this.done || !this.enabled) return;

        const angle = this.AngleOf(event);
        if (angle === null) return;
        if (this.lastAngle === null) {
            this.lastAngle = angle;
            return;
        }

        // Shortest signed difference, + = counter-clockwise.
        let delta = angle - this.lastAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        this.lastAngle = angle;
        if (Math.abs(delta) < 0.01) return;

        this.SetMoving(true);
        this.totalDegrees += Math.abs(delta);

        const frameDegrees = 360 / Math.max(1, this.frames.length);
        this.stepDegrees += this.counterClockwiseIsForward ? delta : -delta;
        while (this.stepDegrees >= frameDegrees) {
            this.stepDegrees -= frameDegrees;
            this.Step(1);
        }
        while (this.stepDegrees <= -frameDegrees) {
            this.stepDegrees += frameDegrees;
            this.Step(-1);
        }

        this.onProgress.invoke(this.Progress);
        if (this.Progress >= 1) this.CompleteStir();
    }

    public EndStir(): void {
        if (this.done) return;
        this.grinding = false;
        this.lastAngle = null;
        this.SetMoving(false);
    }

    public CompleteStir(): void {
        if (this.done) return;
        this.done = true;
        this.grinding = false;
        this.SetMoving(false);
        this.onStirComplete.invoke();
    }

    public ResetStir(): void {
        this.done = false;
        this.grinding = false;
        this.totalDegrees = 0;
        this.stepDegrees = 0;
        this.netSteps = 0;
        this.lastAngle = null;
        this.SetMoving(false);
    }

    protected update(dt: number = 0): void {
        if (!this.moving) return;
        this.idleTime += dt;
        if (this.idleTime >= this.idleStopDelay) this.SetMoving(false);
    }

    private Step(direction: number): void {
        const count = this.frames.length;
        if (count === 0) return;
        this.frameIndex = (this.frameIndex + direction + count) % count;
        this.netSteps += direction;
        this.ShowFrame(this.frameIndex);
        this.onFrameChanged.invoke(this.netSteps);
    }

    private ShowFrame(index: number): void {
        this.frames.forEach((frame, i) => {
            if (frame) frame.active = i === index;
        });
    }

    /** Particle + grinding sound run only while the handle is actually turning. */
    private SetMoving(moving: boolean): void {
        this.idleTime = 0;
        if (moving === this.moving) return;
        this.moving = moving;
        if (moving) {
            this.particle?.resetSystem();
            Ply_SoundManager.Ins?.PlayFxLoop(this.grindFx);
        } else {
            this.particle?.stopSystem();
            Ply_SoundManager.Ins?.StopFxLoop(this.grindFx);
        }
    }

    private AngleOf(event: EventTouch): number | null {
        const touch = event.getUILocation();
        const center = (this.centerPoint ?? this.node).worldPosition;
        const dx = touch.x - center.x;
        const dy = touch.y - center.y;
        if (Math.hypot(dx, dy) < this.minTouchRadius) return null;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
}
