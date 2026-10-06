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

    /** Scales from the prefab scale, so a pooled instance never compounds earlier multipliers. */
    public SetScaleMultiplier(multiplier: number): void {
        this.defaultScale ??= this.node.scale.clone();
        const m = Math.max(0, multiplier);
        this.node.setScale(this.defaultScale.x * m, this.defaultScale.y * m, this.defaultScale.z);
    }

    public DeSpawnByTime(): void {
        this.unschedule(this.DeSpawn);
        this.scheduleOnce(this.DeSpawn, this.defaultLifeTime);
    }

    public DeSpawn(): void {
        World.instance?.poolManager?.despawn(this);
    }
}


