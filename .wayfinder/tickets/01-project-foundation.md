---
id: ticket-01
title: 搭建项目骨架与共享基础库
type: task
status: closed
labels: [wayfinder:task]
---
## Question

搭建项目的基础结构，包括构建配置、Manifest V3 配置、目录结构、共享类型定义、常量配置、消息通信协议，以及占位图标。

### 具体工作

1. 创建 `package.json`（仅需 typescript 依赖）、`tsconfig.json`
2. 创建 Manifest V3 配置文件 `src/manifest.json`
   - 声明 permissions: `storage`, `tabs`, `activeTab`, `contextMenus`
   - 声明 action popup, background service worker, content scripts
   - content_scripts 限定 `*://chat.deepseek.com/*`
3. 创建目录结构: `src/popup/`, `src/options/`, `src/background/`, `src/content/`, `src/shared/`, `src/icons/`, `dist/`
4. 创建 `src/shared/types.ts` — 所有接口定义:
   - `Instruction` 接口 (id, category, title, text, autoSend, enabled, order, showInContextMenu)
   - `TabStatus` 枚举 (IDLE, GENERATING)
   - 消息类型枚举和对应的消息接口
   - `InstructionCategory` 接口
5. 创建 `src/shared/constants.ts` — 所有常量:
   - DOM 选择器 (`CHAT_INPUT`, `SEND_BUTTON`, `STOP_BUTTON`, 等)
   - 存储键名 (`STORAGE_KEYS`)
   - 默认 10 条内置指令
   - 状态判定配置
6. 创建 `src/shared/messages.ts` — 消息通信封装，带类型安全的 createMessage/sendMessage 工具函数
7. 创建占位图标 `src/icons/`（至少 16x16, 48x48, 128x128 PNG，可以用简单生成的 SVG 转）
