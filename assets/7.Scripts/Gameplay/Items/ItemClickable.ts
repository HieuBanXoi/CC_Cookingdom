import { _decorator } from 'cc';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Ply_EventHandlerComponent } from '../../Core/Base/Ply_EventHandlerComponent';

const { ccclass, property } = _decorator;

@ccclass('ItemClickable')
export class ItemClickable extends Ply_EventHandlerComponent {

    @property
    public requiredClicks: number = 1;

    @property({ tooltip: 'If true, clicking only checks canClick and always triggers onClick event without counting requiredClicks' })
    public infiniteClick: boolean = false;

    @property
    public canClick: boolean = true;

    @property({ tooltip: 'Disable clicking after click until EnableClick() is called (ignored if infiniteClick is true)' })
    public disableAfterClick: boolean = false;

    @property({ type: Ply_Event, tooltip: 'General onClick event' })
    public onClick: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Called when click count reaches requiredClicks' })
    public onClickComplete: Ply_Event = new Ply_Event();

    private currentClicks: number = 0;

    public get onClickEvent(): Ply_Event {
        return this.onClick;
    }

    public PerformClick() {
        if (!this.canClick) return;

        if (this.infiniteClick) {
            this.onClick.invoke();
            return;
        }

        if (this.disableAfterClick) {
            this.canClick = false;
        }

        this.currentClicks++;
        this.onClick.invoke();

        if (this.currentClicks >= this.requiredClicks) {
            this.onClickComplete.invoke();
            this.currentClicks = 0;
        }
    }

    public CanClick(canClick: boolean) {
        this.canClick = canClick;
    }

    public EnableClick() {
        this.canClick = true;
    }

    public DisableClick() {
        this.canClick = false;
    }

    public ResetClicks() {
        this.currentClicks = 0;
    }

    public PlayPopSound() {
        Ply_SoundManager.Ins?.PlayFx(FxType.Click);
    }
}
