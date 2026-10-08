import { _decorator, Enum, Node, Tween, tween, UIOpacity } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { GameManager } from '../../../../Managers/GameManager';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';
import { PlayFallIn } from '../../../Effects/FallIn';
import { PourTool } from './PourTool';

const { ccclass, property } = _decorator;

/** One thing that goes into the glass. */
@ccclass('GlassIngredient')
export class GlassIngredient {
    @property({ tooltip: 'Tên để dễ nhìn trong Inspector.' })
    public name: string = '';

    @property({ type: [Item], tooltip: 'Item kéo vào cốc (nhiều cái = cái nào cũng được, dùng 1 cái thì các cái còn lại khoá). Thả trúng là biến mất.' })
    public sources: Item[] = [];

    @property({ type: PourTool, tooltip: 'Hoặc: dụng cụ đổ vào cốc (bay tới, nghiêng, đổ, về chỗ).' })
    public pourTool: PourTool | null = null;

    @property({ type: [Node], tooltip: 'Các lớp trong cốc hiện ra khi cho vào.' })
    public layers: Node[] = [];

    @property({ tooltip: 'Bật: các lớp rõ dần 0 -> 1 tại chỗ (matcha). Tắt: rơi xuống từ trên (đá, jelly, topping).' })
    public fadeIn: boolean = false;

    @property({ tooltip: 'Dùng âm thanh riêng thay cho Drop Fx chung của cốc.' })
    public overrideFx: boolean = false;

    @property({ type: Enum(FxType), tooltip: 'Âm thanh riêng khi nguyên liệu này rơi chạm cốc.', visible: function (this: GlassIngredient) { return this.overrideFx; } })
    public fx: FxType = FxType.FoodPlace;
}

/** Ingredients of one step; inside a step any order is fine. */
@ccclass('GlassStep')
export class GlassStep {
    @property({ tooltip: 'Tên để dễ nhìn trong Inspector.' })
    public name: string = '';

    @property({ type: [GlassIngredient] })
    public ingredients: GlassIngredient[] = [];
}

/**
 * Matcha glass, drives phase 3: drag the glass onto the tray, then fill it
 * step by step (ice -> matcha -> jelly -> toppings in any order). When full:
 * heart, the game stops and the hand shows dragging the glass to the
 * customer; the next touch goes to the store.
 * Ingredients that are not on turn can be dragged but not dropped.
 */
@ccclass('MatchaGlass')
export class MatchaGlass extends Item {
    // ---------- Tab: Tray ----------
    @property({ group: { name: 'Tray', id: 'glass', displayOrder: 0 }, type: Item, tooltip: 'Khay đặt cốc (MainTray).' })
    public tray: Item | null = null;

    // ---------- Tab: Steps ----------
    @property({ group: { name: 'Steps', id: 'glass', displayOrder: 1 }, type: [GlassStep], tooltip: 'Các bước theo thứ tự; trong một bước cho nguyên liệu nào trước cũng được.' })
    public steps: GlassStep[] = [];

    @property({ group: { name: 'Steps', id: 'glass' }, tooltip: 'Lớp trong cốc rơi từ cao bao nhiêu (đơn vị local).' })
    public fallHeight: number = 120;

    @property({ group: { name: 'Steps', id: 'glass' }, min: 0.01, tooltip: 'Thời gian rơi (giây).' })
    public fallDuration: number = 0.4;

    @property({ group: { name: 'Steps', id: 'glass' }, range: [0, 1, 0.05], slide: true, tooltip: 'Độ rõ lúc bắt đầu rơi.' })
    public fallStartOpacity: number = 0.2;

    @property({ group: { name: 'Steps', id: 'glass' }, type: Enum(FxType), tooltip: 'Âm thanh khi nguyên liệu rơi chạm cốc.' })
    public dropFx: FxType = FxType.FoodPlace;

    // ---------- Tab: Finish ----------
    @property({ group: { name: 'Finish', id: 'glass', displayOrder: 2 }, type: Item, tooltip: 'Đích cuối: kéo cốc lên đây (bubble_2). Chỉ để hand tut chỉ, game đã dừng.' })
    public customer: Item | null = null;

    @property({ group: { name: 'Finish', id: 'glass' }, min: 0, tooltip: 'Sau khi spawn heart bao lâu (giây) thì dừng game và chỉ tay (0 = ngay).' })
    public finishDelay: number = 0.8;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'glass', displayOrder: 3 }, type: Ply_Event })
    public onPlaced: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'glass' }, type: Ply_Event })
    public onFilled: Ply_Event = new Ply_Event();

    private placed = false;
    private stepIndex = -1;
    private readonly doneIngredients = new Set<GlassIngredient>();
    /** Drop listeners per source, so they can be removed. */
    private readonly sourceListeners = new Map<Item, () => void>();
    private readonly pourListeners = new Map<PourTool, { pour: (d: number) => void; done: () => void }>();
    private readonly onSelfDropped = (): void => this.OnGlassDropped();

    protected onLoad(): void {
        super.onLoad();
        if (this.itemType === ItemType.None) this.itemType = ItemType.MatchaGlass;
        for (const step of this.steps) {
            for (const ing of step.ingredients) {
                for (const layer of ing.layers) if (layer) layer.active = false;
                for (const source of ing.sources) this.LockSource(source);
            }
        }
    }

    protected start(): void {
        if (this.tray && this.itemDraggable) {
            this.itemDraggable.SetTargetItemType(this.tray.node);
            this.EnableItemDraggable();
        }
        HandTutManager.Ins?.RegisterTutorialItem(this, false);
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onSelfDropped);
        this.itemDraggable?.onDropSuccess.addListener(this.onSelfDropped);
        for (const step of this.steps) {
            for (const ing of step.ingredients) {
                for (const source of ing.sources) this.ListenSource(source, ing);
                if (ing.pourTool) this.ListenPour(ing.pourTool, ing);
            }
        }
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onSelfDropped);
        this.sourceListeners.forEach((fn, source) => source.itemDraggable?.onDropSuccess.removeListener(fn));
        this.sourceListeners.clear();
        this.pourListeners.forEach((fns, tool) => {
            tool.onPour.removeListener(fns.pour);
            tool.onPoured.removeListener(fns.done);
        });
        this.pourListeners.clear();
    }

    // ---------- Glass -> tray ----------

    private OnGlassDropped(): void {
        if (this.placed) return;
        this.placed = true;
        this.itemDraggable?.DisableComponent();
        HandTutManager.Ins?.ItemDone(this.node);
        const move = this.itemMoveToTarget;
        if (!move) {
            this.OnPlaced();
            return;
        }
        const onArrived = (): void => {
            move.onComplete.removeListener(onArrived);
            this.OnPlaced();
        };
        move.onComplete.addListener(onArrived);
        move.ExecuteMove2D(this.tray?.node ?? null);
    }

    private OnPlaced(): void {
        // On the tray the glass is only a drop target.
        this.DisableItemDraggable();
        this.onPlaced.invoke();
        this.StartStep(0);
    }

    // ---------- Steps ----------

    private StartStep(index: number): void {
        this.stepIndex = index;
        const step = this.steps[index];
        if (!step) {
            this.Finish();
            return;
        }
        for (const ing of step.ingredients) this.OpenIngredient(ing);
    }

    private OpenIngredient(ing: GlassIngredient): void {
        if (ing.pourTool) {
            ing.pourTool.Ready(this);
            return;
        }
        for (const source of ing.sources) {
            if (!source?.itemDraggable) continue;
            source.isDone = false;
            source.itemDraggable.targetItemType = this.itemType;
            if (source.itemMoveToTarget) source.itemMoveToTarget.defaultTarget = this.node;
            source.EnableItemDraggable();
            HandTutManager.Ins?.RegisterTutorialItem(source, false);
        }
    }

    private IsCurrent(ing: GlassIngredient): boolean {
        return !!this.steps[this.stepIndex]?.ingredients.includes(ing) && !this.doneIngredients.has(ing);
    }

    private ListenSource(source: Item, ing: GlassIngredient): void {
        if (!source?.itemDraggable || this.sourceListeners.has(source)) return;
        const fn = (): void => this.OnSourceDropped(source, ing);
        this.sourceListeners.set(source, fn);
        source.itemDraggable.onDropSuccess.addListener(fn);
    }

    private ListenPour(tool: PourTool, ing: GlassIngredient): void {
        if (this.pourListeners.has(tool)) return;
        const fns = {
            pour: (duration: number): void => {
                if (this.IsCurrent(ing)) this.ShowLayers(ing, duration);
            },
            done: (): void => {
                if (this.IsCurrent(ing)) this.CompleteIngredient(ing);
            },
        };
        this.pourListeners.set(tool, fns);
        tool.onPour.addListener(fns.pour);
        tool.onPoured.addListener(fns.done);
    }

    private OnSourceDropped(source: Item, ing: GlassIngredient): void {
        if (!this.IsCurrent(ing)) return;
        // Dropped on the glass: it disappears straight away.
        source.ItemDone();
        source.node.active = false;
        HandTutManager.Ins?.ItemDone(source.node);
        // The other pieces (e.g. the 2 other cheeses) are not needed any more.
        for (const other of ing.sources) {
            if (!other || other === source) continue;
            this.LockSource(other);
            other.ItemDone();
            HandTutManager.Ins?.ItemDone(other.node);
        }
        this.ShowLayers(ing, this.fallDuration);
        this.CompleteIngredient(ing);
    }

    private ShowLayers(ing: GlassIngredient, duration: number): void {
        // Falling pieces make their sound once, when they land in the glass.
        let landSoundPlayed = false;
        const onLanded = (): void => {
            if (landSoundPlayed) return;
            landSoundPlayed = true;
            Ply_SoundManager.Ins?.PlayFx(ing.overrideFx ? ing.fx : this.dropFx);
        };
        for (const layer of ing.layers) {
            if (!layer) continue;
            if (ing.fadeIn) {
                const opacity = layer.getComponent(UIOpacity) ?? layer.addComponent(UIOpacity);
                Tween.stopAllByTarget(opacity);
                opacity.opacity = 0;
                layer.active = true;
                tween(opacity).to(Math.max(0.05, duration), { opacity: 255 }, { easing: 'sineOut' }).start();
            } else {
                PlayFallIn(layer, this.fallHeight, this.fallDuration, this.fallStartOpacity, onLanded);
            }
        }
    }

    private CompleteIngredient(ing: GlassIngredient): void {
        this.doneIngredients.add(ing);
        const step = this.steps[this.stepIndex];
        if (step && step.ingredients.every(i => this.doneIngredients.has(i))) {
            this.StartStep(this.stepIndex + 1);
        }
    }

    // ---------- Finish ----------

    private Finish(): void {
        this.ItemDone();
        this.SpawnHeart();
        this.onFilled.invoke();
        if (this.finishDelay > 0) this.scheduleOnce(() => this.StopForStore(), this.finishDelay);
        else this.StopForStore();
    }

    /** Game over: the hand shows the glass going to the customer, the next touch opens the store. */
    private StopForStore(): void {
        if (this.customer && this.itemDraggable) {
            this.isDone = false;
            this.itemDraggable.targetItemType = this.customer.itemType;
            if (this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = this.customer.node;
            this.EnableItemDraggable();
            HandTutManager.Ins?.RegisterTutorialItem(this, false);
        }
        GameManager.Ins?.StopGame();
        // Point at the customer straight away, no idle wait. Next frame: the
        // drop that finished the glass still notifies HandTutManager (which
        // hides the hand) after this runs.
        this.scheduleOnce(() => HandTutManager.Ins?.ShowHintNow(), 0);
    }

    // ---------- Helpers ----------

    /** Not its turn: still draggable, but every drop fails. */
    private LockSource(source: Item | null): void {
        if (!source?.itemDraggable) return;
        source.itemDraggable.targetItemType = ItemType.None;
        source.EnableItemDraggable();
    }
}
