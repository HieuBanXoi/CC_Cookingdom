import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/**
 * Common EventHandler callbacks for gameplay components.
 * Native Cocos EventHandler passes Custom Event Data as a string, so the
 * Set* methods accept both boolean and string values.
 */
@ccclass('Ply_EventHandlerComponent')
export class Ply_EventHandlerComponent extends Component {
    /** Unity GameObject.SetActive equivalent for this component's Node. */
    public SetActive(value: boolean | string = true): void {
        this.node.active = this.parseBoolean(value, true);
    }

    public Activate(): void {
        this.node.active = true;
    }

    public Deactivate(): void {
        this.node.active = false;
    }

    public ToggleActive(): void {
        this.node.active = !this.node.active;
    }

    /** Unity Behaviour.enabled equivalent for this component. */
    public SetEnabled(value: boolean | string = true): void {
        this.enabled = this.parseBoolean(value, true);
    }

    public EnableComponent(): void {
        this.enabled = true;
    }

    public DisableComponent(): void {
        this.enabled = false;
    }

    public ToggleEnabled(): void {
        this.enabled = !this.enabled;
    }

    private parseBoolean(value: boolean | string, defaultValue: boolean): boolean {
        if (typeof value === 'boolean') return value;
        const normalized = value?.trim().toLowerCase();
        if (!normalized) return defaultValue;
        return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
    }
}
