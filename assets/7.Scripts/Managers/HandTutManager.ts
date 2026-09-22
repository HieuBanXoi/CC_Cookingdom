import { _decorator, Enum, input, Input, Node, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { Item, HandTutHint } from '../Gameplay/Items/Item';
import { ItemStirring } from '../Gameplay/Items/ItemStirring';
import { ItemDragRaycastTarget } from '../Gameplay/Items/ItemDragRaycastTarget';
import { InWaterItem } from '../Gameplay/Items/InWaterItem';
import { SinkBlock } from '../Gameplay/Items/SinkBlock';
import { SinkButton } from '../Gameplay/Items/SinkButton';
import { PlasticPeeler } from '../Gameplay/Items/PlasticPeeler';
import { LastBowl } from '../Gameplay/Items/LastBowl';
import { PaperBox } from '../Gameplay/Items/PaperBox';
import { Ply_Singleton } from '../Core/Base/Ply_Singleton';
import { ComponentCache } from '../Core/Base/CacheComponent';
import { InputManager } from './InputManager';
import { GameManager } from './GameManager';
import { ItemType } from '../Gameplay/Items/ItemType';

const { ccclass, property } = _decorator;

export enum TypeHind {
    None = 0,
    Click,
    Drag,
    Stir,
}
Enum(TypeHind);

/**
 * Idle guidance for the currently playable cooking action.
 *
 * Add this component to a manager node, then assign a hand node under the
 * Canvas and the ordered list of tutorial items in the Inspector.
 */
@ccclass('HandTutManager')
export class HandTutManager extends Ply_Singleton<HandTutManager> {
    @property({ type: [Item], tooltip: 'Items in priority order.' })
    public items: Item[] = [];

    @property({ type: SinkBlock, tooltip: 'Drain block guided before sink-water items can be processed.' })
    public sinkBlock: SinkBlock | null = null;

    @property({ type: SinkButton, tooltip: 'Water button guided after the drain block is in place.' })
    public sinkButton: SinkButton | null = null;

    @property({ type: [InWaterItem], tooltip: 'Items currently waiting in the sink. Updated automatically by InWaterItem.' })
    public itemsInWater: InWaterItem[] = [];

    @property({ type: PlasticPeeler, tooltip: 'PlasticPeeler reference for plastic peeling guidance.' })
    public plasticPeeler: PlasticPeeler | null = null;

    @property({ tooltip: 'Relative start Y offset from maskTarget for plastic peel tutorial' })
    public plasticPeelStartY: number = 200;

    @property({ tooltip: 'Relative end Y offset from maskTarget for plastic peel tutorial' })
    public plasticPeelEndY: number = -200;

    @property({ type: LastBowl, tooltip: 'LastBowl reference for powder rotation guidance.' })
    public lastBowl: LastBowl | null = null;

    @property({ type: PaperBox, tooltip: 'Paper box guided (box -> wet food) whenever a food of its wipe type is waiting. Found in the scene when empty.' })
    public paperBox: PaperBox | null = null;

    @property({ min: 10, tooltip: 'Radius for the LastBowl rotation hand tutorial gesture in pixels.' })
    public lastBowlRotateRadius: number = 80;

    @property({ tooltip: 'Show sink block/button guidance before regular item guidance at the start.' })
    public showSinkWaterTutorialOnStart = true;

    @property(Node)
    public handNode: Node = null!;

    @property({ tooltip: 'Wait for StartHandTut() instead of beginning automatically.' })
    public waitForStartSignal = false;

    @property({ min: 0 }) public idleDelay = 5;
    @property({ min: 0 }) public firstHandTutDelay = 5;
    @property({ min: 0 }) public shortIdleDelay = 0.5;
    @property({ min: 0, tooltip: 'The first N distinct steps (items) are hinted after shortIdleDelay; re-showing the same step does not count. Set 0 to rely on noDelayItems only.' }) public noDelayItemCount = 3;
    @property({ type: [Item], tooltip: 'Items always hinted after shortIdleDelay (every step of them: e.g. the first fish, the basket, the first food in the basket). Other items wait idleDelay. A hint whose related item (knife -> food, paper box -> wet food) is in this list is fast too.' })
    public noDelayItems: Item[] = [];
    @property({ tooltip: 'The first InWaterItem the player drops into the sink becomes the only no-delay InWaterItem, whichever fish it is.' })
    public noDelayFirstInWaterItem = true;
    @property({ tooltip: 'An InWaterItem stops being no-delay once it has landed on its plate (its knife / paper / trash hints go back to the normal delay).' })
    public noDelayInWaterItemUntilPlate = true;
    @property({ min: 0 }) public breakHeartNoDelayThreshold = 3;
    @property({ min: 0 }) public maxHandTutShowCount = 0;

    @property({ min: 0.01 }) public moveDuration = 1.2;
    @property({ min: 0.01, tooltip: 'Fade duration after the drag hand reaches its target.' }) public dragFadeDuration = 0.25;
    @property({ min: 0.01 }) public clickScaleDuration = 0.35;
    @property({ min: 0 }) public waitAtEndDuration = 0.2;
    @property public clickScaleMultiplier = 1.25;

    @property({type:Item})
    public currentItemHandTut: Item | null = null;

    @property({ type: Enum(TypeHind), readonly: true })
    public TypeHind: TypeHind = TypeHind.None;

    private idleTimer = 0;
    private isStarted = false;
    private isPaused = false;
    private isPointerDown = false;
    private isGameplayDragging = false;
    private shownCount = 0;
    private lastCountedSubject: object | string | null = null;
    private hasShownFirstHint = false;
    private consecutiveDropFails = 0;
    private forceNoDelay = false;
    private handDefaultScale = new Vec3(1, 1, 1);
    private handDefaultAlpha = 255;
    private handOpacity: UIOpacity | null = null;
    private currentHintToken = 0;
    private activeAuxTween: Tween<object> | null = null;
    private activeFadeTween: Tween<UIOpacity> | null = null;
    private boundItems = new Set<Item>();
    /** When set, only these items may be hinted (e.g. squid + knife before the zoom). */
    private allowedItems: Set<Item> | null = null;
    private boundPlasticPeelers = new Set<PlasticPeeler>();
    private boundLastBowls = new Set<LastBowl>();
    private isWaitingInitialSinkWaterTutorial = false;
    /** Runtime copy of noDelayItems (the first InWaterItem in the sink may replace the configured fish). */
    private readonly noDelaySet = new Set<Item>();
    private firstInWaterItem: InWaterItem | null = null;
    private firstInWaterItemOnBoard: InWaterItem | null = null;
    /** One no-delay item per group ("fish", "basket-food"...): registering another replaces the previous one. */
    private readonly noDelayGroups = new Map<string, Item>();

    protected onLoad(): void {
        super.onLoad();
        // Seed the runtime set here (not in start): items register themselves
        // from their own start(), which may run before this manager's.
        for (const item of this.noDelayItems) {
            if (item?.isValid) this.noDelaySet.add(item);
        }
        if (this.handNode) {
            Vec3.copy(this.handDefaultScale, this.handNode.scale);
            this.handOpacity = this.handNode.getComponentInChildren(UIOpacity);
            this.handDefaultAlpha = this.handOpacity?.opacity ?? 255;
            this.handNode.active = false;
        }

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected start(): void {
        this.plasticPeeler ??= this.node.scene?.getComponentInChildren(PlasticPeeler) || null;
        this.lastBowl ??= this.node.scene?.getComponentInChildren(LastBowl) || null;
        this.paperBox ??= this.node.scene?.getComponentInChildren(PaperBox) || null;
        this.bindConfiguredItems();
        this.isStarted = !this.waitForStartSignal;
        this.isWaitingInitialSinkWaterTutorial = this.showSinkWaterTutorialOnStart;
    }

    protected update(deltaTime: number): void {
        this.removeCompletedItems();
        this.releasePlatedNoDelayItems();
        if (!this.isStarted || this.isPaused || !this.handNode) return;

        // A phase can deactivate an item while its hint is already playing, or
        // the item can finish its step through input this manager never sees
        // (custom gestures on child nodes). Re-validate the shown item every
        // frame so the hand never points to content that is no longer actionable.
        if (this.currentItemHandTut
            && (!this.currentItemHandTut.node.activeInHierarchy || this.currentItemHandTut.isDone
                || !this.isAllowed(this.currentItemHandTut)
                || !this.canShowTutorialForItem(this.currentItemHandTut))) {
            this.hideHandTut();
            this.resetIdleTimer();
            return;
        }

        // Use InputManager as the source of truth as well as the local events.
        // Some drag tools are added at runtime and may not be in `items`, so
        // they do not necessarily have an onBeginDrag listener here.
        // Also stay quiet while gameplay input is locked (an item is flying to
        // its target, a zoom is playing...): a hint then would point at an item
        // the player cannot touch yet, and could linger after it moved away.
        const inputLocked = !!GameManager.Ins && !GameManager.Ins.IsPlaying();
        if (this.isPointerDown || this.isGameplayDragging || InputManager.Ins?.isDragging || inputLocked) {
            this.resetIdleTimer();
            this.hideHandTut();
            return;
        }

        this.idleTimer += deltaTime;
        if (!this.handNode.active && this.idleTimer >= this.getCurrentDelay()) {
            this.idleTimer = 0;
            this.showNextHandTut();
        }
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.hideHandTut();
    }

    public StartHandTut(): void {
        this.isPaused = false;
        this.isStarted = true;
        this.resetIdleTimer();
    }

    public StartHandTutNoDelay(): void {
        this.forceNoDelay = true;
        this.StartHandTut();
    }

    /** Stops the idle timer and hides the current hint during a phase transition. */
    public PauseHandTut(): void {
        this.isPaused = true;
        this.isPointerDown = false;
        this.isGameplayDragging = false;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    /** Marks the Item on this node (or one of its parents) as tutorial-complete. */
    public ItemDone(node: Node): void {
        const item = ComponentCache.get(node, Item) || node.getComponent(Item);
        if (!item) return;

        const index = this.items.indexOf(item);
        if (index >= 0) this.items.splice(index, 1);
        this.RegisterCorrectAction();
    }

    public RegisterCorrectAction(): void {
        this.isGameplayDragging = false;
        this.consecutiveDropFails = 0;
        this.forceNoDelay = false;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    public RegisterBreakHeartDropFail(): void {
        this.isGameplayDragging = false;
        this.consecutiveDropFails++;
        if (this.consecutiveDropFails >= this.breakHeartNoDelayThreshold) {
            this.forceNoDelay = true;
            this.resetIdleTimer();
        }
    }

    /**
     * Restricts hints to the given items until ClearRestriction() is called.
     * Items outside the set are skipped even when they are otherwise ready.
     */
    public RestrictTo(items: (Item | null | undefined)[]): void {
        this.allowedItems = new Set(items.filter((item): item is Item => !!item && item.isValid));
        if (this.currentItemHandTut && !this.allowedItems.has(this.currentItemHandTut)) {
            this.hideHandTut();
            this.resetIdleTimer();
        }
    }

    public ClearRestriction(): void {
        if (!this.allowedItems) return;
        this.allowedItems = null;
        this.resetIdleTimer();
    }

    private isAllowed(item: Item): boolean {
        return !this.allowedItems || this.allowedItems.has(item);
    }

    /** Adds an item to the tutorial queue at runtime and requests a fast hint. */
    public RegisterTutorialItem(item: Item): void {
        if (!item || !item.isValid) return;

        if (!this.items.includes(item)) {
            this.items.push(item);
        }
        this.bindConfiguredItems();
        this.forceNoDelay = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    /** Called by InWaterItem immediately after it arrives in the sink. */
    public RegisterItemInWater(item: InWaterItem): void {
        if (!item || this.itemsInWater.includes(item)) return;

        this.itemsInWater.push(item);

        // The fish the player picked first is the one guided quickly; the
        // configured fish (if another) goes back to the normal delay.
        if (!this.firstInWaterItem) {
            this.firstInWaterItem = item;
            if (this.noDelayFirstInWaterItem) {
                for (const noDelayItem of Array.from(this.noDelaySet)) {
                    if (noDelayItem instanceof InWaterItem && noDelayItem !== item) this.noDelaySet.delete(noDelayItem);
                }
                this.noDelaySet.add(item);
            }
        }

        // Only a no-delay fish pulls the next hint (sink block / water button) in fast.
        if (this.noDelaySet.has(item)) this.forceNoDelay = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    /** A no-delay fish is guided quickly only up to its plate; after landing it is a normal item. */
    private releasePlatedNoDelayItems(): void {
        if (!this.noDelayInWaterItemUntilPlate || this.noDelaySet.size === 0) return;
        for (const item of Array.from(this.noDelaySet)) {
            if (!item?.isValid) {
                this.noDelaySet.delete(item);
            } else if (item instanceof InWaterItem && item.isOnPlate) {
                this.noDelaySet.delete(item);
            }
        }
    }

    /** Marks an item as no-delay at runtime (bindable through a node param). */
    public AddNoDelayItem(node: Node): void {
        const item = ComponentCache.get(node, Item) || node.getComponent(Item);
        if (item) this.noDelaySet.add(item);
    }

    /**
     * Marks an item as no-delay. With a group, only one item of that group is
     * no-delay at a time: the newcomer replaces the one registered before
     * (e.g. the provisional first basket food -> the food that really reached
     * the board first).
     */
    public RegisterNoDelayItem(item: Item | null, group?: string): void {
        if (!item?.isValid) return;

        if (group) {
            const previous = this.noDelayGroups.get(group);
            if (previous && previous !== item) this.noDelaySet.delete(previous);
            this.noDelayGroups.set(group, item);
        }
        this.noDelaySet.add(item);
    }

    /** Called by InWaterItem when it lands on the cutting board: the first one becomes the no-delay fish. */
    public RegisterInWaterItemOnBoard(item: InWaterItem): void {
        if (!item?.isValid || this.firstInWaterItemOnBoard) return;
        this.firstInWaterItemOnBoard = item;
        if (!this.noDelayFirstInWaterItem) return;

        // The fish the player got to the board first is the guided one; any
        // other fish (configured or picked up in the sink) drops out.
        for (const noDelayItem of Array.from(this.noDelaySet)) {
            if (noDelayItem instanceof InWaterItem && noDelayItem !== item) this.noDelaySet.delete(noDelayItem);
        }
        this.noDelaySet.add(item);
    }

    public RemoveNoDelayItem(node: Node): void {
        const item = ComponentCache.get(node, Item) || node.getComponent(Item);
        if (item) this.noDelaySet.delete(item);
    }

    public UnregisterItemInWater(item: InWaterItem): void {
        const index = this.itemsInWater.indexOf(item);
        if (index >= 0) this.itemsInWater.splice(index, 1);
    }

    /** SinkBlock calls this after it has moved to its new position. */
    public SinkBlockMoveDone(sinkBlock: SinkBlock): void {
        if (this.sinkBlock && sinkBlock !== this.sinkBlock) return;
        if (!this.isWaitingInitialSinkWaterTutorial && !this.hasInWaterItemNeedingHandTut()) return;

        this.forceNoDelay = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    /** SinkButton calls this after the configured faucet has been turned on. */
    public WaterToggleDone(sinkButton: SinkButton): void {
        if (this.sinkButton && sinkButton !== this.sinkButton) return;

        this.isWaitingInitialSinkWaterTutorial = false;
        this.RegisterCorrectAction();
    }

    /**
     * Shows drag hand tutorial for PlasticPeeler (dragging down to peel plastic wrap).
     * When called manually (e.g. from event/code), it sets the active peeler and waits for idleDelay unless noDelay is true.
     */
    public ShowPlasticPeelerHandTut(peeler?: PlasticPeeler | null, noDelay: boolean = false): void {
        const targetPeeler = peeler || this.plasticPeeler;
        if (!targetPeeler || !targetPeeler.node.activeInHierarchy || targetPeeler.GetProgress() >= 1) return;

        this.plasticPeeler = targetPeeler;
        this.bindPlasticPeeler(targetPeeler);

        if (!noDelay) {
            this.hideHandTut();
            this.resetIdleTimer();
            return;
        }

        const baseNode = targetPeeler.maskTarget || targetPeeler.node;
        const basePos = baseNode.worldPosition.clone();

        const startPos = new Vec3(basePos.x, basePos.y + this.plasticPeelStartY, basePos.z);
        const endPos = new Vec3(basePos.x, basePos.y + this.plasticPeelEndY, basePos.z);

        this.playMoveHint(startPos, endPos);
        this.currentItemHandTut = null;
        this.countStep(targetPeeler ?? 'plastic-peeler');
        this.TypeHind = TypeHind.Drag;
    }

    /**
     * Shows circular rotation/stirring hand tutorial for LastBowl (rotating powder mix).
     * When called manually (e.g. from LastBowl.HandlePowderComplete()), it sets the active bowl and waits for idleDelay unless noDelay is true.
     */
    public ShowLastBowlRotateHandTut(lastBowlTarget?: LastBowl | null, noDelay: boolean = false): void {
        const targetLastBowl = lastBowlTarget || this.lastBowl;
        if (!targetLastBowl || !targetLastBowl.node.activeInHierarchy) return;

        this.lastBowl = targetLastBowl;
        this.bindLastBowl(targetLastBowl);

        if (!noDelay) {
            this.hideHandTut();
            this.resetIdleTimer();
            return;
        }

        const rotateNode = targetLastBowl.powderCompleteRotateNode || targetLastBowl.node;
        const centerPos = rotateNode.worldPosition.clone();
        const radius = this.lastBowlRotateRadius || 80;

        this.playCircularRotationHint(centerPos, radius);
        this.setCurrentItemHandTut(targetLastBowl);
        this.TypeHind = TypeHind.Stir;
    }

    /** Alias for ShowLastBowlRotateHandTut. */
    public ShowLastBowlHandTut(lastBowlTarget?: LastBowl | null, noDelay: boolean = false): void {
        this.ShowLastBowlRotateHandTut(lastBowlTarget, noDelay);
    }

    private onTouchStart(): void {
        if (this.isPaused) return;
        this.isPointerDown = true;
        if (!this.isStarted) this.StartHandTut();
        this.hideHandTut();
        this.resetIdleTimer();
    }

    private onTouchEnd(): void {
        this.isPointerDown = false;
        this.isGameplayDragging = false;
        this.resetIdleTimer();
    }

    private bindConfiguredItems(): void {
        for (const item of this.items) {
            if (!item || this.boundItems.has(item)) continue;
            this.boundItems.add(item);
            item.itemClickable?.onClick.addListener(() => this.RegisterCorrectAction());
            item.itemDraggable?.onBeginDrag.addListener(() => this.OnGameplayDragBegin());
            item.itemDraggable?.onDropSuccess.addListener(() => this.RegisterCorrectAction());
            item.itemDraggable?.onDropFail.addListener(() => this.RegisterBreakHeartDropFail());
            item.itemStirring?.onStirComplete.addListener(() => this.RegisterCorrectAction());
        }
        if (this.plasticPeeler) this.bindPlasticPeeler(this.plasticPeeler);
        if (this.lastBowl) this.bindLastBowl(this.lastBowl);
        if (this.paperBox && !this.boundItems.has(this.paperBox)) {
            this.boundItems.add(this.paperBox);
            this.paperBox.itemClickable?.onClick.addListener(() => this.RegisterCorrectAction());
        }
    }

    /** The box is guided as soon as something of its wipe type is waiting (a wet fish on the board). */
    private isPaperBoxReady(): boolean {
        const box = this.paperBox;
        if (!box || !box.isValid || !box.enabled || box.isDone || !box.node.activeInHierarchy) return false;
        if (!this.isAllowed(box)) return false;
        return !!box.GetHandTutHint();
    }

    private showPaperBoxHandTut(): boolean {
        const hint = this.isPaperBoxReady() ? this.paperBox!.GetHandTutHint() : null;
        if (!hint) return false;

        this.playCustomHint(hint);
        this.setCurrentItemHandTut(this.paperBox!);
        return true;
    }

    private bindPlasticPeeler(peeler: PlasticPeeler): void {
        if (!peeler || this.boundPlasticPeelers.has(peeler)) return;
        this.boundPlasticPeelers.add(peeler);
        peeler.onPeelStart.addListener(() => this.OnGameplayDragBegin());
        peeler.onPeelDragEnd.addListener(() => this.OnGameplayDragEnd());
        peeler.onPeelComplete.addListener(() => this.RegisterCorrectAction());
    }

    private bindLastBowl(lastBowl: LastBowl): void {
        if (!lastBowl || this.boundLastBowls.has(lastBowl)) return;
        this.boundLastBowls.add(lastBowl);

        const rotateNode = lastBowl.powderCompleteRotateNode;
        if (rotateNode && rotateNode.isValid) {
            rotateNode.on(Node.EventType.TOUCH_START, () => this.OnGameplayDragBegin(), this);
        }
        lastBowl.onPowderRotationComplete.addListener(() => this.RegisterCorrectAction());
    }

    public OnGameplayDragBegin(): void {
        this.isGameplayDragging = true;
        this.hideHandTut();
        this.resetIdleTimer();
    }

    public OnGameplayDragEnd(): void {
        this.isPointerDown = false;
        this.isGameplayDragging = false;
        this.resetIdleTimer();
    }

    private isPlasticPeelerReady(peeler: PlasticPeeler | null): boolean {
        const targetPeeler = peeler || this.plasticPeeler;
        return !!targetPeeler && targetPeeler.node.activeInHierarchy && targetPeeler.enabled && targetPeeler.GetProgress() < 1;
    }

    private showNextHandTut(): void {
        if (!this.canShowMore()) {
            this.currentItemHandTut = null;
            return;
        }
        this.bindConfiguredItems();

        if (this.isWaitingInitialSinkWaterTutorial) {
            if (this.showSinkWaterHandTut(false)) return;
            this.isWaitingInitialSinkWaterTutorial = false;
        }

        // Priority 1: If PlasticPeeler is active on cutting board and not yet peeled, guide peeling plastic wrap
        if (this.isPlasticPeelerReady(this.plasticPeeler)) {
            this.ShowPlasticPeelerHandTut(this.plasticPeeler, true);
            return;
        }

        // Priority 2: a wet food on the board needs a paper -> take one out of the box.
        if (this.showPaperBoxHandTut()) return;

        const item = this.getFirstTutorialReadyItem();
        if (!item) {
            if (this.lastBowl && this.lastBowl.node.activeInHierarchy && this.lastBowl.foodCountIn >= 4 && !this.lastBowl.isDone) {
                this.ShowLastBowlRotateHandTut(this.lastBowl, true);
                return;
            }

            if (this.showSinkWaterHandTut(true)) return;
            this.currentItemHandTut = null;
            return;
        }

        // Items with a custom gesture describe their own hint.
        const customHint = item.GetHandTutHint();
        if (customHint) {
            this.playCustomHint(customHint);
            this.setCurrentItemHandTut(item);
            return;
        }

        const dragRaycastTarget = item.getComponent(ItemDragRaycastTarget);
        const raycastDefaultTarget = item.itemMoveToTarget?.defaultTarget;
        if (dragRaycastTarget && this.isDraggableReady(item) && raycastDefaultTarget?.isValid) {
            // This interaction changes its accepted ItemType dynamically while
            // dragging, so the hint must always use its configured default target.
            this.playMoveHint(item.node, raycastDefaultTarget);
            this.setCurrentItemHandTut(item);
            this.TypeHind = TypeHind.Drag;
        } else if (this.isClickableReady(item)) {
            this.playClickHint(item.node);
            this.setCurrentItemHandTut(item);
            this.TypeHind = TypeHind.Click;
        } else if (this.isDraggableReady(item) && this.hasValidDragTarget(item)) {
            this.playMoveHint(item.node, item.itemMoveToTarget!.defaultTarget);
            this.setCurrentItemHandTut(item);
            this.TypeHind = TypeHind.Drag;
        } else if (this.isStirringReady(item)) {
            this.playStirringHint(item.itemStirring!);
            this.setCurrentItemHandTut(item);
            this.TypeHind = TypeHind.Stir;
        }
    }

    private getFirstTutorialReadyItem(): Item | null {
        // Current processing items always have priority, while retaining the
        // Inspector list order and skipping invalid entries.
        for (const item of this.items) {
            if (!item?.onProcess || !this.isAllowed(item) || !this.canShowTutorialForItem(item)) continue;
            return item;
        }

        // If nothing is currently processing, fall back to the ordered list.
        for (const item of this.items) {
            if (!item || !this.isAllowed(item) || !this.canShowTutorialForItem(item)) continue;
            return item;
        }

        return null;
    }

    /** Sink setup always has priority over items currently inside the water. */
    private showSinkWaterHandTut(requireInWaterItem: boolean): boolean {
        if (requireInWaterItem && !this.hasInWaterItemNeedingHandTut()) return false;

        if (this.sinkBlock && this.sinkBlock.node.activeInHierarchy && !this.sinkBlock.IsInside) {
            const target = this.sinkBlock.insideDefaultTarget;
            if (target?.isValid && this.sinkBlock.itemDraggable?.CanDrag()) {
                this.playMoveHint(this.sinkBlock.node, target);
                this.setCurrentItemHandTut(this.sinkBlock);
                this.TypeHind = TypeHind.Drag;
                return true;
            }
        }

        if (this.shouldShowWaterToggleHandTut()) {
            this.playClickHint(this.sinkButton!.node);
            this.currentItemHandTut = null;
            this.countStep(this.sinkButton!);
            this.TypeHind = TypeHind.Click;
            return true;
        }

        return false;
    }

    private hasInWaterItemNeedingHandTut(): boolean {
        for (let i = this.itemsInWater.length - 1; i >= 0; i--) {
            const item = this.itemsInWater[i];
            if (!item || !item.isValid || item.isDone || !item.isInWater || item.isOnPlate || !item.node.activeInHierarchy) {
                this.itemsInWater.splice(i, 1);
                continue;
            }
            return true;
        }
        return false;
    }

    private shouldShowWaterToggleHandTut(): boolean {
        const button = this.sinkButton;
        if (!button || !button.node.activeInHierarchy || !button.enabled) return false;
        const sink = button.sink || this.sinkBlock?.sink;
        return !sink || !sink.isWaterDrop;
    }

    private canShowTutorialForItem(item: Item): boolean {
        if (!item || item.isDone || !item.node.activeInHierarchy) return false;
        if (!item.CanShowHandTut()) return false;
        if (item.GetHandTutHint()) return true;

        const hasDragRaycastTarget = !!item.getComponent(ItemDragRaycastTarget);

        // Draggable items with no target type are normally not tutorial
        // candidates. ItemDragRaycastTarget is the exception: it chooses the
        // accepted type during the drag, but still needs a default-target hint.
        if (item.itemDraggable?.enabled
            && item.itemDraggable.targetItemType === ItemType.None
            && !hasDragRaycastTarget) {
            return false;
        }

        return this.isClickableReady(item)
            || (hasDragRaycastTarget && this.isDraggableReady(item) && !!item.itemMoveToTarget?.defaultTarget?.isValid)
            || (this.isDraggableReady(item) && this.hasValidDragTarget(item))
            || this.isStirringReady(item);
    }

    private isClickableReady(item: Item): boolean {
        return !!item.itemClickable?.enabled && item.itemClickable.canClick;
    }

    private isDraggableReady(item: Item): boolean {
        return !!item.itemDraggable?.enabled && item.itemDraggable.CanDrag();
    }

    /** Validates the configured drag target, including optional type matching. */
    private hasValidDragTarget(item: Item): boolean {
        const target = item.itemMoveToTarget?.defaultTarget;
        const draggable = item.itemDraggable;
        if (!target || !target.isValid || !draggable) return false;
        if (!item.requireMatchingTargetTypeForHandTut) return true;

        // The default target may be a landing point inside the real drop
        // target (e.g. a point on a plate), so look for the Item upwards.
        const targetItem = this.findItemInParents(target);
        return !!targetItem && targetItem.itemType === draggable.targetItemType;
    }

    private findItemInParents(node: Node | null): Item | null {
        let current: Node | null = node;
        while (current) {
            const item = current.getComponent(Item);
            if (item) return item;
            current = current.parent;
        }
        return null;
    }

    private playCustomHint(hint: HandTutHint): void {
        switch (hint.kind) {
            case 'click':
                if (hint.from) this.playClickHintAt(hint.from);
                this.TypeHind = TypeHind.Click;
                break;
            case 'drag':
                if (hint.from && hint.to) this.playMoveHint(hint.from, hint.to);
                this.TypeHind = TypeHind.Drag;
                break;
            case 'path':
                if (hint.path && hint.path.length >= 2) this.playMovePathPositions(hint.path);
                this.TypeHind = TypeHind.Drag;
                break;
        }
    }

    private isStirringReady(item: Item): boolean {
        return !!item.itemStirring?.enabled && !item.itemStirring.IsDone;
    }

    private playClickHint(target: Node): void {
        this.playClickHintAt(target.worldPosition);
    }

    private playClickHintAt(position: Vec3): void {
        const token = this.prepareHand(position);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            tween(this.handNode)
                .to(this.clickScaleDuration, { scale: this.handDefaultScale.clone().multiplyScalar(this.clickScaleMultiplier) }, { easing: 'sineOut' })
                .to(this.clickScaleDuration, { scale: this.handDefaultScale }, { easing: 'sineIn' })
                .delay(this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private playMoveHint(start: Node | Vec3, end: Node | Vec3, durationMultiplier = 1): void {
        const startPosition = start instanceof Node ? start.worldPosition.clone() : start.clone();
        const endPosition = end instanceof Node ? end.worldPosition.clone() : end.clone();
        const token = this.prepareHand(startPosition);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            this.handNode.setWorldPosition(startPosition);
            this.setHandAlpha(this.handDefaultAlpha);
            tween(this.handNode)
                .to(this.moveDuration * durationMultiplier, { worldPosition: endPosition }, { easing: 'sineInOut' })
                .call(() => this.fadeHandAfterDrag())
                .delay(this.dragFadeDuration + this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    /** Generic free-drag hint retained for future tools. */
    private playFreeDragHint(tool: Item, food: Node): void {
        const start = tool.node.worldPosition.clone();
        const center = food.worldPosition.clone();
        const transform = food.getComponent(UITransform) ?? food.getComponentInChildren(UITransform);
        const halfStroke = Math.max(100, (transform?.width ?? 0) * 0.3);
        const left = new Vec3(center.x - halfStroke, center.y, center.z);
        const right = new Vec3(center.x + halfStroke, center.y, center.z);
        const totalDuration = this.moveDuration * 1.65;
        const token = this.prepareHand(start);

        const loop = (): void => {
            if (!this.isHintCurrent(token)) return;
            this.handNode.setWorldPosition(start);
            this.setHandAlpha(this.handDefaultAlpha);
            tween(this.handNode)
                .to(totalDuration * 0.35, { worldPosition: left }, { easing: 'sineInOut' })
                // Left → right is the first pass; right → left is the second.
                .to(totalDuration * 0.325, { worldPosition: right }, { easing: 'sineInOut' })
                .to(totalDuration * 0.325, { worldPosition: left }, { easing: 'sineInOut' })
                .call(() => this.fadeHandAfterDrag())
                .delay(this.dragFadeDuration + this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    /** Plays a multi-step drag route, used for Spoon → seasoning → FoodOil. */
    private playMovePathHint(nodes: Node[], durationMultiplier = 1): void {
        const positions = nodes.filter(node => !!node?.isValid).map(node => node.worldPosition.clone());
        this.playMovePathPositions(positions, durationMultiplier);
    }

    private playMovePathPositions(positions: Vec3[], durationMultiplier = 1): void {
        if (positions.length < 2) return;
        const token = this.prepareHand(positions[0]);
        const loop = (): void => {
            if (!this.isHintCurrent(token)) return;
            this.handNode.setWorldPosition(positions[0]);
            this.setHandAlpha(this.handDefaultAlpha);
            let sequence = tween(this.handNode);
            const duration = (this.moveDuration * durationMultiplier) / (positions.length - 1);
            for (let index = 1; index < positions.length; index++) {
                sequence = sequence.to(duration, { worldPosition: positions[index] }, { easing: 'sineInOut' });
            }
            sequence
                .call(() => this.fadeHandAfterDrag())
                .delay(this.dragFadeDuration + this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private playStirringHint(stirring: ItemStirring): void {
        const center = (stirring.centerPoint ?? stirring.node).worldPosition.clone();
        const radius = Math.max(1, stirring.stirRadius);
        const start = new Vec3(center.x + radius, center.y, center.z);
        const token = this.prepareHand(start);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            const state = { angle: 0 };
            this.activeAuxTween = tween(state)
                .to(this.moveDuration, { angle: Math.PI * 2 }, {
                    onUpdate: value => {
                        const angle = (value as { angle: number }).angle;
                        this.handNode.setWorldPosition(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z);
                    },
                })
                .delay(this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private playCircularRotationHint(center: Vec3, radius: number): void {
        const start = new Vec3(center.x + radius, center.y, center.z);
        const token = this.prepareHand(start);
        const loop = () => {
            if (!this.isHintCurrent(token)) return;
            const state = { angle: 0 };
            this.activeAuxTween = tween(state)
                .to(this.moveDuration, { angle: Math.PI * 2 }, {
                    onUpdate: value => {
                        const angle = (value as { angle: number }).angle;
                        this.handNode.setWorldPosition(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z);
                    },
                })
                .delay(this.waitAtEndDuration)
                .call(loop)
                .start();
        };
        loop();
    }

    private prepareHand(position: Vec3): number {
        this.hideHandTut();
        this.currentHintToken++;
        this.handNode.setWorldPosition(position);
        this.handNode.setScale(this.handDefaultScale);
        this.setHandAlpha(this.handDefaultAlpha);
        this.handNode.active = true;
        this.hasShownFirstHint = true;
        this.forceNoDelay = false;
        return this.currentHintToken;
    }

    private setCurrentItemHandTut(item: Item): void {
        this.currentItemHandTut = item;
        this.countStep(item);
        item.OnHandTutShown();
    }

    /** shownCount counts distinct steps, not displays: repeating the same hint after a touch is free. */
    private countStep(subject: object | string): void {
        if (subject === this.lastCountedSubject) return;
        this.lastCountedSubject = subject;
        this.shownCount++;
    }

    private hideHandTut(): void {
        this.currentHintToken++;
        const shownItem = this.currentItemHandTut;
        this.currentItemHandTut = null;
        if (shownItem?.isValid) shownItem.OnHandTutHidden();
        this.TypeHind = TypeHind.None;
        this.activeAuxTween?.stop();
        this.activeAuxTween = null;
        this.activeFadeTween?.stop();
        this.activeFadeTween = null;
        if (!this.handNode) return;
        Tween.stopAllByTarget(this.handNode);
        this.handNode.setScale(this.handDefaultScale);
        this.setHandAlpha(this.handDefaultAlpha);
        this.handNode.active = false;
    }

    private isHintCurrent(token: number): boolean {
        return !!this.handNode?.isValid && this.handNode.activeInHierarchy && token === this.currentHintToken;
    }

    private setHandAlpha(alpha: number): void {
        if (this.handOpacity) this.handOpacity.opacity = alpha;
    }

    /** Starts only after the hand reaches the drag destination. */
    private fadeHandAfterDrag(): void {
        if (!this.handOpacity) {
            this.setHandAlpha(0);
            return;
        }

        this.activeFadeTween?.stop();
        this.activeFadeTween = tween(this.handOpacity)
            .to(this.dragFadeDuration, { opacity: 0 }, { easing: 'sineOut' })
            .call(() => this.activeFadeTween = null)
            .start();
    }

    private getCurrentDelay(): number {
        if (this.forceNoDelay || this.shownCount < this.noDelayItemCount) return this.shortIdleDelay;
        if (this.isNextHintNoDelay()) return this.shortIdleDelay;
        return this.hasShownFirstHint ? this.idleDelay : this.firstHandTutDelay;
    }

    /**
     * Looks at the hint showNextHandTut() would pick and tells whether it is
     * about a no-delay item: the item itself, the item its hint is about
     * (GetHandTutRelatedItem), or the Item its drag target belongs to.
     */
    private isNextHintNoDelay(): boolean {
        if (this.noDelaySet.size === 0) return false;
        // The start-of-game sink tutorial and the peeler keep their own timing.
        if (this.isWaitingInitialSinkWaterTutorial || this.isPlasticPeelerReady(this.plasticPeeler)) return false;
        if (this.isPaperBoxReady()) return this.isNoDelayItem(this.paperBox!);

        const item = this.getFirstTutorialReadyItem();
        if (item) return this.isNoDelayItem(item);

        // Fallback hint: sink block / water button for a fish waiting in the sink.
        for (const inWater of this.itemsInWater) {
            if (!inWater?.isValid || inWater.isDone || !inWater.isInWater || !inWater.node.activeInHierarchy) continue;
            if (this.noDelaySet.has(inWater)) return true;
        }
        return false;
    }

    private isNoDelayItem(item: Item): boolean {
        if (this.noDelaySet.has(item)) return true;

        const related = item.GetHandTutRelatedItem();
        if (related && this.noDelaySet.has(related)) return true;

        const dropTarget = this.findItemInParents(item.itemMoveToTarget?.defaultTarget ?? null);
        return !!dropTarget && this.noDelaySet.has(dropTarget);
    }

    private canShowMore(): boolean {
        return this.maxHandTutShowCount <= 0 || this.shownCount < this.maxHandTutShowCount;
    }

    private resetIdleTimer(): void {
        this.idleTimer = 0;
    }

    private removeCompletedItems(): void {
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (!this.items[i] || this.items[i].isDone) this.items.splice(i, 1);
        }
    }
}
