import { _decorator, Animation, Component, Enum, Node } from 'cc';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Item } from '../Items/Item';
import { ItemType } from '../Items/ItemType';
import { CookingRecipeRunner } from '../Recipe/CookingRecipeRunner';
import {
    CookingInteractionType,
    InteractionRequest,
    InteractionResult,
    InteractionResults,
} from './InteractionContract';

const { ccclass, property } = _decorator;

/**
 * Animation-event bridge for recipe progression. Add it to the node animated
 * by a clip/Animation Graph, then call CompleteRecipeStep() from the final
 * animation event. It remains useful without a recipe runner because its
 * serialized events can drive existing level flow.
 */
@ccclass('InteractionAnimationRelay')
export class InteractionAnimationRelay extends Component {
    @property({ type: CookingRecipeRunner, tooltip: 'Optional recipe runner to receive this animation completion.' })
    public recipeRunner: CookingRecipeRunner | null = null;

    @property({ type: Item, tooltip: 'Item performing this action. Defaults to an Item on this node.' })
    public actorItem: Item | null = null;

    @property({ type: Enum(CookingInteractionType), tooltip: 'Semantic action completed by the animation event.' })
    public interactionType = CookingInteractionType.None;

    @property({ type: Node, tooltip: 'Recipe target associated with this action, when needed.' })
    public target: Node | null = null;

    @property({ tooltip: 'Stable label for debugging and tools; it does not need to match the Animation Event function name.' })
    public completionEventId = '';

    @property({ type: Animation, tooltip: 'Optional regular Animation component to start from StartConfiguredAnimation().' })
    public animationComponent: Animation | null = null;

    @property({ tooltip: 'Clip name for regular Animation. Leave empty when an Animation Controller trigger is used.' })
    public animationClipName = '';

    @property({ tooltip: 'Optional Item.PlayTrigger() value for an Animation Controller or Animation Graph.' })
    public controllerTrigger = '';

    @property({ type: Ply_Event, tooltip: 'Called when the configured animation is started.' })
    public onAnimationStarted: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Called after the animation event is accepted by the recipe runner, or immediately when no runner is assigned.' })
    public onCompletionAccepted: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Called when a configured recipe runner rejects the animation completion.' })
    public onCompletionRejected: Ply_Event = new Ply_Event();

    private completionConsumed = false;

    protected onLoad(): void {
        this.actorItem ??= this.getComponent(Item);
        this.animationComponent ??= this.getComponent(Animation) || this.getComponentInChildren(Animation);
    }

    /** Starts the configured clip or controller trigger and opens one completion event. */
    public StartConfiguredAnimation(): void {
        this.completionConsumed = false;

        if (this.controllerTrigger.trim()) {
            this.actorItem?.PlayTrigger(this.controllerTrigger.trim());
        } else if (this.animationComponent && this.animationClipName.trim()) {
            this.animationComponent.play(this.animationClipName.trim());
        }

        this.onAnimationStarted.invoke(this.createRequest());
    }

    /** Call this exact method from a Cocos Animation Event at the semantic completion frame. */
    public CompleteRecipeStep(): InteractionResult {
        if (this.completionConsumed) return InteractionResults.started();
        this.completionConsumed = true;

        const request = this.createRequest();
        const result = this.recipeRunner?.RegisterInteraction(request) ?? InteractionResults.completed(request.target);
        if (result.accepted) this.onCompletionAccepted.invoke(request, result);
        else this.onCompletionRejected.invoke(request, result);
        return result;
    }

    /** Lets a replayed clip or a new player action receive its own completion event. */
    public ResetAnimationRelay(): void {
        this.completionConsumed = false;
    }

    public SetTarget(target: Node | null): void {
        this.target = target;
    }

    private createRequest(): InteractionRequest {
        const actor = this.actorItem ?? this.getComponent(Item);
        return {
            type: this.interactionType,
            actor: actor?.node ?? this.node,
            actorItemType: actor?.itemType ?? ItemType.None,
            target: this.target,
        };
    }
}
