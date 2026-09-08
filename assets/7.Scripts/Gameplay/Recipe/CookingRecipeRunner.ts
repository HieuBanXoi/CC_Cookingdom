import { _decorator, Component } from 'cc';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import {
    InteractionRejectReason,
    InteractionRequest,
    InteractionResult,
    InteractionResults,
} from '../Interaction/InteractionContract';
import { CookingRecipeDefinition, CookingRecipeStep } from './CookingRecipeDefinition';

const { ccclass, property } = _decorator;

/**
 * Opt-in recipe progression. It has no automatic scene subscriptions: existing
 * levels keep using their current events until they deliberately forward an
 * interaction request here.
 */
@ccclass('CookingRecipeRunner')
export class CookingRecipeRunner extends Component {
    @property({ type: CookingRecipeDefinition, tooltip: 'Recipe whose ordered steps this runner accepts.' })
    public recipe: CookingRecipeDefinition | null = null;

    @property({ type: Ply_Event, tooltip: 'Called whenever the active recipe step receives one accepted completion.' })
    public onStepProgress: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Called when an active recipe step reaches its required completions.' })
    public onStepComplete: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Called once after the final recipe step completes.' })
    public onRecipeComplete: Ply_Event = new Ply_Event();

    @property({ readonly: true })
    public currentStepIndex = 0;

    @property({ readonly: true })
    public currentStepCompletions = 0;

    public get CurrentStep(): CookingRecipeStep | null {
        return this.recipe?.steps[this.currentStepIndex] ?? null;
    }

    public get IsComplete(): boolean {
        return !!this.recipe && this.currentStepIndex >= this.recipe.steps.length;
    }

    /**
     * Registers a completion from an interaction adapter. The caller owns the
     * interaction's visual behavior; this method only evaluates recipe data.
     */
    public RegisterInteraction(request: InteractionRequest): InteractionResult {
        const recipe = this.recipe;
        if (!recipe || recipe.steps.length === 0) {
            return InteractionResults.rejected(InteractionRejectReason.PrerequisiteMissing);
        }
        if (this.IsComplete) return InteractionResults.rejected(InteractionRejectReason.AlreadyComplete);

        const step = this.CurrentStep;
        if (!step || step.interactionType !== request.type) {
            return InteractionResults.rejected(InteractionRejectReason.PrerequisiteMissing);
        }
        if (step.requiredItemType !== 0 && step.requiredItemType !== request.actorItemType) {
            return InteractionResults.rejected(InteractionRejectReason.WrongItem);
        }
        if (step.target && step.target !== request.target) {
            return InteractionResults.rejected(InteractionRejectReason.WrongTarget);
        }

        this.currentStepCompletions++;
        this.onStepProgress.invoke(step, this.currentStepCompletions, request);

        if (this.currentStepCompletions < Math.max(1, step.requiredCompletions)) {
            return InteractionResults.started();
        }

        this.onStepComplete.invoke(step, request);
        this.currentStepIndex++;
        this.currentStepCompletions = 0;

        if (this.IsComplete) this.onRecipeComplete.invoke(recipe);
        return InteractionResults.completed(request.target);
    }

    /** Reset progress without resetting scene objects or interaction components. */
    public ResetRecipeProgress(): void {
        this.currentStepIndex = 0;
        this.currentStepCompletions = 0;
    }
}
