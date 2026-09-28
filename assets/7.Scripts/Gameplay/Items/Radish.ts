import { _decorator, Node, Vec3 } from 'cc';
import { Item } from './Item';
import { Plate2 } from './Plate2';
import { FinishFood, IJumpInFood, JumpInFromRight, MarkCutDone, SetKnifeTargetOn, ShowKnife } from './CutFoodUtils';

const { ccclass, property } = _decorator;

/**
 * Radish cut by one knife. Jumps onto the board when the cucumber is done
 * (Cucumber.CucumberDone -> JumpIn); RadishDone() counts a phase step and
 * hides the radish (and brings nextFood in, if one is set).
 */
@ccclass('Radish')
export class Radish extends Item implements IJumpInFood {
    @property({ type: Node, tooltip: 'Knife (node with the Knife component) that cuts this radish.' })
    public cutKnife: Node | null = null;

    @property({ type: Node, tooltip: 'Optional food jumping in once the radish is done.' })
    public nextFood: Node | null = null;

    @property({ type: [Plate2], tooltip: 'Plates for this food. On CutDone the first free one is pointed at it (hand tutorial); once one landed, the others lose their target.' })
    public plates: Plate2[] = [];

    @property({ tooltip: 'Horizontal start offset of the jump, from the scene position (positive = from the right).' })
    public jumpInOffsetX = 800;

    @property({ tooltip: 'Height of the jump arc.' })
    public jumpHeight = 200;

    @property({ min: 0.01, tooltip: 'Duration of the jump, in seconds.' })
    public jumpDuration = 0.6;

    private homePosition: Vec3 | null = null;

    /** Lets the knife be dropped on this radish. Bind from an animation event. */
    public SetKnifeTarget(): void {
        SetKnifeTargetOn(this, this.cutKnife, 'cutKnife');
    }

    /** Shows the knife and plays its default clip. Bind from an animation event. */
    public override EnableKnife(): void {
        if (!this.cutKnife) {
            super.EnableKnife();
            return;
        }
        ShowKnife(this, this.cutKnife, 'cutKnife');
    }

    /** Activates the radish and jumps it from the right onto its scene position; once landed the knife may be dropped on it. */
    public JumpIn(): void {
        this.homePosition ??= this.node.position.clone();
        JumpInFromRight(this.node, this.homePosition, this.jumpInOffsetX, this.jumpHeight, this.jumpDuration,
            () => this.SetKnifeTarget());
    }

    /** The radish is fully cut: switches its type to FoodCutDone. Bind from an animation event. */
    public override CutDone(): void {
        MarkCutDone(this, this.plates);
    }

    /** The radish is done: one phase step, the radish hides. */
    public RadishDone(): void {
        FinishFood(this, this.nextFood);
    }
}
