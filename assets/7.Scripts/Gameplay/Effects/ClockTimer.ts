import { _decorator, Node, Sprite, Tween, tween, Vec3 } from 'cc';
import { World } from '../../Managers/World';
import { PoolMember, PoolType } from '../../Core/Pool/PoolMember';
import { Item } from '../Items/Item';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/** A pooled countdown visual that drains a Sprite.fillRange from 1 to 0. */
@ccclass('ClockTimer')
export class ClockTimer extends PoolMember {
    @property({ type: Sprite, tooltip: 'Sprite already configured with the desired fill type.' })
    public fillSprite: Sprite | null = null;

    @property({ tooltip: 'Default countdown duration in seconds.' })
    public defaultDuration = 1;

    @property({ tooltip: 'Default world-space offset from the item.' })
    public itemOffset: Vec3 = new Vec3(0, 120, 0);

    @property({ tooltip: 'Return this timer to the pool after onComplete is invoked.' })
    public despawnOnComplete = true;

    @property({ type: Ply_Event, tooltip: 'Invoked once when the fill range reaches zero.' })
    public onComplete: Ply_Event = new Ply_Event();

    private tweenFill: Tween<Sprite> | null = null;
    private isRunning = false;
    private isClockTickPlaying = false;

    protected onLoad(): void {
        this.fillSprite ??= this.getComponentInChildren(Sprite);
        this.type = PoolType.ClockTimer;
    }

    protected onDisable(): void {
        this.StopTimer();
    }

    /** Starts this pooled timer, optionally parented to a dedicated clock position. */
    public StartTimer(
        item: Item | Node | null,
        duration: number = this.defaultDuration,
        offset?: Vec3,
        clockParent?: Node,
    ): void {
        if (clockParent?.isValid) {
            this.node.setParent(clockParent);
            this.node.setPosition(0, 0, 0);
            this.PlayTimer(duration);
            return;
        }

        const itemNode = item instanceof Item ? item.node : item;
        if (itemNode?.isValid) {
            const itemPosition = itemNode.worldPosition;
            const timerOffset = offset ?? this.itemOffset;
            this.node.setWorldPosition(
                itemPosition.x + timerOffset.x,
                itemPosition.y + timerOffset.y,
                itemPosition.z + timerOffset.z,
            );
        }

        this.PlayTimer(duration);
    }

    /** Plays the countdown on the current timer position. */
    public PlayTimer(duration: number = this.defaultDuration): void {
        if (!this.fillSprite) {
            console.warn(`[ClockTimer] Fill Sprite is missing on "${this.node.name}".`);
            return;
        }

        this.StopTimer();
        this.isRunning = true;
        this.fillSprite.fillRange = 1;
        Ply_SoundManager.Ins?.PlayFxLoop(FxType.ClockTick);
        this.isClockTickPlaying = true;
        const safeDuration = Math.max(0.01, duration);

        this.tweenFill = tween(this.fillSprite)
            .to(safeDuration, { fillRange: 0 })
            .call(() => this.FinishTimer())
            .start();
    }

    public StopTimer(): void {
        this.tweenFill?.stop();
        this.tweenFill = null;
        this.isRunning = false;
        this.stopClockTickSound();
        if (this.fillSprite) this.fillSprite.fillRange = 1;
    }

    public get IsRunning(): boolean {
        return this.isRunning;
    }

    public FinishTimer(): void {
        if (!this.isRunning) return;
        this.isRunning = false;
        this.tweenFill = null;
        this.stopClockTickSound();
        Ply_SoundManager.Ins?.PlayFx(FxType.Complete);
        this.onComplete?.invoke(this);

        if (this.despawnOnComplete) {
            World.instance?.poolManager?.despawn(this);
        }
    }

    private stopClockTickSound(): void {
        if (!this.isClockTickPlaying) return;
        Ply_SoundManager.Ins?.StopFxLoop(FxType.ClockTick);
        this.isClockTickPlaying = false;
    }

    /** Convenience API: spawns a ClockTimer from the configured pool. */
    public static SpawnForItem(
        item: Item | Node,
        duration: number,
        offset?: Vec3,
        clockParent?: Node,
    ): ClockTimer | null {
        const itemNode = item instanceof Item ? item.node : item;
        const timer = World.instance?.poolManager?.spawnType<ClockTimer>(
            PoolType.ClockTimer,
            itemNode.worldPosition.clone(),
        );
        if (!timer) return null;

        timer.StartTimer(item, duration, offset, clockParent);
        return timer;
    }
}
