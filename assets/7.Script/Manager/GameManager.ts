import { _decorator, Component, Node, input, Input, EventTouch } from 'cc';
import { Ply_Singleton } from '../Tool/Ply_Singleton';
import { UIManager } from '../Tool/UIManager';
import { IGameState } from './StateMachine/IGameState';
import { OnPlayState } from './StateMachine/OnPlayState';
import { WinState } from './StateMachine/WinState';
import { LoseState } from './StateMachine/LoseState';
import '../Tool/DOTween';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Ply_Singleton<GameManager> {

    @property
    public isPlaying: boolean = false;

    @property
    public isTutorial: boolean = true;

    @property
    public isGotoStore: boolean = false;

    @property
    public isLoseGame: boolean = false;

    @property
    public countMove: number = 0;

    @property
    public currentLayer: number = 0;

    private currentState: IGameState | null = null;

    protected onLoad() {
        super.onLoad();
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    protected start() {
        this.ChangeState(new OnPlayState());
    }

    protected update(dt: number) {
        if (this.currentState) {
            this.currentState.OnExecute(this);
        }
    }

    protected onDestroy() {
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    private onTouchEnd(event: EventTouch) {
        if (this.isGotoStore) {
            this.GotoStore();
        }
    }

    public ChangeState(newState: IGameState) {
        if (this.currentState) {
            this.currentState.OnExit(this);
        }

        this.currentState = newState;

        if (this.currentState) {
            this.currentState.OnEnter(this);
        }
    }

    public IsPlaying(): boolean {
        return this.isPlaying;
    }

    public SetIsPlaying(isPlaying: boolean) {
        this.isPlaying = isPlaying;
    }

    /**
     * Redirect to store (Left empty for user to implement)
     */
    public GotoStore() {
        console.log("Redirecting to store...");
    }

    public MoveOne() {
        this.countMove++;
        if (this.countMove === 100) {
            this.isPlaying = false;
            this.isGotoStore = true;
        }
    }

    public TurnOffTut() {
        if (this.isTutorial) {
            UIManager.Ins.activeTutorialUI(false);
            this.isTutorial = false;
        }
    }

    public WinGame() {
        this.isLoseGame = false;
        this.isPlaying = false;
        this.ChangeState(new WinState());
    }

    public LoseGame() {
        this.isLoseGame = true;
        this.isPlaying = false;
        this.ChangeState(new LoseState());
    }
}
