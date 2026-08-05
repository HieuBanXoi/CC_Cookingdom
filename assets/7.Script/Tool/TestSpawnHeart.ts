import { _decorator, Component, Node, Vec3 } from 'cc';
import { Ply_Pool, PoolType } from './Ply_Pool';
import { HeartEffect } from '../Effect/HeartEffect';

const { ccclass, property } = _decorator;

/**
 * Script to test spawning HeartEffect from Ply_Pool
 */
@ccclass('TestSpawnHeart')
export class TestSpawnHeart extends Component {

    @property(Node)
    public parentNode: Node = null!;

    @property(Node)
    public spawnPoint: Node = null!;

    @property
    public scaleMultiplier: number = 1.0;

    @property
    public randomRange: number = 50.0;

    /**
     * Spawn 1 HeartEffect under parentNode or this node
     */
    public spawnHeart() {
        const targetParent = this.parentNode || this.node;
        const originPos = this.spawnPoint ? this.spawnPoint.worldPosition : targetParent.worldPosition;

        const spawnPos = new Vec3(
            originPos.x + (Math.random() - 0.5) * this.randomRange,
            originPos.y + (Math.random() - 0.5) * this.randomRange,
            originPos.z
        );

        // Spawn HeartEffect from Pool and set targetParent as Node father
        const heartFX = Ply_Pool.Ins.spawnComponent(HeartEffect, PoolType.HeartFX, spawnPos, undefined, targetParent);
        if (heartFX) {
            console.log(`[TestSpawnHeart] Spawned HeartEffect under parent "${targetParent.name}" at pos: ${spawnPos}`);
            heartFX.PlaySpawnWithScale(this.scaleMultiplier);
        } else {
            console.warn('[TestSpawnHeart] Failed to spawn HeartEffect! Make sure PoolType.HeartFX has a Prefab assigned in Ply_Pool Inspector.');
        }
    }

    /**
     * Spawn multiple HeartEffects (burst effect)
     */
    public spawnHeartBurst() {
        for (let i = 0; i < 5; i++) {
            this.scheduleOnce(() => {
                this.spawnHeart();
            }, i * 0.1);
        }
    }
}
