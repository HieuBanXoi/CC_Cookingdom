import { IGameState } from './IGameState';
import { GameManager } from '../GameManager';
import { World } from '../../../Manager/World';

export class WinState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        World.instance?.ui?.onWin();
        gameManager.isGotoStore = true;
    }

    public OnExecute(gameManager: GameManager): void {
    }

    public OnExit(gameManager: GameManager): void {
    }
}
