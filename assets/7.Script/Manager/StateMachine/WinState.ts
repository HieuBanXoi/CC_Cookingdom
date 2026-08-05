import { IGameState } from './IGameState';
import { GameManager } from '../GameManager';
import { UIManager } from '../../Tool/UIManager';

export class WinState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        UIManager.Ins.activeGameWinUI(true);
        UIManager.Ins.activeDownloadButtons(false);
        gameManager.isGotoStore = true;
    }

    public OnExecute(gameManager: GameManager): void {
    }

    public OnExit(gameManager: GameManager): void {
    }
}
