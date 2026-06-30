/**
 * Tagged Request Logger - Edge Extension Content Script (MAIN World)
 * 监听、过滤、打标并导出当前页面的 HTTP 请求 (Fetch & XHR) 以及 DOM 点击交互
 */

(function () {
  // 避免重复注入
  if (window.__TAGGED_REQUEST_LOGGER_INITIALIZED__) {
    return;
  }

  // --- 域名及端口过滤：仅在开发、测试或线上系统页面上激活，不打扰其他日常网页 ---
  function shouldEnableOnCurrentPage() {
    const host = window.location.hostname;
    // 1. 本地任何端口 (如 localhost:8000, 9000, 3000)
    if (host === 'localhost' || host === '127.0.0.1') return true;
    // 2. 线上带有特定关键字的测试/生产环境
    if (host.includes('tyrion') || host.includes('basil')) return true;
    // 3. 局域网开发 IP (192.168.x.x, 10.x.x.x, 172.16.x.x ~ 172.31.x.x)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) return true;
    // 4. 地址栏参数强制启用 (任意页面后加 ?__enable_logger=true 即可激活)
    if (window.location.search.includes('__enable_logger=true')) return true;
    
    return false;
  }

  if (!shouldEnableOnCurrentPage()) {
    return;
  }

  window.__TAGGED_REQUEST_LOGGER_INITIALIZED__ = true;

  // --- 1. 核心状态维护 ---
  const state = {
    isListening: true,       // 默认开启监听
    filterPattern: '/api/v1', // 默认过滤 URL 包含的内容
    currentTag: '',          // 当前事项打标标签
    isTagActive: false,      // 当前事项是否正处于激活状态
    logs: [],                // 已记录的请求和标记列表
    includeHeaders: false,   // 是否包含 Headers
    headersKeepPattern: '',            // 仅保留 Headers (白名单)
    headersExcludePattern: 'cookie,authorization,token', // 排除 Headers (黑名单)
    includeClicks: true,     // 是否记录 DOM 点击交互 (默认开启)
    clickIncludeUrl: true,   // 点击记录中是否携带页面 URL
    clickIncludeClass: true, // 点击记录中是否携带元素类名
    showPanel: true,         // 是否显示面板
    isCollapsed: false       // 面板是否折叠
  };

  // 尝试从 localStorage 恢复配置
  try {
    const savedFilter = localStorage.getItem('__trl_filter');
    if (savedFilter !== null) state.filterPattern = savedFilter;
    const savedIncludeHeaders = localStorage.getItem('__trl_headers');
    if (savedIncludeHeaders !== null) state.includeHeaders = savedIncludeHeaders === 'true';
    const savedKeep = localStorage.getItem('__trl_headers_keep');
    if (savedKeep !== null) state.headersKeepPattern = savedKeep;
    const savedExclude = localStorage.getItem('__trl_headers_exclude');
    if (savedExclude !== null) state.headersExcludePattern = savedExclude;
    const savedIncludeClicks = localStorage.getItem('__trl_clicks');
    if (savedIncludeClicks !== null) state.includeClicks = savedIncludeClicks === 'true';
    const savedClickUrl = localStorage.getItem('__trl_click_url');
    if (savedClickUrl !== null) state.clickIncludeUrl = savedClickUrl === 'true';
    const savedClickClass = localStorage.getItem('__trl_click_class');
    if (savedClickClass !== null) state.clickIncludeClass = savedClickClass === 'true';
  } catch (e) {
    console.error('[RequestLogger] 恢复配置失败:', e);
  }

  // --- 2. 工具函数 ---
  function getFormattedTime(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
           `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  }

  function tryFormatJson(text) {
    if (!text) return '';
    try {
      const obj = JSON.parse(text);
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return text;
    }
  }

  function matchUrl(url) {
    if (!state.filterPattern) return true; // 为空则不过滤
    try {
      // 尝试作为正则解析，如 /api\/v1/i
      if (state.filterPattern.startsWith('/') && state.filterPattern.lastIndexOf('/') > 0) {
        const lastSlash = state.filterPattern.lastIndexOf('/');
        const pattern = state.filterPattern.slice(1, lastSlash);
        const flags = state.filterPattern.slice(lastSlash + 1);
        const regex = new RegExp(pattern, flags);
        return regex.test(url);
      }
      // 否则普通字符串模糊匹配
      return url.includes(state.filterPattern);
    } catch (e) {
      // 正则解析失败，退化为普通字符串包含判断
      return url.includes(state.filterPattern);
    }
  }

  // 根据黑白名单配置过滤 Headers
  function filterHeaders(headersObj) {
    if (!headersObj) return null;
    const filtered = {};
    const keepKeys = state.headersKeepPattern 
      ? state.headersKeepPattern.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const excludeKeys = state.headersExcludePattern
      ? state.headersExcludePattern.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
      : [];

    Object.keys(headersObj).forEach(key => {
      const lowerKey = key.toLowerCase();
      // 1. 如果设置了“仅保留”（白名单优先）
      if (keepKeys.length > 0) {
        if (keepKeys.includes(lowerKey)) {
          filtered[key] = headersObj[key];
        }
      } else {
        // 2. 否则，使用“排除”（黑名单）
        if (!excludeKeys.includes(lowerKey)) {
          filtered[key] = headersObj[key];
        }
      }
    });
    return filtered;
  }

  // 生成唯一而精准的 CSS Selector 路径，包含 nth-of-type 计数支持，便于 AI 完美定位 DOM
  function getDomPath(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {
        selector += '#' + current.id;
        path.unshift(selector);
        break; // 遇到唯一 ID 提前退出向上遍历
      } else {
        if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\s+/).filter(Boolean);
          if (classes.length > 0) {
            selector += '.' + classes.join('.');
          }
        }
        // 计算其在同名兄弟节点中的位置索引
        let index = 1;
        let sib = current.previousElementSibling;
        while (sib) {
          if (sib.nodeName === current.nodeName) {
            index++;
          }
          sib = sib.previousElementSibling;
        }
        let hasSameSib = false;
        let nextSib = current.nextElementSibling;
        while (nextSib) {
          if (nextSib.nodeName === current.nodeName) {
            hasSameSib = true;
            break;
          }
          nextSib = nextSib.nextElementSibling;
        }
        if (index > 1 || hasSameSib) {
          selector += `:nth-of-type(${index})`;
        }
        path.unshift(selector);
      }
      current = current.parentNode;
    }
    return path.join(' > ');
  }

  // 组装完整的报告文本 (供导出与一键复制全部使用)
  function generateLogReport() {
    let txt = `============================================================\n`;
    txt += `Tagged Request Logger - 导出报告\n`;
    txt += `时间: ${getFormattedTime()}\n`;
    txt += `页面URL: ${window.location.href}\n`;
    txt += `过滤规则: ${state.filterPattern || '(无)'}\n`;
    txt += `包含Headers: ${state.includeHeaders ? '是' : '否'}\n`;
    txt += `包含DOM交互: ${state.includeClicks ? '是' : '否'}\n`;
    txt += `============================================================\n\n`;

    state.logs.forEach((log, index) => {
      if (log.type === 'marker') {
        const timeStr = getFormattedTime(log.timestamp);
        if (log.action === 'start') {
          txt += `\n--- 事项开始: [${log.text}] (${timeStr}) ---\n\n`;
        } else {
          txt += `\n--- 事项结束: [${log.text}] (${timeStr}) ---\n\n`;
        }
      } else if (log.type === 'click') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[交互 ${index + 1}] [鼠标点击]  ${timeStr}\n`;
        if (log.url) txt += `页面地址: ${log.url}\n`;
        txt += `标签: ${log.tagName}\n`;
        txt += `文字: ${log.innerText ? `"${log.innerText}"` : '(无文字)'}\n`;
        if (log.id) txt += `元素ID: ${log.id}\n`;
        if (log.className) txt += `类名: ${log.className}\n`;
        txt += `唯一 Selector 路径: ${log.selector}\n`;
        if (log.tag) txt += `所属事项: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'request') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[请求 ${index + 1}] [${log.tech}]  ${timeStr}\n`;
        txt += `方法: ${log.method}\n`;
        txt += `URL: ${log.url}\n`;
        txt += `状态码: ${log.status}\n`;
        txt += `请求用时: ${log.durationMs !== null ? log.durationMs + 'ms' : '读取中...'}\n`;
        if (log.tag) {
          txt += `所属事项: ${log.tag}\n`;
        }

        if (state.includeHeaders) {
          txt += `\n请求 Headers:\n`;
          const filteredReq = filterHeaders(log.reqHeaders);
          txt += filteredReq && Object.keys(filteredReq).length ? JSON.stringify(filteredReq, null, 2) : '(空)';
          txt += `\n\n响应 Headers:\n`;
          const filteredRes = filterHeaders(log.resHeaders);
          txt += filteredRes && Object.keys(filteredRes).length ? JSON.stringify(filteredRes, null, 2) : '(空)';
          txt += `\n`;
        }

        txt += `\n请求 Payload:\n`;
        txt += tryFormatJson(log.reqBody) || '(空)';
        txt += `\n\n响应 Response:\n`;
        txt += tryFormatJson(log.resBody) || '(空)';
        txt += `\n------------------------------------------------------------\n\n`;
      }
    });

    return txt;
  }

  function addLog(logItem) {
    if (!state.isListening) return;
    state.logs.push(logItem);
    updateUIListCount();
  }

  // --- 3. 拦截 Fetch 请求 ---
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    if (!state.isListening) {
      return originalFetch.apply(this, arguments);
    }

    const startTime = performance.now();

    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input && typeof input === 'object' && 'url' in input) {
      url = input.url;
    }

    // 过滤判断
    if (!matchUrl(url)) {
      return originalFetch.apply(this, arguments);
    }

    const method = (init && init.method) || (input && input.method) || 'GET';
    let reqBody = '';
    if (init && init.body) {
      reqBody = init.body;
    } else if (input && typeof input === 'object' && 'body' in input) {
      reqBody = input.body;
    }

    if (reqBody instanceof ReadableStream) {
      reqBody = '[ReadableStream]';
    } else if (reqBody instanceof FormData) {
      const fdData = {};
      for (let [key, val] of reqBody.entries()) {
        fdData[key] = val instanceof File ? `File: ${val.name} (${val.size}B)` : val;
      }
      reqBody = JSON.stringify(fdData);
    } else if (typeof reqBody !== 'string') {
      try {
        reqBody = JSON.stringify(reqBody) || '';
      } catch(e) {
        reqBody = String(reqBody);
      }
    }

    const logItem = {
      type: 'request',
      tech: 'Fetch',
      timestamp: Date.now(),
      durationMs: null,
      method: method.toUpperCase(),
      url: url,
      reqHeaders: init && init.headers ? JSON.parse(JSON.stringify(init.headers)) : null,
      reqBody: reqBody,
      status: 0,
      resBody: '',
      resHeaders: null,
      tag: state.isTagActive ? state.currentTag : null
    };

    try {
      const response = await originalFetch.apply(this, arguments);
      logItem.status = response.status;
      
      // 复制响应流，读取 body
      const clonedRes = response.clone();
      
      // 获取 response headers
      const resHeaders = {};
      if (clonedRes.headers) {
        clonedRes.headers.forEach((value, key) => {
          resHeaders[key] = value;
        });
      }
      logItem.resHeaders = resHeaders;

      clonedRes.text().then(text => {
        logItem.resBody = text;
        logItem.durationMs = Math.round(performance.now() - startTime);
        addLog(logItem);
      }).catch(err => {
        logItem.resBody = `[读取Response失败: ${err.message}]`;
        logItem.durationMs = Math.round(performance.now() - startTime);
        addLog(logItem);
      });

      return response;
    } catch (error) {
      logItem.status = 'FAILED';
      logItem.resBody = `[请求异常: ${error.message}]`;
      logItem.durationMs = Math.round(performance.now() - startTime);
      addLog(logItem);
      throw error;
    }
  };

  // --- 4. 拦截 XMLHttpRequest (XHR) 请求 ---
  const originalXHR = window.XMLHttpRequest;
  function CustomXHR() {
    const xhr = new originalXHR();
    const open = xhr.open;
    const send = xhr.send;
    const setRequestHeader = xhr.setRequestHeader;
    
    let method = 'GET';
    let url = '';
    const reqHeaders = {};
    let reqBody = '';

    xhr.open = function(m, u) {
      method = m;
      url = typeof u === 'string' ? u : (u && u.href) || String(u);
      return open.apply(this, arguments);
    };

    xhr.setRequestHeader = function(header, value) {
      reqHeaders[header] = value;
      return setRequestHeader.apply(this, arguments);
    };

    xhr.send = function(body) {
      const startTime = performance.now();
      if (body) {
        if (body instanceof Document) {
          reqBody = new XMLSerializer().serializeToString(body);
        } else if (body instanceof FormData) {
          const fdData = {};
          for (let [key, val] of body.entries()) {
            fdData[key] = val instanceof File ? `File: ${val.name} (${val.size}B)` : val;
          }
          reqBody = JSON.stringify(fdData);
        } else if (typeof body === 'object') {
          try {
            reqBody = JSON.stringify(body);
          } catch(e) {
            reqBody = String(body);
          }
        } else {
          reqBody = String(body);
        }
      }

      if (state.isListening && matchUrl(url)) {
        const logItem = {
          type: 'request',
          tech: 'XHR',
          timestamp: Date.now(),
          durationMs: null,
          method: method.toUpperCase(),
          url: new URL(url, window.location.href).href,
          reqHeaders: reqHeaders,
          reqBody: reqBody,
          status: 0,
          resBody: '',
          resHeaders: null,
          tag: state.isTagActive ? state.currentTag : null
        };

        this.addEventListener('load', function() {
          logItem.status = xhr.status;
          logItem.resBody = xhr.responseText;
          logItem.durationMs = Math.round(performance.now() - startTime);
          
          // 获取 XHR response headers
          const rawHeaders = xhr.getAllResponseHeaders();
          const headers = {};
          if (rawHeaders) {
            rawHeaders.trim().split(/[\r\n]+/).forEach(line => {
              const parts = line.split(': ');
              const header = parts.shift();
              const value = parts.join(': ');
              if (header) headers[header.toLowerCase()] = value;
            });
          }
          logItem.resHeaders = headers;

          addLog(logItem);
        });

        this.addEventListener('error', function() {
          logItem.status = 'FAILED';
          logItem.resBody = '[XHR 请求发生网络错误]';
          logItem.durationMs = Math.round(performance.now() - startTime);
          addLog(logItem);
        });

        this.addEventListener('abort', function() {
          logItem.status = 'ABORTED';
          logItem.resBody = '[XHR 请求被中止]';
          logItem.durationMs = Math.round(performance.now() - startTime);
          addLog(logItem);
        });
      }

      return send.apply(this, arguments);
    };

    return xhr;
  }
  CustomXHR.prototype = originalXHR.prototype;
  window.XMLHttpRequest = CustomXHR;

  // --- 5. 监听全局鼠标点击交互事件 (打标开启 && 开关勾选时生效) ---
  document.addEventListener('click', function (e) {
    // 只有在开启监听、打标事项激活、且“点击交互”开关开启时才进行记录
    if (!state.isListening || !state.isTagActive || !state.includeClicks) {
      return;
    }
    
    // 如果点击的是我们插件自身的控制面板、悬浮球或者 Toast 提示，直接忽略
    if (e.target.closest('#brl-panel-container') || e.target.closest('#brl-toast')) {
      return;
    }

    const el = e.target;
    const clickLog = {
      type: 'click',
      timestamp: Date.now(),
      tagName: el.tagName,
      innerText: el.innerText ? el.innerText.trim().slice(0, 60) : '',
      id: el.id || '',
      selector: getDomPath(el),
      tag: state.currentTag
    };

    // 根据高级设置决定是否携带 URL 和类名
    if (state.clickIncludeUrl) {
      clickLog.url = window.location.href;
    }
    if (state.clickIncludeClass) {
      clickLog.className = typeof el.className === 'string' ? el.className.trim() : '';
    }

    state.logs.push(clickLog);
    updateUIListCount();
  }, true); // 使用 Capture 捕获阶段，防止部分被 stopPropagation 的交互事件遗漏

  // --- 6. 交互面板 UI 构建 ---
  const styleText = `
    #brl-panel-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 340px;
      background: rgba(20, 20, 20, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      z-index: 2147483647;
      overflow: hidden;
      transition: opacity 0.2s, transform 0.2s, width 0.3s, height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      display: flex;
      flex-direction: column;
    }

    #brl-panel-container.collapsed {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(16, 185, 129, 0.9); /* 绿色小悬浮球 */
      border: 2px solid rgba(255, 255, 255, 0.2);
    }

    #brl-panel-container.collapsed:hover {
      background: rgba(16, 185, 129, 1);
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.6);
      transform: scale(1.05);
    }

    #brl-panel-header {
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: move;
    }

    .brl-title {
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .brl-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981; /* 绿色 */
      display: inline-block;
    }

    .brl-indicator.paused {
      background: #f59e0b; /* 黄色 */
    }

    .brl-indicator.pulse {
      animation: brl-pulse-anim 1.5s infinite;
    }

    @keyframes brl-pulse-anim {
      0% { transform: scale(0.9); opacity: 0.6; }
      50% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.6; }
    }

    .brl-header-ops {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brl-icon-btn {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }

    .brl-icon-btn:hover {
      color: #fff;
    }

    /* 滑动容器结构 */
    #brl-slider-viewport {
      overflow: hidden;
      width: 340px;
      position: relative;
    }

    #brl-slider-wrapper {
      display: flex;
      width: 680px; /* 两个 340px 视口 */
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #brl-view-main {
      width: 340px;
      flex-shrink: 0;
      padding: 12px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #brl-view-settings {
      width: 340px;
      flex-shrink: 0;
      padding: 12px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .brl-field-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .brl-label {
      color: #888;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .brl-input {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      color: #fff;
      padding: 6px 8px;
      font-size: 12px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s, background-color 0.15s;
    }

    .brl-input:focus {
      border-color: rgba(16, 185, 129, 0.5);
      background: rgba(255, 255, 255, 0.08);
    }

    .brl-btn-row {
      display: flex;
      gap: 8px;
    }

    .brl-btn {
      flex: 1;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #e0e0e0;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .brl-btn:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }

    .brl-btn.primary {
      background: #10b981;
      border-color: #059669;
      color: #fff;
    }

    .brl-btn.primary:hover {
      background: #059669;
    }

    .brl-btn.danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.25);
      color: #f87171;
    }

    .brl-btn.danger:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #fff;
    }

    .brl-btn.active-tag {
      background: #3b82f6;
      border-color: #2563eb;
      color: #fff;
      animation: brl-glow-blue 2s infinite alternate;
    }
    
    .brl-btn.active-tag:hover {
      background: #2563eb;
    }

    @keyframes brl-glow-blue {
      0% { box-shadow: 0 0 5px rgba(59, 130, 246, 0.3); }
      100% { box-shadow: 0 0 12px rgba(59, 130, 246, 0.6); }
    }

    .brl-tag-status-bar {
      background: rgba(59, 130, 246, 0.08);
      border: 1px dashed rgba(59, 130, 246, 0.25);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: #93c5fd;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brl-tag-status-bar span {
      font-weight: bold;
    }

    .brl-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 8px 12px;
      font-size: 11px;
      color: #888;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0, 0, 0, 0.12);
    }

    /* 高级配置面板自定义美化 CSS Switch */
    .brl-switch {
      position: relative;
      display: inline-block;
      width: 34px;
      height: 18px;
    }

    .brl-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .brl-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, 0.12);
      transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 18px;
    }

    .brl-slider:before {
      position: absolute;
      content: "";
      height: 12px;
      width: 12px;
      left: 3px;
      bottom: 3px;
      background-color: #fff;
      transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 50%;
    }

    .brl-switch input:checked + .brl-slider {
      background-color: #10b981;
    }

    .brl-switch input:checked + .brl-slider:before {
      transform: translateX(16px);
    }

    /* 高级配置面板自定义 Checkbox */
    .brl-custom-cb {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 12px;
      color: #ccc;
      user-select: none;
    }

    .brl-custom-cb input {
      display: none;
    }

    .brl-checkbox-box {
      width: 15px;
      height: 15px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.03);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .brl-custom-cb input:checked + .brl-checkbox-box {
      background: #10b981;
      border-color: #10b981;
    }

    .brl-checkbox-box:after {
      content: "";
      width: 3px;
      height: 6px;
      border: solid #fff;
      border-width: 0 1.5px 1.5px 0;
      transform: rotate(45deg);
      display: none;
      margin-bottom: 2px;
    }

    .brl-custom-cb input:checked + .brl-checkbox-box:after {
      display: block;
    }

    /* 设置页面的精美卡片布局 */
    .brl-settings-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
    }

    .brl-settings-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brl-settings-card-title {
      font-weight: 600;
      color: #fff;
      font-size: 12px;
    }

    .brl-btn-back {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #ddd;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.15s, color 0.15s;
    }

    .brl-btn-back:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }

    #brl-btn-go-settings {
      padding: 4px;
      font-size: 14px;
      color: #aaa;
      transition: color 0.15s;
    }

    #brl-btn-go-settings:hover {
      color: #fff;
    }

    /* 迷你状态下的绿色小点和计数器 */
    .brl-mini-dot {
      display: none;
      width: 14px;
      height: 14px;
      background: #fff;
      color: #10b981;
      border-radius: 50%;
      font-size: 9px;
      font-weight: bold;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      position: absolute;
      top: -4px;
      right: -4px;
    }

    #brl-panel-container.collapsed .brl-mini-dot {
      display: flex;
    }

    #brl-panel-container.collapsed #brl-panel-header,
    #brl-panel-container.collapsed #brl-slider-viewport {
      display: none !important;
    }

    #brl-panel-container.collapsed .brl-ball-icon {
      display: block;
      color: #fff;
      font-size: 18px;
    }

    .brl-ball-icon {
      display: none;
    }

    #brl-preview-list {
      max-height: 110px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 6px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    /* 自定义精细化滚动条 */
    #brl-preview-list::-webkit-scrollbar,
    #brl-view-settings div::-webkit-scrollbar {
      width: 4px;
    }
    #brl-preview-list::-webkit-scrollbar-track,
    #brl-view-settings div::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 4px;
    }
    #brl-preview-list::-webkit-scrollbar-thumb,
    #brl-view-settings div::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.18);
      border-radius: 4px;
    }
    #brl-preview-list::-webkit-scrollbar-thumb:hover,
    #brl-view-settings div::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .brl-log-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.02);
      border-left: 3px solid #10b981;
      cursor: pointer;
      transition: background 0.15s;
    }
    
    .brl-log-row:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    
    .brl-log-row.status-err {
      border-left-color: #ef4444;
      background: rgba(239, 68, 68, 0.05);
    }
    
    .brl-log-row.status-warn {
      border-left-color: #f59e0b;
    }
    
    .brl-log-row.status-marker {
      border-left-color: #3b82f6;
      background: rgba(59, 130, 246, 0.08);
      font-style: italic;
      color: #93c5fd;
    }

    .brl-log-row.status-click {
      border-left-color: #10b981;
      background: rgba(16, 185, 129, 0.05);
      color: #e0e0e0;
    }

    .brl-log-method {
      font-weight: bold;
      font-family: monospace;
      padding: 1px 3px;
      border-radius: 3px;
      font-size: 9px;
      min-width: 32px;
      text-align: center;
    }
    
    .brl-method-get { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .brl-method-post { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .brl-method-put { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .brl-method-delete { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .brl-method-other { background: rgba(255, 255, 255, 0.1); color: #ccc; }

    .brl-log-path {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0 6px;
      font-family: monospace;
      color: #ccc;
      text-align: left;
    }

    .brl-log-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: #888;
    }

    .brl-log-duration {
      font-family: monospace;
      color: #a7f3d0;
    }
    
    .brl-log-row.status-err .brl-log-duration {
      color: #fca5a5;
    }
    
    #brl-toast {
      position: absolute;
      bottom: 50px;
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      background: rgba(16, 185, 129, 0.95);
      color: #fff;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 500;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    #brl-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;

  // 声明所有全局 UI 变量，以便外层函数访问
  let panel, indicator, btnToggleListen, btnClear, btnExport, btnCollapse, inputFilter, inputTag, btnActionTag, tagStatusBar, tagStatusText, cbHeaders, cbClicks, cbClickUrl, cbClickClass, statusText, statusDot, miniCount, header, previewList;

  // 精致 Toast 弹窗
  function showToast(message) {
    const toast = document.getElementById('brl-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // 更新已捕获请求数与实时预览列表
  function updateUIListCount() {
    if (!btnClear || !miniCount) return;
    // 仅计数网络请求
    const reqCount = state.logs.filter(l => l.type === 'request').length;
    btnClear.textContent = `🗑 清空数据 (${reqCount})`;
    miniCount.textContent = reqCount;

    // 重新渲染最近的 6 条日志（包括打标、网络请求和 DOM 点击）
    if (previewList) {
      const displayLogs = state.logs.slice(-6);
      if (displayLogs.length === 0) {
        previewList.innerHTML = `<div style="text-align: center; color: #666; padding: 12px; font-size: 11px; font-style: italic;">暂无符合条件的请求</div>`;
        return;
      }

      previewList.innerHTML = '';
      displayLogs.forEach(log => {
        const row = document.createElement('div');
        row.className = 'brl-log-row';

        if (log.type === 'marker') {
          row.classList.add('status-marker');
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          row.innerHTML = `<div style="flex: 1; text-align: center; font-size: 10px;">${log.action === 'start' ? '▶' : '⏹'} 事项: ${log.text} (${timeStr})</div>`;
        } else if (log.type === 'click') {
          row.classList.add('status-click');
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          let elementDesc = log.tagName.toLowerCase();
          if (log.id) elementDesc += `#${log.id}`;
          const textExcerpt = log.innerText ? ` "${log.innerText.slice(0, 14)}"` : '';

          row.innerHTML = `
            <div style="flex: 1; text-align: left; font-size: 11px; display: flex; align-items: center; gap: 6px;">
              <span>🖱️</span>
              <span style="font-weight: bold; color: #10b981; font-family: monospace; background: rgba(16, 185, 129, 0.15); padding: 1px 3px; border-radius: 3px; font-size: 9px;">CLICK</span>
              <span style="color: #ccc; font-family: monospace;">${elementDesc}${textExcerpt}</span>
            </div>
            <span style="font-size: 10px; color: #666; font-family: monospace;">${timeStr}</span>
          `;

          // 点击单条点击记录复制元素详情
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            let detail = `=========================================\n`;
            detail += `交互事件: 点击页面元素 (CLICK)\n`;
            if (log.url) detail += `页面地址: ${log.url}\n`;
            detail += `元素标签: ${log.tagName}\n`;
            detail += `显示文字: ${log.innerText ? `"${log.innerText}"` : '(空)'}\n`;
            if (log.id) detail += `元素 ID: ${log.id}\n`;
            if (log.className) detail += `元素类名: ${log.className}\n`;
            detail += `唯一 DOM 路径 (CSS Selector):\n${log.selector}\n`;
            detail += `时间: ${getFormattedTime(log.timestamp)}\n`;
            if (log.tag) detail += `所属事项: ${log.tag}\n`;
            detail += `=========================================\n`;

            navigator.clipboard.writeText(detail).then(() => {
              showToast('已复制 DOM 交互详情到剪贴板！');
            }).catch(err => {
              console.error('复制失败:', err);
              showToast('复制失败，请重试');
            });
          });
        } else {
          // 网络请求类型的渲染
          const isErr = log.status === 'FAILED' || log.status >= 400 || log.status === 0;
          if (isErr) {
            row.classList.add('status-err');
          } else if (log.status >= 300) {
            row.classList.add('status-warn');
          }

          let displayPath = '';
          try {
            const urlObj = new URL(log.url);
            displayPath = urlObj.pathname + urlObj.search;
          } catch(e) {
            displayPath = log.url;
          }
          if (displayPath.length > 28) {
            displayPath = displayPath.slice(0, 10) + '...' + displayPath.slice(-15);
          }

          const durationText = log.durationMs !== null ? `${log.durationMs}ms` : '读取中';
          const methodClass = `brl-method-${log.method.toLowerCase()}`;

          row.innerHTML = `
            <span class="brl-log-method ${methodClass}">${log.method}</span>
            <span class="brl-log-path" title="${log.url}">${displayPath}</span>
            <div class="brl-log-meta">
              <span style="font-weight: bold; color: ${isErr ? '#f87171' : '#10b981'}">${log.status}</span>
              <span class="brl-log-duration">${durationText}</span>
            </div>
          `;

          // 点击单条请求复制详情
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            let detail = `=========================================\n`;
            detail += `请求方式: ${log.method}\n`;
            detail += `请求 URL: ${log.url}\n`;
            detail += `状态码: ${log.status}\n`;
            detail += `耗时: ${log.durationMs !== null ? log.durationMs + 'ms' : '未知'}\n`;
            detail += `时间: ${getFormattedTime(log.timestamp)}\n`;
            if (log.tag) detail += `所属事项: ${log.tag}\n`;
            
            if (state.includeHeaders) {
              detail += `\n请求 Headers:\n`;
              const filteredReq = filterHeaders(log.reqHeaders);
              detail += filteredReq && Object.keys(filteredReq).length ? JSON.stringify(filteredReq, null, 2) : '(空)';
              detail += `\n\n响应 Headers:\n`;
              const filteredRes = filterHeaders(log.resHeaders);
              detail += filteredRes && Object.keys(filteredRes).length ? JSON.stringify(filteredRes, null, 2) : '(空)';
              detail += `\n`;
            }

            detail += `\n请求 Payload:\n`;
            detail += tryFormatJson(log.reqBody) || '(空)';
            detail += `\n\n响应 Response:\n`;
            detail += tryFormatJson(log.resBody) || '(空)';
            detail += `\n=========================================\n`;

            navigator.clipboard.writeText(detail).then(() => {
              showToast('已复制该请求到剪贴板！');
            }).catch(err => {
              console.error('复制失败:', err);
              showToast('复制失败，请重试');
            });
          });
        }
        previewList.appendChild(row);
      });
      previewList.scrollTop = previewList.scrollHeight;
    }
  }

  // 展开或收起面板
  function setCollapsed(collapsed) {
    if (!panel) return;
    state.isCollapsed = collapsed;
    if (collapsed) {
      panel.classList.add('collapsed');
      panel.style.bottom = ''; // 避免折叠时被 fixed 限制高宽拉伸
      panel.style.right = '';
    } else {
      panel.classList.remove('collapsed');
      // 展开时如果有暂存的拖拽坐标则恢复，否则使用默认右下角
      if (panel.style.left) {
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
      }
    }
  }

  function initUI() {
    // 1. 创建并插入样式
    const styleEl = document.createElement('style');
    styleEl.textContent = styleText;
    (document.head || document.documentElement).appendChild(styleEl);

    // 2. 创建面板容器
    panel = document.createElement('div');
    panel.id = 'brl-panel-container';
    
    // 面板内部 HTML - 使用滑屏分栏设计 (Slider Viewport)
    panel.innerHTML = `
      <!-- 迷你模式小图标 -->
      <div class="brl-ball-icon">📡</div>
      <div class="brl-mini-dot" id="brl-mini-count">0</div>

      <!-- 头部 (始终固定) -->
      <div id="brl-panel-header">
        <div class="brl-title">
          <span class="brl-indicator pulse" id="brl-status-indicator"></span>
          <span>Tagged Logger</span>
        </div>
        <div class="brl-header-ops">
          <button class="brl-icon-btn" id="brl-btn-collapse" title="折叠面板">➖</button>
          <button class="brl-icon-btn" id="brl-btn-close" title="彻底关闭" style="margin-left: 6px;">❌</button>
        </div>
      </div>

      <!-- 横向滑动内容区 -->
      <div id="brl-slider-viewport">
        <div id="brl-slider-wrapper">
          
          <!-- [页面 1]: 主控制视图 -->
          <div id="brl-view-main">
            <!-- 过滤规则 -->
            <div class="brl-field-group">
              <div class="brl-label">过滤 URL 匹配规则</div>
              <input type="text" class="brl-input" id="brl-input-filter" value="${state.filterPattern}" placeholder="例如：/typekey/api/v1 或 正则如 /api/v1/" />
            </div>

            <!-- 状态控制按钮 -->
            <div class="brl-btn-row">
              <button class="brl-btn" id="brl-btn-toggle-listen">⏸ 暂停监听</button>
              <button class="brl-btn danger" id="brl-btn-clear">🗑 清空数据 (0)</button>
            </div>

            <!-- 打标区 -->
            <div class="brl-field-group" style="margin-top: 2px;">
              <div class="brl-label">当前步骤/事项标记</div>
              <input type="text" class="brl-input" id="brl-input-tag" placeholder="例如：创建记录、过滤查询..." />
            </div>

            <div class="brl-btn-row">
              <button class="brl-btn" id="brl-btn-action-tag">🏷 开始事项</button>
            </div>

            <!-- 当前事项状态条 -->
            <div class="brl-tag-status-bar" id="brl-tag-status" style="display: none;">
              <span>正在记录事项: <span id="brl-current-tag-text">创建记录</span></span>
            </div>

            <!-- 实时预览区 -->
            <div class="brl-field-group" style="margin-top: 2px;">
              <div class="brl-label">最近捕获请求与交互 (点击复制)</div>
              <div id="brl-preview-list">
                <div style="text-align: center; color: #666; padding: 12px; font-size: 11px; font-style: italic;">暂无符合条件的请求</div>
              </div>
            </div>

            <!-- 导出与复制双按钮行 -->
            <div class="brl-btn-row" style="margin-top: 2px;">
              <button class="brl-btn primary" id="brl-btn-export" style="padding: 9px 10px;">📥 导出 TXT</button>
              <button class="brl-btn" id="brl-btn-copy-all" style="padding: 9px 10px; background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.3); color: #93c5fd;">📋 复制全部</button>
            </div>
            
            <!-- 精美极简状态脚部 -->
            <div class="brl-footer" style="margin: 0 -12px -12px -12px; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span id="brl-status-dot" class="brl-indicator pulse"></span>
                <span id="brl-status-text" style="font-size: 11px; color: #aaa;">运行中</span>
              </div>
              <button id="brl-btn-go-settings" class="brl-icon-btn" title="配置中心">⚙️ 配置</button>
            </div>
          </div>

          <!-- [页面 2]: 高级设置视图 -->
          <div id="brl-view-settings">
            <!-- 返回按钮 -->
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <button class="brl-btn-back" id="brl-btn-back-to-main">
                <span>←</span> 返回主面板
              </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px; max-height: 380px; overflow-y: auto; padding-right: 4px;">
              
              <!-- 卡片 1: Headers 调试开关 & 配置 -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">Headers 调试过滤</span>
                  <label class="brl-switch">
                    <input type="checkbox" id="brl-cb-headers" ${state.includeHeaders ? 'checked' : ''} />
                    <span class="brl-slider"></span>
                  </label>
                </div>
                
                <!-- 卡片内部展开字段 -->
                <div id="brl-headers-sub-sec" style="${state.includeHeaders ? 'display: flex;' : 'display: none;'} flex-direction: column; gap: 8px; margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                  <div class="brl-field-group">
                    <div class="brl-label" style="color: #34d399;">仅保留 Headers (白名单)</div>
                    <input type="text" class="brl-input" id="brl-input-headers-keep" value="${state.headersKeepPattern}" placeholder="用英文逗号分隔，为空保留全部" />
                  </div>
                  <div class="brl-field-group">
                    <div class="brl-label" style="color: #f87171;">排除 Headers (黑名单)</div>
                    <input type="text" class="brl-input" id="brl-input-headers-exclude" value="${state.headersExcludePattern}" placeholder="用英文逗号分隔，如 cookie" />
                  </div>
                </div>
              </div>

              <!-- 卡片 2: 点击交互配置 -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">DOM 点击交互追踪</span>
                  <label class="brl-switch">
                    <input type="checkbox" id="brl-cb-clicks" ${state.includeClicks ? 'checked' : ''} />
                    <span class="brl-slider"></span>
                  </label>
                </div>

                <!-- 卡片内部展开多选框 -->
                <div id="brl-clicks-sub-sec" style="${state.includeClicks ? 'display: flex;' : 'display: none;'} flex-direction: column; gap: 10px; margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                  <label class="brl-custom-cb">
                    <input type="checkbox" id="brl-cb-click-url" ${state.clickIncludeUrl ? 'checked' : ''} />
                    <span class="brl-checkbox-box"></span>
                    <span style="color: #93c5fd; font-weight: 500;">交互时记录所处页面 URL</span>
                  </label>
                  <label class="brl-custom-cb">
                    <input type="checkbox" id="brl-cb-click-class" ${state.clickIncludeClass ? 'checked' : ''} />
                    <span class="brl-checkbox-box"></span>
                    <span style="color: #fbbf24; font-weight: 500;">交互时记录元素类名 (Class)</span>
                  </label>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
      
      <!-- Toast 提示 (容器级浮出) -->
      <div id="brl-toast">已复制该请求到剪贴板！</div>
    `;

    document.body.appendChild(panel);

    // 3. 获取 DOM 元素引用
    indicator = document.getElementById('brl-status-indicator');
    btnToggleListen = document.getElementById('brl-btn-toggle-listen');
    btnClear = document.getElementById('brl-btn-clear');
    btnExport = document.getElementById('brl-btn-export');
    btnCollapse = document.getElementById('brl-btn-collapse');
    inputFilter = document.getElementById('brl-input-filter');
    inputTag = document.getElementById('brl-input-tag');
    btnActionTag = document.getElementById('brl-btn-action-tag');
    tagStatusBar = document.getElementById('brl-tag-status');
    tagStatusText = document.getElementById('brl-current-tag-text');
    cbHeaders = document.getElementById('brl-cb-headers');
    cbClicks = document.getElementById('brl-cb-clicks');
    cbClickUrl = document.getElementById('brl-cb-click-url');
    cbClickClass = document.getElementById('brl-cb-click-class');
    statusText = document.getElementById('brl-status-text');
    statusDot = document.getElementById('brl-status-dot');
    miniCount = document.getElementById('brl-mini-count');
    header = document.getElementById('brl-panel-header');
    previewList = document.getElementById('brl-preview-list');
    
    const inputHeadersKeep = document.getElementById('brl-input-headers-keep');
    const inputHeadersExclude = document.getElementById('brl-input-headers-exclude');
    
    const btnGoSettings = document.getElementById('brl-btn-go-settings');
    const btnBackToMain = document.getElementById('brl-btn-back-to-main');
    const btnCopyAll = document.getElementById('brl-btn-copy-all');
    const sliderWrapper = document.getElementById('brl-slider-wrapper');
    const headersSubSec = document.getElementById('brl-headers-sub-sec');
    const clicksSubSec = document.getElementById('brl-clicks-sub-sec');

    // 4. 绑定事件与分屏滑动交互逻辑

    panel.addEventListener('click', (e) => {
      if (state.isCollapsed) {
        setCollapsed(false);
        e.stopPropagation();
      }
    });

    btnCollapse.addEventListener('click', (e) => {
      setCollapsed(true);
      e.stopPropagation();
    });

    const btnClose = document.getElementById('brl-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.remove();
      });
    }

    // 页面滑动切换
    btnGoSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      sliderWrapper.style.transform = 'translateX(-340px)';
    });

    btnBackToMain.addEventListener('click', (e) => {
      e.stopPropagation();
      sliderWrapper.style.transform = 'translateX(0)';
    });

    // 开始/暂停监听
    btnToggleListen.addEventListener('click', () => {
      state.isListening = !state.isListening;
      if (state.isListening) {
        btnToggleListen.textContent = '⏸ 暂停监听';
        indicator.className = 'brl-indicator pulse';
        statusDot.className = 'brl-indicator pulse';
        statusText.textContent = '运行中';
      } else {
        btnToggleListen.textContent = '▶ 开始监听';
        indicator.className = 'brl-indicator paused';
        statusDot.className = 'brl-indicator paused';
        statusText.textContent = '已暂停';
      }
    });

    // 清空数据
    btnClear.addEventListener('click', () => {
      state.logs = [];
      updateUIListCount();
    });

    // 过滤输入框变更
    inputFilter.addEventListener('input', () => {
      state.filterPattern = inputFilter.value.trim();
      localStorage.setItem('__trl_filter', state.filterPattern);
    });

    // 包含 headers 选项变更及子卡片伸缩
    cbHeaders.addEventListener('change', () => {
      state.includeHeaders = cbHeaders.checked;
      localStorage.setItem('__trl_headers', state.includeHeaders ? 'true' : 'false');
      headersSubSec.style.display = state.includeHeaders ? 'flex' : 'none';
    });

    // 包含 DOM 点击交互选项变更及子卡片伸缩
    cbClicks.addEventListener('change', () => {
      state.includeClicks = cbClicks.checked;
      localStorage.setItem('__trl_clicks', state.includeClicks ? 'true' : 'false');
      clicksSubSec.style.display = state.includeClicks ? 'flex' : 'none';
    });

    // 绑定点击详情 URL 携带事件
    cbClickUrl.addEventListener('change', () => {
      state.clickIncludeUrl = cbClickUrl.checked;
      localStorage.setItem('__trl_click_url', state.clickIncludeUrl ? 'true' : 'false');
    });

    // 绑定点击详情类名携带事件
    cbClickClass.addEventListener('change', () => {
      state.clickIncludeClass = cbClickClass.checked;
      localStorage.setItem('__trl_click_class', state.clickIncludeClass ? 'true' : 'false');
    });

    inputHeadersKeep.addEventListener('input', () => {
      state.headersKeepPattern = inputHeadersKeep.value.trim();
      localStorage.setItem('__trl_headers_keep', state.headersKeepPattern);
    });

    inputHeadersExclude.addEventListener('input', () => {
      state.headersExcludePattern = inputHeadersExclude.value.trim();
      localStorage.setItem('__trl_headers_exclude', state.headersExcludePattern);
    });

    // 事项打标操作
    btnActionTag.addEventListener('click', () => {
      if (!state.isTagActive) {
        // 开启事项
        const tagName = inputTag.value.trim();
        if (!tagName) {
          alert('请输入事项标记名称！');
          return;
        }
        state.currentTag = tagName;
        state.isTagActive = true;

        // 插入标记日志
        const markerLog = {
          type: 'marker',
          action: 'start',
          text: tagName,
          timestamp: Date.now()
        };
        state.logs.push(markerLog);

        // UI 更新
        btnActionTag.textContent = `⏹ 结束事项 [${tagName}]`;
        btnActionTag.classList.add('active-tag');
        tagStatusText.textContent = tagName;
        tagStatusBar.style.display = 'flex';
        inputTag.disabled = true;
      } else {
        // 结束事项
        const tagName = state.currentTag;
        
        // 插入标记日志
        const markerLog = {
          type: 'marker',
          action: 'end',
          text: tagName,
          timestamp: Date.now()
        };
        state.logs.push(markerLog);

        // UI 状态重置
        state.isTagActive = false;
        state.currentTag = '';
        
        btnActionTag.textContent = `🏷 开始事项`;
        btnActionTag.classList.remove('active-tag');
        tagStatusBar.style.display = 'none';
        inputTag.disabled = false;
        inputTag.value = '';
      }
    });

    // 导出文本为 TXT
    btnExport.addEventListener('click', () => {
      if (state.logs.length === 0) {
        alert('当前没有捕获到任何记录，无法导出！');
        return;
      }

      const txt = generateLogReport();
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      // 生成安全文件名
      let safeFileName = 'tagged-requests';
      if (state.logs.some(l => l.type === 'marker')) {
        const firstMarker = state.logs.find(l => l.type === 'marker' && l.action === 'start');
        if (firstMarker) {
          safeFileName += `-${firstMarker.text}`;
        }
      }
      const d = new Date();
      const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
      safeFileName += `-${dateStr}.txt`;

      const a = document.createElement('a');
      a.href = url;
      a.download = safeFileName;
      document.body.appendChild(a);
      a.click();
      
      // 延时清理
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    });

    // 一键复制全部日志至剪贴板
    btnCopyAll.addEventListener('click', () => {
      if (state.logs.length === 0) {
        alert('当前没有捕获到任何记录，无法复制！');
        return;
      }

      const txt = generateLogReport();
      navigator.clipboard.writeText(txt).then(() => {
        showToast('已复制完整日志到剪贴板！');
      }).catch(err => {
        console.error('复制失败:', err);
        showToast('复制失败，请重试');
      });
    });

    // 拖拽面板支持
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let panelLeft = 0;
    let panelTop = 0;

    function onMouseDown(e) {
      if (e.target.closest('.brl-icon-btn') || e.target.closest('.brl-btn-back') || e.target.closest('.brl-switch')) return; // 点击交互按钮不拖拽
      isDragging = true;
      
      const rect = panel.getBoundingClientRect();
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;

      startX = e.clientX;
      startY = e.clientY;
      panelLeft = rect.left;
      panelTop = rect.top;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = panelLeft + dx;
      let newTop = panelTop + dy;

      // 边界限制
      const maxLeft = window.innerWidth - panel.offsetWidth - 5;
      const maxTop = window.innerHeight - panel.offsetHeight - 5;

      newLeft = Math.max(5, Math.min(newLeft, maxLeft));
      newTop = Math.max(5, Math.min(newTop, maxTop));

      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    header.addEventListener('mousedown', onMouseDown);

    // 双击折叠状态悬浮球允许拖动
    panel.addEventListener('mousedown', (e) => {
      if (state.isCollapsed) {
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        
        startX = e.clientX;
        startY = e.clientY;
        panelLeft = rect.left;
        panelTop = rect.top;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    });

    // 初始化已记录的数据统计
    updateUIListCount();
  }

  // 双重保障，确保在 DOM 准备就绪后进行 UI 挂载和事件绑定
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  console.log('[RequestLogger] Tagged Request Logger 注入成功！');
})();
