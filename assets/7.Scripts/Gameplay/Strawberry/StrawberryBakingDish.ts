import { _decorator, Node, ParticleSystem2D, tween, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { ItemType } from '../Items/ItemType';
import { StrawberryFx } from './StrawberryFx';
import { StrawberryOven } from './StrawberryOven';

const { ccclass, property } = _decorator;

/**
 * Phase 3 baking dish. Slides in from the right, receives the bowl's mix,
 * is dragged into the oven, and after baking comes back out baked and
 * smoking, which finishes the phase.
 * ItemDraggable.targetItemType = Oven, defaultTarget = oven.
 */
@ccclass('StrawberryBakingDish')
export class StrawberryBakingDish extends Item {
    @property({ type: Node, tooltip: 'Unbaked visuals (BeforeCook).' })
    public beforeCook: Node | null = null;

    @property({ type: Node, tooltip: 'Baked visual (After baked).' })
    public afterBake: Node | null = null;

    @property({ type: Node, tooltip: 'Mix in the dish, revealed by the bowl pour.' })
    public content: Node | null = null;

    @property(ParticleSystem2D)
    public smoke: ParticleSystem2D | null = null;

    @property({ tooltip: 'Local X offset the dish slides in from.' })
    public enterOffsetX = 1200;

    private homeParent: Node | null = null;
    private homePosition = new Vec3();
    private homeScale = new Vec3();

    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);

    protected onLoad(): void {
        super.onLoad();
        this.itemType = ItemType.BakingDish;
        this.homeParent = this.node.parent;
        Vec3.copy(this.homePosition, this.node.position);
        Vec3.copy(this.homeScale, this.node.scale);
        this.node.setPosition(this.homePosition.x + this.enterOffsetX, this.homePosition.y, this.homePosition.z);

        this.itemDraggable?.DisableComponent();
        if (this.afterBake) this.afterBake.active = false;
        if (this.content) StrawberryFx.SetOpacity(this.content, 0);
        this.smoke?.stopSystem();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    public Enter(onArrived?: () => void): void {
        tween(this.node)
            .to(0.6, { position: this.homePosition }, { easing: 'quadOut' })
            .call(() => onArrived?.())
            .start();
    }

    /** Fades the poured mix in. */
    public ShowContent(duration: number): void {
        StrawberryFx.Fade(this.content, 255, duration, 0);
    }

    public EnableToOven(): void {
        this.EnableItemDraggable();
    }

    private OnDropSuccess(target: Node): void {
        const oven = target.getComponent(StrawberryOven);
        if (!oven || !oven.CanReceiveDish) {
            this.itemDraggable?.ReturnToStartWithoutHeart();
            return;
        }

        this.itemDraggable?.DisableComponent();
        this.ItemDone();
        oven.ReceiveDish(this.node, () => this.TakeOut());
    }

    /** Door opened after baking: show the baked dish and bring it back out. */
    private TakeOut(): void {
        if (this.beforeCook) this.beforeCook.active = false;
        if (this.afterBake) this.afterBake.active = true;
        if (this.homeParent) StrawberryFx.SetParentKeepWorld(this.node, this.homeParent);

        tween(this.node)
            .to(0.5, { position: this.homePosition, scale: this.homeScale }, { easing: 'quadOut' })
            .call(() => {
                this.smoke?.resetSystem();
                this.SpawnHeart();
                this.DoOneStep();
            })
            .start();
    }
}
