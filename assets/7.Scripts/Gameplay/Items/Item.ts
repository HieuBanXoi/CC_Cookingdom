import { _decorator, Node, Sprite, SpriteFrame, Tween, tween, Vec3, Enum, Animation, EventHandler, animation, SkeletalAnimation } from 'cc';
import { Ply_GameUnit } from '../../Core/Base/Ply_GameUnit';
import { PoolMember, PoolType } from '../../Core/Pool/PoolMember';
import { World } from '../../Managers/World';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { ItemType } from './ItemType';
import { HeartEffect } from '../Effects/HeartEffect';
import { BreakHeartEffect } from '../Effects/BreakHeartEffect';
import { BlinkEffect } from '../Effects/BlinkEffect';
import { FoodSpark, FoodSparkType } from '../Effects/FoodSpark';
import { Ply_Event } from '../../Core/Base/Ply_Event';

import { ItemDraggable } from './ItemDraggable';
import { ItemClickable } from './ItemClickable';
import { ItemStirring } from './ItemStirring';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { ItemSound } from './ItemSound';
import { PhaseManager } from '../../Managers/PhaseManager';

const { ccclass, property } = _decorator;

/**
 * Custom hand-tutorial hint for gestures HandTutManager cannot infer from
 * ItemClickable / ItemDraggable / ItemStirring (swipes, off-screen targets...).
 * World-space positions.
 */
export interface HandTutHint {
    kind: 'click' | 'drag' | 'path';
    /** click: the point to tap. drag: start. */
    from?: Vec3;
    /** drag: end. */
    to?: Vec3;
    /** path: waypoints (>= 2). */
    path?: Vec3[];
}

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

    @property({ type: Ply_Event, tooltip: 'Knife in event' })
    public onKnifeIn: Ply_Event = new Ply_Event();

    @property(Node)
    public knifePos: Node = null!;

    @property({ type: Node, tooltip: 'Knife node that cuts this item. Set automatically by Knife.SetTarget().' })
    public knife: Node | null = null;

    @property({ min: 0 })
    public heartEffectScale: number = 1.0;

    @property({ min: 0 })
    public breakHeartEffectScale: number = 1.0;

    @property({ min: 0 })
    public blinkEffectScale: number = 1.0;

    @property({ tooltip: 'Spawn a break heart when the player taps this item while all its interactions are locked.' })
    public spawnBreakHeartOnBlockedTap: boolean = true;

    @property({ type: Node, tooltip: 'Where SpawnFoodSpark() plays the spark. Empty = this item position.' })
    public foodSparkSpawnPos: Node | null = null;

    @property({ type: Enum(FoodSparkType), tooltip: 'Food sprite used by SpawnFoodSpark().' })
    public foodSparkType: FoodSparkType = FoodSparkType.Default;

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

    @property({ type: animation.AnimationController, tooltip: 'Cached AnimationController reference' })
    public animationController: animation.AnimationController | null = null;

    private activeEffect: PoolMember | null = null;

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

        if (refreshHiddenReferences || !this.animationController) {
            this.animationController = this.getComponent(animation.AnimationController)
                || this.getComponentInChildren(animation.AnimationController);
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

    /** Changes this item's type from an ItemType enum name (for example, "Pan"). */
    public ChangeItemType(itemTypeName: string): void {
        const normalizedName = itemTypeName?.trim().toLowerCase();
        const enumKey = Object.keys(ItemType).find(key =>
            Number.isNaN(Number(key)) && key.toLowerCase() === normalizedName
        );

        if (!enumKey) {
            console.warn(`[Item] Invalid ItemType "${itemTypeName}" on ${this.node.name}.`);
            return;
        }

        this.itemType = ItemType[enumKey as keyof typeof ItemType] as ItemType;
    }

    public ChangeSprite(spriteFrame: SpriteFrame) {
        if (this.spriteRenderer) {
            this.spriteRenderer.spriteFrame = spriteFrame;
        }
    }

    /**
     * Play animation clip by index from cached Animation or SkeletalAnimation component
     */
    public PlayClipWithIndex(index: number) {
        if (!this.animationComponent) {
            this.animationComponent = this.getComponent(Animation) || this.getComponentInChildren(Animation);
        }

        if (this.animationComponent) {
            const clips = this.animationComponent.clips;
            if (clips && index >= 0 && index < clips.length && clips[index]) {
                const clipName = clips[index]!.name;
                this.animationComponent.play(clipName);
                return;
            }
        }

        const skelAnim = this.getComponent(SkeletalAnimation) || this.getComponentInChildren(SkeletalAnimation);
        if (skelAnim) {
            const clips = skelAnim.clips;
            if (clips && index >= 0 && index < clips.length && clips[index]) {
                skelAnim.play(clips[index]!.name);
                return;
            }
        }

        console.warn(`[Item] Animation clip at index ${index} not found on node "${this.node.name}"!`);
    }

    /**
     * Set trigger / play animation state by name for AnimationController, Animation or SkeletalAnimation
     */
    public PlayTrigger(triggerName: string) {
        if (!triggerName || triggerName.trim() === '') return;

        // 1. Support AnimationController (Animation Graph in Cocos 3.x)
        if (!this.animationController) {
            this.animationController = this.getComponent(animation.AnimationController)
                || this.getComponentInChildren(animation.AnimationController);
        }
        if (this.animationController) {
            this.animationController.setValue(triggerName, true);
            return;
        }

        // 2. Support standard Animation component
        if (!this.animationComponent) {
            this.animationComponent = this.getComponent(Animation) || this.getComponentInChildren(Animation);
        }
        if (this.animationComponent) {
            this.animationComponent.play(triggerName);
            return;
        }

        // 3. Support SkeletalAnimation component
        const skelAnim = this.getComponent(SkeletalAnimation) || this.getComponentInChildren(SkeletalAnimation);
        if (skelAnim) {
            skelAnim.play(triggerName);
        }
    }

    public GetInPlate(plateNode: Node) {
        const time = 0.5;
        const plateWorld = plateNode.worldPosition;
        const targetPos = new Vec3(plateWorld.x, plateWorld.y, this.node.worldPosition.z);

        Tween.stopAllByTarget(this.node);
        Tween.stopAllByTarget(plateNode);
        tween(this.node).to(time, { worldPosition: targetPos }, { easing: 'sineOut' }).start();

        const curEuler = this.node.eulerAngles;
        tween(this.node)
            .to(time, { eulerAngles: new Vec3(curEuler.x, curEuler.y, curEuler.z - 360) }, { easing: 'sineOut' })
            .call(() => {
                Ply_SoundManager.Ins.PlayFx(FxType.Drop);
                this.node.setParent(plateNode);

                // Punch scale effect on plate
                const plateScale = plateNode.scale.clone();
                tween(plateNode)
                    .to(0.1, { scale: plateScale.clone().multiplyScalar(1.1) })
                    .to(0.1, { scale: plateScale })
                    .start();
            })
            .start();
    }

    public KnifeIn() {
        console.log(`[Item] KnifeIn called on item "${this.node.name}"`);
        this.onKnifeIn.invoke();
    }

    /** Stores the knife that targets this item. Called by Knife.SetTarget(). */
    public SetKnife(knife: Node | null): void {
        this.knife = knife;
    }

    /** Lets the stored knife be dropped on this item (sets its targetItemType + defaultTarget). */
    public EnableKnife(): void {
        if (!this.knife || !this.knife.isValid) return;
        this.knife.active = true;
        this.knife = null;
        Ply_SoundManager.Ins?.PlayFx(FxType.KnifePlace);
    }
    public CutDone() {
        this.EnableItemDraggable();
    }

    /** Spawns the success heart effect from the HeartFX pool. */
    public SpawnHeart() {
        this.TurnOffActiveEffect();
        const spawnPos = this.GetEffectSpawnPosition();

        const heartEffect = World.instance?.poolManager?.spawnType<HeartEffect>(PoolType.HeartFX, spawnPos);
        if (heartEffect) {
            this.AttachEffectToItem(heartEffect);
            this.CacheActiveEffect(heartEffect);
            heartEffect.PlaySpawnWithScale(this.heartEffectScale);
        }
    }

    /** Spawns the failed-drop break-heart effect from the BreakHeartFX pool. */
    public SpawnBreakHeart() {
        this.TurnOffActiveEffect();
        const spawnPos = this.GetEffectSpawnPosition();

        const breakHeartEffect = World.instance?.poolManager?.spawnType<BreakHeartEffect>(PoolType.BreakHeartFX, spawnPos);
        if (breakHeartEffect) {
            this.AttachEffectToItem(breakHeartEffect);
            this.CacheActiveEffect(breakHeartEffect);
            breakHeartEffect.PlaySpawnWithScale(this.breakHeartEffectScale);
        }
    }

    /** Break heart feedback when the player taps this locked item. Called by InputManager. */
    public SpawnBreakHeartOnBlockedTap(): void {
        if (!this.spawnBreakHeartOnBlockedTap) return;
        this.SpawnBreakHeart();
    }

    public EnableBreakHeartOnBlockedTap(): void {
        this.spawnBreakHeartOnBlockedTap = true;
    }

    public DisableBreakHeartOnBlockedTap(): void {
        this.spawnBreakHeartOnBlockedTap = false;
    }

    /** Spawns a break heart at another visible node while this item is hidden. */
    public SpawnBreakHeartAt(target: Node | null): void {
        if (!target?.isValid) {
            this.SpawnBreakHeart();
            return;
        }

        this.TurnOffActiveEffect();
        const breakHeartEffect = World.instance?.poolManager?.spawnType<BreakHeartEffect>(PoolType.BreakHeartFX, target.worldPosition);
        if (breakHeartEffect) {
            if (breakHeartEffect.node.parent !== target) breakHeartEffect.node.setParent(target);
            breakHeartEffect.node.setPosition(0, 0, 0);
            breakHeartEffect.node.setWorldRotationFromEuler(0, 0, 0);
            this.CacheActiveEffect(breakHeartEffect);
            breakHeartEffect.PlaySpawnWithScale(this.breakHeartEffectScale);
        }
    }

    /** Spawns the blink effect from the BlinkFX pool at this item's position. */
    public SpawnBlinkEffect() {
        this.TurnOffActiveEffect();
        const spawnPos = this.GetEffectSpawnPosition();
        const blinkEffect = World.instance?.poolManager?.spawnType<BlinkEffect>(PoolType.BlinkFX, spawnPos);
        if (blinkEffect) {
            Ply_SoundManager.Ins.PlayFx(FxType.Blink);
            this.AttachEffectToItem(blinkEffect);
            this.CacheActiveEffect(blinkEffect);
            blinkEffect.DeSpawnByTime();
        }
    }

    /** Spawns the food spark burst at foodSparkSpawnPos. Call from an animation event. */
    public SpawnFoodSpark(): void {
        console.log(`[Item] SpawnFoodSpark called on item "${this.node.name}"`);
        this.SpawnFoodSparkAtEndOfFrame(this.foodSparkType);
    }

    /**
     * Animation-event friendly variant: pass a FoodSparkType name (for example, "Tomato")
     * to spawn that food's spark without changing foodSparkType.
     */
    public SpawnFoodSparkWithType(foodSparkTypeName: string): void {
        const type = this.ParseFoodSparkType(foodSparkTypeName);
        if (type === null) return;
        this.SpawnFoodSparkAtEndOfFrame(type);
    }

    /**
     * Animation events fire while the clip is still being sampled, so a spawn node
     * driven by that clip (the knife) can still report the previous frame's transform.
     * Reading it once the frame is done pins the spark to where the knife really is.
     */
    private SpawnFoodSparkAtEndOfFrame(type: FoodSparkType): void {
        this.scheduleOnce(() => {
            if (!this.node?.isValid) return;
            this.SpawnFoodSparkAt(this.foodSparkSpawnPos, type);
        }, 0);
    }

    /** Spawns a food spark at a node (falls back to this item's position), parented to this item. */
    public SpawnFoodSparkAt(target: Node | null, type: FoodSparkType = this.foodSparkType): FoodSpark | null {
        const spawnPos = target?.isValid ? target.worldPosition.clone() : this.GetEffectSpawnPosition();
        const spark = FoodSpark.Spawn(type, spawnPos);
        if (!spark) return null;

        // Follow the item while it moves; the pool re-parents the spark on despawn.
        if (spark.node.parent !== this.node) {
            spark.node.setParent(this.node);
        }
        spark.node.setWorldPosition(spawnPos);
        spark.node.setWorldRotationFromEuler(0, 0, 0);
        return spark;
    }

    /** Changes this item's spark type from a FoodSparkType enum name (for example, "Tomato"). */
    public ChangeFoodSparkType(foodSparkTypeName: string): void {
        const type = this.ParseFoodSparkType(foodSparkTypeName);
        if (type === null) return;
        this.foodSparkType = type;
    }

    private ParseFoodSparkType(foodSparkTypeName: string): FoodSparkType | null {
        const normalizedName = foodSparkTypeName?.trim().toLowerCase();
        const enumKey = Object.keys(FoodSparkType).find(key =>
            Number.isNaN(Number(key)) && key.toLowerCase() === normalizedName
        );

        if (!enumKey) {
            console.warn(`[Item] Invalid FoodSparkType "${foodSparkTypeName}" on ${this.node.name}.`);
            return null;
        }

        return FoodSparkType[enumKey as keyof typeof FoodSparkType] as FoodSparkType;
    }

    public OnDragFailReturnComplete() {
        this.SpawnBreakHeart();
    }

    public ShouldPlayBobEffectAfterReturn(): boolean {
        return true;
    }

    public TeleportToStart() {
        if (this.itemDraggable) {
            this.itemDraggable.TeleportToStart();
        }
    }


    public SpawnHeartDone() {
        this.SpawnHeart();
    }

    public ItemDone() {
        this.isDone = true;
    }

    /**
     * Override to guide a custom gesture. Return null when nothing custom is
     * needed; HandTutManager then falls back to the component-based rules.
     */
    public GetHandTutHint(): HandTutHint | null {
        return null;
    }

    /** HandTutManager started showing a hint for this item. */
    public OnHandTutShown(): void {}

    /** HandTutManager stopped showing the hint for this item (touch, done, phase change...). */
    public OnHandTutHidden(): void {}

    /** Marks the item complete, then returns it to its start position without a fail effect. */
    public DoneAnimation() {
        this.ItemDone();
        this.itemDraggable?.ReturnToStartWithoutHeart();
    }

    public TurnOffActiveEffect() {
        if (this.activeEffect && this.activeEffect.node && this.activeEffect.node.isValid) {
            World.instance?.poolManager?.despawn(this.activeEffect);
        }
        this.activeEffect = null;
    }

    private CacheActiveEffect(effect: PoolMember) {
        this.TurnOffActiveEffect();
        this.activeEffect = effect;
    }

    private AttachEffectToItem(effect: PoolMember): void {
        if (effect.node.parent !== this.node) {
            effect.node.setParent(this.node);
        }
        effect.node.setPosition(0, 0, 0);
        effect.node.setWorldRotationFromEuler(0, 0, 0);
    }

    protected GetEffectSpawnPosition(): Vec3 {
        const spawnPos = this.node.worldPosition.clone();
        return spawnPos;
    }

    public DoOneStep() {
        PhaseManager.Ins?.DoOneStep();
    }

    /** Serialized caches can point at another node's component (copied prefab/Inspector). Re-cache when so. */
    private ensureOwnComponents(): void {
        const comps = [this.itemDraggable, this.itemClickable, this.itemStirring, this.itemMoveToTarget, this.itemSound];
        for (const c of comps) {
            if (c && c.node !== this.node) {
                this.cacheComponents(true);
                return;
            }
        }
    }

    public EnableItemDraggable() {
        this.ensureOwnComponents();
        if (!this.itemDraggable) {
            this.itemDraggable = this.getComponent(ItemDraggable) || ComponentCache.get(this.node, ItemDraggable);
        }
        if (this.itemDraggable) {
            this.itemDraggable.enabled = true;
            this.itemDraggable.isDraggable = true;
        }
    }

    public DisableItemDraggable() {
        this.ensureOwnComponents();
        if (this.itemDraggable) {
            this.itemDraggable.enabled = false;
        }
    }

    public EnableItemClickable() {
        this.ensureOwnComponents();
        if (!this.itemClickable) {
            this.itemClickable = this.getComponent(ItemClickable) || ComponentCache.get(this.node, ItemClickable);
        }
        if (this.itemClickable) {
            this.itemClickable.enabled = true;
            this.itemClickable.canClick = true;
        }
    }

    public DisableItemClickable() {
        this.ensureOwnComponents();
        if (this.itemClickable) {
            this.itemClickable.enabled = false;
        }
    }

    public EnableClick() {
        this.ensureOwnComponents();
        if (!this.itemClickable) {
            this.itemClickable = this.getComponent(ItemClickable) || ComponentCache.get(this.node, ItemClickable);
        }
        this.itemClickable?.EnableClick();
    }

    public DisableClick() {
        this.ensureOwnComponents();
        this.itemClickable?.DisableClick();
    }

    public EnableItemStirring() {
        this.ensureOwnComponents();
        if (!this.itemStirring) {
            this.itemStirring = this.getComponent(ItemStirring) || ComponentCache.get(this.node, ItemStirring);
        }
        if (this.itemStirring) {
            this.itemStirring.enabled = true;
        }
    }

    public DisableItemStirring() {
        this.ensureOwnComponents();
        if (this.itemStirring) {
            this.itemStirring.enabled = false;
        }
    }
}
