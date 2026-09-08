---
name: cookingdom-level-authoring
description: Author or revise a Cookingdom Cocos level from a supplied gameplay script, using the project interaction, recipe, tutorial, and animation conventions.
---

# Cookingdom Level Authoring

Use this skill when creating or changing a Cookingdom gameplay level after the user supplies its scenario.

## Working convention

- Inspect the requested scene/prefab and its ownership before changing it. Do not edit serialized Cocos scene or prefab files as plain text.
- Preserve the existing `GameManager` / `PhaseManager` completion flow unless the scenario explicitly needs a new flow.
- Treat `ItemInteractionProfile` as opt-in authoring data. `UseLegacy` leaves existing components and targets untouched.
- For a draggable item, choose exactly one authoring intent:
  - `FreeDrag`: movement is allowed and it intentionally has no drop target.
  - `DropToTarget`: assign `logicalTarget`; optionally assign a separate `arrivalTarget` and `tutorialTarget`.
  - `UseLegacy`: retain `targetItemType` matching for older levels.
- Add `CookingRecipeDefinition` and `CookingRecipeRunner` only when ordered data-driven progression helps the requested level. Do not force-migrate a small linear legacy level.
- Finish with asset refresh, script diagnostics, scene validation, and relevant preview/runtime checks.

## Handoff

Report the scene/prefab changed, each interaction mapping, animation-event wiring, and any manual validation still required on device.
