import { _decorator, Node, tween, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { StrawberryBasket } from './StrawberryBasket';
import { StrawberryFx } from './StrawberryFx';

const { ccclass, property } = _decorator;

/**
 * Phase 1 strawberry on the bush. Picking = starting a drag (punch on Y);
 * dropping it on the basket flies it into the next basket slot.
 * ItemDraggable.targetItemType = Basket, ItemMoveToTarget.defaultTarget = Basket.
 */
@ccclass('StrawberryPick')
export class StrawberryPick extends Item {
    @property({ min: 0, tooltip: 'Y stretch of the pick punch.' })
    public pickPunch = 0.2;

    @property({ min: 0.05 })
    public flyDuration = 0.35;

    private readonly onBeginDrag = (): void => this.OnBeginDrag();
    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);

    protected onLoad(): void {
        super.onLoad();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
    }

    private OnBeginDrag(): void {
        // ItemDraggable already started its lift tween from the resting world scale.
        const drag = this.itemDraggable;
        const lifted = this.node.scale.clone().multiplyScalar(drag ? drag.dragScaleMultiplier : 1);
        StrawberryFx.PunchY(this.node, lifted, this.pickPunch, 0.3);
    }

    private OnDropSuccess(target: Node): void {
        const basket = target.getComponent(StrawberryBasket) ?? target.parent?.getComponent(StrawberryBasket);
        const slot = basket?.ReserveSlot();
        if (!basket || !slot) {
            this.itemDraggable?.ReturnToStartWithoutHeart();
            return;
        }

        this.itemDraggable?.DisableComponent();
        this.ItemDone();

        const slotPos = slot.worldPosition;
        const slotScale = slot.worldScale.clone();
        const scaleState = { t: 0 };
        const startScale = this.node.worldScale.clone();
        tween(scaleState)
            .to(this.flyDuration, { t: 1 }, {
                onUpdate: () => {
                    const s = new Vec3();
                    Vec3.lerp(s, startScale, slotScale, scaleState.t);
                    this.node.setWorldScale(s);
                },
            })
            .start();
        StrawberryFx.JumpToWorld(this.node, new Vec3(slotPos.x, slotPos.y, this.node.worldPosition.z), 60, this.flyDuration, () => {
            this.node.active = false;
            basket.FillSlot(slot);
        });
    }
}
