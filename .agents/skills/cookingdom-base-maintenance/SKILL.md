---
name: cookingdom-base-maintenance
description: Safely extend or review Cookingdom's reusable Cocos gameplay base, including interactions, hand tutorial, recipe progress, and editor tooling.
---

# Cookingdom Base Maintenance

Use this skill for reusable base changes, not for one-off visual scene edits.

## Guardrails

- Keep legacy levels operational by making new interaction architecture opt-in.
- Do not use `ItemType.None` to infer whether an item is free-drag or misconfigured. Prefer `ItemInteractionProfile` explicit modes for new content.
- Keep logical drop targets, movement destinations, and hand-tutorial targets separate when their nodes differ.
- Keep `HandTutManager` as a consumer of interaction availability; do not make it own game progression.
- Keep recipe evaluation in `CookingRecipeRunner`; adapters and animation relays only submit semantic interaction results.
- Preserve Animation Event entry points when refactoring. Existing clips/controllers should be able to invoke public, stable component methods.
- Validate affected scripts and assets after each coherent change. Inspect scene/prefab references before structural mutations.
