---
name: cookingdom-animation-events
description: Wire Cookingdom gameplay actions to Cocos Animation or Animation Controller events without coupling recipe progress to animation clips.
---

# Cookingdom Animation Events

Use this skill for Cookingdom interactions that start, complete, or transition through an animation.

## Convention

- Keep gameplay completion semantic: call a named component method from the final meaningful animation frame rather than relying on clip names or durations in gameplay code.
- Use `InteractionAnimationRelay` on the relevant node when the completed animation should report to `CookingRecipeRunner`.
- Call `StartConfiguredAnimation()` once when a replay begins; it resets duplicate-event protection and can either play a clip or send an Animation Controller trigger.
- Add an Animation Event at the completion frame targeting `InteractionAnimationRelay.CompleteRecipeStep()`.
- Configure `actorItem`, interaction type, target, and (when used) `recipeRunner` in the inspector. The relay remains usable without a recipe runner through its accepted/rejected events.
- Keep visual effects, sound, item swaps, and state transitions in existing `Ply_Event` bindings where practical. Do not duplicate them in the relay.

## Verify

Test the transition at normal speed and repeated/restarted animation playback. Confirm the recipe step cannot complete twice from duplicate events.
