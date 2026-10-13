import { _decorator, Node, Tween, tween, UITransform, Vec3 } from 'cc';
import { HandTutHint, Item } from '../../Common/Item';
import { ItemDragChildRotator } from '../../Common/ItemDragChildRotator';
import { ItemType } from '../../Common/ItemType';
import { Cabbage } from './Cabbage';
import { NodeFx } from '../../../../Utils/NodeFx';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Spoon that scoops sauce by sweeping over the sauce in the bowl while being
 * dragged (it does not stop there), then drops it on a cabbage waiting on the
 * board. ItemMoveToTarget.defaultTarget should be the sauce node.
 */
@ccclass('SauceSpoon')
export class SauceSpoon extends Item {
    @property({ type: Node, tooltip: 'Sauce trong saucebowl. Mỗi lần múc scale nhỏ đi 1/scoopCount.' })
    public bowlSauce: Node | null = null;

    @property({ type: Node, tooltip: 'Sauce trên thìa (bật khi múc được).' })
    public spoonSauce: Node | null = null;

    @property({ type: Node, tooltip: 'Vùng của thìa dùng để quét trúng sauce. Trống = spoonSauce.' })
    public scoopProbe: Node | null = null;

    @property({ min: 1, tooltip: 'Số lần múc được (bằng số cabbage).' })
    public scoopCount = 4;

    @property({ min: 0, tooltip: 'Độ punch Y khi múc trúng.' })
    public scoopPunchStrength = 0.12;

    private scoopsUsed = 0;
    private saucesApplied = 0;
    private hasSauce = false;
    private scoopedThisDrag = false;
    private bowlSauceScale = new Vec3(1, 1, 1);
    private dragChildRotator: ItemDragChildRotator | null = null;

    private readonly onBeginDrag = (): void => { this.scoopedThisDrag = false; };
    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);
    private readonly onDropFail = (): void => this.OnDropFail();

    protected onLoad(): void {
        super.onLoad();
        this.dragChildRotator = this.getComponent(ItemDragChildRotator);
        if (this.bowlSauce) Vec3.copy(this.bowlSauceScale, this.bowlSauce.scale);
        if (this.spoonSauce) this.spoonSauce.active = false;
        this.UpdateTargetType();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.dragChildRotator ??= this.getComponent(ItemDragChildRotator);
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onDropFail);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
    }

    protected update(): void {
        if (this.hasSauce || this.scoopsUsed >= this.scoopCount) return;
        if (!this.itemDraggable?.IsDragging) return;
        if (this.IsOverBowlSauce()) this.Scoop();
    }

    private IsOverBowlSauce(): boolean {
        const probe = (this.scoopProbe ?? this.spoonSauce ?? this.node).getComponent(UITransform);
        const sauce = this.bowlSauce?.activeInHierarchy ? this.bowlSauce.getComponent(UITransform) : null;
        if (!probe || !sauce) return false;
        return probe.getBoundingBoxToWorld().intersects(sauce.getBoundingBoxToWorld());
    }

    private Scoop(): void {
        this.hasSauce = true;
        this.scoopedThisDrag = true;
        this.scoopsUsed++;
        HandTutManager.Ins?.RegisterCorrectAction();
        Ply_SoundManager.Ins?.PlayFx(FxType.Cream);

        if (this.spoonSauce) {
            this.spoonSauce.active = true;
            NodeFx.SetOpacity(this.spoonSauce, 255);
        }

        const sauce = this.bowlSauce;
        if (sauce?.isValid) {
            const remain = Math.max(0, 1 - this.scoopsUsed / this.scoopCount);
            const to = this.bowlSauceScale.clone().multiplyScalar(remain);
            to.z = this.bowlSauceScale.z;
            Tween.stopAllByTarget(sauce);
            tween(sauce)
                .to(0.2, { scale: to }, { easing: 'quadOut' })
                .call(() => { if (remain <= 0) sauce.active = false; })
                .start();
        }

        // Punch the visuals, not the dragged node: ItemDraggable owns its scale.
        for (const child of this.node.children) {
            if (!child.active) continue;
            Tween.stopAllByTarget(child);
            NodeFx.Punch(child, 'y', this.scoopPunchStrength, 0.25);
        }
        this.UpdateTargetType();
    }

    private OnDropSuccess(target: Node): void {
        const cabbage = target.getComponent(Cabbage);
        if (!this.hasSauce || !cabbage?.ApplySauce()) {
            this.ReturnHome();
            return;
        }

        this.hasSauce = false;
        this.saucesApplied++;
        if (this.spoonSauce) this.spoonSauce.active = false;
        this.UpdateTargetType();

        if (this.saucesApplied >= this.scoopCount) this.ItemDone();
        this.ReturnHome();
    }

    private OnDropFail(): void {
        // Scooping is a valid action even when the release lands nowhere.
        if (this.scoopedThisDrag) this.itemDraggable?.MarkCurrentDropFailHandled();
    }

    private ReturnHome(): void {
        this.itemDraggable?.ReturnToStartWithoutHeart();
        this.dragChildRotator?.RotateBack();
        if (this.isDone && this.itemDraggable) this.itemDraggable.isDraggable = false;
    }

    /** Only a sauced spoon can be dropped on a cabbage. */
    private UpdateTargetType(): void {
        if (!this.itemDraggable) return;
        this.itemDraggable.targetItemType = this.hasSauce ? ItemType.CabbageOnBoard : ItemType.None;
    }

    private FindWaitingCabbage(): Cabbage | null {
        const cabbages = this.node.scene?.getComponentsInChildren(Cabbage) ?? [];
        return cabbages.find(c => c.node.activeInHierarchy && c.IsWaitingSauce) ?? null;
    }

    public override CanShowHandTut(): boolean {
        if (!this.itemDraggable?.enabled || !this.itemDraggable.CanDrag()) return false;
        if (!this.hasSauce && this.scoopsUsed >= this.scoopCount) return false;
        return !!this.FindWaitingCabbage();
    }

    /** spoon -> sauce -> cabbage, or straight to the cabbage when the spoon already has sauce. */
    public override GetHandTutHint(): HandTutHint | null {
        if (!this.CanShowHandTut()) return null;
        const cabbage = this.FindWaitingCabbage()!;
        const from = this.node.worldPosition.clone();
        const to = cabbage.node.worldPosition.clone();
        if (this.hasSauce || !this.bowlSauce) return { kind: 'drag', from, to };
        return { kind: 'path', path: [from, this.bowlSauce.worldPosition.clone(), to], durationMultiplier: 1.5 };
    }

    public override GetHandTutRelatedItem(): Item | null {
        return this.FindWaitingCabbage();
    }
}
