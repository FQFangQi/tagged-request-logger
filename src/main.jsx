import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initNetworkInterceptor } from './interceptors/network';
import { initConsoleInterceptor } from './interceptors/console';
import { initErrorInterceptor } from './interceptors/errors';
import { initDomInterceptor } from './interceptors/dom';
import './styles.css';

// 1. 立即在注入环境最开始初始化底层劫持逻辑，防止遗漏首屏请求
initNetworkInterceptor();
initConsoleInterceptor();
initErrorInterceptor();
initDomInterceptor();

// 2. 动态挂载 React UI 到宿主 DOM 树上
const mountReactUI = () => {
  if (document.getElementById('brl-panel-root')) return;

  const container = document.createElement('div');
  container.id = 'brl-panel-root';
  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

if (document.body) {
  mountReactUI();
} else {
  document.addEventListener('DOMContentLoaded', mountReactUI);
}
