import { _decorator, Animation, Node } from 'cc';
import { Item } from '../Items/Item';
import { ItemType } from '../Items/ItemType';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';
import { StrawberryFx } from './StrawberryFx';
import { StrawberryKnife } from './StrawberryKnife';
import { StrawberryHalf } from './StrawberryHalf';

const { ccclass, property } = _decorator;

/**
 * Phase 2 cutting board. A basket strawberry dropped here shows the sample
 * strawberry (which owns the cut animation), the knife cuts it, then both
 * halves are dragged to the bowl. Repeats until every strawberry is cut.
 * itemType is CuttingBoard while free and None while busy.
 */
@ccclass('StrawberryCutBoard')
export class StrawberryCutBoard extends Item {
    @property({ type: Animation, tooltip: 'Sample strawberry on the board (Strawberry whole).' })
    public sampleAnim: Animation | null = null;

    @property
    public cutClip = 'StrawberryCut';

    @property(StrawberryKnife)
    public cutKnife: StrawberryKnife | null = null;

    @property({ type: [StrawberryHalf], tooltip: 'Halves inside the sample, revealed by the cut animation.' })
    public halves: StrawberryHalf[] = [];

    @property({ type: Item, tooltip: 'Bowl that receives the halves (heart spawns there at the end).' })
    public bowl: Item | null = null;

    @property({ min: 1 })
    public totalStrawberries = 5;

    @property({ type: [Number], tooltip: 'Times (s) in the cut clip where the knife hits the strawberry; a cut sound plays at each.' })
    public cutSoundTimes: number[] = [0.25, 0.68];

    private cutCount = 0;
    private halvesPlaced = 0;

    public get SampleNode(): Node | null {
        return this.sampleAnim?.node ?? null;
    }

    protected onLoad(): void {
        super.onLoad();
        this.itemType = ItemType.CuttingBoard;
        if (this.SampleNode) this.SampleNode.active = false;
    }

    /** A basket strawberry was dropped: lock the board until this one is done. */
    public Reserve(): void {
        this.itemType = ItemType.None;
    }

    /** The dropped strawberry arrived: show the uncut sample and arm the knife. */
    public PlaceStrawberry(): void {
        const sample = this.SampleNode;
        if (!sample) return;

        sample.active = true;
        this.ResetSample();
        StrawberryFx.Punch(this.node, 0.05, 0.2);
        Ply_SoundManager.Ins?.PlayFx(FxType.FoodPlace);
        this.cutKnife?.Ready(sample, () => this.Cut());
    }

    /** Runs once the knife is dropped on the sample. */
    private Cut(): void {
        const anim = this.sampleAnim;
        if (!anim) return;

        for (const time of this.cutSoundTimes) {
            this.scheduleOnce(() => Ply_SoundManager.Ins?.PlayFx(FxType.KnifeCut), time);
        }
        anim.once(Animation.EventType.FINISHED, this.OnCutFinished, this);
        anim.play(this.cutClip);
    }

    /** Runs once a half has been dropped in the bowl. */
    private OnHalfPlaced(): void {
        this.halvesPlaced++;
        if (this.halvesPlaced < this.halves.length) return;

        this.halvesPlaced = 0;
        this.cutCount++;
        if (this.SampleNode) this.SampleNode.active = false;

        if (this.cutCount < this.totalStrawberries) {
            this.itemType = ItemType.CuttingBoard;
            return;
        }

        this.cutKnife?.ItemDone();
        for (const half of this.halves) half?.ItemDone();
        this.ItemDone();
        this.bowl?.SpawnHeart();
        this.DoOneStep();
    }

    private OnCutFinished(): void {
        this.cutKnife?.BackToSlot();
        for (const half of this.halves) half?.Ready(() => this.OnHalfPlaced());
    }

    /** Puts the sample back on the first frame of the cut clip (whole strawberry, no knife). */
    private ResetSample(): void {
        const anim = this.sampleAnim;
        if (!anim) return;

        anim.play(this.cutClip);
        const state = anim.getState(this.cutClip);
        if (state) {
            state.setTime(0);
            state.sample();
        }
        anim.stop();
    }
}
