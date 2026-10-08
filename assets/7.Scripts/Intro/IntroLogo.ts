import {
    _decorator, Canvas, Color, Component, EventHandler, Node, Sprite, SpriteFrame, Texture2D,
    Tween, tween, UIOpacity, UITransform, Vec3, view,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * Intro that continues the engine splash screen (preload) into the game:
 * a full-screen background in the splash colour and a copy of the logo at
 * the splash logo's place/size are shown on the very first frame, so the
 * splash -> game switch is invisible. The logo then flies to wherever the
 * real logo is (portrait or landscape node, whichever is active) while the
 * background fades out to reveal the game.
 *
 * Self-contained (imports only 'cc'): copy this file into another project,
 * put it on a node at the top of the UI canvas and assign the logos.
 * The target is read every frame, so a resize / rotation mid-flight still
 * lands on the right logo.
 */
@ccclass('IntroLogo')
export class IntroLogo extends Component {
    // ---------- Logos ----------
    @property({ group: { name: 'Logos', id: 'intro', displayOrder: 0 }, type: Node, tooltip: 'Logo dùng khi màn hình dọc (node có Sprite).' })
    public portraitLogo: Node | null = null;

    @property({ group: { name: 'Logos', id: 'intro' }, type: Node, tooltip: 'Logo dùng khi màn hình ngang (node có Sprite).' })
    public landscapeLogo: Node | null = null;

    // ---------- Background ----------
    @property({ group: { name: 'Background', id: 'intro', displayOrder: 1 }, tooltip: 'Phủ nền màu full màn hình lúc đầu rồi mờ dần.' })
    public useBackground: boolean = true;

    @property({ group: { name: 'Background', id: 'intro' }, tooltip: 'Màu nền. Đặt trùng màu nền splash (Project Settings > Splash Screen) để chuyển liền mạch.', visible: function (this: IntroLogo) { return this.useBackground; } })
    public backgroundColor: Color = new Color(133, 240, 99, 255);

    @property({ group: { name: 'Background', id: 'intro' }, type: Node, tooltip: 'Nền tự làm (tuỳ chọn, ví dụ ảnh splash). Trống = tự tạo nền màu Background Color.', visible: function (this: IntroLogo) { return this.useBackground; } })
    public background: Node | null = null;

    @property({ group: { name: 'Background', id: 'intro' }, min: 0, tooltip: 'Nền bắt đầu mờ sau khi logo bắt đầu bay bao lâu (giây).', visible: function (this: IntroLogo) { return this.useBackground; } })
    public backgroundFadeDelay: number = 0;

    @property({ group: { name: 'Background', id: 'intro' }, min: 0.01, tooltip: 'Thời gian nền mờ dần (giây).', visible: function (this: IntroLogo) { return this.useBackground; } })
    public backgroundFadeDuration: number = 0.5;

    // ---------- Splash ----------
    @property({ group: { name: 'Splash', id: 'intro', displayOrder: 2 }, tooltip: 'Logo bắt đầu đúng chỗ và cỡ của logo splash (không zoom từ 0).' })
    public matchSplash: boolean = true;

    @property({ group: { name: 'Splash', id: 'intro' }, min: 0.01, tooltip: 'Display Ratio trong Project Settings > Splash Screen.', visible: function (this: IntroLogo) { return this.matchSplash; } })
    public splashDisplayRatio: number = 0.41;

    @property({ group: { name: 'Splash', id: 'intro' }, range: [0.1, 1, 0.05], slide: true, tooltip: 'Logo ở giữa rộng bằng bao nhiêu phần màn hình (khi không khớp splash).', visible: function (this: IntroLogo) { return !this.matchSplash; } })
    public centerWidthRatio: number = 0.7;

    @property({ group: { name: 'Splash', id: 'intro' }, min: 0, tooltip: 'Thời gian logo zoom 0 -> 1 ở giữa (giây).', visible: function (this: IntroLogo) { return !this.matchSplash; } })
    public popInDuration: number = 0.35;

    // ---------- Timing ----------
    @property({ group: { name: 'Timing', id: 'intro', displayOrder: 3 }, tooltip: 'Tự chạy khi vào game.' })
    public playOnStart: boolean = true;

    @property({ group: { name: 'Timing', id: 'intro' }, min: 0, tooltip: 'Logo đứng yên ở giữa bao lâu trước khi bay (giây).' })
    public holdDuration: number = 0.3;

    @property({ group: { name: 'Timing', id: 'intro' }, min: 0.01, tooltip: 'Thời gian bay về chỗ logo (giây).' })
    public flyDuration: number = 0.6;

    @property({ group: { name: 'Timing', id: 'intro' }, tooltip: 'Nảy nhẹ khi logo đáp xuống chỗ của nó.' })
    public punchOnLand: boolean = true;

    @property({ group: { name: 'Timing', id: 'intro' }, min: 0, tooltip: 'Độ nảy khi đáp (0.15 = 15%).', visible: function (this: IntroLogo) { return this.punchOnLand; } })
    public punchStrength: number = 0.15;

    // ---------- Events ----------
    @property({ group: { name: 'Events', id: 'intro', displayOrder: 4 }, type: [EventHandler], tooltip: 'Gọi khi intro bắt đầu.' })
    public onIntroStart: EventHandler[] = [];

    @property({ group: { name: 'Events', id: 'intro' }, type: [EventHandler], tooltip: 'Gọi khi logo đã về chỗ và nền đã mờ hết.' })
    public onIntroFinished: EventHandler[] = [];

    private static whiteFrame: SpriteFrame | null = null;

    private flyer: Node | null = null;
    private bgNode: Node | null = null;
    private createdBackground = false;
    private playing = false;
    private pendingDone = 0;
    private readonly state = { t: 0 };
    private readonly pop = { s: 0 };
    private readonly from = new Vec3();
    private readonly fromScale = new Vec3();

    public get IsPlaying(): boolean {
        return this.playing;
    }

    protected onLoad(): void {
        if (!this.playOnStart) return;
        // Cover the game on the very first rendered frame, like the splash did.
        this.SetLogosVisible(false);
        this.ShowBackground();
    }

    protected start(): void {
        // Wait one frame so the UI has picked the portrait/landscape logo.
        if (this.playOnStart) this.scheduleOnce(() => this.Play(), 0);
    }

    protected update(): void {
        if (this.bgNode?.activeInHierarchy && this.createdBackground) this.FitBackground();
    }

    protected onDisable(): void {
        if (this.playing) this.Finish();
    }

    /** Plays the intro (can also be bound to an event). */
    public Play(): void {
        const logo = this.GetActiveLogo();
        const sprite = logo?.getComponent(Sprite);
        if (!logo || !sprite) {
            this.Finish(true);
            return;
        }

        this.StopTweens();
        this.playing = true;
        this.SetLogosVisible(false);
        this.ShowBackground();
        this.DestroyFlyer();
        this.flyer = this.CreateFlyer(logo, sprite);

        const screen = this.GetScreenRect(logo);
        const logoTransform = logo.getComponent(UITransform);
        const logoW = Math.max(1, logoTransform?.width ?? 1);
        const logoH = Math.max(1, logoTransform?.height ?? 1);
        const signX = logo.worldScale.x < 0 ? -1 : 1;
        const signY = logo.worldScale.y < 0 ? -1 : 1;

        let size: number;
        if (this.matchSplash) {
            // Engine splash: logo height = 18.5% of screen height * displayRatio,
            // centred horizontally at 3.5/6 of the height from the bottom.
            size = (screen.height * 0.185 * this.splashDisplayRatio) / logoH;
            this.from.set(screen.x + screen.width / 2, screen.y + screen.height * (3.5 / 6), logo.worldPosition.z);
        } else {
            size = (Math.min(screen.width, screen.height * 1.2) * this.centerWidthRatio) / logoW;
            this.from.set(screen.x + screen.width / 2, screen.y + screen.height / 2, logo.worldPosition.z);
        }
        this.fromScale.set(size * signX, size * signY, 1);

        const flyer = this.flyer;
        flyer.setWorldPosition(this.from);
        EventHandler.emitEvents(this.onIntroStart, this);

        const popTime = this.matchSplash ? 0 : this.popInDuration;
        this.pop.s = popTime > 0 ? 0 : 1;
        this.ApplyPop();
        tween(this.pop)
            .to(popTime, { s: 1 }, { easing: 'backOut', onUpdate: () => this.ApplyPop() })
            .delay(this.holdDuration)
            .call(() => this.Fly())
            .start();
    }

    /** Skips straight to the end state. */
    public Skip(): void {
        if (this.playing) this.Finish();
    }

    private ApplyPop(): void {
        this.flyer?.setWorldScale(this.fromScale.x * this.pop.s, this.fromScale.y * this.pop.s, 1);
    }

    private Fly(): void {
        // Two things must end before the intro is finished: landing + background fade.
        this.pendingDone = 1;
        if (this.bgNode?.active) {
            this.pendingDone++;
            tween(this.GetOpacity(this.bgNode))
                .delay(this.backgroundFadeDelay)
                .to(this.backgroundFadeDuration, { opacity: 0 }, { easing: 'sineInOut' })
                .call(() => {
                    if (this.bgNode) this.bgNode.active = false;
                    this.Done();
                })
                .start();
        }

        this.state.t = 0;
        tween(this.state)
            .to(this.flyDuration, { t: 1 }, { easing: 'quadInOut', onUpdate: () => this.UpdateFlight() })
            .call(() => this.Land())
            .start();
    }

    /** Lerps from the start to the current target every frame (it may move on resize). */
    private UpdateFlight(): void {
        const flyer = this.flyer;
        const logo = this.GetActiveLogo();
        if (!flyer || !logo) return;
        const t = this.state.t;
        const to = logo.worldPosition;
        const toScale = logo.worldScale;
        flyer.setWorldPosition(
            this.from.x + (to.x - this.from.x) * t,
            this.from.y + (to.y - this.from.y) * t,
            to.z,
        );
        flyer.setWorldScale(
            this.fromScale.x + (toScale.x - this.fromScale.x) * t,
            this.fromScale.y + (toScale.y - this.fromScale.y) * t,
            1,
        );
    }

    private Land(): void {
        // Hand over to the real logo.
        this.DestroyFlyer();
        this.SetLogosVisible(true);
        const logo = this.GetActiveLogo();
        if (!this.punchOnLand || !logo) {
            this.Done();
            return;
        }
        const base = logo.scale.clone();
        const s = this.punchStrength;
        Tween.stopAllByTarget(logo);
        tween(logo)
            .to(0.1, { scale: new Vec3(base.x * (1 + s), base.y * (1 - s), base.z) }, { easing: 'sineOut' })
            .to(0.1, { scale: new Vec3(base.x * (1 - s * 0.5), base.y * (1 + s * 0.5), base.z) }, { easing: 'sineInOut' })
            .to(0.1, { scale: base }, { easing: 'sineIn' })
            .call(() => this.Done())
            .start();
    }

    private Done(): void {
        this.pendingDone--;
        if (this.pendingDone <= 0) this.Finish();
    }

    private Finish(force = false): void {
        this.StopTweens();
        this.DestroyFlyer();
        this.SetLogosVisible(true);
        if (this.bgNode) this.bgNode.active = false;
        const wasPlaying = this.playing || force;
        this.playing = false;
        if (wasPlaying) EventHandler.emitEvents(this.onIntroFinished, this);
    }

    // ---------- Background ----------

    private ShowBackground(): void {
        if (!this.useBackground) return;
        if (!this.bgNode) {
            if (this.background) {
                this.bgNode = this.background;
            } else {
                this.bgNode = this.CreateBackground();
                this.createdBackground = true;
            }
        }
        const bg = this.bgNode;
        Tween.stopAllByTarget(this.GetOpacity(bg));
        this.GetOpacity(bg).opacity = 255;
        bg.active = true;
        if (this.createdBackground) {
            const sprite = bg.getComponent(Sprite);
            if (sprite) sprite.color = this.backgroundColor;
            this.FitBackground();
        }
    }

    private CreateBackground(): Node {
        const bg = new Node('IntroBackground');
        bg.layer = this.node.layer;
        bg.setParent(this.node);
        bg.setSiblingIndex(0);
        bg.addComponent(UITransform);
        const sprite = bg.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = IntroLogo.GetWhiteFrame();
        sprite.color = this.backgroundColor;
        return bg;
    }

    /** Covers the whole canvas (plus a margin) whatever the screen shape. */
    private FitBackground(): void {
        const bg = this.bgNode;
        if (!bg) return;
        const rect = this.GetScreenRect(this.node);
        const ws = this.node.worldScale;
        const margin = 1.1;
        bg.setWorldPosition(rect.x + rect.width / 2, rect.y + rect.height / 2, this.node.worldPosition.z);
        bg.getComponent(UITransform)?.setContentSize(
            (rect.width / Math.max(0.0001, Math.abs(ws.x))) * margin,
            (rect.height / Math.max(0.0001, Math.abs(ws.y))) * margin,
        );
    }

    private static GetWhiteFrame(): SpriteFrame {
        if (IntroLogo.whiteFrame) return IntroLogo.whiteFrame;
        const texture = new Texture2D();
        texture.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
        texture.uploadData(new Uint8Array(2 * 2 * 4).fill(255));
        const frame = new SpriteFrame();
        frame.texture = texture;
        IntroLogo.whiteFrame = frame;
        return frame;
    }

    // ---------- Helpers ----------

    /** The logo the UI currently shows (portrait/landscape), falling back to any assigned one. */
    private GetActiveLogo(): Node | null {
        if (this.portraitLogo?.activeInHierarchy) return this.portraitLogo;
        if (this.landscapeLogo?.activeInHierarchy) return this.landscapeLogo;
        const size = view.getVisibleSize();
        return (size.width > size.height ? this.landscapeLogo : this.portraitLogo) ?? this.portraitLogo ?? this.landscapeLogo;
    }

    private CreateFlyer(logo: Node, sprite: Sprite): Node {
        const flyer = new Node('IntroLogoFlyer');
        flyer.layer = logo.layer;
        flyer.setParent(this.node);
        const transform = flyer.addComponent(UITransform);
        const logoTransform = logo.getComponent(UITransform);
        if (logoTransform) {
            transform.setContentSize(logoTransform.contentSize);
            transform.setAnchorPoint(logoTransform.anchorPoint);
        }
        const copy = flyer.addComponent(Sprite);
        copy.sizeMode = Sprite.SizeMode.CUSTOM;
        copy.type = sprite.type;
        copy.spriteFrame = sprite.spriteFrame;
        copy.color = sprite.color;
        flyer.setWorldRotation(logo.worldRotation);
        return flyer;
    }

    private DestroyFlyer(): void {
        if (this.flyer?.isValid) this.flyer.destroy();
        this.flyer = null;
    }

    private SetLogosVisible(visible: boolean): void {
        for (const logo of [this.portraitLogo, this.landscapeLogo]) {
            if (logo?.isValid) this.GetOpacity(logo).opacity = visible ? 255 : 0;
        }
    }

    private GetOpacity(node: Node): UIOpacity {
        return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    }

    private FindCanvas(from: Node): Node | null {
        let node: Node | null = from;
        while (node) {
            if (node.getComponent(Canvas)) return node;
            node = node.parent;
        }
        return null;
    }

    /** The visible screen in world space (the canvas rect). */
    private GetScreenRect(from: Node): { x: number; y: number; width: number; height: number } {
        const canvas = this.FindCanvas(from) ?? this.FindCanvas(this.node);
        const transform = canvas?.getComponent(UITransform);
        if (transform) {
            const box = transform.getBoundingBoxToWorld();
            return { x: box.x, y: box.y, width: box.width, height: box.height };
        }
        const size = view.getVisibleSize();
        return { x: 0, y: 0, width: size.width, height: size.height };
    }

    private StopTweens(): void {
        Tween.stopAllByTarget(this.state);
        Tween.stopAllByTarget(this.pop);
        if (this.bgNode) Tween.stopAllByTarget(this.GetOpacity(this.bgNode));
    }
}
