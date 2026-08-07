import { _decorator, EventTouch, Input, input, Node, Vec2 } from 'cc';
import { Ply_Singleton } from '../Gameplay/Tool/Ply_Singleton';
import { GameManager } from '../Gameplay/Manager/GameManager';
import { ItemDraggable } from '../Gameplay/ItemTool/ItemDraggable';
import { ItemStirring } from '../Gameplay/ItemTool/ItemStirring';
import { ui } from './UI';
import { Ply_SoundManager } from '../Gameplay/Tool/Ply_SoundManager';
const { ccclass, property } = _decorator;

export var ipm: InputManager = null;

@ccclass('InputManager')
export class InputManager extends Ply_Singleton<InputManager> {

    static instance: InputManager = null;

    @property({ type: Node, tooltip: 'Container node for dragged items; it renders them above normal gameplay.' })
    public draggingNode: Node = null!;

    @property
    public isDragging = false;

    private currentDraggable: ItemDraggable | null = null;
    private currentStirring: ItemStirring | null = null;

    protected onLoad() {
        super.onLoad();
        InputManager.instance = this;
        ipm = this;
    }

    public BeginDragItem(draggable: ItemDraggable): void {
        if (!GameManager.Ins?.IsPlaying() || this.isDragging) return;

        this.currentDraggable = draggable;
        if (draggable.BeginDrag()) {
            this.isDragging = true;
            GameManager.Ins.TurnOffTut();
        } else {
            this.currentDraggable = null;
        }
    }

    public BeginStirItem(stirring: ItemStirring, event?: EventTouch): void {
        if (!GameManager.Ins?.IsPlaying() || this.isDragging) return;

        this.currentStirring = stirring;
        stirring.BeginStir(event);
        if (stirring.IsStirring) {
            this.isDragging = true;
            GameManager.Ins.TurnOffTut();
        } else {
            this.currentStirring = null;
        }
    }

    public EndInteraction(): void {
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

    startPos: Vec2 = null;

    dir: Vec2 = null;

    bindingStart(event: EventTouch) {}
    bindingMove(event: EventTouch) {}
    bindingEnd(event: EventTouch) {}
    bindingUpdate() {}

    fisrtTap() {
        if(this.isFirtMove) {
            this.isFirtMove = false;
            Ply_SoundManager.Ins?.PlayBgm();
            ui.firstMove();
        }
    }

    isFirtMove: boolean = true;
    onTouchStart(event: EventTouch) {
        this.fisrtTap();
        this.bindingStart(event);
    }

    onTouchMove(event: EventTouch) {
        this.bindingMove(event);
    }

    onTouchEnd(event: EventTouch) {
        this.EndInteraction();
        this.bindingEnd(event);
    }

    binding() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    offBinding() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected onDestroy() {
        this.offBinding();
        if (InputManager.instance === this) InputManager.instance = null;
        if (ipm === this) ipm = null;
        super.onDestroy();
    }

    start() {
        this.binding()
    }

    update(deltaTime: number) {
       this.bindingUpdate(); 
    }
}


