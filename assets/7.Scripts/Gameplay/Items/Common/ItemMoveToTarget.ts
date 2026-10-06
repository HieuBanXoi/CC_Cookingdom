import { _decorator, Node, Tween, tween, Vec2, Vec3, Enum } from 'cc';
import { GameManager } from '../../../Managers/GameManager';
import { Item } from './Item';
import { Ply_EventHandlerComponent } from '../../../Core/Base/Ply_EventHandlerComponent';
import { Ply_Event } from '../../../Core/Base/Ply_Event';
import { FxType, Ply_SoundManager } from '../../../Managers/Ply_SoundManager';

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

    // ---------- Chung (luôn hiện) ----------
    @property({ type: Node, tooltip: 'Đích mặc định (HandTut cũng kéo tới đây). Nếu Item đích có knifePos thì bay tới knifePos.' })
    public defaultTarget: Node = null!;

    @property({ type: Enum(MoveType), tooltip: 'Smooth: trượt mượt · Jump: nhảy theo cung · Instant: dịch ngay · ShakeThenMove: lắc rồi trượt.' })
    public moveType: MoveType = MoveType.Smooth;

    @property({ min: 0, tooltip: 'Thời gian di chuyển (giây).', visible: function (this: ItemMoveToTarget) { return this.moveType !== MoveType.Instant || this.scaleOnMove; } })
    public duration: number = 0.5;

    // ---------- Tab: Move ----------
    @property({ group: { name: 'Move', id: 'mtt', displayOrder: 0 }, tooltip: 'Độ cao cung nhảy UI theo pixel. Nên dùng khoảng 80-200.', visible: function (this: ItemMoveToTarget) { return this.moveType === MoveType.Jump; } })
    public jumpPower: number = 120;

    @property({ group: { name: 'Move', id: 'mtt' }, min: 1, tooltip: 'Số lần nảy trên đường bay.', visible: function (this: ItemMoveToTarget) { return this.moveType === MoveType.Jump; } })
    public numJumps: number = 1;

    @property({ group: { name: 'Move', id: 'mtt' }, tooltip: 'Xoay item trong lúc nhảy.', visible: function (this: ItemMoveToTarget) { return this.moveType === MoveType.Jump; } })
    public rotate360DuringJump: boolean = false;

    @property({ group: { name: 'Move', id: 'mtt' }, tooltip: 'Đảo chiều xoay.', visible: function (this: ItemMoveToTarget) { return this.moveType === MoveType.Jump && this.rotate360DuringJump; } })
    public flipRotate: boolean = false;

    @property({ group: { name: 'Move', id: 'mtt' }, tooltip: 'Góc xoay cộng thêm trong lúc nhảy (độ).', visible: function (this: ItemMoveToTarget) { return this.moveType === MoveType.Jump && this.rotate360DuringJump; } })
    public angleRotate: number = -360;

    @property({ group: { name: 'Move', id: 'mtt' }, tooltip: 'Scale item trong lúc di chuyển.' })
    public scaleOnMove: boolean = false;

    @property({ group: { name: 'Move', id: 'mtt' }, min: 0, tooltip: 'Scale cuối = scale hiện tại × giá trị này.', visible: function (this: ItemMoveToTarget) { return this.scaleOnMove; } })
    public endScaleMultiplier: number = 1.0;

    @property({ group: { name: 'Move', id: 'mtt' }, tooltip: 'Khoá input (GameManager.isPlaying = false) trong lúc di chuyển.' })
    public lockInputWhileMoving: boolean = true;

    // ---------- Tab: Punch ----------
    @property({ group: { name: 'Punch', id: 'mtt', displayOrder: 1 }, tooltip: 'Nảy scale (punch) khi tới target.' })
    public punchOnComplete: boolean = false;

    @property({ group: { name: 'Punch', id: 'mtt' }, min: 0, step: 0.05, tooltip: 'Nhịp 1: X dài ra và Y co lại bao nhiêu (0.15 = 15%).', visible: function (this: ItemMoveToTarget) { return this.punchOnComplete; } })
    public punchStrength: number = 0.15;

    @property({ group: { name: 'Punch', id: 'mtt' }, min: 0.01, tooltip: 'Tổng thời gian punch (giây).', visible: function (this: ItemMoveToTarget) { return this.punchOnComplete; } })
    public punchDuration: number = 0.3;

    @property({ group: { name: 'Punch', id: 'mtt' }, range: [0, 1, 0.05], slide: true, tooltip: 'Nhịp 2: Y dãn ra và X co lại, tính theo Punch Strength (1 = bằng nhịp 1).', visible: function (this: ItemMoveToTarget) { return this.punchOnComplete; } })
    public punchElasticity: number = 0.4;

    @property({ group: { name: 'Punch', id: 'mtt' }, range: [0, 1, 0.05], slide: true, tooltip: 'Bắt đầu punch khi đã đi được bao nhiêu quãng đường (0.9 = 90%). Instant thì punch lúc tới nơi.', visible: function (this: ItemMoveToTarget) { return this.punchOnComplete; } })
    public punchStartProgress: number = 0.9;

    @property({ group: { name: 'Punch', id: 'mtt' }, tooltip: 'Bật: chờ punch xong mới mở input và bắn sự kiện complete. Tắt: punch chạy song song với sự kiện complete.', visible: function (this: ItemMoveToTarget) { return this.punchOnComplete; } })
    public waitPunchBeforeComplete: boolean = false;

    // ---------- Tab: Finish ----------
    @property({ group: { name: 'Finish', id: 'mtt', displayOrder: 2 }, tooltip: 'Tới nơi thì set parent của item thành target.' })
    public setParentToTarget: boolean = true;

    @property({ group: { name: 'Finish', id: 'mtt' }, tooltip: 'Restore the original parent once the move finishes. While moving the item stays where it is (e.g. under InputManager.draggingNode) so it renders above the drop target.', visible: function (this: ItemMoveToTarget) { return !this.setParentToTarget; } })
    public resetParentBeforeMove: boolean = true;

    @property({ group: { name: 'Finish', id: 'mtt' }, tooltip: 'Tắt component này sau khi move tới target xong (HandTut sẽ không chọn item này nữa).' })
    public disableOnComplete: boolean = false;

    @property({ group: { name: 'Finish', id: 'mtt' }, tooltip: 'Phát âm thanh khi tới target.' })
    public playMoveToTargetFinishSound: boolean = false;

    @property({ group: { name: 'Finish', id: 'mtt' }, type: Enum(FxType), visible: function (this: ItemMoveToTarget) { return this.playMoveToTargetFinishSound; } })
    public moveToTargetFinishFxType: FxType = FxType.Complete;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'mtt', displayOrder: 3 }, type: Ply_Event, tooltip: 'Gọi khi move tới target xong (truyền target Node). Trong code dùng onComplete.addListener() hoặc node.on(EVENT_COMPLETE).' })
    public onComplete: Ply_Event = new Ply_Event();

    private originalParent: Node | null = null;
    private readonly punchState = { progress: 0 };
    private readonly scaleState = { t: 0 };
    /** World scale the punch squashes around and returns to. */
    private punchBaseScale: Vec3 | null = null;
    private punchPending = false;
    private punching = false;
    private punchWaiters: Array<() => void> = [];

    /** True from the moment a punch is scheduled until it has finished. */
    public get IsPunching(): boolean {
        return this.punchPending || this.punching;
    }

    /** Runs `callback` once the current punch ends, or right away when there is none. */
    public WhenPunchDone(callback: () => void): void {
        if (this.IsPunching) this.punchWaiters.push(callback);
        else callback();
    }

    protected onLoad() {
        this.originalParent = this.node.parent;
        this.EnsureCompleteEvent();
    }

    /** Old scenes/prefabs serialized onComplete as an EventHandler[]; replace that with a Ply_Event. */
    private EnsureCompleteEvent(): Ply_Event {
        if (!(this.onComplete instanceof Ply_Event)) {
            this.onComplete = new Ply_Event();
        }
        return this.onComplete;
    }

    /** Re-caches the parent restored after a move. Call after intentionally reparenting the item. */
    public RefreshOriginalParent(): void {
        this.originalParent = this.node.parent;
    }

    public ExecuteMove() {
        this.ExecuteMove2D(this.defaultTarget);
    }

    /** Kept for existing Inspector bindings. Movement is now UI 2D. */
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
        Tween.stopAllByTarget(this.scaleState);
        this.StopPunch();

        if (this.lockInputWhileMoving && GameManager.Ins) {
            GameManager.Ins.isPlaying = false;
        }

        // World scale the item ends the move with: the punch squashes around it.
        const endWorldScale = this.node.worldScale.clone();
        if (this.scaleOnMove) {
            endWorldScale.multiplyScalar(this.endScaleMultiplier);
            endWorldScale.z = this.node.worldScale.z;
            const from = this.node.scale.clone();
            const to = from.clone().multiplyScalar(this.endScaleMultiplier);
            to.z = from.z;
            const current = new Vec3();
            this.scaleState.t = 0;
            tween(this.scaleState)
                .to(this.duration, { t: 1 }, {
                    easing: 'quadOut',
                    onUpdate: () => this.node.setScale(Vec3.lerp(current, from, to, this.scaleState.t)),
                })
                .start();
        }

        if (this.punchOnComplete && this.moveType !== MoveType.Instant) {
            const lead = this.moveType === MoveType.ShakeThenMove ? 0.3 : 0;
            this.punchPending = true;
            tween(this.punchState)
                .delay(lead + this.duration * this.punchStartProgress)
                .call(() => this.StartPunch(endWorldScale))
                .start();
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

        // Reparent only after arriving so the item is not drawn behind the
        // target (e.g. the cutting board) while it is still travelling.
        if (this.setParentToTarget && target && target.isValid) {
            this.SetParentPreservingWorldTransform(target);
        } else if (this.resetParentBeforeMove && this.originalParent && this.originalParent.isValid) {
            this.SetParentPreservingWorldTransform(this.originalParent);
        }

        if (this.playMoveToTargetFinishSound) {
            Ply_SoundManager.Ins.PlayFx(this.moveToTargetFinishFxType);
        }

        // Instant moves (or a punch scheduled past the end) punch on arrival.
        if (this.punchOnComplete && !this.IsPunching) this.StartPunch(this.node.worldScale.clone());

        if (this.punchOnComplete && this.waitPunchBeforeComplete) {
            this.WhenPunchDone(() => this.CompleteMove(target));
        } else {
            this.CompleteMove(target);
        }
    }

    private CompleteMove(target: Node | null) {
        if (this.lockInputWhileMoving && GameManager.Ins) {
            GameManager.Ins.isPlaying = true;
        }

        // Disable before emitting so complete listeners can re-enable it if needed.
        if (this.disableOnComplete) {
            this.enabled = false;
        }

        // Code listeners (Knife, Spatula, ...) run before Inspector handlers so an
        // Inspector "Deactivate"/"DisableComponent" cannot unsubscribe them first.
        this.node.emit(ItemMoveToTarget.EVENT_COMPLETE, target);
        this.EnsureCompleteEvent().invoke(target);
    }

    /** Bindable from a Ply_Event: plays the punch now (works even if punchOnComplete is off). */
    public PlayPunch(onFinish?: () => void): void {
        this.StopPunch();
        // Ply_Event/EventHandler bindings pass customEventData here, not a callback.
        if (typeof onFinish === 'function') this.punchWaiters.push(onFinish);
        this.StartPunch(this.node.worldScale.clone());
    }

    /**
     * Squash & stretch around `baseWorldScale`: X stretches while Y squeezes,
     * then Y stretches while X squeezes, then back. Uses world scale so the
     * reparent on arrival does not make the scale jump mid-punch.
     */
    private StartPunch(baseWorldScale: Vec3): void {
        // A scale-on-move tween still running would fight the punch: it already
        // aims at the base scale, so just stop it.
        Tween.stopAllByTarget(this.scaleState);
        Tween.stopAllByTarget(this.punchState);
        this.punchPending = false;
        this.punching = true;

        const base = baseWorldScale.clone();
        this.punchBaseScale = base;
        const s1 = this.punchStrength;
        const s2 = this.punchStrength * this.punchElasticity;
        const state = this.punchState;
        state.progress = 0;

        // progress 0 -> 1 -> 2 -> 3: base -> (X+s1, Y-s1) -> (X-s2, Y+s2) -> base.
        const keys: Array<[number, number]> = [[0, 0], [s1, -s1], [-s2, s2], [0, 0]];
        const apply = () => {
            const p = Math.min(3, Math.max(0, state.progress));
            const i = Math.min(2, Math.floor(p));
            const t = p - i;
            const ox = keys[i][0] + (keys[i + 1][0] - keys[i][0]) * t;
            const oy = keys[i][1] + (keys[i + 1][1] - keys[i][1]) * t;
            this.node.setWorldScale(base.x * (1 + ox), base.y * (1 + oy), base.z);
        };
        const d = this.punchDuration;

        tween(state)
            .to(d * 0.35, { progress: 1 }, { easing: 'quadOut', onUpdate: apply })
            .to(d * 0.35, { progress: 2 }, { easing: 'sineInOut', onUpdate: apply })
            .to(d * 0.3, { progress: 3 }, { easing: 'quadOut', onUpdate: apply })
            .call(() => this.EndPunch())
            .start();
    }

    private EndPunch(): void {
        if (this.punchBaseScale) this.node.setWorldScale(this.punchBaseScale);
        this.punchBaseScale = null;
        this.punching = false;
        const waiters = this.punchWaiters;
        this.punchWaiters = [];
        for (const waiter of waiters) waiter();
    }

    /** Stops a scheduled or running punch and restores its base scale. Pending waiters are dropped. */
    public StopPunch(): void {
        Tween.stopAllByTarget(this.punchState);
        if (this.punchBaseScale) this.node.setWorldScale(this.punchBaseScale);
        this.punchBaseScale = null;
        this.punchPending = false;
        this.punching = false;
        this.punchWaiters = [];
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

    /** Bindable from a Ply_Event: spin the item during a Jump move. */
    public EnableRotate360DuringJump(): void {
        this.rotate360DuringJump = true;
    }

    /** Bindable from a Ply_Event: no spin during a Jump move. */
    public DisableRotate360DuringJump(): void {
        this.rotate360DuringJump = false;
    }

    public SetRotate360DuringJump(enabled: boolean): void {
        this.rotate360DuringJump = enabled;
    }

    /** Reparent without changing the item's visible position, rotation, or scale. */
    private SetParentPreservingWorldTransform(parent: Node): void {
        if (this.node.parent === parent) return;

        const worldPosition = this.node.worldPosition.clone();
        const worldScale = this.node.worldScale.clone();
        const worldRotation = this.node.worldRotation.clone();

        this.node.setParent(parent);
        this.node.setWorldPosition(worldPosition);
        this.node.setWorldScale(worldScale);
        this.node.setWorldRotation(worldRotation);
    }
}
