import { _decorator, Component, Node, Vec2, Vec3, UITransform, UIOpacity, tween, Tween, EventTouch, clamp01, Enum } from 'cc';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * PlasticPeeler handles dragging and peeling plastic wrap using 2 separate Mask nodes.
 *
 * Dragging DOWN moves progress toward END (0 -> 1).
 * Dragging UP moves progress backward toward START (1 -> 0).
 *
 * Sound: Plays a looping peel sound while actively dragging, and immediately stops
 * when dragging stops, pauses, or reaches END.
 *
 * When the drag reaches the END state, the fadeNode (containing plastic_fake sprite)
 * moves downward (moveY) and fades out smoothly to disappear, then fires onPeelComplete.
 */
@ccclass('PlasticPeeler')
export class PlasticPeeler extends Component {

    @property({ type: Node, tooltip: 'Target node for receiving touch drag input. Defaults to this node if unassigned.' })
    public maskTarget: Node | null = null;

    // --- MASK 1 SETTINGS ---
    @property({ type: Node, tooltip: 'First Mask Node (e.g. Mask)' })
    public mask1: Node | null = null;

    @property({ type: Vec3, tooltip: 'Start Position of Mask 1' })
    public mask1StartPos: Vec3 = new Vec3(0, 0, 0);

    @property({ type: Vec3, tooltip: 'End Position of Mask 1' })
    public mask1EndPos: Vec3 = new Vec3(0, 0, 0);

    @property({ type: Vec2, tooltip: 'Start AnchorPoint of Mask 1 (X, Y)' })
    public mask1StartAnchor: Vec2 = new Vec2(0.5, 0.5);

    @property({ type: Vec2, tooltip: 'End AnchorPoint of Mask 1 (X, Y)' })
    public mask1EndAnchor: Vec2 = new Vec2(0.5, 1.45);

    // --- MASK 2 SETTINGS ---
    @property({ type: Node, tooltip: 'Second Mask Node (e.g. Mask2)' })
    public mask2: Node | null = null;

    @property({ type: Vec3, tooltip: 'Start Position of Mask 2' })
    public mask2StartPos: Vec3 = new Vec3(-127.086, 463.405, 0);

    @property({ type: Vec3, tooltip: 'End Position of Mask 2' })
    public mask2EndPos: Vec3 = new Vec3(159.59, -425.04, 0);

    @property({ type: Vec2, tooltip: 'Start AnchorPoint of Mask 2 (X, Y)' })
    public mask2StartAnchor: Vec2 = new Vec2(0.5, 0.5);

    @property({ type: Vec2, tooltip: 'End AnchorPoint of Mask 2 (X, Y)' })
    public mask2EndAnchor: Vec2 = new Vec2(0.5, -0.453);

    // --- FADE OUT & FLY DOWN SETTINGS ---
    @property({ type: Node, tooltip: 'Node containing sprite plastic_fake / plastic_wrap to move down and fade out at End' })
    public fadeNode: Node | null = null;

    @property({ tooltip: 'Distance to move Y downwards during fade-out animation' })
    public fadeMoveY: number = -340;

    @property({ min: 0.05, tooltip: 'Duration of the fade-out and moveY animation in seconds' })
    public fadeDuration: number = 0.5;

    // --- DRAG INTERACTION SETTINGS ---
    @property({ min: 10, tooltip: 'Vertical drag distance (pixels) required to pull from Start (0%) to End (100%)' })
    public dragDistance: number = 250;

    @property({ min: 0.1, max: 1, tooltip: 'Progress threshold to trigger peel completion (e.g. 0.85)' })
    public completeThreshold: number = 0.85;

    @property({ tooltip: 'Automatically complete peel immediately once drag crosses completeThreshold without waiting for touch release' })
    public autoFinishOnThreshold: boolean = false;

    @property({ tooltip: 'If true, smoothly return to Start when released before completeThreshold. Default is false (stays in place).' })
    public returnToStartOnRelease: boolean = false;

    @property({ min: 0.05, tooltip: 'Duration of return-to-start tween in seconds' })
    public returnDuration: number = 0.25;

    // --- SOUND SETTINGS ---
    @property({ tooltip: 'Play sound effect loop while dragging' })
    public playPeelSound: boolean = true;

    @property({ type: Enum(FxType), tooltip: 'Sound effect type to play in loop while peeling' })
    public peelFxType: FxType = FxType.LemonJuice;

    @property({ min: 0.05, tooltip: 'Inactivity delay (seconds) before stopping loop sound when finger stops moving' })
    public soundStopDelay: number = 0.12;

    @property({ tooltip: 'Deactivate Mask / Plastic nodes once peel animation finishes' })
    public deactivateNodesOnComplete: boolean = true;

    @property({ type: Ply_Event, tooltip: 'Invoked when the player starts dragging the mask' })
    public onPeelStart: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Invoked when the player releases touch/stops dragging' })
    public onPeelDragEnd: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Invoked when peel animation and fade out completely finishes' })
    public onPeelComplete: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Invoked whenever drag progress updates (0.0 to 1.0)' })
    public onProgressChanged: Ply_Event = new Ply_Event();

    // --- INTERNAL STATE ---
    private isPeelingEnabled: boolean = true;
    private isFinished: boolean = false;
    private isDragging: boolean = false;
    private isPlayingLoopSound: boolean = false;
    private moveInactivityTimer: number = 0;
    private currentProgress: number = 0;
    private startTouchY: number = 0;
    private startProgress: number = 0;

    private mask1Transform: UITransform | null = null;
    private mask2Transform: UITransform | null = null;
    private returnTween: Tween<object> | null = null;

    private readonly tempVec3 = new Vec3();
    private readonly tempVec2 = new Vec2();

    protected onLoad(): void {
        this.CacheTransforms();
        this.RegisterTouchEvents();
    }

    protected onEnable(): void {
        this.CacheTransforms();
        this.SetProgress(this.currentProgress);
    }

    protected onDisable(): void {
        this.UnregisterTouchEvents();
        this.StopReturnTween();
        this.StopPeelLoopSound();
    }

    protected onDestroy(): void {
        this.UnregisterTouchEvents();
        this.StopReturnTween();
        this.StopPeelLoopSound();
    }

    protected update(dt: number): void {
        if (this.isPlayingLoopSound) {
            this.moveInactivityTimer += dt;
            if (this.moveInactivityTimer >= this.soundStopDelay) {
                this.StopPeelLoopSound();
            }
        }
    }

    /**
     * Set the current peel progress manually (0.0 = Start, 1.0 = End).
     */
    public SetProgress(progress: number): void {
        this.currentProgress = clamp01(progress);

        // Interpolate Mask 1
        if (this.mask1 && this.mask1.isValid) {
            Vec3.lerp(this.tempVec3, this.mask1StartPos, this.mask1EndPos, this.currentProgress);
            this.mask1.setPosition(this.tempVec3);

            if (!this.mask1Transform || !this.mask1Transform.isValid) {
                this.mask1Transform = this.mask1.getComponent(UITransform);
            }
            if (this.mask1Transform && this.mask1Transform.isValid) {
                Vec2.lerp(this.tempVec2, this.mask1StartAnchor, this.mask1EndAnchor, this.currentProgress);
                this.mask1Transform.setAnchorPoint(this.tempVec2);
            }
        }

        // Interpolate Mask 2
        if (this.mask2 && this.mask2.isValid) {
            Vec3.lerp(this.tempVec3, this.mask2StartPos, this.mask2EndPos, this.currentProgress);
            this.mask2.setPosition(this.tempVec3);

            if (!this.mask2Transform || !this.mask2Transform.isValid) {
                this.mask2Transform = this.mask2.getComponent(UITransform);
            }
            if (this.mask2Transform && this.mask2Transform.isValid) {
                Vec2.lerp(this.tempVec2, this.mask2StartAnchor, this.mask2EndAnchor, this.currentProgress);
                this.mask2Transform.setAnchorPoint(this.tempVec2);
            }
        }

        this.onProgressChanged.invoke(this.currentProgress);
    }

    /**
     * Get the current peel progress (0.0 to 1.0).
     */
    public GetProgress(): number {
        return this.currentProgress;
    }

    /**
     * Enable touch interaction for peeling.
     */
    public EnablePeel(): void {
        this.isPeelingEnabled = true;
    }

    /**
     * Disable touch interaction for peeling.
     */
    public DisablePeel(): void {
        this.isPeelingEnabled = false;
        this.isDragging = false;
        this.StopPeelLoopSound();
    }

    /**
     * Reset the peeler back to the Start state.
     */
    public ResetToStart(): void {
        this.StopReturnTween();
        this.StopPeelLoopSound();
        this.isFinished = false;
        this.isDragging = false;
        this.isPeelingEnabled = true;

        if (this.fadeNode && this.fadeNode.isValid) {
            this.fadeNode.active = true;
            const opacity = this.fadeNode.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 255;
        }
        if (this.mask1 && this.mask1.isValid) this.mask1.active = true;
        if (this.mask2 && this.mask2.isValid) this.mask2.active = true;

        this.SetProgress(0);
    }

    /**
     * Trigger completion: finish setting progress to 1, animate fadeNode down and fade out.
     */
    public FinishPeel(): void {
        if (this.isFinished) return;
        this.isFinished = true;
        this.isPeelingEnabled = false;
        this.isDragging = false;

        this.StopReturnTween();
        this.StopPeelLoopSound();
        this.SetProgress(1.0);

        // Animate fadeNode: moveY down + fade opacity to 0
        const nodeToFade = this.fadeNode || this.mask2;
        if (nodeToFade && nodeToFade.isValid) {
            const startPos = nodeToFade.position.clone();
            const targetPos = new Vec3(startPos.x, startPos.y + this.fadeMoveY, startPos.z);

            Tween.stopAllByTarget(nodeToFade);
            tween(nodeToFade)
                .to(this.fadeDuration, { position: targetPos }, { easing: 'quadOut' })
                .start();

            const opacity = nodeToFade.getComponent(UIOpacity) || nodeToFade.addComponent(UIOpacity);
            Tween.stopAllByTarget(opacity);
            tween(opacity)
                .to(this.fadeDuration, { opacity: 0 }, { easing: 'quadOut' })
                .call(() => {
                    this.OnPeelFinished();
                })
                .start();
        } else {
            this.OnPeelFinished();
        }
    }

    private OnPeelFinished(): void {
        this.StopPeelLoopSound();

        if (this.deactivateNodesOnComplete) {
            if (this.mask1 && this.mask1.isValid) this.mask1.active = false;
            if (this.mask2 && this.mask2.isValid) this.mask2.active = false;
            if (this.fadeNode && this.fadeNode.isValid) this.fadeNode.active = false;
        }

        this.onPeelComplete.invoke();
    }

    private StartPeelLoopSound(): void {
        if (!this.playPeelSound || this.isPlayingLoopSound || this.isFinished) return;
        this.isPlayingLoopSound = true;
        this.moveInactivityTimer = 0;
        Ply_SoundManager.Ins?.PlayFxLoop(this.peelFxType);
    }

    private StopPeelLoopSound(): void {
        if (!this.isPlayingLoopSound) return;
        this.isPlayingLoopSound = false;
        this.moveInactivityTimer = 0;
        Ply_SoundManager.Ins?.StopFxLoop(this.peelFxType);
    }

    private OnTouchStart(event: EventTouch): void {
        if (!this.isPeelingEnabled || this.isFinished) return;

        this.StopReturnTween();
        this.isDragging = true;
        this.startTouchY = event.getUILocation().y;
        this.startProgress = this.currentProgress;

        this.onPeelStart.invoke();
    }

    private OnTouchMove(event: EventTouch): void {
        if (!this.isPeelingEnabled || this.isFinished || !this.isDragging) return;

        const currentTouchY = event.getUILocation().y;
        // In Cocos Creator UI space, +Y is UP and -Y is DOWN.
        // Dragging DOWN means startTouchY - currentTouchY > 0 -> progress moves towards END (1.0).
        // Dragging UP means startTouchY - currentTouchY < 0 -> progress moves backward towards START (0.0).
        const deltaPixels = this.startTouchY - currentTouchY;
        const deltaProgress = deltaPixels / Math.max(1, this.dragDistance);

        const newProgress = clamp01(this.startProgress + deltaProgress);

        // Reset inactivity timer and start/continue looping sound on touch move
        this.moveInactivityTimer = 0;
        this.StartPeelLoopSound();

        this.SetProgress(newProgress);

        if (this.autoFinishOnThreshold && this.currentProgress >= this.completeThreshold) {
            this.FinishPeel();
        }
    }

    private OnTouchEnd(event: EventTouch): void {
        this.StopPeelLoopSound();

        if (!this.isDragging || this.isFinished) return;
        this.isDragging = false;

        this.onPeelDragEnd.invoke();

        if (this.currentProgress >= this.completeThreshold) {
            this.FinishPeel();
        } else if (this.returnToStartOnRelease) {
            this.StartReturnTween(0);
        }
    }

    private OnTouchCancel(event: EventTouch): void {
        this.OnTouchEnd(event);
    }

    private StartReturnTween(targetProgress: number): void {
        this.StopReturnTween();

        const startProg = this.currentProgress;
        const dummy = { progress: startProg };

        this.returnTween = tween(dummy)
            .to(this.returnDuration, { progress: targetProgress }, {
                easing: 'quadOut',
                onUpdate: () => {
                    this.SetProgress(dummy.progress);
                }
            })
            .call(() => {
                this.returnTween = null;
            })
            .start();
    }

    private StopReturnTween(): void {
        if (this.returnTween) {
            this.returnTween.stop();
            this.returnTween = null;
        }
    }

    private CacheTransforms(): void {
        if (this.mask1 && this.mask1.isValid) {
            this.mask1Transform = this.mask1.getComponent(UITransform);
        }
        if (this.mask2 && this.mask2.isValid) {
            this.mask2Transform = this.mask2.getComponent(UITransform);
        }
    }

    private RegisterTouchEvents(): void {
        const target = this.maskTarget || this.node;
        if (!target || !target.isValid) return;

        target.on(Node.EventType.TOUCH_START, this.OnTouchStart, this);
        target.on(Node.EventType.TOUCH_MOVE, this.OnTouchMove, this);
        target.on(Node.EventType.TOUCH_END, this.OnTouchEnd, this);
        target.on(Node.EventType.TOUCH_CANCEL, this.OnTouchCancel, this);
    }

    private UnregisterTouchEvents(): void {
        const target = this.maskTarget || this.node;
        if (!target || !target.isValid) return;

        target.off(Node.EventType.TOUCH_START, this.OnTouchStart, this);
        target.off(Node.EventType.TOUCH_MOVE, this.OnTouchMove, this);
        target.off(Node.EventType.TOUCH_END, this.OnTouchEnd, this);
        target.off(Node.EventType.TOUCH_CANCEL, this.OnTouchCancel, this);
    }
}
