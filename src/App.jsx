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

  // 监听折叠/展开状态，在状态切换时执行智能的“象限重定位与边界自适应算法”
  useEffect(() => {
    if (!panelRef.current) return;
    
    const leftStr = panelRef.current.style.left;
    const topStr = panelRef.current.style.top;
    if (!leftStr || !topStr) return;
    
    const left = parseInt(leftStr, 10);
    const top = parseInt(topStr, 10);
    
    if (!isCollapsed) {
      // 1. 折叠 -> 展开：避免大卡片超出屏幕
      let newLeft = left;
      let newTop = top;
      
      // 若悬浮球在右半侧，展开大卡片时向左延伸（让右边缘对齐）
      if (left > window.innerWidth / 2) {
        newLeft = left - (340 - 50);
      }
      // 若悬浮球在下半侧，展开大卡片时向上延伸（让底边缘对齐）
      if (top > window.innerHeight / 2) {
        newTop = top - (480 - 50);
      }
      
      // 安全硬限位
      const maxLeft = window.innerWidth - 340 - 10;
      const maxTop = window.innerHeight - 480 - 10;
      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));
      
      panelRef.current.style.left = `${newLeft}px`;
      panelRef.current.style.top = `${newTop}px`;
      localStorage.setItem('__trl_panel_left', newLeft);
      localStorage.setItem('__trl_panel_top', newTop);
    } else {
      // 2. 展开 -> 折叠：小悬浮球顺滑缩回到展开面板对应的舒适边缘
      let ballLeft = left;
      let ballTop = top;
      
      // 若面板在右半侧，折叠后的小球应该留在面板的右侧
      if (left > window.innerWidth / 2) {
        ballLeft = left + (340 - 50);
      }
      // 若面板在下半侧，折叠后的小球应该留在面板的底侧
      if (top > window.innerHeight / 2) {
        const realHeight = panelRef.current.offsetHeight || 480;
        ballTop = top + (realHeight - 50);
      }
      
      // 安全硬限位
      ballLeft = Math.max(10, Math.min(ballLeft, window.innerWidth - 50 - 10));
      ballTop = Math.max(10, Math.min(ballTop, window.innerHeight - 50 - 10));
      
      panelRef.current.style.left = `${ballLeft}px`;
      panelRef.current.style.top = `${ballTop}px`;
      localStorage.setItem('__trl_panel_left', ballLeft);
      localStorage.setItem('__trl_panel_top', ballTop);
    }
  }, [isCollapsed]);

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
            {activeView === 'main' ? (
              <div className="brl-title">
                <span className={`brl-indicator ${isListening ? 'pulse' : 'paused'}`}></span>
                <span>Tagged Logger</span>
              </div>
            ) : (
              <div 
                className="brl-title" 
                onClick={(e) => { e.stopPropagation(); setActiveView('main'); }}
                style={{ cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#e0e0e0'}
              >
                <BackIcon size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{t.settingsTitle}</span>
              </div>
            )}
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

              {/* 前往配置 (只在主面板状态显示，配置态下已退回左侧返回标题) */}
              {activeView === 'main' && (
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
