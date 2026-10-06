import { _decorator, Canvas, Enum, Node, Sprite, SpriteFrame, Tween, tween, UITransform, Vec3 } from 'cc';
import { GameManager } from './GameManager';
import { HandTutManager } from './HandTutManager';
import { Ply_Event } from '../Core/Base/Ply_Event';
import { Ply_Singleton } from '../Core/Base/Ply_Singleton';
import { FxType, Ply_SoundManager } from './Ply_SoundManager';
import { AppLovinAnalytics } from '../Platform/AppLovinAnalytics';

const { ccclass, property } = _decorator;

export enum PhaseTransitionType {
    HorizontalSlide = 0,
    VerticalSlide,
    ObjectTransition,
    /** Many copies of one sprite fly in from both sides, cover the screen, then fly back out. */
    SpriteSwarm,
}
Enum(PhaseTransitionType);

/** One sprite of the swarm transition. */
interface SwarmPiece {
    node: Node;
    target: Vec3;
    exit: Vec3;
    delay: number;
}

/** Inspector data for one playable phase. */
@ccclass('PhaseData')
export class PhaseData {
    @property({ type: Node, tooltip: 'Root node containing all objects of this phase.' })
    public phaseObject: Node | null = null;

    @property({ min: 0, tooltip: 'Number of successful steps required to finish this phase.' })
    public totalSteps = 1;

    @property({ type: Ply_Event, tooltip: 'Called after this phase reaches the centre and is playable.' })
    public onPhaseReady: Ply_Event = new Ply_Event();
}

/**
 * Controls a sequence of gameplay phases. Call DoOneStep() from each action
 * that counts toward the current phase; the manager moves on automatically
 * after that phase's configured number of steps.
 */
@ccclass('PhaseManager')
export class PhaseManager extends Ply_Singleton<PhaseManager> {
    @property({ type: [PhaseData], tooltip: 'Phases played in order.' })
    public phases: PhaseData[] = [];

    @property({ type: Enum(PhaseTransitionType) })
    public transitionType: PhaseTransitionType = PhaseTransitionType.HorizontalSlide;

    @property({ min: 0.01, tooltip: 'Duration of the incoming/outgoing slide.' })
    public transitionDuration = 1;

    @property({ min: 0, tooltip: 'Delay after completing a phase before its transition starts.' })
    public delayBeforeNextPhase = 2;

    @property public offScreenLeftX = -1500;
    @property public offScreenRightX = 1500;
    @property public offScreenBottomY = -1000;
    @property({ type: Node, tooltip: 'Overlay shown for Object Transition.' })
    public phaseTransitionObject: Node | null = null;

    @property({ min: 0.01, tooltip: 'How long the Object Transition overlay is visible.' })
    public phaseTransitionObjectDuration = 1.5;

    // ---------- Sprite Swarm transition ----------
    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, type: SpriteFrame, tooltip: 'Sprite được nhân bản để che màn hình khi chuyển phase.', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmSpriteFrame: SpriteFrame | null = null;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, type: Node, tooltip: 'Node chứa các sprite (nên là con trên cùng của Canvas). Trống = tự tạo dưới Canvas.', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmLayer: Node | null = null;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, min: 10, tooltip: 'Cỡ mỗi sprite (px, cạnh rộng).', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmSpriteSize = 320;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, range: [0.3, 1, 0.05], slide: true, tooltip: 'Khoảng cách lưới / cỡ sprite. Nhỏ hơn = chồng lên nhau nhiều hơn, che kín hơn.', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmSpacing = 0.4;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, min: 0, tooltip: 'Phủ rộng thêm ra ngoài màn hình (px) cho chắc không hở mép.', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmMargin = 150;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, tooltip: 'Scale ngẫu nhiên mỗi sprite (min, max).', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmScaleRange = new Vec3(0.9, 1.3, 0);

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, tooltip: 'Xoay ngẫu nhiên mỗi sprite.', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmRandomRotation = true;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, min: 0.05, tooltip: 'Thời gian mỗi sprite bay vào (giây).', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmInDuration = 0.5;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, min: 0, tooltip: 'Độ lệch thời gian ngẫu nhiên giữa các sprite (giây).', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmStagger = 0.35;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, min: 0, tooltip: 'Giữ che kín bao lâu (giây) trước khi bay ra.', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmHold = 0.2;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, min: 0.05, tooltip: 'Thời gian mỗi sprite bay ra (giây).', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmOutDuration = 0.5;

    @property({ group: { name: 'Sprite Swarm', id: 'swarm' }, min: 1, step: 1, tooltip: 'Giới hạn số sprite tối đa (an toàn hiệu năng).', visible: function (this: PhaseManager) { return this.transitionType === PhaseTransitionType.SpriteSwarm; } })
    public swarmMaxSprites = 500;

    private swarmPieces: SwarmPiece[] = [];

    @property({ readonly: true })
    public currentPhaseIndex = 0;

    @property({ readonly: true })
    public currentStepCount = 0;

    /** AppLovin CHALLENGE_PASS_25/50/75, as fractions of the total step count of all phases. */
    private static readonly PROGRESS_MILESTONES: readonly number[] = [0.25, 0.5, 0.75];
    /** Steps completed across every phase so far. */
    private totalStepsDone = 0;
    /** How many entries of PROGRESS_MILESTONES have been sent. */
    private reportedMilestoneCount = 0;

    /** Local centre position captured from the first active phase. */
    private centerScreenPosition = new Vec3();
    private isChangingPhase = false;
    private delayTween: Tween<Node> | null = null;
    private outgoingTween: Tween<Node> | null = null;
    private incomingTween: Tween<Node> | null = null;
    private transitionTween: Tween<Node> | null = null;

    public get CurrentPhaseObject(): Node | null {
        return this.phases[this.currentPhaseIndex]?.phaseObject ?? null;
    }

    /** Sum of totalSteps over every phase. */
    public get TotalSteps(): number {
        return this.phases.reduce((sum, phase) => sum + Math.max(0, phase?.totalSteps ?? 0), 0);
    }

    /** Overall playable progress in [0, 1]. */
    public get Progress(): number {
        const total = this.TotalSteps;
        return total > 0 ? Math.min(1, this.totalStepsDone / total) : 0;
    }

    protected onLoad(): void {
        super.onLoad();
        this.setupInitialPhase();
    }

    protected onDisable(): void {
        this.stopTransitionTweens();
    }

    protected onDestroy(): void {
        this.stopTransitionTweens();
        super.onDestroy();
    }

    /** Registers one completed gameplay action. Returns true when a phase ends. */
    public DoOneStep(): boolean {
        if (this.isChangingPhase || !this.hasCurrentPhase()) return false;

        this.currentStepCount++;
        this.totalStepsDone++;
        this.reportReachedProgressMilestones();

        if (!this.IsCurrentPhaseStepComplete()) return false;

        return this.TryEndCurrentPhase();
    }

    // =========================================================
    // APPLOVIN PROGRESS (CHALLENGE_PASS_25 / 50 / 75)
    // =========================================================

    /** Sends every milestone the current progress has reached and not yet reported, in order. */
    private reportReachedProgressMilestones(): void {
        const milestones = PhaseManager.PROGRESS_MILESTONES;
        const progress = this.Progress;
        while (this.reportedMilestoneCount < milestones.length && progress >= milestones[this.reportedMilestoneCount]) {
            this.sendProgressMilestone(this.reportedMilestoneCount);
            this.reportedMilestoneCount++;
        }
    }

    /**
     * Sends every milestone not reported yet. Call before CTA_CLICKED /
     * CHALLENGE_SOLVED so AppLovin always receives 25 -> 50 -> 75 first.
     */
    public ReportAllProgressMilestones(): void {
        const milestones = PhaseManager.PROGRESS_MILESTONES;
        while (this.reportedMilestoneCount < milestones.length) {
            this.sendProgressMilestone(this.reportedMilestoneCount);
            this.reportedMilestoneCount++;
        }
    }

    private sendProgressMilestone(index: number): void {
        switch (index) {
            case 0: AppLovinAnalytics.challenge25(); break;
            case 1: AppLovinAnalytics.challenge50(); break;
            case 2: AppLovinAnalytics.challenge75(); break;
        }
    }

    public IsCurrentPhaseStepComplete(): boolean {
        const phase = this.phases[this.currentPhaseIndex];
        return !!phase && this.currentStepCount >= Math.max(0, phase.totalSteps);
    }

    /** Starts the configured transition only if the current phase has all its steps. */
    public TryEndCurrentPhase(): boolean {
        if (this.isChangingPhase || !this.IsCurrentPhaseStepComplete()) return false;

        this.isChangingPhase = true;
        GameManager.Ins?.SetIsPlaying(false);
        HandTutManager.Ins?.PauseHandTut();
        Ply_SoundManager.Ins?.PlayFx(FxType.Complete);

        this.stopTransitionTweens();
        this.delayTween = tween(this.node)
            .delay(this.delayBeforeNextPhase)
            .call(() => this.beginPhaseTransition())
            .start();
        return true;
    }

    private setupInitialPhase(): void {
        if (this.phases.length === 0) return;

        this.currentPhaseIndex = Math.max(0, Math.min(this.currentPhaseIndex, this.phases.length - 1));
        for (let index = 0; index < this.phases.length; index++) {
            const phaseNode = this.phases[index]?.phaseObject;
            if (!phaseNode) continue;

            const isCurrent = index === this.currentPhaseIndex;
            phaseNode.active = isCurrent;
            if (!isCurrent) continue;

            Vec3.copy(this.centerScreenPosition, phaseNode.position);
            this.phases[index].onPhaseReady.invoke();
        }

        if (this.phaseTransitionObject) this.phaseTransitionObject.active = false;
    }

    private beginPhaseTransition(): void {
        this.delayTween = null;
        if (!this.hasNextPhase()) {
            this.finishGameByPhase();
            return;
        }

        if (this.transitionType === PhaseTransitionType.ObjectTransition && this.phaseTransitionObject) {
            this.playObjectTransition();
            return;
        }

        if (this.transitionType === PhaseTransitionType.SpriteSwarm && this.swarmSpriteFrame && this.playSwarmTransition()) {
            return;
        }

        this.slideToNextPhase();
    }

    private slideToNextPhase(): void {
        const oldPhase = this.CurrentPhaseObject;
        const newIndex = this.currentPhaseIndex + 1;
        const newPhase = this.phases[newIndex];
        const newNode = newPhase?.phaseObject ?? null;
        const duration = Math.max(0.01, this.transitionDuration);

        this.currentPhaseIndex = newIndex;
        this.currentStepCount = 0;

        if (oldPhase) {
            const oldTarget = this.transitionType === PhaseTransitionType.VerticalSlide
                ? new Vec3(this.centerScreenPosition.x, this.centerScreenPosition.y + this.offScreenBottomY, oldPhase.position.z)
                : new Vec3(this.centerScreenPosition.x + this.offScreenLeftX, this.centerScreenPosition.y, oldPhase.position.z);
            this.outgoingTween = tween(oldPhase)
                .to(duration, { position: oldTarget }, { easing: 'quadInOut' })
                .call(() => oldPhase.active = false)
                .start();
        }

        if (!newNode) {
            this.completeTransition();
            return;
        }

        const startPosition = this.transitionType === PhaseTransitionType.VerticalSlide
            ? new Vec3(this.centerScreenPosition.x, this.centerScreenPosition.y + this.offScreenBottomY, newNode.position.z)
            : new Vec3(this.centerScreenPosition.x + this.offScreenRightX, this.centerScreenPosition.y, newNode.position.z);
        const targetPosition = new Vec3(this.centerScreenPosition.x, this.centerScreenPosition.y, newNode.position.z);
        newNode.active = true;
        newNode.setPosition(startPosition);
        this.incomingTween = tween(newNode)
            .to(duration, { position: targetPosition }, { easing: 'quadInOut' })
            .call(() => this.completeTransition())
            .start();
    }

    private playObjectTransition(): void {
        const overlay = this.phaseTransitionObject!;
        overlay.active = true;
        const halfDuration = Math.max(0.01, this.phaseTransitionObjectDuration) * 0.5;
        this.transitionTween = tween(overlay)
            .delay(halfDuration)
            .call(() => this.switchPhaseImmediately())
            .delay(halfDuration)
            .call(() => {
                overlay.active = false;
                this.completeTransition();
            })
            .start();
    }

    // =========================================================
    // SPRITE SWARM TRANSITION
    // =========================================================

    /** Returns false when there is no Canvas to draw on (the caller then slides instead). */
    private playSwarmTransition(): boolean {
        const layer = this.getSwarmLayer();
        const layerTransform = layer?.getComponent(UITransform);
        const canvasTransform = this.findCanvas()?.getComponent(UITransform);
        if (!layer || !layerTransform || !canvasTransform) return false;

        this.clearSwarm();
        layer.active = true;
        layer.setSiblingIndex(layer.parent ? layer.parent.children.length - 1 : 0);

        // Visible screen in the layer's local space, whatever the device ratio.
        const screen = canvasTransform.getBoundingBoxToWorld();
        const min = layerTransform.convertToNodeSpaceAR(new Vec3(screen.xMin, screen.yMin, 0));
        const max = layerTransform.convertToNodeSpaceAR(new Vec3(screen.xMax, screen.yMax, 0));
        const margin = this.swarmMargin;
        const left = Math.min(min.x, max.x) - margin;
        const right = Math.max(min.x, max.x) + margin;
        const bottom = Math.min(min.y, max.y) - margin;
        const top = Math.max(min.y, max.y) + margin;
        const midX = (left + right) * 0.5;

        let size = Math.max(10, this.swarmSpriteSize);
        let cell = size * Math.max(0.3, this.swarmSpacing);
        let cols = Math.ceil((right - left) / cell) + 1;
        let rows = Math.ceil((top - bottom) / cell) + 1;
        // Wide screens (fold, landscape) would need more sprites than the budget:
        // grow the sprites and the grid together so the cover stays as dense.
        const budget = Math.max(1, this.swarmMaxSprites);
        if (cols * rows > budget) {
            const grow = Math.sqrt((cols * rows) / budget) * 1.05;
            size *= grow;
            cell *= grow;
            cols = Math.ceil((right - left) / cell) + 1;
            rows = Math.ceil((top - bottom) / cell) + 1;
        }

        const frame = this.swarmSpriteFrame!;
        const aspect = frame.rect.height > 0 ? frame.rect.height / frame.rect.width : 1;
        const width = right - left;
        const cells: Vec3[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const jitter = cell * 0.25;
                cells.push(new Vec3(
                    left + c * cell + (Math.random() * 2 - 1) * jitter,
                    bottom + r * cell + (Math.random() * 2 - 1) * jitter,
                    0,
                ));
            }
        }
        // Random draw order so the pile looks natural.
        cells.sort(() => Math.random() - 0.5);

        for (const target of cells.slice(0, this.swarmMaxSprites)) {
            const fromLeft = target.x < midX;
            const offset = width * 0.5 + size + Math.random() * size;
            const start = new Vec3(fromLeft ? left - offset + (target.x - left) * 0.3 : right + offset - (right - target.x) * 0.3, target.y, 0);
            const exit = new Vec3(fromLeft ? left - size * 1.5 - Math.random() * size : right + size * 1.5 + Math.random() * size, target.y + (Math.random() * 2 - 1) * size * 0.3, 0);

            const node = new Node('SwarmSprite');
            node.layer = layer.layer;
            const transform = node.addComponent(UITransform);
            transform.setContentSize(size, size * aspect);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            const range = this.swarmScaleRange;
            const scale = range.x + Math.random() * Math.max(0, range.y - range.x);
            node.setScale(scale, scale, 1);
            if (this.swarmRandomRotation) node.angle = Math.random() * 360;
            node.setParent(layer);
            node.setPosition(start);

            this.swarmPieces.push({ node, target, exit, delay: Math.random() * this.swarmStagger });
        }

        const pieces = this.swarmPieces;
        let arrived = 0;
        for (const piece of pieces) {
            tween(piece.node)
                .delay(piece.delay)
                .to(this.swarmInDuration, { position: piece.target }, { easing: 'quadOut' })
                .call(() => {
                    if (++arrived === pieces.length) this.onSwarmCovered(layer);
                })
                .start();
        }
        if (pieces.length === 0) this.onSwarmCovered(layer);
        return true;
    }

    /** The screen is hidden: swap the phases, then let the swarm fly back out to both sides. */
    private onSwarmCovered(layer: Node): void {
        this.transitionTween = tween(layer)
            .delay(this.swarmHold)
            .call(() => {
                this.switchPhaseImmediately();
                const pieces = this.swarmPieces;
                let gone = 0;
                for (const piece of pieces) {
                    tween(piece.node)
                        .delay(Math.random() * this.swarmStagger)
                        .to(this.swarmOutDuration, { position: piece.exit }, { easing: 'quadIn' })
                        .call(() => {
                            if (++gone !== pieces.length) return;
                            this.clearSwarm();
                            this.completeTransition();
                        })
                        .start();
                }
                if (pieces.length === 0) this.completeTransition();
            })
            .start();
    }

    private clearSwarm(): void {
        for (const piece of this.swarmPieces) {
            Tween.stopAllByTarget(piece.node);
            if (piece.node.isValid) piece.node.destroy();
        }
        this.swarmPieces = [];
    }

    private getSwarmLayer(): Node | null {
        if (this.swarmLayer?.isValid) {
            if (!this.swarmLayer.getComponent(UITransform)) this.swarmLayer.addComponent(UITransform);
            return this.swarmLayer;
        }

        const canvas = this.findCanvas();
        if (!canvas) return null;
        const layer = new Node('PhaseSwarmLayer');
        layer.layer = canvas.layer;
        layer.addComponent(UITransform);
        layer.setParent(canvas);
        this.swarmLayer = layer;
        return layer;
    }

    private findCanvas(): Node | null {
        if (this.swarmLayer?.isValid) {
            let node: Node | null = this.swarmLayer;
            while (node) {
                if (node.getComponent(Canvas)) return node;
                node = node.parent;
            }
        }
        return this.node.scene?.getComponentInChildren(Canvas)?.node ?? null;
    }

    private switchPhaseImmediately(): void {
        const oldNode = this.CurrentPhaseObject;
        this.currentPhaseIndex++;
        this.currentStepCount = 0;
        if (oldNode) oldNode.active = false;

        const newPhase = this.phases[this.currentPhaseIndex];
        const newNode = newPhase?.phaseObject;
        if (newNode) {
            newNode.setPosition(this.centerScreenPosition);
            newNode.active = true;
        }
    }

    private completeTransition(): void {
        this.isChangingPhase = false;
        this.outgoingTween = null;
        this.incomingTween = null;
        this.transitionTween = null;

        const phase = this.phases[this.currentPhaseIndex];
        phase?.onPhaseReady.invoke();
        if (!GameManager.Ins?.isLoseGame) GameManager.Ins?.SetIsPlaying(true);
        HandTutManager.Ins?.StartHandTutNoDelay();
    }

    private finishGameByPhase(): void {
        this.isChangingPhase = false;
        this.currentStepCount = 0;
        GameManager.Ins?.WinGame();
    }

    private hasCurrentPhase(): boolean {
        return this.currentPhaseIndex >= 0 && this.currentPhaseIndex < this.phases.length;
    }

    private hasNextPhase(): boolean {
        return this.currentPhaseIndex + 1 < this.phases.length;
    }

    private stopTransitionTweens(): void {
        this.delayTween?.stop();
        this.outgoingTween?.stop();
        this.incomingTween?.stop();
        this.transitionTween?.stop();
        this.clearSwarm();
        this.delayTween = null;
        this.outgoingTween = null;
        this.incomingTween = null;
        this.transitionTween = null;
    }
}
