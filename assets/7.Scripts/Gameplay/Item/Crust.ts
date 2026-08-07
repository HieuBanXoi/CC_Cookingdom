import { _decorator, Node } from 'cc';
import { Item } from '../ItemTool/Item';
import { ItemType } from '../ItemTool/ItemType';
import { ItemMoveToTarget } from '../ItemTool/ItemMoveToTarget';
import { GameManager } from '../Manager/GameManager';
import { ComponentCache } from '../Tool/CacheComponent';
import { AnimationControllerHelper } from '../Tool/AnimationControllerHelper';

const { ccclass, property } = _decorator;

@ccclass('Crust')
export class Crust extends Item {
    @property({type: Node})
    public pan: Node = null;

    private moveToTargetEventNode: Node | null = null;

    protected onLoad(): void {
        super.onLoad();

        const moveToTarget = this.itemMoveToTarget;
        if (moveToTarget?.node?.isValid) {
            this.moveToTargetEventNode = moveToTarget.node;
            this.moveToTargetEventNode.on(ItemMoveToTarget.EVENT_COMPLETE, this.OnMoveToTargetComplete, this);
        }
    }

    protected onDestroy(): void {
        if (this.moveToTargetEventNode?.isValid) {
            this.moveToTargetEventNode.off(ItemMoveToTarget.EVENT_COMPLETE, this.OnMoveToTargetComplete, this);
        }
        this.moveToTargetEventNode = null;
    }

    private OnMoveToTargetComplete(): void {
        if (this.itemDraggable?.targetItemType === ItemType.Pan) {
            ComponentCache.get(this.node, AnimationControllerHelper)?.PlayTrigger('Next');
            this.CanRoll();
            GameManager.Ins?.StopGame();
        }
    }

    public CanRoll(){
        this.itemClickable.enabled = true;
        this.itemClickable.canClick = true;
    }
    public RollDone(){
        this.itemClickable.enabled = false;
        this.itemClickable.canClick = false;
        this.itemMoveToTarget.defaultTarget = this.pan;
        this.itemDraggable.enabled = true;
        this.itemDraggable.targetItemType = ItemType.Pan;

    }
}


