import { _decorator, Node, Tween, tween, UITransform, Vec3 } from 'cc';
import { HandTutHint, Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { InputManager } from '../../../../Managers/InputManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';
import type { Pizza } from './Pizza';

const { ccclass, property } = _decorator;

/**
 * Rolling pin: the player drags it back and forth over the pizza. Every
 * `strokeDistance` of movement over the dough grows Base on X, then Y, then X...
 * until it reaches Pizza.rollTargetScale; the pin then flies back on its own.
 * Drops never "succeed": the pin always returns to its start.
 */
@ccclass('RollingPin')
export class RollingPin extends Item {
    @property({ group: { name: 'Roll', id: 'pin', displayOrder: 0 }, min: 1, tooltip: 'Quãng đường kéo trên bột (px) cho 1 lần lăn.' })
    public strokeDistance: number = 150;

    @property({ group: { name: 'Roll', id: 'pin' }, min: 2, step: 1, tooltip: 'Số lần lăn để Base đạt scale cuối (lẻ: X, chẵn: Y).' })
    public strokeCount: number = 10;

    @property({ group: { name: 'Roll', id: 'pin' }, min: 0, tooltip: 'Thời gian tween scale mỗi lần lăn (giây).' })
    public strokeTweenDuration: number = 0.3;

    @property({ group: { name: 'Roll', id: 'pin' }, min: 0, tooltip: 'Khoảng nghỉ tối thiểu giữa 2 lần phát tiếng Rolling (giây).' })
    public rollSoundDelay: number = 0.35;

    @property({ group: { name: 'Roll', id: 'pin' }, type: Node, tooltip: 'Vùng kiểm tra chạm bột. Trống = node cây lăn.' })
    public rollArea: Node | null = null;

    @property({ group: { name: 'Hand Tut', id: 'pin', displayOrder: 1 }, min: 0, tooltip: 'Nửa độ rộng đường hand tut vẽ qua lại trên pizza (px).' })
    public hintStrokeWidth: number = 150;

    @property({ group: { name: 'Hand Tut', id: 'pin' }, min: 1, step: 1, tooltip: 'Số lần hand tut vẽ qua lại.' })
    public hintStrokes: number = 2;

    @property({ group: { name: 'Hand Tut', id: 'pin' }, min: 0.1, tooltip: 'Tổng thời gian hand tut = Move Duration của HandTutManager × giá trị này. Lớn hơn = chậm hơn.' })
    public hintDurationMultiplier: number = 3;

    @property({ group: { name: 'Events', id: 'pin', displayOrder: 2 }, type: Ply_Event, tooltip: 'Mỗi lần lăn (truyền số lần đã lăn).' })
    public onStroke: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'pin' }, type: Ply_Event, tooltip: 'Lăn xong.' })
    public onRollComplete: Ply_Event = new Ply_Event();

    private pizza: Pizza | null = null;
    private startScale = new Vec3();
    private strokesDone = 0;
    private distanceOnDough = 0;
    private touchedDough = false;
    private finished = true;
    private readonly lastPosition = new Vec3();
    private lastRollSoundTime = -Infinity;

    private readonly onBeginDrag = (): void => this.HandleBeginDrag();
    private readonly onDropFail = (): void => this.HandleDropFail();

    protected onLoad(): void {
        super.onLoad();
        this.Lock();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onDropFail);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
    }

    /** Called by Pizza when the dough is ready to be rolled. */
    public BeginRolling(pizza: Pizza): void {
        this.pizza = pizza;
        Vec3.copy(this.startScale, pizza.base!.scale);
        this.strokesDone = 0;
        this.distanceOnDough = 0;
        this.finished = false;
        this.isDone = false;
        if (this.itemDraggable) {
            this.itemDraggable.targetItemType = ItemType.None;
            // Every release sends the pin home, whatever the Inspector says.
            this.itemDraggable.returnToStartOnDragFailed = true;
        }
        this.EnableItemDraggable();
        HandTutManager.Ins?.RegisterTutorialItem(this, false);
    }

    public Lock(): void {
        this.finished = true;
        // Still draggable when it is not its turn: it just flies back.
        if (this.itemDraggable) this.itemDraggable.targetItemType = ItemType.None;
        this.EnableItemDraggable();
    }

    protected update(): void {
        if (this.finished || !this.pizza?.base || !this.itemDraggable?.IsDragging) return;

        const position = this.node.worldPosition;
        const moved = Vec3.distance(position, this.lastPosition);
        Vec3.copy(this.lastPosition, position);
        if (!this.IsOverDough()) return;

        this.touchedDough = true;
        this.distanceOnDough += moved;
        while (!this.finished && this.distanceOnDough >= this.strokeDistance) {
            this.distanceOnDough -= this.strokeDistance;
            this.DoStroke();
        }
    }

    private HandleBeginDrag(): void {
        Vec3.copy(this.lastPosition, this.node.worldPosition);
        this.touchedDough = false;
    }

    private HandleDropFail(): void {
        // Rolling over the dough is the valid action: no break heart for it.
        // Outside its turn (no pizza) a drop is a normal mistake.
        if (this.pizza && (this.touchedDough || this.finished)) this.itemDraggable?.MarkCurrentDropFailHandled();
    }

    private IsOverDough(): boolean {
        const area = (this.rollArea ?? this.node).getComponent(UITransform);
        const dough = this.pizza?.base?.getComponent(UITransform);
        if (!area || !dough) return false;
        return area.getBoundingBoxToWorld().intersects(dough.getBoundingBoxToWorld());
    }

    private DoStroke(): void {
        const base = this.pizza!.base!;
        this.strokesDone = Math.min(this.strokesDone + 1, this.strokeCount);

        // Odd strokes grow X, even strokes grow Y.
        const xStrokes = Math.ceil(this.strokeCount / 2);
        const yStrokes = Math.floor(this.strokeCount / 2);
        const xRatio = Math.min(1, Math.ceil(this.strokesDone / 2) / xStrokes);
        const yRatio = yStrokes > 0 ? Math.min(1, Math.floor(this.strokesDone / 2) / yStrokes) : 1;
        const target = this.pizza!.rollTargetScale;
        const scale = new Vec3(
            this.Lerp(this.startScale.x, target * Math.sign(this.startScale.x || 1), xRatio),
            this.Lerp(this.startScale.y, target * Math.sign(this.startScale.y || 1), yRatio),
            this.startScale.z,
        );

        Tween.stopAllByTarget(base);
        tween(base).to(this.strokeTweenDuration, { scale }, { easing: 'quadOut' }).start();
        this.PlayRollSound();
        this.onStroke.invoke(this.strokesDone);

        if (this.strokesDone >= this.strokeCount) this.Finish();
    }

    private Finish(): void {
        this.finished = true;
        this.ItemDone();

        // Release the pin: the drop "fails" (no target type) and it flies back quietly.
        InputManager.Ins?.EndInteraction();
        this.Lock();

        const pizza = this.pizza;
        this.pizza = null;
        HandTutManager.Ins?.RegisterCorrectAction();
        this.onRollComplete.invoke();
        this.scheduleOnce(() => pizza?.OnRollDone(), this.strokeTweenDuration);
    }

    /** Fast strokes would stack the sound: keep at least rollSoundDelay between two plays. */
    private PlayRollSound(): void {
        const now = performance.now() / 1000;
        if (now - this.lastRollSoundTime < this.rollSoundDelay) return;
        this.lastRollSoundTime = now;
        Ply_SoundManager.Ins?.PlayFx(FxType.Rolling);
    }

    private Lerp(from: number, to: number, ratio: number): number {
        return from + (to - from) * ratio;
    }

    /** Back-and-forth path over the dough. */
    public GetHandTutHint(): HandTutHint | null {
        const base = this.pizza?.base;
        if (this.finished || !base?.isValid || !this.itemDraggable?.enabled) return null;

        const center = base.worldPosition;
        const left = new Vec3(center.x - this.hintStrokeWidth, center.y, center.z);
        const right = new Vec3(center.x + this.hintStrokeWidth, center.y, center.z);
        const path = [this.node.worldPosition.clone(), left];
        for (let i = 0; i < this.hintStrokes; i++) path.push(right.clone(), left.clone());
        return { kind: 'path', path, durationMultiplier: this.hintDurationMultiplier };
    }

    public GetHandTutRelatedItem(): Item | null {
        return this.pizza;
    }
}
