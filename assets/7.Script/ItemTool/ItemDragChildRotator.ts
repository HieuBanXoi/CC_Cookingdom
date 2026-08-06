import { _decorator, Node, Tween, tween, Vec3 } from 'cc';
import { ItemDraggable } from './ItemDraggable';
import { Ply_EventHandlerComponent } from '../Tool/Ply_EventHandlerComponent';

const { ccclass, property } = _decorator;

@ccclass('ItemDragChildRotator')
export class ItemDragChildRotator extends Ply_EventHandlerComponent {

    @property(Node)
    public rotateTarget: Node = null!;

    @property
    public dragEulerAngles: Vec3 = new Vec3(0, 0, 0);

    @property
    public useLocalRotation: boolean = true;

    @property
    public rotateRelative: boolean = false;

    @property
    public rotateDuration: number = 0.15;

    private itemDraggable: ItemDraggable | null = null;
    private originalEulerAngles: Vec3 = new Vec3(0, 0, 0);
    private hasOriginalRotation: boolean = false;

    protected onLoad() {
        this.itemDraggable = this.getComponent(ItemDraggable);
        this.CacheOriginalRotation();
    }

    protected onEnable() {
        if (this.itemDraggable) {
            this.itemDraggable.onBeginDrag.addListener(this.RotateOnDrag.bind(this));
            this.itemDraggable.onDropFail.addListener(this.HandleDropFail.bind(this));
        }
    }

    public RotateOnDrag() {
        this.CacheOriginalRotation();

        const targetEulerAngles = this.rotateRelative
            ? new Vec3(
                this.originalEulerAngles.x + this.dragEulerAngles.x,
                this.originalEulerAngles.y + this.dragEulerAngles.y,
                this.originalEulerAngles.z + this.dragEulerAngles.z
            )
            : this.dragEulerAngles;

        this.RotateTo(targetEulerAngles);
    }

    public RotateBack() {
        if (!this.hasOriginalRotation) return;
        this.RotateTo(this.originalEulerAngles);
    }

    public ResetToOriginalRotation() {
        if (!this.hasOriginalRotation) {
            this.CacheOriginalRotation();
        }

        const target = this.GetRotateTarget();
        Tween.stopAllByTarget(target);
        target.eulerAngles = this.originalEulerAngles;
    }

    private HandleDropFail() {
        if (!this.hasOriginalRotation) return;
        this.RotateBack();
    }

    private CacheOriginalRotation() {
        if (this.hasOriginalRotation) return;
        const target = this.GetRotateTarget();
        Vec3.copy(this.originalEulerAngles, target.eulerAngles);
        this.hasOriginalRotation = true;
    }

    private RotateTo(targetEulerAngles: Vec3) {
        const target = this.GetRotateTarget();
        Tween.stopAllByTarget(target);
        tween(target).to(this.rotateDuration, { eulerAngles: targetEulerAngles }, { easing: 'quadOut' }).start();
    }

    private GetRotateTarget(): Node {
        return this.rotateTarget ? this.rotateTarget : this.node;
    }
}
