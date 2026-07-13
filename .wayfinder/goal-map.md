# Goal 循环自动发送功能

## Destination

为 DeepSeek 助手扩展增加 "Goal"（目标）功能：用户选择多条指令组成执行序列，扩展循环自动发送这些指令，每次发送后等待 DeepSeek 回复完成（状态回到 IDLE），随机延时约 3 秒后发送下一条，直至在回复内容中检测到目标字符串、达到最大轮数或用户手动停止。

## Notes

- **Effort type**: 携带执行（产出可运行的代码）
- **Domain**: Edge 浏览器扩展 (Manifest V3), TypeScript
- **Skills**: prototype (UI 布局先出原型确认), code-review
- **现有文件**：
  - `.wayfinder/map.md` — 原始扩展实现地图（已全部关闭）
  - `src/popup/` — 弹窗 UI（需加标签页 + Goal 面板）
  - `src/background/service-worker.ts` — 协调中枢（需加 Goal 引擎）
  - `src/content/content-script.ts` — DOM 注入（需支持查询回复内容）
- **Key design points**:
  - Popup 切换到 Goal 面板时才开始进度轮询
  - Goal 引擎在 Service Worker 中运行，即使 Popup 关闭也继续
  - 检测 IDLE 状态复用现有 STATUS_CHANGE 机制
  - 新增 GOAL_QUERY_DOM 消息类型让 SW 查询 CS 获取页面文本

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Goal Popup UI（标签页 + 面板）](tickets/goal-01-popup-ui.md) — 实现了指令/目标标签页切换，Goal 面板包含指令勾选、目标字符串输入、轮数设定、开始/停止控制、进度条和状态轮询。TypeScript 编译验证通过。
- [Goal 执行引擎（Service Worker）](tickets/goal-02-engine.md) — 实现了异步循环引擎：等待 IDLE → 随机延时 2-4s → 发送指令 → 等待回复 → 检查目标字符串 → 循环/停止。支持手动停止、目标命中、超轮三大停止条件。
- [Content Script 文本查询接口](tickets/goal-03-content-query.md) — 实现了 GOAL_CHECK_TARGET 消息处理，通过多选择器策略获取最新回复文本，用 indexOf 匹配目标字符串并返回上下文片段。

## Not yet specified

- **随机延时精度**: rand(3s) 的范围是 3±? 秒。可以在实现时确定具体范围。
- **目标字符串匹配位置**: 匹配整个页面文本还是仅匹配最新回复？建议仅匹配最新回复区域，避免误匹配到历史对话。

## Out of scope

- **Goal 持久化**: 不保存 Goal 配置到 storage，每次重新选择。（如果后续需要可以加）
- **多 Goal 并发**: 一次只运行一个 Goal，不允许多个同时执行。
