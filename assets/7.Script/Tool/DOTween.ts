import { Color, director, Director, Node, UIOpacity, Vec2, Vec3 } from 'cc';

export type EaseFunction = (time: number) => number;
export type TweenCallback = () => void;
export type TweenUpdateCallback = (progress: number) => void;

export enum Ease {
    Linear = 'linear',
    InSine = 'inSine',
    OutSine = 'outSine',
    InOutSine = 'inOutSine',
    InQuad = 'inQuad',
    OutQuad = 'outQuad',
    InOutQuad = 'inOutQuad',
    InCubic = 'inCubic',
    OutCubic = 'outCubic',
    InOutCubic = 'inOutCubic',
    InQuart = 'inQuart',
    OutQuart = 'outQuart',
    InOutQuart = 'inOutQuart',
    InBack = 'inBack',
    OutBack = 'outBack',
    InOutBack = 'inOutBack',
    OutBounce = 'outBounce',
    OutElastic = 'outElastic',
}

export enum LoopType {
    Restart,
    Yoyo,
    Incremental,
}

export enum TweenState {
    Playing,
    Paused,
    Complete,
    Killed,
}

const EPSILON = 1e-7;

const EaseMap: Record<string, EaseFunction> = {
    linear: t => t,
    inSine: t => 1 - Math.cos((t * Math.PI) / 2),
    outSine: t => Math.sin((t * Math.PI) / 2),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    inCubic: t => t * t * t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    inQuart: t => t * t * t * t,
    outQuart: t => 1 - Math.pow(1 - t, 4),
    inOutQuart: t => t < 0.5 ? 8 * Math.pow(t, 4) : 1 - Math.pow(-2 * t + 2, 4) / 2,
    inBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
    outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    inOutBack: t => t < 0.5
        ? Math.pow(2 * t, 2) * ((2.5949095 + 1) * 2 * t - 2.5949095) / 2
        : (Math.pow(2 * t - 2, 2) * ((2.5949095 + 1) * (t * 2 - 2) + 2.5949095) + 2) / 2,
    outBounce: t => {
        const n = 7.5625;
        const d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
    },
    outElastic: t => {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    },
};

function resolveEase(ease: Ease | string | EaseFunction): EaseFunction {
    if (typeof ease === 'function') return ease;
    return EaseMap[ease] ?? EaseMap.linear;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/** Base fluent API shared by Tweeners and Sequences. */
export abstract class TweenBase {
    protected durationValue: number;
    protected delayValue = 0;
    protected loopsValue = 1;
    protected loopTypeValue = LoopType.Restart;
    protected easeValue: EaseFunction = EaseMap.linear;
    protected elapsed = 0;
    protected stateValue = TweenState.Playing;
    protected started = false;
    protected initialized = false;
    protected completedLoops = 0;
    protected timeScaleValue = 1;
    protected independentUpdate = false;
    protected autoKillValue = true;
    protected parented = false;
    protected idValue: string | number | null = null;
    protected lastAppliedIteration = -1;

    protected onStartCallback: TweenCallback | null = null;
    protected onPlayCallback: TweenCallback | null = null;
    protected onPauseCallback: TweenCallback | null = null;
    protected onUpdateCallback: TweenUpdateCallback | null = null;
    protected onStepCompleteCallback: TweenCallback | null = null;
    protected onCompleteCallback: TweenCallback | null = null;
    protected onKillCallback: TweenCallback | null = null;
    private completionWaiters: Array<() => void> = [];

    public constructor(public readonly target: unknown, duration: number) {
        this.durationValue = Math.max(0, duration);
        DOTween.register(this);
    }

    public SetEase(ease: Ease | string | EaseFunction): this {
        this.easeValue = resolveEase(ease);
        return this;
    }

    public SetDelay(delay: number): this {
        this.delayValue = Math.max(0, delay);
        return this;
    }

    public SetLoops(loops: number, loopType: LoopType = LoopType.Restart): this {
        this.loopsValue = loops < 0 ? -1 : Math.max(1, Math.floor(loops));
        this.loopTypeValue = loopType;
        return this;
    }

    public SetRelative(relative = true): this {
        this.setRelativeInternal(relative);
        return this;
    }

    public SetUpdate(independentUpdate = true): this {
        this.independentUpdate = independentUpdate;
        return this;
    }

    public SetAutoKill(autoKill = true): this {
        this.autoKillValue = autoKill;
        return this;
    }

    public SetId(id: string | number): this {
        this.idValue = id;
        return this;
    }

    public SetTimeScale(timeScale: number): this {
        this.timeScaleValue = Math.max(0, timeScale);
        return this;
    }

    public OnStart(callback: TweenCallback): this { this.onStartCallback = callback; return this; }
    public OnPlay(callback: TweenCallback): this { this.onPlayCallback = callback; return this; }
    public OnPause(callback: TweenCallback): this { this.onPauseCallback = callback; return this; }
    public OnUpdate(callback: TweenUpdateCallback): this { this.onUpdateCallback = callback; return this; }
    public OnStepComplete(callback: TweenCallback): this { this.onStepCompleteCallback = callback; return this; }
    public OnComplete(callback: TweenCallback): this { this.onCompleteCallback = callback; return this; }
    public OnKill(callback: TweenCallback): this { this.onKillCallback = callback; return this; }

    public Play(): this {
        if (this.stateValue === TweenState.Killed || this.stateValue === TweenState.Complete) return this;
        const wasPaused = this.stateValue === TweenState.Paused;
        this.stateValue = TweenState.Playing;
        DOTween.register(this);
        if (wasPaused) this.onPlayCallback?.();
        return this;
    }

    public Pause(): this {
        if (this.stateValue === TweenState.Playing) {
            this.stateValue = TweenState.Paused;
            this.onPauseCallback?.();
        }
        return this;
    }

    public TogglePause(): this {
        return this.stateValue === TweenState.Playing ? this.Pause() : this.Play();
    }

    public Restart(includeDelay = true): this {
        this.resetRuntime(includeDelay);
        this.stateValue = TweenState.Playing;
        DOTween.register(this);
        return this;
    }

    public Rewind(includeDelay = true): this {
        this.resetRuntime(includeDelay);
        this.ensureInitialized();
        this.applyAtActiveTime(0, true);
        this.stateValue = TweenState.Paused;
        DOTween.unregister(this);
        return this;
    }

    public Goto(time: number, andPlay = false): this {
        this.ensureInitialized();
        const max = this.loopsValue < 0 ? Number.MAX_SAFE_INTEGER : this.durationValue * this.loopsValue;
        const activeTime = Math.max(0, Math.min(time, max));
        this.elapsed = this.delayValue + activeTime;
        this.applyAtActiveTime(activeTime, true);
        this.stateValue = andPlay ? TweenState.Playing : TweenState.Paused;
        if (andPlay) DOTween.register(this); else DOTween.unregister(this);
        return this;
    }

    public Complete(withCallbacks = true): this {
        if (this.stateValue === TweenState.Killed) return this;
        this.ensureInitialized();
        const finalIteration = this.loopsValue < 0 ? Math.max(0, this.completedLoops) : this.loopsValue - 1;
        this.applyValue(this.finalProgress(finalIteration), finalIteration, 1);
        this.stateValue = TweenState.Complete;
        DOTween.unregister(this);
        if (withCallbacks) this.finishCompletion();
        return this;
    }

    public Kill(complete = false): void {
        if (this.stateValue === TweenState.Killed) return;
        if (complete) this.Complete(true);
        this.stateValue = TweenState.Killed;
        DOTween.unregister(this);
        this.onKillCallback?.();
        this.resolveWaiters();
    }

    public AsyncWaitForCompletion(): Promise<void> {
        if (this.stateValue === TweenState.Complete || this.stateValue === TweenState.Killed) return Promise.resolve();
        return new Promise(resolve => this.completionWaiters.push(resolve));
    }

    public IsActive(): boolean { return this.stateValue !== TweenState.Killed && this.stateValue !== TweenState.Complete; }
    public IsPlaying(): boolean { return this.stateValue === TweenState.Playing; }
    public IsComplete(): boolean { return this.stateValue === TweenState.Complete; }
    public Duration(includeLoops = true): number {
        if (!includeLoops) return this.durationValue;
        return this.loopsValue < 0 ? Infinity : this.delayValue + this.durationValue * this.loopsValue;
    }
    public Elapsed(): number { return Math.max(0, this.elapsed - this.delayValue); }
    public ElapsedPercentage(): number { return this.durationValue <= 0 ? 1 : clamp01((this.elapsed - this.delayValue) / this.durationValue); }
    public Id(): string | number | null { return this.idValue; }

    public _update(scaledDelta: number, unscaledDelta: number): void {
        if (this.parented || this.stateValue !== TweenState.Playing) return;
        if (!this.isTargetValid()) {
            this.Kill(false);
            return;
        }

        const delta = (this.independentUpdate ? unscaledDelta : scaledDelta) * this.timeScaleValue;
        if (delta <= 0) return;
        const previousActive = this.elapsed - this.delayValue;
        this.elapsed += delta;
        const activeTime = this.elapsed - this.delayValue;
        if (activeTime < 0) return;

        if (!this.started) {
            this.started = true;
            this.ensureInitialized();
            this.onStartCallback?.();
            this.onPlayCallback?.();
        }

        const totalDuration = this.loopsValue < 0 ? Infinity : this.durationValue * this.loopsValue;
        this.emitStepCallbacks(Math.max(0, previousActive), Math.min(activeTime, totalDuration));

        if (this.durationValue <= EPSILON || activeTime >= totalDuration) {
            const finalIteration = this.loopsValue < 0 ? this.completedLoops : this.loopsValue - 1;
            this.applyValue(this.finalProgress(finalIteration), finalIteration, 1);
            this.onUpdateCallback?.(1);
            this.stateValue = TweenState.Complete;
            DOTween.unregister(this);
            this.finishCompletion();
            return;
        }

        this.applyAtActiveTime(activeTime, false);
    }

    public _setParented(): void {
        this.parented = true;
        DOTween.unregister(this);
        this.stateValue = TweenState.Paused;
    }

    public _sampleFromSequence(localTime: number, previousLocalTime: number): void {
        if (localTime < this.delayValue) return;
        if (!this.started) {
            this.started = true;
            this.ensureInitialized();
            this.onStartCallback?.();
            this.onPlayCallback?.();
        }

        const active = Math.max(0, localTime - this.delayValue);
        const previousActive = Math.max(0, previousLocalTime - this.delayValue);
        const full = this.loopsValue < 0 ? Infinity : this.durationValue * this.loopsValue;
        this.emitStepCallbacks(previousActive, Math.min(active, full));
        this.applyAtActiveTime(Math.min(active, full), false);

        if (active >= full && this.stateValue !== TweenState.Complete) {
            this.stateValue = TweenState.Complete;
            this.finishCompletion();
        }
    }

    public _resetSequenceRuntime(): void {
        this.resetRuntime(true);
        this.stateValue = TweenState.Paused;
    }

    protected setRelativeInternal(_relative: boolean): void { }
    protected isTargetValid(): boolean {
        return !(this.target instanceof Node) || this.target.isValid;
    }
    protected abstract initializeValue(): void;
    protected abstract applyValue(easedProgress: number, iteration: number, rawProgress: number): void;

    private ensureInitialized(): void {
        if (this.initialized) return;
        this.initializeValue();
        this.initialized = true;
    }

    private applyAtActiveTime(activeTime: number, forceUpdate: boolean): void {
        this.ensureInitialized();
        if (this.durationValue <= EPSILON) {
            this.applyValue(1, 0, 1);
            if (!forceUpdate) this.onUpdateCallback?.(1);
            return;
        }

        const finiteLoops = this.loopsValue < 0 ? Number.MAX_SAFE_INTEGER : this.loopsValue;
        const isAtEnd = this.loopsValue >= 0 && activeTime >= this.durationValue * finiteLoops;
        const iteration = isAtEnd
            ? finiteLoops - 1
            : Math.max(0, Math.floor(activeTime / this.durationValue));
        const raw = isAtEnd ? 1 : clamp01((activeTime - iteration * this.durationValue) / this.durationValue);
        const directedRaw = this.loopTypeValue === LoopType.Yoyo && iteration % 2 === 1 ? 1 - raw : raw;
        const eased = this.easeValue(clamp01(directedRaw));
        this.lastAppliedIteration = iteration;
        this.applyValue(eased, iteration, directedRaw);
        if (!forceUpdate) this.onUpdateCallback?.(directedRaw);
    }

    private finalProgress(iteration: number): number {
        return this.loopTypeValue === LoopType.Yoyo && iteration % 2 === 1 ? 0 : 1;
    }

    private emitStepCallbacks(previousActive: number, active: number): void {
        if (this.durationValue <= EPSILON) return;
        const oldLoops = Math.floor((previousActive + EPSILON) / this.durationValue);
        const newLoops = Math.floor((active + EPSILON) / this.durationValue);
        const maxLoops = this.loopsValue < 0 ? newLoops : Math.min(newLoops, this.loopsValue);
        for (let i = oldLoops; i < maxLoops; i++) {
            this.completedLoops = i + 1;
            this.onStepCompleteCallback?.();
        }
    }

    private resetRuntime(includeDelay: boolean): void {
        this.elapsed = includeDelay ? 0 : this.delayValue;
        this.started = false;
        this.completedLoops = 0;
        this.lastAppliedIteration = -1;
        this.stateValue = TweenState.Paused;
        this.resetChildrenRuntime();
    }

    protected resetChildrenRuntime(): void { }

    private finishCompletion(): void {
        this.onCompleteCallback?.();
        this.resolveWaiters();
        if (this.autoKillValue) this.onKillCallback?.();
    }

    private resolveWaiters(): void {
        const waiters = this.completionWaiters.splice(0);
        for (const resolve of waiters) resolve();
    }
}

type PropertyMode = 'normal' | 'jump' | 'punch';

/** A property tween returned by DOMove/DOScale/DOFade/etc. */
export class Tweener<T> extends TweenBase {
    private startValue!: T;
    private resolvedEndValue!: T;
    private relative = false;
    private from = false;
    private fromValue: T | null = null;
    private snapping = false;

    public constructor(
        target: unknown,
        duration: number,
        private readonly getter: () => T,
        private readonly setter: (value: T) => void,
        private endValue: T,
        private readonly cloneValue: (value: T) => T,
        private readonly lerpValue: (start: T, end: T, time: number) => T,
        private readonly addValue: (a: T, b: T) => T,
        private readonly subtractValue: (a: T, b: T) => T,
        private readonly scaleValue: (value: T, scalar: number) => T,
        private readonly mode: PropertyMode = 'normal',
        private readonly jumpPower = 0,
        private readonly vibrato = 10,
        private readonly elasticity = 1,
    ) {
        super(target, duration);
    }

    public From(fromValue?: T, setImmediately = true): this {
        this.from = true;
        this.fromValue = fromValue == null ? null : this.cloneValue(fromValue);
        if (setImmediately && fromValue != null) this.setter(this.cloneValue(fromValue));
        return this;
    }

    public SetSnapping(snapping = true): this { this.snapping = snapping; return this; }

    public ChangeEndValue(endValue: T, snapStartValue = false): this {
        this.endValue = this.cloneValue(endValue);
        this.initialized = false;
        if (snapStartValue) this.elapsed = 0;
        return this;
    }

    protected setRelativeInternal(relative: boolean): void { this.relative = relative; }

    protected initializeValue(): void {
        const current = this.cloneValue(this.getter());
        if (this.mode === 'punch') {
            this.startValue = current;
            this.resolvedEndValue = current;
            return;
        }

        if (this.from) {
            this.startValue = this.cloneValue(this.fromValue ?? this.endValue);
            this.resolvedEndValue = current;
            this.setter(this.cloneValue(this.startValue));
        } else {
            this.startValue = current;
            this.resolvedEndValue = this.relative
                ? this.addValue(current, this.endValue)
                : this.cloneValue(this.endValue);
        }
    }

    protected applyValue(easedProgress: number, iteration: number, rawProgress: number): void {
        let value: T;
        if (this.mode === 'punch') {
            const decay = Math.pow(1 - clamp01(rawProgress), Math.max(0.01, this.elasticity));
            const wave = Math.sin(clamp01(rawProgress) * Math.PI * Math.max(1, this.vibrato));
            value = this.addValue(this.startValue, this.scaleValue(this.endValue, wave * decay));
        } else {
            value = this.lerpValue(this.startValue, this.resolvedEndValue, easedProgress);
            if (this.mode === 'jump') {
                // DOTween builds the vertical motion from an OutQuad tween
                // played Yoyo for every jump. One complete hop is therefore
                // the parabola 4t(1-t), rather than a floaty sine arch.
                const jumpCount = Math.max(1, Math.floor(this.vibrato));
                const overall = clamp01(rawProgress);
                const scaled = overall * jumpCount;
                const jumpPhase = overall >= 1 ? 1 : scaled - Math.floor(scaled);
                const jump = 4 * jumpPhase * (1 - jumpPhase) * Math.abs(this.jumpPower);
                const vector = value as unknown as Vec3;
                value = new Vec3(vector.x, vector.y + jump, vector.z) as unknown as T;
            }
            if (this.loopTypeValue === LoopType.Incremental && iteration > 0) {
                const delta = this.subtractValue(this.resolvedEndValue, this.startValue);
                value = this.addValue(value, this.scaleValue(delta, iteration));
            }
        }

        if (this.snapping) {
            if (typeof value === 'number') value = Math.round(value) as unknown as T;
            else {
                const vector = value as unknown as Vec3;
                value = new Vec3(Math.round(vector.x), Math.round(vector.y), Math.round(vector.z)) as unknown as T;
            }
        }
        this.setter(value);
    }
}

interface SequenceTweenItem { kind: 'tween'; start: number; tween: TweenBase; }
interface SequenceCallbackItem { kind: 'callback'; start: number; callback: TweenCallback; fired: boolean; }
type SequenceItem = SequenceTweenItem | SequenceCallbackItem;

/** DOTween-style timeline supporting nested tweeners and sequences. */
export class Sequence extends TweenBase {
    private items: SequenceItem[] = [];
    private cursor = 0;
    private lastInsertTime = 0;
    private previousPosition = 0;
    private sequenceIteration = -1;

    public constructor() {
        super(null, 0);
    }

    public Append(tween: TweenBase): this {
        this.addTween(this.cursor, tween);
        this.lastInsertTime = this.cursor;
        this.cursor += tween.Duration(true);
        this.refreshDuration();
        return this;
    }

    public Join(tween: TweenBase): this {
        this.addTween(this.lastInsertTime, tween);
        this.cursor = Math.max(this.cursor, this.lastInsertTime + tween.Duration(true));
        this.refreshDuration();
        return this;
    }

    public Insert(atPosition: number, tween: TweenBase): this {
        this.addTween(Math.max(0, atPosition), tween);
        this.cursor = Math.max(this.cursor, Math.max(0, atPosition) + tween.Duration(true));
        this.refreshDuration();
        return this;
    }

    public Prepend(tween: TweenBase): this {
        const amount = tween.Duration(true);
        this.shiftItems(amount);
        this.addTween(0, tween);
        this.cursor += amount;
        this.lastInsertTime = 0;
        this.refreshDuration();
        return this;
    }

    public AppendInterval(interval: number): this {
        this.lastInsertTime = this.cursor;
        this.cursor += Math.max(0, interval);
        this.refreshDuration();
        return this;
    }

    public PrependInterval(interval: number): this {
        const amount = Math.max(0, interval);
        this.shiftItems(amount);
        this.cursor += amount;
        this.lastInsertTime = 0;
        this.refreshDuration();
        return this;
    }

    public AppendCallback(callback: TweenCallback): this {
        return this.InsertCallback(this.cursor, callback);
    }

    public PrependCallback(callback: TweenCallback): this {
        this.items.push({ kind: 'callback', start: 0, callback, fired: false });
        return this;
    }

    public InsertCallback(atPosition: number, callback: TweenCallback): this {
        this.items.push({ kind: 'callback', start: Math.max(0, atPosition), callback, fired: false });
        this.refreshDuration();
        return this;
    }

    protected initializeValue(): void {
        this.items.sort((a, b) => a.start - b.start);
    }

    protected applyValue(easedProgress: number, iteration: number, _rawProgress: number): void {
        if (this.sequenceIteration !== iteration) {
            this.sequenceIteration = iteration;
            const startsInReverse = this.loopTypeValue === LoopType.Yoyo && iteration % 2 === 1;
            this.previousPosition = startsInReverse ? this.durationValue + EPSILON : -EPSILON;
            for (const item of this.items) {
                if (item.kind === 'callback') item.fired = false;
                else item.tween._resetSequenceRuntime();
            }
        }

        const position = clamp01(easedProgress) * this.durationValue;
        const movingForward = position >= this.previousPosition;
        for (const item of this.items) {
            if (item.kind === 'callback') {
                if (movingForward && !item.fired && this.previousPosition < item.start && position >= item.start) {
                    item.fired = true;
                    item.callback();
                }
                continue;
            }

            const local = position - item.start;
            const previousLocal = this.previousPosition - item.start;
            if (local >= 0) item.tween._sampleFromSequence(local, previousLocal);
        }
        this.previousPosition = position;
    }

    protected resetChildrenRuntime(): void {
        this.previousPosition = 0;
        this.sequenceIteration = -1;
        for (const item of this.items) {
            if (item.kind === 'callback') item.fired = false;
            else item.tween._resetSequenceRuntime();
        }
    }

    private addTween(start: number, tween: TweenBase): void {
        if (tween === this) throw new Error('[DOTween] A Sequence cannot contain itself.');
        if (!Number.isFinite(tween.Duration(true))) throw new Error('[DOTween] Infinite-loop tweens cannot be nested in a Sequence.');
        tween._setParented();
        this.items.push({ kind: 'tween', start, tween });
    }

    private shiftItems(amount: number): void {
        for (const item of this.items) item.start += amount;
    }

    private refreshDuration(): void {
        let duration = this.cursor;
        for (const item of this.items) {
            duration = Math.max(duration, item.start + (item.kind === 'tween' ? item.tween.Duration(true) : 0));
        }
        this.durationValue = duration;
    }
}

const vec3Clone = (value: Vec3): Vec3 => value.clone();
const vec3Lerp = (start: Vec3, end: Vec3, time: number): Vec3 => Vec3.lerp(new Vec3(), start, end, time);
const vec3Add = (a: Vec3, b: Vec3): Vec3 => Vec3.add(new Vec3(), a, b);
const vec3Subtract = (a: Vec3, b: Vec3): Vec3 => Vec3.subtract(new Vec3(), a, b);
const vec3Scale = (value: Vec3, scalar: number): Vec3 => Vec3.multiplyScalar(new Vec3(), value, scalar);
const numberClone = (value: number): number => value;
const numberLerp = (start: number, end: number, time: number): number => start + (end - start) * time;
const numberAdd = (a: number, b: number): number => a + b;
const numberSubtract = (a: number, b: number): number => a - b;
const numberScale = (value: number, scalar: number): number => value * scalar;

const vec2Clone = (value: Vec2): Vec2 => value.clone();
const vec2Lerp = (start: Vec2, end: Vec2, time: number): Vec2 => new Vec2(
    start.x + (end.x - start.x) * time,
    start.y + (end.y - start.y) * time,
);
const vec2Add = (a: Vec2, b: Vec2): Vec2 => new Vec2(a.x + b.x, a.y + b.y);
const vec2Subtract = (a: Vec2, b: Vec2): Vec2 => new Vec2(a.x - b.x, a.y - b.y);
const vec2Scale = (value: Vec2, scalar: number): Vec2 => new Vec2(value.x * scalar, value.y * scalar);

const colorClone = (value: Color): Color => value.clone();
const colorLerp = (start: Color, end: Color, time: number): Color => new Color(
    Math.round(start.r + (end.r - start.r) * time),
    Math.round(start.g + (end.g - start.g) * time),
    Math.round(start.b + (end.b - start.b) * time),
    Math.round(start.a + (end.a - start.a) * time),
);
const colorAdd = (a: Color, b: Color): Color => new Color(a.r + b.r, a.g + b.g, a.b + b.b, a.a + b.a);
const colorSubtract = (a: Color, b: Color): Color => new Color(a.r - b.r, a.g - b.g, a.b - b.b, a.a - b.a);
const colorScale = (value: Color, scalar: number): Color => new Color(
    value.r * scalar,
    value.g * scalar,
    value.b * scalar,
    value.a * scalar,
);

/** Factory, global controls and a single Cocos update driver. */
export class DOTween {
    private static activeTweens = new Set<TweenBase>();
    private static hooked = false;
    private static lastRealTime = 0;

    public static Sequence(): Sequence { return new Sequence(); }

    public static DelayedCall(delay: number, callback: TweenCallback, independentUpdate = false): Sequence {
        return new Sequence()
            .AppendInterval(Math.max(0, delay))
            .AppendCallback(callback)
            .SetUpdate(independentUpdate);
    }

    public static To(
        getter: () => number,
        setter: (value: number) => void,
        endValue: number,
        duration: number,
        target: unknown = null,
    ): Tweener<number> {
        return new Tweener<number>(
            target, duration, getter, setter, endValue,
            numberClone, numberLerp, numberAdd, numberSubtract, numberScale,
        );
    }

    public static DOMove(node: Node, endValue: Vec2 | Vec3, duration: number, snapping = false): Tweener<Vec3> {
        const currentZ = node.worldPosition.z;
        const target = endValue instanceof Vec3
            ? endValue.clone()
            : new Vec3(endValue.x, endValue.y, currentZ);
        return new Tweener<Vec3>(
            node, duration,
            () => node.worldPosition.clone(), value => node.setWorldPosition(value), target,
            vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
        ).SetSnapping(snapping);
    }

    public static DOLocalMove(node: Node, endValue: Vec2 | Vec3, duration: number, snapping = false): Tweener<Vec3> {
        const currentZ = node.position.z;
        const target = endValue instanceof Vec3
            ? endValue.clone()
            : new Vec3(endValue.x, endValue.y, currentZ);
        return new Tweener<Vec3>(
            node, duration,
            () => node.position.clone(), value => node.setPosition(value), target,
            vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
        ).SetSnapping(snapping);
    }

    public static DOJump(node: Node, endValue: Vec2 | Vec3, jumpPower: number, numJumps: number, duration: number, snapping = false): Tweener<Vec3> {
        const currentZ = node.worldPosition.z;
        const target = endValue instanceof Vec3
            ? endValue.clone()
            : new Vec3(endValue.x, endValue.y, currentZ);
        return new Tweener<Vec3>(
            node, duration,
            () => node.worldPosition.clone(), value => node.setWorldPosition(value), target,
            vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
            'jump', jumpPower, Math.max(1, Math.floor(numJumps)),
        ).SetSnapping(snapping);
    }

    public static DOLocalJump(node: Node, endValue: Vec2 | Vec3, jumpPower: number, numJumps: number, duration: number, snapping = false): Tweener<Vec3> {
        const currentZ = node.position.z;
        const target = endValue instanceof Vec3
            ? endValue.clone()
            : new Vec3(endValue.x, endValue.y, currentZ);
        return new Tweener<Vec3>(
            node, duration,
            () => node.position.clone(), value => node.setPosition(value), target,
            vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
            'jump', jumpPower, Math.max(1, Math.floor(numJumps)),
        ).SetSnapping(snapping);
    }

    public static DOScale(node: Node, endValue: Vec3 | number, duration: number): Tweener<Vec3> {
        const scale = typeof endValue === 'number' ? new Vec3(endValue, endValue, endValue) : endValue.clone();
        return new Tweener<Vec3>(
            node, duration,
            () => node.scale.clone(), value => node.setScale(value), scale,
            vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
        );
    }

    /** finalAlpha uses Unity-style normalized range 0..1. */
    public static DOFade(node: Node, finalAlpha: number, duration: number): Tweener<number> {
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        return new Tweener<number>(
            node, duration,
            () => opacity.opacity / 255,
            value => { if (opacity.isValid) opacity.opacity = Math.round(clamp01(value) * 255); },
            clamp01(finalAlpha), numberClone, numberLerp, numberAdd, numberSubtract, numberScale,
        );
    }

    public static DOPunchScale(node: Node, punch: Vec3 | number, duration: number, vibrato = 10, elasticity = 1): Tweener<Vec3> {
        const punchScale = typeof punch === 'number' ? new Vec3(punch, punch, punch) : punch.clone();
        return new Tweener<Vec3>(
            node, duration,
            () => node.scale.clone(), value => node.setScale(value), punchScale,
            vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
            'punch', 0, vibrato, elasticity,
        );
    }

    public static DORotate(node: Node, endEulerAngles: Vec3, duration: number): Tweener<Vec3> {
        return new Tweener<Vec3>(
            node, duration,
            () => node.eulerAngles.clone(), value => { node.eulerAngles = value; }, endEulerAngles.clone(),
            vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
        );
    }

    public static Kill(targetOrId: unknown, complete = false): number {
        let count = 0;
        for (const tween of [...this.activeTweens]) {
            if (tween.target === targetOrId || tween.Id() === targetOrId) {
                tween.Kill(complete);
                count++;
            }
        }
        return count;
    }

    public static Pause(targetOrId: unknown): number { return this.applyControl(targetOrId, tween => tween.Pause()); }
    public static Play(targetOrId: unknown): number { return this.applyControl(targetOrId, tween => tween.Play()); }
    public static Restart(targetOrId: unknown): number { return this.applyControl(targetOrId, tween => tween.Restart()); }

    public static KillAll(complete = false): void {
        for (const tween of [...this.activeTweens]) tween.Kill(complete);
    }

    public static register(tween: TweenBase): void {
        if (tween.IsComplete()) return;
        this.activeTweens.add(tween);
        this.ensureHook();
    }

    public static unregister(tween: TweenBase): void {
        this.activeTweens.delete(tween);
    }

    private static ensureHook(): void {
        if (this.hooked) return;
        this.hooked = true;
        this.lastRealTime = performance.now();
        director.on(Director.EVENT_BEFORE_UPDATE, this.update, this);
    }

    private static update(): void {
        const now = performance.now();
        const unscaledDelta = Math.min(0.1, Math.max(0, (now - this.lastRealTime) / 1000));
        this.lastRealTime = now;
        const scaledDelta = Math.min(0.1, Math.max(0, director.getDeltaTime()));
        for (const tween of [...this.activeTweens]) tween._update(scaledDelta, unscaledDelta);
    }

    private static applyControl(targetOrId: unknown, action: (tween: TweenBase) => void): number {
        let count = 0;
        for (const tween of [...this.activeTweens]) {
            if (tween.target === targetOrId || tween.Id() === targetOrId) {
                action(tween);
                count++;
            }
        }
        return count;
    }
}

/** Tween values that are not tied to a Node or Component property. */
export class DOVirtual {
    public static Float(
        from: number,
        to: number,
        duration: number,
        onVirtualUpdate: (value: number) => void,
    ): Tweener<number> {
        let value = from;
        return new Tweener<number>(
            null, duration,
            () => value,
            current => { value = current; onVirtualUpdate(current); },
            to, numberClone, numberLerp, numberAdd, numberSubtract, numberScale,
        );
    }

    public static Int(
        from: number,
        to: number,
        duration: number,
        onVirtualUpdate: (value: number) => void,
    ): Tweener<number> {
        let value = Math.round(from);
        return new Tweener<number>(
            null, duration,
            () => value,
            current => {
                value = Math.round(current);
                onVirtualUpdate(value);
            },
            Math.round(to), numberClone, numberLerp, numberAdd, numberSubtract, numberScale,
        );
    }

    public static Vector2(
        from: Vec2,
        to: Vec2,
        duration: number,
        onVirtualUpdate: (value: Vec2) => void,
    ): Tweener<Vec2> {
        let value = from.clone();
        return new Tweener<Vec2>(
            null, duration,
            () => value.clone(),
            current => { value = current.clone(); onVirtualUpdate(current.clone()); },
            to.clone(), vec2Clone, vec2Lerp, vec2Add, vec2Subtract, vec2Scale,
        );
    }

    public static Vector3(
        from: Vec3,
        to: Vec3,
        duration: number,
        onVirtualUpdate: (value: Vec3) => void,
    ): Tweener<Vec3> {
        let value = from.clone();
        return new Tweener<Vec3>(
            null, duration,
            () => value.clone(),
            current => { value = current.clone(); onVirtualUpdate(current.clone()); },
            to.clone(), vec3Clone, vec3Lerp, vec3Add, vec3Subtract, vec3Scale,
        );
    }

    public static Color(
        from: Color,
        to: Color,
        duration: number,
        onVirtualUpdate: (value: Color) => void,
    ): Tweener<Color> {
        let value = from.clone();
        return new Tweener<Color>(
            null, duration,
            () => value.clone(),
            current => { value = current.clone(); onVirtualUpdate(current.clone()); },
            to.clone(), colorClone, colorLerp, colorAdd, colorSubtract, colorScale,
        );
    }

    public static DelayedCall(delay: number, callback: TweenCallback, independentUpdate = false): Sequence {
        return DOTween.DelayedCall(delay, callback, independentUpdate);
    }

    public static EasedValue(from: number, to: number, lifetimePercentage: number, ease?: Ease | string | EaseFunction): number;
    public static EasedValue(from: Vec2, to: Vec2, lifetimePercentage: number, ease?: Ease | string | EaseFunction): Vec2;
    public static EasedValue(from: Vec3, to: Vec3, lifetimePercentage: number, ease?: Ease | string | EaseFunction): Vec3;
    public static EasedValue(from: Color, to: Color, lifetimePercentage: number, ease?: Ease | string | EaseFunction): Color;
    public static EasedValue(
        from: number | Vec2 | Vec3 | Color,
        to: number | Vec2 | Vec3 | Color,
        lifetimePercentage: number,
        ease: Ease | string | EaseFunction = Ease.Linear,
    ): number | Vec2 | Vec3 | Color {
        const time = resolveEase(ease)(clamp01(lifetimePercentage));
        if (typeof from === 'number' && typeof to === 'number') return numberLerp(from, to, time);
        if (from instanceof Color && to instanceof Color) return colorLerp(from, to, time);
        if (from instanceof Vec3 && to instanceof Vec3) return vec3Lerp(from, to, time);
        if (from instanceof Vec2 && to instanceof Vec2) return vec2Lerp(from, to, time);
        throw new Error('[DOVirtual] EasedValue requires matching value types.');
    }
}

declare module 'cc' {
    interface Node {
        DOMove(endValue: Vec2 | Vec3, duration: number, snapping?: boolean): Tweener<Vec3>;
        DOLocalMove(endValue: Vec2 | Vec3, duration: number, snapping?: boolean): Tweener<Vec3>;
        DOJump(endValue: Vec2 | Vec3, jumpPower: number, numJumps: number, duration: number, snapping?: boolean): Tweener<Vec3>;
        DOLocalJump(endValue: Vec2 | Vec3, jumpPower: number, numJumps: number, duration: number, snapping?: boolean): Tweener<Vec3>;
        DOScale(endValue: Vec3 | number, duration: number): Tweener<Vec3>;
        DOFade(finalAlpha: number, duration: number): Tweener<number>;
        DOPunchScale(punch: Vec3 | number, duration: number, vibrato?: number, elasticity?: number): Tweener<Vec3>;
        DORotate(endEulerAngles: Vec3, duration: number): Tweener<Vec3>;
        DOKill(complete?: boolean): number;
        DOPause(): number;
        DOPlay(): number;
        DORestart(): number;
    }
}

function installNodeExtensions(): void {
    const prototype = Node.prototype as any;
    const define = (name: string, callback: Function): void => {
        if (typeof prototype[name] === 'function') return;
        Object.defineProperty(prototype, name, { value: callback, configurable: true, writable: true });
    };

    define('DOMove', function (this: Node, end: Vec2 | Vec3, duration: number, snapping = false) { return DOTween.DOMove(this, end, duration, snapping); });
    define('DOLocalMove', function (this: Node, end: Vec2 | Vec3, duration: number, snapping = false) { return DOTween.DOLocalMove(this, end, duration, snapping); });
    define('DOJump', function (this: Node, end: Vec2 | Vec3, power: number, jumps: number, duration: number, snapping = false) { return DOTween.DOJump(this, end, power, jumps, duration, snapping); });
    define('DOLocalJump', function (this: Node, end: Vec2 | Vec3, power: number, jumps: number, duration: number, snapping = false) { return DOTween.DOLocalJump(this, end, power, jumps, duration, snapping); });
    define('DOScale', function (this: Node, end: Vec3 | number, duration: number) { return DOTween.DOScale(this, end, duration); });
    define('DOFade', function (this: Node, alpha: number, duration: number) { return DOTween.DOFade(this, alpha, duration); });
    define('DOPunchScale', function (this: Node, punch: Vec3 | number, duration: number, vibrato = 10, elasticity = 1) { return DOTween.DOPunchScale(this, punch, duration, vibrato, elasticity); });
    define('DORotate', function (this: Node, end: Vec3, duration: number) { return DOTween.DORotate(this, end, duration); });
    define('DOKill', function (this: Node, complete = false) { return DOTween.Kill(this, complete); });
    define('DOPause', function (this: Node) { return DOTween.Pause(this); });
    define('DOPlay', function (this: Node) { return DOTween.Play(this); });
    define('DORestart', function (this: Node) { return DOTween.Restart(this); });
}

installNodeExtensions();
