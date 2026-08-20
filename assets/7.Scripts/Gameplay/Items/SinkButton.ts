import { _decorator, Node, Vec3, tween, Tween } from 'cc';
import { ItemClickable } from './ItemClickable';
import { Sink } from './Sink';

const { ccclass, property } = _decorator;

@ccclass('SinkButton')
export class SinkButton extends ItemClickable {

    @property({ type: Sink, tooltip: 'Target Sink reference' })
    public sink: Sink = null!;

    @property({ tooltip: 'Toggle water on/off on each click' })
    public toggleWaterOnClick: boolean = true;

    @property({ tooltip: 'Initial water state (true = on, false = off)' })
    public isWaterOn: boolean = false;

    @property({ type: Node, tooltip: 'Optional visual node active when water is ON' })
    public onVisualNode: Node = null!;

    @property({ type: Node, tooltip: 'Optional visual node active when water is OFF' })
    public offVisualNode: Node = null!;

    @property({ tooltip: 'Play click punch-scale / rotation animation' })
    public playClickAnim: boolean = true;

    @property({ tooltip: 'Target local rotation Z angle when ON' })
    public onRotationZ: number = 0;

    @property({ tooltip: 'Target local rotation Z angle when OFF' })
    public offRotationZ: number = 0;

    private originalScale: Vec3 = new Vec3(1, 1, 1);

    protected onLoad() {
        this.infiniteClick = true;
        Vec3.copy(this.originalScale, this.node.scale);

        if (!this.sink) {
            this.sink = this.getComponent(Sink) || this.node.getComponentInParent(Sink)!;
        }

        this.onClick.addListener(this.handleClick);
    }

    protected start() {
        if (this.sink) {
            this.isWaterOn = this.sink.isWaterDrop;
        }
        this.updateVisuals(false);
    }

    protected onDestroy() {
        this.onClick.removeListener(this.handleClick);
        Tween.stopAllByTarget(this.node);
    }

    private handleClick = () => {
        if (this.toggleWaterOnClick) {
            this.ToggleWater();
        } else {
            this.TurnOnWater();
        }
    };

    public ToggleWater() {
        if (this.isWaterOn) {
            this.TurnOffWater();
        } else {
            this.TurnOnWater();
        }
    }

    public TurnOnWater() {
        this.isWaterOn = true;
        if (this.sink) {
            this.sink.TurnOnWater();
        }
        this.updateVisuals(true);
        this.PlayPopSound();
    }

    public TurnOffWater() {
        this.isWaterOn = false;
        if (this.sink) {
            this.sink.TurnOffWater();
        }
        this.updateVisuals(true);
        this.PlayPopSound();
    }

    private updateVisuals(animate: boolean = true) {
        if (this.onVisualNode) {
            this.onVisualNode.active = this.isWaterOn;
        }
        if (this.offVisualNode) {
            this.offVisualNode.active = !this.isWaterOn;
        }

        if (this.playClickAnim && animate) {
            Tween.stopAllByTarget(this.node);
            const targetRotZ = this.isWaterOn ? this.onRotationZ : this.offRotationZ;

            tween(this.node)
                .to(0.08, { scale: this.originalScale.clone().multiplyScalar(1.15) }, { easing: 'sineOut' })
                .to(0.08, { scale: this.originalScale.clone() }, { easing: 'sineIn' })
                .start();

            if (this.onRotationZ !== this.offRotationZ) {
                const curEuler = this.node.eulerAngles;
                tween(this.node)
                    .to(0.15, { eulerAngles: new Vec3(curEuler.x, curEuler.y, targetRotZ) }, { easing: 'quadOut' })
                    .start();
            }
        }
    }
}
