import { _decorator, Component, Node, Label, Sprite, Color, EventHandler } from 'cc';
import { FxType, Ply_SoundManager } from './Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Test script to demonstrate standard Cocos Creator EventHandler usage
 */
@ccclass('TestPlyEvent')
export class TestPlyEvent extends Component {

    @property({ type: [EventHandler], tooltip: 'Event handlers configured via Inspector' })
    public onInspectorEvent: EventHandler[] = [];

    /**
     * Call this method (e.g. from a Button) to trigger onInspectorEvent
     */
    public triggerInspectorEvent() {
        console.log('[TestPlyEvent] Triggering onInspectorEvent with EventHandler...');
        EventHandler.emitEvents(this.onInspectorEvent);
    }

    // ==========================================
    // TARGET RECEIVER METHODS (Selectable in Inspector)
    // ==========================================

    public receiveNode(targetNode: Node) {
        if (!targetNode) {
            console.warn('[TestPlyEvent] receiveNode: Target Node is null!');
            return;
        }
        console.log(`[TestPlyEvent] receiveNode: "${targetNode.name}" (Toggling Active state)`);
        targetNode.active = !targetNode.active;
    }

    public receiveComponent(comp: Component) {
        if (!comp) {
            console.warn('[TestPlyEvent] receiveComponent: Component is null!');
            return;
        }
        console.log(`[TestPlyEvent] receiveComponent: ${comp.constructor.name}`);

        if (comp instanceof Label) {
            comp.string = "Triggered by EventHandler!";
        } else if (comp instanceof Sprite) {
            comp.color = new Color(
                Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256)
            );
        }
    }

    public receiveNumber(num: number) {
        console.log(`[TestPlyEvent] receiveNumber: ${num}`);
    }

    public receiveString(str: string) {
        console.log(`[TestPlyEvent] receiveString: "${str}"`);
    }

    public receiveBool(flag: boolean) {
        console.log(`[TestPlyEvent] receiveBool: ${flag}`);
    }

    public receiveFxType(fx: FxType) {
        console.log(`[TestPlyEvent] receiveFxType: ${FxType[fx] ?? fx} (${fx})`);
        Ply_SoundManager.Ins.PlayFx(fx);
    }
}
