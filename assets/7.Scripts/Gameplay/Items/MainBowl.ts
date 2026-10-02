import { _decorator, Sprite, Tween, tween } from 'cc';
import { GameManager } from '../../Managers/GameManager';
import { Item } from './Item';

const { ccclass, property } = _decorator;

/**
 * Bowl that ends the game after receiving the configured amount of food.
 */
@ccclass('MainBowl')
export class MainBowl extends Item {
    @property({ type: Sprite, tooltip: 'Filled Sprite used to display the food progress.' })
    public foodFillSprite: Sprite | null = null;

    @property({ min: 1, tooltip: 'Number of food items represented by a full progress bar.' })
    public maxFood: number = 1;

    @property({ min: 1, tooltip: 'Number of food items required before stopping the game.' })
    public foodToStop: number = 1;

    @property({ min: 0, tooltip: 'Number of food items currently added to the bowl.' })
    public foodCount: number = 0;

    @property({ min: 0, tooltip: 'Duration in seconds for the fill animation per food item.' })
    public fillDuration: number = 0.35;

    private gameStopped = false;

    protected onLoad(): void {
        super.onLoad();
        this.UpdateFoodProgress();
    }

    /** Adds one food item to the bowl. */
    public AddFood(): void {
        if (this.gameStopped) return;

        this.foodCount++;
        this.UpdateFoodProgress();
        if (this.foodCount >= Math.max(1, this.foodToStop)) {
            this.gameStopped = true;
            GameManager.Ins?.StopGame();
        }
    }

    /** Lowercase alias for animation/event bindings that use `addfood`. */
    public addfood(): void {
        this.AddFood();
    }

    private UpdateFoodProgress(): void {
        if (!this.foodFillSprite?.isValid) return;

        const maxFood = Math.max(1, this.maxFood);
        const targetFill = Math.min(1, Math.max(0, this.foodCount / maxFood));
        Tween.stopAllByTarget(this.foodFillSprite);

        if (this.fillDuration <= 0) {
            this.foodFillSprite.fillRange = targetFill;
            return;
        }

        tween(this.foodFillSprite)
            .to(this.fillDuration, { fillRange: targetFill }, { easing: 'quadOut' })
            .start();
    }
}
