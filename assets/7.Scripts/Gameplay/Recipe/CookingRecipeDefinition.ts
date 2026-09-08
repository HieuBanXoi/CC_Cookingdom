import { _decorator, Component, Enum, Node } from 'cc';
import { CookingInteractionType } from '../Interaction/InteractionContract';
import { ItemType } from '../Items/ItemType';

const { ccclass, property } = _decorator;

/** Inspector data for one required action in a Cookingdom recipe. */
@ccclass('CookingRecipeStep')
export class CookingRecipeStep {
    @property({ tooltip: 'Stable identifier used by tools and tutorial configuration, e.g. wash-chicken.' })
    public id = '';

    @property({ tooltip: 'Editor-facing name; it does not affect gameplay.' })
    public label = '';

    @property({ type: Enum(CookingInteractionType), tooltip: 'Player action that completes this step.' })
    public interactionType = CookingInteractionType.None;

    @property({ type: Enum(ItemType), tooltip: 'Item required for this step. Use None when the action has no item.' })
    public requiredItemType = ItemType.None;

    @property({ type: Node, tooltip: 'Optional receiving node or interactable node for this step.' })
    public target: Node | null = null;

    @property({ min: 1, tooltip: 'Number of accepted completions required before this step is complete.' })
    public requiredCompletions = 1;

    @property({ tooltip: 'Allow the next step only after this step completes.' })
    public blocksFollowingSteps = true;
}

/**
 * Data-only recipe timeline. Attaching this component changes no existing flow;
 * it establishes a single inspector schema for future level tools and adapters.
 */
@ccclass('CookingRecipeDefinition')
export class CookingRecipeDefinition extends Component {
    @property({ tooltip: 'Stable recipe key, e.g. chicken-fry-v1.' })
    public recipeId = '';

    @property({ tooltip: 'Human-readable recipe name.' })
    public displayName = '';

    @property({ type: [CookingRecipeStep], tooltip: 'Actions in the intended recipe order.' })
    public steps: CookingRecipeStep[] = [];

    /** Returns editor-safe configuration messages; the future validator will surface these in a panel. */
    public getValidationMessages(): string[] {
        const messages: string[] = [];
        const knownIds = new Set<string>();

        if (!this.recipeId.trim()) messages.push('Recipe ID is empty.');

        this.steps.forEach((step, index) => {
            const prefix = `Step ${index + 1}`;
            const id = step.id.trim();
            if (!id) messages.push(`${prefix}: ID is empty.`);
            else if (knownIds.has(id)) messages.push(`${prefix}: duplicate ID "${id}".`);
            else knownIds.add(id);

            if (step.interactionType === CookingInteractionType.None) {
                messages.push(`${prefix}: interaction type is not selected.`);
            }
            if (step.requiredCompletions < 1) {
                messages.push(`${prefix}: required completions must be at least 1.`);
            }
        });

        return messages;
    }
}
