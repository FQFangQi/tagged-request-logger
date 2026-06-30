import React, { useState, useEffect } from 'react';
import { useLoggerState } from '../hooks/useLoggerState';
import { i18n } from '../i18n';
import { getFormattedTime, tryFormatJson, filterHeaders } from '../interceptors/network';
import { state } from '../state';
import { CopyIcon, TrashIcon } from './Icons';

// 将请求序列化为 cURL 命令的函数
export function generateCurlCommand(log) {
  if (log.type !== 'request') return '';
  let curl = `curl '${log.url}'`;
  curl += ` -X ${log.method}`;
  
  if (log.reqHeaders) {
    Object.keys(log.reqHeaders).forEach(key => {
      const val = String(log.reqHeaders[key]).replace(/'/g, "'\\''");
      curl += ` -H '${key}: ${val}'`;
    });
  }
  
  if (log.reqBody && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(log.method)) {
    const rawBody = typeof log.reqBody === 'object' ? JSON.stringify(log.reqBody) : String(log.reqBody);
    const escapedBody = rawBody.replace(/'/g, "'\\''");
    curl += ` --data-raw '${escapedBody}'`;
  }
  
  return curl;
}

export default function Timeline({ showToast }) {
  const { logs, language, includeHeaders } = useLoggerState();
  const t = i18n[language];

  // 右键上下文菜单状态
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0, show: false, log: null });

  // 映射原始索引并取最近 6 条
  const displayLogs = logs
    .map((log, index) => ({ log, index }))
    .slice(-6);

  // 全局关闭右键菜单监听
  useEffect(() => {
    const closeMenu = () => {
      setMenuPos(prev => prev.show ? { ...prev, show: false } : prev);
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, []);

  const copyToClipboard = (text, successMsg) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(err => {
      console.error('Copy failed:', err);
      showToast(language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
    });
  };

  const getClickDetail = (log) => {
    let detail = `=========================================\n`;
    detail += `${t.clickDetailTitle}\n`;
    if (log.url) detail += `${t.clickDetailUrl}: ${log.url}\n`;
    detail += `${language === 'zh' ? '元素标签' : 'Tag Name'}: ${log.tagName}\n`;
    detail += `${t.clickDetailText}: ${log.innerText ? `"${log.innerText}"` : '(None)'}\n`;
    if (log.id) detail += `${t.clickDetailId}: ${log.id}\n`;
    if (log.className) detail += `${t.clickDetailClass}: ${log.className}\n`;
    detail += `${t.clickDetailSelector}:\n${log.selector}\n`;
    detail += `${t.clickDetailTime}: ${getFormattedTime(log.timestamp)}\n`;
    if (log.tag) detail += `${t.clickDetailTag}: ${log.tag}\n`;
    detail += `=========================================\n`;
    return detail;
  };

  const getErrorDetail = (log) => {
    let detail = `=========================================\n`;
    detail += `${t.errDetailTitle}: ${log.type === 'error' ? (language === 'zh' ? 'JavaScript 运行时错误' : 'JavaScript Runtime Error') : (language === 'zh' ? '未捕获 Promise 异常' : 'Unhandled Promise Rejection')}\n`;
    detail += `${t.errDetailMsg}: ${log.message}\n`;
    if (log.type === 'error') {
      detail += `${t.errDetailFile}: ${log.filename}\n`;
      detail += `${language === 'zh' ? '行列信息' : 'Line/Col'}: ${language === 'zh' ? '行 ' : 'Line '}${log.lineno}, ${language === 'zh' ? '列 ' : 'Col '}${log.colno}\n`;
    }
    if (log.stack) {
      detail += `\n${t.errDetailStack}:\n${log.stack}\n`;
    }
    detail += `${t.clickDetailTime}: ${getFormattedTime(log.timestamp)}\n`;
    if (log.tag) detail += `${t.clickDetailTag}: ${log.tag}\n`;
    detail += `=========================================\n`;
    return detail;
  };

  const getConsoleDetail = (log) => {
    let detail = `=========================================\n`;
    detail += `${t.consoleDetailSrc}: ${language === 'zh' ? '控制台输出' : 'Console Output'} (Console.${log.level})\n`;
    detail += `${t.consoleDetailContent}: ${log.message}\n`;
    detail += `${language === 'zh' ? '时间' : 'Time'}: ${getFormattedTime(log.timestamp)}\n`;
    if (log.tag) detail += `${language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
    detail += `=========================================\n`;
    return detail;
  };

  const getRequestDetail = (log) => {
    let detail = `=========================================\n`;
    detail += `${t.reqDetailMethod}: ${log.method}\n`;
    detail += `URL: ${log.url}\n`;
    detail += `${t.reqDetailStatus}: ${log.status}\n`;
    detail += `${t.reqDetailDuration}: ${log.durationMs !== null ? log.durationMs + 'ms' : 'Unknown'}\n`;
    detail += `${language === 'zh' ? '时间' : 'Time'}: ${getFormattedTime(log.timestamp)}\n`;
    if (log.tag) detail += `${language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
    
    if (includeHeaders) {
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

  const handleDelete = (index, e) => {
    if (e) e.stopPropagation();
    state.deleteLog(index);
  };

  const handleRowClick = (log) => {
    if (log.type === 'marker') return;
    let detail = '';
    let successToast = t.toastCopied;
    if (log.type === 'click') {
      detail = getClickDetail(log);
    } else if (log.type === 'error' || log.type === 'promise-error') {
      detail = getErrorDetail(log);
    } else if (log.type === 'console') {
      detail = getConsoleDetail(log);
    } else if (log.type === 'request') {
      detail = getRequestDetail(log);
      successToast = t.toastCopiedRequest;
    }
    copyToClipboard(detail, successToast);
  };

  const getLogDetailText = (log) => {
    if (log.type === 'click') return getClickDetail(log);
    if (log.type === 'error' || log.type === 'promise-error') return getErrorDetail(log);
    if (log.type === 'console') return getConsoleDetail(log);
    if (log.type === 'request') return getRequestDetail(log);
    return '';
  };

  const handleContextMenu = (e, log) => {
    if (log.type === 'marker') return;
    e.preventDefault();
    e.stopPropagation();

    const panel = document.getElementById('brl-panel-container');
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 边界安全规避：若菜单向下会溢出面板高，向上折算；向右溢出则向左折算
    const adjustedY = y + 95 > rect.height ? y - 95 : y;
    const adjustedX = x + 120 > rect.width ? x - 120 : x;

    setMenuPos({
      x: adjustedX,
      y: adjustedY,
      show: true,
      log: log
    });
  };

  if (displayLogs.length === 0) {
    return (
      <div id="brl-preview-list">
        <div style={{ textAlign: 'center', color: '#666', padding: '12px', fontSize: '11px', fontStyle: 'italic' }}>
          {t.noMatchingLogs}
        </div>
      </div>
    );
  }

  return (
    <>
      <div id="brl-preview-list">
        {displayLogs.map(({ log, index }) => {
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          
          if (log.type === 'marker') {
            return (
              <div key={index} className="brl-log-row status-marker">
                <div style={{ flex: 1, textAlign: 'center', fontSize: '10px' }}>
                  {log.action === 'start' ? '▶' : '⏹'} {language === 'zh' ? '事项' : 'Tag'}: {log.text} ({timeStr})
                </div>
                <div className="brl-log-actions">
                  <div 
                    className="brl-action-icon delete-btn" 
                    title={language === 'zh' ? '删除此条记录' : 'Delete Log'}
                    onClick={(e) => handleDelete(index, e)}
                  >
                    <TrashIcon size={12} />
                  </div>
                </div>
              </div>
            );
          }

          if (log.type === 'click') {
            let elementDesc = log.tagName.toLowerCase();
            if (log.id) elementDesc += `#${log.id}`;
            const textExcerpt = log.innerText ? ` "${log.innerText.slice(0, 14)}"` : '';

            return (
              <div 
                key={index} 
                className="brl-log-row status-click" 
                onClick={() => handleRowClick(log)}
                onContextMenu={(e) => handleContextMenu(e, log)}
              >
                <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '46px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>🖱️</span>
                  <span style={{ fontWeight: 'bold', color: '#10b981', fontFamily: 'monospace', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 3px', borderRadius: '3px', fontSize: '9px', flexShrink: 0 }}>
                    CLICK
                  </span>
                  <span style={{ color: '#ccc', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {elementDesc}{textExcerpt}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace', flexShrink: 0 }}>
                  {timeStr}
                </span>
                <div className="brl-log-actions">
                  <div 
                    className="brl-action-icon" 
                    title={language === 'zh' ? '复制详情' : 'Copy Details'}
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(getLogDetailText(log), t.toastCopied); }}
                  >
                    <CopyIcon size={12} />
                  </div>
                  <div 
                    className="brl-action-icon delete-btn" 
                    title={language === 'zh' ? '删除此条记录' : 'Delete Log'}
                    onClick={(e) => handleDelete(index, e)}
                  >
                    <TrashIcon size={12} />
                  </div>
                </div>
              </div>
            );
          }

          if (log.type === 'error' || log.type === 'promise-error') {
            const errType = log.type === 'error' ? 'JS ERROR' : 'PROMISE ERR';
            const shortMsg = log.message.length > 25 ? log.message.slice(0, 22) + '...' : log.message;

            return (
              <div 
                key={index} 
                className="brl-log-row status-err" 
                onClick={() => handleRowClick(log)}
                onContextMenu={(e) => handleContextMenu(e, log)}
              >
                <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '46px', overflow: 'hidden' }}>
                  <span>🚫</span>
                  <span style={{ fontWeight: 'bold', color: '#ef4444', fontFamily: 'monospace', background: 'rgba(239, 68, 68, 0.15)', padding: '1px 3px', borderRadius: '3px', fontSize: '9px', flexShrink: 0 }}>
                    {errType}
                  </span>
                  <span style={{ color: '#fca5a5', fontFamily: 'monospace', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }} title={log.message}>
                    {shortMsg}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace', marginLeft: '4px', flexShrink: 0 }}>
                  {timeStr}
                </span>
                <div className="brl-log-actions">
                  <div 
                    className="brl-action-icon" 
                    title={language === 'zh' ? '复制详情' : 'Copy Details'}
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(getLogDetailText(log), t.toastCopied); }}
                  >
                    <CopyIcon size={12} />
                  </div>
                  <div 
                    className="brl-action-icon delete-btn" 
                    title={language === 'zh' ? '删除此条记录' : 'Delete Log'}
                    onClick={(e) => handleDelete(index, e)}
                  >
                    <TrashIcon size={12} />
                  </div>
                </div>
              </div>
            );
          }

          if (log.type === 'console') {
            let levelColor = '#ccc';
            let levelBg = 'rgba(255, 255, 255, 0.1)';
            let icon = '💬';
            let rowClass = '';
            if (log.level === 'error') {
              rowClass = 'status-err';
              levelColor = '#ef4444';
              levelBg = 'rgba(239, 68, 68, 0.15)';
              icon = '🔴';
            } else if (log.level === 'warn') {
              rowClass = 'status-warn';
              levelColor = '#fbbf24';
              levelBg = 'rgba(245, 158, 11, 0.15)';
              icon = '🟡';
            } else if (log.level === 'info') {
              levelColor = '#60a5fa';
              levelBg = 'rgba(59, 130, 246, 0.15)';
              icon = '🔵';
            }

            const shortMsg = log.message.length > 25 ? log.message.slice(0, 22) + '...' : log.message;

            return (
              <div 
                key={index} 
                className={`brl-log-row ${rowClass}`} 
                onClick={() => handleRowClick(log)}
                onContextMenu={(e) => handleContextMenu(e, log)}
              >
                <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '46px', overflow: 'hidden' }}>
                  <span>{icon}</span>
                  <span style={{ fontWeight: 'bold', color: levelColor, fontFamily: 'monospace', background: levelBg, padding: '1px 3px', borderRadius: '3px', fontSize: '9px', flexShrink: 0 }}>
                    {log.level.toUpperCase()}
                  </span>
                  <span style={{ color: '#ccc', fontFamily: 'monospace', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }} title={log.message}>
                    {shortMsg}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace', marginLeft: '4px', flexShrink: 0 }}>
                  {timeStr}
                </span>
                <div className="brl-log-actions">
                  <div 
                    className="brl-action-icon" 
                    title={language === 'zh' ? '复制详情' : 'Copy Details'}
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(getLogDetailText(log), t.toastCopied); }}
                  >
                    <CopyIcon size={12} />
                  </div>
                  <div 
                    className="brl-action-icon delete-btn" 
                    title={language === 'zh' ? '删除此条记录' : 'Delete Log'}
                    onClick={(e) => handleDelete(index, e)}
                  >
                    <TrashIcon size={12} />
                  </div>
                </div>
              </div>
            );
          }

          if (log.type === 'request') {
            const isErr = log.status === 'FAILED' || log.status >= 400 || log.status === 0;
            let rowClass = '';
            if (isErr) {
              rowClass = 'status-err';
            } else if (log.status >= 300) {
              rowClass = 'status-warn';
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

            return (
              <div 
                key={index} 
                className={`brl-log-row ${rowClass}`} 
                onClick={() => handleRowClick(log)}
                onContextMenu={(e) => handleContextMenu(e, log)}
              >
                <span className={`brl-log-method ${methodClass}`}>{log.method}</span>
                <span className="brl-log-path" title={log.url} style={{ paddingRight: '46px' }}>{displayPath}</span>
                <div className="brl-log-meta">
                  <span style={{ fontWeight: 'bold', color: isErr ? '#f87171' : '#10b981' }}>{log.status}</span>
                  <span className="brl-log-duration">{durationText}</span>
                </div>
                <div className="brl-log-actions">
                  <div 
                    className="brl-action-icon" 
                    title={language === 'zh' ? '复制详情' : 'Copy Details'}
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(getLogDetailText(log), t.toastCopiedRequest); }}
                  >
                    <CopyIcon size={12} />
                  </div>
                  <div 
                    className="brl-action-icon delete-btn" 
                    title={language === 'zh' ? '删除此条记录' : 'Delete Log'}
                    onClick={(e) => handleDelete(index, e)}
                  >
                    <TrashIcon size={12} />
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* 自定义右键菜单 */}
      {menuPos.show && (
        <div 
          style={{
            position: 'absolute',
            left: `${menuPos.x}px`,
            top: `${menuPos.y}px`,
            background: 'rgba(20, 20, 20, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            padding: '4px 0',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 2147483647,
            display: 'flex',
            flexDirection: 'column',
            minWidth: '120px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            className="brl-menu-item"
            onClick={() => {
              handleRowClick(menuPos.log);
              setMenuPos(prev => ({ ...prev, show: false }));
            }}
          >
            {t.menuCopyDetails}
          </div>
          {menuPos.log.type === 'request' && (
            <div 
              className="brl-menu-item"
              onClick={() => {
                const curlCmd = generateCurlCommand(menuPos.log);
                copyToClipboard(curlCmd, t.toastCopiedCurl);
                setMenuPos(prev => ({ ...prev, show: false }));
              }}
            >
              {t.menuCopyCurl}
            </div>
          )}
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />
          <div 
            className="brl-menu-item danger"
            onClick={() => {
              const idx = logs.indexOf(menuPos.log);
              if (idx !== -1) {
                handleDelete(idx);
              }
              setMenuPos(prev => ({ ...prev, show: false }));
            }}
          >
            {t.menuDeleteLog}
          </div>
        </div>
      )}
    </>
  );
}
