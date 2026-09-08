'use strict';

const fs = require('fs/promises');
const path = require('path');

const PACKAGE_NAME = 'cookingdom-toolkit';
const REQUIRED_FILES = [
  'assets/7.Scripts/Gameplay/Interaction/InteractionContract.ts',
  'assets/7.Scripts/Gameplay/Interaction/ItemInteractionProfile.ts',
  'assets/7.Scripts/Gameplay/Interaction/InteractionAnimationRelay.ts',
  'assets/7.Scripts/Gameplay/Recipe/CookingRecipeDefinition.ts',
  'assets/7.Scripts/Gameplay/Recipe/CookingRecipeRunner.ts',
  'assets/7.Scripts/Managers/HandTutManager.ts',
];

exports.methods = {
  openPanel() {
    Editor.Panel.open(PACKAGE_NAME);
  },

  async scanBase() {
    const projectRoot = Editor.Project.path;
    const checks = await Promise.all(REQUIRED_FILES.map(async (relativePath) => ({
      relativePath,
      exists: await exists(path.join(projectRoot, relativePath)),
    })));
    const sceneRoot = path.join(projectRoot, 'assets', '6.Scenes');
    const scenes = await collectFiles(sceneRoot, '.scene');
    return {
      projectName: path.basename(projectRoot),
      checks,
      scenes: scenes.map((file) => path.relative(projectRoot, file).replace(/\\/g, '/')).sort(),
      guidance: [
        'New drag item: configure ItemInteractionProfile as FreeDrag or DropToTarget.',
        'Animation completion: use InteractionAnimationRelay.CompleteRecipeStep() as an Animation Event.',
        'Keep target, arrival destination, and tutorial target separate when they differ.',
      ],
    };
  },
};

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch (_error) { return false; }
}

async function collectFiles(root, extension) {
  if (!(await exists(root))) return [];
  const results = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) results.push(fullPath);
    }
  }
  await visit(root);
  return results;
}
