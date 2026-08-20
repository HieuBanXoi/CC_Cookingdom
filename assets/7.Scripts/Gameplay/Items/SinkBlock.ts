import { _decorator, Node, Enum } from 'cc';
import { Item } from './Item';
import { Sink } from './Sink';
import { ItemType } from './ItemType';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { HandTutManager } from '../../Managers/HandTutManager';

const { ccclass, property } = _decorator;

@ccclass('SinkBlock')
export class SinkBlock extends Item {

    @property({ type: Sink, tooltip: 'Target Sink reference' })
    public sink: Sink = null!;

    @property({ tooltip: 'Initial state: starts inside the sink (drain closed)' })
    public startsInside: boolean = false;

    @property({ type: Enum(ItemType), tooltip: 'Target type when placed inside sink' })
    public insideTargetType: ItemType = ItemType.SinkClosePos;

    @property({ type: Node, tooltip: 'Inside target transform/node' })
    public insideDefaultTarget: Node = null!;

    @property({ type: Enum(ItemType), tooltip: 'Target type when placed outside sink' })
    public outsideTargetType: ItemType = ItemType.SinkWaitting;

    @property({ type: Node, tooltip: 'Outside target transform/node' })
    public outsideDefaultTarget: Node = null!;

    private isInside: boolean = false;
    private isMoving: boolean = false;
    private initialized: boolean = false;

    public get IsInside(): boolean {
        return this.isInside;
    }

    protected onLoad() {
        super.onLoad();
    }

    protected start() {
        this.initialize();
    }

    protected onEnable() {
        if (this.initialized) {
            this.subscribe();
            this.updateDragAvailability();
        }
    }

    protected onDisable() {
        this.unsubscribe();
    }

    private initialize() {
        if (this.initialized) return;

        this.cacheComponents();
        this.isInside = this.startsInside;
        this.initialized = true;

        this.subscribe();
        this.applyCurrentLocation();

        if (this.sink) {
            if (this.isInside) {
                this.sink.Close();
            } else {
                this.sink.Open();
            }
        }

        HandTutManager.Ins?.RegisterCorrectAction();
        this.updateDragAvailability();
    }

    private subscribe() {
        if (this.itemDraggable) {
            this.itemDraggable.onDropSuccess.removeListener(this.handleDropSuccess);
            this.itemDraggable.onDropSuccess.addListener(this.handleDropSuccess);
        }

        this.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.handleMoveComplete, this);
        this.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.handleMoveComplete, this);
    }

    private unsubscribe() {
        if (this.itemDraggable) {
            this.itemDraggable.onDropSuccess.removeListener(this.handleDropSuccess);
        }

        this.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.handleMoveComplete, this);
    }

    private handleDropSuccess = () => {
        this.moveToNextLocation();
    };

    private moveToNextLocation() {
        if (this.isMoving || !this.itemMoveToTarget) return;

        const destination = this.isInside ? this.outsideDefaultTarget : this.insideDefaultTarget;
        if (!destination || !destination.isValid) {
            console.warn('[SinkBlock] Missing destination target on ' + this.node.name);
            return;
        }

        this.isMoving = true;
        this.updateDragAvailability();
        this.itemMoveToTarget.ExecuteMove2D(destination);
    }

    private handleMoveComplete = () => {
        this.isMoving = false;
        this.isInside = !this.isInside;
        this.applyCurrentLocation();

        if (this.sink) {
            if (this.isInside) {
                this.sink.Close();
            } else {
                this.sink.Open();
            }
        }

        HandTutManager.Ins?.RegisterCorrectAction();
        this.updateDragAvailability();
    };

    private applyCurrentLocation() {
        if (!this.itemDraggable || !this.itemMoveToTarget) return;

        const currentLocation = this.isInside ? this.insideDefaultTarget : this.outsideDefaultTarget;
        const nextLocation = this.isInside ? this.outsideDefaultTarget : this.insideDefaultTarget;

        this.itemDraggable.targetItemType = this.isInside ? this.outsideTargetType : this.insideTargetType;
        this.itemDraggable.returnTransform = currentLocation;
        this.itemMoveToTarget.SetDefaultTarget(nextLocation);
    }

    private updateDragAvailability() {
        if (!this.itemDraggable) return;
        this.itemDraggable.isDraggable = !this.isMoving;
    }
}
