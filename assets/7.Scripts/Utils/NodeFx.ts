import { Node, Tween, tween, UIOpacity, Vec3 } from 'cc';

/** Small tween helpers shared by gameplay items (fade, zoom, punch). */
export class NodeFx {
    public static GetOpacity(node: Node): UIOpacity {
        return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    }

    public static SetOpacity(node: Node | null, opacity: number): void {
        if (!node?.isValid) return;
        NodeFx.GetOpacity(node).opacity = Math.max(0, Math.min(255, opacity));
    }

    /** Activates the node and fades it from `from` to fully visible. */
    public static FadeIn(node: Node | null, duration: number, from: number = 0, onDone?: () => void): void {
        if (!node?.isValid) {
            onDone?.();
            return;
        }
        const opacity = NodeFx.GetOpacity(node);
        Tween.stopAllByTarget(opacity);
        node.active = true;
        opacity.opacity = from;
        tween(opacity).to(duration, { opacity: 255 }).call(() => onDone?.()).start();
    }

    /** Fades the node out, then deactivates it (unless keepActive). */
    public static FadeOut(node: Node | null, duration: number, keepActive: boolean = false, onDone?: () => void): void {
        if (!node?.isValid) {
            onDone?.();
            return;
        }
        const opacity = NodeFx.GetOpacity(node);
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(duration, { opacity: 0 })
            .call(() => {
                if (!keepActive && node.isValid) node.active = false;
                onDone?.();
            })
            .start();
    }

    /** Activates the node and scales it from 0 to `targetScale`. */
    public static ZoomIn(node: Node | null, duration: number, targetScale: Vec3, onDone?: () => void): void {
        if (!node?.isValid) {
            onDone?.();
            return;
        }
        Tween.stopAllByTarget(node);
        node.active = true;
        NodeFx.SetOpacity(node, 255);
        node.setScale(0, 0, targetScale.z);
        tween(node).to(duration, { scale: targetScale.clone() }, { easing: 'backOut' }).call(() => onDone?.()).start();
    }

    /**
     * World position `node` must move to so that, once rotated to `angle`,
     * its descendant `anchor` sits exactly on `point`.
     */
    public static PositionForAnchorAt(node: Node, anchor: Node, angle: number, point: Vec3): Vec3 {
        const savedAngle = node.angle;
        node.angle = angle;
        const offset = anchor.worldPosition.clone().subtract(node.worldPosition);
        node.angle = savedAngle;
        const result = point.clone().subtract(offset);
        result.z = node.worldPosition.z;
        return result;
    }

    /** Stretches one axis around `baseScale` and settles back. */
    public static Punch(node: Node | null, axis: 'x' | 'y', strength: number, duration: number, baseScale?: Vec3, onDone?: () => void): void {
        if (!node?.isValid) {
            onDone?.();
            return;
        }
        const base = (baseScale ?? node.scale).clone();
        const up = base.clone();
        const down = base.clone();
        if (axis === 'x') {
            up.x *= 1 + strength;
            up.y *= 1 - strength * 0.5;
            down.x *= 1 - strength * 0.4;
        } else {
            up.y *= 1 + strength;
            up.x *= 1 - strength * 0.5;
            down.y *= 1 - strength * 0.4;
        }
        tween(node)
            .to(duration * 0.35, { scale: up }, { easing: 'quadOut' })
            .to(duration * 0.35, { scale: down }, { easing: 'sineInOut' })
            .to(duration * 0.3, { scale: base }, { easing: 'quadOut' })
            .call(() => onDone?.())
            .start();
    }
}
