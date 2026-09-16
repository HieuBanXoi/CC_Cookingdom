import { _decorator, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { CuttingItem } from './CuttingItem';
import { Knife } from './Knife';
import { ComponentCache } from '../../Core/Base/CacheComponent';

const { ccclass, property } = _decorator;

/**
 * Onion: dragged onto the cutting board, then tapped. Each tap punches the
 * onion and drops one leaf (falls + fades). After the last leaf the knife
 * may be dropped on it.
 */
@ccclass('Onion')
export class Onion extends CuttingItem {
    @property({ type: [Node], tooltip: 'Leaves revealed one per click, in order. Start inactive.' })
    public onionLeaves: Node[] = [];

    @property({ type: Node, tooltip: 'Node that punches on each click. Defaults to this node.' })
    public punchTarget: Node | null = null;

    @property({ min: 1, tooltip: 'Temporary scale multiplier for the punch.' })
    public punchScaleMultiplier = 1.06;

    @property({ min: 0.01, tooltip: 'Punch duration in seconds.' })
    public punchDuration = 0.18;

    @property({ tooltip: 'Local offset a leaf travels while falling (usually downwards).' })
    public leafFallOffset = new Vec3(0, -120, 0);

    @property({ min: 0.01, tooltip: 'Leaf fall + fade duration in seconds.' })
    public leafFallDuration = 0.6;

    @property({ tooltip: 'Random extra X spread for each falling leaf.' })
    public leafDriftX = 30;

    private clickCount = 0;
    private isPeeled = false;
    private isPunching = false;
    private punchBaseScale = new Vec3(1, 1, 1);
    private leafStartPositions: Vec3[] = [];

    private readonly onClick = (): void => this.OnOnionClick();

    protected onLoad(): void {
        super.onLoad();
        this.punchTarget ??= this.node;

        this.leafStartPositions = this.onionLeaves.map(leaf => leaf?.position.clone() ?? new Vec3());
        for (const leaf of this.onionLeaves) {
            if (leaf?.isValid) leaf.active = false;
        }

        // Clicking is only allowed once the onion is on the board.
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
    }

    /** Called by CuttingItem once the onion has arrived on the cutting board. */
    protected override OnMoveToCuttingBoard(): void {
        if (this.isPeeled) return;
        this.clickCount = 0;
        this.itemClickable?.ResetClicks();
        this.EnableItemClickable();
    }

    private OnOnionClick(): void {
        if (this.isPeeled || !this.isOnCuttingBoard) return;

        this.Punch();
        this.DropLeaf(this.clickCount);
        this.clickCount++;

        if (this.clickCount < this.onionLeaves.length) return;

        this.isPeeled = true;
        this.itemClickable?.DisableComponent();
        this.SetKnifeTarget();
    }

    /** Lets the assigned knife be dropped on this onion. */
    public SetKnifeTarget(): void {
        if (!this.knife?.isValid) {
            console.warn(`[Onion] Assign Item.knife on "${this.node.name}" to enable cutting.`);
            return;
        }
        ComponentCache.get(this.knife, Knife)?.SetTarget(this.node);
    }

    private DropLeaf(index: number): void {
        const leaf = this.onionLeaves[index];
        if (!leaf?.isValid) return;

        const start = this.leafStartPositions[index] ?? leaf.position.clone();
        const drift = (Math.random() * 2 - 1) * this.leafDriftX;
        const end = new Vec3(
            start.x + this.leafFallOffset.x + drift,
            start.y + this.leafFallOffset.y,
            start.z + this.leafFallOffset.z,
        );

        const opacity = leaf.getComponent(UIOpacity) ?? leaf.addComponent(UIOpacity);
        Tween.stopAllByTarget(leaf);
        Tween.stopAllByTarget(opacity);

        leaf.setPosition(start);
        opacity.opacity = 255;
        leaf.active = true;

        tween(leaf)
            .to(this.leafFallDuration, { position: end }, { easing: 'quadIn' })
            .call(() => { leaf.active = false; })
            .start();
        tween(opacity)
            .delay(this.leafFallDuration * 0.3)
            .to(this.leafFallDuration * 0.7, { opacity: 0 })
            .start();
    }

    private Punch(): void {
        const target = this.punchTarget;
        if (!target?.isValid) return;

        // Base on the current scale: reparenting / scaleOnMove may have changed it.
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
