import React, { useState, useEffect, useRef } from 'react';
import { useLoggerState } from './hooks/useLoggerState';
import { i18n } from './i18n';
import { state } from './state';
import MainView from './components/MainView';
import SettingsView from './components/SettingsView';
import { GithubIcon, SettingsIcon, CollapseIcon, CloseIcon, BackIcon } from './components/Icons';

export default function App() {
  const { isListening, logs, language, isCollapsed, isVisible } = useLoggerState();
  const t = i18n[language];

  const [activeView, setActiveView] = useState('main'); // 'main' 或 'settings'
  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastTimerRef = useRef(null);

  const panelRef = useRef(null);
  const dragInfoRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    panelLeft: 0,
    panelTop: 0,
    hasMoved: false
  });

  // 读取已保存的拖动位置
  useEffect(() => {
    if (panelRef.current) {
      const savedLeft = localStorage.getItem('__trl_panel_left');
      const savedTop = localStorage.getItem('__trl_panel_top');
      if (savedLeft && savedTop) {
        panelRef.current.style.bottom = 'auto';
        panelRef.current.style.right = 'auto';
        panelRef.current.style.left = `${savedLeft}px`;
        panelRef.current.style.top = `${savedTop}px`;
      }
    }
  }, []);

  if (!isVisible) return null;

  const triggerToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    setToastShow(true);
    toastTimerRef.current = setTimeout(() => {
      setToastShow(false);
    }, 2000);
  };

  const handleDragStart = (e) => {
    if (e.target.closest('.brl-icon-btn') || e.target.closest('.brl-btn') || e.target.closest('.brl-switch') || e.target.closest('input') || e.target.closest('select')) {
      return;
    }

    const rect = panelRef.current.getBoundingClientRect();
    panelRef.current.style.bottom = 'auto';
    panelRef.current.style.right = 'auto';
    panelRef.current.style.left = `${rect.left}px`;
    panelRef.current.style.top = `${rect.top}px`;

    dragInfoRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      panelLeft: rect.left,
      panelTop: rect.top,
      hasMoved: false
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    e.preventDefault();
  };

  const handleDragMove = (e) => {
    const info = dragInfoRef.current;
    if (!info.isDragging) return;

    const dx = e.clientX - info.startX;
    const dy = e.clientY - info.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      info.hasMoved = true;
    }

    let newLeft = info.panelLeft + dx;
    let newTop = info.panelTop + dy;

    // 边界检测
    const maxLeft = window.innerWidth - panelRef.current.offsetWidth - 5;
    const maxTop = window.innerHeight - panelRef.current.offsetHeight - 5;

    newLeft = Math.max(5, Math.min(newLeft, maxLeft));
    newTop = Math.max(5, Math.min(newTop, maxTop));

    panelRef.current.style.left = `${newLeft}px`;
    panelRef.current.style.top = `${newTop}px`;
  };

  const handleDragEnd = () => {
    const info = dragInfoRef.current;
    info.isDragging = false;
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);

    if (panelRef.current && info.hasMoved) {
      localStorage.setItem('__trl_panel_left', parseInt(panelRef.current.style.left, 10));
      localStorage.setItem('__trl_panel_top', parseInt(panelRef.current.style.top, 10));
    }
  };

  const toggleCollapsed = () => {
    if (dragInfoRef.current.hasMoved) {
      return;
    }
    state.update(s => { s.isCollapsed = !s.isCollapsed; });
  };

  return (
    <>
      <div
        ref={panelRef}
        id="brl-panel-container"
        className={isCollapsed ? 'collapsed' : ''}
        onMouseDown={isCollapsed ? handleDragStart : undefined}
        onClick={isCollapsed ? toggleCollapsed : undefined}
        style={{ cursor: isCollapsed ? 'pointer' : 'default' }}
      >
        {/* 展开态下的 Header 面板 */}
        {!isCollapsed && (
          <div id="brl-panel-header" onMouseDown={handleDragStart}>
            <div className="brl-title">
              <span className={`brl-indicator ${isListening ? 'pulse' : 'paused'}`}></span>
              <span>Tagged Logger</span>
            </div>
            <div className="brl-header-ops" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* GitHub 快速跳转图标 */}
              <button
                className="brl-icon-btn"
                title={t.githubBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open('https://github.com/FQFangQi/tagged-request-logger', '_blank');
                }}
              >
                <GithubIcon size={14} />
              </button>

              {/* 前往配置 / 返回 */}
              {activeView === 'main' ? (
                <button
                  id="brl-btn-go-settings"
                  className="brl-icon-btn"
                  title={t.settingsTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveView('settings');
                  }}
                >
                  <SettingsIcon size={14} />
                </button>
              ) : (
                <button
                  className="brl-icon-btn"
                  title={t.backToMain}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveView('main');
                  }}
                >
                  <BackIcon size={14} />
                </button>
              )}

              {/* 折叠面板 */}
              <button
                id="brl-btn-collapse"
                className="brl-icon-btn"
                title="Collapse"
                onClick={(e) => {
                  e.stopPropagation();
                  state.update(s => { s.isCollapsed = true; });
                }}
              >
                <CollapseIcon size={14} />
              </button>

              {/* 关闭面板 */}
              <button
                className="brl-icon-btn"
                title="Close"
                onClick={(e) => {
                  e.stopPropagation();
                  state.update(s => { s.isVisible = false; });
                }}
                style={{ color: '#ef4444' }}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          </div>
        )}

        {/* 展开态下的内容滑箱 */}
        {!isCollapsed && (
          <div id="brl-slider-viewport">
            <div
              id="brl-slider-wrapper"
              style={{
                transform: activeView === 'settings' ? 'translateX(-340px)' : 'translateX(0)'
              }}
            >
              {/* 完美契合高度自适应：非当前 active 视图容器的高度重置为 0，防止撑开空白 */}
              <div style={{ width: 340, flexShrink: 0, height: activeView === 'settings' ? 0 : 'auto', overflow: 'hidden' }}>
                <MainView
                  onGoSettings={() => setActiveView('settings')}
                  showToast={triggerToast}
                />
              </div>
              <div style={{ width: 340, flexShrink: 0, height: activeView === 'main' ? 0 : 'auto', overflow: 'hidden' }}>
                <SettingsView
                  onBack={() => setActiveView('main')}
                  showToast={triggerToast}
                />
              </div>
            </div>
          </div>
        )}

        {/* 迷你态下的悬浮球内容 */}
        {isCollapsed && (
          <>
            <div className="brl-ball-icon">
              <GithubIcon size={18} />
            </div>
            {logs.length > 0 && (
              <div className="brl-mini-dot">
                {logs.length > 99 ? '99+' : logs.length}
              </div>
            )}
          </>
        )}
      </div>

      {/* 全局 Toast 提示 */}
      <div id="brl-toast" className={toastShow ? 'show' : ''}>
        {toastMsg}
      </div>
    </>
  );
}
