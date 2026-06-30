import { state } from '../state';

// 生成唯一而精准的 CSS Selector 路径，包含 nth-of-type 计数支持，便于 AI 完美定位 DOM
export function getDomPath(el) {
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

export function initDomInterceptor() {
  document.addEventListener('click', function (e) {
    // 只有在开启监听、打标事项激活、且“点击交互”开关开启时才进行记录
    if (!state.isListening || !state.isTagActive || !state.includeClicks) {
      return;
    }
    
    // 向上回溯判断是否点击了我们插件面板内的任何元素（免疫此面板）
    let cur = e.target;
    let isPanelClick = false;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (
        cur.id === 'brl-panel-root' || 
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

    if (state.clickIncludeUrl) {
      clickLog.url = window.location.href;
    }
    if (state.clickIncludeClass) {
      clickLog.className = typeof el.className === 'string' ? el.className.trim() : '';
    }

    state.addLog(clickLog);
  }, true); // 使用捕获阶段
}
