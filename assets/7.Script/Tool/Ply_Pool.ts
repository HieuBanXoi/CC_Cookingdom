import { _decorator, Component, Node, Prefab, Vec3, Quat, instantiate, Enum, CCInteger } from 'cc';
import { Ply_Singleton } from './Ply_Singleton';
import { Ply_GameUnit } from './Ply_GameUnit';
import { ComponentCache } from './CacheComponent';

const { ccclass, property } = _decorator;

export enum PoolType {
    Test = 0,
    HeartFX
}
Enum(PoolType);

@ccclass('PoolAmount')
export class PoolAmount {
    @property({ type: Enum(PoolType) })
    public type: PoolType = PoolType.Test;

    @property({ type: CCInteger, tooltip: 'Pre-instantiated amount' })
    public amount: number = 5;

    @property({ type: Prefab, tooltip: 'Corresponding prefab' })
    public prefab: Prefab = null!;
}

@ccclass('Ply_Pool')
export class Ply_Pool extends Ply_Singleton<Ply_Pool> {

    @property({ type: [PoolAmount] })
    public poolAmounts: PoolAmount[] = [];

    // Map storing inactive nodes grouped by PoolType
    private dict: Map<PoolType, Node[]> = new Map();

    protected onLoad() {
        super.onLoad();
        this.onInit();
    }

    private onInit() {
        if (!this.poolAmounts) return;

        for (let i = 0; i < this.poolAmounts.length; i++) {
            const item = this.poolAmounts[i];
            if (!item || !item.prefab) continue;

            if (!this.dict.has(item.type)) {
                this.dict.set(item.type, []);
            }

            const queue = this.dict.get(item.type)!;
            for (let j = 0; j < item.amount; j++) {
                const node = instantiate(item.prefab);
                node.setParent(this.node);
                node.active = false;
                queue.push(node);
            }
        }
    }

    /**
     * Spawn a Node from Pool.
     * @param poolType Target PoolType
     * @param pos Position
     * @param rot Rotation
     * @param parent Optional parent Node to set. If provided, sets parent to this Node.
     */
    public spawn(poolType: PoolType, pos: Vec3 = new Vec3(), rot: Quat = new Quat(), parent: Node | null = null): Node | null {
        if (!this.dict.has(poolType)) {
            this.dict.set(poolType, []);
        }

        const queue = this.dict.get(poolType)!;
        let node: Node | null = null;

        while (queue.length > 0) {
            const candidate = queue.shift()!;
            if (candidate && candidate.isValid) {
                node = candidate;
                break;
            }
        }

        if (!node) {
            const prefab = this.getPrefab(poolType);
            if (!prefab) {
                console.warn(`[Ply_Pool] Prefab not found for PoolType: ${PoolType[poolType] ?? poolType}`);
                return null;
            }
            node = instantiate(prefab);
        }

        if (parent && parent.isValid) {
            node.setParent(parent);
        } else if (!node.parent || !node.parent.isValid) {
            node.setParent(this.node);
        }

        node.setWorldPosition(pos);
        node.setWorldRotation(rot);
        node.active = true;

        const gameUnit = ComponentCache.get(node, Ply_GameUnit);
        if (gameUnit) {
            gameUnit.reuse();
        }

        return node;
    }

    /**
     * Spawn a Node from Pool and return requested Component.
     */
    public spawnComponent<T extends Component>(
        type: { new(...args: any[]): T } | (abstract new (...args: any[]) => T),
        poolType: PoolType,
        pos: Vec3 = new Vec3(),
        rot: Quat = new Quat(),
        parent: Node | null = null
    ): T | null {
        const node = this.spawn(poolType, pos, rot, parent);
        if (!node) return null;
        return ComponentCache.get(node, type as any);
    }

    /**
     * Return a Node back to Pool (Despawn).
     */
    public despawn(poolType: PoolType, node: Node) {
        if (!node || !node.isValid) return;

        const gameUnit = ComponentCache.get(node, Ply_GameUnit);
        if (gameUnit) {
            gameUnit.unuse();
        }

        node.active = false;

        if (!this.dict.has(poolType)) {
            this.dict.set(poolType, []);
        }

        this.dict.get(poolType)!.push(node);
    }

    public getPrefab(poolType: PoolType): Prefab | null {
        if (!this.poolAmounts) return null;
        for (let i = 0; i < this.poolAmounts.length; i++) {
            if (this.poolAmounts[i] && this.poolAmounts[i].type === poolType) {
                return this.poolAmounts[i].prefab;
            }
        }
        return null;
    }
}
