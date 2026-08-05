import { IGameState } from './IGameState';
import { GameManager } from '../GameManager';
import { UIManager } from '../../Tool/UIManager';

export class LoseState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        UIManager.Ins.activeGameLoseUI(true);
        gameManager.isGotoStore = true;
        gameManager.isPlaying = false;
    }

    public OnExecute(gameManager: GameManager): void {
    }

    public OnExit(gameManager: GameManager): void {
    }
}
