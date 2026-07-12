# DeepSeek 助手 Edge 扩展完整实现

## Destination

完成基于 Manifest V3 的 Edge 浏览器扩展 "DeepSeek 助手" 的全部功能编制：
工具栏弹窗（状态指示 + 指令列表 + 搜索 + 自动发送开关）、后台 Service Worker（状态管理 + 消息路由 + 存储 CRUD）、Content Script（DOM 注入 + MutationObserver 状态监控 + 文本填充）、Options 管理页（分类树 + CRUD + 拖拽排序 + 导入导出 + 恢复默认）、右键菜单（选中文本发送至 DeepSeek）、图标徽章联动。

## Notes

- **Effort type**: 携带执行（不仅是决策，最终产出是可运行的扩展程序）
- **Domain**: Edge 浏览器扩展 (Manifest V3), TypeScript, 纯原生 HTML/CSS
- **Skills**: prototype (UI 实际效果确认前先用原型), code-review (每个模块完成后审查), grilling/domain-modeling
- **编译**: tsc 编译 src/ → dist/，源码即"决策文档"
- **选择器策略**: 所有 chat.deepseek.com DOM 选择器做成可配置常量 (src/shared/constants.ts)，方便页面改版时调整
- **React 受控组件**: 填入文本时通过 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')` 绕过，再 dispatch `input` 事件
- **状态判定**: MutationObserver 监控 DOM，"停止生成"按钮存在 → GENERATING，输入框禁用 → GENERATING，其他 → IDLE，防抖 500ms

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

*(no decisions yet — map just charted)*

## Not yet specified

- **图标设计**: 需要确认扩展图标的具体设计（SVG 还是 PNG，多大尺寸）。可以在 Ticket 1 中作为"占位"处理，后续再替换。
- **测试方案**: 扩展程序在 Edge 中如何测试/加载（开发者模式加载解压的扩展）。这可能在所有工单完成后作为一个结论性步骤。

## Out of scope

*(nothing ruled out yet)*
