import { _decorator, Tween, tween, Vec3 } from 'cc';
import { Ply_GameUnit } from '../Tool/Ply_GameUnit';
import { Ply_Pool, PoolType } from '../Tool/Ply_Pool';
import { FxType, Ply_SoundManager } from '../Tool/Ply_SoundManager';

const { ccclass, property } = _decorator;

/** Pooled broken-heart feedback displayed when an item drag fails. */
@ccclass('BreakHeartEffect')
export class BreakHeartEffect extends Ply_GameUnit {
    @property
    public defaultLifeTime = 1.0;

    private defaultScale = new Vec3(1, 1, 1);
    private defaultLocalEulerAngles = new Vec3(0, 0, 0);
    private isDefaultStateCached = false;

    public unuse(): void {
        super.unuse();
        this.resetState();
    }

    public PlaySpawnWithScale(scaleMultiplier: number): void {
        this.PlaySpawn(this.defaultLifeTime, scaleMultiplier);
    }

    public PlaySpawn(lifeTime: number = this.defaultLifeTime, scaleMultiplier = 1.0): void {
        this.cacheDefaultState();
        this.resetState();

        this.node.setScale(Vec3.ZERO);
        Ply_SoundManager.Ins.PlayFx(FxType.Failed);

        const targetScale = new Vec3(
            this.defaultScale.x * Math.max(0, scaleMultiplier),
            this.defaultScale.y * Math.max(0, scaleMultiplier),
            this.defaultScale.z * Math.max(0, scaleMultiplier),
        );

        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.25, { scale: targetScale }, { easing: 'backOut' })
            .to(0.12, { eulerAngles: new Vec3(0, 0, 3) }, { easing: 'sineOut' })
            .to(0.18, { eulerAngles: new Vec3(0, 0, -3) }, { easing: 'sineInOut' })
            .to(0.12, { eulerAngles: this.defaultLocalEulerAngles }, { easing: 'sineIn' })
            .start();

        this.scheduleOnce(this.DeSpawn, lifeTime);
    }

    public DeSpawn(): void {
        this.resetState();
        Ply_Pool.Ins.despawn(PoolType.BreakHeartFX, this.node);
    }

    private cacheDefaultState(): void {
        if (this.isDefaultStateCached) return;

        if (this.node.scale.x !== 0 && this.node.scale.y !== 0) {
            Vec3.copy(this.defaultScale, this.node.scale);
        }
        Vec3.copy(this.defaultLocalEulerAngles, this.node.eulerAngles);
        this.isDefaultStateCached = true;
    }

    private resetState(): void {
        this.unschedule(this.DeSpawn);
        Tween.stopAllByTarget(this.node);

        if (this.isDefaultStateCached) {
            this.node.setScale(this.defaultScale);
            this.node.eulerAngles = this.defaultLocalEulerAngles;
        }
    }
}
