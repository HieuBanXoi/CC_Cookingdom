import { Animation, Node, Tween, tween, Vec3 } from 'cc';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { Item } from './Item';
import { ItemType } from './ItemType';
import { Knife } from './Knife';
import { Plate2 } from './Plate2';

/**
 * Shared helpers for the foods cut on the board (Fish, Cucumber, Radish):
 * knife hand-over, knife appearance and the food -> next food sequence.
 */

/** A food that can jump onto the board when the previous one is done. */
export interface IJumpInFood {
    nextFood: Node | null;
    JumpIn(): void;
}

function GetJumpInFood(node: Node): IJumpInFood | null {
    const food = node.getComponents(Item).find(item => typeof (item as unknown as IJumpInFood).JumpIn === 'function');
    return food ? food as unknown as IJumpInFood : null;
}

/**
 * Deactivates firstFood and every food after it (following nextFood), so a
 * food only shows up once its turn comes (JumpIn). Call from the first food.
 */
export function HideUpcomingFoods(firstFood: Node | null): void {
    const visited = new Set<Node>();
    let current = firstFood;
    while (current?.isValid && !visited.has(current)) {
        visited.add(current);
        current.active = false;
        current = GetJumpInFood(current)?.nextFood ?? null;
    }
}

/** Lets knifeNode be dropped on owner (Knife.SetTarget). */
export function SetKnifeTargetOn(owner: Item, knifeNode: Node | null, fieldName: string): void {
    const knife = knifeNode?.isValid ? ComponentCache.get(knifeNode, Knife) : null;
    if (!knife) {
        console.warn(`[${owner.constructor.name}] Assign a node with a Knife component to "${fieldName}" on "${owner.node.name}".`);
        return;
    }
    knife.SetTarget(owner.node);
}

/**
 * Shows knifeNode and plays its default clip from the first frame.
 * Usually called from an animation event, i.e. after this frame's animation
 * update: without sampling, the knife would be drawn once at its resting pose.
 */
export function ShowKnife(owner: Item, knifeNode: Node | null, fieldName: string): void {
    if (!knifeNode?.isValid) {
        console.warn(`[${owner.constructor.name}] Assign a knife node to "${fieldName}" on "${owner.node.name}".`);
        return;
    }
    const anim = knifeNode.getComponent(Animation) ?? knifeNode.getComponentInChildren(Animation);
    // start() would replay the default clip one frame later (restarting it), so only play it from here.
    if (anim) anim.playOnLoad = false;

    knifeNode.active = true;
    // Same as Item.EnableKnife(): the stored knife is handed over once shown.
    if (owner.knife === knifeNode) owner.knife = null;
    Ply_SoundManager.Ins?.PlayFx(FxType.KnifePlace);

    const clip = anim?.defaultClip;
    if (!clip) return;
    anim.play(clip.name);
    anim.getState(clip.name)?.sample();
}

/** Activates node at home + offsetX and jumps it (arc of the given height) back to home, then calls onLanded. */
export function JumpInFromRight(node: Node, home: Vec3, offsetX: number, height: number, duration: number, onLanded?: () => void): void {
    Tween.stopAllByTarget(node);
    node.setPosition(home.x + offsetX, home.y, home.z);
    node.active = true;

    tween(node)
        .to(Math.max(0.01, duration), { position: home.clone() }, {
            easing: 'linear',
            // The position is re-interpolated from start/end every step, so the arc does not accumulate.
            onUpdate: (target: Node, ratio: number) => {
                const p = target.position;
                target.setPosition(p.x, p.y + Math.sin(Math.PI * ratio) * height, p.z);
            },
        })
        .call(() => {
            node.setPosition(home);
            onLanded?.();
        })
        .start();
}

/**
 * owner is fully cut: its type becomes FoodCutDone (the plate's drop type) and
 * one free plate of plates is pointed at it so the hand tutorial shows it.
 * Replaces Item.CutDone(), which would make the food draggable.
 */
export function MarkCutDone(owner: Item, plates: Plate2[] = []): void {
    owner.itemType = ItemType.FoodCutDone;
    AssignPlate(owner, plates);
}

/**
 * Points the first free plate at owner. Once any plate of the list landed on
 * owner, the other free plates lose their defaultTarget (no hint towards owner).
 */
function AssignPlate(owner: Item, plates: Plate2[]): void {
    const candidates = plates.filter(plate => plate?.isValid);
    if (candidates.length === 0) return;

    // A used plate is deactivated (Plate2.hideOnDrop), so skip inactive ones and take the next.
    const guide = candidates.find(plate => !plate.isDone && plate.node.activeInHierarchy);
    if (!guide) {
        console.warn(`[${owner.constructor.name}] No active, unused plate left for "${owner.node.name}".`);
        return;
    }
    guide.SetTarget(owner.node);

    const onPlaced = (target?: Node): void => {
        if (target !== owner.node) return;
        for (const plate of candidates) {
            plate.onPlaced.removeListener(onPlaced);
            if (!plate.isDone) plate.ClearTarget();
        }
    };
    for (const plate of candidates) {
        plate.onPlaced.removeListener(onPlaced);
        plate.onPlaced.addListener(onPlaced);
    }
}

/** owner is done: counts one phase step, brings the next food in and hides owner. */
export function FinishFood(owner: Item, nextFood: Node | null): void {
    owner.DoOneStep();

    if (nextFood?.isValid) {
        const next = GetJumpInFood(nextFood);
        if (next) next.JumpIn();
        else console.warn(`[${owner.constructor.name}] "${nextFood.name}" has no Cucumber / Radish component to jump in.`);
    }

    owner.node.active = false;
}
