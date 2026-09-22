// Mintegral spec (Article 2): the store may only be opened through the
// install() the Mintegral SDK injects. No store URLs and no browser fallback:
// the offer on the Mintegral dashboard holds the store link.
window.PlayableSDK = {
  channel: "Mintegral",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x24b63d = navigator.userAgentData.platform;
      return _0x24b63d;
    }
    const _0x3440d7 = navigator.userAgent || "";
    const _0x2c16ae = navigator.platform || "";
    if (/android/i.test(_0x3440d7)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x3440d7) || _0x2c16ae === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x2c16ae)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x2c16ae)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x2c16ae)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    if (typeof window.install === "function") {
      window.install();
    } else {
      console.warn("[PlayableSDK:" + this.channel + ":download] window.install is not available");
    }
  },
  game_ready() {
    console.log("[PlayableSDK]", this.channel, "game_ready()");
    window.gameStart = () => {
      console.log("[PlayableSDK:" + this.channel + ":gameReady] Game started");
    };
    window.gameClose = () => {
      console.log("[PlayableSDK:" + this.channel + ":gameReady] Game closed");
    };
    if (window.gameReady) {
      window.gameReady();
    }
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
    if (window.gameEnd) {
      window.gameEnd();
    }
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x2df3d4 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x2df3d4);
    });
  },
  onMute(_0x2e096e) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x5b6d3e) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x14f2d3) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x5699b3) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  }
};