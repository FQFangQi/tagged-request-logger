import { state } from '../state';

export function initConsoleInterceptor() {
  const originalConsole = {
    log: window.console.log,
    info: window.console.info,
    warn: window.console.warn,
    error: window.console.error
  };

  ['log', 'info', 'warn', 'error'].forEach(level => {
    window.console[level] = function (...args) {
      if (originalConsole[level]) {
        originalConsole[level].apply(window.console, args);
      }

      if (!state.isListening || !state.includeConsole) return;
      if (!state.consoleLevels[level]) return;

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

      state.addLog({
        type: 'console',
        level: level,
        timestamp: Date.now(),
        message: formattedArgs.slice(0, 1500),
        tag: state.isTagActive ? state.currentTag : null
      });
    };
  });
}
