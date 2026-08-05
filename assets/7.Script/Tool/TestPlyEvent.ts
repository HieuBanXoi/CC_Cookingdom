import { _decorator, Component, Node, Label, Sprite, Color } from 'cc';
import { Ply_Event } from './Ply_Event';
import { FxType, Ply_SoundManager } from './Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Test script to demonstrate Ply_Event (UnityEvent equivalent in Cocos Creator)
 */
@ccclass('TestPlyEvent')
export class TestPlyEvent extends Component {

    @property({ type: Ply_Event, tooltip: 'Event that passes dynamic parameters from code' })
    public onDynamicEvent: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Event configured via Inspector' })
    public onInspectorEvent: Ply_Event = new Ply_Event();

    protected start() {
        // Example: Add listener via code (just like UnityEvent.AddListener)
        this.onDynamicEvent.addListener((msg: string, val: number) => {
            console.log(`[TestPlyEvent] Code Listener received: msg="${msg}", val=${val}`);
        });
    }

    /**
     * Call this method (e.g. from a Button) to trigger onDynamicEvent
     */
    public triggerDynamicEvent() {
        console.log('[TestPlyEvent] Triggering onDynamicEvent with dynamic parameters from code...');
        this.onDynamicEvent.invoke('Dynamic Score Update', 999);
    }

    /**
     * Call this method (e.g. from a Button) to trigger onInspectorEvent
     */
    public triggerInspectorEvent() {
        console.log('[TestPlyEvent] Triggering onInspectorEvent...');
        this.onInspectorEvent.invoke();
    }

    // ==========================================
    // TARGET RECEIVER METHODS (Selectable in Inspector)
    // ==========================================

    /**
     * Target method 1: Receive Node parameter
     */
    public receiveNode(targetNode: Node) {
        if (!targetNode) {
            console.warn('[TestPlyEvent] receiveNode: Target Node is null!');
            return;
        }
        console.log(`[TestPlyEvent] receiveNode: "${targetNode.name}" (Toggling Active state)`);
        targetNode.active = !targetNode.active;
    }

    /**
     * Target method 2: Receive Component parameter (Label / Sprite)
     */
    public receiveComponent(comp: Component) {
        if (!comp) {
            console.warn('[TestPlyEvent] receiveComponent: Component is null!');
            return;
        }
        console.log(`[TestPlyEvent] receiveComponent: ${comp.constructor.name}`);

        if (comp instanceof Label) {
            comp.string = "Triggered by Ply_Event!";
        } else if (comp instanceof Sprite) {
            comp.color = new Color(
                Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256)
            );
        }
    }

    /**
     * Target method 3: Receive Number parameter
     */
    public receiveNumber(num: number) {
        console.log(`[TestPlyEvent] receiveNumber: ${num}`);
    }

    /**
     * Target method 4: Receive String parameter
     */
    public receiveString(str: string) {
        console.log(`[TestPlyEvent] receiveString: "${str}"`);
    }

    /**
     * Target method 5: Receive Boolean parameter
     */
    public receiveBool(flag: boolean) {
        console.log(`[TestPlyEvent] receiveBool: ${flag}`);
    }

    /**
     * Target method 6: Receive FxType parameter to play sound
     */
    public receiveFxType(fx: FxType) {
        console.log(`[TestPlyEvent] receiveFxType: ${FxType[fx] ?? fx} (${fx})`);
        Ply_SoundManager.Ins.PlayFx(fx);
    }
}
