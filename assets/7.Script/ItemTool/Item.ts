import { _decorator, Node, Sprite, SpriteFrame, Vec3, tween, Tween, Enum, Animation } from 'cc';
import { Ply_GameUnit } from '../Tool/Ply_GameUnit';
import { Ply_Pool, PoolType } from '../Tool/Ply_Pool';
import { Ply_SoundManager, FxType } from '../Tool/Ply_SoundManager';
import { Ply_Event } from '../Tool/Ply_Event';
import { ComponentCache } from '../Tool/CacheComponent';
import { ItemType } from './ItemType';
import { HeartEffect } from '../Effect/HeartEffect';

import { ItemDraggable } from './ItemDraggable';
import { ItemClickable } from './ItemClickable';
import { ItemStirring } from './ItemStirring';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { ItemSound } from './ItemSound';

const { ccclass, property } = _decorator;

@ccclass('Item')
export class Item extends Ply_GameUnit {

    @property({ tooltip: 'Hand tutorial requirement matching' })
    public isDone: boolean = false;

    @property
    public onProcess: boolean = false;

    @property({ tooltip: 'Require matching target type for hand tutorial' })
    public requireMatchingTargetTypeForHandTut: boolean = false;

    @property({ type: Enum(ItemType) })
    public itemType: ItemType = ItemType.None;

    @property(Sprite)
    public spriteRenderer: Sprite = null!;

    @property({ type: Ply_Event })
    public onKnifeIn: Ply_Event = new Ply_Event();

    @property(Node)
    public knifePos: Node = null!;

    @property({ min: 0 })
    public heartEffectScale: number = 1.0;

    @property({ min: 0 })
    public breakHeartEffectScale: number = 1.0;

    @property({ min: 0 })
    public blinkEffectScale: number = 1.0;

    @property({ min: 0 })
    public mergeEffectScale: number = 1.0;

    @property
    public playMoveToTargetFinishSound: boolean = false;

    @property({ type: Enum(FxType) })
    public moveToTargetFinishFxType: FxType = FxType.Complete;

    @property
    public fxSpawnZPos: number = 0;

    // References exposed on Cocos Creator Inspector
    @property({ type: ItemDraggable, tooltip: 'Cached ItemDraggable reference' })
    public itemDraggable: ItemDraggable | null = null;

    @property({ type: ItemClickable, tooltip: 'Cached ItemClickable reference' })
    public itemClickable: ItemClickable | null = null;

    @property({ type: ItemStirring, tooltip: 'Cached ItemStirring reference' })
    public itemStirring: ItemStirring | null = null;

    @property({ type: ItemMoveToTarget, tooltip: 'Cached ItemMoveToTarget reference' })
    public itemMoveToTarget: ItemMoveToTarget | null = null;

    @property({ type: ItemSound, tooltip: 'Cached ItemSound reference' })
    public itemSound: ItemSound | null = null;

    @property({ type: Animation, tooltip: 'Cached Animation reference' })
    public animationComponent: Animation | null = null;

    private activeEffect: Ply_GameUnit | null = null;
    private activeEffectPoolType: PoolType = PoolType.Test;

    protected onLoad() {
        this.cacheComponents(true);
    }

    /**
     * Called automatically by Cocos Creator Editor when user clicks "Reset Component" in Inspector
     */
    public resetInEditor() {
        this.cacheComponents(true);
    }

    /**
     * Reset component state and re-cache all sub-components
     */
    public Reset() {
        this.cacheComponents(true);
    }

    /**
     * Cache all helper and interaction components attached to this node
     */
    public cacheComponents(refreshHiddenReferences: boolean = true) {
        if (!this.spriteRenderer) {
            this.spriteRenderer = this.getComponent(Sprite) || this.getComponentInChildren(Sprite)!;
        }

        if (refreshHiddenReferences || !this.animationComponent) {
            this.animationComponent = this.getComponent(Animation) || this.getComponentInChildren(Animation);
        }

        if (refreshHiddenReferences || !this.itemMoveToTarget) {
            this.itemMoveToTarget = this.getComponent(ItemMoveToTarget) || ComponentCache.get(this.node, ItemMoveToTarget);
        }

        if (refreshHiddenReferences || !this.itemClickable) {
            this.itemClickable = this.getComponent(ItemClickable) || ComponentCache.get(this.node, ItemClickable);
        }

        if (refreshHiddenReferences || !this.itemDraggable) {
            this.itemDraggable = this.getComponent(ItemDraggable) || ComponentCache.get(this.node, ItemDraggable);
        }

        if (refreshHiddenReferences || !this.itemStirring) {
            this.itemStirring = this.getComponent(ItemStirring) || ComponentCache.get(this.node, ItemStirring);
        }

        if (refreshHiddenReferences || !this.itemSound) {
            this.itemSound = this.getComponent(ItemSound) || ComponentCache.get(this.node, ItemSound);
        }
    }

    public ChangeItemType(itemType: ItemType) {
        this.itemType = itemType;
    }

    public ChangeSprite(spriteFrame: SpriteFrame) {
        if (this.spriteRenderer) {
            this.spriteRenderer.spriteFrame = spriteFrame;
        }
    }

    public GetInPlate(plateNode: Node) {
        const time = 0.5;
        const targetPos = plateNode.worldPosition;

        // Jump & Rotate animation using tween
        tween(this.node)
            .to(time, { worldPosition: targetPos }, { easing: 'sineOut' })
            .start();

        tween(this.node)
            .by(time, { eulerAngles: new Vec3(0, 0, -360) })
            .call(() => {
                Ply_SoundManager.Ins.PlayFx(FxType.Drop);
                this.node.setParent(plateNode);

                // Punch scale effect on plate
                const originalScale = plateNode.scale.clone();
                tween(plateNode)
                    .to(0.1, { scale: new Vec3(originalScale.x * 1.1, originalScale.y * 0.9, originalScale.z) })
                    .to(0.1, { scale: originalScale })
                    .start();
            })
            .start();
    }

    public KnifeIn() {
        this.onKnifeIn.invoke();
    }

    public SpawnHeart(isBreak: boolean) {
        this.TurnOffActiveEffect();
        const spawnPos = this.GetEffectSpawnPosition();

        const heartEffect = Ply_Pool.Ins.spawnComponent(HeartEffect, PoolType.HeartFX, spawnPos, undefined, this.node);
        if (heartEffect) {
            this.CacheActiveEffect(heartEffect, PoolType.HeartFX);
            heartEffect.PlaySpawnWithScale(isBreak ? this.breakHeartEffectScale : this.heartEffectScale);
        }
    }

    public OnDragFailReturnComplete() {
        this.SpawnHeart(true);
    }

    public ShouldPlayBobEffectAfterReturn(): boolean {
        return true;
    }

    public TeleportToStart() {
        if (this.itemDraggable) {
            this.itemDraggable.TeleportToStart();
        }
    }

    public DoneAnimation() {
        this.isDone = true;
    }

    public SpawnHeartDone() {
        this.SpawnHeart(false);
    }

    public ItemDone() {
        this.isDone = true;
    }

    public TurnOffActiveEffect() {
        if (this.activeEffect && this.activeEffect.node && this.activeEffect.node.isValid) {
            Ply_Pool.Ins.despawn(this.activeEffectPoolType, this.activeEffect.node);
        }
        this.activeEffect = null;
    }

    private CacheActiveEffect(effect: Ply_GameUnit, poolType: PoolType) {
        this.TurnOffActiveEffect();
        this.activeEffect = effect;
        this.activeEffectPoolType = poolType;
    }

    protected GetEffectSpawnPosition(): Vec3 {
        const spawnPos = this.node.worldPosition.clone();
        spawnPos.z = this.fxSpawnZPos;
        return spawnPos;
    }

    public PlayMoveToTargetFinishSound() {
        if (!this.playMoveToTargetFinishSound) return;
        Ply_SoundManager.Ins.PlayFx(this.moveToTargetFinishFxType);
    }

    public DoOneStep() {
        // Step callback
    }
}
