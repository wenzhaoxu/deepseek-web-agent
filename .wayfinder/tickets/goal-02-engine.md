---
id: goal-02
title: Goal 执行引擎（Service Worker）
type: task
status: closed
labels: [wayfinder:task]
blockedBy: [goal-01]
---
## Question

在 Service Worker 中实现 Goal 循环执行引擎：控制指令发送时序、IDLE 检测、随机延时、目标字符串匹配、轮数管理和停止条件判断。

### 具体工作

在 `src/background/service-worker.ts` 中增加：

1. **Goal 状态管理**:
   ```typescript
   interface GoalState {
     running: boolean;
     selectedInstructionIds: string[];
     targetString: string;
     maxRounds: number;
     currentRound: number;
     currentInstructionIndex: number;
     status: 'idle' | 'waiting_idle' | 'delay_before_send' | 'sending' | 'waiting_response' | 'checking' | 'stopped';
   }
   let goalState: GoalState = { running: false, ... };
   ```

2. **新消息类型** (`MessageType`):
   - `GOAL_START` — GoalState 配置
   - `GOAL_STOP` — 强制停止
   - `GOAL_STATUS` — 查询当前进度（Popup 轮询用）

3. **Goal 执行流程 (`runGoal()`)**
   - 异步循环：
     1. 检查停止条件（手动停止 / 超轮 / 命中目标）
     2. 等待 IDLE（监听 STATUS_CHANGE → IDLE）
     3. 随机延时 2-4 秒（`Math.random() * 2000 + 2000` = 2000~4000ms）
     4. 发送当前指令（调用现有的 executeInstruction 逻辑，但不 auto-send——只填充文本）
     5. 等待 GENERATING → 再等待 IDLE（等待回复完成）
     6. 查询 CS 是否包含目标字符串（通过 GOAL_CHECK_TARGET 消息）
     7. 如命中 → 停止
     8. 如未命中 → 下一指令 / 下一轮

4. **与 Content Script 通信**:
   - `GOAL_CHECK_TARGET` (SW → CS): 查询页面文本是否包含目标字符串
   - CS 回复 `{ found: boolean }`

5. **并发防护**: 同一时间只允许一个 Goal 运行（`goalState.running` 锁）

6. **指令发送**: 复用 `executeInstruction()` 逻辑，但修改为只填充文本、不触发发送
