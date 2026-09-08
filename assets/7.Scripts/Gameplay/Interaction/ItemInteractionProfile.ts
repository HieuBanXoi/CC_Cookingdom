import { _decorator, Component, Enum, Node } from 'cc';
import { ItemInteractionMode } from './InteractionContract';
import { ItemDraggable } from '../Items/ItemDraggable';
import { ItemMoveToTarget } from '../Items/ItemMoveToTarget';

const { ccclass, property } = _decorator;

/**
 * Optional item-level authoring data. It does not enable, disable, or mutate
 * legacy interaction components; it only gives gameplay, tutorial, and tools
 * unambiguous targets when a level opts in.
 */
@ccclass('ItemInteractionProfile')
export class ItemInteractionProfile extends Component {
    @property({ type: Enum(ItemInteractionMode), tooltip: 'UseLegacy leaves the existing component setup as the source of truth.' })
    public mode = ItemInteractionMode.UseLegacy;

    @property({ type: Node, tooltip: 'Exact UI node that accepts a DropToTarget action.' })
    public logicalTarget: Node | null = null;

    @property({ type: Node, tooltip: 'Optional final position used by ItemMoveToTarget after a successful drop.' })
    public arrivalTarget: Node | null = null;

    @property({ type: Node, tooltip: 'Optional target used only for the hand tutorial. Falls back to logical then arrival target.' })
    public tutorialTarget: Node | null = null;

    public get IsExplicitDragMode(): boolean {
        return this.mode === ItemInteractionMode.FreeDrag || this.mode === ItemInteractionMode.DropToTarget;
    }

    protected onLoad(): void {
        this.ApplyConfiguredTargets();
    }

    /** Applies only target data; component enabled state remains controlled by the existing game flow. */
    public ApplyConfiguredTargets(): void {
        const draggable = this.getComponent(ItemDraggable);
        if (this.mode === ItemInteractionMode.DropToTarget) {
            draggable?.SetExplicitDropTarget(this.logicalTarget);
        } else if (this.mode === ItemInteractionMode.FreeDrag) {
            // Explicitly opt out of legacy ItemType target matching.
            draggable?.SetExplicitDropTarget(null);
        }

        if (this.arrivalTarget?.isValid) {
            this.getComponent(ItemMoveToTarget)?.SetDefaultTarget(this.arrivalTarget);
        }
    }

    public get TutorialTarget(): Node | null {
        if (this.tutorialTarget?.isValid) return this.tutorialTarget;
        if (this.logicalTarget?.isValid) return this.logicalTarget;
        return this.arrivalTarget?.isValid ? this.arrivalTarget : null;
    }

    public getValidationMessages(): string[] {
        if (this.mode !== ItemInteractionMode.DropToTarget) return [];
        return this.logicalTarget?.isValid ? [] : ['DropToTarget requires a Logical Target.'];
    }
}
