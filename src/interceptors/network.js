import { state } from '../state';

// 格式化时间
export function getFormattedTime(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export function tryFormatJson(text) {
  if (!text) return '';
  try {
    const obj = JSON.parse(text);
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return text;
  }
}

export function matchUrl(url) {
  if (!state.filterPattern) return true;
  try {
    if (state.filterPattern.startsWith('/') && state.filterPattern.lastIndexOf('/') > 0) {
      const lastSlash = state.filterPattern.lastIndexOf('/');
      const pattern = state.filterPattern.slice(1, lastSlash);
      const flags = state.filterPattern.slice(lastSlash + 1);
      const regex = new RegExp(pattern, flags);
      return regex.test(url);
    }
    return url.includes(state.filterPattern);
  } catch (e) {
    return url.includes(state.filterPattern);
  }
}

export function filterHeaders(headersObj) {
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
    if (keepKeys.length > 0) {
      if (keepKeys.includes(lowerKey)) {
        filtered[key] = headersObj[key];
      }
    } else {
      if (!excludeKeys.includes(lowerKey)) {
        filtered[key] = headersObj[key];
      }
    }
  });
  return filtered;
}

// 敏感信息智能脱敏过滤 (Password / Token Masking)
function maskSensitiveInfo(str) {
  if (!str) return str;
  return str.replace(
    /("Header\s+Authorization"|"(?:password|pass|token|secret|auth|authorization|credential|api_key|apikey)")\s*:\s*("(?:[^"\\]|\\.)*")/gi,
    '$1:"******"'
  );
}

export function initNetworkInterceptor() {
  // 1. 拦截 Fetch
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

    // 前端脱敏
    reqBody = maskSensitiveInfo(reqBody);

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
      
      const clonedRes = response.clone();
      const resHeaders = {};
      if (clonedRes.headers) {
        clonedRes.headers.forEach((value, key) => {
          resHeaders[key] = value;
        });
      }
      logItem.resHeaders = resHeaders;

      clonedRes.text().then(text => {
        // 脱敏并截断
        let maskedText = maskSensitiveInfo(text);
        if (maskedText && maskedText.length > 1500) {
          maskedText = maskedText.slice(0, 1500) + '... (truncated)';
        }
        logItem.resBody = maskedText;
        logItem.durationMs = Math.round(performance.now() - startTime);
        state.addLog(logItem);
      }).catch(err => {
        logItem.resBody = `[Read response failed: ${err.message}]`;
        logItem.durationMs = Math.round(performance.now() - startTime);
        state.addLog(logItem);
      });

      return response;
    } catch (error) {
      logItem.status = 'FAILED';
      logItem.resBody = `[Request exception: ${error.message}]`;
      logItem.durationMs = Math.round(performance.now() - startTime);
      state.addLog(logItem);
      throw error;
    }
  };

  // 2. 拦截 XHR
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

      // 脱敏
      reqBody = maskSensitiveInfo(reqBody);

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
          
          let responseText = xhr.responseText;
          responseText = maskSensitiveInfo(responseText);
          if (responseText && responseText.length > 1500) {
            responseText = responseText.slice(0, 1500) + '... (truncated)';
          }
          logItem.resBody = responseText;
          logItem.durationMs = Math.round(performance.now() - startTime);
          
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

          state.addLog(logItem);
        });

        this.addEventListener('error', function() {
          logItem.status = 'FAILED';
          logItem.resBody = '[XHR request network error]';
          logItem.durationMs = Math.round(performance.now() - startTime);
          state.addLog(logItem);
        });

        this.addEventListener('abort', function() {
          logItem.status = 'ABORTED';
          logItem.resBody = '[XHR request aborted]';
          logItem.durationMs = Math.round(performance.now() - startTime);
          state.addLog(logItem);
        });
      }

      return send.apply(this, arguments);
    };

    return xhr;
  }
  CustomXHR.prototype = originalXHR.prototype;
  window.XMLHttpRequest = CustomXHR;
}
