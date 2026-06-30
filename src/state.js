export const state = {
  isListening: true,
  filterPattern: '/api/v1',
  currentTag: '',
  isTagActive: false,
  logs: [],
  includeHeaders: false,
  headersKeepPattern: '',
  headersExcludePattern: 'cookie,authorization,token',
  includeClicks: true,
  clickIncludeUrl: true,
  clickIncludeClass: true,
  includeErrors: true,
  includeConsole: true,
  consoleLevels: {
    error: true,
    warn: true,
    info: false,
    log: false
  },
  language: 'en',
  isCollapsed: false,
  listeners: new Set(),

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    this.listeners.forEach(l => l());
  },

  update(updater) {
    updater(this);
    this.notify();
  },

  addLog(logItem) {
    if (!this.isListening) return;
    this.logs.push(logItem);
    this.notify();
  },

  clearLogs() {
    this.logs = [];
    this.notify();
  },

  deleteLog(index) {
    this.logs.splice(index, 1);
    this.notify();
  }
};

// 恢复配置
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
  console.error('[RequestLogger] Failed to restore config:', e);
}
