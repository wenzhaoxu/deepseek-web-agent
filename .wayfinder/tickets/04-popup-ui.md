---
id: ticket-04
title: 实现 Popup 弹窗界面
type: task
status: open
labels: [wayfinder:task]
blockedBy: [ticket-01, ticket-02]
---
## Question

实现工具栏弹窗界面，包括状态指示条、指令列表（按分类分组）、搜索框、自动发送开关、底部操作按钮。

### 具体工作

1. 创建 `src/popup/popup.html` — 布局结构
2. 创建 `src/popup/popup.css` — 样式（暗色模式跟随系统）
3. 创建 `src/popup/popup.ts` — 交互逻辑
4. 界面布局（从上到下）:
   - 状态指示条（顶部固定 28px）：🟢 可输入 / ⏳ 模型回复中…
   - 搜索框（粘性顶部）
   - 可滚动的指令列表，按分类分组，可折叠
   - 底部操作栏："打开 DeepSeek"、"管理指令"
5. 指令项设计:
   - 左侧图标（可选）
   - 标题
   - 右侧自动发送开关（GENERATING 时强制置灰）
6. 交互:
   - 点击指令 → 发送 EXECUTE_INSTRUCTION 消息 → 弹窗自动关闭
   - 搜索实时过滤
   - 打开时请求 GET_STATUS 显示当前状态
   - 打开时请求 GET_INSTRUCTIONS 加载指令列表
7. 暗色模式: `prefers-color-scheme: dark` 媒体查询
