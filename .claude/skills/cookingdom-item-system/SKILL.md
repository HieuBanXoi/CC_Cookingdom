---
name: cookingdom-item-system
description: "Quy ước xây dựng Item gameplay cho Cookingdom (Cocos Creator 3.8): Item + ItemClickable/ItemDraggable/ItemMoveToTarget, cách viết script mới kế thừa Item bằng cách lắng nghe sự kiện, và cách HandTutManager chọn item để hướng dẫn dựa trên enabled/disabled component. Dùng khi tạo item mới, thêm cơ chế tương tác mới, sửa hand tutorial, hoặc setup prefab/scene cho item."
---

# Cookingdom Item System

Áp dụng mỗi khi tạo/sửa item gameplay, cơ chế tương tác mới, hoặc hand tutorial.
Đường dẫn gốc: `assets/7.Scripts/Gameplay/Items/`, manager: `assets/7.Scripts/Managers/`.

## 1. Cấu trúc một Item (bắt buộc)

Mọi node gameplay tương tác được **luôn** có component `Item` hoặc script kế thừa `Item`
(`Knife`, `Spatula`, `Pan`, `Squid`, `SinkButton`, ...). `Item` tự cache các component
"khả năng" gắn cùng node trong `onLoad()` / `cacheComponents()`:

| Component | Khi nào thêm | Ghi chú |
|---|---|---|
| `Item` (hoặc subclass) | Luôn luôn | Giữ `itemType`, `isDone`, `onProcess`, ref tới các component dưới |
| `ItemClickable` | Item cần **click/tap** | Sự kiện: `onClick`, `onClickComplete` (`requiredClicks`, `infiniteClick`, `disableAfterClick`, `canClick`) |
| `ItemDraggable` | Item cần **drag** | Sự kiện: `onBeginDrag`, `onDropSuccess(targetNode)`, `onDropFail`, `onReturnToStartComplete`. Drop thành công khi thả lên `Item` khác có `itemType === targetItemType` |
| `ItemMoveToTarget` | **Bắt buộc đi kèm `ItemDraggable`** | `defaultTarget` là đích hand-tut kéo tới; `ExecuteMove()` tween tới target, emit `ItemMoveToTarget.EVENT_COMPLETE` trên node |
| `ItemStirring` | Item cần khuấy/xoay | Sự kiện `onStirComplete`; HandTut dùng `IsDone` |
| `ItemSound` | Tuỳ chọn | Âm thanh riêng của item |

**Quy tắc cứng:** thêm `ItemDraggable` ⇒ phải thêm `ItemMoveToTarget` và gán `defaultTarget`.
Hand-tut cho drag dựa vào cặp `ItemDraggable.targetItemType` + `ItemMoveToTarget.defaultTarget`;
thiếu một trong hai thì item **không bao giờ** được hand-tut.
`ItemDraggable.SetTargetItemType(node)` set cả hai cùng lúc — dùng nó khi đổi đích lúc runtime.

Mọi component khả năng đều kế thừa `Ply_EventHandlerComponent` nên có sẵn
`EnableComponent()` / `DisableComponent()` / `Activate()` / `Deactivate()` để bind trực tiếp
trong Inspector (Ply_Event) hoặc gọi từ code. `Item` cũng có wrapper:
`EnableItemDraggable/DisableItemDraggable`, `EnableItemClickable/DisableItemClickable`,
`EnableClick/DisableClick`, `EnableItemStirring/DisableItemStirring`.

Input đi qua `InputManager.onTouchStart`: raycast tìm `ItemDraggable` (enabled) → `ItemStirring`
(enabled) → `ItemClickable` (enabled && canClick). Item mới **không** tự đăng ký touch listener
cho click/drag; hãy để 2 component này nhận input rồi lắng nghe sự kiện của chúng.

## 2. Viết Item có cơ chế mới: kế thừa `Item`, lắng nghe sự kiện

Không sửa `ItemClickable`/`ItemDraggable` để thêm logic riêng. Tạo script mới `extends Item`,
subscribe vào `Ply_Event` bằng `addListener` với arrow-function field để remove được chính xác.
Mẫu chuẩn (theo `Knife.ts`, `Spatula.ts`):

```ts
import { _decorator, Node } from 'cc';
import { Item } from './Item';
import { ItemMoveToTarget } from './ItemMoveToTarget';

const { ccclass, property } = _decorator;

@ccclass('MyTool')
export class MyTool extends Item {
    private readonly onBeginDrag = (): void => this.OnBeginDrag();
    private readonly onDropSuccess = (target: Node): void => this.OnDropSuccess(target);
    private readonly onDropFail = (): void => this.OnDropFail();
    private readonly onClick = (): void => this.OnClick();
    private readonly onMoveComplete = (target: Node): void => this.OnArrived(target);

    protected onLoad(): void {
        super.onLoad(); // cacheComponents(true)
    }

    protected onEnable(): void {
        this.cacheComponents();

        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onBeginDrag.addListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropSuccess.addListener(this.onDropSuccess);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemDraggable?.onDropFail.addListener(this.onDropFail);

        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemClickable?.onClick.addListener(this.onClick);

        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
        this.itemMoveToTarget?.node.on(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    protected onDisable(): void {
        this.itemDraggable?.onBeginDrag.removeListener(this.onBeginDrag);
        this.itemDraggable?.onDropSuccess.removeListener(this.onDropSuccess);
        this.itemDraggable?.onDropFail.removeListener(this.onDropFail);
        this.itemClickable?.onClick.removeListener(this.onClick);
        this.itemMoveToTarget?.node.off(ItemMoveToTarget.EVENT_COMPLETE, this.onMoveComplete, this);
    }

    private OnDropSuccess(target: Node): void {
        this.itemDraggable?.DisableComponent();   // khoá drag trong lúc xử lý
        this.itemMoveToTarget?.ExecuteMove();      // bay tới defaultTarget
    }

    private OnArrived(target: Node): void {
        // ... làm việc của item ...
        this.ItemDone();                                   // isDone = true -> HandTut bỏ qua
        this.itemDraggable?.ReturnToStartWithoutHeart();   // về chỗ cũ, bật lại drag khi xong
    }
}
```

Checklist khi viết:
- Luôn gọi `super.onLoad()`; gọi `this.cacheComponents()` đầu `onEnable` vì ref có thể null sau reset.
- Handler là `private readonly` arrow field; `removeListener` trước `addListener` để tránh double-bind.
- Method public gọi từ Inspector đặt tên PascalCase (`MoveToTarget`, `FinishStir`) để bind qua Ply_Event.
- Bật/tắt khả năng bằng `EnableComponent()/DisableComponent()` trên component, **không** dùng `node.active` cho mục đích đó (HandTut đọc `enabled`).
- Item hoàn thành: gọi `ItemDone()` (hoặc `DoneAnimation()`), tiến bước bằng `DoOneStep()` nếu cần.
- Item kéo mà chưa có đích: `targetItemType = ItemType.None` ⇒ không drop được và không hand-tut. Set đích bằng `SetTargetItemType(node)`.
- Xử lý drop-fail đặc biệt: `SuppressCurrentDropFailEffect()`, `MarkCurrentDropFailHandled()`, `ConsumeCurrentDropFail()` trên `ItemDraggable` trong listener `onDropFail`.
- Cần thêm `ItemType` mới thì thêm vào enum `ItemType.ts`, không hard-code chuỗi.

## 3. HandTutManager: quyết định dựa trên component enabled/disabled

`HandTutManager.items` (Inspector, theo thứ tự ưu tiên) là danh sách `Item` được xét. Với mỗi item,
`canShowTutorialForItem` chỉ nhìn vào **trạng thái enabled của component** trên item đó, không cần
code riêng cho từng loại item:

| Kiểu hint | Điều kiện (tất cả phải đúng) |
|---|---|
| Click | `itemClickable.enabled && itemClickable.canClick` |
| Drag | `itemDraggable.enabled && itemDraggable.CanDrag()` **và** `itemMoveToTarget.defaultTarget` hợp lệ (nếu `requireMatchingTargetTypeForHandTut` thì `defaultTarget.Item.itemType === targetItemType`) |
| Stir | `itemStirring.enabled && !itemStirring.IsDone` |

Điều kiện chung: `!item.isDone && node.activeInHierarchy`. Item có `onProcess = true` được ưu tiên
trước. Thứ tự xét trong `showNextHandTut`: ItemDragRaycastTarget → Click → Drag → Stir.

Cử chỉ tuỳ biến (vuốt, đích ẩn ngoài màn hình...): override `Item.GetHandTutHint(): HandTutHint | null`
trả về `{ kind: 'click' | 'drag' | 'path', from, to, path }` (world position). HandTut ưu tiên hint này trước
các rule component; trả `null` khi không cần (ví dụ `Squid` vuốt đuôi, `Trash` trỏ tới vị trí thùng rác khi hiện).

Hệ quả thực hành:
- Item kéo tới đích có thể đang bận (thớt đang có món, `itemType` đích = None): bật `requireMatchingTargetTypeForHandTut` (CuttingItem tự bật) để HandTut chỉ gợi ý khi `itemType` của đích khớp. Đích có thể là node điểm con; HandTut tự tìm `Item` ở cha.
- Item xong việc phải `ItemDone()` (hoặc `DisableItemDraggable()`), nếu không HandTut sẽ gợi ý lại mãi.
- Muốn item **chưa** được hướng dẫn: `DisableComponent()` component tương ứng (drag/click/stir). Khi tới lượt, `EnableComponent()`.
- Muốn item **không bao giờ** được hướng dẫn nữa: `ItemDone()` (HandTut tự `removeCompletedItems`) hoặc `HandTutManager.Ins.ItemDone(node)`.
- Item spawn lúc runtime: `HandTutManager.Ins?.RegisterTutorialItem(item)`.
- Đổi đích kéo lúc runtime: `itemDraggable.SetTargetItemType(targetNode)` để `defaultTarget` và `targetItemType` khớp nhau.
- HandTut tự bind `onClick`/`onBeginDrag`/`onDropSuccess`/`onDropFail`/`onStirComplete` để reset idle timer — script con không cần gọi `RegisterCorrectAction()` trừ cơ chế custom không đi qua các component trên (khi đó gọi `HandTutManager.Ins?.RegisterCorrectAction()` / `OnGameplayDragBegin()` / `OnGameplayDragEnd()` thủ công như `PlasticPeeler`, `LastBowl`).

## 4. Setup trong scene/prefab

1. Node item: `UITransform` (dùng để raycast và kiểm tra vùng drop) + `Sprite` + `Item`/subclass.
2. Gán `itemType`. Đích drop cũng phải là `Item` với `itemType` tương ứng và `UITransform` bao đúng vùng thả.
3. Thêm `ItemClickable`/`ItemDraggable` (+ `ItemMoveToTarget` với `defaultTarget`) theo nhu cầu.
4. Click "Reset Component" trên `Item` (hoặc chạy game) để cache ref; kiểm tra các field `itemDraggable`, `itemClickable`, `itemMoveToTarget` trong Inspector đã được điền.
5. Thêm item vào `HandTutManager.items` đúng thứ tự bước chơi. Component chưa tới lượt để **disabled** trong prefab, bật bằng Ply_Event `EnableComponent` từ bước trước.
6. Sau khi sửa script hoặc scene qua MCP: refresh asset và chạy diagnostics (xem skill `funplay-cocos-mcp-workflow`).
