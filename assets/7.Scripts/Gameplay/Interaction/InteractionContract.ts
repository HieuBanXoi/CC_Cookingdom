import { Enum, Node } from 'cc';
import { ItemType } from '../Items/ItemType';

/** The player action used to advance a cooking step. */
export enum CookingInteractionType {
    None = 0,
    DragDrop,
    Click,
    Stir,
    Peel,
    Rotate,
    Toggle,
}
Enum(CookingInteractionType);

/**
 * Authoring intent for an Item's currently configured interaction. UseLegacy
 * preserves existing component-driven levels; the other modes make intent
 * explicit for recipe tools and hand tutorial.
 */
export enum ItemInteractionMode {
    UseLegacy = 0,
    Disabled,
    FreeDrag,
    DropToTarget,
    Click,
    Stir,
}
Enum(ItemInteractionMode);

/** A stable, machine-readable reason an interaction was not accepted. */
export enum InteractionRejectReason {
    None = 0,
    GameNotPlayable,
    Disabled,
    AlreadyComplete,
    WrongItem,
    WrongTarget,
    PrerequisiteMissing,
}
Enum(InteractionRejectReason);

/** Runtime information supplied by an input or gameplay component. */
export interface InteractionRequest {
    type: CookingInteractionType;
    actor: Node | null;
    actorItemType: ItemType;
    target: Node | null;
}

/** Result returned by an interaction before it is forwarded to phase/tutorial systems. */
export interface InteractionResult {
    accepted: boolean;
    completed: boolean;
    reason: InteractionRejectReason;
    target: Node | null;
}

export const InteractionResults = {
    rejected(reason: InteractionRejectReason): InteractionResult {
        return { accepted: false, completed: false, reason, target: null };
    },

    started(): InteractionResult {
        return { accepted: true, completed: false, reason: InteractionRejectReason.None, target: null };
    },

    completed(target: Node | null = null): InteractionResult {
        return { accepted: true, completed: true, reason: InteractionRejectReason.None, target };
    },
};

/**
 * Common API for future drag, click, stir, peel, rotate and toggle adapters.
 * Existing interaction components remain unchanged until each is migrated.
 */
export interface IGameplayInteraction {
    readonly interactionType: CookingInteractionType;
    canStart(request: InteractionRequest): InteractionResult;
    tryComplete(request: InteractionRequest): InteractionResult;
    resetInteraction(): void;
}
