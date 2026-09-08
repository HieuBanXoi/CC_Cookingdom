import { _decorator } from 'cc';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Ply_EventHandlerComponent } from '../../Core/Base/Ply_EventHandlerComponent';
import { GameManager } from '../../Managers/GameManager';
import { ItemType } from './ItemType';
import type { Item } from './Item';
import {
    CookingInteractionType,
    IGameplayInteraction,
    InteractionRejectReason,
    InteractionRequest,
    InteractionResult,
    InteractionResults,
} from '../Interaction/InteractionContract';

const { ccclass, property } = _decorator;

@ccclass('ItemClickable')
export class ItemClickable extends Ply_EventHandlerComponent implements IGameplayInteraction {

    public readonly interactionType = CookingInteractionType.Click;

    @property
    public requiredClicks: number = 1;

    @property({ tooltip: 'If true, clicking only checks canClick and always triggers onClick event without counting requiredClicks' })
    public infiniteClick: boolean = false;

    @property
    public canClick: boolean = true;

    @property({ tooltip: 'Disable clicking after click until EnableClick() is called (ignored if infiniteClick is true)' })
    public disableAfterClick: boolean = false;

    @property({ type: Ply_Event, tooltip: 'General onClick event' })
    public onClick: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Called when click count reaches requiredClicks' })
    public onClickComplete: Ply_Event = new Ply_Event();

    private currentClicks: number = 0;

    public get onClickEvent(): Ply_Event {
        return this.onClick;
    }

    public PerformClick(): InteractionResult {
        const result = this.tryComplete(this.createInteractionRequest());
        if (!result.accepted) return result;

        if (this.infiniteClick) {
            this.onClick.invoke();
            return result;
        }

        if (this.disableAfterClick) {
            this.canClick = false;
        }

        this.currentClicks++;
        this.onClick.invoke();

        if (result.completed) {
            this.onClickComplete.invoke();
            this.currentClicks = 0;
        }
        return result;
    }

    public CanClick(canClick: boolean) {
        this.canClick = canClick;
    }

    public EnableClick() {
        this.canClick = true;
    }

    public DisableClick() {
        this.canClick = false;
    }

    public ResetClicks() {
        this.currentClicks = 0;
    }

    /** Adapter API used by recipe flow, validators, and runtime debugging. */
    public canStart(request: InteractionRequest): InteractionResult {
        if (request.type !== this.interactionType) {
            return InteractionResults.rejected(InteractionRejectReason.PrerequisiteMissing);
        }
        if (request.actor && request.actor !== this.node) {
            return InteractionResults.rejected(InteractionRejectReason.WrongItem);
        }
        if (!GameManager.Ins?.IsPlaying()) {
            return InteractionResults.rejected(InteractionRejectReason.GameNotPlayable);
        }
        if (!this.enabled || !this.canClick) {
            return InteractionResults.rejected(InteractionRejectReason.Disabled);
        }
        return InteractionResults.started();
    }

    /** Predicts whether the next accepted click completes the configured click cycle. */
    public tryComplete(request: InteractionRequest): InteractionResult {
        const start = this.canStart(request);
        if (!start.accepted) return start;
        if (this.infiniteClick) return start;
        return this.currentClicks + 1 >= this.requiredClicks
            ? InteractionResults.completed(this.node)
            : start;
    }

    public resetInteraction(): void {
        this.ResetClicks();
    }

    private createInteractionRequest(): InteractionRequest {
        const item = this.getComponent('Item') as Item | null;
        return {
            type: this.interactionType,
            actor: this.node,
            actorItemType: item?.itemType ?? ItemType.None,
            target: this.node,
        };
    }

    public PlayPopSound() {
        Ply_SoundManager.Ins?.PlayFx(FxType.Click);
    }
}
