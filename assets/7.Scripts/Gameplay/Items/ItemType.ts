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
    Tray, BowlClam, PlateTomato,
    PlateGarlic, PlateOnion, PlateOlives

}
Enum(ItemType);
