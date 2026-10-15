import { _decorator, Node, Sprite, tween, UITransform, Vec3 } from 'cc';
import { Item } from '../Items/Item';
import { ItemType } from '../Items/ItemType';
import { FxType, Ply_SoundManager } from '../../Managers/Ply_SoundManager';
import { StrawberryFx } from './StrawberryFx';

const { ccclass, property } = _decorator;

/**
 * Phase 2 bowl. Each dropped half leaves a sprite copy under stackRoot,
 * laid out evenly across the bowl in rows (each row a little higher and
 * shifted half a slot), with a small random tilt and jitter.
 */
@ccclass('StrawberryCutBowl')
export class StrawberryCutBowl extends Item {
    @property({ type: Node, tooltip: 'StrawberryCutPos: parent of the stacked halves.' })
    public stackRoot: Node | null = null;

    @property({ min: 1, step: 1, tooltip: 'Halves per row.' })
    public perRow = 5;

    @property({ tooltip: 'Half width of a row: halves spread from -spreadX to +spreadX.' })
    public spreadX = 140;

    @property({ tooltip: 'Height between rows.' })
    public rowHeight = 40;

    @property({ tooltip: 'Y of the first row (local to stackRoot).' })
    public firstRowY = -10;

    @property({ tooltip: 'Max tilt of a half (degrees).' })
    public maxTilt = 15;

    @property({ tooltip: 'Max random position offset.' })
    public jitter = 6;

    @property({ min: 0.05 })
    public landDuration = 0.4;

    @property({ min: 0, tooltip: 'Height of the jump into the bowl (local units).' })
    public jumpHeight = 140;

    @property({ min: 0.1, tooltip: 'Scale of a half once in the bowl, relative to its size when dropped.' })
    public fitScale = 0.8;

    @property({ tooltip: 'Inside of the bowl (local to stackRoot): halves never reach past ±innerHalfWidth.' })
    public innerHalfWidth = 190;

    @property({ tooltip: 'Inside of the bowl (local to stackRoot): highest point a half may reach.' })
    public innerTop = 120;

    private count = 0;

    protected onLoad(): void {
        super.onLoad();
        this.itemType = ItemType.Bowl;
    }

    public AddHalf(source: Node): void {
        const root = this.stackRoot ?? this.node;
        const copy = this.CreateSpriteCopy(source, root);

        const side = this.count % 2 === 0 ? -1 : 1;
        const tilt = side * Math.random() * this.maxTilt;
        const scale = copy.scale.clone().multiplyScalar(this.fitScale);
        const target = this.ClampInsideBowl(this.GetSlotPosition(this.count), copy, scale, tilt);
        this.count++;

        const start = copy.position.clone();
        const jump = { t: 0 };
        tween(jump)
            .to(this.landDuration, { t: 1 }, {
                onUpdate: () => {
                    const t = jump.t;
                    copy.setPosition(
                        start.x + (target.x - start.x) * t,
                        start.y + (target.y - start.y) * t + Math.sin(t * Math.PI) * this.jumpHeight,
                        0,
                    );
                },
            })
            .call(() => {
                StrawberryFx.Punch(this.node, 0.04, 0.16);
                Ply_SoundManager.Ins?.PlayFx(FxType.FoodPlace);
            })
            .start();
        tween(copy)
            .to(this.landDuration, { scale, eulerAngles: new Vec3(0, 0, tilt) }, { easing: 'sineOut' })
            .start();
    }

    /** Rows filled from the centre outwards; odd rows are staggered so halves don't line up. */
    private GetSlotPosition(index: number): Vec3 {
        const perRow = Math.max(1, Math.floor(this.perRow));
        const row = Math.floor(index / perRow);
        const order = this.CenterOutOrder(perRow);
        const col = order[index % perRow];
        // Odd rows use a narrower span so their slots fall between the slots of the row below.
        const span = row % 2 === 1 ? this.spreadX * (1 - 1 / perRow) : this.spreadX;
        const x = perRow > 1 ? -span + col * (span * 2) / (perRow - 1) : 0;
        const rand = () => (Math.random() * 2 - 1) * this.jitter;
        return new Vec3(x + rand(), this.firstRowY + row * this.rowHeight + rand(), 0);
    }

    /** Pulls a slot inwards so the whole (tilted, scaled) half stays inside the bowl. */
    private ClampInsideBowl(pos: Vec3, copy: Node, scale: Vec3, tilt: number): Vec3 {
        const transform = copy.getComponent(UITransform);
        if (!transform) return pos;

        const w = transform.width * Math.abs(scale.x);
        const h = transform.height * Math.abs(scale.y);
        const rad = tilt * Math.PI / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const halfW = (w * cos + h * sin) * 0.5;
        const halfH = (w * sin + h * cos) * 0.5;

        const maxX = Math.max(0, this.innerHalfWidth - halfW);
        pos.x = Math.max(-maxX, Math.min(maxX, pos.x));
        pos.y = Math.min(pos.y, this.innerTop - halfH);
        return pos;
    }

    private CenterOutOrder(count: number): number[] {
        const center = (count - 1) / 2;
        return Array.from({ length: count }, (_, i) => i)
            .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
    }

    private CreateSpriteCopy(source: Node, parent: Node): Node {
        const copy = new Node(`${source.name}-InBowl`);
        copy.layer = source.layer;

        const sourceTransform = source.getComponent(UITransform);
        const transform = copy.addComponent(UITransform);
        if (sourceTransform) {
            transform.setContentSize(sourceTransform.contentSize);
            transform.setAnchorPoint(sourceTransform.anchorPoint);
        }

        const sourceSprite = source.getComponent(Sprite);
        const sprite = copy.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        if (sourceSprite) {
            sprite.spriteFrame = sourceSprite.spriteFrame;
            sprite.color = sourceSprite.color;
        }

        parent.addChild(copy);
        copy.setWorldPosition(source.worldPosition);
        copy.setWorldScale(source.worldScale);
        copy.setWorldRotation(source.worldRotation);
        return copy;
    }
}
