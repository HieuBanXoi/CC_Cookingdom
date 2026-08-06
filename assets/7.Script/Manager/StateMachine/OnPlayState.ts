import { IGameState } from './IGameState';
import { GameManager } from '../GameManager';
import { UIManager } from '../../Tool/UIManager';

export class OnPlayState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        gameManager.isPlaying = true;
    }

    public OnExecute(gameManager: GameManager): void {
    }

    public OnExit(gameManager: GameManager): void {
        gameManager.isPlaying = false;
        UIManager.Ins.SetDownloadButtonsInteractable(false);
    }
}
