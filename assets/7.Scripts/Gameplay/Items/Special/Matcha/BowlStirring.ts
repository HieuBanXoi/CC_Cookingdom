import { _decorator, EventTouch, Node, Vec3 } from 'cc';
import { ItemStirring } from '../../Common/ItemStirring';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { GameManager } from '../../../../Managers/GameManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/** Scale signs cycled on flipNode: normal -> flip X -> flip X+Y -> flip Y. */
const FLIP_SIGNS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

/**
 * Circle stirring in a bowl: the player drags around centerPoint, the stirrer
 * (chasen) orbits the center following the finger, and flipNode is flipped
 * left/right/up/down every `flipEveryDegrees` to make the liquid look alive.
 * Any direction counts toward `turnsToComplete`.
 */
@ccclass('BowlStirring')
export class BowlStirring extends ItemStirring {
    @property({ group: { name: 'Bowl', id: 'bowl', displayOrder: 0 }, min: 0, tooltip: 'Bán kính chasen chạy vòng quanh vị trí gốc của nó (world, px).' })
    public orbitRadius: number = 60;

    @property({ group: { name: 'Bowl', id: 'bowl' }, min: 0.1, tooltip: 'Số vòng (cộng cả hai chiều) để khuấy xong.' })
    public turnsToComplete: number = 3;

    @property({ group: { name: 'Bowl', id: 'bowl' }, min: 0, tooltip: 'Bỏ qua chạm quá gần tâm (px) để góc không nhảy lung tung.' })
    public minTouchRadius: number = 20;

    @property({ group: { name: 'Bowl', id: 'bowl' }, type: Node, tooltip: 'Node lật trái/phải/trên/dưới khi khuấy (MATCHA_Stirring).' })
    public flipNode: Node | null = null;

    @property({ group: { name: 'Bowl', id: 'bowl' }, min: 5, tooltip: 'Khuấy được bao nhiêu độ thì lật flipNode một lần.' })
    public flipEveryDegrees: number = 90;

    @property({ group: { name: 'Bowl', id: 'bowl' }, min: 0, tooltip: 'Ngừng khuấy bao lâu (giây) thì tắt âm thanh.' })
    public idleStopDelay: number = 0.15;

    @property({ group: { name: 'Events', id: 'stir' }, type: Ply_Event, tooltip: 'Tiến độ khuấy 0..1.' })
    public onProgress: Ply_Event = new Ply_Event();

    private stirring = false;
    private done = false;
    private totalDegrees = 0;
    private flipDegrees = 0;
    private flipIndex = 0;
    private lastAngle: number | null = null;
    private idleTime = 0;
    private moving = false;
    private orbitCenter = new Vec3();
    private flipBaseScale = new Vec3(1, 1, 1);

    public get IsDone(): boolean {
        return this.done;
    }

    public get IsStirring(): boolean {
        return this.stirring;
    }

    public get Progress(): number {
        return Math.min(1, this.totalDegrees / (Math.max(0.1, this.turnsToComplete) * 360));
    }

    protected onLoad(): void {
        super.onLoad();
        if (this.flipNode) {
            const s = this.flipNode.scale;
            this.flipBaseScale.set(Math.abs(s.x), Math.abs(s.y), s.z);
        }
    }

    /** Remembers where the stirrer rests; it orbits around that point. */
    public SetStirrer(stirrer: Node): void {
        this.stirrerTransform = stirrer;
        Vec3.copy(this.orbitCenter, stirrer.worldPosition);
    }

    public BeginStir(event?: EventTouch): void {
        if (!GameManager.Ins?.IsPlaying() || this.done || !this.enabled) return;
        if (this.stirrerTransform && this.orbitCenter.equals(Vec3.ZERO)) Vec3.copy(this.orbitCenter, this.stirrerTransform.worldPosition);
        this.stirring = true;
        this.lastAngle = event ? this.AngleOf(event) : null;
        this.onStirBegin.invoke();
    }

    public Stir(event: EventTouch): void {
        if (!this.stirring || this.done || !this.enabled) return;

        const angle = this.AngleOf(event);
        if (angle === null) return;
        this.MoveStirrer(angle);
        if (this.lastAngle === null) {
            this.lastAngle = angle;
            return;
        }

        let delta = angle - this.lastAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        this.lastAngle = angle;
        if (Math.abs(delta) < 0.01) return;

        this.SetMoving(true);
        this.totalDegrees += Math.abs(delta);

        this.flipDegrees += Math.abs(delta);
        while (this.flipDegrees >= this.flipEveryDegrees) {
            this.flipDegrees -= this.flipEveryDegrees;
            this.Flip();
        }

        this.onProgress.invoke(this.Progress);
        if (this.Progress >= 1) this.CompleteStir();
    }

    public EndStir(): void {
        if (this.done) return;
        this.stirring = false;
        this.lastAngle = null;
        this.SetMoving(false);
    }

    public CompleteStir(): void {
        if (this.done) return;
        this.done = true;
        this.stirring = false;
        this.SetMoving(false);
        this.onStirComplete.invoke();
    }

    public ResetStir(): void {
        this.done = false;
        this.stirring = false;
        this.totalDegrees = 0;
        this.flipDegrees = 0;
        this.lastAngle = null;
        this.SetMoving(false);
    }

    protected update(dt: number = 0): void {
        if (!this.moving) return;
        this.idleTime += dt;
        if (this.idleTime >= this.idleStopDelay) this.SetMoving(false);
    }

    private MoveStirrer(angleDeg: number): void {
        const stirrer = this.stirrerTransform;
        if (!stirrer) return;
        const rad = angleDeg * Math.PI / 180;
        stirrer.setWorldPosition(
            this.orbitCenter.x + Math.cos(rad) * this.orbitRadius,
            this.orbitCenter.y + Math.sin(rad) * this.orbitRadius,
            stirrer.worldPosition.z,
        );
    }

    private Flip(): void {
        if (!this.flipNode) return;
        this.flipIndex = (this.flipIndex + 1) % FLIP_SIGNS.length;
        const [sx, sy] = FLIP_SIGNS[this.flipIndex];
        this.flipNode.setScale(this.flipBaseScale.x * sx, this.flipBaseScale.y * sy, this.flipBaseScale.z);
    }

    private SetMoving(moving: boolean): void {
        this.idleTime = 0;
        if (moving === this.moving) return;
        this.moving = moving;
        if (moving) Ply_SoundManager.Ins?.PlayFxLoop(FxType.Stirring);
        else Ply_SoundManager.Ins?.StopFxLoop(FxType.Stirring);
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
