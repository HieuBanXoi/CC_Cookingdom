import { _decorator, Vec3, tween, Tween } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';

const { ccclass, property } = _decorator;

@ccclass('CuttingBoard')
export class CuttingBoard extends Item {

    @property({ tooltip: 'Punch scale offset on food placed' })
    public punchScale: Vec3 = new Vec3(0.1, -0.1, 0);

    @property({ min: 0, tooltip: 'Punch effect duration in seconds' })
    public punchDuration: number = 0.3;

    private originalBoardScale: Vec3 = new Vec3(1, 1, 1);
    private punchTween: Tween<object> | null = null;

    protected onLoad(): void {
        super.onLoad();
        Vec3.copy(this.originalBoardScale, this.node.scale);
    }

    public IsFoodOn(isFoodOn: boolean): void {
        if (isFoodOn) {
            this.itemType = ItemType.None;
        } else {
            this.itemType = ItemType.CuttingBoard;
        }
    }

    public Punch(): void {
        if (this.punchTween) {
            this.punchTween.stop();
            this.punchTween = null;
        }
        this.node.setScale(this.originalBoardScale);

        const targetScale1 = new Vec3(
            this.originalBoardScale.x + this.punchScale.x,
            this.originalBoardScale.y + this.punchScale.y,
            this.originalBoardScale.z + this.punchScale.z
        );
        const targetScale2 = new Vec3(
            this.originalBoardScale.x - this.punchScale.x * 0.5,
            this.originalBoardScale.y - this.punchScale.y * 0.5,
            this.originalBoardScale.z
        );

        const thirdTime = Math.max(0.01, this.punchDuration / 3);
        this.punchTween = tween(this.node)
            .to(thirdTime, { scale: targetScale1 }, { easing: 'sineOut' })
            .to(thirdTime, { scale: targetScale2 }, { easing: 'sineInOut' })
            .to(thirdTime, { scale: this.originalBoardScale }, { easing: 'sineIn' })
            .call(() => {
                this.punchTween = null;
                this.node.setScale(this.originalBoardScale);
            })
            .start();
    }
}
