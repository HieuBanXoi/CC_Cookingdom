import { _decorator, EventTouch, Input, input, Node, UITransform, Vec2, Vec3 } from 'cc';
import { Ply_Singleton } from '../Core/Base/Ply_Singleton';
import { GameManager } from './GameManager';
import { ItemDraggable } from '../Gameplay/Items/ItemDraggable';
import { ItemStirring } from '../Gameplay/Items/ItemStirring';
import { ItemClickable } from '../Gameplay/Items/ItemClickable';
import { ui } from './UI';
import { Ply_SoundManager } from './Ply_SoundManager';
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
            this.RegisterFirstMove();
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
            this.RegisterFirstMove();
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

    public RegisterFirstMove() {
        if (GameManager.Ins?.IsPlaying() && this.isFirtMove) {
            this.isFirtMove = false;
            Ply_SoundManager.Ins?.PlayBgm();
            ui?.firstMove();
        }
    }

    /** @deprecated Use RegisterFirstMove(). */
    fisrtTap() {
        this.RegisterFirstMove();
    }

    isFirtMove: boolean = true;
    onTouchStart(event: EventTouch) {
        const draggable = this.getTouchedComponent(event, ItemDraggable);
        if (draggable && draggable.enabled && GameManager.Ins?.IsPlaying()) {
            this.BeginDragItem(draggable);
        } else {
            const stirring = this.getTouchedComponent(event, ItemStirring);
            if (stirring && stirring.enabled && GameManager.Ins?.IsPlaying()) {
                this.BeginStirItem(stirring, event);
            } else {
                const clickable = this.getTouchedComponent(event, ItemClickable);
                if (clickable && GameManager.Ins?.IsPlaying() && clickable.canClick && clickable.enabled) {
                    this.RegisterFirstMove();
                    clickable.PerformClick();
                }
            }
        }
        this.bindingStart(event);
    }

    onTouchMove(event: EventTouch) {
        this.currentDraggable?.HandleTouchMove(event);
        this.currentStirring?.Stir(event);
        this.bindingMove(event);
    }

    onTouchEnd(event: EventTouch) {
        this.currentDraggable?.CompleteTouchDrag();
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

    private getTouchedComponent<T>(event: EventTouch, componentType: new (...args: any[]) => T): T | null {
        let target = event.target as Node | null;
        while (target) {
            const component = target.getComponent(componentType as any) as T | null;
            if (component) return component;
            target = target.parent;
        }

        const scene = this.node.scene;
        if (!scene) return null;

        const touchPosition = event.getUILocation();
        const worldTouchPosition = new Vec3(touchPosition.x, touchPosition.y, 0);
        const components = scene.getComponentsInChildren(componentType as any) as T[];
        for (let i = components.length - 1; i >= 0; i--) {
            const component = components[i] as any;
            const node = component.node as Node | null;
            const transform = node?.getComponent(UITransform);
            if (!node?.activeInHierarchy || !transform) continue;

            const localPoint = transform.convertToNodeSpaceAR(worldTouchPosition);
            const left = -transform.anchorX * transform.width;
            const bottom = -transform.anchorY * transform.height;
            if (localPoint.x >= left && localPoint.x <= left + transform.width
                && localPoint.y >= bottom && localPoint.y <= bottom + transform.height) {
                return component as T;
            }
        }
        return null;
    }
}


