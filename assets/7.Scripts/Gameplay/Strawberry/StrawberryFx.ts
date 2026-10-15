import { Node, Tween, tween, UIOpacity, Vec3 } from 'cc';

/** Small tween helpers shared by the strawberry level scripts. */
export class StrawberryFx {
    public static GetOpacity(node: Node): UIOpacity {
        return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    }

    public static SetOpacity(node: Node | null, opacity: number): void {
        if (!node) return;
        StrawberryFx.GetOpacity(node).opacity = Math.round(Math.max(0, Math.min(255, opacity)));
    }

    /** Fades a node's UIOpacity. `from` < 0 keeps the current opacity. */
    public static Fade(node: Node | null, to: number, duration: number, from: number = -1, onComplete?: () => void): void {
        if (!node) {
            onComplete?.();
            return;
        }
        const opacity = StrawberryFx.GetOpacity(node);
        Tween.stopAllByTarget(opacity);
        if (from >= 0) opacity.opacity = from;
        tween(opacity)
            .to(duration, { opacity: to }, { easing: 'sineOut' })
            .call(() => onComplete?.())
            .start();
    }

    /** Squash on Y then settle back to the given scale. */
    public static PunchY(node: Node, baseScale: Vec3, amount: number = 0.15, duration: number = 0.25): void {
        Tween.stopAllByTarget(node);
        tween(node)
            .to(duration * 0.35, { scale: new Vec3(baseScale.x * (1 - amount * 0.5), baseScale.y * (1 + amount), baseScale.z) }, { easing: 'quadOut' })
            .to(duration * 0.65, { scale: baseScale }, { easing: 'backOut' })
            .start();
    }

    /** Uniform punch scale used as landing feedback. */
    public static Punch(node: Node, amount: number = 0.08, duration: number = 0.2): void {
        const base = node.scale.clone();
        tween(node)
            .to(duration * 0.5, { scale: base.clone().multiplyScalar(1 + amount) }, { easing: 'quadOut' })
            .to(duration * 0.5, { scale: base }, { easing: 'quadIn' })
            .start();
    }

    /** Jumps a node along an arc to a world position. */
    public static JumpToWorld(node: Node, target: Vec3, height: number, duration: number, onComplete?: () => void): void {
        const start = node.worldPosition.clone();
        const state = { t: 0 };
        tween(state)
            .to(duration, { t: 1 }, {
                easing: 'sineOut',
                onUpdate: () => {
                    const t = state.t;
                    node.setWorldPosition(
                        start.x + (target.x - start.x) * t,
                        start.y + (target.y - start.y) * t + Math.sin(t * Math.PI) * height,
                        start.z,
                    );
                },
            })
            .call(() => onComplete?.())
            .start();
    }

    /** World position = origin + offset, with offset given in the local units of `space` (handles a scaled gameplay root). */
    public static OffsetWorld(origin: Vec3, offset: Vec3, space: Node | null): Vec3 {
        const scale = space ? space.worldScale : Vec3.ONE;
        return new Vec3(origin.x + offset.x * scale.x, origin.y + offset.y * scale.y, origin.z);
    }

    /** Reparents a node without changing how it looks on screen. */
    public static SetParentKeepWorld(node: Node, parent: Node): void {
        if (node.parent === parent) return;
        const pos = node.worldPosition.clone();
        const scale = node.worldScale.clone();
        const rot = node.worldRotation.clone();
        node.setParent(parent);
        node.setWorldPosition(pos);
        node.setWorldScale(scale);
        node.setWorldRotation(rot);
    }
}
