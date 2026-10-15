import { _decorator, Enum, Node, tween, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';
import { StrawberryFx } from './StrawberryFx';
import { StrawberryMixBowl } from './StrawberryMixBowl';

const { ccclass, property } = _decorator;

/**
 * Phase 3 ingredient poured into the bowl (sugar spoon, vanilla jar).
 * Locked until its lid is opened. Dropped on the bowl it moves above it,
 * tilts, reveals its content in the bowl, then flies away fading out.
 * ItemDraggable.targetItemType = Bowl, defaultTarget = bowl.
 */
@ccclass('StrawberryPourer')
export class StrawberryPourer extends Item {
    @property({ tooltip: 'World offset from the bowl centre where the pourer tilts.' })
    public pourOffset = new Vec3(90, 200, 0);

    @property({ tooltip: 'Z rotation while pouring.' })
    public tiltAngle = 60;

    @property({ type: [Node], tooltip: 'Shown while held (sugar in spoon), hidden again if it returns.' })
    public showWhileHolding: Node[] = [];

    @property({ type: [Node], tooltip: 'Faded out while pouring (sugar in spoon).' })
    public hideOnPour: Node[] = [];

    @property({ type: Node, tooltip: 'Pouring stream root (DropAnim). Its children fade in one after another.' })
    public dropRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Content in the bowl revealed by this pour.' })
    public bowlContent: Node | null = null;

    @property({ tooltip: 'Content falls from this height while fading in. 0 = fade only.' })
    public contentFallHeight = 0;

    @property({ min: 0.1 })
    public pourDuration = 1.2;

    @property({ type: Enum(FxType), tooltip: 'Sound played when pouring starts.' })
    public pourFx: FxType = FxType.PouringSalt;

    @property({ tooltip: 'World offset the pourer flies by when done.' })
    public exitOffset = new Vec3(500, 350, 0);

    @property({ type: [Node], tooltip: 'Also fly away fading out once poured (the sugar jar the spoon came from).' })
    public flyAwayWith: Node[] = [];

    private readonly onBeginDrag = (): void => this.SetHoldingVisible(true);
    private readonly onReturnComplete = (): void => this.SetHoldingVisible(false);
    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);

    protected onLoad(): void {
        super.onLoad();
        this.itemDraggable?.DisableComponent();
        this.SetHoldingVisible(false);
        if (this.dropRoot) this.dropRoot.active = false;
        if (this.bowlContent) {
            this.bowlContent.active = true;
            StrawberryFx.SetOpacity(this.bowlContent, 0);
        }
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onReturnComplete);
        this.itemDraggable?.onReturnToStartComplete.addListener(this.onReturnComplete);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onReturnComplete);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    private OnDropSuccess(target: Node): void {
        const bowl = target.getComponent(StrawberryMixBowl);
        if (!bowl) {
            this.itemDraggable?.ReturnToStartWithoutHeart();
            return;
        }

        this.itemDraggable?.DisableComponent();
        this.ItemDone();

        const pourPos = StrawberryFx.OffsetWorld(bowl.node.worldPosition, this.pourOffset, bowl.node.parent);
        pourPos.z = this.node.worldPosition.z;
        tween(this.node)
            .to(0.3, { worldPosition: pourPos }, { easing: 'quadOut' })
            .to(0.25, { eulerAngles: new Vec3(0, 0, this.tiltAngle) }, { easing: 'quadOut' })
            .call(() => this.Pour(bowl))
            .start();
    }

    private Pour(bowl: StrawberryMixBowl): void {
        Ply_SoundManager.Ins?.PlayFx(this.pourFx);
        for (const node of this.hideOnPour) StrawberryFx.Fade(node, 0, this.pourDuration * 0.6);

        if (this.dropRoot) {
            this.dropRoot.active = true;
            StrawberryFx.SetOpacity(this.dropRoot, 255);
            const frames = this.dropRoot.children;
            const step = this.pourDuration * 0.6 / Math.max(1, frames.length);
            frames.forEach((frame, index) => {
                StrawberryFx.SetOpacity(frame, 0);
                tween(frame)
                    .delay(index * step)
                    .call(() => StrawberryFx.Fade(frame, 255, step * 1.5, 0))
                    .start();
            });
        }

        const content = this.bowlContent;
        if (content) {
            StrawberryFx.Fade(content, 255, this.pourDuration, 0);
            if (this.contentFallHeight > 0) {
                const rest = content.position.clone();
                content.setPosition(rest.x, rest.y + this.contentFallHeight, rest.z);
                tween(content).to(this.pourDuration, { position: rest }, { easing: 'quadIn' }).start();
            }
        }

        tween(this.node)
            .delay(this.pourDuration)
            .call(() => {
                if (this.dropRoot) StrawberryFx.Fade(this.dropRoot, 0, 0.25);
                bowl.AddIngredient();
                this.FlyAway();
            })
            .start();
    }

    private FlyAway(): void {
        this.FlyOut(this.node, true);
        for (const node of this.flyAwayWith) {
            if (node?.activeInHierarchy) this.FlyOut(node, false);
        }
    }

    private FlyOut(node: Node, straighten: boolean): void {
        const exitPos = StrawberryFx.OffsetWorld(node.worldPosition, this.exitOffset, node.parent);
        const props: { worldPosition: Vec3; eulerAngles?: Vec3 } = { worldPosition: exitPos };
        if (straighten) props.eulerAngles = new Vec3(0, 0, 0);
        StrawberryFx.Fade(node, 0, 0.5);
        tween(node)
            .to(0.5, props, { easing: 'quadIn' })
            .call(() => node.active = false)
            .start();
    }

    private SetHoldingVisible(visible: boolean): void {
        for (const node of this.showWhileHolding) {
            if (node) node.active = visible;
        }
    }
}
