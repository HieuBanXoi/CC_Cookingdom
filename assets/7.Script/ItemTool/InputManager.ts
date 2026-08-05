import { _decorator, Component, Node } from 'cc';
import { Ply_Singleton } from '../Tool/Ply_Singleton';
import { GameManager } from '../Manager/GameManager';
import { ItemDraggable } from './ItemDraggable';
import { ItemStirring } from './ItemStirring';

const { ccclass, property } = _decorator;

@ccclass('InputManager')
export class InputManager extends Ply_Singleton<InputManager> {

    @property({
        type: Node,
        tooltip: 'Container node for items currently being dragged (ensures dragged items render on top)'
    })
    public draggingNode: Node = null!;

    @property
    public isDragging: boolean = false;

    private currentDraggable: ItemDraggable | null = null;
    private currentStirring: ItemStirring | null = null;

    protected onLoad() {
        super.onLoad();
    }

    public BeginDragItem(draggable: ItemDraggable) {
        if (!GameManager.Ins || !GameManager.Ins.IsPlaying()) return;

        this.currentDraggable = draggable;
        if (this.currentDraggable.BeginDrag()) {
            this.isDragging = true;
            GameManager.Ins.TurnOffTut();
        }
    }

    public BeginStirItem(stirring: ItemStirring) {
        if (!GameManager.Ins || !GameManager.Ins.IsPlaying()) return;

        this.currentStirring = stirring;
        this.currentStirring.BeginStir();
        this.isDragging = true;
        GameManager.Ins.TurnOffTut();
    }

    public EndInteraction() {
        if (this.currentDraggable) {
            this.currentDraggable.EndDrag();
            this.currentDraggable = null;
        }

        if (this.currentStirring) {
            this.currentStirring.EndStir();
            this.currentStirring = null;
        }

        this.isDragging = false;
    }
}
