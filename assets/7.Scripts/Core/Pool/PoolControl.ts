// Learn TypeScript:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/typescript.html
// Learn TypeScript:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/life-cycle-callbacks.html

import { CCInteger, Component, Node, Prefab, _decorator } from "cc"; 

const { ccclass, property } = _decorator;


@ccclass('PoolControl')
export default class PoolControl extends Component {

  @property(Node)
  root: Node = null;
  @property([Prefab])
  prefabs: Prefab[] = [];

  @property({ type: CCInteger, tooltip: 'Number of instances to create for each prefab at startup.' })
  prewarmAmount: number = 0;

  // Keep this structural so PoolControl does not import PoolManager.  The
  // previous runtime import created a circular module dependency at startup.
  poolAmounts: Array<{ root: Node; prefab: Prefab; amount: number }> = [];

  preLoad() {
    this.prefabs.forEach((prefab, index) => {
      this.poolAmounts.push({
        root: this.root,
        prefab,
        amount: this.prewarmAmount,
      });
    })
  }

  // LIFE-CYCLE CALLBACKS:

  onLoad() {
    this.preLoad();
  }

  start() {
  }

  // update (dt) {}
}
