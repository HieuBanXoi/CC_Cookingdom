import { _decorator, Node, ParticleSystem2D } from 'cc';
import { Item } from '../../Common/Item';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Stove knob (needs ItemClickable): first tap turns the stove on (OFF -> ON
 * sprite, smoke). Once AllowTurnOff() is called, the next tap turns it off.
 */
@ccclass('StoveButton')
export class StoveButton extends Item {
    @property({ type: Node, tooltip: 'Sprite bếp tắt (BEP_OFF).' })
    public offNode: Node | null = null;

    @property({ type: Node, tooltip: 'Sprite bếp bật (BEP_ON).' })
    public onNode: Node | null = null;

    @property({ type: ParticleSystem2D, tooltip: 'Khói play khi bật bếp.' })
    public smoke: ParticleSystem2D | null = null;

    @property({ type: Ply_Event, tooltip: 'Gọi khi bật bếp.' })
    public onStoveOn: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Gọi khi tắt bếp.' })
    public onStoveOff: Ply_Event = new Ply_Event();

    private isOn = false;
    private canTurnOff = false;

    private readonly onClick = (): void => {
        if (!this.isOn) this.TurnOn();
        else if (this.canTurnOff) this.TurnOff();
    };

    public get IsOn(): boolean {
        return this.isOn;
    }

    protected onLoad(): void {
        super.onLoad();
        if (this.offNode) this.offNode.active = true;
        if (this.onNode) this.onNode.active = false;
        this.smoke?.stopSystem();
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemClickable?.onClick.addListener(this.onClick);
    }

    protected onDisable(): void {
        this.itemClickable?.onClick.removeListener(this.onClick);
    }

    public TurnOn(): void {
        if (this.isOn) return;
        this.isOn = true;
        if (this.offNode) this.offNode.active = false;
        if (this.onNode) this.onNode.active = true;
        this.smoke?.resetSystem();
        Ply_SoundManager.Ins?.PlayFx(FxType.TurnOnStove);
        // Not ItemDone yet: the hand tut must guide the knob again to turn it off.
        this.DisableItemClickable();
        this.onStoveOn.invoke();
    }

    /** Unlocks the knob so the next tap turns the stove off. */
    public AllowTurnOff(): void {
        if (!this.isOn) return;
        this.canTurnOff = true;
        this.EnableItemClickable();
    }

    public TurnOff(): void {
        if (!this.isOn) return;
        this.isOn = false;
        this.canTurnOff = false;
        if (this.offNode) this.offNode.active = true;
        if (this.onNode) this.onNode.active = false;
        this.smoke?.stopSystem();
        Ply_SoundManager.Ins?.PlayFx(FxType.TurnOnStove);
        this.DisableItemClickable();
        this.DisableBreakHeartOnBlockedTap();
        this.ItemDone();
        this.onStoveOff.invoke();
    }
}
