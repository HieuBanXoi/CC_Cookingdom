import { _decorator, Enum, Node, Sprite, SpriteFrame, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { Item } from '../../Common/Item';
import { ItemClickable } from '../../Common/ItemClickable';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { ClockTimer } from '../../../Effects/ClockTimer';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';
import type { Pizza } from './Pizza';

const { ccclass, property } = _decorator;

export enum MicrowaveState {
    Empty = 0,
    PizzaIn,
    Closed,
    Cooking,
    Cooked,
    Opened,
}
Enum(MicrowaveState);

/**
 * Microwave: pizza in -> click to close -> click power to cook (shake, heat
 * fade, clock) -> blink -> click to open -> pizza can go to the tray.
 * Needs an ItemClickable on this node and an Item + ItemClickable on the power button.
 */
@ccclass('Microwave')
export class Microwave extends Item {
    // ---------- Chung ----------
    @property({ type: Node, tooltip: 'Điểm pizza đứng khi cửa mở (PizzaInPos). Pizza lấy scale theo node này.' })
    public pizzaInPos: Node | null = null;

    @property({ type: Node, tooltip: 'Điểm pizza đứng khi cửa đóng (PizzaCookingPos). Pizza lấy scale theo node này.' })
    public pizzaCookingPos: Node | null = null;

    // ---------- Tab: Door ----------
    @property({ group: { name: 'Door', id: 'mw', displayOrder: 0 }, type: [Node], tooltip: 'Các node bật khi cửa mở, tắt khi cửa đóng.' })
    public openNodes: Node[] = [];

    @property({ group: { name: 'Door', id: 'mw' }, type: [Node], tooltip: 'Các node bật khi cửa đóng, tắt khi cửa mở.' })
    public closeNodes: Node[] = [];

    @property({ group: { name: 'Door', id: 'mw' }, type: Node, tooltip: 'Thân lò (microwave_Base). Vùng click của lò = thân lò + các node cửa đang bật. Trống = giữ nguyên UITransform của lò.' })
    public bodyHitArea: Node | null = null;

    // ---------- Tab: Power ----------
    @property({ group: { name: 'Power', id: 'mw', displayOrder: 1 }, type: Item, tooltip: 'Nút bật/tắt (Item + ItemClickable).' })
    public powerButton: Item | null = null;

    @property({ group: { name: 'Power', id: 'mw' }, type: Sprite, tooltip: 'Sprite của nút. Trống = Sprite trên Power Button.' })
    public powerButtonSprite: Sprite | null = null;

    @property({ group: { name: 'Power', id: 'mw' }, type: SpriteFrame, tooltip: 'Hình nút khi đang bật (lúc nướng).' })
    public powerOnFrame: SpriteFrame | null = null;

    @property({ group: { name: 'Power', id: 'mw' }, type: SpriteFrame, tooltip: 'Hình nút khi tắt (trước khi nướng và khi nướng xong).' })
    public powerOffFrame: SpriteFrame | null = null;

    // ---------- Tab: Cook ----------
    @property({ group: { name: 'Cook', id: 'mw', displayOrder: 2 }, min: 0.1, tooltip: 'Thời gian nướng (giây).' })
    public cookDuration: number = 3;

    @property({ group: { name: 'Cook', id: 'mw' }, type: Node, tooltip: 'Node microwave_Heat: bật và fade mờ/rõ liên tục khi nướng.' })
    public heatNode: Node | null = null;

    @property({ group: { name: 'Cook', id: 'mw' }, range: [0, 255, 1], slide: true, tooltip: 'Opacity thấp nhất của Heat khi fade.' })
    public heatMinOpacity: number = 60;

    @property({ group: { name: 'Cook', id: 'mw' }, min: 0.05, tooltip: 'Thời gian một lần fade của Heat (giây).' })
    public heatFadeDuration: number = 0.4;

    @property({ group: { name: 'Cook', id: 'mw' }, type: Node, tooltip: 'Node rung khi nướng. Trống = node này.' })
    public shakeNode: Node | null = null;

    @property({ group: { name: 'Cook', id: 'mw' }, min: 0, tooltip: 'Biên độ rung (px).' })
    public shakeStrength: number = 4;

    @property({ group: { name: 'Cook', id: 'mw' }, min: 0, tooltip: 'Góc lắc khi rung (độ).' })
    public shakeAngle: number = 1;

    @property({ group: { name: 'Cook', id: 'mw' }, min: 0.01, tooltip: 'Thời gian mỗi nhịp rung (giây).' })
    public shakeInterval: number = 0.05;

    @property({ group: { name: 'Cook', id: 'mw' }, type: Node, tooltip: 'Chỗ đặt ClockTimer. Trống = trên lò theo Clock Offset.' })
    public clockParent: Node | null = null;

    @property({ group: { name: 'Cook', id: 'mw' }, tooltip: 'Vị trí ClockTimer so với lò (khi không có Clock Parent).', visible: function (this: Microwave) { return !this.clockParent; } })
    public clockOffset: Vec3 = new Vec3(0, 250, 0);

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'mw', displayOrder: 3 }, type: Ply_Event })
    public onClosed: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'mw' }, type: Ply_Event })
    public onCookStart: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'mw' }, type: Ply_Event })
    public onCookDone: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'mw' }, type: Ply_Event })
    public onOpened: Ply_Event = new Ply_Event();

    private state: MicrowaveState = MicrowaveState.Empty;
    private pizza: Pizza | null = null;
    private readonly shakeState = { t: 0 };
    private shakeOrigin = new Vec3();
    private shakeOriginAngle = 0;
    private heatOpacity: UIOpacity | null = null;

    private readonly onClick = (): void => this.OnMicrowaveClicked();
    private readonly onPowerClick = (): void => this.OnPowerClicked();

    public get State(): MicrowaveState {
        return this.state;
    }

    protected onLoad(): void {
        super.onLoad();
        this.powerButtonSprite ??= this.powerButton?.getComponent(Sprite) ?? null;
        this.SetDoorOpen(true);
        this.SetPowerFrame(false);
        if (this.heatNode) this.heatNode.active = false;
        this.DisableItemClickable();
        this.SetPowerClickable(false);
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemClickable?.onClick.addListener(this.onClick);
        this.PowerClickable?.onClick.removeListener(this.onPowerClick);
        this.PowerClickable?.onClick.addListener(this.onPowerClick);
    }

    protected onDisable(): void {
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.PowerClickable?.onClick.removeListener(this.onPowerClick);
        // Never leave the frying loop running if the microwave goes away mid-cook.
        if (this.state === MicrowaveState.Cooking) Ply_SoundManager.Ins?.StopFxLoop(FxType.Frying);
    }

    // ---------- Called by Pizza ----------

    public OnPizzaIn(pizza: Pizza): void {
        this.pizza = pizza;
        this.state = MicrowaveState.PizzaIn;
        this.EnableItemClickable();
        HandTutManager.Ins?.RegisterTutorialItem(this, false);
    }

    public OnPizzaOut(pizza: Pizza): void {
        if (this.pizza !== pizza) return;
        this.pizza = null;
        this.state = MicrowaveState.Empty;
        this.DisableItemClickable();
    }

    // ---------- Input ----------

    private OnMicrowaveClicked(): void {
        HandTutManager.Ins?.RegisterCorrectAction();
        if (this.state === MicrowaveState.PizzaIn) {
            this.Close();
        } else if (this.state === MicrowaveState.Cooked) {
            this.Open();
        }
    }

    private OnPowerClicked(): void {
        if (this.state !== MicrowaveState.Closed) return;
        HandTutManager.Ins?.RegisterCorrectAction();
        this.StartCook();
    }

    private Close(): void {
        this.state = MicrowaveState.Closed;
        this.DisableItemClickable();
        this.SetDoorOpen(false);
        Ply_SoundManager.Ins?.PlayFx(FxType.Wipe);
        this.pizza?.TeleportTo(this.pizzaCookingPos);
        this.SetPowerFrame(false);

        this.SetPowerClickable(true);
        if (this.powerButton) HandTutManager.Ins?.RegisterTutorialItem(this.powerButton, false);
        this.onClosed.invoke();
    }

    private Open(): void {
        this.state = MicrowaveState.Opened;
        this.DisableItemClickable();
        this.SetDoorOpen(true);
        Ply_SoundManager.Ins?.PlayFx(FxType.Wipe);
        this.pizza?.TeleportTo(this.pizzaInPos);
        this.onOpened.invoke();
        this.pizza?.OnMicrowaveOpened();
    }

    // ---------- Cooking ----------

    private StartCook(): void {
        this.state = MicrowaveState.Cooking;
        this.SetPowerClickable(false);
        this.SetPowerFrame(true);
        Ply_SoundManager.Ins?.PlayFx(FxType.TurnOnStove);
        Ply_SoundManager.Ins?.PlayFxLoop(FxType.Frying);
        this.StartHeat();
        this.StartShake();

        const timer = ClockTimer.SpawnForItem(this, this.cookDuration, this.clockOffset, this.clockParent ?? undefined);
        if (timer) timer.completeFxType = FxType.MicrowaveComplete;
        this.pizza?.OnCookStart(this.cookDuration);
        this.onCookStart.invoke();
        this.scheduleOnce(this.FinishCook, this.cookDuration);
    }

    private FinishCook(): void {
        if (this.state !== MicrowaveState.Cooking) return;
        this.state = MicrowaveState.Cooked;
        Ply_SoundManager.Ins?.StopFxLoop(FxType.Frying);
        this.StopShake();
        this.StopHeat();
        this.SetPowerFrame(false);
        this.SpawnBlinkEffect();

        this.EnableItemClickable();
        this.pizza?.OnCookFinished();
        this.onCookDone.invoke();
    }

    private StartHeat(): void {
        const heat = this.heatNode;
        if (!heat) return;
        heat.active = true;
        this.heatOpacity = heat.getComponent(UIOpacity) ?? heat.addComponent(UIOpacity);
        Tween.stopAllByTarget(this.heatOpacity);
        this.heatOpacity.opacity = 255;
        tween(this.heatOpacity)
            .to(this.heatFadeDuration, { opacity: this.heatMinOpacity }, { easing: 'sineInOut' })
            .to(this.heatFadeDuration, { opacity: 255 }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    private StopHeat(): void {
        if (this.heatOpacity) {
            Tween.stopAllByTarget(this.heatOpacity);
            this.heatOpacity.opacity = 255;
        }
        if (this.heatNode) this.heatNode.active = false;
    }

    private StartShake(): void {
        const target = this.shakeNode ?? this.node;
        Vec3.copy(this.shakeOrigin, target.position);
        this.shakeOriginAngle = target.angle;
        Tween.stopAllByTarget(this.shakeState);
        tween(this.shakeState)
            .delay(this.shakeInterval)
            .call(() => {
                const dx = (Math.random() * 2 - 1) * this.shakeStrength;
                const dy = (Math.random() * 2 - 1) * this.shakeStrength;
                target.setPosition(this.shakeOrigin.x + dx, this.shakeOrigin.y + dy, this.shakeOrigin.z);
                target.angle = this.shakeOriginAngle + (Math.random() * 2 - 1) * this.shakeAngle;
            })
            .union()
            .repeatForever()
            .start();
    }

    private StopShake(): void {
        Tween.stopAllByTarget(this.shakeState);
        const target = this.shakeNode ?? this.node;
        target.setPosition(this.shakeOrigin);
        target.angle = this.shakeOriginAngle;
    }

    // ---------- Visuals ----------

    private SetDoorOpen(open: boolean): void {
        for (const node of this.openNodes) if (node) node.active = open;
        for (const node of this.closeNodes) if (node) node.active = !open;
        this.FitHitArea(open ? this.openNodes : this.closeNodes);
    }

    /**
     * Input hit-tests this node's UITransform, so resize it to the body plus
     * the visible door: with the door closed, the open door's area no longer counts.
     */
    private FitHitArea(doorNodes: Node[]): void {
        const transform = this.getComponent(UITransform);
        if (!transform || !this.bodyHitArea) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const corner = new Vec3();
        for (const node of [this.bodyHitArea, ...doorNodes]) {
            const part = node?.isValid ? node.getComponent(UITransform) : null;
            if (!part) continue;
            const rect = part.getBoundingBoxToWorld();
            for (const [x, y] of [[rect.xMin, rect.yMin], [rect.xMax, rect.yMax]]) {
                transform.convertToNodeSpaceAR(corner.set(x, y, 0), corner);
                minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
                minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
            }
        }
        const width = maxX - minX;
        const height = maxY - minY;
        if (!(width > 0 && height > 0)) return;

        // Anchor chosen so the node itself (and its children) do not move.
        transform.setContentSize(width, height);
        transform.setAnchorPoint(-minX / width, -minY / height);
    }

    /** The button may still be inactive (inside the closed-door nodes), so its Item has not cached anything yet. */
    private get PowerClickable(): ItemClickable | null {
        return this.powerButton?.getComponent(ItemClickable) ?? null;
    }

    private SetPowerClickable(enabled: boolean): void {
        const clickable = this.PowerClickable;
        if (!clickable) return;
        clickable.enabled = enabled;
        clickable.canClick = enabled;
    }

    private SetPowerFrame(on: boolean): void {
        const frame = on ? this.powerOnFrame : this.powerOffFrame;
        if (this.powerButtonSprite && frame) this.powerButtonSprite.spriteFrame = frame;
    }
}
