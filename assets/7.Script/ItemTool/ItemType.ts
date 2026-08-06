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
    Crust

}
Enum(ItemType);
