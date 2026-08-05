import { _decorator, Enum } from 'cc';

export enum ItemType {
    None = 0,
    SinkWaitting,
    SinkClosePos,
    CuttingBoard,
    ItemInWater,
    Plate,
    Sink,
    FoodOnCuttingBoard,
    Pan,
    PanBoiling,
    Fish,
    WetItem,
    Paper,
    Trash,
    PanCanStir,
    OvenSlot,
    Cucumber,
    Carrot,
    Avocado,
    BaseRongBien,
    RongBienCom,
    RongBienSot
}
Enum(ItemType);
