import { _decorator, ParticleSystem2D } from 'cc';
import { PoolMember } from '../../Core/Pool/PoolMember';
import { World } from '../../Managers/World';

const { ccclass, property } = _decorator;

@ccclass('WaterSplash')
export class WaterSplash extends PoolMember {
    @property({ min: 0, tooltip: 'Seconds before this pooled splash returns to its pool.' })
    public lifeTime = 0.5;

    private particleSystem: ParticleSystem2D | null = null;

    protected onLoad(): void {
        this.particleSystem = this.getComponent(ParticleSystem2D);
    }

    protected onEnable(): void {
        this.Play();
    }

    protected onDisable(): void {
        this.unschedule(this.DeSpawn);
    }

    /** Restarts the lifetime after the splash has been spawned from the pool. */
    public Play(lifeTime: number = this.lifeTime): void {
        this.unschedule(this.DeSpawn);
        this.particleSystem ??= this.getComponent(ParticleSystem2D);
        this.particleSystem?.resetSystem();
        this.scheduleOnce(this.DeSpawn, lifeTime);
    }

    public DeSpawn(): void {
        World.instance?.poolManager?.despawn(this);
    }
}

