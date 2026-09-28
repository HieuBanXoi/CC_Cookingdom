import { _decorator, Vec3 } from 'cc';
import { World } from '../../Managers/World';
import { PoolMember } from '../../Core/Pool/PoolMember';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';
const { ccclass, property } = _decorator;

@ccclass('BlinkEffect')
export class BlinkEffect extends PoolMember {
    @property
    public defaultLifeTime = 1.0;

    private defaultScale: Vec3 | null = null;

    /** Scales the effect relative to its prefab scale (pooled instances keep the scale of their last use). */
    public ApplyScale(scaleMultiplier: number): void {
        this.defaultScale ??= this.node.scale.clone();
        const multiplier = Math.max(0, scaleMultiplier);
        this.node.setScale(this.defaultScale.x * multiplier, this.defaultScale.y * multiplier, this.defaultScale.z * multiplier);
    }

    public DeSpawnByTime(): void {
        this.unschedule(this.DeSpawn);
        this.scheduleOnce(this.DeSpawn, this.defaultLifeTime);
    }

    public DeSpawn(): void {
        World.instance?.poolManager?.despawn(this);
    }
}


