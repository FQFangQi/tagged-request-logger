# Tagged Request Logger 📡

[![Manifest V3](https://img.shields.io/badge/Extension-Manifest--V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Platform Chrome | Edge](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-lightgrey?style=flat-square)]()

`Tagged Request Logger` 是一款专为 **AI 协同开发（AI-Assisted Development）** 时代设计的浏览器端高保真调试与上下文抓取利器。它通过拦截运行时的网络请求、DOM 点击交互、控制台等级日志以及全局异常，生成高度结构化的时序报告，一键喂给 AI，帮助开发者以极高速度定位 Bug 并进行代码迭代。

---

## 📸 界面预览 (Placeholders)

> [!NOTE]
> 期待您提供以下建议的插件运行截图，以使文档表现更佳。截图准备好后，您可以将其命名并存入根目录。

| 截图命名 | 建议尺寸 | 画面内容推荐 |
| :--- | :--- | :--- |
| **`panel_preview.png`** | `800 × 500` | 正常网页中右下角的控制面板主界面，包含若干条点击、请求与报错的时序日志记录，展示最近的捕获状态。 |
| **`settings_preview.png`** | `400 × 500` | 配置中心展开时的页面，展示 Headers 过滤卡片、点击交互追踪卡片，以及异常与控制台追踪卡片的详细开关与多选级别。 |
| **`ai_copilot_demo.png`** | `1200 × 600` | 左右对比图：左侧为导出的结构化日志，右侧为黏贴进 Cursor / ChatGPT 中 AI 快速定位 Bug 的对话界面。 |

---

## 💡 为什么需要 Tagged Request Logger？

在 AI 辅助开发的日常工作中，开发者经常面临 **“上下文鸿沟 (Context Gap)”**：向 AI 描述一个 Bug 时，需要手动去 F12 复制 Network Payload、截图、粘贴 Console 报错，还要打字叙述自己的操作步骤。这非常低效，且极易遗漏关键现场。

### 核心优势对比

| 维度 | 传统 F12 开发者工具 | Tagged Request Logger |
| :--- | :--- | :--- |
| **时序整合度** | Console、Network、DOM 事件在不同的 Tab 中，呈割裂状态。 | 所有交互、请求、异常、日志在同一时间轴上交织，顺序一目了然。 |
| **事项归档 (Tag)** | 无法将特定操作链路进行归类。 | 提供「事项打标」机制，一键聚合“某个具体操作”触发的所有连锁反应。 |
| **数据脱敏 (Privacy)**| 复制的数据常含有 Token 和密码，有泄露隐患。 | 内置前端智能脱敏过滤，敏感字段在落入内存前自动替换为 `******`。 |
| **AI 协同度** | 导出的日志存在大量噪点（静态资源、无用请求），Token 消耗极大。 | 专注于核心接口过滤（默认支持正则）与事件精简，一键复制，即贴即用。 |

---

## 🌀 核心工作原理与架构

插件运行在页面的 **主世界 (MAIN world)** 空间中，能绕过 content script 的沙箱隔离，直接且无害地重写全局的原型链对象以及绑定全局监听器：

```mermaid
graph TD
    User([开发者操作网页]) --> ClickEvent[1. 触发 DOM 点击]
    User --> FetchXHR[2. 触发 HTTP 请求]
    User --> ConsoleMsg[3. 控制台打印/异常报错]

    subgraph MAIN World Context (content.js)
        ClickEvent --> ClickTracker[DOM 点击监听器]
        FetchXHR --> HttpInterceptor[Fetch & XHR 拦截器]
        ConsoleMsg --> ErrorConsoleTracker[JS 错误与 Console 拦截器]

        ClickTracker --> LoggerState[时序日志队列 state.logs]
        HttpInterceptor --> LoggerState
        ErrorConsoleTracker --> LoggerState

        ActiveTag{当前是否有激活事项?}
        LoggerState --> ActiveTag
        ActiveTag -- 是 --> ApplyTag[自动追加分类事项 Tag]
        ActiveTag -- 否 --> NoTag[无 Tag 独立记录]
        
        ApplyTag --> PanelUI[UI 实时时序列表预览]
        NoTag --> PanelUI
    end

    PanelUI --> ExportAction[复制全部/导出 TXT/单条复制]
    ExportAction --> AICopilot[喂给 AI 助手 Cursor/ChatGPT]
    AICopilot --> DebugResult([AI 极速定位 Bug / 生成修复代码])
```

---

## ✨ 核心特性

*   **📡 智能无害拦截**：全方位拦截 `Fetch` 和 `XMLHttpRequest` 请求。
*   **🏷️ 业务事项打标**：调试某个功能（例如“提交表单时报错”）时，输入标签点击「开始事项」，后续的所有点击、请求、日志都将带上该标签，彻底告别大海捞针。
*   **🚫 运行时异常捕获**：自动监听全局未捕获的 `Error` 以及 `Promise Rejection` 异常，自动抓取详细的堆栈轨迹 (Stack Trace)。
*   **🔴 控制台等级过滤**：重写 `console` 的日志分级输出（Error 🔴, Warn 🟡, Info 🔵, Log ⚪），保留原生 F12 控制台展示的同时，支持在插件设置中对抓取的等级进行细分过滤。
*   **🖱️ 精准 DOM 路径追踪**：自动获取点击元素的唯一 CSS Selector 路径（支持 `nth-of-type` 计算兄弟节点位置），完美指导 AI 确定被操作 of DOM。
*   **🔒 Privacy-First 安全脱敏**：在序列化 Payload 和日志时，自动在本地检测并过滤敏感键（如 `token`, `password`, `secret`, `auth` 等），用 `******` 进行本地脱敏，确保数据安全。
*   **🗑️ 微操作面板体验**：列表每一项支持鼠标悬浮操作，可一键 **📋 复制单条** 或 **🗑️ 彻底删除** 误触记录。

---

## 🛠️ 安装指南

本插件为 Manifest V3 规范的 Chromium 扩展，适用于 Chrome、Edge、Brave、Arc 等浏览器。

1. 克隆或下载本仓库至本地：
   ```bash
   git clone https://github.com/FQFangQi/tagged-request-logger.git
   ```
2. 打开浏览器的扩展程序管理页面（可在地址栏直接输入 `chrome://extensions/` 或 `edge://extensions/`）。
3. 开启右上角的 **「开发者模式」**。
4. 点击 **「加载已解压的扩展程序」**。
5. 选择解压后的本仓库根目录，即可完成安装。

---

## 🚀 推荐使用流程 (结合 AI 调试)

当你在本地开发遇到 Bug 或需要重构某段业务时：

1. **输入当前动作**：在 **Tagged Logger** 面板中输入当前你要测试的步骤名称，例如 `点击提交按钮报错`。
2. **启动录制**：点击 `⏺ 开始事项` 按钮，此时控制面板的指示器将呈蓝色呼吸闪烁。
3. **复现操作**：在网页上正常进行复现 Bug 的点击操作。
4. **获取报告**：在列表右下角点击 `📥 导出 TXT` 获或 `📋 复制全部`。
5. **投递给 AI**：打开 Cursor、Claude 或 ChatGPT，使用下方推荐的 Prompt，将报告发送给 AI，即可在 5 秒内获得极其精准的修复方案。

### 💬 推荐提问 Prompt 模版
```markdown
我在本地开发时遇到了一个 Bug。以下是通过 Tagged Logger 抓取的时序交互和接口报错日志。
请根据日志中的事件顺序、Payload 输入、响应 Response，以及 Error 堆栈，为我分析 Bug 产生的原因，并给出修复代码。

[此处粘贴您复制的日志文本]
```

---

## ⚙️ 高级配置项说明

进入面板右下角的 `⚙️ 配置` 页面，可开启或调整以下高级调试选项：

*   **URL 过滤规则**：可输入特定字符串过滤网络请求，也支持配置正则表达式（如 `/api\/v1\//i`）。
*   **Headers 调试过滤**：
    *   **白名单**：仅保留指定的 Headers 输出给 AI。
    *   **黑名单**：排除特定的敏感 Headers（默认排除 `cookie`, `authorization`, `token`）。
*   **点击追踪高级参数**：支持自定义是否在点击记录中包含当前的 URL 和元素的 Class 类名。
*   **异常与控制台配置**：
    *   支持选择性关闭“未捕获页面报错监听”。
    *   支持自定义记录哪些控制台等级日志（默认只记录 Error 和 Warn，避免 Log 级别的喧宾夺主）。

---

## 📂 项目结构
```
tagged-request-logger/
├── manifest.json       # 扩展描述清单 (MV3)
├── content.js          # 注入的 MAIN world 核心逻辑、样式及 UI 构建
├── icon.png            # 扩展图标 (128x128)
└── README.md           # 项目详细说明文档
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 许可开源。
