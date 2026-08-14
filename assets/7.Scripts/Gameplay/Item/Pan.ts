import { _decorator, Node } from 'cc';
import { Item } from '../ItemTool/Item';
import { ItemType } from '../ItemTool/ItemType';
import { Sprite } from 'cc';
import { SpriteFrame } from 'cc';
import { Spatula } from './Spatula';
import { ItemDraggable } from '../ItemTool/ItemDraggable';

const { ccclass, property } = _decorator;

/** A group of ingredients/tools that must be dropped on the Pan together. */
@ccclass('PanStep')
export class PanStep {
    @property({ type: [Item], tooltip: 'Items that may be dropped on the Pan during this step.' })
    public items: Item[] = [];
}

@ccclass('Pan')
export class Pan extends Item {

    @property({ type: Node, tooltip: 'Visual node shown while the pan is hot.' })
    public fireStove: Node = null!;

    @property({ type: Node, tooltip: 'Visual node shown while the pan is smoking.' })
    public smokeFX: Node = null!;

    @property({type: Node })
    public offNode: Node = null!;

    @property({type: Node })
    public onNode: Node = null!;

    @property({ type: Spatula, tooltip: 'Spatula to return after the Pan stirring animation completes.' })
    public spatula: Spatula | null = null;

    @property({ type: [PanStep], tooltip: 'Drop steps. Only items in the active step can target this Pan.' })
    public steps: PanStep[] = [];

    @property({ tooltip: 'Start the first configured step when TurnOn() is called.' })
    public startStepsWhenTurnedOn = true;

    private currentStepIndex = -1;
    private readonly completedItems = new Set<Item>();
    private readonly itemDropListeners = new Map<Item, (target: Node) => void>();

    onLoad() {
        super.onLoad();
        this.itemType = ItemType.None;
        if (this.fireStove && this.smokeFX) {
            this.fireStove.active = false;
            this.smokeFX.active = false;
        }
        if (this.offNode && this.onNode) {
            this.offNode.active = true;
            this.onNode.active = false;
        }

    }

    protected onEnable(): void {
        this.SubscribeStepItems();
    }

    protected onDisable(): void {
        this.UnsubscribeStepItems();
    }

    public TurnOn(): void {
        this.itemType = ItemType.Pan;

        if (this.fireStove && this.smokeFX) {
            this.fireStove.active = true;
            this.smokeFX.active = true;
        }
        if (this.offNode && this.onNode) {
            this.offNode.active = false;
            this.onNode.active = true;
        }

        if (this.startStepsWhenTurnedOn) this.StartSteps();
    }

    /**
     * Animation Event callback for the final frame of Pan's Stir clip.
     * Assign the Spatula reference in the Inspector.
     */
    public CompleteStir(): void {
        if (!this.spatula) {
            console.warn(`[Pan] Assign Spatula on "${this.node.name}" before calling CompleteStir.`);
            return;
        }

        this.spatula.FinishStir();
    }

    /** Starts the configured drop-step sequence from its first incomplete step. */
    public StartSteps(): void {
        if (this.currentStepIndex >= 0) return;
        this.SubscribeStepItems();
        this.ActivateStep(0);
    }

    /** Clears all step state and disables Pan targeting for every configured item. */
    public ResetSteps(): void {
        this.DisableAllStepTargets();
        this.completedItems.clear();
        this.currentStepIndex = -1;
    }

    /** Allows an Animation/EventHandler to advance to the next configured step. */
    public StartNextStep(): void {
        if (this.currentStepIndex < 0) return;
        this.CompleteCurrentStep();
    }

    private ActivateStep(index: number): void {
        this.DisableAllStepTargets();

        while (index < this.steps.length) {
            const step = this.steps[index];
            const validItems = step?.items.filter(item => !!item && item.isValid) ?? [];
            if (validItems.length === 0) {
                index++;
                continue;
            }

            this.currentStepIndex = index;
            this.completedItems.clear();
            for (const item of validItems) {
                item.cacheComponents();
                if (!item.itemDraggable) {
                    console.warn(`[Pan] Step ${index + 1} item "${item.node.name}" needs ItemDraggable.`);
                    continue;
                }
                item.itemDraggable.targetItemType = ItemType.Pan;
            }
            return;
        }

        this.currentStepIndex = -1;
        this.completedItems.clear();
    }

    private CompleteCurrentStep(): void {
        if (this.currentStepIndex < 0) return;
        const completedIndex = this.currentStepIndex;
        this.DisableStepTargets(completedIndex);
        this.completedItems.clear();
        this.ActivateStep(completedIndex + 1);
    }

    private OnStepItemDropped(item: Item, target: Node): void {
        if (this.currentStepIndex < 0 || target !== this.node) return;

        const currentStep = this.steps[this.currentStepIndex];
        if (!currentStep?.items.includes(item) || this.completedItems.has(item)) return;

        this.completedItems.add(item);
        item.itemDraggable!.targetItemType = ItemType.None;
        item.ItemDone();

        const requiredItems = currentStep.items.filter(stepItem =>
            !!stepItem && stepItem.isValid && !!stepItem.itemDraggable,
        );
        if (requiredItems.every(stepItem => this.completedItems.has(stepItem))) {
            this.CompleteCurrentStep();
        }
    }

    private SubscribeStepItems(): void {
        for (const step of this.steps) {
            for (const item of step?.items ?? []) {
                if (!item || !item.isValid || this.itemDropListeners.has(item)) continue;
                item.cacheComponents();
                const draggable = item.itemDraggable;
                if (!draggable) continue;

                const listener = (target: Node) => this.OnStepItemDropped(item, target);
                this.itemDropListeners.set(item, listener);
                draggable.onDropSuccess.addListener(listener);
            }
        }
    }

    private UnsubscribeStepItems(): void {
        for (const [item, listener] of this.itemDropListeners) {
            item.itemDraggable?.onDropSuccess.removeListener(listener);
        }
        this.itemDropListeners.clear();
    }

    private DisableAllStepTargets(): void {
        for (let i = 0; i < this.steps.length; i++) {
            this.DisableStepTargets(i);
        }
    }

    private DisableStepTargets(index: number): void {
        for (const item of this.steps[index]?.items ?? []) {
            if (item?.isValid && item.itemDraggable) {
                item.itemDraggable.targetItemType = ItemType.None;
            }
        }
    }
}
