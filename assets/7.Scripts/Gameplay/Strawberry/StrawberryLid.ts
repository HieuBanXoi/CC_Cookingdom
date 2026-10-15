import { _decorator, Node, tween, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';
import { StrawberryFx } from './StrawberryFx';

const { ccclass, property } = _decorator;

/**
 * Phase 3 lid (sugar jar lid, vanilla cap). Tapping it flies it up while it
 * fades out, then unlocks the pourer (sugar spoon / vanilla jar).
 */
@ccclass('StrawberryLid')
export class StrawberryLid extends Item {
    @property({ type: Item, tooltip: 'Item whose ItemDraggable is enabled once the lid is off.' })
    public pourer: Item | null = null;

    @property({ type: Node, tooltip: 'Parent the lid moves to when opened (so it stays put if the container is dragged). Empty = the container\'s parent.' })
    public detachTo: Node | null = null;

    @property({ tooltip: 'Offset the lid flies by while fading out.' })
    public openOffset = new Vec3(60, 320, 0);

    @property({ tooltip: 'Z rotation reached while flying away.' })
    public openAngle = -20;

    @property({ min: 0.05 })
    public openDuration = 0.6;

    private readonly onClick = (): void => this.Open();

    protected onLoad(): void {
        super.onLoad();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemClickable?.onClick.addListener(this.onClick);
    }

    protected onDisable(): void {
        this.itemClickable?.onClick.removeListener(this.onClick);
    }

    public Open(): void {
        if (this.isDone) return;
        this.DisableItemClickable();
        this.ItemDone();
        Ply_SoundManager.Ins?.PlayFx(FxType.Click);

        const parent = this.detachTo ?? this.node.parent?.parent ?? null;
        if (parent) StrawberryFx.SetParentKeepWorld(this.node, parent);

        const target = StrawberryFx.OffsetWorld(this.node.worldPosition, this.openOffset, this.node.parent);
        StrawberryFx.Fade(this.node, 0, this.openDuration);
        tween(this.node)
            .to(this.openDuration, { worldPosition: target, eulerAngles: new Vec3(0, 0, this.openAngle) }, { easing: 'quadOut' })
            .call(() => this.node.active = false)
            .start();
        this.pourer?.EnableItemDraggable();
    }
}
