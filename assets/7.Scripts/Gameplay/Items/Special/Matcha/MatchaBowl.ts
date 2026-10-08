import { _decorator, Enum, Node, Tween, tween, UIOpacity } from 'cc';
import { Item } from '../../Common/Item';
import { ItemType } from '../../Common/ItemType';
import { Ply_Event } from '../../../../Core/Base/Ply_Event';
import { HandTutManager } from '../../../../Managers/HandTutManager';
import { FxType, Ply_SoundManager } from '../../../../Managers/Ply_SoundManager';
import { PlayFadeOut, PlayFallIn } from '../../../Effects/FallIn';
import { BowlStirring } from './BowlStirring';
import { PourTool } from './PourTool';

const { ccclass, property } = _decorator;

/**
 * Matcha bowl, drives the whole phase:
 * click the box (lid flies off) -> spoon scoops matcha and pours it in ->
 * water pot pours water -> chasen goes in and the player stirs ->
 * MATCHA done, heart, phase step.
 * Tools that are not on turn stay draggable but cannot be dropped.
 */
@ccclass('MatchaBowl')
export class MatchaBowl extends Item {
    // ---------- Tab: Box ----------
    @property({ group: { name: 'Box', id: 'bowl', displayOrder: 0 }, type: Item, tooltip: 'Hộp matcha, click để mở (cần ItemClickable).' })
    public box: Item | null = null;

    @property({ group: { name: 'Box', id: 'bowl' }, type: Node, tooltip: 'Nắp hộp: bay lên và mờ dần khi mở.' })
    public lid: Node | null = null;

    @property({ group: { name: 'Box', id: 'bowl' }, tooltip: 'Nắp bay lên bao nhiêu (đơn vị local của nắp).' })
    public lidFlyHeight: number = 250;

    @property({ group: { name: 'Box', id: 'bowl' }, min: 0.01, tooltip: 'Thời gian nắp bay lên + mờ (giây).' })
    public lidFlyDuration: number = 0.5;

    @property({ group: { name: 'Box', id: 'bowl' }, type: Enum(FxType), tooltip: 'Âm thanh mở hộp.' })
    public openFx: FxType = FxType.Wipe;

    // ---------- Tab: Tools ----------
    @property({ group: { name: 'Tools', id: 'bowl', displayOrder: 1 }, type: PourTool, tooltip: 'Thìa múc matcha.' })
    public spoon: PourTool | null = null;

    @property({ group: { name: 'Tools', id: 'bowl' }, type: PourTool, tooltip: 'Bình nước.' })
    public waterPot: PourTool | null = null;

    @property({ group: { name: 'Tools', id: 'bowl' }, type: Item, tooltip: 'Chasen (cần ItemDraggable + ItemMoveToTarget).' })
    public chasen: Item | null = null;

    @property({ group: { name: 'Tools', id: 'bowl' }, type: Node, tooltip: 'Vị trí chasen trong bát (ChasenPos).' })
    public chasenPos: Node | null = null;

    // ---------- Tab: Contents ----------
    @property({ group: { name: 'Contents', id: 'bowl', displayOrder: 2 }, type: Node, tooltip: 'Bột trong bát (MATCHA_POWDER3): rơi vào khi thìa đổ.' })
    public powder: Node | null = null;

    @property({ group: { name: 'Contents', id: 'bowl' }, tooltip: 'Bột rơi từ cao bao nhiêu (đơn vị local).' })
    public powderFallHeight: number = 40;

    @property({ group: { name: 'Contents', id: 'bowl' }, range: [0, 1, 0.05], slide: true, tooltip: 'Độ rõ của bột lúc bắt đầu rơi.' })
    public powderStartOpacity: number = 0.2;

    @property({ group: { name: 'Contents', id: 'bowl' }, type: Node, tooltip: 'Nước trong bát (WATER4): rõ dần khi rót, đè lên bột.' })
    public water: Node | null = null;

    @property({ group: { name: 'Contents', id: 'bowl' }, type: Node, tooltip: 'Matcha đang khuấy (MATCHA_Stirring): bật khi bắt đầu khuấy, tắt bột + nước.' })
    public stirringLayer: Node | null = null;

    @property({ group: { name: 'Contents', id: 'bowl' }, type: Node, tooltip: 'Matcha xong (MATCHA_DOne): bật khi khuấy xong.' })
    public doneLayer: Node | null = null;

    @property({ group: { name: 'Contents', id: 'bowl' }, min: 0, tooltip: 'Thời gian MATCHA_DOne hiện dần (giây).' })
    public doneFadeDuration: number = 0.3;

    // ---------- Tab: Stir ----------
    @property({ group: { name: 'Stir', id: 'bowl', displayOrder: 3 }, type: BowlStirring, tooltip: 'Component khuấy. Trống = tìm trên node này.' })
    public stirring: BowlStirring | null = null;

    @property({ group: { name: 'Stir', id: 'bowl' }, tooltip: 'Khuấy xong thì gọi PhaseManager.DoOneStep().' })
    public doPhaseStep: boolean = true;

    // ---------- Tab: Events ----------
    @property({ group: { name: 'Events', id: 'bowl', displayOrder: 4 }, type: Ply_Event })
    public onBoxOpened: Ply_Event = new Ply_Event();

    @property({ group: { name: 'Events', id: 'bowl' }, type: Ply_Event })
    public onMatchaDone: Ply_Event = new Ply_Event();

    private boxOpened = false;
    private chasenReady = false;
    private stirStarted = false;
    private readonly onBoxClick = (): void => this.OpenBox();
    private readonly onSpoonPour = (duration: number): void => this.AddPowder(duration);
    private readonly onSpoonDone = (): void => this.waterPot?.Ready(this);
    private readonly onWaterPour = (duration: number): void => this.AddWater(duration);
    private readonly onWaterDone = (): void => this.ReadyChasen();
    private readonly onChasenDropped = (): void => this.OnChasenDropped();
    private readonly onStirBegin = (): void => this.OnStirBegin();
    private readonly onStirDone = (): void => this.OnStirDone();

    protected onLoad(): void {
        super.onLoad();
        if (this.itemType === ItemType.None) this.itemType = ItemType.MatchaBowl;
        this.stirring ??= this.getComponent(BowlStirring);
        if (this.stirring) this.stirring.enabled = false;
        for (const layer of [this.powder, this.water, this.stirringLayer, this.doneLayer]) {
            if (layer) layer.active = false;
        }
        // The box is only clicked; the chasen waits for its turn.
        this.box?.DisableItemDraggable();
        this.LockChasen();
    }

    protected start(): void {
        if (!this.box) return;
        this.box.isDone = false;
        this.box.EnableItemClickable();
        HandTutManager.Ins?.RegisterTutorialItem(this.box, false);
    }

    protected onEnable(): void {
        this.cacheComponents();
        this.Listen(true);
    }

    protected onDisable(): void {
        this.Listen(false);
    }

    private Listen(on: boolean): void {
        const pairs: [Ply_Event | undefined, (...args: any[]) => void][] = [
            [this.box?.itemClickable?.onClick, this.onBoxClick],
            [this.spoon?.onPour, this.onSpoonPour],
            [this.spoon?.onPoured, this.onSpoonDone],
            [this.waterPot?.onPour, this.onWaterPour],
            [this.waterPot?.onPoured, this.onWaterDone],
            [this.chasen?.itemDraggable?.onDropSuccess, this.onChasenDropped],
            [(this.stirring ?? this.getComponent(BowlStirring))?.onStirBegin, this.onStirBegin],
            [(this.stirring ?? this.getComponent(BowlStirring))?.onStirComplete, this.onStirDone],
        ];
        for (const [event, handler] of pairs) {
            event?.removeListener(handler);
            if (on) event?.addListener(handler);
        }
    }

    // ---------- Box ----------

    private OpenBox(): void {
        if (this.boxOpened || !this.box) return;
        this.boxOpened = true;
        this.box.DisableItemClickable();
        this.box.ItemDone();
        HandTutManager.Ins?.ItemDone(this.box.node);
        Ply_SoundManager.Ins?.PlayFx(this.openFx);

        const lid = this.lid;
        if (lid) {
            const end = lid.position.clone().add3f(0, this.lidFlyHeight, 0);
            Tween.stopAllByTarget(lid);
            tween(lid).to(this.lidFlyDuration, { position: end }, { easing: 'quadOut' }).start();
            PlayFadeOut(lid, this.lidFlyDuration);
        }
        this.scheduleOnce(() => {
            this.onBoxOpened.invoke();
            this.spoon?.Ready(this);
        }, lid ? this.lidFlyDuration : 0);
    }

    // ---------- Powder + water ----------

    private AddPowder(duration: number): void {
        if (!this.powder) return;
        PlayFallIn(this.powder, this.powderFallHeight, Math.max(0.1, duration), this.powderStartOpacity);
    }

    private AddWater(duration: number): void {
        const water = this.water;
        if (!water) return;
        const opacity = water.getComponent(UIOpacity) ?? water.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        water.active = true;
        tween(opacity).to(Math.max(0.1, duration), { opacity: 255 }, { easing: 'sineOut' }).start();
    }

    // ---------- Chasen + stirring ----------

    /** Not its turn: still draggable, but every drop fails. */
    private LockChasen(): void {
        const chasen = this.chasen;
        if (!chasen?.itemDraggable) return;
        chasen.itemDraggable.targetItemType = ItemType.None;
        chasen.EnableItemDraggable();
    }

    private ReadyChasen(): void {
        const chasen = this.chasen;
        if (!chasen?.itemDraggable) return;
        this.chasenReady = true;
        chasen.isDone = false;
        chasen.itemDraggable.targetItemType = this.itemType;
        if (chasen.itemMoveToTarget) chasen.itemMoveToTarget.defaultTarget = this.chasenPos ?? this.node;
        chasen.EnableItemDraggable();
        HandTutManager.Ins?.RegisterTutorialItem(chasen, false);
    }

    private OnChasenDropped(): void {
        const chasen = this.chasen;
        if (!this.chasenReady || !chasen) return;
        this.chasenReady = false;
        // While stirring, a touch on the chasen must reach the bowl's stirring.
        chasen.DisableItemDraggable();
        chasen.ItemDone();
        HandTutManager.Ins?.ItemDone(chasen.node);

        const move = chasen.itemMoveToTarget;
        if (!move) {
            this.StartStirring();
            return;
        }
        const onArrived = (): void => {
            move.onComplete.removeListener(onArrived);
            this.StartStirring();
        };
        move.onComplete.addListener(onArrived);
        move.ExecuteMove2D(this.chasenPos ?? this.node);
    }

    private StartStirring(): void {
        const stirring = this.stirring;
        if (!stirring) return;
        if (this.chasen) stirring.SetStirrer(this.chasen.node);
        stirring.enabled = true;
        this.isDone = false;
        HandTutManager.Ins?.RegisterTutorialItem(this);
    }

    private OnStirBegin(): void {
        if (this.stirStarted) return;
        this.stirStarted = true;
        if (this.powder) this.powder.active = false;
        if (this.water) this.water.active = false;
        if (this.stirringLayer) this.stirringLayer.active = true;
    }

    private OnStirDone(): void {
        if (this.stirring) this.stirring.enabled = false;
        this.ItemDone();
        HandTutManager.Ins?.ItemDone(this.node);

        if (this.stirringLayer) this.stirringLayer.active = false;
        if (this.powder) this.powder.active = false;
        if (this.water) this.water.active = false;
        const done = this.doneLayer;
        if (done) {
            const opacity = done.getComponent(UIOpacity) ?? done.addComponent(UIOpacity);
            Tween.stopAllByTarget(opacity);
            opacity.opacity = this.doneFadeDuration > 0 ? 0 : 255;
            done.active = true;
            if (this.doneFadeDuration > 0) tween(opacity).to(this.doneFadeDuration, { opacity: 255 }).start();
        }
        this.SpawnHeart();
        this.ReturnChasen();
        this.onMatchaDone.invoke();
        if (this.doPhaseStep) this.DoOneStep();
    }

    private ReturnChasen(): void {
        const draggable = this.chasen?.itemDraggable;
        if (!draggable) return;
        const onBack = (): void => {
            draggable.onReturnToStartComplete.removeListener(onBack);
            this.scheduleOnce(() => this.LockChasen(), 0);
        };
        draggable.onReturnToStartComplete.addListener(onBack);
        draggable.ReturnToStartWithoutHeart();
    }
}
