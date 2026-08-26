import { _decorator, EventTouch, Node, Sprite, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { Item } from './Item';
import { ItemMoveToTarget } from './ItemMoveToTarget';
import { ItemType } from './ItemType';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { HandTutManager } from '../../Managers/HandTutManager';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

@ccclass('LastBowl')
export class LastBowl extends Item {
    @property
    public foodCountIn: number = 0;
    @property([Item])
    spoons: Item[] = [];
    @property([Node])
    arrow : Node = null;

    @property({ type: Sprite, tooltip: 'Old plate visual to move up and fade out after the chicken is done.' })
    public oldPlate: Sprite | null = null;

    @property({ type: Sprite, tooltip: 'Old cutting-board visual to move up and fade out after the chicken is done.' })
    public oldCuttingBoard: Sprite | null = null;

    @property({ min: 0, tooltip: 'Distance the old visuals move upward.' })
    public oldVisualMoveUp: number = 100;

    @property({ min: 0, tooltip: 'Move and fade duration for the old visuals.' })
    public oldVisualTransitionDuration: number = 0.35;

    @property({ type: Node, tooltip: 'Node the player rotates after four powders have been added.' })
    public powderCompleteRotateNode: Node | null = null;

    @property({ min: 0, tooltip: 'Maximum full rotations the player can make. Set 0 for no limit.' })
    public powderCompleteRotationTurns: number = 1;

    @property({ type: [Sprite], tooltip: 'Sprites that fade out after four powders have been added.' })
    public powderCompleteFadeOutSprites: Sprite[] = [];

    @property({ type: Sprite, tooltip: 'Sprite that fades in after four powders have been added.' })
    public powderCompleteFadeInSprite: Sprite | null = null;

    @property({ tooltip: 'Set the fade-in sprite transparent when this component loads.' })
    public hideFadeInSpriteOnLoad: boolean = true;

    @property({ type: Ply_Event, tooltip: 'Invoked once when manual powder rotation reaches its required number of turns.' })
    public onPowderRotationComplete: Ply_Event = new Ply_Event();

    private isMovingToPlate = false;
    private chickenDoneHandled = false;
    private powderCompleteHandled = false;
    private isPowderRotateDragging = false;
    private powderRotationStartZ = 0;
    private powderRotationAccumulated = 0;
    private lastPowderPointerAngle = 0;
    /** 0 until the first movement; then 1 for counter-clockwise or -1 for clockwise. */
    private powderRotationDirectionSign = 0;
    private powderRotationCompleteInvoked = false;

    private readonly onMoveComplete = (): void => this.HandleMoveComplete();
    private readonly onPowderRotateTouchStart = (event: EventTouch): void => this.BeginPowderRotation(event);
    private readonly onPowderRotateTouchMove = (event: EventTouch): void => this.RotatePowderWithPointer(event);
    private readonly onPowderRotateTouchEnd = (): void => this.EndPowderRotation();

    protected onLoad(): void {
        super.onLoad();
        if (this.hideFadeInSpriteOnLoad) {
            this.SetSpriteOpacity(this.powderCompleteFadeInSprite, 0);
        }
        for (const sprite of this.GetFadeOutSprites()) {
            this.SetSpriteOpacity(sprite, 255);
        }
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    protected onDisable(): void {
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.UnbindPowderRotation();
        Ply_SoundManager.Ins?.StopFxLoop(FxType.Stirring);
        this.isMovingToPlate = false;
    }

    public AddPowder(): void {
        this.foodCountIn++;
        if (this.foodCountIn >= 4) this.HandlePowderComplete();
        Ply_SoundManager.Ins?.PlayFx(FxType.PouringSalt);

    }

    /** Call when Chicken has completed its step. */
    public AddChickenDone(): void {
        if (this.chickenDoneHandled) return;
        this.chickenDoneHandled = true;
        Ply_SoundManager.Ins?.PlayFx(FxType.FoodPlace);
        this.MoveAndFadeOldVisual(this.oldPlate);
        this.MoveAndFadeOldVisual(this.oldCuttingBoard);
        this.SetSpoonsTarget();

        if (!this.itemMoveToTarget) {
            console.warn(`[LastBowl] Assign ItemMoveToTarget on "${this.node.name}".`);
            return;
        }

        this.isMovingToPlate = true;
        this.itemMoveToTarget.ExecuteMove();
    }

    /** Makes every configured spoon target this bowl. */
    public SetSpoonsTarget(): void {
        for (const spoon of this.spoons) {
            if (!spoon?.isValid) continue;

            spoon.cacheComponents();
            if (spoon.itemDraggable) {
                spoon.itemDraggable.targetItemType = this.itemType;
            }
            if (spoon.itemMoveToTarget) {
                spoon.itemMoveToTarget.defaultTarget = this.node;
            }
            HandTutManager.Ins?.RegisterTutorialItem(spoon);
        }
    }

    private MoveAndFadeOldVisual(sprite: Sprite | null): void {
        const visual = sprite?.node;
        if (!visual?.isValid) return;

        const startPosition = visual.position.clone();
        const targetPosition = new Vec3(
            startPosition.x,
            startPosition.y + this.oldVisualMoveUp,
            startPosition.z,
        );
        Tween.stopAllByTarget(visual);
        tween(visual)
            .to(this.oldVisualTransitionDuration, { position: targetPosition }, { easing: 'quadOut' })
            .start();

        const opacity = visual.getComponent(UIOpacity) || visual.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(this.oldVisualTransitionDuration, { opacity: 0 }, { easing: 'quadOut' })
            .start();
    }

    private HandlePowderComplete(): void {
        if (this.powderCompleteHandled) return;
        this.powderCompleteHandled = true;
        if (this.arrow) this.arrow.active = true;

        this.BindPowderRotation();
        HandTutManager.Ins?.ShowLastBowlRotateHandTut(this);
    }

    private SetSpriteOpacity(sprite: Sprite | null, opacityValue: number): void {
        if (!sprite?.isValid) return;
        const color = sprite.color.clone();
        color.a = opacityValue;
        sprite.color = color;
    }

    /** Do not fade an ancestor of the fade-in sprite, or it would remain invisible. */
    private GetFadeOutSprites(): Sprite[] {
        const fadeInNode = this.powderCompleteFadeInSprite?.node;
        return this.powderCompleteFadeOutSprites.filter(sprite => {
            const fadeOutNode = sprite?.node;
            return !!fadeOutNode?.isValid
                && fadeOutNode !== fadeInNode
                && (!fadeInNode || !fadeInNode.isChildOf(fadeOutNode));
        });
    }

    private BindPowderRotation(): void {
        const rotateNode = this.powderCompleteRotateNode;
        if (!rotateNode?.isValid) return;

        this.UnbindPowderRotation();
        if (!rotateNode.getComponent(UITransform)) {
            console.warn(`[LastBowl] "${rotateNode.name}" needs a UITransform to receive rotation touches.`);
            return;
        }

        this.powderRotationStartZ = rotateNode.eulerAngles.z;
        this.powderRotationAccumulated = 0;
        this.powderRotationDirectionSign = 0;
        this.powderRotationCompleteInvoked = false;
        rotateNode.on(Node.EventType.TOUCH_START, this.onPowderRotateTouchStart, this);
        rotateNode.on(Node.EventType.TOUCH_MOVE, this.onPowderRotateTouchMove, this);
        rotateNode.on(Node.EventType.TOUCH_END, this.onPowderRotateTouchEnd, this);
        rotateNode.on(Node.EventType.TOUCH_CANCEL, this.onPowderRotateTouchEnd, this);
    }

    private UnbindPowderRotation(): void {
        const rotateNode = this.powderCompleteRotateNode;
        if (!rotateNode?.isValid) return;

        rotateNode.off(Node.EventType.TOUCH_START, this.onPowderRotateTouchStart, this);
        rotateNode.off(Node.EventType.TOUCH_MOVE, this.onPowderRotateTouchMove, this);
        rotateNode.off(Node.EventType.TOUCH_END, this.onPowderRotateTouchEnd, this);
        rotateNode.off(Node.EventType.TOUCH_CANCEL, this.onPowderRotateTouchEnd, this);
        this.isPowderRotateDragging = false;
    }

    private BeginPowderRotation(event: EventTouch): void {
        const rotateNode = this.powderCompleteRotateNode;
        if (!rotateNode?.isValid) return;

        this.isPowderRotateDragging = true;
        this.lastPowderPointerAngle = this.GetPointerAngleAroundRotateNode(event, rotateNode);
        Ply_SoundManager.Ins?.PlayFxLoop(FxType.Stirring);
    }

    private RotatePowderWithPointer(event: EventTouch): void {
        const rotateNode = this.powderCompleteRotateNode;
        if (!this.isPowderRotateDragging || !rotateNode?.isValid) return;

        const currentAngle = this.GetPointerAngleAroundRotateNode(event, rotateNode);
        let angleDelta = currentAngle - this.lastPowderPointerAngle;
        if (angleDelta > 180) angleDelta -= 360;
        if (angleDelta < -180) angleDelta += 360;
        this.lastPowderPointerAngle = currentAngle;
        if (angleDelta === 0) return;

        // The first non-zero movement chooses the rotation direction. Every
        // movement in the opposite direction is ignored for this interaction.
        if (this.powderRotationDirectionSign === 0) {
            this.powderRotationDirectionSign = angleDelta > 0 ? 1 : -1;
        }
        const directedDelta = angleDelta * this.powderRotationDirectionSign;
        if (directedDelta <= 0) return;

        const maxRotation = this.powderCompleteRotationTurns * 360;
        this.powderRotationAccumulated += directedDelta;
        if (maxRotation > 0) {
            this.powderRotationAccumulated = Math.min(maxRotation, this.powderRotationAccumulated);
        }

        const currentEuler = rotateNode.eulerAngles;
        rotateNode.setRotationFromEuler(
            currentEuler.x,
            currentEuler.y,
            this.powderRotationStartZ + this.powderRotationDirectionSign * this.powderRotationAccumulated,
        );
        this.UpdatePowderVisualFade();
        this.InvokePowderRotationCompleteIfNeeded();
    }

    private EndPowderRotation(): void {
        this.isPowderRotateDragging = false;
        Ply_SoundManager.Ins?.StopFxLoop(FxType.Stirring);
    }

    private GetPointerAngleAroundRotateNode(event: EventTouch, rotateNode: Node): number {
        const pointer = event.getUILocation();
        const center = rotateNode.worldPosition;
        return Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180 / Math.PI;
    }

    /** Fades visuals according to the player's manual rotation progress. */
    private UpdatePowderVisualFade(): void {
        // With unlimited rotation (0), visuals complete after the first full turn.
        const turnsForVisual = Math.max(1, this.powderCompleteRotationTurns);
        const progress = Math.min(1, this.powderRotationAccumulated / (turnsForVisual * 360));
        const fadeOutOpacity = Math.round(255 * (1 - progress));
        const fadeInOpacity = Math.round(255 * progress);

        for (const sprite of this.GetFadeOutSprites()) {
            this.SetSpriteOpacity(sprite, fadeOutOpacity);
        }
        this.SetSpriteOpacity(this.powderCompleteFadeInSprite, fadeInOpacity);
    }

    private InvokePowderRotationCompleteIfNeeded(): void {
        if (this.powderRotationCompleteInvoked) return;

        // With unlimited rotation (0), one full rotation completes the visual.
        const requiredDegrees = Math.max(1, this.powderCompleteRotationTurns) * 360;
        if (this.powderRotationAccumulated < requiredDegrees) return;

        this.powderRotationCompleteInvoked = true;
        HandTutManager.Ins?.RegisterCorrectAction();
        this.onPowderRotationComplete.invoke();
    }

    private HandleMoveComplete(): void {
        if (!this.isMovingToPlate) return;

        this.isMovingToPlate = false;
        this.itemType = ItemType.Plate;
        this.SetSpoonsTarget();
    }
}
