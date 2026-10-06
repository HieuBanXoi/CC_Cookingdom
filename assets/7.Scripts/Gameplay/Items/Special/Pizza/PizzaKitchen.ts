import { _decorator, Component, Node } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { Pizza } from './Pizza';

const { ccclass, property } = _decorator;

/**
 * Runs the pizzas in order. Any free flour can be dragged onto the cutting
 * board; once one is on its way the others are locked. When it lands (and its
 * punch ends) the flour hides and the next pizza appears in its place.
 * Put it on an always-active node: the pizzas themselves start inactive.
 */
@ccclass('PizzaKitchen')
export class PizzaKitchen extends Component {
    @property({ type: [Item], tooltip: 'Các Flour, kéo cái nào cũng được.' })
    public flours: Item[] = [];

    @property({ type: Item, tooltip: 'Thớt (đích thả Flour).' })
    public cuttingBoard: Item | null = null;

    @property({ type: Node, tooltip: 'Điểm Flour bay tới. Trống = node thớt.' })
    public flourLandingPoint: Node | null = null;

    @property({ type: [Pizza], tooltip: 'Các pizza theo thứ tự làm (đang tắt sẵn trên thớt).' })
    public pizzas: Pizza[] = [];

    private pizzaIndex = -1;
    private waitingFlour = false;
    private readonly usedFlours = new Set<Item>();

    protected start(): void {
        for (const flour of this.flours) {
            if (!flour) continue;
            flour.itemDraggable?.onDropSuccess.addListener(() => this.OnFlourDropped(flour));
            flour.itemMoveToTarget?.onComplete.addListener(() => this.OnFlourArrived(flour));
            this.LockFlour(flour);
        }
        for (const pizza of this.pizzas) pizza?.LockAllIngredients();
        this.StartNextPizza();
    }

    public get CurrentPizza(): Pizza | null {
        return this.pizzas[this.pizzaIndex] ?? null;
    }

    /** Called by Pizza when it reached the tray. */
    public OnPizzaServed(pizza: Pizza): void {
        if (pizza !== this.CurrentPizza) return;
        this.StartNextPizza();
    }

    private StartNextPizza(): void {
        this.pizzaIndex++;
        if (!this.CurrentPizza || !this.cuttingBoard) return;

        this.waitingFlour = true;
        for (const flour of this.flours) {
            if (!this.IsFree(flour)) continue;
            flour.isDone = false;
            flour.itemDraggable?.SetTargetItemType(this.cuttingBoard.node);
            if (this.flourLandingPoint && flour.itemMoveToTarget) flour.itemMoveToTarget.defaultTarget = this.flourLandingPoint;
            flour.EnableItemDraggable();
            HandTutManager.Ins?.RegisterTutorialItem(flour, false);
        }
    }

    private IsFree(flour: Item | null): flour is Item {
        return !!flour && flour.isValid && flour.node.active && !this.usedFlours.has(flour);
    }

    private LockFlour(flour: Item): void {
        // Still draggable, but no target so it cannot be dropped.
        if (flour.itemDraggable) flour.itemDraggable.targetItemType = ItemType.None;
        flour.EnableItemDraggable();
    }

    private OnFlourDropped(flour: Item): void {
        if (!this.waitingFlour) return;
        this.waitingFlour = false;
        this.usedFlours.add(flour);

        for (const other of this.flours) {
            if (other && other !== flour) this.LockFlour(other);
        }
        flour.itemDraggable?.DisableComponent();
        flour.itemMoveToTarget?.ExecuteMove();
    }

    private OnFlourArrived(flour: Item): void {
        if (!this.usedFlours.has(flour) || !flour.node.active) return;

        // The punch may still be running when the move completes: show the pizza after it.
        const move = flour.itemMoveToTarget;
        if (move) {
            move.WhenPunchDone(() => this.ShowPizza(flour));
        } else {
            this.ShowPizza(flour);
        }
    }

    private ShowPizza(flour: Item): void {
        const pizza = this.CurrentPizza;
        if (!pizza) return;

        pizza.node.active = true;
        flour.ItemDone();
        flour.node.active = false;
        HandTutManager.Ins?.RegisterCorrectAction();
        pizza.BeginPizza(this);
    }
}
