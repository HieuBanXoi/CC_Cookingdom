import { _decorator, Enum, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { GameManager } from '../../../../Managers/GameManager';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';
import { PlayFadeOut, PlayFallIn } from '../../../Effects/FallIn';
import { GrinderStirring } from './GrinderStirring';
import type { MatchaBox } from './MatchaBox';

const { ccclass, property } = _decorator;

/**
 * Matcha grinder: the dried leaf is dropped in -> the player turns the handle
 * (GrinderStirring) -> the top flies away -> the grinder is dragged to the
 * matcha box and pours its powder in, then flies back home.
 */
@ccclass('Grinder')
export class Grinder extends Item {
    // ---------- Tab: Leaf ----------
    @property({ group: { name: 'Leaf', id: 'grinder', displayOrder: 0 }, type: Item, tooltip: 'Lá trà khô bên ngoài, kéo thả vào grinder.' })
    public leafSource: Item | null = null;

    @property({ group: { name: 'Leaf', id: 'grinder' }, type: Node, tooltip: 'Lá trên grinder: bật khi lá được thả vào, xoay theo grinder và nhỏ dần khi xay.' })
    public leafOnGrinder: Node | null = null;

    @property({ group: { name: 'Leaf', id: 'grinder' }, tooltip: 'Lá rơi từ cao bao nhiêu (đơn vị local của lá).' })
    public leafFallHeight: number = 250;

    @property({ group: { name: 'Leaf', id: 'grinder' }, min: 0.01, tooltip: 'Thời gian lá rơi (giây).' })
    public leafFallDuration: number = 0.5;

    @property({ group: { name: 'Leaf', id: 'grinder' }, range: [0, 1, 0.05], slide: true, tooltip: 'Độ rõ lúc bắt đầu rơi (0.2 = 20%).' })
    public leafStartOpacity: number = 0.2;

    @property({ group: { name: 'Leaf', id: 'grinder' }, tooltip: 'Góc lá xoay thêm mỗi frame của grinder (độ). Đổi dấu nếu lá xoay ngược.' })
    public leafAnglePerFrame: number = 45;

    @property({ group: { name: 'Leaf', id: 'grinder' }, type: Enum(FxType), tooltip: 'Âm thanh khi lá rơi vào grinder.' })
    public leafInFx: FxType = FxType.Drop;

    // ---------- Tab: Grind ----------
    @property({ group: { name: 'Grind', id: 'grinder', displayOrder: 1 }, type: GrinderStirring, tooltip: 'Component xoay trên grinder. Trống = tìm trên node này.' })
    public stirring: GrinderStirring | null = null;

    @property({ group: { name: 'Grind', id: 'grinder' }, type: Node, tooltip: 'MATCHA_POWDER_Done: rõ dần 0 → 1 theo tiến độ xay, mờ đi khi đổ vào hộp.' })
    public powderDone: Node | null = null;

    @property({ group: { name: 'Grind', id: 'grinder' }, type: [Node], tooltip: 'Phần trên bay lên và mờ đi khi xay xong. Trống = các frame xoay + lá trên grinder.' })
    public topNodes: Node[] = [];

    @property({ group: { name: 'Grind', id: 'grinder' }, tooltip: 'Phần trên bay lên bao nhiêu (đơn vị local).' })
    public topFlyHeight: number = 300;

    @property({ group: { name: 'Grind', id: 'grinder' }, min: 0.01, tooltip: 'Thời gian phần trên bay lên + mờ đi (giây).' })
    public topFlyDuration: number = 0.6;

    // ---------- Tab: Pour ----------
    @property({ group: { name: 'Pour', id: 'grinder', displayOrder: 2 }, type: Item, tooltip: 'Hộp matcha (MatchaBox) để đổ bột vào.' })
    public box: Item | null = null;

    @property({ group: { name: 'Pour', id: 'grinder' }, tooltip: 'Vị trí đổ so với hộp (world, px).' })
    public pourOffset: Vec3 = new Vec3(180, 300, 0);

    @property({ group: { name: 'Pour', id: 'grinder' }, tooltip: 'Góc nghiêng khi đổ (độ, dương = nghiêng sang trái).' })
    public pourAngle: number = 40;

    @property({ group: { name: 'Pour', id: 'grinder' }, min: 0.01, tooltip: 'Thời gian bay tới chỗ đổ (giây).' })
    public pourMoveDuration: number = 0.4;

    @property({ group: { name: 'Pour', id: 'grinder' }, min: 0.01, tooltip: 'Thời gian nghiêng/dựng lại (giây).' })
    public pourTiltDuration: number = 0.3;

    @property({ group: { name: 'Pour', id: 'grinder' }, min: 0.01, tooltip: 'Thời gian giữ nghiêng, bột mờ dần (giây).' })
    public pourHoldDuration: number = 0.8;

    @property({ group: { name: 'Pour', id: 'grinder' }, type: Enum(FxType), tooltip: 'Âm thanh khi đổ bột ra hộp.' })
    public pourFx: FxType = FxType.PouringSalt;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'grinder', displayOrder: 3 }, type: Ply_Event })
    public onLeafIn: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'grinder' }, type: Ply_Event })
    public onGrindDone: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'grinder' }, type: Ply_Event })
    public onPoured: Ply_Event = new Ply_Event();

    private leafBaseScale = new Vec3(1, 1, 1);
    private leafBaseAngle = 0;
    private readyToPour = false;
    private grindDone = false;
    private readonly onLeafDropped = (): void => this.OnLeafDropped();
    private readonly onSelfDropped = (): void => this.OnSelfDropped();
    private readonly onProgress = (progress: number): void => this.OnGrindProgress(progress);
    private readonly onFrame = (netSteps: number): void => this.OnGrindFrame(netSteps);
    private readonly onGrindComplete = (): void => this.OnGrindComplete();

    protected onLoad(): void {
        super.onLoad();
        this.stirring ??= this.getComponent(GrinderStirring);
        if (this.topNodes.length === 0) {
            this.topNodes = [...(this.stirring?.frames ?? []), ...(this.leafOnGrinder ? [this.leafOnGrinder] : [])];
        }
        if (this.leafOnGrinder) {
            Vec3.copy(this.leafBaseScale, this.leafOnGrinder.scale);
            this.leafBaseAngle = this.leafOnGrinder.angle;
            this.leafOnGrinder.active = false;
        }
        this.SetPowderOpacity(0);
        if (this.stirring) this.stirring.enabled = false;
        // Not draggable at all until the grinding is done (EnablePourDrag).
        this.DisableItemDraggable();
    }

    protected start(): void {
        // The leaf is the first step: it can be dropped on this grinder.
        const leafDrag = this.leafSource?.itemDraggable;
        if (leafDrag) {
            leafDrag.SetTargetItemType(this.node);
            this.leafSource!.EnableItemDraggable();
        }
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.leafSource?.itemDraggable?.onDropSuccess.removeListener(this.onLeafDropped);
        this.leafSource?.itemDraggable?.onDropSuccess.addListener(this.onLeafDropped);
        this.itemDraggable?.onDropSuccess.removeListener(this.onSelfDropped);
        this.itemDraggable?.onDropSuccess.addListener(this.onSelfDropped);
        const stirring = this.stirring ?? this.getComponent(GrinderStirring);
        stirring?.onProgress.removeListener(this.onProgress);
        stirring?.onProgress.addListener(this.onProgress);
        stirring?.onFrameChanged.removeListener(this.onFrame);
        stirring?.onFrameChanged.addListener(this.onFrame);
        stirring?.onStirComplete.removeListener(this.onGrindComplete);
        stirring?.onStirComplete.addListener(this.onGrindComplete);
    }

    protected onDisable(): void {
        this.leafSource?.itemDraggable?.onDropSuccess.removeListener(this.onLeafDropped);
        this.itemDraggable?.onDropSuccess.removeListener(this.onSelfDropped);
        this.stirring?.onProgress.removeListener(this.onProgress);
        this.stirring?.onFrameChanged.removeListener(this.onFrame);
        this.stirring?.onStirComplete.removeListener(this.onGrindComplete);
    }

    // ---------- Leaf ----------

    private OnLeafDropped(): void {
        const leaf = this.leafSource;
        if (!leaf) return;
        leaf.ItemDone();
        leaf.node.active = false;
        HandTutManager.Ins?.RegisterCorrectAction();

        // While the grinder handle is in use it must not be draggable
        // (InputManager prefers a draggable over a stirring on the same node).
        this.DisableItemDraggable();

        const onLanded = (): void => {
            Ply_SoundManager.Ins?.PlayFx(this.leafInFx);
            if (this.stirring) this.stirring.enabled = true;
            this.onLeafIn.invoke();
        };
        if (!this.leafOnGrinder) {
            onLanded();
            return;
        }
        this.leafOnGrinder.setScale(this.leafBaseScale);
        this.leafOnGrinder.angle = this.leafBaseAngle;
        PlayFallIn(this.leafOnGrinder, this.leafFallHeight, this.leafFallDuration, this.leafStartOpacity, onLanded);
    }

    // ---------- Grinding ----------

    private OnGrindProgress(progress: number): void {
        this.SetPowderOpacity(progress);
        if (this.leafOnGrinder) {
            const s = Math.max(0, 1 - progress);
            this.leafOnGrinder.setScale(this.leafBaseScale.x * s, this.leafBaseScale.y * s, this.leafBaseScale.z);
        }
    }

    private OnGrindFrame(netSteps: number): void {
        if (this.leafOnGrinder) this.leafOnGrinder.angle = this.leafBaseAngle + netSteps * this.leafAnglePerFrame;
    }

    private OnGrindComplete(): void {
        this.grindDone = true;
        if (this.stirring) this.stirring.enabled = false;
        this.SetPowderOpacity(1);
        HandTutManager.Ins?.RegisterCorrectAction();

        // The top of the grinder lifts off and fades away.
        for (const top of this.topNodes) {
            if (!top?.active) continue;
            const end = top.position.clone().add3f(0, this.topFlyHeight, 0);
            tween(top).to(this.topFlyDuration, { position: end }, { easing: 'quadOut' }).start();
            PlayFadeOut(top, this.topFlyDuration);
        }

        this.scheduleOnce(() => {
            this.onGrindDone.invoke();
            this.EnablePourDrag();
        }, this.topFlyDuration);
    }

    // ---------- Pour ----------

    private EnablePourDrag(): void {
        if (!this.box || !this.itemDraggable) return;
        this.readyToPour = true;
        this.itemDraggable.SetTargetItemType(this.box.node);
        this.EnableItemDraggable();
        HandTutManager.Ins?.RegisterTutorialItem(this, false);
    }

    private OnSelfDropped(): void {
        if (!this.readyToPour || !this.box) return;
        this.readyToPour = false;
        this.itemDraggable?.DisableComponent();
        HandTutManager.Ins?.RegisterCorrectAction();
        this.Pour();
    }

    private Pour(): void {
        const box = this.box!;
        const game = GameManager.Ins;
        if (game) game.isPlaying = false;

        const boxPos = box.node.worldPosition;
        const pourPos = new Vec3(boxPos.x + this.pourOffset.x, boxPos.y + this.pourOffset.y, this.node.worldPosition.z);
        const startAngle = this.node.angle;

        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(this.pourMoveDuration, { worldPosition: pourPos }, { easing: 'quadOut' })
            .to(this.pourTiltDuration, { angle: startAngle + this.pourAngle }, { easing: 'sineOut' })
            .call(() => {
                Ply_SoundManager.Ins?.PlayFx(this.pourFx);
                if (this.powderDone) PlayFadeOut(this.powderDone, this.pourHoldDuration);
                (box as MatchaBox).ReceivePowder?.(this.node);
            })
            .delay(this.pourHoldDuration)
            .to(this.pourTiltDuration, { angle: startAngle }, { easing: 'sineInOut' })
            .call(() => {
                if (game) game.isPlaying = true;
                this.ItemDone();
                this.onPoured.invoke();
                this.ReturnHome();
            })
            .start();
    }

    private ReturnHome(): void {
        const draggable = this.itemDraggable;
        if (!draggable) return;
        // Fly back, then stay draggable but without a target.
        const onBack = (): void => {
            draggable.onReturnToStartComplete.removeListener(onBack);
            (this.box as MatchaBox | null)?.RestorePowderLayer?.();
            this.scheduleOnce(() => this.LockDrag(), 0);
        };
        draggable.onReturnToStartComplete.addListener(onBack);
        draggable.ReturnToStartWithoutHeart();
    }

    // ---------- Helpers ----------

    /** Before the grinding is done a tap on the grinder is not a mistake: no break heart. */
    public SpawnBreakHeartOnBlockedTap(): void {
        if (!this.grindDone) return;
        super.SpawnBreakHeartOnBlockedTap();
    }

    /** Not its turn: still draggable, but every drop fails. */
    private LockDrag(): void {
        if (this.itemDraggable) this.itemDraggable.targetItemType = ItemType.None;
        this.EnableItemDraggable();
    }

    private SetPowderOpacity(ratio: number): void {
        if (!this.powderDone) return;
        const opacity = this.powderDone.getComponent(UIOpacity) ?? this.powderDone.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = Math.round(255 * Math.min(1, Math.max(0, ratio)));
        this.powderDone.active = true;
    }
}
