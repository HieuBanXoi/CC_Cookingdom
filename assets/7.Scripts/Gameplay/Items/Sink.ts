import { _decorator, Node, Vec3, Size, UITransform, Tween, tween, Enum, ParticleSystem2D, math } from 'cc';
import { Item } from './Item';
import { Ply_Event } from '../../Core/Base/Ply_Event';
import { Ply_SoundManager, FxType } from '../../Managers/Ply_SoundManager';
import { PhaseManager } from '../../Managers/PhaseManager';
import { HandTutManager } from '../../Managers/HandTutManager';

const { ccclass, property } = _decorator;

export enum SinkWaterState {
    Empty = 0,
    Rising = 1,
    Full = 2,
    Falling = 3,
    Paused = 4
}
Enum(SinkWaterState);

@ccclass('Sink')
export class Sink extends Item {

    @property({ tooltip: 'Is sink drain closed (plugged)' })
    public isClose: boolean = false;

    @property({ tooltip: 'If true, water only rises when isClose is true. If false, water rises whenever faucet is on' })
    public requireCloseToRise: boolean = false;

    @property({ tooltip: 'Is water faucet turned on' })
    public isWaterDrop: boolean = false;

    @property({ tooltip: 'Is basin currently full of water' })
    public isWaterIn: boolean = false;

    @property(Node)
    public waterSplashPos: Node = null!;

    @property({ type: Enum(SinkWaterState), tooltip: 'Current water state in the basin' })
    public waterState: SinkWaterState = SinkWaterState.Empty;

    @property({ type: Node, tooltip: 'Water stream node from faucet' })
    public faucetWaterNode: Node = null!;

    @property({ type: Node, tooltip: 'Particle Node for water drops / stream' })
    public waterParticleNode: Node = null!;

    @property({ type: ParticleSystem2D, tooltip: 'ParticleSystem2D for water drops (optional)' })
    public waterParticle: ParticleSystem2D = null!;

    @property({ type: Node, tooltip: 'Basin water Node. Its default UITransform represents FULL water state' })
    public waterIn: Node = null!;

    @property({ type: Node, tooltip: 'Reference Node whose UITransform represents EMPTY water state' })
    public emptyWaterNode: Node = null!;

    @property({ min: 0, tooltip: 'Duration for water to rise from empty to full' })
    public waterRiseDuration: number = 2.0;

    @property({ min: 0, tooltip: 'Duration for water to drain from full to empty' })
    public waterFallDuration: number = 1.0;

    @property(Node)
    public waterDropTransform: Node = null!;

    @property(Vec3)
    public emptyWaterDropPoint: Vec3 = new Vec3(0, 0, 0);

    @property(Vec3)
    public fullWaterDropPoint: Vec3 = new Vec3(0, 0, 0);

    @property({ type: Ply_Event, tooltip: 'Triggered when water basin becomes full' })
    public onWaterIn: Ply_Event = new Ply_Event();

    @property({ type: Ply_Event, tooltip: 'Triggered when water basin becomes empty' })
    public onNoWaterIn: Ply_Event = new Ply_Event();

    public WaterTransitionChanged: ((isTransitioning: boolean) => void) | null = null;

    public inWaterItems: any[] = [];

    private desiredWaterOn: boolean = false;
    private displayedWaterOn: boolean = false;
    private initialized: boolean = false;
    private hasCachedFullState: boolean = false;

    private waterUITransform: UITransform | null = null;
    private fullSize: Size = new Size(0, 0);
    private fullPos: Vec3 = new Vec3(0, 0, 0);
    private emptySize: Size = new Size(0, 0);
    private emptyPos: Vec3 = new Vec3(0, 0, 0);

    private currentWaterProgress: number = 0; // 0 = empty, 1 = full
    private waterTween: Tween<object> | null = null;

    public get WaterState(): SinkWaterState {
        return this.waterState;
    }

    public get IsWaterTransitioning(): boolean {
        return this.waterState === SinkWaterState.Rising || this.waterState === SinkWaterState.Falling;
    }

    public get CanWaterRise(): boolean {
        return (!this.requireCloseToRise || this.isClose) && this.waterState !== SinkWaterState.Full;
    }

    protected onLoad() {
        super.onLoad();
        this.cacheWaterTransform(true);
    }

    protected start() {
        this.initializeState();
    }

    protected onDisable() {
        this.killWaterTween();
    }

    public TurnOnWater() {
        this.ensureInitialized();
        this.desiredWaterOn = true;
        this.isWaterDrop = true;
        this.displayedWaterOn = true;
        this.setFaucetActive(true);
        Ply_SoundManager.Ins?.PlayFxLoop(FxType.WaterDrop);

        if (this.CanWaterRise) {
            this.beginWaterRise();
            return;
        }

        this.evaluateStableState();
    }

    public TurnOffWater() {
        this.ensureInitialized();
        this.desiredWaterOn = false;
        this.isWaterDrop = false;
        this.displayedWaterOn = false;
        this.setFaucetActive(false);
        Ply_SoundManager.Ins?.StopFxLoop(FxType.WaterDrop);

        if (this.waterState === SinkWaterState.Rising) {
            this.pauseWaterRise();
            return;
        }

        this.evaluateStableState();
    }

    public Close() {
        this.ensureInitialized();
        this.isClose = true;

        if (this.desiredWaterOn && this.waterState !== SinkWaterState.Full) {
            this.beginWaterRise();
            return;
        }

        this.evaluateStableState();
    }

    public Open() {
        this.ensureInitialized();
        this.isClose = false;

        if (this.requireCloseToRise && this.waterState !== SinkWaterState.Empty) {
            this.beginWaterFall();
            return;
        }

        this.evaluateStableState();
    }

    public CompleteWaterRise() {
        if (this.waterState !== SinkWaterState.Rising) return;

        this.waterState = SinkWaterState.Full;
        this.currentWaterProgress = 1.0;
        this.applyWaterLevel(1.0);
        this.setWaterIn(true);
        this.endTransition();
    }

    public CompleteWaterFall() {
        if (this.waterState !== SinkWaterState.Falling) return;

        this.waterState = SinkWaterState.Empty;
        this.currentWaterProgress = 0.0;
        this.setWaterIn(false);
        this.applyWaterLevel(0.0);
        this.setBasinActive(false);
        this.endTransition();
    }

    public IsWaterIn() {
        this.waterState = SinkWaterState.Full;
        this.currentWaterProgress = 1.0;
        this.applyWaterLevel(1.0);
        this.setWaterIn(true);
    }

    public NoWaterIn() {
        this.waterState = SinkWaterState.Empty;
        this.currentWaterProgress = 0.0;
        this.applyWaterLevel(0.0);
        this.setWaterIn(false);
    }

    public CheckEndPhaseCondition(): boolean {
        const canEndPhase = !HandTutManager.Ins;
        if (canEndPhase && PhaseManager.Ins && PhaseManager.Ins.IsCurrentPhaseStepComplete()) {
            PhaseManager.Ins.TryEndCurrentPhase();
        }
        return canEndPhase;
    }

    public PlayWaterOutSound() {
        Ply_SoundManager.Ins?.PlayFx(FxType.WaterOut);
    }

    public RegisterInWaterItem(item: any) {
        if (!item) return;
        item.sink = this;
        if (this.inWaterItems.indexOf(item) === -1) {
            this.inWaterItems.push(item);
        }
    }

    public UnregisterInWaterItem(item: any) {
        if (!item) return;
        if (typeof item.StopWaterEffects === 'function') {
            item.StopWaterEffects();
        }
        const index = this.inWaterItems.indexOf(item);
        if (index !== -1) {
            this.inWaterItems.splice(index, 1);
        }
    }

    private cacheWaterTransform(forceFullCache: boolean = false) {
        if (this.waterIn) {
            this.waterUITransform = this.waterIn.getComponent(UITransform);
            if (!this.hasCachedFullState || forceFullCache) {
                if (this.waterUITransform) {
                    this.fullSize = new Size(this.waterUITransform.contentSize.width, this.waterUITransform.contentSize.height);
                }
                this.fullPos = this.waterIn.position.clone();
                this.hasCachedFullState = true;
            }
        }

        if (this.emptyWaterNode) {
            const emptyUI = this.emptyWaterNode.getComponent(UITransform);
            if (emptyUI) {
                this.emptySize = new Size(emptyUI.contentSize.width, emptyUI.contentSize.height);
            } else {
                this.emptySize = new Size(this.fullSize.width, 0);
            }
            this.emptyPos = this.emptyWaterNode.position.clone();
        } else {
            this.emptySize = new Size(this.fullSize.width, 0);
            this.emptyPos = this.fullPos.clone();
        }
    }

    private initializeState() {
        if (this.initialized) return;
        this.initialized = true;

        this.cacheWaterTransform(true);

        this.desiredWaterOn = this.isWaterDrop;
        this.displayedWaterOn = this.desiredWaterOn;
        this.waterState = this.isWaterIn ? SinkWaterState.Full : SinkWaterState.Empty;
        this.currentWaterProgress = this.waterState === SinkWaterState.Full ? 1.0 : 0.0;

        this.applyWaterLevel(this.currentWaterProgress);
        this.applyStableVisuals();

        if (this.waterState === SinkWaterState.Full) {
            this.startInWaterItems();
        }
    }

    private ensureInitialized() {
        if (!this.initialized) {
            this.initializeState();
        }
    }

    private evaluateStableState() {
        if (this.waterState === SinkWaterState.Empty && this.desiredWaterOn && this.CanWaterRise) {
            this.beginWaterRise();
            return;
        }

        if (this.waterState === SinkWaterState.Full && this.requireCloseToRise && !this.isClose) {
            this.beginWaterFall();
            return;
        }

        this.applyStableVisuals();
    }

    private beginWaterRise() {
        if (this.waterState === SinkWaterState.Full) return;

        const remainingDistance = 1.0 - this.currentWaterProgress;
        if (remainingDistance <= 0.001) {
            this.waterState = SinkWaterState.Rising;
            this.CompleteWaterRise();
            return;
        }

        this.waterState = SinkWaterState.Rising;
        this.displayedWaterOn = true;
        this.setFaucetActive(true);
        this.setBasinActive(true);
        this.WaterTransitionChanged?.(true);

        const duration = this.waterRiseDuration * remainingDistance;
        this.tweenWaterLevel(1.0, duration, () => {
            this.CompleteWaterRise();
        });
    }

    private beginWaterFall() {
        if (this.waterState === SinkWaterState.Empty) return;

        const remainingDistance = this.currentWaterProgress;
        if (remainingDistance <= 0.001) {
            this.waterState = SinkWaterState.Falling;
            this.CompleteWaterFall();
            return;
        }

        this.waterState = SinkWaterState.Falling;
        this.setWaterIn(false);
        this.WaterTransitionChanged?.(true);

        this.setBasinActive(true);
        if (this.displayedWaterOn) {
            this.setFaucetActive(true);
        }

        const duration = this.waterFallDuration * remainingDistance;
        this.tweenWaterLevel(0.0, duration, () => {
            this.CompleteWaterFall();
        });
    }

    private pauseWaterRise() {
        this.killWaterTween();

        if (this.currentWaterProgress <= 0.001) {
            this.waterState = SinkWaterState.Empty;
            this.playBasinEmpty();
        } else {
            this.waterState = SinkWaterState.Paused;
            this.setBasinActive(true);
        }

        this.WaterTransitionChanged?.(false);
    }

    private endTransition() {
        this.applyStableVisuals();
        this.WaterTransitionChanged?.(false);
        this.evaluateStableState();
    }

    private applyStableVisuals() {
        this.displayedWaterOn = this.desiredWaterOn;
        this.setFaucetActive(this.displayedWaterOn);

        if (this.waterState === SinkWaterState.Full) {
            this.setBasinActive(true);
            this.applyWaterLevel(1.0);
        } else if (this.waterState === SinkWaterState.Empty) {
            this.playBasinEmpty();
        } else if (this.waterState === SinkWaterState.Paused) {
            this.setBasinActive(true);
        }
    }

    private playBasinEmpty() {
        this.applyWaterLevel(0.0);
        this.setBasinActive(false);
    }

    private tweenWaterLevel(targetProgress: number, duration: number, onComplete?: () => void) {
        this.cacheWaterTransform(false);
        this.killWaterTween();

        if (!this.waterIn || duration <= 0) {
            this.applyWaterLevel(targetProgress);
            onComplete?.();
            return;
        }

        this.setBasinActive(true);
        const startProgress = this.currentWaterProgress;
        const animState = { progress: startProgress };

        this.waterTween = tween(animState)
            .to(duration, { progress: targetProgress }, {
                easing: 'sineInOut',
                onUpdate: (state: any) => {
                    this.applyWaterLevel(state.progress);
                }
            })
            .call(() => {
                this.waterTween = null;
                this.applyWaterLevel(targetProgress);
                onComplete?.();
            })
            .start();
    }

    private killWaterTween() {
        if (this.waterTween) {
            this.waterTween.stop();
            this.waterTween = null;
        }
    }

    private applyWaterLevel(progress: number) {
        this.currentWaterProgress = math.clamp01(progress);

        if (this.waterIn) {
            if (!this.waterUITransform) {
                this.waterUITransform = this.waterIn.getComponent(UITransform);
            }

            if (this.currentWaterProgress > 0.001 && !this.waterIn.active) {
                this.waterIn.active = true;
            }

            if (this.waterUITransform) {
                const curW = math.lerp(this.emptySize.width, this.fullSize.width, this.currentWaterProgress);
                const curH = math.lerp(this.emptySize.height, this.fullSize.height, this.currentWaterProgress);
                this.waterUITransform.setContentSize(curW, curH);
            }

            const curX = math.lerp(this.emptyPos.x, this.fullPos.x, this.currentWaterProgress);
            const curY = math.lerp(this.emptyPos.y, this.fullPos.y, this.currentWaterProgress);
            const curZ = math.lerp(this.emptyPos.z, this.fullPos.z, this.currentWaterProgress);
            this.waterIn.setPosition(curX, curY, curZ);
        }

        if (this.waterDropTransform) {
            const dropX = math.lerp(this.emptyWaterDropPoint.x, this.fullWaterDropPoint.x, this.currentWaterProgress);
            const dropY = math.lerp(this.emptyWaterDropPoint.y, this.fullWaterDropPoint.y, this.currentWaterProgress);
            const dropZ = math.lerp(this.emptyWaterDropPoint.z, this.fullWaterDropPoint.z, this.currentWaterProgress);
            this.waterDropTransform.setPosition(dropX, dropY, dropZ);
        }
    }

    private setWaterIn(value: boolean) {
        if (this.isWaterIn === value) {
            if (!value) {
                this.stopInWaterItems();
            }
            return;
        }

        this.isWaterIn = value;
        if (value) {
            this.startInWaterItems();
            this.onWaterIn.invoke();
        } else {
            this.stopInWaterItems();
            this.onNoWaterIn.invoke();
        }
    }

    private startInWaterItems() {
        for (let i = this.inWaterItems.length - 1; i >= 0; i--) {
            const item = this.inWaterItems[i];
            if (!item || !item.node || !item.node.isValid) {
                this.inWaterItems.splice(i, 1);
                continue;
            }

            item.sink = this;
            if (typeof item.StartWaterEffects === 'function') {
                item.StartWaterEffects();
            }
        }
    }

    private stopInWaterItems() {
        for (let i = this.inWaterItems.length - 1; i >= 0; i--) {
            const item = this.inWaterItems[i];
            if (!item || !item.node || !item.node.isValid) {
                this.inWaterItems.splice(i, 1);
                continue;
            }

            if (typeof item.StopWaterEffects === 'function') {
                item.StopWaterEffects();
            }
        }
    }

    private setFaucetActive(value: boolean) {
        if (this.faucetWaterNode) {
            this.faucetWaterNode.active = value;
        }

        if (this.waterParticleNode) {
            this.waterParticleNode.active = value;
        }

        if (this.waterParticle) {
            if (value) {
                this.waterParticle.node.active = true;
                this.waterParticle.resetSystem();
            } else {
                this.waterParticle.stopSystem();
            }
        }
    }

    private setBasinActive(value: boolean) {
        if (this.waterIn) {
            this.waterIn.active = value;
        }
    }
}
