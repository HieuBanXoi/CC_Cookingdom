import { _decorator, Node } from 'cc';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { FinishFood, HideUpcomingFoods, MarkCutDone, SetKnifeTargetOn, ShowKnife } from './CutFoodUtils';
import { Item } from './Item';
import { Plate2 } from './Plate2';
import { ItemType } from './ItemType';
import { Towel } from './Towel';

const { ccclass, property } = _decorator;

/**
 * Fish on the cutting board, dried by a towel and cut by two separate knives.
 *
 * Each tool is handed to the fish from an animation event at a different
 * moment of the animation (SetTowelTarget / SetFirstKnifeTarget / SetSecondKnifeTarget).
 * A knife then lands on the fish through Knife.TargetKnifeFlyEvent -> Item.KnifeIn.
 */
@ccclass('Fish')
export class Fish extends Item {
    @property({ type: Node, tooltip: 'First knife (node with the Knife component) that cuts this fish.' })
    public firstKnife: Node | null = null;

    @property({ type: Node, tooltip: 'Second knife (node with the Knife component) that cuts this fish.' })
    public secondKnife: Node | null = null;

    @property({ type: Node, tooltip: 'Towel (node with the Towel component) that dries this fish.' })
    public towel: Node | null = null;

    @property({ type: [Node], tooltip: 'Water sprite nodes faded out by the towel while it wipes the fish.' })
    public waterNodes: Node[] = [];

    @property({ type: Node, tooltip: 'Food jumping in once the fish is done (the Cucumber node).' })
    public nextFood: Node | null = null;

    @property({ type: [Plate2], tooltip: 'Plates for this food. On CutDone the first free one is pointed at it (hand tutorial); once one landed, the others lose their target.' })
    public plates: Plate2[] = [];

    @property({ type: Ply_Event, tooltip: 'Triggered once the towel dried the fish completely (after SetSecondKnifeTarget).' })
    public onTowelWiped: Ply_Event = new Ply_Event();

    protected onLoad(): void {
        super.onLoad();
        // The cucumber, radish, ... only show up when their turn comes (FishDone -> JumpIn).
        HideUpcomingFoods(this.nextFood);
    }

    /** Lets the first knife be dropped on this fish. Bind from an animation event. */
    public SetFirstKnifeTarget(): void {
        SetKnifeTargetOn(this, this.firstKnife, 'firstKnife');
    }

    /** Lets the second knife be dropped on this fish. Bind from an animation event. */
    public SetSecondKnifeTarget(): void {
        SetKnifeTargetOn(this, this.secondKnife, 'secondKnife');
    }

    /** Shows the first knife and plays its default clip. Bind from an animation event. */
    public EnableFirstKnife(): void {
        ShowKnife(this, this.firstKnife, 'firstKnife');
    }

    /** Shows the second knife and plays its default clip. Bind from an animation event. */
    public EnableSecondKnife(): void {
        ShowKnife(this, this.secondKnife, 'secondKnife');
    }

    /** The fish is fully cut: switches its type to FoodCutDone. Bind from an animation event. */
    public override CutDone(): void {
        MarkCutDone(this, this.plates);
    }

    /** A plate was brought to the cut fish: plays the "Plate" trigger and takes the fish out of any drop target. */
    public PlateOn(): void {
        this.PlayTrigger('Plate');
        this.itemType = ItemType.None;
    }

    /** Lets the towel wipe this fish and fade the water nodes. Bind from an animation event. */
    public SetTowelTarget(): void {
        const towel = this.towel?.isValid ? ComponentCache.get(this.towel, Towel) : null;
        if (!towel) {
            console.warn(`[Fish] Assign a node with a Towel component to "towel" on "${this.node.name}".`);
            return;
        }
        towel.SetTarget(this.node, this.waterNodes, () => this.OnTowelWiped());
    }

    /** The towel dried the fish: the second knife may now be dropped on it. */
    private OnTowelWiped(): void {
        this.SetSecondKnifeTarget();
        this.onTowelWiped.invoke();
    }

    /** The fish is done: one phase step, the cucumber jumps in, the fish hides. Bind from an animation event. */
    public FishDone(): void {
        FinishFood(this, this.nextFood);
    }
}
