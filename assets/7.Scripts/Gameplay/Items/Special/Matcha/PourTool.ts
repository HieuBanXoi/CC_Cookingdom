import { _decorator, Enum, Node, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { HandTutHint, Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { GameManager } from '../../../../Managers/GameManager';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';
import { PlayFadeOut } from '../../../Effects/FallIn';

const { ccclass, property } = _decorator;

/**
 * A tool that pours into a target (matcha spoon, water pot). Off-turn it can
 * be dragged but not dropped. When Ready(), an optional scoop is needed first
 * (scoopPoint touching scoopSource while dragging), then a drop on the target
 * flies it above the target, tilts it, raises onPour, and flies it back home
 * (still draggable, no drop target).
 */
@ccclass('PourTool')
export class PourTool extends Item {
    // ---------- Tab: Scoop ----------
    @property({ group: { name: 'Scoop', id: 'pour', displayOrder: 0 }, tooltip: 'Phải múc (scoopPoint chạm scoopSource khi đang kéo) trước khi thả được vào đích.' })
    public needScoop: boolean = false;

    @property({ group: { name: 'Scoop', id: 'pour' }, type: Node, tooltip: 'Điểm múc trên dụng cụ (MatchaPos). Trống = node này.', visible: function (this: PourTool) { return this.needScoop; } })
    public scoopPoint: Node | null = null;

    @property({ group: { name: 'Scoop', id: 'pour' }, type: Node, tooltip: 'Vùng múc (bột trong hộp). Điểm múc nằm trong khung UITransform của node này thì múc được.', visible: function (this: PourTool) { return this.needScoop; } })
    public scoopSource: Node | null = null;

    @property({ group: { name: 'Scoop', id: 'pour' }, type: Enum(FxType), tooltip: 'Âm thanh khi múc được.', visible: function (this: PourTool) { return this.needScoop; } })
    public scoopFx: FxType = FxType.Cream;

    @property({ group: { name: 'Scoop', id: 'pour' }, type: Node, tooltip: 'Phần chứa trên dụng cụ (matcha trên thìa / trong bát): khi cần múc thì ẩn lúc đầu và bật khi múc; không cần múc thì có sẵn. Mờ đi khi đổ.' })
    public content: Node | null = null;

    // ---------- Tab: Pour ----------
    @property({ group: { name: 'Pour', id: 'pour', displayOrder: 1 }, type: Node, tooltip: 'Điểm rót trên dụng cụ (miệng thìa/vòi). Khi nghiêng xong điểm này nằm ở đích + Pour Offset. Trống = tâm dụng cụ.' })
    public pourPoint: Node | null = null;

    @property({ group: { name: 'Pour', id: 'pour' }, tooltip: 'Vị trí điểm rót so với đích (world, px).' })
    public pourOffset: Vec3 = new Vec3(0, 120, 0);

    @property({ group: { name: 'Pour', id: 'pour' }, tooltip: 'Góc nghiêng thêm khi rót (độ, dương = ngược kim đồng hồ / nghiêng sang trái).' })
    public pourAngle: number = 40;

    @property({ group: { name: 'Pour', id: 'pour' }, min: 0.01, tooltip: 'Thời gian bay tới chỗ rót (giây).' })
    public pourMoveDuration: number = 0.4;

    @property({ group: { name: 'Pour', id: 'pour' }, min: 0.01, tooltip: 'Thời gian nghiêng/dựng lại (giây).' })
    public pourTiltDuration: number = 0.3;

    @property({ group: { name: 'Pour', id: 'pour' }, min: 0.01, tooltip: 'Thời gian giữ nghiêng để rót (giây).' })
    public pourHoldDuration: number = 0.8;

    @property({ group: { name: 'Pour', id: 'pour' }, type: Node, tooltip: 'Dòng chảy (WATER3): bật trong lúc rót.' })
    public stream: Node | null = null;

    @property({ group: { name: 'Pour', id: 'pour' }, type: Enum(FxType), tooltip: 'Âm thanh khi rót.' })
    public pourFx: FxType = FxType.PouringWater;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'pour', displayOrder: 2 }, type: Ply_Event })
    public onScooped: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'pour' }, type: Ply_Event, tooltip: 'Bắt đầu rót (đã nghiêng xong). Truyền thời gian rót (giây).' })
    public onPour: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'pour' }, type: Ply_Event, tooltip: 'Rót xong, bắt đầu bay về.' })
    public onPoured: Ply_Event = new Ply_Event();

    private target: Item | null = null;
    private ready = false;
    private hasContent = false;
    private readonly onDropped = (): void => this.OnDropped();

    public get IsReady(): boolean {
        return this.ready;
    }

    protected onLoad(): void {
        super.onLoad();
        // A scooping tool starts empty; otherwise it is already full.
        if (this.content && this.needScoop) this.content.active = false;
        this.hasContent = !this.needScoop && !!this.content?.active;
        if (this.stream) this.stream.active = false;
        this.Lock();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropped);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropped);
    }

    protected onDisable(): void {
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropped);
    }

    /** Its turn: pour into `target` (after scooping when needScoop). */
    public Ready(target: Item): void {
        this.target = target;
        this.ready = true;
        this.isDone = false;
        if (this.itemMoveToTarget) this.itemMoveToTarget.defaultTarget = target.node;
        if (!this.needScoop || this.hasContent) this.AllowDrop();
        this.EnableItemDraggable();
        HandTutManager.Ins?.RegisterTutorialItem(this, false);
    }

    /** Not its turn: still draggable, but every drop fails. */
    public Lock(): void {
        if (this.itemDraggable) this.itemDraggable.targetItemType = ItemType.None;
        this.EnableItemDraggable();
    }

    protected update(): void {
        if (!this.ready || !this.needScoop || this.hasContent) return;
        if (!this.itemDraggable?.IsDragging) return;
        if (this.IsPointInside(this.scoopPoint ?? this.node, this.scoopSource)) this.Scoop();
    }

    private Scoop(): void {
        this.hasContent = true;
        if (this.content) {
            const opacity = this.content.getComponent(UIOpacity) ?? this.content.addComponent(UIOpacity);
            Tween.stopAllByTarget(opacity);
            opacity.opacity = 255;
            const scale = this.content.scale.clone();
            this.content.active = true;
            this.content.setScale(0, 0, scale.z);
            tween(this.content).to(0.2, { scale }, { easing: 'backOut' }).start();
        }
        Ply_SoundManager.Ins?.PlayFx(this.scoopFx);
        this.AllowDrop();
        this.onScooped.invoke();
    }

    private AllowDrop(): void {
        if (this.target && this.itemDraggable) this.itemDraggable.targetItemType = this.target.itemType;
    }

    public GetHandTutHint(): HandTutHint | null {
        if (!this.ready || !this.needScoop || this.hasContent || !this.scoopSource) return null;
        // Drag so that the scoop point lands on the source.
        const point = (this.scoopPoint ?? this.node).worldPosition;
        const from = this.node.worldPosition.clone();
        const to = this.scoopSource.worldPosition.clone().add(from.clone().subtract(point));
        return { kind: 'drag', from, to };
    }

    public CanShowHandTut(): boolean {
        return this.ready;
    }

    private OnDropped(): void {
        if (!this.ready || !this.target) return;
        this.ready = false;
        this.itemDraggable?.DisableComponent();
        HandTutManager.Ins?.ItemDone(this.node);
        this.Pour(this.target);
    }

    private Pour(target: Item): void {
        const game = GameManager.Ins;
        if (game) game.isPlaying = false;

        const startAngle = this.node.angle;
        const endAngle = startAngle + this.pourAngle;
        const pourPos = this.GetPourPosition(target.node, endAngle);

        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(this.pourMoveDuration, { worldPosition: pourPos }, { easing: 'quadOut' })
            .to(this.pourTiltDuration, { angle: endAngle }, { easing: 'sineOut' })
            .call(() => this.StartPouring())
            .delay(this.pourHoldDuration)
            .call(() => this.StopPouring())
            .to(this.pourTiltDuration, { angle: startAngle }, { easing: 'sineInOut' })
            .call(() => {
                if (game) game.isPlaying = true;
                this.ItemDone();
                this.onPoured.invoke();
                this.ReturnHome();
            })
            .start();
    }

    private StartPouring(): void {
        if (this.stream) {
            const opacity = this.stream.getComponent(UIOpacity) ?? this.stream.addComponent(UIOpacity);
            Tween.stopAllByTarget(opacity);
            opacity.opacity = 0;
            this.stream.active = true;
            tween(opacity).to(0.15, { opacity: 255 }).start();
        }
        if (this.content && this.hasContent) PlayFadeOut(this.content, this.pourHoldDuration);
        this.hasContent = false;
        Ply_SoundManager.Ins?.PlayFx(this.pourFx);
        this.onPour.invoke(this.pourHoldDuration);
    }

    private StopPouring(): void {
        if (this.stream) PlayFadeOut(this.stream, 0.15);
    }

    /**
     * Where this node must be so that, once tilted to `endAngle`, pourPoint
     * sits at target + pourOffset.
     */
    private GetPourPosition(target: Node, endAngle: number): Vec3 {
        const goal = target.worldPosition.clone().add(this.pourOffset);
        const point = this.pourPoint;
        if (!point || !point.isValid) return new Vec3(goal.x, goal.y, this.node.worldPosition.z);

        const angle = this.node.angle;
        this.node.angle = endAngle;
        const offset = point.worldPosition.clone().subtract(this.node.worldPosition);
        this.node.angle = angle;
        return new Vec3(goal.x - offset.x, goal.y - offset.y, this.node.worldPosition.z);
    }

    private ReturnHome(): void {
        const draggable = this.itemDraggable;
        if (!draggable) return;
        const onBack = (): void => {
            draggable.onReturnToStartComplete.removeListener(onBack);
            this.scheduleOnce(() => this.Lock(), 0);
        };
        draggable.onReturnToStartComplete.addListener(onBack);
        draggable.ReturnToStartWithoutHeart();
    }

    private IsPointInside(point: Node, area: Node | null): boolean {
        const transform = area?.activeInHierarchy ? area.getComponent(UITransform) : null;
        if (!transform) return false;
        const local = transform.convertToNodeSpaceAR(point.worldPosition);
        const left = -transform.anchorX * transform.width;
        const bottom = -transform.anchorY * transform.height;
        return local.x >= left && local.x <= left + transform.width
            && local.y >= bottom && local.y <= bottom + transform.height;
    }
}
