import { _decorator, Enum, ParticleSystem2D, SpriteFrame, Vec3 } from 'cc';
import { PoolMember, PoolType } from '../../Core/Pool/PoolMember';
import { World } from '../../Managers/World';

const { ccclass, property } = _decorator;

/** One entry per food. Add a value here, then assign its sprite frame on the prefab. */
export enum FoodSparkType {
    Default = 0,
    Garlic,
    Onion,
    Tomato,
    Squid,
    Coriander,
    Chili,
    Shrimp,
    Olive,
    Clam,
}
Enum(FoodSparkType);

@ccclass('FoodSparkSprite')
export class FoodSparkSprite {
    @property({ type: Enum(FoodSparkType) })
    public type: FoodSparkType = FoodSparkType.Default;

    @property({ type: SpriteFrame })
    public spriteFrame: SpriteFrame | null = null;
}

/**
 * Pooled particle burst whose particle sprite depends on the food.
 * Spawn with FoodSpark.Spawn(type, worldPosition) or via the pool manager
 * followed by Play(type).
 */
@ccclass('FoodSpark')
export class FoodSpark extends PoolMember {
    @property({ type: [FoodSparkSprite], tooltip: 'Sprite frame used by the particles for each FoodSparkType.' })
    public sprites: FoodSparkSprite[] = [];

    @property({ type: ParticleSystem2D, tooltip: 'Particle system to drive. Defaults to the first one found in children.' })
    public particle: ParticleSystem2D | null = null;

    @property({ min: 0, tooltip: 'Seconds before this spark returns to its pool (0 = wait for the particle to finish).' })
    public lifeTime = 1;

    private currentType: FoodSparkType = FoodSparkType.Default;

    public get CurrentType(): FoodSparkType {
        return this.currentType;
    }

    /** Spawns from the pool at a world position and plays the given food's sprite. */
    public static Spawn(type: FoodSparkType, worldPosition: Vec3): FoodSpark | null {
        const spark = World.instance?.poolManager?.spawnType<FoodSpark>(PoolType.FoodSpark, worldPosition);
        if (!spark) return null;
        spark.node.setWorldPosition(worldPosition);
        spark.Play(type);
        return spark;
    }

    protected onLoad(): void {
        this.particle ??= this.getComponent(ParticleSystem2D) ?? this.getComponentInChildren(ParticleSystem2D);
    }

    protected onDisable(): void {
        this.unschedule(this.DeSpawn);
    }

    /** Sets the particle sprite for the food type and restarts the burst. */
    public Play(type: FoodSparkType = this.currentType, lifeTime: number = this.lifeTime): void {
        this.unschedule(this.DeSpawn);
        this.particle ??= this.getComponent(ParticleSystem2D) ?? this.getComponentInChildren(ParticleSystem2D);
        if (!this.particle) {
            console.warn(`[FoodSpark] No ParticleSystem2D on "${this.node.name}".`);
            this.DeSpawn();
            return;
        }

        this.currentType = type;
        const frame = this.GetSpriteFrame(type);
        if (frame) this.particle.spriteFrame = frame;

        this.particle.node.active = true;
        this.particle.resetSystem();

        const duration = lifeTime > 0 ? lifeTime : this.EstimateParticleDuration();
        this.scheduleOnce(this.DeSpawn, duration);
    }

    public DeSpawn(): void {
        this.unschedule(this.DeSpawn);
        this.particle?.stopSystem();
        World.instance?.poolManager?.despawn(this);
    }

    /** Sprite for the type, falling back to Default, then to the first entry. */
    public GetSpriteFrame(type: FoodSparkType): SpriteFrame | null {
        const exact = this.sprites.find(entry => entry && entry.type === type && entry.spriteFrame);
        if (exact) return exact.spriteFrame;
        const fallback = this.sprites.find(entry => entry && entry.type === FoodSparkType.Default && entry.spriteFrame);
        if (fallback) return fallback.spriteFrame;
        return this.sprites.find(entry => entry?.spriteFrame)?.spriteFrame ?? null;
    }

    private EstimateParticleDuration(): number {
        const ps = this.particle;
        if (!ps) return 1;
        const emit = ps.duration < 0 ? 1 : ps.duration;
        return emit + ps.life + ps.lifeVar;
    }
}
