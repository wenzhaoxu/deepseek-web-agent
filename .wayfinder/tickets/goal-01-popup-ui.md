---
id: goal-01
title: Goal Popup UI（标签页 + 面板）
type: task
status: closed
labels: [wayfinder:task]
---
## Question

在 Popup 弹窗中增加标签页切换机制和 Goal 控制面板。

### 具体工作

1. 修改 `src/popup/popup.html`:
   - 顶部增加标签页导航：`指令` | `目标`（两个 tab button）
   - Goal 面板区域（隐藏/显示随标签切换）：
     - 指令列表（勾选模式）：从已有指令列表中选择要执行的指令
     - 目标字符串输入框：设定在回复中检测的字符串
     - 最大轮数输入框（数字，默认 3）
     - 开始/停止按钮
   - 保持原有指令面板（包裹在指令 tab 下）

2. 修改 `src/popup/popup.css`:
   - 标签页样式（选中高亮、过渡动画）
   - Goal 面板样式（勾选框、输入框、按钮布局）
   - 进度显示样式（轮数、指令索引、状态标签）

3. 修改 `src/popup/popup.ts`:
   - 标签页切换逻辑（显示/隐藏对应面板）
   - Goal 面板数据绑定：
     - 加载可用指令列表（GET_INSTRUCTIONS），加勾选框
     - 目标字符串输入、最大轮数输入
   - 开始按钮 → 发送 GOAL_START 消息给 SW
   - 停止按钮 → 发送 GOAL_STOP 消息给 SW
   - 进度轮询：定期（每 1s）发送 GOAL_STATUS 查询，更新进度显示
     - 显示：当前轮 / 总轮数，当前指令 X / Y，状态（等待回复中 / 定时等待中 / 已停止）
   - 接收 GOAL_STATUS_UPDATE 推送更新进度
