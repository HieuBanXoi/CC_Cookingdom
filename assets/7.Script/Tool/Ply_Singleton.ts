import { _decorator, Component } from 'cc';
import { Ply_EventHandlerComponent } from './Ply_EventHandlerComponent';
const { ccclass } = _decorator;

@ccclass('Ply_Singleton')
export class Ply_Singleton<T extends Component> extends Ply_EventHandlerComponent {
    public static Ins: any = null!;

    protected onLoad() {
        const ctor = this.constructor as any;

        if (ctor.Ins != null && ctor.Ins !== this) {
            console.warn(`[Ply_Singleton] Duplicate instance of ${this.node.name} destroyed!`);
            this.node.destroy();
            return;
        }

        ctor.Ins = this;
    }
}
