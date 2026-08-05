# DOTween-style API for Cocos Creator 3.7

The runtime is installed once by `GameManager`. Import the types where they are
used:

```ts
import { Ease, LoopType, DOTween } from './7.Script/Tool/DOTween';
import { Vec3 } from 'cc';
```

## Node shortcuts

```ts
this.node.DOMove(new Vec3(500, 200, 0), 0.5)
    .SetEase(Ease.OutBack)
    .SetDelay(0.1)
    .OnComplete(() => console.log('done'));

this.node.DOLocalMove(new Vec3(100, 0, 0), 0.4);
this.node.DOMove(new Vec2(500, 200), 0.5); // UI 2D; preserves world Z
this.node.DOLocalMove(new Vec2(100, 0), 0.4); // UI 2D; preserves local Z
this.node.DOJump(new Vec3(500, 200, 0), 80, 2, 0.8);
this.node.DOJump(new Vec2(500, 200), 80, 2, 0.8); // UI/2D; preserves Z
this.node.DOLocalJump(new Vec3(100, 0, 0), 50, 1, 0.5);
this.node.DOLocalJump(new Vec2(100, 0), 50, 1, 0.5); // Local UI position
this.node.DOScale(1.2, 0.25);
this.node.DOFade(0, 0.3); // Normalized alpha: 0..1
this.node.DOPunchScale(new Vec3(0.2, 0.2, 0), 0.4, 8, 1);
this.node.DORotate(new Vec3(0, 0, 180), 0.5);
```

World-space methods are `DOMove` and `DOJump`. Their `DOLocal*` counterparts
modify local position. `DOPunchScale` receives a scale delta and restores the
starting scale at completion.

`DOJump(end, jumpPower, numJumps, duration)` uses DOTween's OutQuad/Yoyo-style
parabolic hops. `jumpPower` is the height added above the interpolated path and
`numJumps` is the exact number of complete hops.

## Fluent controls

```ts
const movement = this.node.DOMove(target, 1)
    .SetEase(Ease.InOutSine)
    .SetLoops(2, LoopType.Yoyo)
    .SetId('food-movement')
    .SetUpdate(false)
    .OnStart(() => {})
    .OnUpdate(progress => {})
    .OnStepComplete(() => {})
    .OnComplete(() => {});

movement.Pause();
movement.Play();
movement.Restart();
movement.Rewind();
movement.Goto(0.5, true);
movement.Complete();
movement.Kill();
await movement.AsyncWaitForCompletion();
```

Target-level controls:

```ts
this.node.DOPause();
this.node.DOPlay();
this.node.DORestart();
this.node.DOKill();

DOTween.Kill('food-movement');
DOTween.KillAll();
```

## Sequence

Tweeners are automatically detached from the global runner when inserted into
a Sequence.

```ts
const sequence = DOTween.Sequence()
    .Append(this.node.DOMove(new Vec3(200, 0, 0), 0.4))
    .Join(this.node.DOScale(1.2, 0.4))
    .AppendInterval(0.15)
    .AppendCallback(() => console.log('middle'))
    .Append(this.node.DOPunchScale(0.15, 0.35))
    .Insert(0.1, anotherNode.DOFade(0, 0.25))
    .OnComplete(() => console.log('sequence complete'));
```

Supported timeline operations:

- `Append`, `Join`, `Insert`, `Prepend`
- `AppendInterval`, `PrependInterval`
- `AppendCallback`, `InsertCallback`, `PrependCallback`
- Nested `Sequence`
- Delay, easing, Restart/Yoyo/Incremental loops
- Play, Pause, TogglePause, Restart, Rewind, Goto, Complete and Kill
- Start, play, pause, update, step-complete, complete and kill callbacks
- Scaled or independent update and async completion

Infinite-loop tweeners cannot be inserted into a Sequence because their
timeline has no finite end. Apply the infinite loop to the Sequence instead.

## Generic numeric tween and delayed calls

```ts
DOTween.To(
    () => this.score,
    value => this.score = value,
    100,
    0.5,
    this,
);

DOTween.DelayedCall(1, () => console.log('one second later'));
```

## DOVirtual

```ts
import { DOVirtual, Ease } from './assets/7.Script/Tool/DOTween';

DOVirtual.Float(0, 100, 0.5, value => {
    this.progressLabel.string = value.toFixed(0);
}).SetEase(Ease.OutQuad);

DOVirtual.Int(0, 10, 0.5, value => console.log(value));
DOVirtual.Vector2(fromVec2, toVec2, 0.5, value => {});
DOVirtual.Vector3(fromVec3, toVec3, 0.5, value => {});
DOVirtual.Color(fromColor, toColor, 0.5, value => sprite.color = value);
DOVirtual.DelayedCall(1, () => console.log('done'));

const sampled = DOVirtual.EasedValue(0, 100, 0.5, Ease.OutQuad);
```
