import { _decorator, Component, Enum, Button } from 'cc';
import { Ply_SoundManager, FxType } from './Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Component attached to Button nodes to play Sound FX automatically on click.
 */
@ccclass('SoundButton')
export class SoundButton extends Component {

    @property({ type: Enum(FxType) })
    public fxType: FxType = FxType.Click;

    protected onLoad() {
        const btn = this.getComponent(Button) || this.node.getComponent(Button);
        if (btn) {
            this.node.on(Button.EventType.CLICK, this.onClick, this);
        }
    }

    protected onDestroy() {
        this.node.off(Button.EventType.CLICK, this.onClick, this);
    }

    private onClick() {
        Ply_SoundManager.Ins.PlayFx(this.fxType);
    }
}
