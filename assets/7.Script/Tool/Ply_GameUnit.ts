import { _decorator, Node } from 'cc';
import { Ply_EventHandlerComponent } from './Ply_EventHandlerComponent';
const { ccclass } = _decorator;

/**
 * Base class for all objects that can be managed by Ply_Pool.
 * Inherit this class to automatically handle pool lifecycle methods.
 */
@ccclass('Ply_GameUnit')
export class Ply_GameUnit extends Ply_EventHandlerComponent {
    /**
     * Transform property for Unity compatibility.
     * In Cocos Creator, this.node represents the Transform.
     */
    public get tf(): Node {
        return this.node;
    }

    /**
     * Called when retrieved from Pool (Spawn)
     */
    reuse() {
    }

    /**
     * Called when returned to Pool (Despawn)
     */
    unuse() {
    }
}
