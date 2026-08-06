import { _decorator, Node, Vec2, Vec3, Enum, EventHandler } from 'cc';
import { GameManager } from '../Manager/GameManager';
import { Item } from './Item';
import { Ply_EventHandlerComponent } from '../Tool/Ply_EventHandlerComponent';
import { DOTween, Ease } from '../Tool/DOTween';

const { ccclass, property } = _decorator;

export enum MoveType {
    Smooth = 0,
    Jump,
    Instant,
    ShakeThenMove
}
Enum(MoveType);

@ccclass('ItemMoveToTarget')
export class ItemMoveToTarget extends Ply_EventHandlerComponent {

    /** Emitted on this node after a move has completed. The target Node is passed as the event argument. */
    public static readonly EVENT_COMPLETE = 'item-move-to-target-complete';

    @property(Node)
    public defaultTarget: Node = null!;

    @property
    public duration: number = 0.5;

    @property({ type: Enum(MoveType) })
    public moveType: MoveType = MoveType.Smooth;

    @property({ tooltip: 'Độ cao cung nhảy UI theo pixel. Nên dùng khoảng 80-200.' })
    public jumpPower: number = 120;

    @property
    public numJumps: number = 1;

    @property
    public rotate360DuringJump: boolean = false;

    @property
    public flipRotate: boolean = false;

    @property
    public angleRotate: number = -360;

    @property
    public scaleOnMove: boolean = false;

    @property
    public endScaleMultiplier: number = 1.0;

    @property
    public setParentToTarget: boolean = false;

    @property({ type: [EventHandler], tooltip: 'On move complete event handlers' })
    public onComplete: EventHandler[] = [];

    @property
    public lockInputWhileMoving: boolean = true;

    @property
    public resetParentBeforeMove: boolean = true;

    private originalParent: Node | null = null;
    private item: Item | null = null;

    protected onLoad() {
        this.originalParent = this.node.parent;
        this.item = this.getComponent(Item);
    }

    public ExecuteMove() {
        this.ExecuteMove2D(this.defaultTarget);
    }

    /** Kept for existing EventHandler bindings. Movement is now UI 2D. */
    public ExecuteMove3D(customTarget: Node | null) {
        this.ExecuteMove2D(customTarget);
    }

    public ExecuteMove2D(customTarget: Node | null) {
        const target = customTarget || this.defaultTarget;
        if (!target || !target.isValid) {
            console.warn(`[ItemMoveToTarget] Target not found for ${this.node.name}!`);
            return;
        }

        const targetWorld = target.worldPosition;
        const targetPos = new Vec2(targetWorld.x, targetWorld.y);
        const targetItem = target.getComponent(Item);
        if (targetItem && targetItem.knifePos) {
            const knifeWorld = targetItem.knifePos.worldPosition;
            targetPos.set(knifeWorld.x, knifeWorld.y);
        }

        DOTween.Kill(this.node);

        if (this.resetParentBeforeMove && this.originalParent && this.originalParent.isValid) {
            this.node.setParent(this.originalParent);
        }

        if (this.lockInputWhileMoving && GameManager.Ins) {
            GameManager.Ins.isPlaying = false;
        }

        if (this.scaleOnMove) {
            const targetScale = this.node.scale.clone().multiplyScalar(this.endScaleMultiplier);
            DOTween.DOScale(this.node, targetScale, this.duration).SetEase(Ease.OutQuad);
        }

        switch (this.moveType) {
            case MoveType.Smooth:
                DOTween.DOMove(this.node, targetPos, this.duration)
                    .SetEase(Ease.OutQuad)
                    .OnComplete(() => this.FinishAction(target));
                break;

            case MoveType.Jump:
                DOTween.DOJump(this.node, targetPos, this.jumpPower, this.numJumps, this.duration)
                    .SetEase(Ease.OutSine)
                    .OnComplete(() => this.FinishAction(target));

                if (this.rotate360DuringJump) {
                    const rotAngle = this.flipRotate ? -this.angleRotate : this.angleRotate;
                    const curEuler = this.node.eulerAngles;
                    DOTween.DORotate(this.node, new Vec3(curEuler.x, curEuler.y, curEuler.z + rotAngle), this.duration)
                        .SetEase(Ease.OutSine);
                }
                break;

            case MoveType.Instant:
                this.node.setWorldPosition(targetPos.x, targetPos.y, this.node.worldPosition.z);
                this.FinishAction(target);
                break;

            case MoveType.ShakeThenMove:
                const currentWorld = this.node.worldPosition;
                const origPos = new Vec2(currentWorld.x, currentWorld.y);
                DOTween.Sequence()
                    .Append(DOTween.DOMove(this.node, new Vec2(origPos.x + 10, origPos.y), 0.1))
                    .Append(DOTween.DOMove(this.node, new Vec2(origPos.x - 10, origPos.y), 0.1))
                    .Append(DOTween.DOMove(this.node, origPos, 0.1))
                    .Append(DOTween.DOMove(this.node, targetPos, this.duration).SetEase(Ease.OutQuad))
                    .OnComplete(() => this.FinishAction(target));
                break;
        }
    }

    private FinishAction(targetNode?: Node | null) {
        const target = targetNode || this.defaultTarget;

        if (this.setParentToTarget && target && target.isValid) {
            const currentWorldPos = this.node.worldPosition.clone();
            const currentWorldScale = this.node.worldScale.clone();
            const currentWorldRotation = this.node.worldRotation.clone();

            this.node.setParent(target);
            this.node.setWorldPosition(currentWorldPos);
            this.node.setWorldScale(currentWorldScale);
            this.node.setWorldRotation(currentWorldRotation);
        }

        if (this.lockInputWhileMoving && GameManager.Ins) {
            GameManager.Ins.isPlaying = true;
        }

        if (this.item) {
            this.item.PlayMoveToTargetFinishSound();
        }

        EventHandler.emitEvents(this.onComplete);
        this.node.emit(ItemMoveToTarget.EVENT_COMPLETE, target);
    }

    public TeleportToTarget(t: Node) {
        if (t && t.isValid) {
            const target = t.worldPosition;
            this.node.setWorldPosition(target.x, target.y, this.node.worldPosition.z);
        }
    }

    public SetDefaultTarget(t: Node) {
        this.defaultTarget = t;
    }

    public SetEndScale(scale: number) {
        this.endScaleMultiplier = scale;
    }
}
