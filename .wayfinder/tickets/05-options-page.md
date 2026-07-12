---
id: ticket-05
title: 实现 Options 管理页面
type: task
status: closed
labels: [wayfinder:task]
blockedBy: [ticket-01, ticket-02]
---
## Question

实现指令管理页面，提供完整的指令 CRUD、分类管理、拖拽排序、导入导出 JSON、恢复默认指令功能。

### 具体工作

1. 创建 `src/options/options.html` — 左右分栏布局（左侧分类树、右侧指令列表）
2. 创建 `src/options/options.css` — 完整样式
3. 创建 `src/options/options.ts` — 交互逻辑
4. 左侧分类树:
   - "全部指令"（默认选中） + 各分类节点
   - 添加/重命名分类功能
5. 右侧指令表格:
   - 列：标题、内容预览、分类、自动发送、拖拽排序把手、操作按钮（编辑、删除）
   - 可点击排序（order 字段排序）
   - 拖拽排序（原生 HTML5 drag and drop）
6. 指令编辑对话框:
   - 字段：标题、内容（textarea）、分类（dropdown）、自动发送（toggle）、启用/禁用
7. 右上角工具栏:
   - 导入 JSON（文件选择器 + 解析 + 确认覆盖确认框）
   - 导出 JSON（下载文件）
   - 恢复默认指令（确认 → 覆盖所有指令为 10 条默认）
   - 批量启用/禁用
8. 所有操作通过 Service Worker 消息代理存储
