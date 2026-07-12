---
id: ticket-02
title: 实现后台 Service Worker
type: task
status: open
labels: [wayfinder:task]
blockedBy: [ticket-01]
---
## Question

实现后台 Service Worker，作为扩展的协调中枢，负责消息路由、标签页管理、状态缓存、存储 CRUD 和右键菜单。

### 具体工作

1. 创建 `src/background/service-worker.ts`
2. 实现消息监听器，处理所有消息类型:
   - `EXECUTE_INSTRUCTION`: 查找/创建 DeepSeek 标签页，等待加载，转发 FILL_TEXT 给 Content Script
   - `GET_INSTRUCTIONS` / `SAVE_INSTRUCTION` / `DELETE_INSTRUCTION`: 存储 CRUD
   - `GET_STATUS`: 返回当前标签页状态
   - `BATCH_OPERATIONS` (导入导出/批量启用禁用)
3. 实现 `tabStatusMap` 状态缓存:
   - 接收 Content Script 的 `STATUS_CHANGE` 更新
   - 标签页关闭/导航离开时自动清除 (`tabs.onRemoved`, `tabs.onUpdated`)
   - Chrome 扩展休眠唤醒时从 storage 恢复
4. 实现右键菜单 (`chrome.contextMenus`):
   - "发送至 DeepSeek" 根菜单项
   - 已启用 `showInContextMenu` 的指令作为子菜单
   - 点击时调用指令执行流程
5. 实现图标徽章:
   - GENERATING → 橙色圆点（用 `chrome.action.setBadgeText` + `setBadgeBackgroundColor`）
   - IDLE → 清除徽章
6. 实现标签页管理:
   - 查找已有 DeepSeek 标签页（URL 匹配）
   - 无则创建新标签页
   - 等待页面加载完成（content script 注入后发送 READY 信号）
   - 超时处理（5 秒未加载 → 返回错误）
