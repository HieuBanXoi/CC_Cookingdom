import { IGameState } from './IGameState';
import { GameManager } from '../GameManager';
import { World } from '../../../Manager/World';

export class LoseState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        World.instance?.ui?.onLose();
        gameManager.isGotoStore = true;
        gameManager.isPlaying = false;
    }

    public OnExecute(gameManager: GameManager): void {
    }

    public OnExit(gameManager: GameManager): void {
    }
}
