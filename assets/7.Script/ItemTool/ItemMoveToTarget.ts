import { _decorator, Component, Node, Vec3, tween, Tween, Enum } from 'cc';
import { Ply_Event } from '../Tool/Ply_Event';
import { GameManager } from '../Manager/GameManager';
import { Item } from './Item';

const { ccclass, property } = _decorator;

export enum MoveType {
    Smooth = 0,
    Jump,
    Instant,
    ShakeThenMove
}
Enum(MoveType);

@ccclass('ItemMoveToTarget')
export class ItemMoveToTarget extends Component {

    @property(Node)
    public defaultTarget: Node = null!;

    @property
    public duration: number = 0.5;

    @property({ type: Enum(MoveType) })
    public moveType: MoveType = MoveType.Smooth;

    @property
    public jumpPower: number = 2.0;

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

    @property({ type: Ply_Event })
    public onComplete: Ply_Event = new Ply_Event();

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
        this.ExecuteMove3D(this.defaultTarget);
    }

    public ExecuteMove3D(customTarget: Node | null) {
        const target = customTarget || this.defaultTarget;
        if (!target || !target.isValid) {
            console.warn(`[ItemMoveToTarget] Target not found for ${this.node.name}!`);
            return;
        }

        const targetPos = target.worldPosition.clone();
        const targetItem = target.getComponent(Item);
        if (targetItem && targetItem.knifePos) {
            targetPos.set(targetItem.knifePos.worldPosition);
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
            tween(this.node)
                .to(this.duration, { scale: targetScale }, { easing: 'quadOut' })
                .start();
        }

        switch (this.moveType) {
            case MoveType.Smooth:
                tween(this.node)
                    .to(this.duration, { worldPosition: targetPos }, { easing: 'quadOut' })
                    .call(() => this.FinishAction())
                    .start();
                break;

            case MoveType.Jump:
                tween(this.node)
                    .to(this.duration, { worldPosition: targetPos }, { easing: 'sineOut' })
                    .call(() => this.FinishAction())
                    .start();

                if (this.rotate360DuringJump) {
                    const rotAngle = this.flipRotate ? -this.angleRotate : this.angleRotate;
                    tween(this.node)
                        .by(this.duration, { eulerAngles: new Vec3(0, 0, rotAngle) })
                        .start();
                }
                break;

            case MoveType.Instant:
                this.node.setWorldPosition(targetPos);
                this.FinishAction();
                break;

            case MoveType.ShakeThenMove:
                const origPos = this.node.worldPosition.clone();
                tween(this.node)
                    .to(0.1, { worldPosition: new Vec3(origPos.x + 10, origPos.y, origPos.z) })
                    .to(0.1, { worldPosition: new Vec3(origPos.x - 10, origPos.y, origPos.z) })
                    .to(0.1, { worldPosition: origPos })
                    .to(this.duration, { worldPosition: targetPos }, { easing: 'quadOut' })
                    .call(() => this.FinishAction())
                    .start();
                break;
        }
    }

    private FinishAction() {
        if (this.setParentToTarget && this.defaultTarget && this.defaultTarget.isValid) {
            this.node.setParent(this.defaultTarget);
        }

        if (this.lockInputWhileMoving && GameManager.Ins) {
            GameManager.Ins.isPlaying = true;
        }

        if (this.item) {
            this.item.PlayMoveToTargetFinishSound();
        }

        this.onComplete.invoke();
    }

    public TeleportToTarget(t: Node) {
        if (t && t.isValid) {
            this.node.setWorldPosition(t.worldPosition);
        }
    }

    public SetDefaultTarget(t: Node) {
        this.defaultTarget = t;
    }

    public SetEndScale(scale: number) {
        this.endScaleMultiplier = scale;
    }
}
