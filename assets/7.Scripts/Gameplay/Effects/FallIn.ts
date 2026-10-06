import { Node, Tween, tween, UIOpacity } from 'cc';

/**
 * Shows `node` dropping into its current local position from `height` above,
 * starting at `startOpacity` (0..1) and becoming fully visible as it lands.
 */
export function PlayFallIn(
    node: Node,
    height: number,
    duration: number,
    startOpacity: number,
    onDone?: () => void,
): void {
    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    const end = node.position.clone();

    Tween.stopAllByTarget(node);
    Tween.stopAllByTarget(opacity);
    node.active = true;
    node.setPosition(end.x, end.y + height, end.z);
    opacity.opacity = Math.round(255 * Math.min(1, Math.max(0, startOpacity)));

    const time = Math.max(0.01, duration);
    tween(opacity).to(time, { opacity: 255 }, { easing: 'sineOut' }).start();
    tween(node)
        .to(time, { position: end }, { easing: 'quadIn' })
        .call(() => onDone?.())
        .start();
}

/** Fades `node` to transparent, then deactivates it unless `keepActive`. */
export function PlayFadeOut(node: Node, duration: number, keepActive = false, onDone?: () => void): void {
    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    Tween.stopAllByTarget(opacity);
    tween(opacity)
        .to(Math.max(0.01, duration), { opacity: 0 }, { easing: 'sineIn' })
        .call(() => {
            if (!keepActive) node.active = false;
            onDone?.();
        })
        .start();
}
