import { _decorator, Component, Node, Tween, tween, UITransform, UIOpacity, Vec3 } from 'cc';
import { Item } from './Item';
import { ItemDraggable } from './ItemDraggable';
import { ItemType } from './ItemType';
import { ClockTimer } from '../Effects/ClockTimer';
import { PhaseManager } from '../../Managers/PhaseManager';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';

const { ccclass, property } = _decorator;

@ccclass('StoveFoodSlot')
export class StoveFoodSlot {
    @property({ type: Item, tooltip: 'Food assigned to this stove position.' }) public food: Item | null = null;
    @property({ type: Node, tooltip: 'The stove group containing Grill and Done.' }) public stoveGroup: Node | null = null;
    @property({ type: Node }) public grill: Node | null = null;
    @property({ type: Node }) public done: Node | null = null;
    @property({ type: Node, tooltip: 'The food-on-stove node that Tong will grab.' }) public foodOnStove: Node | null = null;
    @property({ type: [Node], tooltip: 'Food-on-stove sprites shown while cooking.' }) public foodVisuals: Node[] = [];
    @property({ type: Node, tooltip: 'Dedicated plate target for this stove piece.' }) public plateTarget: Node | null = null;
    @property({ type: Node, tooltip: 'Smoke shown once this food reaches its plate target.' }) public smoke: Node | null = null;
    @property({ tooltip: 'Final local Z rotation in degrees when placed on its plate target.' }) public plateRotation = 0;

    public originalParent: Node | null = null;
    public originalPosition = new Vec3();
    public heldPiece: Node | null = null;
    public pieceOriginalParent: Node | null = null;
    public pieceOriginalPosition = new Vec3();
    public pieceOriginalScale = new Vec3(1, 1, 1);
    public pieceOriginalAngle = 0;
    public cooking = false;
    public ready = false;
    public heldByTongs = false;
}

/** Places seasoned FoodOil items on their configured grill and cooks them. */
@ccclass('StoveCooking')
export class StoveCooking extends Component {
    @property({ type: [StoveFoodSlot], tooltip: 'One slot per food. Assign the food and its stove group.' })
    public slots: StoveFoodSlot[] = [];

    @property({ type: Node, tooltip: 'Clock spawn position.' }) public clockPos: Node | null = null;
    @property({ type: ItemDraggable, tooltip: 'Tong disabled after every food-on-stove reaches a plate.' })
    public tongsDraggable: ItemDraggable | null = null;
    @property({ min: 0.01, tooltip: 'Cooking duration in seconds.' }) public cookingDuration = 2;
    @property({ min: 0.01, tooltip: 'Food-on-stove drop duration before cooking starts.' }) public foodDropDuration = 0.35;
    @property({ tooltip: 'Vertical distance above the stove where each food piece starts.' }) public foodDropOffsetY = 120;
    @property({ min: 0.01, tooltip: 'Food transfer duration for Tong and Plate.' }) public foodTransferDuration = 0.25;

    private stoveStepComplete = false;
    private readonly blockedStoveFoodsThisDrag = new Set<Item>();

    protected onLoad(): void {
        this.clockPos ??= this.FindByNames(this.node, ['ClockPos']);
        this.tongsDraggable ??= this.FindByNames(this.node.scene, ['Tongs'])?.getComponent(ItemDraggable) ?? null;
        this.AutoAssignSlots();
        for (const slot of this.slots) this.SetupSlot(slot);
    }

    protected onEnable(): void {
        for (const slot of this.slots) {
            if (!slot.food?.itemDraggable) continue;
            slot.food.itemDraggable.onDropFail.removeListener(this.OnFoodDropFail);
            slot.food.itemDraggable.onDropFail.addListener(this.OnFoodDropFail);
        }
    }

    protected onDisable(): void {
        for (const slot of this.slots) slot.food?.itemDraggable?.onDropFail.removeListener(this.OnFoodDropFail);
        Ply_SoundManager.Ins?.StopFxLoop(FxType.Frying);
    }

    protected update(): void {
        // FoodOil is accepted as soon as its UI rectangle overlaps a Grill;
        // the player does not need to release their finger over the stove.
        for (const food of this.blockedStoveFoodsThisDrag) {
            if (!food.itemDraggable?.IsDragging) this.blockedStoveFoodsThisDrag.delete(food);
        }

        const checkedFoods = new Set<Item>();
        for (const slot of this.slots) {
            const food = slot.food;
            if (!food || checkedFoods.has(food)) continue;
            checkedFoods.add(food);
            if (!food.itemDraggable?.IsDragging) continue;

            const grill = this.slots.find(candidate => candidate.food === food && candidate.grill &&
                this.IsUITransformOverlapping(food.node, candidate.grill));
            if (!grill) continue;
            if (!this.CanAcceptFood(food)) {
                // The stove is occupied. Show feedback on the food currently
                // being dragged, rather than on the food already cooking.
                if (!this.blockedStoveFoodsThisDrag.has(food)) {
                    this.blockedStoveFoodsThisDrag.add(food);
                    food.SpawnBreakHeart();
                }
                continue;
            }
            this.TryPlaceFoodOnStove(food);
        }
    }

    private readonly OnFoodDropFail = (): void => {
        const candidate = this.slots.find(slot => {
            const food = slot.food;
            return !!food && food.itemType === ItemType.FoodOil
                && !!slot.grill && this.IsUITransformOverlapping(food.node, slot.grill);
        });
        if (!candidate?.food) return;

        const food = candidate.food;
        if (!this.CanAcceptFood(food)) {
            // The player reached a valid grill, but another FoodOnStove still
            // occupies the stove. Return quietly instead of treating it as a mistake.
            food.itemDraggable?.SuppressCurrentDropFailEffect();
            return;
        }
        this.TryPlaceFoodOnStove(food);
    };

    /** Starts all stove pieces owned by a dropped FoodOil exactly once. */
    private TryPlaceFoodOnStove(food: Item): boolean {
        if (!this.CanAcceptFood(food)) return false;
        const matchingSlots = this.slots.filter(slot => slot.food === food && !slot.cooking && !slot.ready);
        if (!matchingSlots.length) return false;

        food.itemDraggable?.MarkCurrentDropFailHandled();
        food.itemDraggable?.DisableComponent();
        food.node.active = false;
        // Keep a single frying loop running while any food is on the stove.
        Ply_SoundManager.Ins?.PlayFxLoop(FxType.Frying);
        // One drag can place a multi-piece food onto all of its configured
        // independent stove positions. Each slot owns its own timer and Done.
        for (const slot of matchingSlots) this.PlaceOnGrill(slot);
        return true;
    }

    private PlaceOnGrill(slot: StoveFoodSlot): void {
        const food = slot.food;
        if (!food || !slot.stoveGroup) return;

        slot.originalParent = food.node.parent;
        slot.originalPosition.set(food.node.worldPosition);
        slot.cooking = true;
        slot.ready = false;
        slot.heldByTongs = false;
        food.node.active = false;

        slot.stoveGroup.active = true;
        this.SetNodeActive(slot.grill, true);
        this.SetNodeActive(slot.done, false);
        this.SetNodeActive(slot.smoke, false);
        const dropVisuals = slot.foodVisuals.length ? slot.foodVisuals : (slot.grill ? [slot.grill] : []);
        for (const visual of dropVisuals) {
            this.SetNodeActive(visual, true);
        }
        // The whole StoveGroup is the independent FoodOnStove object.
        slot.foodOnStove = slot.stoveGroup;
        this.AnimateFoodDrop(slot);
    }

    private FinishCooking(slot: StoveFoodSlot): void {
        if (!slot.cooking) return;
        slot.cooking = false;
        slot.ready = true;
        this.SetOpacity(slot.grill, 0);
        this.SetOpacity(slot.done, 1);
        this.SetNodeActive(slot.done, true);
        slot.food?.SpawnHeart();
    }

    public TryGrabAtPoint(worldPoint: Vec3): StoveFoodSlot | null {
        for (const slot of this.slots) {
            if (slot.ready && !slot.heldByTongs && slot.done && this.IsPointInside(worldPoint, slot.done)) return slot;
        }
        return null;
    }

    /** Returns a cooking (not yet ready) stove piece under the supplied point. */
    public GetCookingSlotAtPoint(worldPoint: Vec3): StoveFoodSlot | null {
        for (const slot of this.slots) {
            if (!slot.cooking || slot.ready || slot.heldByTongs) continue;
            const hitNodes = [...slot.foodVisuals, slot.grill, slot.stoveGroup]
                .filter((node): node is Node => !!node?.activeInHierarchy);
            if (hitNodes.some(node => this.IsPointInside(worldPoint, node))) return slot;
        }
        return null;
    }

    /** Returns any stove food that is still on the stove, cooked or cooking. */
    public GetFoodOnStoveSlotAtPoint(worldPoint: Vec3): StoveFoodSlot | null {
        for (const slot of this.slots) {
            if ((!slot.cooking && !slot.ready) || slot.heldByTongs) continue;
            const hitNodes = [...slot.foodVisuals, slot.grill, slot.done, slot.stoveGroup]
                .filter((node): node is Node => !!node?.activeInHierarchy);
            if (hitNodes.some(node => this.IsPointInside(worldPoint, node))) return slot;
        }
        return null;
    }

    /** Shows failed-input feedback at the active FoodOnStove position. */
    public ShowCookingFoodBlockedFeedback(worldPoint: Vec3): boolean {
        const slot = this.GetCookingSlotAtPoint(worldPoint);
        if (!slot?.food) return false;
        slot.food.SpawnBreakHeartAt(slot.stoveGroup ?? slot.grill ?? slot.food.node);
        return true;
    }

    /** Shows blocked-input feedback for a food that has not yet left the stove. */
    public ShowFoodOnStoveBlockedFeedback(worldPoint: Vec3): boolean {
        const slot = this.GetFoodOnStoveSlotAtPoint(worldPoint);
        if (!slot?.food) return false;
        slot.food.SpawnBreakHeartAt(slot.stoveGroup ?? slot.done ?? slot.grill ?? slot.food.node);
        return true;
    }

    /** True only when this FoodOil owns free stove slots and no other food is on the stove. */
    public CanAcceptFood(food: Item | null): boolean {
        if (!food || food.itemType !== ItemType.FoodOil) return false;
        const hasFreeMatchingSlot = this.slots.some(slot => slot.food === food && !slot.cooking && !slot.ready && !slot.heldByTongs);
        if (!hasFreeMatchingSlot) return false;
        return !this.slots.some(slot => slot.food !== food && !!slot.food && (slot.cooking || slot.ready || slot.heldByTongs));
    }

    public GrabWithTongs(slot: StoveFoodSlot, foodParent: Node): Item | null {
        if (!slot.ready || slot.heldByTongs || !slot.food) return null;
        const food = slot.food;
        // StoveGroup itself is the FoodOnStove object carried by Tong.
        const piece = slot.stoveGroup;
        if (!piece) return null;
        slot.heldPiece = piece;
        slot.pieceOriginalParent = piece.parent;
        slot.pieceOriginalPosition.set(piece.position);
        slot.pieceOriginalScale.set(piece.scale);
        slot.pieceOriginalAngle = piece.angle;
        slot.heldByTongs = true;
        piece.active = true;
        const currentWorldPosition = new Vec3(piece.worldPosition.x, piece.worldPosition.y, piece.worldPosition.z);
        const currentWorldRotation = piece.worldRotation.clone();
        const currentWorldScale = piece.worldScale.clone();
        piece.setParent(foodParent);
        piece.setWorldPosition(currentWorldPosition);
        // FoodPos can be rotated/scaled with the Tong. Preserve the stove
        // piece's world transform so it does not rotate or resize on pickup.
        piece.setWorldRotation(currentWorldRotation);
        piece.setWorldScale(currentWorldScale);
        Tween.stopAllByTarget(piece);
        tween(piece)
            .to(this.foodTransferDuration, { position: new Vec3(0, 0, 0) }, { easing: 'quadOut' })
            .start();
        food.itemDraggable?.DisableComponent();
        return food;
    }

    public ReturnFromTongs(slot: StoveFoodSlot): void {
        const food = slot.food;
        const piece = slot.heldPiece;
        if (!food || !piece || !slot.pieceOriginalParent) return;
        if (slot.pieceOriginalParent) {
            Tween.stopAllByTarget(piece);
            const currentWorldPosition = new Vec3(piece.worldPosition.x, piece.worldPosition.y, piece.worldPosition.z);
            const currentWorldRotation = piece.worldRotation.clone();
            const currentWorldScale = piece.worldScale.clone();
            piece.setParent(slot.pieceOriginalParent);
            // Reparent without a visible jump, then move back to the exact
            // stove transform over the same transfer duration.
            piece.setWorldPosition(currentWorldPosition);
            piece.setWorldRotation(currentWorldRotation);
            piece.setWorldScale(currentWorldScale);
            piece.active = true;
            tween(piece)
                .to(this.foodTransferDuration, {
                    position: slot.pieceOriginalPosition,
                    scale: slot.pieceOriginalScale,
                    angle: slot.pieceOriginalAngle,
                }, { easing: 'quadOut' })
                .start();
        }
        slot.heldPiece = null;
        slot.heldByTongs = false;
        slot.stoveGroup!.active = true;
    }

    public PlaceOnPlate(slot: StoveFoodSlot): void {
        const food = slot.food;
        const target = slot.plateTarget;
        const piece = slot.heldPiece;
        if (!food || !target || !piece) return;
        const currentWorldPosition = new Vec3(piece.worldPosition.x, piece.worldPosition.y, piece.worldPosition.z);
        const currentWorldRotation = piece.worldRotation.clone();
        const currentWorldScale = piece.worldScale.clone();
        Tween.stopAllByTarget(piece);
        // Detach from Tong immediately on target contact, then move under its target.
        piece.setParent(target);
        piece.setWorldPosition(currentWorldPosition);
        // Prevent parent switching from snapping rotation or scale. The tween
        // below is now the only operation that changes the final rotation.
        piece.setWorldRotation(currentWorldRotation);
        piece.setWorldScale(currentWorldScale);
        tween(piece)
            .to(this.foodTransferDuration, {
                position: new Vec3(0, 0, 0),
                angle: slot.plateRotation,
            }, { easing: 'quadOut' })
            .call(() => {
                if (!piece.isValid || !target.isValid) return;
                piece.setPosition(0, 0, 0);
                piece.angle = slot.plateRotation;
                this.SetNodeActive(slot.smoke, true);
                Ply_SoundManager.Ins?.PlayFx(FxType.FoodPlace);
                this.CompleteStoveStepIfReady();
            })
            .start();
        piece.active = true;
        slot.food = null;
        slot.heldPiece = null;
        slot.heldByTongs = false;
        slot.ready = false;
        slot.foodOnStove = piece;
    }

    private SetupSlot(slot: StoveFoodSlot): void {
        if (!slot.stoveGroup) return;
        slot.grill ??= slot.stoveGroup.getChildByName('Grill');
        slot.done ??= slot.stoveGroup.getChildByName('Done');
        slot.smoke ??= this.FindByNames(slot.stoveGroup, ['Smoke']);
        if (!slot.foodVisuals.length) {
            slot.foodVisuals = slot.stoveGroup.children.filter(child => child !== slot.grill && child !== slot.done);
        }
        slot.foodOnStove = slot.stoveGroup;
        this.SetNodeActive(slot.stoveGroup, false);
        this.SetNodeActive(slot.done, false);
        this.SetNodeActive(slot.smoke, false);
    }

    private AutoAssignSlots(): void {
        if (this.slots.length) return;
        const scene = this.node.scene;
        const items = scene?.getComponentsInChildren(Item) ?? [];
        const add = (foodName: string, groupName: string): void => {
            const food = items.find(item => item.node.name.toLowerCase() === foodName.toLowerCase() && item.itemType === ItemType.FoodOil);
            const group = this.FindByNames(this.node, [groupName]);
            if (!food || !group) return;
            const slot = new StoveFoodSlot();
            slot.food = food;
            slot.stoveGroup = group;
            this.slots.push(slot);
        };
        add('ca', 'Ca1');
        add('asparagus', 'MangTay');
        add('Carrot', 'Carrot1');
    }

    private AnimateFoodDrop(slot: StoveFoodSlot): void {
        const visuals = (slot.foodVisuals.length ? slot.foodVisuals : (slot.grill ? [slot.grill] : []))
            .filter(node => !!node?.isValid);
        if (!visuals.length) {
            this.StartCookingTimer(slot);
            return;
        }

        let remaining = visuals.length;
        const onPieceLanded = (): void => {
            remaining--;
            if (remaining <= 0) this.StartCookingTimer(slot);
        };

        for (const node of visuals) {
            const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
            const targetPosition = new Vec3(node.position.x, node.position.y, node.position.z);
            const startPosition = new Vec3(targetPosition.x, targetPosition.y, targetPosition.z);
            startPosition.y += this.foodDropOffsetY;
            node.setPosition(startPosition);
            opacity.opacity = 102;
            Tween.stopAllByTarget(node);
            Tween.stopAllByTarget(opacity);
            tween(node)
                .parallel(
                    tween().to(this.foodDropDuration, { position: targetPosition }, { easing: 'quadOut' }),
                    tween(opacity).to(this.foodDropDuration, { opacity: 255 }, { easing: 'quadOut' }),
                )
                .call(onPieceLanded)
                .start();
        }
    }

    private StartCookingTimer(slot: StoveFoodSlot): void {
        // All stove visuals have landed before cooking (and its clock) begins.
        Ply_SoundManager.Ins?.PlayFx(FxType.FoodPlace);
        this.AnimateCookingCrossFade(slot);
        const timer = ClockTimer.SpawnForItem(this.node, this.cookingDuration, undefined, this.clockPos ?? undefined);
        if (timer) {
            timer.onComplete.addListener(() => this.FinishCooking(slot));
        } else {
            this.scheduleOnce(() => this.FinishCooking(slot), this.cookingDuration);
        }
    }

    /** Cross-fades Grill out and Done in while the cooking clock is running. */
    private AnimateCookingCrossFade(slot: StoveFoodSlot): void {
        if (slot.grill) {
            const grillOpacity = slot.grill.getComponent(UIOpacity) ?? slot.grill.addComponent(UIOpacity);
            grillOpacity.opacity = 255;
            slot.grill.active = true;
            Tween.stopAllByTarget(grillOpacity);
            tween(grillOpacity).to(this.cookingDuration, { opacity: 0 }, { easing: 'linear' }).start();
        }
        if (slot.done) {
            const doneOpacity = slot.done.getComponent(UIOpacity) ?? slot.done.addComponent(UIOpacity);
            doneOpacity.opacity = 0;
            slot.done.active = true;
            Tween.stopAllByTarget(doneOpacity);
            tween(doneOpacity).to(this.cookingDuration, { opacity: 255 }, { easing: 'linear' }).start();
        }
    }

    private FadeNode(node: Node | null, target: number): void {
        if (!node) return;
        node.active = true;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        tween(opacity).to(0.35, { opacity: Math.round(target * 255) }, { easing: 'quadOut' }).start();
    }

    private SetOpacity(node: Node | null, target: number): void {
        if (!node) return;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = Math.round(target * 255);
    }

    private CompleteStoveStepIfReady(): void {
        if (this.stoveStepComplete || !this.slots.length || this.slots.some(slot => !!slot.food)) return;
        this.stoveStepComplete = true;
        Ply_SoundManager.Ins?.StopFxLoop(FxType.Frying);
        this.tongsDraggable?.ReturnToStart(false);
        this.tongsDraggable?.DisableComponent();
        this.getComponent(Item)?.SpawnHeart();
        PhaseManager.Ins?.DoOneStep();
    }

    private IsPointInside(worldPoint: Vec3, node: Node): boolean {
        const transform = node.getComponent(UITransform);
        if (!transform) return false;
        const local = transform.convertToNodeSpaceAR(worldPoint);
        const left = -transform.anchorX * transform.width;
        const bottom = -transform.anchorY * transform.height;
        return local.x >= left && local.x <= left + transform.width
            && local.y >= bottom && local.y <= bottom + transform.height;
    }

    /** True when the visible UI rectangles of the dragged food and Grill touch. */
    private IsUITransformOverlapping(first: Node, second: Node): boolean {
        const firstTransform = first.getComponent(UITransform) ?? first.getComponentInChildren(UITransform);
        const secondTransform = second.getComponent(UITransform) ?? second.getComponentInChildren(UITransform);
        if (!firstTransform || !secondTransform) return false;
        return firstTransform.getBoundingBoxToWorld().intersects(secondTransform.getBoundingBoxToWorld());
    }

    private FindByNames(root: Node | null, names: string[]): Node | null {
        if (!root) return null;
        if (names.some(name => name.toLowerCase() === root.name.toLowerCase())) return root;
        for (const child of root.children) {
            const found = this.FindByNames(child, names);
            if (found) return found;
        }
        return null;
    }

    private SetNodeActive(node: Node | null, active: boolean): void {
        if (node?.isValid) node.active = active;
    }
}
