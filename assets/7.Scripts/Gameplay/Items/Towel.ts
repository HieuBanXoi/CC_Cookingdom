import { _decorator, Enum, Node, Sprite, UIOpacity, UITransform } from 'cc';
import { Item } from './Item';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Draggable towel that dries an item. Once SetTarget() handed it a target,
 * holding the dragged towel over that target fills the progress bar and fades
 * the wet nodes out over wipeDuration seconds. Progress is kept between drags;
 * when it is full the drag is stopped, the towel flies back and is locked.
 *
 * Node setup: Towel + ItemDraggable + ItemMoveToTarget (+ UITransform covering
 * the towel). The target needs a UITransform covering the area to wipe.
 */
@ccclass('Towel')
export class Towel extends Item {
    @property({ type: Sprite, tooltip: 'Progress bar sprite (Type = FILLED). Its fillRange follows the wipe progress 0 -> 1.' })
    public progressBar: Sprite | null = null;

    @property({ type: Node, tooltip: 'Node shown while the towel wipes the target (e.g. the progress bar root). Hidden again once the target is dry.' })
    public progressRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Sprite node shown before the towel has dried the target.' })
    public cleanNode: Node | null = null;

    @property({ type: Node, tooltip: 'Sprite node shown once the towel has dried the target.' })
    public wetNode: Node | null = null;

    @property({ min: 0.1, tooltip: 'Seconds the towel has to stay on the target to dry it completely.' })
    public wipeDuration = 2;

    @property({ tooltip: 'Play a sound each time the dragged towel starts touching the target.' })
    public playWipeSound = true;

    @property({ type: Enum(FxType), tooltip: 'Sound played when the towel starts touching the target.' })
    public wipeFxType: FxType = FxType.Wipe;

    @property({ type: Ply_Event, tooltip: 'Triggered once the target is completely dry.' })
    public onWipeComplete: Ply_Event = new Ply_Event();

    private targetItem: Item | null = null;
    private readonly fadeOpacities: UIOpacity[] = [];
    private onTargetDry: (() => void) | null = null;
    private progress = 0;
    private isTouchingTarget = false;
    private wipedThisDrag = false;
    private isComplete = false;

    private readonly onBeginDrag = (): void => this.OnBeginDrag();
    private readonly onDropSuccess = (): void => this.OnDropSuccess();
    private readonly onDropFail = (): void => this.OnDropFail();

    public get Progress(): number {
        return this.progress;
    }

    public get IsComplete(): boolean {
        return this.isComplete;
    }

    protected onLoad(): void {
        super.onLoad();
        this.ApplyProgress();
        this.ApplyWetSprites();
    }

    protected onEnable(): void {
        this.cacheComponents();

        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onDropFail);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
    }

    protected update(dt: number): void {
        if (this.isComplete || !this.targetItem?.isValid) return;
        if (!this.itemDraggable?.IsDragging) return;

        const isTouching = this.IsOverlappingTarget();
        if (isTouching && !this.isTouchingTarget && this.playWipeSound) {
            Ply_SoundManager.Ins?.PlayFx(this.wipeFxType);
        }
        this.isTouchingTarget = isTouching;
        if (!isTouching) return;

        this.wipedThisDrag = true;
        if (this.progressRoot?.isValid && !this.progressRoot.active) this.progressRoot.active = true;
        this.progress = Math.min(1, this.progress + dt / this.wipeDuration);
        this.ApplyProgress();
        if (this.progress >= 1) this.Complete();
    }

    /**
     * Lets the towel be dragged onto target and wipe it. fadeNodes are faded
     * out with the progress; onDry is called once the target is completely dry.
     */
    public SetTarget(target: Node, fadeNodes: Node[] = [], onDry: (() => void) | null = null): void {
        this.cacheComponents();
        const targetItem = target?.isValid ? target.getComponent(Item) : null;
        if (!targetItem || !this.itemDraggable || !this.itemMoveToTarget) {
            console.warn(`[Towel] Target Item or ItemDraggable / ItemMoveToTarget missing on "${this.node.name}".`);
            return;
        }

        this.targetItem = targetItem;
        this.onTargetDry = onDry;
        this.fadeOpacities.length = 0;
        for (const fadeNode of fadeNodes) {
            if (!fadeNode?.isValid) continue;
            fadeNode.active = true;
            this.fadeOpacities.push(fadeNode.getComponent(UIOpacity) ?? fadeNode.addComponent(UIOpacity));
        }

        this.progress = 0;
        this.isComplete = false;
        this.isDone = false;
        this.ApplyProgress();
        this.ApplyWetSprites();

        this.itemDraggable.SetTargetItemType(target);
        this.EnableItemDraggable();
    }

    private OnBeginDrag(): void {
        this.isTouchingTarget = false;
        this.wipedThisDrag = false;
    }

    /** Released over the target before it is dry: keep the progress and fly back. */
    private OnDropSuccess(): void {
        this.itemDraggable?.ReturnToStartWithoutHeart();
    }

    /** Released elsewhere: no break heart if the towel did wipe during this drag. */
    private OnDropFail(): void {
        if (this.wipedThisDrag) this.itemDraggable?.MarkCurrentDropFailHandled();
    }

    private IsOverlappingTarget(): boolean {
        const myTransform = this.getComponent(UITransform);
        const targetTransform = this.targetItem?.getComponent(UITransform);
        if (!myTransform || !targetTransform || !this.targetItem.node.activeInHierarchy) return false;
        return myTransform.getBoundingBoxToWorld().intersects(targetTransform.getBoundingBoxToWorld());
    }

    private ApplyProgress(): void {
        if (this.progressBar?.isValid) this.progressBar.fillRange = this.progress;
        const opacity = Math.round(255 * (1 - this.progress));
        for (const fade of this.fadeOpacities) {
            if (fade?.isValid) fade.opacity = opacity;
        }
    }

    /** Clean sprite until the target is dry, wet sprite afterwards. */
    private ApplyWetSprites(): void {
        if (this.cleanNode?.isValid) this.cleanNode.active = !this.isComplete;
        if (this.wetNode?.isValid) this.wetNode.active = this.isComplete;
    }

    private Complete(): void {
        this.isComplete = true;
        this.isTouchingTarget = false;
        this.ApplyWetSprites();
        for (const fade of this.fadeOpacities) {
            if (fade?.isValid) fade.node.active = false;
        }
        if (this.progressRoot?.isValid) this.progressRoot.active = false;

        // Stop the drag without a drop evaluation, fly back and lock the towel.
        this.itemDraggable?.CancelDragForInputLock();
        this.DisableItemDraggable();
        this.ItemDone();

        // The dried target sparkles, like InWaterItem once it is clean.
        if (this.targetItem?.isValid) this.targetItem.SpawnBlinkEffect();

        const onDry = this.onTargetDry;
        this.onTargetDry = null;
        this.targetItem = null;
        onDry?.();
        this.onWipeComplete.invoke();
    }
}
