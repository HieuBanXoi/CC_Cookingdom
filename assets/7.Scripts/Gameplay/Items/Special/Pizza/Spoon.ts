import { _decorator, Enum, Node, tween, Tween, UITransform, Vec2, Vec3 } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { ItemToTarget } from '../../Common/ItemToTarget';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';
import type { Pizza } from './Pizza';

const { ccclass, property } = _decorator;

/**
 * Spoon: must sweep over a sauce Item (type Ketchup) while dragging to pick up
 * sauce; only then it can be dropped on the pizza. Keeps the sauce when it
 * flies back after a missed drop.
 */
@ccclass('Spoon')
export class Spoon extends ItemToTarget {
    @property({ group: { name: 'Sauce', id: 'spoon', displayOrder: 0 }, type: Node, tooltip: 'Sprite sốt trên thìa, bật khi đã lấy sốt.' })
    public sauceSprite: Node | null = null;

    @property({ group: { name: 'Sauce', id: 'spoon' }, type: Enum(ItemType), tooltip: 'Loại Item cần quét trúng để lấy sốt.' })
    public sauceType: ItemType = ItemType.Ketchup;

    @property({ group: { name: 'Sauce', id: 'spoon' }, type: Item, tooltip: 'Hũ sốt (hand tut kéo thìa tới đây trước). Trống = tìm Item đầu tiên có sauceType.' })
    public sauceSource: Item | null = null;

    @property({ group: { name: 'Sauce', id: 'spoon' }, type: Node, tooltip: 'Điểm múc (spoonPos): chỉ khi node này chạm hũ sốt mới múc. Có UITransform thì dùng vùng của nó, không thì dùng điểm vị trí. Trống = cả thìa.' })
    public scoopPoint: Node | null = null;

    @property({ group: { name: 'Sauce', id: 'spoon' }, type: Node, tooltip: 'Node sốt trong hũ bị nhỏ đi mỗi lần múc. Trống = node Sauce Source.' })
    public sauceShrinkNode: Node | null = null;

    @property({ group: { name: 'Sauce', id: 'spoon' }, range: [0, 1, 0.05], slide: true, tooltip: 'Mỗi lần múc, sốt nhỏ đi bao nhiêu so với scale gốc (0.25 = 1/4).' })
    public sauceShrinkPerScoop: number = 0.25;

    @property({ group: { name: 'Sauce', id: 'spoon' }, type: Ply_Event, tooltip: 'Gọi khi thìa lấy được sốt.' })
    public onSauceTaken: Ply_Event = new Ply_Event();

    private pizza: Pizza | null = null;
    private hasSauce = false;
    private scoops = 0;
    private sauceOriginalScale: Vec3 | null = null;

    private readonly onSpoonDropFail = (): void => {
        // Missing the pizza with sauce on is fine: fly back quietly and keep it.
        if (this.hasSauce) this.itemDraggable?.MarkCurrentDropFailHandled();
    };
    private readonly onSpoonReturned = (): void => {
        // ReturnToStartWithoutHeart re-enables the draggable right after this
        // event, so lock on the next frame.
        this.scheduleOnce(() => {
            if (!this.pizza) this.Lock();
        }, 0);
    };

    public get HasSauce(): boolean {
        return this.hasSauce;
    }

    protected onLoad(): void {
        // The pizza decides when the spoon is used.
        this.setTargetOnStart = false;
        super.onLoad();
        this.SetSauce(false);
        this.Lock();
    }

    protected onEnable(): void {
        super.onEnable();
        this.itemDraggable?.onDropFail.removeListener(this.onSpoonDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onSpoonDropFail);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onSpoonReturned);
        this.itemDraggable?.onReturnToStartComplete.addListener(this.onSpoonReturned);
    }

    protected onDisable(): void {
        super.onDisable();
        this.itemDraggable?.onDropFail.removeListener(this.onSpoonDropFail);
        this.itemDraggable?.onReturnToStartComplete.removeListener(this.onSpoonReturned);
    }

    /** Called by Pizza: the spoon is now needed for this pizza. */
    public Prepare(pizza: Pizza, landing: Node): void {
        this.pizza = pizza;
        this.targetItem = pizza;
        this.targetPosition = landing;
        this.isDone = false;
        // Sauce scooped before its turn is kept: go straight to the pizza.
        if (this.hasSauce) {
            this.SetTarget();
        } else {
            this.PointAtSauce();
        }
        this.EnableItemDraggable();
        HandTutManager.Ins?.RegisterTutorialItem(this, false);
    }

    public Lock(): void {
        this.pizza = null;
        // Still draggable when it is not its turn, but it cannot be dropped.
        if (this.itemDraggable) this.itemDraggable.targetItemType = ItemType.None;
        this.EnableItemDraggable();
    }

    protected update(): void {
        // Scooping works any time; dropping on the pizza only when it is the spoon's turn.
        if (this.hasSauce || !this.itemDraggable?.IsDragging) return;
        if (this.IsTouchingSauce()) this.TakeSauce();
    }

    private PointAtSauce(): void {
        if (!this.itemDraggable) return;
        this.itemDraggable.targetItemType = this.sauceType;
        const source = this.FindSauceSource();
        if (source && this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = source.node;
    }

    private FindSauceSource(): Item | null {
        if (this.sauceSource?.isValid) return this.sauceSource;
        const items = this.node.scene?.getComponentsInChildren(Item) ?? [];
        return items.find(item => item.itemType === this.sauceType && item.node.activeInHierarchy) ?? null;
    }

    private IsTouchingSauce(): boolean {
        // Scoop area: the scoop point's rect, or just its position, or the whole spoon.
        const point = this.scoopPoint?.isValid ? this.scoopPoint : null;
        const area = (point ?? this.node).getComponent(UITransform);
        const myRect = area ? area.getBoundingBoxToWorld() : null;
        const tip = point ? new Vec2(point.worldPosition.x, point.worldPosition.y) : null;
        if (!myRect && !tip) return false;

        const sources = this.sauceSource?.isValid ? [this.sauceSource] : (this.node.scene?.getComponentsInChildren(Item) ?? []);
        for (const source of sources) {
            if (source === this || source.itemType !== this.sauceType || !source.node.activeInHierarchy) continue;
            const transform = source.getComponent(UITransform);
            if (!transform) continue;
            const sauceRect = transform.getBoundingBoxToWorld();
            if (myRect ? myRect.intersects(sauceRect) : sauceRect.contains(tip!)) return true;
        }
        return false;
    }

    private TakeSauce(): void {
        this.SetSauce(true);
        // On its turn the pizza becomes the drop target (and the hand tut destination).
        if (this.pizza) this.SetTarget();
        Ply_SoundManager.Ins?.PlayFx(FxType.Cream);
        this.ShrinkSauce();
        this.onSauceTaken.invoke();
    }

    /** Each scoop takes `sauceShrinkPerScoop` of the original sauce size. */
    private ShrinkSauce(): void {
        const sauce = this.sauceShrinkNode ?? this.FindSauceSource()?.node;
        if (!sauce?.isValid || this.sauceShrinkPerScoop <= 0) return;

        this.sauceOriginalScale ??= sauce.scale.clone();
        this.scoops++;
        const ratio = Math.max(0, 1 - this.sauceShrinkPerScoop * this.scoops);
        const scale = this.sauceOriginalScale.clone().multiplyScalar(ratio);
        scale.z = this.sauceOriginalScale.z;

        Tween.stopAllByTarget(sauce);
        tween(sauce).to(0.2, { scale }, { easing: 'quadOut' }).start();
    }

    private SetSauce(hasSauce: boolean): void {
        this.hasSauce = hasSauce;
        if (this.sauceSprite) this.sauceSprite.active = hasSauce;
    }

    public MoveToCurrentTarget(): void {
        // Dropped on the sauce itself: nothing to spread yet.
        if (!this.hasSauce) {
            this.itemDraggable?.ReturnToStart(false, true);
            return;
        }
        super.MoveToCurrentTarget();
    }

    public HandleMoveComplete(): void {
        this.SetSauce(false);
        this.pizza = null;
        super.HandleMoveComplete();
    }
}
