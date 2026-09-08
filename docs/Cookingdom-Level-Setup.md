# Cookingdom level setup

Use this checklist once a gameplay scenario is available.

1. Create or duplicate the scene through Cocos Creator and keep its existing manager hierarchy.
2. Add the visual objects, then place one `Item` component on every interactable object.
3. For new drag interactions, add `ItemInteractionProfile`:
   - `FreeDrag` for an intentionally targetless drag.
   - `DropToTarget` plus `logicalTarget` for a valid drop.
   - Assign `arrivalTarget` only if the object should snap/move elsewhere after the drop.
   - Assign `tutorialTarget` only when the hand should point somewhere different from the logical target.
4. Keep the item's old `targetItemType` only for legacy matching. Do not use `None` as the default configuration for a new drop interaction.
5. If the level has ordered, reusable recipe steps, add `CookingRecipeDefinition` and `CookingRecipeRunner` to a level root. Define each required interaction, item type, target, and completion count.
6. For an action driven by Animation or Animation Controller, add `InteractionAnimationRelay` to the action node. Configure the actor, interaction type, target, and recipe runner. Trigger `StartConfiguredAnimation()` at action start and add an Animation Event calling `CompleteRecipeStep()` on the completing frame.
7. Bind visual transitions, VFX, sound, and existing level actions through `Ply_Event`; bind recipe completion to the current level's completion flow.
8. Configure Hand Tutorial only after the interaction is enabled. The profile's `tutorialTarget` takes precedence for explicit drag modes.
9. Preview the full loop: first tutorial, correct input, incorrect input, animation replay, final recipe step, win/retry.

The Cookingdom Toolkit extension provides a quick readiness check, but it cannot replace previewing interaction feel on the target device.
