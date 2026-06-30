import { state } from '../state';

export function initErrorInterceptor() {
  window.addEventListener('error', function (event) {
    if (!state.isListening || !state.includeErrors) return;
    // 排除资源加载错误（如图片/脚本加载失败，它们没有 event.error）
    if (!event.error) return;

    state.addLog({
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

    state.addLog({
      type: 'promise-error',
      timestamp: Date.now(),
      message: `Unhandled Promise Rejection: ${message}`,
      stack: stack,
      tag: state.isTagActive ? state.currentTag : null
    });
  });
}
