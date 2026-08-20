import { _decorator, Node, Tween, tween, Vec2, Vec3, Enum, EventHandler } from 'cc';
import { GameManager } from '../../Managers/GameManager';
import { Item } from './Item';
import { Ply_EventHandlerComponent } from '../../Core/Base/Ply_EventHandlerComponent';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

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
    public playMoveToTargetFinishSound: boolean = false;

    @property({ type: Enum(FxType) })
    public moveToTargetFinishFxType: FxType = FxType.Complete;

    @property
    public lockInputWhileMoving: boolean = true;

    @property
    public resetParentBeforeMove: boolean = true;

    private originalParent: Node | null = null;

    protected onLoad() {
        this.originalParent = this.node.parent;
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

        Tween.stopAllByTarget(this.node);

        if (this.resetParentBeforeMove && this.originalParent && this.originalParent.isValid) {
            this.node.setParent(this.originalParent);
        }

        if (this.lockInputWhileMoving && GameManager.Ins) {
            GameManager.Ins.isPlaying = false;
        }

        if (this.scaleOnMove) {
            const targetScale = this.node.scale.clone().multiplyScalar(this.endScaleMultiplier);
            tween(this.node).to(this.duration, { scale: targetScale }, { easing: 'quadOut' }).start();
        }

        switch (this.moveType) {
            case MoveType.Smooth:
                tween(this.node)
                    .to(this.duration, { worldPosition: new Vec3(targetPos.x, targetPos.y, this.node.worldPosition.z) }, { easing: 'quadOut' })
                    .call(() => this.FinishAction(target))
                    .start();
                break;

            case MoveType.Jump:
                const jumpStart = this.node.worldPosition.clone();
                const jumpState = { progress: 0 };
                tween(jumpState)
                    .to(this.duration, { progress: 1 }, {
                        easing: 'sineOut',
                        onUpdate: state => {
                            const progress = (state as { progress: number }).progress;
                            const arc = Math.sin(progress * Math.PI * this.numJumps) * this.jumpPower;
                            this.node.setWorldPosition(
                                jumpStart.x + (targetPos.x - jumpStart.x) * progress,
                                jumpStart.y + (targetPos.y - jumpStart.y) * progress + arc,
                                jumpStart.z,
                            );
                        },
                    })
                    .call(() => this.FinishAction(target))
                    .start();

                if (this.rotate360DuringJump) {
                    const rotAngle = this.flipRotate ? -this.angleRotate : this.angleRotate;
                    const curEuler = this.node.eulerAngles;
                    tween(this.node)
                        .to(this.duration, { eulerAngles: new Vec3(curEuler.x, curEuler.y, curEuler.z + rotAngle) }, { easing: 'sineOut' })
                        .start();
                }
                break;

            case MoveType.Instant:
                this.node.setWorldPosition(targetPos.x, targetPos.y, this.node.worldPosition.z);
                this.FinishAction(target);
                break;

            case MoveType.ShakeThenMove:
                const currentWorld = this.node.worldPosition;
                const origPos = new Vec2(currentWorld.x, currentWorld.y);
                tween(this.node)
                    .to(0.1, { worldPosition: new Vec3(origPos.x + 10, origPos.y, this.node.worldPosition.z) })
                    .to(0.1, { worldPosition: new Vec3(origPos.x - 10, origPos.y, this.node.worldPosition.z) })
                    .to(0.1, { worldPosition: new Vec3(origPos.x, origPos.y, this.node.worldPosition.z) })
                    .to(this.duration, { worldPosition: new Vec3(targetPos.x, targetPos.y, this.node.worldPosition.z) }, { easing: 'quadOut' })
                    .call(() => this.FinishAction(target))
                    .start();
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

        if (this.playMoveToTargetFinishSound) {
            Ply_SoundManager.Ins.PlayFx(this.moveToTargetFinishFxType);
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
