# Tagged Request Logger

基于分类打标的网页网络请求及点击交互时序监听器，适用于前端开发与调试场景。

## 功能特性

- **网络请求拦截**：监听页面中的 `Fetch` 与 `XMLHttpRequest` 请求
- **URL 过滤**：支持字符串匹配或正则表达式过滤（默认 `/api/v1`）
- **事项打标**：为调试步骤添加标签，将请求与交互归类到同一事项
- **DOM 点击追踪**：记录点击元素的路径、文字、类名等信息
- **Headers 过滤**：支持白名单/黑名单过滤敏感 Headers
- **导出与复制**：支持导出 TXT 报告或一键复制全部日志
- **悬浮控制面板**：可拖拽、折叠，实时预览最近捕获记录

## 安装方式

本扩展为 Manifest V3 浏览器扩展，支持 Chrome / Edge 等 Chromium 内核浏览器。

1. 克隆或下载本仓库
2. 打开浏览器扩展管理页面
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本仓库根目录

## 启用范围

扩展默认仅在以下页面自动激活，避免干扰日常浏览：

- `localhost` / `127.0.0.1`（任意端口）
- 局域网 IP（`192.168.x.x`、`10.x.x.x`、`172.16-31.x.x`）
- 域名包含 `tyrion` 或 `basil` 的环境
- 任意页面 URL 添加参数 `?__enable_logger=true` 可强制启用

## 使用说明

1. 在目标页面右下角会出现 **Tagged Logger** 控制面板
2. 设置 URL 过滤规则（如 `/api/v1`）
3. 输入事项名称并点击「开始事项」，后续请求与点击将归入该标签
4. 点击单条记录可复制详情，或使用「导出 TXT」/「复制全部」
5. 在「配置」中可开启 Headers 记录、DOM 点击追踪等高级选项

## 隐私与安全

- 本扩展仅在页面主世界（MAIN world）注入脚本，拦截当前页面的网络请求
- 默认不记录 Headers；开启后可通过黑名单排除 `cookie`、`authorization`、`token` 等敏感字段
- 所有日志仅保存在当前页面内存中，不会上传到任何服务器
- 配置项通过页面 `localStorage` 持久化

## 项目结构

```
tagged-request-logger/
├── manifest.json    # 扩展清单
├── content.js       # 核心逻辑与 UI
├── icon.png         # 扩展图标
└── README.md
```

## 许可证

MIT License
