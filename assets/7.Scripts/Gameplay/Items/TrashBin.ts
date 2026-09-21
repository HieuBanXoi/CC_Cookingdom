import { _decorator, Node, Tween, tween, Vec3 } from 'cc';
import { Item } from './Item';
import { ItemType } from './ItemType';

const { ccclass, property } = _decorator;

/**
 * Drop target for Trash. Slides up while a trash is being dragged and slides
 * back down (hidden) once the trash has been thrown in or the drag failed.
 */
@ccclass('TrashBin')
export class TrashBin extends Item {
    @property({ type: Node, tooltip: 'Where a thrown trash flies to. Defaults to this node.' })
    public dropPoint: Node | null = null;

    @property({ type: Node, tooltip: 'Node that slides when trash is dragged. Defaults to this TrashBin node.' })
    public movingNode: Node | null = null;

    @property({ type: Node, tooltip: 'Optional offset node. Its local position is added to the moving node default position while shown.' })
    public showOffsetNode: Node | null = null;

    @property({ type: Vec3, tooltip: 'Local position while hidden (off screen). Cached from the scene position on load if left at zero.' })
    public hiddenPosition = new Vec3(0, 0, 0);

    @property({ type: Vec3, tooltip: 'Local offset from hiddenPosition while shown (usually upwards).' })
    public showOffset = new Vec3(0, 300, 0);

    @property({ min: 0.01, tooltip: 'Slide duration in seconds.' })
    public moveDuration = 0.3;

    @property({ tooltip: 'Deactivate the node while hidden.' })
    public deactivateWhenHidden = false;

    private activeDrags = 0;
    private isShown = false;
    private defaultMovingPosition = new Vec3();

    private get NodeToMove(): Node {
        return this.movingNode ?? this.node;
    }

    private get ShowPosition(): Vec3 {
        const offset = this.showOffsetNode?.position ?? this.showOffset;
        return new Vec3(
            this.defaultMovingPosition.x + offset.x,
            this.defaultMovingPosition.y + offset.y,
            this.defaultMovingPosition.z + offset.z,
        );
    }

    public get IsShown(): boolean {
        return this.isShown;
    }

    public get DropPoint(): Node {
        return this.dropPoint ?? this.node;
    }

    /** World position of the bin while shown (the hand tutorial must not point below the screen). */
    public GetShownWorldPosition(): Vec3 {
        const movingNode = this.NodeToMove;
        const parent = movingNode.parent;
        return parent
            ? Vec3.transformMat4(new Vec3(), this.ShowPosition, parent.worldMatrix)
            : this.ShowPosition.clone();
    }

    protected onLoad(): void {
        super.onLoad();
        if (this.itemType === ItemType.None) this.itemType = ItemType.TrashBin;
        if (this.hiddenPosition.equals(Vec3.ZERO)) Vec3.copy(this.hiddenPosition, this.node.position);
        const movingNode = this.NodeToMove;
        Vec3.copy(this.defaultMovingPosition, movingNode.position);
        movingNode.setPosition(this.defaultMovingPosition);
        if (this.deactivateWhenHidden) this.node.active = false;
    }

    /** Called by Trash on begin drag. Counts overlapping drags so a fail on one does not hide it under another. */
    public Show(): void {
        this.activeDrags++;
        if (this.isShown) return;
        this.isShown = true;
        this.node.active = true;

        const movingNode = this.NodeToMove;
        const target = this.ShowPosition;
        Tween.stopAllByTarget(movingNode);
        tween(movingNode).to(this.moveDuration, { position: target }, { easing: 'backOut' }).start();
    }

    /** Called by Trash after the drag ended (fail) or the throw-in move finished. */
    public Hide(): void {
        this.activeDrags = Math.max(0, this.activeDrags - 1);
        if (this.activeDrags > 0 || !this.isShown) return;
        this.isShown = false;

        const movingNode = this.NodeToMove;
        Tween.stopAllByTarget(movingNode);
        tween(movingNode)
            .to(this.moveDuration, { position: this.defaultMovingPosition.clone() }, { easing: 'sineIn' })
            .call(() => { if (this.deactivateWhenHidden && !this.isShown) this.node.active = false; })
            .start();
    }

    /** Hides immediately regardless of pending drags. */
    public ForceHide(): void {
        this.activeDrags = 0;
        this.isShown = true;
        this.Hide();
    }
}
