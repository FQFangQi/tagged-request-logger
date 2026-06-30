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
    // 2. 局域网开发 IP (192.168.x.x, 10.x.x.x, 172.16.x.x ~ 172.31.x.x)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) return true;
    // 3. 地址栏参数强制启用 (任意页面后加 ?__enable_logger=true 即可激活)
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
    includeErrors: true,     // 是否记录页面报错 (默认开启)
    includeConsole: true,    // 是否记录控制台等级日志 (默认开启)
    consoleLevels: {         // 默认只监听报错与警告
      error: true,
      warn: true,
      info: false,
      log: false
    },
    language: 'en',          // 默认英文
    showPanel: true,         // 是否显示面板
    isCollapsed: false       // 面板是否折叠
  };

  // --- 2. 国际化翻译字典 ---
  const i18n = {
    en: {
      filterLabel: 'Filter URL Pattern',
      filterPlaceholder: 'e.g. /api/v1 or Regex like /api/v1/',
      btnPauseListen: '⏸ Pause Listening',
      btnStartListen: '▶ Start Listening',
      btnClearData: '🗑 Clear Data',
      inputTagPlaceholder: 'e.g. create-record, filter-query...',
      btnStartTag: '⏺ Start Tag',
      btnEndTag: '⏹ End Tag',
      tagStatusBarText: 'Recording Tag:',
      noMatchingLogs: 'No matching records found',
      btnExportTxt: '📥 Export TXT',
      btnCopyAll: '📋 Copy All',
      statusRunning: 'Running',
      statusPaused: 'Paused',
      settingsTitle: 'Settings',
      backToMain: '← Back to Main Panel',
      headersTitle: 'Headers Debug Filter',
      keepHeadersLabel: 'Keep Headers (Whitelist)',
      keepHeadersPlaceholder: 'Comma separated, empty keeps all',
      excludeHeadersLabel: 'Exclude Headers (Blacklist)',
      excludeHeadersPlaceholder: 'Comma separated, e.g. cookie',
      clicksTitle: 'DOM Click Tracking',
      clicksUrlLabel: 'Record URL during interactions',
      clicksClassLabel: 'Record Class name during interactions',
      errorsTitle: 'Errors & Console Tracking',
      errorsLabel: 'Record unhandled page errors',
      consoleLabel: 'Record console logs',
      languageTitle: 'Language / 语言设置',
      languageLabel: 'Select Language / 选择语言',
      toastCopied: 'Copied details to clipboard!',
      toastCopiedAll: 'Copied all logs to clipboard!',
      toastCopiedRequest: 'Copied request to clipboard!',
      alertNoLogs: 'No records to copy or export!',
      alertTagEmpty: 'Please enter a tag name!',
      // 单个复制的报告文案
      clickDetailTitle: 'Interaction: Click Element (CLICK)',
      clickDetailUrl: 'Page URL',
      clickDetailTag: 'Tag',
      clickDetailText: 'Visible Text',
      clickDetailId: 'Element ID',
      clickDetailClass: 'Class Name',
      clickDetailSelector: 'Unique CSS Selector Path',
      clickDetailTime: 'Time',
      errDetailTitle: 'Exception',
      errDetailMsg: 'Error Message',
      errDetailFile: 'File',
      errDetailLineCol: 'Line/Col',
      errDetailStack: 'Stack Trace',
      consoleDetailSrc: 'Console Output',
      consoleDetailContent: 'Content',
      reqDetailTitle: 'HTTP Request',
      reqDetailMethod: 'Method',
      reqDetailStatus: 'Status Code',
      reqDetailDuration: 'Duration',
      reqDetailReqHeaders: 'Request Headers',
      reqDetailResHeaders: 'Response Headers',
      reqDetailPayload: 'Request Payload',
      reqDetailResponse: 'Response',
      // 全局报告文案
      reportTitle: 'Tagged Request Logger - Export Report',
      reportTime: 'Time',
      reportUrl: 'Page URL',
      reportFilter: 'Filter Pattern',
      reportHeaders: 'Include Headers',
      reportClicks: 'Include Clicks',
      reportMarkerStart: '--- Tag Started',
      reportMarkerEnd: '--- Tag Ended',
      reportRequest: 'Request',
      reportClick: 'Click',
      reportError: 'Error',
      reportConsole: 'Console',
      githubBtn: '🐱 Visit GitHub Repository',
      howToUseTitle: '💡 How to Use (Workflow)',
      step1Title: '1. Set Tag',
      step1Desc: 'Enter a task name and click "Start Tag" to begin recording.',
      step2Title: '2. Perform Actions',
      step2Desc: 'Interact with your page (clicks, requests, logs will be tracked).',
      step3Title: '3. Copy / Export',
      step3Desc: 'Click "Copy All" or "Export TXT" to get the sequential logs.',
      step4Title: '4. Feed to AI',
      step4Desc: 'Paste logs directly into Cursor/ChatGPT for instant debugging.',
      versionTitle: '🚀 Version & Update',
      currentVersionLabel: 'Current Version',
      btnCheckUpdate: '🔄 Check Update',
      updateChecking: 'Checking...',
      updateLatest: 'You are up to date! 💚',
      updateAvailable: 'New version available! 🔴',
      updateErr: 'CSP blocked raw fetch. Click to check manual update.',
      btnGetLatestZip: '📥 Download Latest ZIP'
    },
    zh: {
      filterLabel: '过滤 URL 匹配规则',
      filterPlaceholder: '例如：/typekey/api/v1 或 正则如 /api/v1/',
      btnPauseListen: '⏸ 暂停监听',
      btnStartListen: '▶ 开始监听',
      btnClearData: '🗑 清空数据',
      inputTagPlaceholder: '例如：创建记录、过滤查询...',
      btnStartTag: '⏺ 开始事项',
      btnEndTag: '⏹ 结束事项',
      tagStatusBarText: '正在记录事项:',
      noMatchingLogs: '暂无符合条件的请求',
      btnExportTxt: '📥 导出 TXT',
      btnCopyAll: '📋 复制全部',
      statusRunning: '运行中',
      statusPaused: '已暂停',
      settingsTitle: '配置',
      backToMain: '← 返回主面板',
      headersTitle: 'Headers 调试过滤',
      keepHeadersLabel: '仅保留 Headers (白名单)',
      keepHeadersPlaceholder: '用英文逗号分隔，为空保留全部',
      excludeHeadersLabel: '排除 Headers (黑名单)',
      excludeHeadersPlaceholder: '用英文逗号分隔，如 cookie',
      clicksTitle: 'DOM 点击交互追踪',
      clicksUrlLabel: '交互时记录所处页面 URL',
      clicksClassLabel: '交互时记录元素类名 (Class)',
      errorsTitle: '异常与控制台追踪',
      errorsLabel: '记录未捕获页面报错',
      consoleLabel: '记录控制台等级日志',
      languageTitle: 'Language / 语言设置',
      languageLabel: 'Select Language / 选择语言',
      toastCopied: '已复制详情到剪贴板！',
      toastCopiedAll: '已复制完整日志到剪贴板！',
      toastCopiedRequest: '已复制该请求到剪贴板！',
      alertNoLogs: '当前没有捕获到任何记录，无法导出！',
      alertTagEmpty: '请输入事项标记名称！',
      // 单个复制的报告文案
      clickDetailTitle: '交互事件: 点击页面元素 (CLICK)',
      clickDetailUrl: '页面地址',
      clickDetailTag: '所属事项',
      clickDetailText: '显示文字',
      clickDetailId: '元素 ID',
      clickDetailClass: '元素类名',
      clickDetailSelector: '唯一 DOM 路径 (CSS Selector)',
      clickDetailTime: '时间',
      errDetailTitle: '异常类型',
      errDetailMsg: '错误内容',
      errDetailFile: '发生文件',
      errDetailLineCol: '行列信息',
      errDetailStack: '堆栈轨迹 (Stack Trace)',
      consoleDetailSrc: '日志来源',
      consoleDetailContent: '日志内容',
      reqDetailTitle: '网络请求',
      reqDetailMethod: '请求方式',
      reqDetailStatus: '状态码',
      reqDetailDuration: '耗时',
      reqDetailReqHeaders: '请求 Headers',
      reqDetailResHeaders: '响应 Headers',
      reqDetailPayload: '请求 Payload',
      reqDetailResponse: '响应 Response',
      // 全局报告文案
      reportTitle: 'Tagged Request Logger - 导出报告',
      reportTime: '时间',
      reportUrl: '页面URL',
      reportFilter: '过滤规则',
      reportHeaders: '包含Headers',
      reportClicks: '包含DOM交互',
      reportMarkerStart: '--- 事项开始',
      reportMarkerEnd: '--- 事项结束',
      reportRequest: '请求',
      reportClick: '交互',
      reportError: '报错',
      reportConsole: '控制台',
      githubBtn: '🐱 访问 GitHub 项目仓库',
      howToUseTitle: '💡 快速使用指南 (工作流)',
      step1Title: '1. 打标启动',
      step1Desc: '输入任务/步骤名称，点击“开始事项”以启动会话录制。',
      step2Title: '2. 网页操作',
      step2Desc: '在网页上进行常规操作，交互、请求和报错将被顺序记录。',
      step3Title: '3. 复制导出',
      step3Desc: '点击“复制全部”或“导出 TXT”获取完整的高保真日志。',
      step4Title: '4. 投喂给 AI',
      step4Desc: '将日志粘贴进 Cursor/ChatGPT 中，AI 会快速精准解决 Bug。',
      versionTitle: '🚀 版本与同步更新',
      currentVersionLabel: '当前版本',
      btnCheckUpdate: '🔄 检查新版本',
      updateChecking: '检查中...',
      updateLatest: '已是最新版本！💚',
      updateAvailable: '发现新版本！🔴',
      updateErr: '因网络或安全策略限制，请前往仓库手动下载最新包。',
      btnGetLatestZip: '📥 立即下载最新 Zip 压缩包'
    }
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
    
    const savedIncludeErrors = localStorage.getItem('__trl_errors');
    if (savedIncludeErrors !== null) state.includeErrors = savedIncludeErrors === 'true';
    const savedIncludeConsole = localStorage.getItem('__trl_console');
    if (savedIncludeConsole !== null) state.includeConsole = savedIncludeConsole === 'true';
    const savedConsoleLevels = localStorage.getItem('__trl_console_levels');
    if (savedConsoleLevels !== null) {
      try {
        state.consoleLevels = JSON.parse(savedConsoleLevels);
      } catch (e) {}
    }
    const savedLanguage = localStorage.getItem('__trl_lang');
    if (savedLanguage !== null) state.language = savedLanguage;
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
    const t = i18n[state.language];
    let txt = `============================================================\n`;
    txt += `${t.reportTitle}\n`;
    txt += `${t.reportTime}: ${getFormattedTime()}\n`;
    txt += `${t.reportUrl}: ${window.location.href}\n`;
    txt += `${t.reportFilter}: ${state.filterPattern || '(None)'}\n`;
    txt += `${t.reportHeaders}: ${state.includeHeaders ? 'Yes' : 'No'}\n`;
    txt += `${t.reportClicks}: ${state.includeClicks ? 'Yes' : 'No'}\n`;
    txt += `============================================================\n\n`;

    state.logs.forEach((log, index) => {
      if (log.type === 'marker') {
        const timeStr = getFormattedTime(log.timestamp);
        if (log.action === 'start') {
          txt += `\n${t.reportMarkerStart}: [${log.text}] (${timeStr}) ---\n\n`;
        } else {
          txt += `\n${t.reportMarkerEnd}: [${log.text}] (${timeStr}) ---\n\n`;
        }
      } else if (log.type === 'click') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportClick} ${index + 1}] [${state.language === 'zh' ? '鼠标点击' : 'Mouse Click'}]  ${timeStr}\n`;
        if (log.url) txt += `${t.clickDetailUrl}: ${log.url}\n`;
        txt += `${state.language === 'zh' ? '标签' : 'Tag Name'}: ${log.tagName}\n`;
        txt += `${t.clickDetailText}: ${log.innerText ? `"${log.innerText}"` : '(None)'}\n`;
        if (log.id) txt += `${t.clickDetailId}: ${log.id}\n`;
        if (log.className) txt += `${t.clickDetailClass}: ${log.className}\n`;
        txt += `${t.clickDetailSelector}: ${log.selector}\n`;
        if (log.tag) txt += `${t.clickDetailTag}: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'error') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportError} ${index + 1}] [JavaScript Error]  ${timeStr}\n`;
        txt += `${t.errDetailMsg}: ${log.message}\n`;
        txt += `${t.errDetailFile}: ${log.filename} (Line ${log.lineno}, Col ${log.colno})\n`;
        if (log.stack) {
          txt += `${t.errDetailStack}:\n${log.stack}\n`;
        }
        if (log.tag) txt += `${state.language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'promise-error') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportError} ${index + 1}] [Promise Rejection]  ${timeStr}\n`;
        txt += `${t.errDetailMsg}: ${log.message}\n`;
        if (log.stack) {
          txt += `${t.errDetailStack}:\n${log.stack}\n`;
        }
        if (log.tag) txt += `${state.language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'console') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportConsole} ${index + 1}] [Console ${log.level.toUpperCase()}]  ${timeStr}\n`;
        txt += `${t.consoleDetailContent}: ${log.message}\n`;
        if (log.tag) txt += `${state.language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'request') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportRequest} ${index + 1}] [${log.tech}]  ${timeStr}\n`;
        txt += `${t.reqDetailMethod}: ${log.method}\n`;
        txt += `URL: ${log.url}\n`;
        txt += `${t.reqDetailStatus}: ${log.status}\n`;
        txt += `${t.reqDetailDuration}: ${log.durationMs !== null ? log.durationMs + 'ms' : 'Reading...'}\n`;
        if (log.tag) {
          txt += `${state.language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        }

        if (state.includeHeaders) {
          txt += `\n${t.reqDetailReqHeaders}:\n`;
          const filteredReq = filterHeaders(log.reqHeaders);
          txt += filteredReq && Object.keys(filteredReq).length ? JSON.stringify(filteredReq, null, 2) : '(None)';
          txt += `\n\n${t.reqDetailResHeaders}:\n`;
          const filteredRes = filterHeaders(log.resHeaders);
          txt += filteredRes && Object.keys(filteredRes).length ? JSON.stringify(filteredRes, null, 2) : '(None)';
          txt += `\n`;
        }

        txt += `\n${t.reqDetailPayload}:\n`;
        txt += tryFormatJson(log.reqBody) || '(None)';
        txt += `\n\n${t.reqDetailResponse}:\n`;
        txt += tryFormatJson(log.resBody) || '(None)';
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
    
    // 向上回溯判断是否点击了我们插件面板内的任何元素（防范 detached DOM 或是 Text 节点等特殊边缘情况）
    let cur = e.target;
    let isPanelClick = false;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (
        cur.id === 'brl-panel-container' || 
        cur.id === 'brl-toast' || 
        (cur.className && typeof cur.className === 'string' && cur.className.includes('brl-'))
      ) {
        isPanelClick = true;
        break;
      }
      cur = cur.parentNode;
    }
    if (isPanelClick) {
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

  // --- 6. 监听全局 JS 运行时错误和 Promise Rejection 异常 ---
  window.addEventListener('error', function (event) {
    if (!state.isListening || !state.includeErrors) return;
    // 排除资源加载错误（如图片/脚本加载失败，它们没有 event.error）
    if (!event.error) return;

    addLog({
      type: 'error',
      timestamp: Date.now(),
      message: event.message || String(event.error),
      filename: event.filename || '',
      lineno: event.lineno || 0,
      colno: event.colno || 0,
      stack: event.error.stack || '',
      tag: state.isTagActive ? state.currentTag : null
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    if (!state.isListening || !state.includeErrors) return;

    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : '';

    addLog({
      type: 'promise-error',
      timestamp: Date.now(),
      message: `Unhandled Promise Rejection: ${message}`,
      stack: stack,
      tag: state.isTagActive ? state.currentTag : null
    });
  });

  // --- 7. 拦截控制台等级日志 (Console Override) ---
  const originalConsole = {
    log: window.console.log,
    info: window.console.info,
    warn: window.console.warn,
    error: window.console.error
  };

  ['log', 'info', 'warn', 'error'].forEach(level => {
    window.console[level] = function (...args) {
      // 保持原生的 console 输出不受影响
      if (originalConsole[level]) {
        originalConsole[level].apply(window.console, args);
      }

      if (!state.isListening || !state.includeConsole) return;
      if (!state.consoleLevels[level]) return;

      // 参数序列化和脱敏（敏感词过滤，例如 token, password 等，转换成 ***）
      const formattedArgs = args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object') {
          try {
            const str = JSON.stringify(arg, (key, value) => {
              if (key && typeof key === 'string') {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('token') || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('auth')) {
                  return '******';
                }
              }
              return value;
            });
            return str;
          } catch (e) {
            return '[Object]';
          }
        }
        
        let strVal = String(arg);
        const sensitiveRegex = /(token|password|secret|authorization|auth)=[^&?\s]+/ig;
        strVal = strVal.replace(sensitiveRegex, '$1=******');
        return strVal;
      }).join(' ');

      addLog({
        type: 'console',
        level: level,
        timestamp: Date.now(),
        message: formattedArgs.slice(0, 1500), // 限制长度，防止日志超大
        tag: state.isTagActive ? state.currentTag : null
      });
    };
  });

  // --- 8. 交互面板 UI 构建 ---
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
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
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
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
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

    /* 设置页面的精美卡片布局 (玻璃拟态 Glassmorphism) */
    .brl-settings-card {
      background: rgba(30, 41, 59, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(10px);
      transition: border-color 0.25s, box-shadow 0.25s;
    }

    .brl-settings-card:hover {
      border-color: rgba(255, 255, 255, 0.15);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    }

    /* GitHub 按钮样式 */
    .brl-github-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 9px;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #24292e, #1a1e22);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    }

    .brl-github-btn:hover {
      background: linear-gradient(135deg, #2f363d, #24292e);
      border-color: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
      box-shadow: 0 0 12px rgba(255, 255, 255, 0.15);
    }

    .brl-github-btn:active {
      transform: translateY(1px);
    }

    /* 垂直步骤时间轴样式 */
    .brl-timeline {
      position: relative;
      padding-left: 20px;
      margin: 8px 0 4px 10px;
      border-left: 2px dashed rgba(255, 255, 255, 0.12);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .brl-timeline-item {
      position: relative;
      text-align: left;
    }

    .brl-timeline-dot {
      position: absolute;
      left: -27px;
      top: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981, #059669);
      border: 2px solid #1e293b;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: #fff;
      font-weight: bold;
    }

    .brl-timeline-title {
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 2px;
    }

    .brl-timeline-desc {
      font-size: 10px;
      color: #aaa;
      line-height: 1.3;
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
      position: relative;
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
      overflow: hidden;
    }
    
    .brl-log-row:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    /* 悬浮操作区容器 */
    .brl-log-actions {
      display: none;
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(20, 20, 20, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      padding: 2px 4px;
      align-items: center;
      gap: 4px;
      box-shadow: -2px 0 8px rgba(0,0,0,0.5);
      z-index: 5;
    }

    .brl-log-row:hover .brl-log-actions {
      display: flex;
    }

    .brl-action-icon {
      font-size: 10px;
      padding: 2px;
      cursor: pointer;
      border-radius: 3px;
      transition: background 0.15s, transform 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brl-action-icon:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: scale(1.1);
    }

    .brl-action-icon.delete-btn:hover {
      background: rgba(239, 68, 68, 0.25);
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
  let panel, indicator, btnToggleListen, btnClear, btnExport, btnCollapse, inputFilter, inputTag, btnActionTag, tagStatusBar, tagStatusText, cbHeaders, cbClicks, cbClickUrl, cbClickClass, cbErrors, cbConsole, cbConsoleLog, cbConsoleInfo, cbConsoleWarn, cbConsoleError, statusText, statusDot, miniCount, header, previewList;

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
    const t = i18n[state.language];
    // 计数：网络请求、报错以及控制台日志的总和
    const totalCount = state.logs.filter(l => l.type === 'request' || l.type === 'error' || l.type === 'promise-error' || l.type === 'console').length;
    btnClear.textContent = `${t.btnClearData} (${totalCount})`;
    miniCount.textContent = totalCount;

    // 悬浮操作辅助函数
    function addHoverActions(row, originalIndex, getDetailContent) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'brl-log-actions';
      
      const copyBtn = document.createElement('div');
      copyBtn.className = 'brl-action-icon';
      copyBtn.title = state.language === 'zh' ? '复制详情' : 'Copy Details';
      copyBtn.innerHTML = '📋';
      
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'brl-action-icon delete-btn';
      deleteBtn.title = state.language === 'zh' ? '删除此条记录' : 'Delete Log';
      deleteBtn.innerHTML = '🗑️';
      
      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(deleteBtn);
      row.appendChild(actionsDiv);

      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const detail = getDetailContent();
        navigator.clipboard.writeText(detail).then(() => {
          showToast(t.toastCopied);
        }).catch(err => {
          console.error('Copy failed:', err);
          showToast(state.language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
        });
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.logs.splice(originalIndex, 1);
        updateUIListCount();
      });
    }

    // 重新渲染最近的 6 条日志（包括打标、网络请求、DOM 点击、报错和控制台日志）
    if (previewList) {
      // 记录在 state.logs 中的原始索引并取最近 6 条
      const displayLogs = state.logs
        .map((log, index) => ({ log, index }))
        .slice(-6);

      if (displayLogs.length === 0) {
        previewList.innerHTML = `<div style="text-align: center; color: #666; padding: 12px; font-size: 11px; font-style: italic;">${t.noMatchingLogs}</div>`;
        return;
      }

      previewList.innerHTML = '';
      displayLogs.forEach(({ log, index: originalIndex }) => {
        const row = document.createElement('div');
        row.className = 'brl-log-row';

        if (log.type === 'marker') {
          row.classList.add('status-marker');
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          row.innerHTML = `<div style="flex: 1; text-align: center; font-size: 10px;">${log.action === 'start' ? '▶' : '⏹'} ${state.language === 'zh' ? '事项' : 'Tag'}: ${log.text} (${timeStr})</div>`;
        } else if (log.type === 'click') {
          row.classList.add('status-click');
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          let elementDesc = log.tagName.toLowerCase();
          if (log.id) elementDesc += `#${log.id}`;
          const textExcerpt = log.innerText ? ` "${log.innerText.slice(0, 14)}"` : '';

          row.innerHTML = `
            <div style="flex: 1; text-align: left; font-size: 11px; display: flex; align-items: center; gap: 6px; padding-right: 46px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span>🖱️</span>
              <span style="font-weight: bold; color: #10b981; font-family: monospace; background: rgba(16, 185, 129, 0.15); padding: 1px 3px; border-radius: 3px; font-size: 9px; flex-shrink: 0;">CLICK</span>
              <span style="color: #ccc; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${elementDesc}${textExcerpt}</span>
            </div>
            <span style="font-size: 10px; color: #666; font-family: monospace; flex-shrink: 0;">${timeStr}</span>
          `;

          // 点击单条点击记录复制元素详情
          const getClickDetail = () => {
            let detail = `=========================================\n`;
            detail += `${t.clickDetailTitle}\n`;
            if (log.url) detail += `${t.clickDetailUrl}: ${log.url}\n`;
            detail += `${state.language === 'zh' ? '元素标签' : 'Tag Name'}: ${log.tagName}\n`;
            detail += `${t.clickDetailText}: ${log.innerText ? `"${log.innerText}"` : '(None)'}\n`;
            if (log.id) detail += `${t.clickDetailId}: ${log.id}\n`;
            if (log.className) detail += `${t.clickDetailClass}: ${log.className}\n`;
            detail += `${t.clickDetailSelector}:\n${log.selector}\n`;
            detail += `${t.clickDetailTime}: ${getFormattedTime(log.timestamp)}\n`;
            if (log.tag) detail += `${t.clickDetailTag}: ${log.tag}\n`;
            detail += `=========================================\n`;
            return detail;
          };

          row.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(getClickDetail()).then(() => {
              showToast(t.toastCopied);
            }).catch(err => {
              console.error('Copy failed:', err);
              showToast(state.language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
            });
          });

          addHoverActions(row, originalIndex, getClickDetail);
        } else if (log.type === 'error' || log.type === 'promise-error') {
          row.classList.add('status-err');
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          const errType = log.type === 'error' ? 'JS ERROR' : 'PROMISE ERR';
          const shortMsg = log.message.length > 25 ? log.message.slice(0, 22) + '...' : log.message;

          row.innerHTML = `
            <div style="flex: 1; text-align: left; font-size: 11px; display: flex; align-items: center; gap: 6px; padding-right: 46px; overflow: hidden;">
              <span>🚫</span>
              <span style="font-weight: bold; color: #ef4444; font-family: monospace; background: rgba(239, 68, 68, 0.15); padding: 1px 3px; border-radius: 3px; font-size: 9px; flex-shrink: 0;">${errType}</span>
              <span style="color: #fca5a5; font-family: monospace; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${log.message}">${shortMsg}</span>
            </div>
            <span style="font-size: 10px; color: #888; font-family: monospace; margin-left: 4px; flex-shrink: 0;">${timeStr}</span>
          `;

          const getErrorDetail = () => {
            let detail = `=========================================\n`;
            detail += `${t.errDetailTitle}: ${log.type === 'error' ? (state.language === 'zh' ? 'JavaScript 运行时错误' : 'JavaScript Runtime Error') : (state.language === 'zh' ? '未捕获 Promise 异常' : 'Unhandled Promise Rejection')}\n`;
            detail += `${t.errDetailMsg}: ${log.message}\n`;
            if (log.type === 'error') {
              detail += `${t.errDetailFile}: ${log.filename}\n`;
              detail += `${state.language === 'zh' ? '行列信息' : 'Line/Col'}: ${state.language === 'zh' ? '行 ' : 'Line '}${log.lineno}, ${state.language === 'zh' ? '列 ' : 'Col '}${log.colno}\n`;
            }
            if (log.stack) {
              detail += `\n${t.errDetailStack}:\n${log.stack}\n`;
            }
            detail += `${t.clickDetailTime}: ${getFormattedTime(log.timestamp)}\n`;
            if (log.tag) detail += `${t.clickDetailTag}: ${log.tag}\n`;
            detail += `=========================================\n`;
            return detail;
          };

          row.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(getErrorDetail()).then(() => {
              showToast(t.toastCopied);
            }).catch(err => {
              console.error('Copy failed:', err);
              showToast(state.language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
            });
          });

          addHoverActions(row, originalIndex, getErrorDetail);
        } else if (log.type === 'console') {
          let levelColor = '#ccc';
          let levelBg = 'rgba(255, 255, 255, 0.1)';
          let icon = '💬';
          if (log.level === 'error') {
            row.classList.add('status-err');
            levelColor = '#ef4444';
            levelBg = 'rgba(239, 68, 68, 0.15)';
            icon = '🔴';
          } else if (log.level === 'warn') {
            row.classList.add('status-warn');
            levelColor = '#fbbf24';
            levelBg = 'rgba(245, 158, 11, 0.15)';
            icon = '🟡';
          } else if (log.level === 'info') {
            levelColor = '#60a5fa';
            levelBg = 'rgba(59, 130, 246, 0.15)';
            icon = '🔵';
          }

          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          const shortMsg = log.message.length > 25 ? log.message.slice(0, 22) + '...' : log.message;

          row.innerHTML = `
            <div style="flex: 1; text-align: left; font-size: 11px; display: flex; align-items: center; gap: 6px; padding-right: 46px; overflow: hidden;">
              <span>${icon}</span>
              <span style="font-weight: bold; color: ${levelColor}; font-family: monospace; background: ${levelBg}; padding: 1px 3px; border-radius: 3px; font-size: 9px; flex-shrink: 0;">${log.level.toUpperCase()}</span>
              <span style="color: #ccc; font-family: monospace; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${log.message}">${shortMsg}</span>
            </div>
            <span style="font-size: 10px; color: #888; font-family: monospace; margin-left: 4px; flex-shrink: 0;">${timeStr}</span>
          `;

          const getConsoleDetail = () => {
            let detail = `=========================================\n`;
            detail += `${t.consoleDetailSrc}: ${state.language === 'zh' ? '控制台输出' : 'Console Output'} (Console.${log.level})\n`;
            detail += `${t.consoleDetailContent}: ${log.message}\n`;
            detail += `${state.language === 'zh' ? '时间' : 'Time'}: ${getFormattedTime(log.timestamp)}\n`;
            if (log.tag) detail += `${state.language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
            detail += `=========================================\n`;
            return detail;
          };

          row.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(getConsoleDetail()).then(() => {
              showToast(t.toastCopied);
            }).catch(err => {
              console.error('Copy failed:', err);
              showToast(state.language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
            });
          });

          addHoverActions(row, originalIndex, getConsoleDetail);
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

          const durationText = log.durationMs !== null ? `${log.durationMs}ms` : 'Reading...';
          const methodClass = `brl-method-${log.method.toLowerCase()}`;

          row.innerHTML = `
            <span class="brl-log-method ${methodClass}">${log.method}</span>
            <span class="brl-log-path" title="${log.url}" style="padding-right: 46px;">${displayPath}</span>
            <div class="brl-log-meta">
              <span style="font-weight: bold; color: ${isErr ? '#f87171' : '#10b981'}">${log.status}</span>
              <span class="brl-log-duration">${durationText}</span>
            </div>
          `;

          const getRequestDetail = () => {
            let detail = `=========================================\n`;
            detail += `${t.reqDetailMethod}: ${log.method}\n`;
            detail += `URL: ${log.url}\n`;
            detail += `${t.reqDetailStatus}: ${log.status}\n`;
            detail += `${t.reqDetailDuration}: ${log.durationMs !== null ? log.durationMs + 'ms' : 'Unknown'}\n`;
            detail += `${state.language === 'zh' ? '时间' : 'Time'}: ${getFormattedTime(log.timestamp)}\n`;
            if (log.tag) detail += `${state.language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
            
            if (state.includeHeaders) {
              detail += `\n${t.reqDetailReqHeaders}:\n`;
              const filteredReq = filterHeaders(log.reqHeaders);
              detail += filteredReq && Object.keys(filteredReq).length ? JSON.stringify(filteredReq, null, 2) : '(None)';
              detail += `\n\n${t.reqDetailResHeaders}:\n`;
              const filteredRes = filterHeaders(log.resHeaders);
              detail += filteredRes && Object.keys(filteredRes).length ? JSON.stringify(filteredRes, null, 2) : '(None)';
              detail += `\n`;
            }

            detail += `\n${t.reqDetailPayload}:\n`;
            detail += tryFormatJson(log.reqBody) || '(None)';
            detail += `\n\n${t.reqDetailResponse}:\n`;
            detail += tryFormatJson(log.resBody) || '(None)';
            detail += `\n=========================================\n`;
            return detail;
          };

          // 点击单条请求复制详情
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(getRequestDetail()).then(() => {
              showToast(t.toastCopiedRequest);
            }).catch(err => {
              console.error('Copy failed:', err);
              showToast(state.language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
            });
          });

          addHoverActions(row, originalIndex, getRequestDetail);
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
    const t = i18n[state.language];

    // 1. 创建并插入样式（防重复挂载）
    let styleEl = document.getElementById('brl-panel-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'brl-panel-styles';
      styleEl.textContent = styleText;
      (document.head || document.documentElement).appendChild(styleEl);
    }

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
          <button class="brl-icon-btn" id="brl-btn-collapse" title="${state.language === 'zh' ? '折叠面板' : 'Collapse Panel'}">➖</button>
          <button class="brl-icon-btn" id="brl-btn-close" title="${state.language === 'zh' ? '彻底关闭' : 'Close Panel'}" style="margin-left: 6px;">❌</button>
        </div>
      </div>

      <!-- 横向滑动内容区 -->
      <div id="brl-slider-viewport">
        <div id="brl-slider-wrapper">
          
          <!-- [页面 1]: 主控制视图 -->
          <div id="brl-view-main">
            <!-- 过滤规则 -->
            <div class="brl-field-group">
              <div class="brl-label">${t.filterLabel}</div>
              <input type="text" class="brl-input" id="brl-input-filter" value="${state.filterPattern}" placeholder="${t.filterPlaceholder}" />
            </div>

            <!-- 状态控制按钮 -->
            <div class="brl-btn-row">
              <button class="brl-btn" id="brl-btn-toggle-listen">${state.isListening ? t.btnPauseListen : t.btnStartListen}</button>
              <button class="brl-btn danger" id="brl-btn-clear">${t.btnClearData} (0)</button>
            </div>

            <!-- 打标区 -->
            <div class="brl-field-group" style="margin-top: 2px;">
              <div class="brl-label">${t.filterLabel.replace('URL 匹配规则', '数据来源').replace('URL Pattern', 'Step Tag')}</div>
              <input type="text" class="brl-input" id="brl-input-tag" placeholder="${t.inputTagPlaceholder}" />
            </div>

            <div class="brl-btn-row">
              <button class="brl-btn" id="brl-btn-action-tag">${state.isTagActive ? `${t.btnEndTag} [${state.currentTag}]` : t.btnStartTag}</button>
            </div>

            <!-- 当前事项状态条 -->
            <div class="brl-tag-status-bar" id="brl-tag-status" style="${state.isTagActive ? 'display: flex;' : 'display: none;'}">
              <span>${t.tagStatusBarText} <span id="brl-current-tag-text">${state.currentTag}</span></span>
            </div>

            <!-- 实时预览区 -->
            <div class="brl-field-group" style="margin-top: 2px;">
              <div class="brl-label">${state.language === 'zh' ? '最近捕获请求与交互 (点击复制)' : 'Recent Logs (Click to copy)'}</div>
              <div id="brl-preview-list">
                <div style="text-align: center; color: #666; padding: 12px; font-size: 11px; font-style: italic;">${t.noMatchingLogs}</div>
              </div>
            </div>

            <!-- 导出与复制双按钮行 -->
            <div class="brl-btn-row" style="margin-top: 2px;">
              <button class="brl-btn primary" id="brl-btn-export" style="padding: 9px 10px;">${t.btnExportTxt}</button>
              <button class="brl-btn" id="brl-btn-copy-all" style="padding: 9px 10px; background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.3); color: #93c5fd;">${t.btnCopyAll}</button>
            </div>
            
            <!-- 精美极简状态脚部 -->
            <div class="brl-footer" style="margin: 0 -12px -12px -12px; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span id="brl-status-dot" class="brl-indicator ${state.isListening ? 'pulse' : 'paused'}"></span>
                <span id="brl-status-text" style="font-size: 11px; color: #aaa;">${state.isListening ? t.statusRunning : t.statusPaused}</span>
              </div>
              <button id="brl-btn-go-settings" class="brl-icon-btn" title="${t.settingsTitle}">⚙️ ${t.settingsTitle}</button>
            </div>
          </div>

          <!-- [页面 2]: 高级设置视图 -->
          <div id="brl-view-settings">
            <!-- 返回按钮 -->
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <button class="brl-btn-back" id="brl-btn-back-to-main">
                ${t.backToMain}
              </button>
            </div>

            <!-- GitHub 链接 -->
            <button class="brl-github-btn" id="brl-btn-github">
              ${t.githubBtn}
            </button>

            <div style="display: flex; flex-direction: column; gap: 12px; max-height: 350px; overflow-y: auto; padding-right: 4px;">
              
              <!-- 卡片 1: Headers 调试开关 & 配置 -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">${t.headersTitle}</span>
                  <label class="brl-switch">
                    <input type="checkbox" id="brl-cb-headers" ${state.includeHeaders ? 'checked' : ''} />
                    <span class="brl-slider"></span>
                  </label>
                </div>
                
                <!-- 卡片内部展开字段 -->
                <div id="brl-headers-sub-sec" style="${state.includeHeaders ? 'display: flex;' : 'display: none;'} flex-direction: column; gap: 8px; margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                  <div class="brl-field-group">
                    <div class="brl-label" style="color: #34d399;">${t.keepHeadersLabel}</div>
                    <input type="text" class="brl-input" id="brl-input-headers-keep" value="${state.headersKeepPattern}" placeholder="${t.keepHeadersPlaceholder}" />
                  </div>
                  <div class="brl-field-group">
                    <div class="brl-label" style="color: #f87171;">${t.excludeHeadersLabel}</div>
                    <input type="text" class="brl-input" id="brl-input-headers-exclude" value="${state.headersExcludePattern}" placeholder="${t.excludeHeadersPlaceholder}" />
                  </div>
                </div>
              </div>

              <!-- 卡片 2: 点击交互配置 -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">${t.clicksTitle}</span>
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
                    <span style="color: #93c5fd; font-weight: 500;">${t.clicksUrlLabel}</span>
                  </label>
                  <label class="brl-custom-cb">
                    <input type="checkbox" id="brl-cb-click-class" ${state.clickIncludeClass ? 'checked' : ''} />
                    <span class="brl-checkbox-box"></span>
                    <span style="color: #fbbf24; font-weight: 500;">${t.clicksClassLabel}</span>
                  </label>
                </div>
              </div>

              <!-- 卡片 3: 异常与控制台日志追踪 -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">${t.errorsTitle}</span>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                  <label class="brl-custom-cb">
                    <input type="checkbox" id="brl-cb-errors" ${state.includeErrors ? 'checked' : ''} />
                    <span class="brl-checkbox-box"></span>
                    <span style="color: #f87171; font-weight: 500;">${t.errorsLabel}</span>
                  </label>
                  
                  <label class="brl-custom-cb" style="margin-top: 4px;">
                    <input type="checkbox" id="brl-cb-console" ${state.includeConsole ? 'checked' : ''} />
                    <span class="brl-checkbox-box"></span>
                    <span style="color: #93c5fd; font-weight: 500;">${t.consoleLabel}</span>
                  </label>
                  
                  <!-- 控制台等级细分选择 -->
                  <div id="brl-console-sub-sec" style="${state.includeConsole ? 'display: flex;' : 'display: none;'} flex-direction: column; gap: 8px; margin-left: 20px; border-left: 2px solid rgba(255,255,255,0.08); padding-left: 10px;">
                    <label class="brl-custom-cb">
                      <input type="checkbox" id="brl-cb-console-error" ${state.consoleLevels.error ? 'checked' : ''} />
                      <span class="brl-checkbox-box"></span>
                      <span style="color: #ef4444; font-size: 11px;">Error 🔴</span>
                    </label>
                    <label class="brl-custom-cb">
                      <input type="checkbox" id="brl-cb-console-warn" ${state.consoleLevels.warn ? 'checked' : ''} />
                      <span class="brl-checkbox-box"></span>
                      <span style="color: #fbbf24; font-size: 11px;">Warn 🟡</span>
                    </label>
                    <label class="brl-custom-cb">
                      <input type="checkbox" id="brl-cb-console-info" ${state.consoleLevels.info ? 'checked' : ''} />
                      <span class="brl-checkbox-box"></span>
                      <span style="color: #60a5fa; font-size: 11px;">Info 🔵</span>
                    </label>
                    <label class="brl-custom-cb">
                      <input type="checkbox" id="brl-cb-console-log" ${state.consoleLevels.log ? 'checked' : ''} />
                      <span class="brl-checkbox-box"></span>
                      <span style="color: #ccc; font-size: 11px;">Log ⚪</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- 卡片 4: 语言设置 -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">${t.languageTitle}</span>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                  <div class="brl-field-group">
                    <div class="brl-label">${t.languageLabel}</div>
                    <select class="brl-input" id="brl-select-lang" style="background: rgba(20, 20, 20, 0.85); color: #fff; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer; padding: 4px 6px;">
                      <option value="en" ${state.language === 'en' ? 'selected' : ''}>English</option>
                      <option value="zh" ${state.language === 'zh' ? 'selected' : ''}>中文 (Chinese)</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- 卡片 5: 可视化使用说明 (垂直时间轴) -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">${t.howToUseTitle}</span>
                </div>
                <div style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                  <div class="brl-timeline">
                    <div class="brl-timeline-item">
                      <div class="brl-timeline-dot">1</div>
                      <div class="brl-timeline-title">${t.step1Title}</div>
                      <div class="brl-timeline-desc">${t.step1Desc}</div>
                    </div>
                    <div class="brl-timeline-item">
                      <div class="brl-timeline-dot">2</div>
                      <div class="brl-timeline-title">${t.step2Title}</div>
                      <div class="brl-timeline-desc">${t.step2Desc}</div>
                    </div>
                    <div class="brl-timeline-item">
                      <div class="brl-timeline-dot">3</div>
                      <div class="brl-timeline-title">${t.step3Title}</div>
                      <div class="brl-timeline-desc">${t.step3Desc}</div>
                    </div>
                    <div class="brl-timeline-item">
                      <div class="brl-timeline-dot">4</div>
                      <div class="brl-timeline-title">${t.step4Title}</div>
                      <div class="brl-timeline-desc">${t.step4Desc}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 卡片 6: 版本与更新 -->
              <div class="brl-settings-card">
                <div class="brl-settings-card-header">
                  <span class="brl-settings-card-title">${t.versionTitle}</span>
                  <span style="font-size: 10px; color: #888; font-family: monospace;">v1.0.0</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 11px; color: #aaa;">${t.currentVersionLabel}: v1.0.0</span>
                    <button class="brl-btn" id="brl-btn-check-update" style="padding: 4px 8px; font-size: 10px; width: auto; background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.3); color: #93c5fd;">${t.btnCheckUpdate}</button>
                  </div>
                  <div id="brl-update-status" style="font-size: 10px; line-height: 1.4; display: none;"></div>
                  <button class="brl-btn primary" id="brl-btn-download-zip" style="padding: 6px; font-size: 10px; width: 100%; display: none;">${t.btnGetLatestZip}</button>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
      
      <!-- Toast 提示 (容器级浮出) -->
      <div id="brl-toast">${t.toastCopied}</div>
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
    cbErrors = document.getElementById('brl-cb-errors');
    cbConsole = document.getElementById('brl-cb-console');
    cbConsoleError = document.getElementById('brl-cb-console-error');
    cbConsoleWarn = document.getElementById('brl-cb-console-warn');
    cbConsoleInfo = document.getElementById('brl-cb-console-info');
    cbConsoleLog = document.getElementById('brl-cb-console-log');
    const selectLang = document.getElementById('brl-select-lang');
    const btnGithub = document.getElementById('brl-btn-github');
    const btnCheckUpdate = document.getElementById('brl-btn-check-update');
    const btnDownloadZip = document.getElementById('brl-btn-download-zip');
    const updateStatusDiv = document.getElementById('brl-update-status');
    const consoleSubSec = document.getElementById('brl-console-sub-sec');
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
      e.stopPropagation();
      setCollapsed(true);
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

    // 社交与更新相关的绑定
    btnGithub.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open('https://github.com/FQFangQi/tagged-request-logger', '_blank');
    });

    btnCheckUpdate.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tVal = i18n[state.language];
      updateStatusDiv.style.display = 'block';
      updateStatusDiv.style.color = '#93c5fd';
      updateStatusDiv.textContent = tVal.updateChecking;
      btnDownloadZip.style.display = 'none';

      try {
        const res = await fetch('https://raw.githubusercontent.com/FQFangQi/tagged-request-logger/main/manifest.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('CORS or network error');
        
        const data = await res.json();
        const onlineVersion = data.version;
        const localVersion = '1.0.0';

        if (onlineVersion !== localVersion) {
          updateStatusDiv.style.color = '#f87171';
          updateStatusDiv.textContent = `${tVal.updateAvailable} (v${localVersion} -> v${onlineVersion})`;
          btnDownloadZip.style.display = 'block';
        } else {
          updateStatusDiv.style.color = '#34d399';
          updateStatusDiv.textContent = tVal.updateLatest;
        }
      } catch (err) {
        console.warn('[RequestLogger] Check update block by CORS/CSP:', err);
        updateStatusDiv.style.color = '#fbbf24';
        updateStatusDiv.textContent = tVal.updateErr;
        btnDownloadZip.style.display = 'block';
      }
    });

    btnDownloadZip.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open('https://github.com/FQFangQi/tagged-request-logger/archive/refs/heads/main.zip', '_blank');
    });

    // 开始/暂停监听
    btnToggleListen.addEventListener('click', () => {
      state.isListening = !state.isListening;
      const tVal = i18n[state.language];
      if (state.isListening) {
        btnToggleListen.textContent = tVal.btnPauseListen;
        indicator.className = 'brl-indicator pulse';
        statusDot.className = 'brl-indicator pulse';
        statusText.textContent = tVal.statusRunning;
      } else {
        btnToggleListen.textContent = tVal.btnStartListen;
        indicator.className = 'brl-indicator paused';
        statusDot.className = 'brl-indicator paused';
        statusText.textContent = tVal.statusPaused;
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

    // 绑定页面报错选项变更事件
    cbErrors.addEventListener('change', () => {
      state.includeErrors = cbErrors.checked;
      localStorage.setItem('__trl_errors', state.includeErrors ? 'true' : 'false');
    });

    // 绑定控制台日志选项变更事件（以及展开/收起细分选择）
    cbConsole.addEventListener('change', () => {
      state.includeConsole = cbConsole.checked;
      localStorage.setItem('__trl_console', state.includeConsole ? 'true' : 'false');
      consoleSubSec.style.display = state.includeConsole ? 'flex' : 'none';
    });

    // 绑定控制台等级细分多选框变更事件
    const updateConsoleLevels = () => {
      state.consoleLevels.error = cbConsoleError.checked;
      state.consoleLevels.warn = cbConsoleWarn.checked;
      state.consoleLevels.info = cbConsoleInfo.checked;
      state.consoleLevels.log = cbConsoleLog.checked;
      localStorage.setItem('__trl_console_levels', JSON.stringify(state.consoleLevels));
    };

    cbConsoleError.addEventListener('change', updateConsoleLevels);
    cbConsoleWarn.addEventListener('change', updateConsoleLevels);
    cbConsoleInfo.addEventListener('change', updateConsoleLevels);
    cbConsoleLog.addEventListener('change', updateConsoleLevels);

    inputHeadersKeep.addEventListener('input', () => {
      state.headersKeepPattern = inputHeadersKeep.value.trim();
      localStorage.setItem('__trl_headers_keep', state.headersKeepPattern);
    });

    inputHeadersExclude.addEventListener('input', () => {
      state.headersExcludePattern = inputHeadersExclude.value.trim();
      localStorage.setItem('__trl_headers_exclude', state.headersExcludePattern);
    });

    // 绑定语言切换事件
    selectLang.addEventListener('change', () => {
      const selectedLang = selectLang.value;
      state.language = selectedLang;
      localStorage.setItem('__trl_lang', selectedLang);
      
      // 热重载 UI 面板以切换语言
      panel.remove();
      initUI();
    });

    // 事项打标操作
    btnActionTag.addEventListener('click', () => {
      const tVal = i18n[state.language];
      if (!state.isTagActive) {
        // 开启事项
        const tagName = inputTag.value.trim();
        if (!tagName) {
          alert(tVal.alertTagEmpty);
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
        btnActionTag.textContent = `${tVal.btnEndTag} [${tagName}]`;
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
        
        btnActionTag.textContent = tVal.btnStartTag;
        btnActionTag.classList.remove('active-tag');
        tagStatusBar.style.display = 'none';
        inputTag.disabled = false;
        inputTag.value = '';
      }
    });

    // 导出文本为 TXT
    btnExport.addEventListener('click', () => {
      const tVal = i18n[state.language];
      if (state.logs.length === 0) {
        alert(tVal.alertNoLogs);
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
      const tVal = i18n[state.language];
      if (state.logs.length === 0) {
        alert(tVal.alertNoLogs);
        return;
      }

      const txt = generateLogReport();
      navigator.clipboard.writeText(txt).then(() => {
        showToast(tVal.toastCopiedAll);
      }).catch(err => {
        console.error('Copy failed:', err);
        showToast(state.language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
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
