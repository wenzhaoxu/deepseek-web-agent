---
id: ticket-03
title: 实现 Content Script
type: task
status: open
labels: [wayfinder:task]
blockedBy: [ticket-01]
---
## Question

实现 Content Script，负责与 chat.deepseek.com 页面的 DOM 交互——文本填充、自动发送、状态监控上报。

### 具体工作

1. 创建 `src/content/content-script.ts`
2. 实现指令注入功能:
   - 定位输入框（主选择器 `#chat-input`，多个备选）
   - React 受控组件处理：通过 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')` 的 getter/setter
   - 填入文本、触发 `input` 事件（`native input setter` 方案）
   - 判断自动发送：IDLE 时可发送，GENERATING 时只填充不发送并返回警告
   - 发送方式：触发 Enter 键事件或点击 `div[role="button"]`
3. 实现状态监控:
   - `MutationObserver` 持续监听 DOM
   - 判定规则：存在"停止生成"按钮 → GENERATING；输入框禁用 → GENERATING；其他 → IDLE
   - 防抖 500ms 上报状态
   - `DISCONNECT` 事件（页面卸载时通知 SW）
4. 消息监听器注册:
   - 监听 `FILL_TEXT` 消息 → 执行填入 → 返回 `FILL_RESULT`
5. 页面加载完成后发送 `CONTENT_SCRIPT_READY` 信号（标志可接收指令）
