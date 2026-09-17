import { _decorator, Node, Sprite, Tween, tween, UITransform, Vec3, math } from 'cc';
import { CuttingItem } from './CuttingItem';
import { Knife } from './Knife';
import { ComponentCache } from '../../Core/Base/CacheComponent';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { InputManager } from '../../Managers/InputManager';
import { GameManager } from '../../Managers/GameManager';

const { ccclass, property } = _decorator;

/**
 * Garlic: dragged onto the cutting board, then tapped. The first taps punch
 * the bulb, the last tap reveals garlic_clean and hands the item to the knife.
 */
@ccclass('Garlic')
export class Garlic extends CuttingItem {
    @property({ type: Node, tooltip: 'Unpeeled visual, hidden on the last click. Defaults to child garlic_base.' })
    public garlicBase: Node | null = null;

    @property({ type: Node, tooltip: 'Node revealed on the last click. Defaults to child garlic_clean.' })
    public garlicClean: Node | null = null;

    @property({ type: Node, tooltip: 'Node that punches on each click. Defaults to this node.' })
    public punchTarget: Node | null = null;

    @property({ min: 1, tooltip: 'Clicks needed to reveal garlic_clean.' })
    public requiredClicks = 3;

    @property({ min: 1, tooltip: 'Temporary scale multiplier for the punch.' })
    public punchScaleMultiplier = 1.1;

    @property({ min: 0.01, tooltip: 'Punch duration in seconds.' })
    public punchDuration = 0.18;

    // --- CUTTING (after the knife arrives) ---
    @property({ type: Node, tooltip: 'Knife sprite that slides across the garlic. Defaults to child knife.' })
    public knifeSprite: Node | null = null;

    @property({ type: Node, tooltip: 'Cut visual, revealed left-to-right with a horizontal fill. Defaults to child garlic_cut.' })
    public garlicCut: Node | null = null;

    @property({ min: 1, tooltip: 'Clicks needed to cut the whole garlic.' })
    public requiredCuts = 4;

    @property({ min: 0.01, tooltip: 'Duration of each cut step (fill + knife slide).' })
    public cutStepDuration = 0.15;

    @property({ tooltip: 'Extra X offset of the knife from the fill edge, in garlic local units.' })
    public knifeOffsetX = 0;

    @property({ min: 0, tooltip: 'Time for the knife sprite to fly back to the real knife once cutting is done.' })
    public knifeReturnDuration = 0.4;

    private clickCount = 0;
    private isPeeled = false;
    private isCutting = false;
    private cutCount = 0;
    private cutProgress = 0;
    private cutSprite: Sprite | null = null;
    private cleanSprite: Sprite | null = null;
    private cutLeftX = 0;
    private cutWidth = 0;
    private punchBaseScale = new Vec3(1, 1, 1);
    private isPunching = false;

    private readonly onClick = (): void => this.OnGarlicClick();
    private readonly onKnifeSpriteTouch = (): void => this.OnKnifeSpriteTouch();

    protected onLoad(): void {
        super.onLoad();
        this.garlicBase ??= this.node.getChildByName('garlic_base');
        this.garlicClean ??= this.node.getChildByName('garlic_clean');
        this.punchTarget ??= this.node;
        this.knifeSprite ??= this.node.getChildByName('knife');
        this.garlicCut ??= this.node.getChildByName('garlic_cut');
        if (this.knifeSprite) this.knifeSprite.active = false;
        if (this.garlicCut) this.garlicCut.active = false;
        if (this.garlicClean) this.garlicClean.active = false;

        // Clicking is only allowed once the garlic is on the board.
        this.itemClickable?.DisableComponent();
    }

    protected onEnable(): void {
        super.onEnable();
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemClickable?.onClick.addListener(this.onClick);
    }

    protected onDisable(): void {
        super.onDisable();
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.UnbindKnifeSpriteTouch();
    }

    /**
     * The knife sprite sticks out of the garlic's UITransform, so a tap on the
     * blade never passes InputManager's hit test on the garlic. Listen on the
     * sprite itself while cutting; the node swallows the touch, so InputManager
     * does not see it and a chop is never counted twice.
     */
    private BindKnifeSpriteTouch(): void {
        if (!this.knifeSprite?.isValid) return;
        this.knifeSprite.off(Node.EventType.TOUCH_START, this.onKnifeSpriteTouch);
        this.knifeSprite.on(Node.EventType.TOUCH_START, this.onKnifeSpriteTouch);
    }

    private UnbindKnifeSpriteTouch(): void {
        this.knifeSprite?.off(Node.EventType.TOUCH_START, this.onKnifeSpriteTouch);
    }

    private OnKnifeSpriteTouch(): void {
        if (!this.isCutting || GameManager.Ins?.IsPlaying() !== true) return;
        const clickable = this.itemClickable;
        if (!clickable?.enabled || !clickable.canClick) return;

        InputManager.Ins?.RegisterFirstMove();
        clickable.PerformClick();
    }

    /** Called by CuttingItem once the garlic has arrived on the cutting board. */
    protected override OnMoveToCuttingBoard(): void {
        if (this.isPeeled) return;
        this.clickCount = 0;
        this.itemClickable?.ResetClicks();
        this.EnableItemClickable();
    }

    private OnGarlicClick(): void {
        if (!this.isOnCuttingBoard) return;
        if (this.isCutting) {
            this.CutStep();
            return;
        }
        if (this.isPeeled) return;

        this.clickCount++;
        Ply_SoundManager.Ins?.PlayFx(FxType.Click);
        this.Punch();

        if (this.clickCount < this.requiredClicks) return;

        this.isPeeled = true;
        this.itemClickable?.DisableComponent();
        if (this.garlicBase) this.garlicBase.active = false;
        if (this.garlicClean) this.garlicClean.active = true;
        this.SetKnifeTarget();
    }

    // =========================================================
    // CUTTING
    // =========================================================

    /** The real knife arrived (Knife.TargetKnifeFlyEvent). Switch to click-to-cut. */
    public override KnifeIn(): void {
        super.KnifeIn();
        this.StartCutting();
    }

    public StartCutting(): void {
        if (this.isCutting || this.isCutDone) return;
        if (!this.garlicCut?.isValid) {
            console.warn(`[Garlic] garlic_cut is missing on "${this.node.name}".`);
            return;
        }

        // garlic_cut fills left-to-right; garlic_clean stays underneath, so the
        // part left of the knife shows cut and the part right of it shows clean.
        this.cutSprite = this.garlicCut.getComponent(Sprite);
        if (this.cutSprite) {
            this.cutSprite.type = Sprite.Type.FILLED;
            this.cutSprite.fillType = Sprite.FillType.HORIZONTAL;
            this.cutSprite.fillStart = 0;
            this.cutSprite.fillRange = 0;
        }

        // garlic_clean fills the opposite way (from the knife edge to the right)
        // so the two sprites never overlap at the seam.
        this.cleanSprite = this.garlicClean?.getComponent(Sprite) ?? null;
        if (this.cleanSprite) {
            this.cleanSprite.type = Sprite.Type.FILLED;
            this.cleanSprite.fillType = Sprite.FillType.HORIZONTAL;
            this.cleanSprite.fillStart = 0;
            this.cleanSprite.fillRange = 1;
        }

        const cutTransform = this.garlicCut.getComponent(UITransform);
        const width = cutTransform ? cutTransform.width * this.garlicCut.scale.x : 0;
        const anchorX = cutTransform ? cutTransform.anchorX : 0.5;
        this.cutLeftX = this.garlicCut.position.x - anchorX * width;
        this.cutWidth = width;

        this.cutCount = 0;
        this.cutProgress = 0;
        this.garlicCut.active = true;
        if (this.knifeSprite) {
            this.knifeSprite.active = true;
            this.PlaceKnifeAt(0);
        }
        this.BindKnifeSpriteTouch();

        this.isCutting = true;
        this.itemClickable?.ResetClicks();
        this.EnableItemClickable();
    }

    private CutStep(): void {
        if (!this.isCutting) return;

        this.cutCount++;
        const target = math.clamp01(this.cutCount / this.requiredCuts);
        const state = { p: this.cutProgress };
        const isLast = this.cutCount >= this.requiredCuts;

        if (this.garlicCut) Tween.stopAllByTarget(this.garlicCut);
        tween(state)
            .to(this.cutStepDuration, { p: target }, {
                easing: 'sineOut',
                onUpdate: () => this.ApplyCutProgress(state.p),
            })
            .call(() => {
                this.ApplyCutProgress(target);
                if (isLast) this.FinishCutting();
            })
            .start();

        this.Punch();
        Ply_SoundManager.Ins?.PlayFx(FxType.KnifeCut);
        // Burst of garlic bits at the knife edge on every chop.
        this.SpawnFoodSpark();
        if (isLast) this.itemClickable?.DisableComponent();
    }

    private ApplyCutProgress(progress: number): void {
        this.cutProgress = progress;
        if (this.cutSprite) this.cutSprite.fillRange = progress;
        if (this.cleanSprite) {
            this.cleanSprite.fillStart = progress;
            this.cleanSprite.fillRange = 1 - progress;
        }
        this.PlaceKnifeAt(progress);
    }

    private PlaceKnifeAt(progress: number): void {
        if (!this.knifeSprite?.isValid) return;
        const pos = this.knifeSprite.position;
        this.knifeSprite.setPosition(this.cutLeftX + this.cutWidth * progress + this.knifeOffsetX, pos.y, pos.z);
    }

    private FinishCutting(): void {
        this.isCutting = false;
        this.UnbindKnifeSpriteTouch();
        if (this.cutSprite) this.cutSprite.fillRange = 1;

        // Fly the knife sprite back to the real knife, then hand control back to it.
        const sprite = this.knifeSprite;
        const realKnife = this.knife;
        if (sprite?.isValid && realKnife?.isValid && this.knifeReturnDuration > 0) {
            Tween.stopAllByTarget(sprite);
            tween(sprite)
                .to(this.knifeReturnDuration, { worldPosition: realKnife.worldPosition.clone() }, { easing: 'sineIn' })
                .call(() => this.OnKnifeReturned())
                .start();
            return;
        }

        this.OnKnifeReturned();
    }

    private OnKnifeReturned(): void {
        if (this.knifeSprite) this.knifeSprite.active = false;
        this.EnableKnife();
        this.CutDone();
    }

    /** Lets the assigned knife be dropped on this garlic. */
    public SetKnifeTarget(): void {
        if (!this.knife?.isValid) {
            console.warn(`[Garlic] Assign Item.knife on "${this.node.name}" to enable cutting.`);
            return;
        }
        ComponentCache.get(this.knife, Knife)?.SetTarget(this.node);
    }

    private Punch(): void {
        const target = this.punchTarget;
        if (!target?.isValid) return;

        // The node's local scale changes when ItemMoveToTarget reparents or
        // scales it, so take the current scale as the base unless a punch is
        // already mid-way (rapid taps).
        if (!this.isPunching) Vec3.copy(this.punchBaseScale, target.scale);
        this.isPunching = true;

        Tween.stopAllByTarget(target);
        target.setScale(this.punchBaseScale);
        const punchScale = this.punchBaseScale.clone().multiplyScalar(this.punchScaleMultiplier);
        tween(target)
            .to(this.punchDuration * 0.4, { scale: punchScale }, { easing: 'sineOut' })
            .to(this.punchDuration * 0.6, { scale: this.punchBaseScale.clone() }, { easing: 'sineIn' })
            .call(() => { this.isPunching = false; })
            .start();
    }
}
