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
    TrashBin,
    Paper,
    PaperBox,
    FoodWet,

}
Enum(ItemType);
