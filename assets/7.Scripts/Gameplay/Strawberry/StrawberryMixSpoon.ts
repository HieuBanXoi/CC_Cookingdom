import { _decorator, Animation, AnimationClip, Node, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { StrawberryFx } from './StrawberryFx';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

const STIR_CLIP = 'StirProgress';

/**
 * Phase 3 mixing spoon. Jumps into the bowl, then the player holds it to
 * stir (ItemStirring). Stirring progress comes from an empty runtime clip of
 * stirDuration seconds and is reported to the bowl to cross-fade the mix.
 */
@ccclass('StrawberryMixSpoon')
export class StrawberryMixSpoon extends Item {
    @property(Node)
    public idleVisual: Node | null = null;

    @property(Node)
    public mixVisual: Node | null = null;

    @property({ min: 0.5, tooltip: 'Seconds of fast stirring needed.' })
    public stirDuration = 3;

    @property({ tooltip: 'World offset the spoon jumps in from.' })
    public jumpFromOffset = new Vec3(450, 350, 0);

    @property({ tooltip: 'World offset the spoon flies out by when stirring is done.' })
    public exitOffset = new Vec3(450, 350, 0);

    private onProgress: ((progress: number) => void) | null = null;
    private onDone: (() => void) | null = null;
    private stirAnimation: Animation | null = null;

    private readonly onStirBegin = (): void => this.ShowMixVisual(true);
    private readonly onStirComplete = (): void => this.FinishStir();

    protected onLoad(): void {
        super.onLoad();
        this.SetupStirClip();
        this.itemStirring?.DisableComponent();
        this.ShowMixVisual(false);
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemStirring?.onStirBegin.removeListener(this.onStirBegin);
        this.itemStirring?.onStirBegin.addListener(this.onStirBegin);
        this.itemStirring?.onStirComplete.removeListener(this.onStirComplete);
        this.itemStirring?.onStirComplete.addListener(this.onStirComplete);
    }

    protected onDisable(): void {
        this.itemStirring?.onStirBegin.removeListener(this.onStirBegin);
        this.itemStirring?.onStirComplete.removeListener(this.onStirComplete);
    }

    protected update(): void {
        if (!this.onProgress || !this.itemStirring?.enabled) return;
        const state = this.stirAnimation?.getState(STIR_CLIP);
        if (!state || state.duration <= 0) return;
        this.onProgress(Math.min(1, state.time / state.duration));
    }

    /** Shows the spoon and jumps it into its resting place in the bowl, then unlocks stirring. */
    public JumpIn(onProgress: (progress: number) => void, onDone: () => void): void {
        this.onProgress = onProgress;
        this.onDone = onDone;

        this.node.active = true;
        const home = this.node.worldPosition.clone();
        this.node.setWorldPosition(StrawberryFx.OffsetWorld(home, this.jumpFromOffset, this.node.parent?.parent ?? null));
        StrawberryFx.SetOpacity(this.node, 255);
        StrawberryFx.JumpToWorld(this.node, home, 150, 0.5, () => {
            Ply_SoundManager.Ins?.PlayFx(FxType.ItemPlace);
            this.itemStirring?.ResetStir();
            this.EnableItemStirring();
        });
    }

    private FinishStir(): void {
        this.DisableItemStirring();
        this.ItemDone();
        this.onProgress?.(1);
        this.onProgress = null;
        this.ShowMixVisual(false);

        const exit = StrawberryFx.OffsetWorld(this.node.worldPosition, this.exitOffset, this.node.parent?.parent ?? null);
        StrawberryFx.Fade(this.node, 0, 0.45);
        StrawberryFx.JumpToWorld(this.node, exit, 100, 0.45, () => {
            this.node.active = false;
            const onDone = this.onDone;
            this.onDone = null;
            onDone?.();
        });
    }

    /** ItemStirring needs an Animation clip as its progress; an empty clip gives a pure timer. */
    private SetupStirClip(): void {
        const stirring = this.itemStirring;
        if (!stirring) return;

        const anim = this.getComponent(Animation) ?? this.addComponent(Animation);
        if (!anim.getState(STIR_CLIP)) {
            const clip = new AnimationClip();
            clip.name = STIR_CLIP;
            clip.duration = this.stirDuration;
            clip.wrapMode = AnimationClip.WrapMode.Normal;
            anim.addClip(clip, STIR_CLIP);
            if (!anim.getState(STIR_CLIP)) anim.createState(clip, STIR_CLIP);
        }
        this.stirAnimation = anim;
        stirring.stirAnimation = anim;
        stirring.stirAnimationClipName = STIR_CLIP;
    }

    private ShowMixVisual(mixing: boolean): void {
        if (this.idleVisual) this.idleVisual.active = !mixing;
        if (this.mixVisual) this.mixVisual.active = mixing;
    }
}
