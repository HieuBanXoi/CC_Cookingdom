import { _decorator, Enum, Node, Tween, tween, Vec3 } from 'cc';
import { Item } from '../../Common/Item';
import { ItemMoveToTarget } from '../../Common/ItemMoveToTarget';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { NodeFx } from '../../../../Utils/NodeFx';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

export enum PotContentAppear {
    Zoom = 0,
    Fade,
}
Enum(PotContentAppear);

/**
 * Container poured into the pot (water bowl, salt, cornstarch).
 * Drag onto the pot -> fly to pourPoint -> tilt -> drop sprite fades in/out
 * (or sprinkles a few times) while the content appears in the pot -> return
 * home. Single use: the item cannot be dragged again afterwards.
 */
@ccclass('PourItem')
export class PourItem extends Item {
    @property({ type: Node, tooltip: 'Miệng nồi: khi đã nghiêng, tâm của alignAnchor (mặc định dropNode) sẽ nằm đúng điểm này. Trống = ItemMoveToTarget.defaultTarget.' })
    public pourPoint: Node | null = null;

    @property({ type: Node, tooltip: 'Node được căn vào pourPoint khi đã nghiêng. Trống = dropNode (trống nữa thì item bay thẳng tới pourPoint).' })
    public alignAnchor: Node | null = null;

    @property({ tooltip: 'Góc nghiêng khi đổ (độ, dương = ngược chiều kim đồng hồ).' })
    public tiltAngle = 50;

    @property({ min: 0.01, tooltip: 'Thời gian nghiêng.' })
    public tiltDuration = 0.25;

    @property({ type: Enum(FxType), tooltip: 'Âm thanh khi đổ (chế độ rắc: phát mỗi lần rắc).' })
    public pourFx: FxType = FxType.PouringWater;

    @property({ tooltip: 'Chế độ đổ: phát pourFx ngay khi drop hiện.' })
    public playPourFxOnStart = true;

    @property({ tooltip: 'Phát contentFx khi phần trong nồi hiện ra gần xong.' })
    public playContentFx = false;

    @property({ type: Enum(FxType), visible: function (this: PourItem) { return this.playContentFx; } })
    public contentFx: FxType = FxType.Cream;

    @property({ range: [0, 1, 0.05], slide: true, tooltip: 'Phát contentFx khi phần trong nồi hiện được bao nhiêu (0.85 = 85%).', visible: function (this: PourItem) { return this.playContentFx; } })
    public contentFxAt = 0.85;

    // ---------- Tab: Drop ----------
    @property({ group: { name: 'Drop', id: 'pour', displayOrder: 0 }, type: Node, tooltip: 'Sprite dòng đổ (water_drop, salt_drop...).' })
    public dropNode: Node | null = null;

    @property({ group: { name: 'Drop', id: 'pour' }, min: 0.01, tooltip: 'Thời gian drop rõ dần.' })
    public dropShowDuration = 0.3;

    @property({ group: { name: 'Drop', id: 'pour' }, min: 0, tooltip: 'Drop giữ nguyên bao lâu trước khi mờ dần (chế độ đổ).' })
    public dropHoldDuration = 0.5;

    @property({ group: { name: 'Drop', id: 'pour' }, min: 0.01, tooltip: 'Thời gian drop mờ dần.' })
    public dropHideDuration = 0.4;

    // ---------- Tab: Container ----------
    @property({ group: { name: 'Container', id: 'pour', displayOrder: 1 }, type: Node, tooltip: 'Sprite đầy, mờ đi khi đổ xong (water_full). Có thể trống.' })
    public fullNode: Node | null = null;

    @property({ group: { name: 'Container', id: 'pour' }, type: Node, tooltip: 'Sprite rỗng, rõ dần khi đổ xong rồi về (0,0) góc 0 (water_Empty). Có thể trống.' })
    public emptyNode: Node | null = null;

    @property({ group: { name: 'Container', id: 'pour' }, min: 0.01, tooltip: 'Thời gian item/emptyNode về lại.' })
    public returnDuration = 0.3;

    // ---------- Tab: Pot ----------
    @property({ group: { name: 'Pot', id: 'pour', displayOrder: 2 }, type: Node, tooltip: 'Phần hiện trong nồi (water_03, salt_4, cornstarch_3). Ẩn lúc đầu.' })
    public potContent: Node | null = null;

    @property({ group: { name: 'Pot', id: 'pour' }, type: Enum(PotContentAppear), tooltip: 'Zoom: scale từ 0 · Fade: rõ dần.' })
    public contentAppear: PotContentAppear = PotContentAppear.Zoom;

    @property({ group: { name: 'Pot', id: 'pour' }, min: 0.01, tooltip: 'Thời gian phần trong nồi hiện ra.' })
    public contentDuration = 0.5;

    // ---------- Tab: Sprinkle ----------
    @property({ group: { name: 'Sprinkle', id: 'pour', displayOrder: 3 }, min: 0, tooltip: 'Số lần rắc (lắc chéo lên xuống). 0 = đổ một lần như waterbowl.' })
    public sprinkleCount = 0;

    @property({ group: { name: 'Sprinkle', id: 'pour' }, tooltip: 'Lắc dọc theo thân lọ (trục Y local của item, hướng nắp) như rắc thật. Tắt = lắc theo Sprinkle Offset.', visible: function (this: PourItem) { return this.sprinkleCount > 0; } })
    public sprinkleAlongAxis = true;

    @property({ group: { name: 'Sprinkle', id: 'pour' }, min: 0, tooltip: 'Quãng lắc dọc thân lọ (world).', visible: function (this: PourItem) { return this.sprinkleCount > 0 && this.sprinkleAlongAxis; } })
    public sprinkleDistance = 40;

    @property({ group: { name: 'Sprinkle', id: 'pour' }, tooltip: 'Độ lệch khi lắc lên (world).', visible: function (this: PourItem) { return this.sprinkleCount > 0 && !this.sprinkleAlongAxis; } })
    public sprinkleOffset: Vec3 = new Vec3(-30, 40, 0);

    @property({ group: { name: 'Sprinkle', id: 'pour' }, min: 0.01, tooltip: 'Thời gian một nhịp lên hoặc xuống.', visible: function (this: PourItem) { return this.sprinkleCount > 0; } })
    public sprinkleHalfDuration = 0.15;

    @property({ group: { name: 'Sprinkle', id: 'pour' }, type: Node, tooltip: 'Hạt rơi xuống nồi mỗi lần rắc (salt_3).', visible: function (this: PourItem) { return this.sprinkleCount > 0; } })
    public powderNode: Node | null = null;

    @property({ group: { name: 'Sprinkle', id: 'pour' }, tooltip: 'Quãng rơi của hạt (world).', visible: function (this: PourItem) { return this.sprinkleCount > 0; } })
    public powderFallDistance = 180;

    @property({ group: { name: 'Sprinkle', id: 'pour' }, tooltip: 'Hạt trôi ngang bao nhiêu khi rơi (world, âm = sang trái). Dùng để giữ chỗ rơi khi dời lọ.', visible: function (this: PourItem) { return this.sprinkleCount > 0; } })
    public powderDriftX = 0;

    @property({ group: { name: 'Sprinkle', id: 'pour' }, min: 0.01, tooltip: 'Thời gian hạt rơi + mờ dần.', visible: function (this: PourItem) { return this.sprinkleCount > 0; } })
    public powderFallDuration = 0.45;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'pour', displayOrder: 4 }, type: Ply_Event, tooltip: 'Gọi khi đổ xong (truyền node này).' })
    public onPourComplete: Ply_Event = new Ply_Event();

    private isPouring = false;
    private moveTarget: Node | null = null;
    private contentScale = new Vec3(1, 1, 1);
    private powderStartPos = new Vec3();

    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);

    protected onLoad(): void {
        super.onLoad();
        if (this.potContent) {
            Vec3.copy(this.contentScale, this.potContent.scale);
            this.potContent.active = false;
        }
        if (this.powderNode) {
            Vec3.copy(this.powderStartPos, this.powderNode.position);
            this.powderNode.active = false;
        }
        if (this.dropNode) this.dropNode.active = false;
        if (this.emptyNode) this.emptyNode.active = false;
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.OnArrived, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.OnArrived, this);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.OnArrived, this);
    }

    private OnDropSuccess(target: Node): void {
        if (this.isPouring) return;
        this.isPouring = true;
        this.itemDraggable?.DisableComponent();
        const point = this.pourPoint ?? this.itemMoveToTarget?.defaultTarget ?? target;
        this.itemMoveToTarget?.ExecuteMove2D(this.GetMoveTarget(point));
    }

    /** A runtime node placed so the tilted drop lands on the pour point. */
    private GetMoveTarget(point: Node): Node {
        const anchor = this.alignAnchor ?? this.dropNode;
        if (!anchor) return point;
        this.moveTarget ??= new Node(`${this.node.name}_PourTarget`);
        if (this.moveTarget.parent !== point.parent) this.moveTarget.setParent(point.parent);
        this.moveTarget.setWorldPosition(NodeFx.PositionForAnchorAt(this.node, anchor, this.tiltAngle, point.worldPosition));
        return this.moveTarget;
    }

    private OnArrived(): void {
        if (!this.isPouring) return;
        tween(this.node)
            .to(this.tiltDuration, { angle: this.tiltAngle }, { easing: 'quadOut' })
            .call(() => this.sprinkleCount > 0 ? this.Sprinkle() : this.PourLiquid())
            .start();
    }

    private PourLiquid(): void {
        if (this.playPourFxOnStart) Ply_SoundManager.Ins?.PlayFx(this.pourFx);
        NodeFx.FadeIn(this.dropNode, this.dropShowDuration, 0, () => {
            this.scheduleOnce(() => {
                // The content grows in the pot while the stream fades out.
                NodeFx.FadeOut(this.dropNode, this.dropHideDuration);
                this.ShowContent(this.contentDuration);
                this.scheduleOnce(() => this.ShowEmpty(), this.dropHideDuration);
            }, this.dropHoldDuration);
        });
    }

    private ShowContent(duration: number): void {
        if (this.playContentFx) {
            this.scheduleOnce(() => Ply_SoundManager.Ins?.PlayFx(this.contentFx), duration * this.contentFxAt);
        }
        if (this.contentAppear === PotContentAppear.Zoom) {
            NodeFx.ZoomIn(this.potContent, duration, this.contentScale);
        } else {
            NodeFx.FadeIn(this.potContent, duration);
        }
    }

    private ShowEmpty(): void {
        if (!this.emptyNode) {
            this.scheduleOnce(() => this.Finish(), Math.max(0, this.contentDuration - this.dropHideDuration));
            return;
        }
        NodeFx.FadeOut(this.fullNode, this.dropHideDuration);
        NodeFx.FadeIn(this.emptyNode, this.dropHideDuration, 0, () => this.Finish());
    }

    private Sprinkle(): void {
        NodeFx.FadeIn(this.dropNode, this.dropShowDuration);

        const start = this.node.worldPosition.clone();
        const shake = tween(this.node);
        if (this.sprinkleAlongAxis) {
            // Local +Y is the cap side: pull back along the body, then flick towards the cap.
            const rad = this.node.angle * Math.PI / 180;
            const toCap = new Vec3(-Math.sin(rad), Math.cos(rad), 0);
            const back = start.clone().subtract(toCap.clone().multiplyScalar(this.sprinkleDistance));
            const flick = start.clone().add(toCap.clone().multiplyScalar(this.sprinkleDistance * 0.3));
            for (let i = 0; i < this.sprinkleCount; i++) {
                const step = i + 1;
                shake
                    .to(this.sprinkleHalfDuration, { worldPosition: back }, { easing: 'sineOut' })
                    .to(this.sprinkleHalfDuration * 0.6, { worldPosition: flick }, { easing: 'quadIn' })
                    .call(() => this.DropPowder(step))
                    .to(this.sprinkleHalfDuration * 0.4, { worldPosition: start }, { easing: 'sineOut' });
            }
        } else {
            const up = start.clone().add(this.sprinkleOffset);
            for (let i = 0; i < this.sprinkleCount; i++) {
                const step = i + 1;
                shake
                    .to(this.sprinkleHalfDuration, { worldPosition: up }, { easing: 'sineOut' })
                    .to(this.sprinkleHalfDuration, { worldPosition: start }, { easing: 'sineIn' })
                    .call(() => this.DropPowder(step));
            }
        }
        shake
            .delay(this.powderFallDuration)
            .call(() => NodeFx.FadeOut(this.dropNode, this.dropHideDuration, false, () => this.Finish()))
            .start();
    }

    /** One shake: a pinch of powder falls into the pot and the pot content gets a bit stronger. */
    private DropPowder(step: number): void {
        // One pour sound per shake.
        Ply_SoundManager.Ins?.PlayFx(this.pourFx);
        const powder = this.powderNode;
        if (powder?.isValid) {
            Tween.stopAllByTarget(powder);
            powder.setPosition(this.powderStartPos);
            powder.active = true;
            NodeFx.SetOpacity(powder, 255);
            const fallTo = powder.worldPosition.clone();
            fallTo.y -= this.powderFallDistance;
            fallTo.x += this.powderDriftX;
            tween(powder).to(this.powderFallDuration, { worldPosition: fallTo }, { easing: 'quadIn' }).start();
            NodeFx.FadeOut(powder, this.powderFallDuration);
        }

        const content = this.potContent;
        if (!content?.isValid) return;
        const opacity = NodeFx.GetOpacity(content);
        if (!content.active) {
            content.active = true;
            content.setScale(this.contentScale);
            opacity.opacity = 0;
        }
        Tween.stopAllByTarget(opacity);
        tween(opacity).to(this.powderFallDuration, { opacity: 255 * step / this.sprinkleCount }).start();
    }

    private Finish(): void {
        if (this.emptyNode?.isValid) {
            tween(this.emptyNode)
                .to(this.returnDuration, { position: Vec3.ZERO.clone(), angle: 0 }, { easing: 'quadOut' })
                .start();
        }

        // ReturnToStart stops every tween on the node, so rotate back afterwards.
        this.itemDraggable?.ReturnToStart(false, false);
        tween(this.node).to(this.returnDuration, { angle: 0 }, { easing: 'quadOut' }).start();

        if (this.itemDraggable) this.itemDraggable.isDraggable = false;
        this.DisableBreakHeartOnBlockedTap();
        this.ItemDone();
        this.isPouring = false;
        this.onPourComplete.invoke(this.node);
    }
}
