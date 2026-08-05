import { _decorator, Animation, Component, Enum, Node } from 'cc';
import { FxType } from './Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * How a persistent listener receives its argument. Dynamic forwards the
 * arguments supplied to Ply_Event.invoke; every other option is a static
 * Inspector value, matching UnityEvent's Dynamic/Static listener modes.
 */
export enum PlyParamType {
    Dynamic = 0,
    Node,
    Component,
    Number,
    String,
    Boolean,
    FxType,
    None,
}
Enum(PlyParamType);

/** Equivalent to UnityEventCallState at runtime. */
export enum Ply_EventCallState {
    Off = 0,
    RuntimeOnly = 1,
}
Enum(Ply_EventCallState);

/** Built-in shortcuts for the Cocos Animation component. */
export enum Ply_EventAction {
    Method = 0,
    PlayAnimation,
    StopAnimation,
    PauseAnimation,
    ResumeAnimation,
}
Enum(Ply_EventAction);

@ccclass('Ply_EventCall')
export class Ply_EventCall {
    @property({ type: Enum(Ply_EventCallState), tooltip: 'Off skips this listener. Runtime Only invokes it while the game runs.' })
    public callState: Ply_EventCallState = Ply_EventCallState.RuntimeOnly;

    @property({ type: Component, tooltip: 'Drag any Component here, including one on this same Node. For animation control, drag the Cocos Animation component here.' })
    public targetComponent: Component | null = null;

    // Retained for existing scenes. When no component is supplied, the first
    // component on this node exposing methodName is used.
    @property({
        type: Node,
        tooltip: 'Fallback target node when Target Component is empty.',
        visible(this: Ply_EventCall) { return !this.targetComponent; },
    })
    public targetNode: Node | null = null;

    @property({ type: Enum(Ply_EventAction), tooltip: 'Call a component method, or control the target Cocos Animation component directly.' })
    public action: Ply_EventAction = Ply_EventAction.Method;

    @property({ tooltip: 'Public method to invoke on the target component.', visible(this: Ply_EventCall) { return this.action === Ply_EventAction.Method; } })
    public methodName = '';

    @property({ tooltip: 'Clip/state name passed to Animation.play(). Empty uses the Animation default clip.', visible(this: Ply_EventCall) { return this.action === Ply_EventAction.PlayAnimation; } })
    public animationName = '';

    @property({ type: Enum(PlyParamType), tooltip: 'Dynamic forwards invoke(...) arguments; other modes use the static value below.', visible(this: Ply_EventCall) { return this.action === Ply_EventAction.Method; } })
    public paramType: PlyParamType = PlyParamType.Dynamic;

    @property({ type: Node, visible(this: Ply_EventCall) { return this.paramType === PlyParamType.Node; } })
    public nodeValue: Node | null = null;

    @property({ type: Component, visible(this: Ply_EventCall) { return this.paramType === PlyParamType.Component; } })
    public componentValue: Component | null = null;

    @property({ visible(this: Ply_EventCall) { return this.paramType === PlyParamType.Number; } })
    public numberValue = 0;

    @property({ visible(this: Ply_EventCall) { return this.paramType === PlyParamType.String; } })
    public stringValue = '';

    @property({ visible(this: Ply_EventCall) { return this.paramType === PlyParamType.Boolean; } })
    public boolValue = false;

    @property({ type: Enum(FxType), visible(this: Ply_EventCall) { return this.paramType === PlyParamType.FxType; } })
    public fxTypeValue: FxType = FxType.Click;

    public invoke(...dynamicArgs: any[]): void {
        if (this.callState === Ply_EventCallState.Off) return;

        if (this.action !== Ply_EventAction.Method) {
            this.invokeAnimationAction();
            return;
        }
        if (!this.methodName) return;

        const target = this.resolveTarget();
        if (!target) {
            const targetName = this.targetComponent?.node?.name ?? this.targetNode?.name ?? 'None';
            console.warn(`[Ply_Event] Cannot invoke '${this.methodName}': method was not found on '${targetName}'.`);
            return;
        }

        const method = target[this.methodName] as (...args: any[]) => void;
        switch (this.paramType) {
            case PlyParamType.None: method.call(target); break;
            case PlyParamType.Node: method.call(target, this.nodeValue); break;
            case PlyParamType.Component: method.call(target, this.componentValue); break;
            case PlyParamType.Number: method.call(target, this.numberValue); break;
            case PlyParamType.String: method.call(target, this.stringValue); break;
            case PlyParamType.Boolean: method.call(target, this.boolValue); break;
            case PlyParamType.FxType: method.call(target, this.fxTypeValue); break;
            default: method.apply(target, dynamicArgs); break;
        }
    }

    private resolveTarget(): any | null {
        if (this.targetComponent?.isValid && typeof (this.targetComponent as any)[this.methodName] === 'function') {
            return this.targetComponent;
        }
        if (!this.targetNode?.isValid) return null;
        return this.targetNode.components.find(component =>
            component?.isValid && typeof (component as any)[this.methodName] === 'function',
        ) ?? null;
    }

    private invokeAnimationAction(): void {
        if (!(this.targetComponent instanceof Animation) || !this.targetComponent.isValid) {
            console.warn('[Ply_Event] Animation action requires a valid Cocos Animation component in Target Component.');
            return;
        }

        switch (this.action) {
            case Ply_EventAction.PlayAnimation: this.targetComponent.play(this.animationName || undefined); break;
            case Ply_EventAction.StopAnimation: this.targetComponent.stop(); break;
            case Ply_EventAction.PauseAnimation: this.targetComponent.pause(); break;
            case Ply_EventAction.ResumeAnimation: this.targetComponent.resume(); break;
        }
    }
}

/**
 * Serializable UnityEvent-style event for Cocos Creator.
 *
 * `calls` are persistent Inspector listeners; AddListener listeners exist only
 * in memory. Use Dynamic mode when the listener should receive invoke(...args).
 */
@ccclass('Ply_Event')
export class Ply_Event {
    @property({ type: [Ply_EventCall], tooltip: 'Persistent listeners, configured in the Inspector.' })
    public calls: Ply_EventCall[] = [];

    private runtimeListeners: Array<(...args: any[]) => void> = [];

    /** UnityEvent.Invoke equivalent. */
    public invoke(...args: any[]): void {
        // Snapshotting gives mutations during a callback UnityEvent-like behavior.
        for (const call of [...(this.calls ?? [])]) call?.invoke(...args);
        for (const listener of [...this.runtimeListeners]) listener(...args);
    }

    /** UnityEvent.AddListener equivalent. Duplicate subscriptions are allowed. */
    public addListener(callback: (...args: any[]) => void): void {
        if (typeof callback === 'function') this.runtimeListeners.push(callback);
    }

    /** UnityEvent.RemoveListener equivalent. */
    public removeListener(callback: (...args: any[]) => void): void {
        this.runtimeListeners = this.runtimeListeners.filter(listener => listener !== callback);
    }

    /** Removes runtime listeners only; Inspector listeners remain intact. */
    public removeAllListeners(): void {
        this.runtimeListeners = [];
    }

    public getPersistentEventCount(): number { return this.calls?.length ?? 0; }

    public removePersistentListener(index: number): void {
        if (index >= 0 && index < this.calls.length) this.calls.splice(index, 1);
    }

    public removeAllPersistentListeners(): void { this.calls = []; }

    // PascalCase aliases let code ported from Unity read naturally.
    public Invoke(...args: any[]): void { this.invoke(...args); }
    public AddListener(callback: (...args: any[]) => void): void { this.addListener(callback); }
    public RemoveListener(callback: (...args: any[]) => void): void { this.removeListener(callback); }
    public RemoveAllListeners(): void { this.removeAllListeners(); }
    public GetPersistentEventCount(): number { return this.getPersistentEventCount(); }
}
