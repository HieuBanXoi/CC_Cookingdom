import { _decorator, Component, Node, Camera, view, screen } from 'cc';
import { Ply_Singleton } from './Ply_Singleton';

const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Ply_Singleton<UIManager> {

    @property(Node) public winUI: Node = null!;
    @property(Node) public loseUI: Node = null!;
    @property(Node) public tutorial: Node = null!;
    @property(Node) public verticalUI: Node = null!;
    @property(Node) public horizontalUI: Node = null!;
    @property(Node) public downloadBtn: Node = null!;
    @property(Node) public horizontalDownloadBtn: Node = null!;
    @property(Camera) public cam: Camera = null!;

    @property({ tooltip: 'Hide download button for Google builds' })
    public isGoogleBuild: boolean = false;

    // --- SCREEN STATE ---
    public screenWidth: number = 0;
    public screenHeight: number = 0;
    public scaleHeightOnWidth: number = 1;
    public isVertical: boolean = false;
    public isScreenVertical: boolean = false;

    // --- ORIENTATION & SCALING SETTINGS ---
    @property public verticalUIHeightOnWidthRatio: number = 0.6;
    @property public screenVerticalHeightOnWidthRatio: number = 1.0;
    @property public baseOrthographicSize: number = 6.0;
    @property public baseAspect: number = 1.777;
    @property public landscapeSizeRatio: number = 1.0;
    @property public defaultPortraitSizeRatio: number = 1.0;

    protected onLoad() {
        super.onLoad();
        view.on('canvas-resize', this.onScreenResize, this);
    }

    protected start() {
        if (this.winUI) this.winUI.active = false;
        if (this.loseUI) this.loseUI.active = false;

        this.activeDownloadButtons(!this.isGoogleBuild);
        this.updateUI();
    }

    protected update(dt: number) {
        const windowSize = screen.windowSize;
        if (windowSize.width !== this.screenWidth || windowSize.height !== this.screenHeight) {
            this.onScreenResize();
        }
    }

    protected onDestroy() {
        view.off('canvas-resize', this.onScreenResize, this);
    }

    private onScreenResize() {
        this.getScreenSize();
        this.scheduleOnce(() => {
            this.updateUI();
        }, 0);
    }

    public updateUI() {
        this.getScreenSize();
        this.getScreenType();
        this.screenScale();
    }

    private getScreenSize() {
        const windowSize = screen.windowSize;
        this.screenWidth = windowSize.width;
        this.screenHeight = windowSize.height;
    }

    private getScreenType() {
        this.scaleHeightOnWidth = this.getScreenHeightOnWidthRatio();
        this.isVertical = this.scaleHeightOnWidth >= this.verticalUIHeightOnWidthRatio;
        this.isScreenVertical = this.scaleHeightOnWidth >= this.screenVerticalHeightOnWidthRatio;
    }

    private screenScale() {
        if (this.verticalUI) this.verticalUI.active = this.isVertical;
        if (this.horizontalUI) this.horizontalUI.active = !this.isVertical;

        const targetOrthographicSize = Math.max(this.getTargetOrthographicSize(), 0.01);
        this.applyCameraScale(targetOrthographicSize);
    }

    private getTargetOrthographicSize(): number {
        if (!this.isScreenVertical) return this.getLandscapeSize();
        return this.getDefaultPortraitSize() * (this.scaleHeightOnWidth / this.baseAspect);
    }

    private getScreenHeightOnWidthRatio(): number {
        return this.screenWidth > 0 ? this.screenHeight / this.screenWidth : 1.0;
    }

    private getLandscapeSize(): number {
        return this.baseOrthographicSize * this.landscapeSizeRatio;
    }

    private getDefaultPortraitSize(): number {
        return this.baseOrthographicSize * this.defaultPortraitSizeRatio;
    }

    private applyCameraScale(targetOrthographicSize: number) {
        if (!this.cam) this.cam = Camera.mainCamera;
        if (!this.cam) return;

        this.cam.projection = Camera.ProjectionType.ORTHO;
        this.cam.orthoHeight = targetOrthographicSize;
    }

    // --- PUBLIC TOGGLE METHODS ---
    public activeGameWinUI(isActive: boolean) {
        if (this.winUI) this.winUI.active = isActive;
    }

    public activeGameLoseUI(isActive: boolean) {
        if (this.loseUI) this.loseUI.active = isActive;
    }

    public activeTutorialUI(isActive: boolean) {
        if (this.tutorial) this.tutorial.active = isActive;
    }

    public activeDownloadButtons(isActive: boolean) {
        if (this.isGoogleBuild) isActive = false;

        if (this.downloadBtn) this.downloadBtn.active = isActive;

        if (!this.horizontalDownloadBtn && this.horizontalUI) {
            this.horizontalDownloadBtn = this.findChildByName(this.horizontalUI, 'DownloadBtn');
        }

        if (this.horizontalDownloadBtn && this.horizontalDownloadBtn !== this.downloadBtn) {
            this.horizontalDownloadBtn.active = isActive;
        }
    }

    private findChildByName(root: Node, childName: string): Node | null {
        if (!root) return null;
        if (root.name === childName) return root;

        for (const child of root.children) {
            const found = this.findChildByName(child, childName);
            if (found) return found;
        }

        return null;
    }
}
