import { IGameState } from './IGameState';
import { GameManager } from '../GameManager';
import { World } from '../World';
import { AppLovinAnalytics } from '../../Platform/AppLovinAnalytics';
import { PhaseManager } from '../PhaseManager';

export class WinState implements IGameState {
    public OnEnter(gameManager: GameManager): void {
        // Winning without every step (e.g. WinGame() called directly) must still report 25/50/75 first.
        PhaseManager.Ins?.ReportAllProgressMilestones();
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
