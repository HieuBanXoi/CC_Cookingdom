import { GameManager } from '../GameManager';
import { IGameState } from './IGameState';

/** Stops gameplay and redirects the next screen touch to the store. */
export class StopGameState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        gameManager.isPlaying = false;
        gameManager.isLoseGame = false;
        gameManager.isGotoStore = true;
    }

    public OnExecute(_gameManager: GameManager): void {
    }

    public OnExit(_gameManager: GameManager): void {
    }
}
