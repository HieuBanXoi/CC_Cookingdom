import { _decorator, Node } from 'cc';
import { Item } from '../ItemTool/Item';
import { ItemType } from '../ItemTool/ItemType';
import { Sprite } from 'cc';
import { SpriteFrame } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('Pan')
export class Pan extends Item {

    @property({ type: Node, tooltip: 'Visual node shown while the pan is hot.' })
    public panHot: Node = null!;

    @property({type: Sprite })
    public onOffSprite: Sprite = null!;

    @property({type: SpriteFrame })
    public onSprite: SpriteFrame = null!;


    /** Turns the pan on, makes it a valid Pan drop target, and shows its hot visual. */
    public TurnOn(): void {
        this.itemType = ItemType.Pan;

        if (this.panHot) {
            this.panHot.active = true;
        }
        if (this.onOffSprite && this.onSprite) {
            this.onOffSprite.spriteFrame = this.onSprite;
        }
    }
}


