import { _decorator, Node, Sprite, Tween, tween, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { ItemType } from '../Items/ItemType';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';
import { StrawberryFx } from './StrawberryFx';

const { ccclass, property } = _decorator;

enum OvenState {
    Hidden,
    WaitDish,
    CloseDoor,
    WaitSwitch,
    Baking,
    OpenDoor,
    Done,
}

/**
 * Phase 3 oven: slides in, receives the baking dish at dishPos, tap to close
 * the door, tap the switch to bake (red glow pulses, temperature fills up and
 * back down), tap again to open the door and hand the baked dish back.
 */
@ccclass('StrawberryOven')
export class StrawberryOven extends Item {
    @property({ type: Node, tooltip: 'Where the dish sits inside the oven (dish takes its scale).' })
    public dishPos: Node | null = null;

    @property(Node)
    public doorOpen: Node | null = null;

    @property(Node)
    public doorClose: Node | null = null;

    @property({ type: Item, tooltip: 'Clickable on the open door: tapping it also closes the door.' })
    public doorOpenClick: Item | null = null;

    @property({ type: Item, tooltip: 'Clickable switch (Switch off node).' })
    public switchClick: Item | null = null;

    @property(Node)
    public switchOn: Node | null = null;

    @property(Node)
    public switchOff: Node | null = null;

    @property({ type: Node, tooltip: 'Red heat glow inside the oven.' })
    public red: Node | null = null;

    @property({ type: Sprite, tooltip: 'Filled sprite of the temperature gauge.' })
    public tempScale: Sprite | null = null;

    @property({ min: 0.5 })
    public bakeDuration = 3;

    @property({ min: 0.1 })
    public coolDuration = 1.2;

    @property({ tooltip: 'Local X offset the oven slides in from.' })
    public enterOffsetX = 1200;

    private state = OvenState.Hidden;
    private homePosition = new Vec3();
    private dish: Node | null = null;
    private onBaked: (() => void) | null = null;

    private readonly onOvenClick = (): void => this.OnOvenClick();
    private readonly onSwitchClick = (): void => this.OnSwitchClick();

    protected onLoad(): void {
        super.onLoad();
        this.itemType = ItemType.Oven;
        Vec3.copy(this.homePosition, this.node.position);
        this.node.setPosition(this.homePosition.x + this.enterOffsetX, this.homePosition.y, this.homePosition.z);

        this.SetDoorClosed(false);
        this.SetSwitchOn(false);
        if (this.red) this.red.active = false;
        if (this.tempScale) this.tempScale.fillRange = 0;

        this.DisableItemClickable();
        this.doorOpenClick?.DisableItemClickable();
        this.switchClick?.DisableItemClickable();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemClickable?.onClick.removeListener(this.onOvenClick);
        this.itemClickable?.onClick.addListener(this.onOvenClick);
        this.doorOpenClick?.cacheComponents();
        this.doorOpenClick?.itemClickable?.onClick.removeListener(this.onOvenClick);
        this.doorOpenClick?.itemClickable?.onClick.addListener(this.onOvenClick);
        this.switchClick?.cacheComponents();
        this.switchClick?.itemClickable?.onClick.removeListener(this.onSwitchClick);
        this.switchClick?.itemClickable?.onClick.addListener(this.onSwitchClick);
    }

    protected onDisable(): void {
        if (this.state === OvenState.Baking) Ply_SoundManager.Ins?.StopFxLoop(FxType.Frying);
        this.itemClickable?.onClick.removeListener(this.onOvenClick);
        this.doorOpenClick?.itemClickable?.onClick.removeListener(this.onOvenClick);
        this.switchClick?.itemClickable?.onClick.removeListener(this.onSwitchClick);
    }

    public get CanReceiveDish(): boolean {
        return this.state === OvenState.WaitDish;
    }

    /** Slides the oven in; onArrived runs once it is in place. */
    public Enter(onArrived?: () => void): void {
        tween(this.node)
            .to(0.6, { position: this.homePosition }, { easing: 'quadOut' })
            .call(() => {
                this.state = OvenState.WaitDish;
                onArrived?.();
            })
            .start();
    }

    /** Puts the dish at dishPos; onBaked runs when the door is opened after baking. */
    public ReceiveDish(dish: Node, onBaked: () => void): void {
        if (!this.dishPos || this.state !== OvenState.WaitDish) return;
        this.dish = dish;
        this.onBaked = onBaked;
        this.state = OvenState.CloseDoor;

        StrawberryFx.SetParentKeepWorld(dish, this.dishPos);
        tween(dish)
            .to(0.35, { position: new Vec3(), scale: new Vec3(1, 1, 1), eulerAngles: new Vec3() }, { easing: 'quadOut' })
            .call(() => {
                Ply_SoundManager.Ins?.PlayFx(FxType.ItemPlace);
                this.EnableItemClickable();
                this.doorOpenClick?.EnableItemClickable();
            })
            .start();
    }

    private OnOvenClick(): void {
        if (this.state === OvenState.CloseDoor) {
            this.state = OvenState.WaitSwitch;
            this.DisableItemClickable();
            this.doorOpenClick?.DisableItemClickable();
            this.SetDoorClosed(true);
            Ply_SoundManager.Ins?.PlayFx(FxType.OvenDoor);
            StrawberryFx.Punch(this.node, 0.04, 0.18);
            this.switchClick?.EnableItemClickable();
            return;
        }

        if (this.state === OvenState.OpenDoor) {
            this.state = OvenState.Done;
            this.DisableItemClickable();
            this.ItemDone();
            this.SetDoorClosed(false);
            Ply_SoundManager.Ins?.PlayFx(FxType.OvenDoor);
            const onBaked = this.onBaked;
            this.onBaked = null;
            onBaked?.();
        }
    }

    private OnSwitchClick(): void {
        if (this.state !== OvenState.WaitSwitch) return;
        this.state = OvenState.Baking;
        this.switchClick?.DisableItemClickable();
        this.switchClick?.ItemDone();
        this.SetSwitchOn(true);
        Ply_SoundManager.Ins?.PlayFx(FxType.TurnOnStove);
        this.StartHeat();

        const fill = this.tempScale;
        if (!fill) {
            this.scheduleOnce(() => this.StopBaking(), this.bakeDuration);
            return;
        }
        fill.fillRange = 0;
        tween(fill)
            .to(this.bakeDuration, { fillRange: 1 })
            .call(() => this.StopBaking())
            .start();
    }

    private StopBaking(): void {
        this.SetSwitchOn(false);
        Ply_SoundManager.Ins?.PlayFx(FxType.Click);
        Ply_SoundManager.Ins?.PlayFx(FxType.CookDone);
        this.StopHeat();

        const onCooled = () => {
            this.state = OvenState.OpenDoor;
            this.EnableItemClickable();
        };
        if (!this.tempScale) {
            onCooled();
            return;
        }
        tween(this.tempScale)
            .to(this.coolDuration, { fillRange: 0 }, { easing: 'quadOut' })
            .call(onCooled)
            .start();
    }

    private StartHeat(): void {
        Ply_SoundManager.Ins?.PlayFxLoop(FxType.Frying);
        const red = this.red;
        if (!red) return;
        red.active = true;
        const opacity = StrawberryFx.GetOpacity(red);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity)
            .to(0.4, { opacity: 220 })
            .then(tween(opacity)
                .to(0.45, { opacity: 120 }, { easing: 'sineInOut' })
                .to(0.45, { opacity: 220 }, { easing: 'sineInOut' })
                .union()
                .repeatForever())
            .start();
    }

    private StopHeat(): void {
        Ply_SoundManager.Ins?.StopFxLoop(FxType.Frying);
        const red = this.red;
        if (!red) return;
        const opacity = StrawberryFx.GetOpacity(red);
        Tween.stopAllByTarget(opacity);
        StrawberryFx.Fade(red, 0, this.coolDuration, -1, () => red.active = false);
    }

    private SetDoorClosed(closed: boolean): void {
        if (this.doorClose) this.doorClose.active = closed;
        if (this.doorOpen) this.doorOpen.active = !closed;
    }

    private SetSwitchOn(on: boolean): void {
        if (this.switchOn) this.switchOn.active = on;
        if (this.switchOff) this.switchOff.active = !on;
    }
}
