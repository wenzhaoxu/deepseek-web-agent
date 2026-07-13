---
id: goal-03
title: Content Script 文本查询接口
type: task
status: closed
labels: [wayfinder:task]
blockedBy: [goal-01]
---
## Question

在 Content Script 中增加 DOM 文本查询功能，供 Goal 引擎检测是否命中目标字符串。

### 具体工作

在 `src/content/content-script.ts` 中增加：

1. **新消息监听**: `GOAL_CHECK_TARGET`
   - 接收 `{ targetString: string }` 负载
   - 查询 DeepSeek 回复内容区域是否包含目标字符串
   - 返回 `{ found: boolean, matchedText?: string }`

2. **回复内容选择器**: 
   - 优先选择最新一条回复的文本区域
   - 尝试选择器：`.ds-markdown`, `[data-testid="assistant-message"]`, 或对话容器中最新的 assistant 消息
   - 如果找不到精确选择器，则 fallback 到读取页面可见文本（`document.body.innerText`）
   - 用选择器配置模式存到常量，方便后续调整

3. **IDLE 检测增强**:
   - 现有 STATUS_CHANGE 机制已在运行
   - Goal 引擎需要更可靠的 IDLE 检测，确保在回复完成后立即感知
   - 可考虑增加 MutationObserver 的监控范围或减少防抖时间

4. **注册新消息**: 在 `setupMessageListener()` 中增加 `GOAL_CHECK_TARGET` 分支
