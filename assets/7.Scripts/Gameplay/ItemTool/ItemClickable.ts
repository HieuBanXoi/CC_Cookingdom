import { _decorator, Node, EventTouch } from 'cc';
import { Ply_SoundManager, FxType } from '../Tool/Ply_SoundManager';
import { Ply_Event } from '../Tool/Ply_Event';
import { Ply_EventHandlerComponent } from '../Tool/Ply_EventHandlerComponent';
import { GameManager } from '../Manager/GameManager';

const { ccclass, property } = _decorator;

@ccclass('ItemClickable')
export class ItemClickable extends Ply_EventHandlerComponent {

    @property
    public requiredClicks: number = 1;

    @property
    public infiniteClick: boolean = false;

    @property
    public canClick: boolean = true;

    @property({ tooltip: 'Disable clicking after click until EnableClick() is called' })
    public disableAfterClick: boolean = false;

    @property({ type: Ply_Event, tooltip: 'General onClick event' })
    public onClick: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Called when click count reaches requiredClicks' })
    public onClickComplete: Ply_Event = new Ply_Event();

    private currentClicks: number = 0;

    protected onLoad() {
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    protected onDestroy() {
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    private onTouchEnd(event: EventTouch) {
        if (!GameManager.Ins?.IsPlaying()) return;
        this.PerformClick();
    }

    public PerformClick() {
        if (!this.canClick) return;

        if (this.disableAfterClick) {
            this.canClick = false;
        }

        this.currentClicks++;

        this.onClick.invoke();

        if (this.infiniteClick) return;

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

    public PlayPopSound() {
        Ply_SoundManager.Ins.PlayFx(FxType.Click);
    }
}
