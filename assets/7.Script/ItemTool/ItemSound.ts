import { _decorator, Component } from 'cc';
import { Ply_SoundManager, FxType } from '../Tool/Ply_SoundManager';

const { ccclass } = _decorator;

@ccclass('ItemSound')
export class ItemSound extends Component {

    public PlaySoundFX(fxType: FxType) {
        Ply_SoundManager.Ins.PlayFx(fxType);
    }

    public PlayKnifeCutSound() {
        this.PlaySoundFX(FxType.KnifeCut);
    }

    public PlayKnifeSwingSound() {
        this.PlaySoundFX(FxType.KnifeSwing);
    }

    public PlayKnifePlaceSound() {
        this.PlaySoundFX(FxType.KnifePlace);
    }

    public PlayKnifeFlashSound() {
        Ply_SoundManager.Ins.PlayFxLoop(FxType.KnifeFlash);
    }

    public StopKnifeFlashSound() {
        Ply_SoundManager.Ins.StopFxLoop(FxType.KnifeFlash);
    }

    public PlayLemonJuiceSound() {
        this.PlaySoundFX(FxType.LemonJuice);
    }

    public PlayWipeSound() {
        this.PlaySoundFX(FxType.Wipe);
    }

    public PlayWipe2Sound() {
        this.PlaySoundFX(FxType.Wipe2);
    }

    public PlayCut2Sound() {
        this.PlaySoundFX(FxType.Peer);
    }

    public PlayPlaceFoodSound() {
        this.PlaySoundFX(FxType.FoodPlace);
    }

    public PlayCreamSound() {
        this.PlaySoundFX(FxType.Cream);
    }

    public PlayLeafSound() {
        this.PlaySoundFX(FxType.LeafOn);
    }

    public PlayLeafToDishSound() {
        this.PlaySoundFX(FxType.PlaceVege);
    }

    public PlayPouringSaltSound() {
        this.PlaySoundFX(FxType.PouringSalt);
    }

    public PlayPouringWaterSound() {
        this.PlaySoundFX(FxType.PouringWater);
    }

    public PlayPaperCleanSound() {
        this.PlaySoundFX(FxType.PaperClean);
    }

    public PlayClickSound() {
        this.PlaySoundFX(FxType.Click);
    }

    public PlayCreamWipingSound() {
        this.PlaySoundFX(FxType.CreamWiping);
    }

    public PlayItemPlaceSound() {
        this.PlaySoundFX(FxType.ItemPlace);
    }

    public PlayPourOilSound() {
        this.PlaySoundFX(FxType.PourOil);
    }

    public PlayFryingSound() {
        Ply_SoundManager.Ins.PlayFxLoop(FxType.Frying);
    }

    public StopFryingSound() {
        Ply_SoundManager.Ins.StopFxLoop(FxType.Frying);
    }
}
