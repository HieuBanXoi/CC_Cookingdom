import { _decorator, animation, Animation, Component, SkeletalAnimation } from 'cc';

const { ccclass, property } = _decorator;

/**
 * EventHandler-friendly facade for Cocos Animation Controller triggers.
 * Set Custom Event Data to the trigger name, e.g. "Get".
 */
@ccclass('AnimationControllerHelper')
export class AnimationControllerHelper extends Component {
    @property({ type: animation.AnimationController, tooltip: 'Controller to control. Defaults to an Animation Controller on this Node.' })
    public animationController: animation.AnimationController | null = null;

    @property({ type: Animation, tooltip: 'Regular cc.Animation used by PlayAnimIndex. Defaults to Animation on this Node.' })
    public animationComponent: Animation | null = null;

    protected onLoad(): void {
        if (!this.animationController) {
            this.animationController = this.getComponent(animation.AnimationController);
        }
        if (!this.animationComponent) {
            this.animationComponent = this.getComponent(Animation);
        }
    }

    /** EventHandler callback: calls AnimationController.setValue(triggerName, true). */
    public PlayTrigger(triggerName: string): void {
        const trigger = triggerName?.trim();
        if (!trigger) {
            console.warn('[AnimationControllerHelper] PlayTrigger requires a trigger name.');
            return;
        }

        const controller = this.animationController ?? this.getComponent(animation.AnimationController);
        if (!controller) {
            console.warn(`[AnimationControllerHelper] Animation Controller is missing on '${this.node.name}'.`);
            return;
        }

        controller.setValue(trigger, true);
    }

    /**
     * EventHandler-friendly callback that plays cc.Animation.clips[index].
     */
    public PlayAnimIndex(index: number): void {
        const clipIndex = Math.trunc(Number(index));
        if (!Number.isInteger(clipIndex) || clipIndex < 0) {
            console.warn(`[AnimationControllerHelper] Invalid animation clip index '${index}' on '${this.node.name}'.`);
            return;
        }

        this.animationComponent ??= this.getComponent(Animation) || this.getComponentInChildren(Animation);
        const animationClip = this.animationComponent?.clips[clipIndex];
        if (this.animationComponent && animationClip) {
            this.animationComponent.play(animationClip.name);
            return;
        }

        const skeletalAnimation = this.getComponent(SkeletalAnimation) || this.getComponentInChildren(SkeletalAnimation);
        const skeletalClip = skeletalAnimation?.clips[clipIndex];
        if (skeletalAnimation && skeletalClip) {
            skeletalAnimation.play(skeletalClip.name);
            return;
        }

        console.warn(`[AnimationControllerHelper] Animation clip at index '${index}' was not found on '${this.node.name}'.`);
    }
}
