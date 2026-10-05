import { _decorator, Animation, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Starts the looping animations of several nodes one after another with a
 * fixed delay between them, so identical loops do not play in sync. Only the
 * first play is delayed; after that each clip keeps looping on its own
 * (wrap mode of the clip).
 */
@ccclass('RandomAnimationDelay')
export class RandomAnimationDelay extends Component {
    @property({ type: [Node], tooltip: 'Nodes có Animation, bật lần lượt theo thứ tự trong list. Để trống thì dùng các node con của node này.' })
    public targets: Node[] = [];

    @property({ tooltip: 'Delay trước khi bật node đầu tiên (giây).' })
    public startDelay: number = 0;

    @property({ tooltip: 'Delay cố định giữa 2 node liên tiếp (giây).' })
    public delay: number = 0.5;

    @property({ tooltip: 'Tên clip cần play. Để trống thì dùng Default Clip của Animation.' })
    public clipName: string = '';

    private animations: Animation[] = [];

    protected onLoad(): void {
        const nodes = this.targets.length > 0 ? this.targets : this.node.children;
        for (const node of nodes) {
            const animation = node?.getComponent(Animation);
            if (!animation) continue;

            // Stop Animation.start() from auto-playing before our delay.
            animation.playOnLoad = false;
            this.animations.push(animation);
        }
    }

    protected start(): void {
        this.animations.forEach((animation, index) => {
            animation.stop();
            const time = Math.max(0, this.startDelay + index * this.delay);
            if (time <= 0) {
                this.play(animation);
            } else {
                this.scheduleOnce(() => this.play(animation), time);
            }
        });
    }

    private play(animation: Animation): void {
        if (!animation.isValid) return;

        const name = this.clipName.trim();
        if (name) {
            animation.play(name);
        } else {
            animation.play();
        }
    }
}
