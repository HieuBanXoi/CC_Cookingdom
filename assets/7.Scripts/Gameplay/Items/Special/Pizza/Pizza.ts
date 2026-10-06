import { _decorator, Animation, Color, Enum, Node, Sprite, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { ItemToTarget } from '../../Common/ItemToTarget';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { GameManager } from '../../../../Managers/GameManager';
import { RollingPin } from './RollingPin';
import { Spoon } from './Spoon';
import { Microwave } from './Microwave';
import type { PizzaKitchen } from './PizzaKitchen';

const { ccclass, property } = _decorator;

/** One kind of ingredient in a step: using any one of its items completes the group and locks the others. */
@ccclass('PizzaIngredientGroup')
export class PizzaIngredientGroup {
    @property({ tooltip: 'Tên nhóm (chỉ để dễ nhìn trong Inspector).' })
    public name: string = '';

    @property({ type: [Item], tooltip: 'Các item cùng loại, dùng 1 cái bất kỳ. Spoon tự lấy sốt trước khi drop được.' })
    public items: Item[] = [];

    @property({ tooltip: 'Clip trên Animation của Pizza chạy khi nguyên liệu tới nơi. Trống = không chạy clip.' })
    public clipName: string = '';
}

/** A pizza step: done when every group got one ingredient and all clips finished. */
@ccclass('PizzaStep')
export class PizzaStep {
    @property({ tooltip: 'Tên bước (chỉ để dễ nhìn trong Inspector).' })
    public name: string = '';

    @property({ type: [PizzaIngredientGroup], tooltip: 'Mỗi nhóm cần đúng 1 item. Bước xong khi đủ mọi nhóm.' })
    public groups: PizzaIngredientGroup[] = [];

    @property({ tooltip: 'Xong bước này thì StopGame, rồi set target cho 1 item của bước sau để hand tut clickbait.' })
    public stopGameAfter: boolean = false;
}

export enum PizzaState {
    Idle = 0,
    Rolling,
    Ingredients,
    Stopped,
    ToMicrowave,
    InMicrowave,
    ToTray,
    Served,
}
Enum(PizzaState);

/**
 * A pizza on the cutting board: rolling -> ingredient steps -> microwave -> tray.
 * Keeps every tool it needs and sets their targets when it is their turn.
 */
@ccclass('Pizza')
export class Pizza extends Item {
    // ---------- Tab: Roll ----------
    @property({ group: { name: 'Roll', id: 'pizza', displayOrder: 0 }, type: Node, tooltip: 'Node Base được lăn to ra.' })
    public base: Node | null = null;

    @property({ group: { name: 'Roll', id: 'pizza' }, min: 0.01, tooltip: 'Scale X/Y của Base khi lăn xong.' })
    public rollTargetScale: number = 3;

    @property({ group: { name: 'Roll', id: 'pizza' }, type: RollingPin, tooltip: 'Cây lăn bột. Trống = bỏ qua bước lăn.' })
    public rollingPin: RollingPin | null = null;

    // ---------- Tab: Steps ----------
    @property({ group: { name: 'Steps', id: 'pizza', displayOrder: 1 }, type: [PizzaStep], tooltip: 'Các bước nguyên liệu theo thứ tự (Ketchup, Cheese, Topping...).' })
    public steps: PizzaStep[] = [];

    @property({ group: { name: 'Steps', id: 'pizza' }, type: Node, tooltip: 'Điểm nguyên liệu bay tới. Trống = node Pizza.' })
    public ingredientPoint: Node | null = null;

    // ---------- Tab: Cook ----------
    @property({ group: { name: 'Cook', id: 'pizza', displayOrder: 2 }, type: Microwave, tooltip: 'Lò vi sóng. Trống = bỏ qua bước nướng.' })
    public microwave: Microwave | null = null;

    @property({ group: { name: 'Cook', id: 'pizza' }, type: Node, tooltip: 'Sprite PizzaDone: bật lên và fade 0 -> 1 trong lúc nướng.' })
    public pizzaDone: Node | null = null;

    // ---------- Tab: Serve ----------
    @property({ group: { name: 'Serve', id: 'pizza', displayOrder: 3 }, type: Item, tooltip: 'Khay (Item có itemType Tray).' })
    public tray: Item | null = null;

    @property({ group: { name: 'Serve', id: 'pizza' }, type: Node, tooltip: 'Điểm đặt pizza trên khay (PizzaPos). Trống = node khay.' })
    public trayPoint: Node | null = null;

    @property({ group: { name: 'Serve', id: 'pizza' }, type: Sprite, tooltip: 'Hình pizza trên FoodTop, xong thì tối đi.' })
    public foodTopSprite: Sprite | null = null;

    @property({ group: { name: 'Serve', id: 'pizza' }, type: Node, tooltip: 'Tick trên FoodTop, xong thì bật lên.' })
    public foodTopTick: Node | null = null;

    @property({ group: { name: 'Serve', id: 'pizza' }, type: Color, tooltip: 'Màu hình FoodTop khi làm xong (tối đi).' })
    public foodTopDoneColor: Color = new Color(110, 110, 110, 255);

    @property({ group: { name: 'Serve', id: 'pizza' }, min: 0, tooltip: 'Thời gian chỉnh scale theo PizzaInPos khi pizza vào lò (giây). Lên khay thì giữ nguyên scale.' })
    public fitScaleDuration: number = 0.2;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'pizza', displayOrder: 4 }, type: Ply_Event, tooltip: 'Lăn bột xong.' })
    public onRollDone: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'pizza' }, type: Ply_Event, tooltip: 'Xong một bước nguyên liệu (truyền index bước).' })
    public onStepComplete: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'pizza' }, type: Ply_Event, tooltip: 'Nướng xong.' })
    public onCooked: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'pizza' }, type: Ply_Event, tooltip: 'Pizza đã lên khay.' })
    public onServed: Ply_Event = new Ply_Event();

    private state: PizzaState = PizzaState.Idle;
    private kitchen: PizzaKitchen | null = null;
    private stepIndex = -1;
    private groupDone: boolean[] = [];
    private readonly ingredientListeners = new Map<Item, (...args: any[]) => void>();
    private readonly clipQueue: string[] = [];
    private playingClip = false;
    private isCooked = false;

    private readonly onDropSuccess = (): void => this.OnPizzaDropped();
    private readonly onMoveComplete = (): void => this.OnPizzaArrived();

    public get State(): PizzaState {
        return this.state;
    }

    public get IngredientPoint(): Node {
        return this.ingredientPoint ?? this.node;
    }

    protected onLoad(): void {
        super.onLoad();
        this.base ??= this.node.getChildByName('Base');
        this.LockPizzaDrag();
        if (this.pizzaDone) this.pizzaDone.active = false;
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemMoveToTarget?.onComplete.removeListener(this.onMoveComplete);
        this.itemMoveToTarget?.onComplete.addListener(this.onMoveComplete);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemMoveToTarget?.onComplete.removeListener(this.onMoveComplete);
    }

    // ---------- Flow ----------

    /** Called by PizzaKitchen once the flour has landed and this pizza is shown. */
    public BeginPizza(kitchen: PizzaKitchen | null): void {
        this.kitchen = kitchen;
        this.isDone = false;
        this.isCooked = false;
        this.state = PizzaState.Rolling;
        HandTutManager.Ins?.RegisterTutorialItem(this, false);

        if (this.rollingPin && this.base) {
            this.rollingPin.BeginRolling(this);
        } else {
            this.OnRollDone();
        }
    }

    /** Called by RollingPin when Base reached rollTargetScale. */
    public OnRollDone(): void {
        if (this.state !== PizzaState.Rolling) return;
        this.onRollDone.invoke();
        this.StartStep(0);
    }

    private StartStep(index: number): void {
        this.stepIndex = index;
        if (index >= this.steps.length) {
            this.StartMicrowaveStage();
            return;
        }

        this.state = PizzaState.Ingredients;
        const step = this.steps[index];
        this.groupDone = step.groups.map(() => false);

        step.groups.forEach((group, groupIndex) => {
            const available = group.items.filter(item => this.IsAvailable(item));
            // A group with nothing left to use (e.g. all hidden) must not block the step.
            if (available.length === 0) {
                this.groupDone[groupIndex] = true;
                return;
            }
            for (const item of available) this.EnableIngredient(item, groupIndex);
        });

        this.TryCompleteStep();
    }

    private IsAvailable(item: Item | null): item is Item {
        return !!item && item.isValid && item.node.active;
    }

    private EnableIngredient(item: Item, groupIndex: number): void {
        item.isDone = false;

        if (item instanceof Spoon) {
            item.Prepare(this, this.IngredientPoint);
        } else if (item instanceof ItemToTarget) {
            item.targetItem = this;
            item.targetPosition = this.IngredientPoint;
            item.SetTarget();
            item.EnableItemDraggable();
        } else if (item.itemDraggable) {
            item.itemDraggable.SetTargetItemType(this.node);
            item.EnableItemDraggable();
        }

        const listener = (): void => this.OnIngredientArrived(item, groupIndex);
        this.RemoveIngredientListener(item);
        this.ingredientListeners.set(item, listener);
        this.ArrivalEvent(item)?.addListener(listener);

        HandTutManager.Ins?.RegisterTutorialItem(item, false);
    }

    /** Locks every ingredient of every step until its turn. Safe to call while this pizza is still inactive. */
    public LockAllIngredients(): void {
        for (const step of this.steps) {
            for (const group of step.groups) {
                for (const item of group.items) {
                    if (item) this.DisableIngredient(item);
                }
            }
        }
    }

    private DisableIngredient(item: Item): void {
        this.RemoveIngredientListener(item);
        if (!item?.isValid) return;

        if (item instanceof Spoon) {
            item.Lock();
            return;
        }
        // Not its turn: still draggable, but no target so every drop fails.
        if (item.itemDraggable) item.itemDraggable.targetItemType = ItemType.None;
        item.EnableItemDraggable();
    }

    private RemoveIngredientListener(item: Item): void {
        const listener = this.ingredientListeners.get(item);
        if (!listener) return;
        this.ArrivalEvent(item)?.removeListener(listener);
        this.ingredientListeners.delete(item);
    }

    /** ItemToTarget may hide on drop without moving (Disable Item When Drop), so use its own arrival event. */
    private ArrivalEvent(item: Item): Ply_Event | null {
        if (item instanceof ItemToTarget) return item.onArrived;
        return item.itemMoveToTarget?.onComplete ?? null;
    }

    private OnIngredientArrived(item: Item, groupIndex: number): void {
        this.RemoveIngredientListener(item);
        if (this.state !== PizzaState.Ingredients || this.groupDone[groupIndex]) return;

        this.groupDone[groupIndex] = true;
        const group = this.steps[this.stepIndex].groups[groupIndex];
        for (const other of group.items) {
            if (other && other !== item) this.DisableIngredient(other);
        }

        HandTutManager.Ins?.RegisterCorrectAction();
        if (group.clipName.trim()) this.QueueClip(group.clipName.trim());
        this.TryCompleteStep();
    }

    private QueueClip(clipName: string): void {
        this.clipQueue.push(clipName);
        if (!this.playingClip) this.PlayNextClip();
    }

    /** Clips share one Animation component, so they play one after another instead of cutting each other off. */
    private PlayNextClip(): void {
        const clipName = this.clipQueue.shift();
        if (clipName === undefined) {
            this.playingClip = false;
            this.TryCompleteStep();
            return;
        }

        const anim = this.animationComponent ?? this.getComponent(Animation);
        const hasClip = !!anim?.clips.some(clip => clip?.name === clipName);
        if (!anim || !hasClip) {
            console.warn(`[Pizza] Clip "${clipName}" not found on "${this.node.name}".`);
            this.PlayNextClip();
            return;
        }

        this.playingClip = true;
        anim.once(Animation.EventType.FINISHED, () => this.PlayNextClip(), this);
        anim.play(clipName);
    }

    private TryCompleteStep(): void {
        if (this.state !== PizzaState.Ingredients || this.playingClip || this.clipQueue.length > 0) return;
        if (this.groupDone.some(done => !done)) return;

        const step = this.steps[this.stepIndex];
        this.onStepComplete.invoke(this.stepIndex);

        if (step.stopGameAfter) {
            this.state = PizzaState.Stopped;
            GameManager.Ins?.StopGame();
            this.EnableClickbait(this.stepIndex + 1);
            return;
        }

        this.StartStep(this.stepIndex + 1);
    }

    /** After StopGame: give one item of the next step a target so the hand tutorial keeps pointing at it. */
    private EnableClickbait(nextStepIndex: number): void {
        const nextStep = this.steps[nextStepIndex];
        if (!nextStep) {
            if (this.microwave) this.EnableDragTo(this.microwave, this.microwave.pizzaInPos);
            return;
        }

        for (let groupIndex = 0; groupIndex < nextStep.groups.length; groupIndex++) {
            const item = nextStep.groups[groupIndex].items.find(candidate => this.IsAvailable(candidate));
            if (item) {
                this.EnableIngredient(item, groupIndex);
                return;
            }
        }
    }

    // ---------- Microwave ----------

    private StartMicrowaveStage(): void {
        if (!this.microwave) {
            this.isCooked = true;
            this.StartTrayStage();
            return;
        }
        this.state = PizzaState.ToMicrowave;
        this.EnableDragTo(this.microwave, this.microwave.pizzaInPos);
    }

    /** Microwave: the door closed and the timer started. */
    public OnCookStart(duration: number): void {
        if (!this.pizzaDone) return;

        const opacity = this.pizzaDone.getComponent(UIOpacity) ?? this.pizzaDone.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        this.pizzaDone.active = true;
        tween(opacity).to(Math.max(0.01, duration), { opacity: 255 }).start();
    }

    /** Microwave: cooking finished (the door is still closed). */
    public OnCookFinished(): void {
        this.isCooked = true;
        this.onCooked.invoke();
    }

    /** Microwave: the door opened again, the pizza can go to the tray. */
    public OnMicrowaveOpened(): void {
        if (this.state !== PizzaState.InMicrowave || !this.isCooked) return;
        this.StartTrayStage();
    }

    /** Moves the pizza under `parent`, centred, with the parent's scale (PizzaInPos / PizzaCookingPos). */
    public TeleportTo(parent: Node | null): void {
        if (!parent?.isValid) return;
        Tween.stopAllByTarget(this.node);
        this.node.setParent(parent);
        this.node.setPosition(0, 0, 0);
        this.node.setScale(1, 1, 1);
    }

    // ---------- Tray ----------

    private StartTrayStage(): void {
        if (!this.tray) {
            this.Serve();
            return;
        }
        this.state = PizzaState.ToTray;
        this.EnableDragTo(this.tray, this.trayPoint);
    }

    private Serve(): void {
        this.state = PizzaState.Served;
        this.itemType = ItemType.None;
        this.LockPizzaDrag();
        this.ItemDone();
        this.SpawnHeart();
        this.ShowFoodTopDone();
        HandTutManager.Ins?.RegisterCorrectAction();
        this.onServed.invoke();
        this.kitchen?.OnPizzaServed(this);
    }

    private ShowFoodTopDone(): void {
        const sprite = this.foodTopSprite;
        if (sprite) {
            const from = sprite.color.clone();
            const to = this.foodTopDoneColor.clone();
            const current = new Color();
            tween({ t: 0 })
                .to(0.3, { t: 1 }, {
                    onUpdate: (state: { t: number }) => {
                        Color.lerp(current, from, to, state.t);
                        sprite.color = current;
                    },
                })
                .start();
        }
        if (this.foodTopTick) {
            const tick = this.foodTopTick;
            const scale = tick.scale.clone();
            tick.active = true;
            tick.setScale(0, 0, scale.z);
            tween(tick).to(0.3, { scale }, { easing: 'backOut' }).start();
        }
    }

    // ---------- Pizza drag ----------

    private EnableDragTo(target: Item, landing: Node | null): void {
        const draggable = this.itemDraggable;
        if (!draggable || !target) return;

        this.isDone = false;
        draggable.SetTargetItemType(target.node);
        if (landing && this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = landing;
        this.EnableItemDraggable();
        HandTutManager.Ins?.RegisterTutorialItem(this, false);
    }

    private LockPizzaDrag(): void {
        if (this.itemDraggable) this.itemDraggable.targetItemType = ItemType.None;
        this.itemDraggable?.DisableComponent();
    }

    private OnPizzaDropped(): void {
        if (this.state !== PizzaState.ToMicrowave && this.state !== PizzaState.ToTray) return;
        if (this.state === PizzaState.ToTray) this.microwave?.OnPizzaOut(this);

        this.LockPizzaDrag();
        this.itemMoveToTarget?.ExecuteMove();
    }

    private OnPizzaArrived(): void {
        if (this.state === PizzaState.ToMicrowave) {
            // ItemMoveToTarget reparents to PizzaInPos: take its scale. On the tray the pizza keeps its own scale.
            tween(this.node).to(this.fitScaleDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
            this.state = PizzaState.InMicrowave;
            HandTutManager.Ins?.RegisterCorrectAction();
            this.microwave?.OnPizzaIn(this);
        } else if (this.state === PizzaState.ToTray) {
            this.Serve();
        }
    }
}
