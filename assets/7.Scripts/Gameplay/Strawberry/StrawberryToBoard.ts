import { _decorator, Node, tween, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { ItemType } from '../Items/ItemType';
import { StrawberryCutBoard } from './StrawberryCutBoard';
import { StrawberryFx } from './StrawberryFx';

const { ccclass, property } = _decorator;

/**
 * Phase 2 strawberry in the basket (a copy of the sample's look, tilted in the
 * basket). Dropped on a free cutting board it jumps onto the board, turning
 * upright, and is replaced by the board's sample strawberry.
 * ItemDraggable.targetItemType = CuttingBoard, defaultTarget = board.
 */
@ccclass('StrawberryToBoard')
export class StrawberryToBoard extends Item {
    @property({ min: 0.05 })
    public jumpDuration = 0.45;

    @property({ min: 0, tooltip: 'Height of the jump onto the board.' })
    public jumpHeight = 180;

    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);

    protected onLoad(): void {
        super.onLoad();
        // Only hint while the board is free.
        this.requireMatchingTargetTypeForHandTut = true;
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    private OnDropSuccess(target: Node): void {
        const board = target.getComponent(StrawberryCutBoard);
        const sample = board?.SampleNode;
        if (!board || !sample || board.itemType !== ItemType.CuttingBoard) {
            this.itemDraggable?.ReturnToStartWithoutHeart();
            return;
        }

        board.Reserve();
        this.itemDraggable?.DisableComponent();
        this.ItemDone();

        // Jump onto the board while turning upright and growing to the sample's size,
        // so swapping to the sample (whole strawberry, no knife yet) is seamless.
        const startScale = this.node.worldScale.clone();
        const endScale = sample.worldScale.clone();
        const state = { t: 0 };
        tween(state)
            .to(this.jumpDuration, { t: 1 }, {
                onUpdate: () => {
                    const s = new Vec3();
                    Vec3.lerp(s, startScale, endScale, state.t);
                    this.node.setWorldScale(s);
                },
            })
            .start();
        tween(this.node)
            .to(this.jumpDuration, { eulerAngles: new Vec3() }, { easing: 'sineOut' })
            .start();

        const samplePos = sample.worldPosition;
        StrawberryFx.JumpToWorld(this.node, new Vec3(samplePos.x, samplePos.y, this.node.worldPosition.z), this.jumpHeight, this.jumpDuration, () => {
            this.node.active = false;
            // Knife is armed only now, after the strawberry is upright on the board.
            board.PlaceStrawberry();
        });
    }
}
