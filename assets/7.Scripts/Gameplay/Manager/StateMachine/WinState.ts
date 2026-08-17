import { IGameState } from './IGameState';
import { GameManager } from '../GameManager';
import { World } from '../../../Manager/World';
import { AppLovinAnalytics } from '../../../Tool/AppLovinAnalytics';

export class WinState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        AppLovinAnalytics.endcardShown();
        AppLovinAnalytics.challengeSolved();
        World.instance?.ui?.onWin();
        gameManager.isGotoStore = true;
    }

    public OnExecute(gameManager: GameManager): void {
    }

    public OnExit(gameManager: GameManager): void {
    }
}
