import { _decorator, Node, Vec3 } from 'cc';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { InWaterItem } from './InWaterItem';
import { ItemDragChildRotator } from './ItemDragChildRotator';

const { ccclass, property } = _decorator;

/**
 * Chicken changes its resting and drag poses once it is dropped into water.
 * Before water: rest 0°, drag -60°; in water: rest -60°, drag 0°.
 */
@ccclass('Chicken')
export class Chicken extends InWaterItem {
    @property({ type: Ply_Event, tooltip: 'Invoked when this cut chicken is dropped onto Plate Target.' })
    public onDropToPlate: Ply_Event = new Ply_Event();

    private readonly dryEulerAngles = new Vec3(0, 0, 0);
    private readonly waterEulerAngles = new Vec3(0, 0, -60);
    private dragChildRotator: ItemDragChildRotator | null = null;

    protected onLoad(): void {
        super.onLoad();
        this.dragChildRotator = this.getComponent(ItemDragChildRotator);

        if (this.isInWater) {
            this.ApplyWaterRotation();
        } else {
            this.ApplyDryRotation();
        }
    }

    public override OnMoveIntoWaterComplete(): void {
        super.OnMoveIntoWaterComplete();
        this.ApplyWaterRotation();
    }

    /** After cutting, Chicken can only be dropped onto Plate Target. */
    public CutChickenDone(): void {
        if (!this.isCutDone || !this.plateTarget) return;

        this.GetDragChildRotator()?.DisableComponent();

        if (this.itemMoveToTarget) {
            this.itemMoveToTarget.defaultTarget = this.plateTarget;
        }
        const plateItem = this.GetTargetItem(this.plateTarget);
        if (plateItem && this.itemDraggable) {
            this.itemDraggable.targetItemType = plateItem.itemType;
        }
    }

    protected override OnDropSuccessMovement(target: Node | null): void {
        if (this.isCutDone && this.IsPlateTarget(target)) {
            this.node.active = false;
            this.onDropToPlate.invoke();
            return;
        }

        super.OnDropSuccessMovement(target);
    }

    private ApplyDryRotation(): void {
        const rotator = this.GetDragChildRotator();
        if (!rotator) return;

        rotator.dragEulerAngles = this.waterEulerAngles.clone();
        rotator.SetOriginalRotation(this.dryEulerAngles, true);
    }

    private ApplyWaterRotation(): void {
        const rotator = this.GetDragChildRotator();
        if (!rotator) return;

        rotator.dragEulerAngles = this.dryEulerAngles.clone();
        rotator.SetOriginalRotation(this.waterEulerAngles, true);
    }

    private GetDragChildRotator(): ItemDragChildRotator | null {
        this.dragChildRotator ??= this.getComponent(ItemDragChildRotator);
        if (!this.dragChildRotator) {
            console.warn(`[Chicken] Assign ItemDragChildRotator to "${this.node.name}" to use chicken rotation poses.`);
        }
        return this.dragChildRotator;
    }

    private IsPlateTarget(target: Node | null): boolean {
        const plateTarget = this.plateTarget;
        if (!target || !plateTarget || !target.isValid || !plateTarget.isValid) return false;
        return target === plateTarget || target.isChildOf(plateTarget) || plateTarget.isChildOf(target);
    }
}
