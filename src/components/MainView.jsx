import React, { useState } from 'react';
import { useLoggerState } from '../hooks/useLoggerState';
import { i18n } from '../i18n';
import { state } from '../state';
import { getFormattedTime, tryFormatJson, filterHeaders } from '../interceptors/network';
import Timeline from './Timeline';
import { PlayIcon, PauseIcon, TrashIcon, CopyIcon, ExportIcon } from './Icons';

export default function MainView({ onGoSettings, showToast }) {
  const {
    isListening,
    filterPattern,
    currentTag,
    isTagActive,
    logs,
    language,
    includeHeaders,
    includeClicks
  } = useLoggerState();

  const t = i18n[language];
  const [tagInput, setTagInput] = useState('');

  // 组装完整的报告文本 (供导出与一键复制全部使用)
  const generateLogReport = () => {
    let txt = `============================================================\n`;
    txt += `${t.reportTitle}\n`;
    txt += `${t.reportTime}: ${getFormattedTime()}\n`;
    txt += `${t.reportUrl}: ${window.location.href}\n`;
    txt += `${t.reportFilter}: ${filterPattern || '(None)'}\n`;
    txt += `${t.reportHeaders}: ${includeHeaders ? 'Yes' : 'No'}\n`;
    txt += `${t.reportClicks}: ${includeClicks ? 'Yes' : 'No'}\n`;
    txt += `============================================================\n\n`;

    logs.forEach((log, index) => {
      if (log.type === 'marker') {
        const timeStr = getFormattedTime(log.timestamp);
        if (log.action === 'start') {
          txt += `\n${t.reportMarkerStart}: [${log.text}] (${timeStr}) ---\n\n`;
        } else {
          txt += `\n${t.reportMarkerEnd}: [${log.text}] (${timeStr}) ---\n\n`;
        }
      } else if (log.type === 'click') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportClick} ${index + 1}] [${language === 'zh' ? '鼠标点击' : 'Mouse Click'}]  ${timeStr}\n`;
        if (log.url) txt += `${t.clickDetailUrl}: ${log.url}\n`;
        txt += `${language === 'zh' ? '标签' : 'Tag Name'}: ${log.tagName}\n`;
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
        if (log.tag) txt += `${language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'promise-error') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportError} ${index + 1}] [Promise Rejection]  ${timeStr}\n`;
        txt += `${t.errDetailMsg}: ${log.message}\n`;
        if (log.stack) {
          txt += `${t.errDetailStack}:\n${log.stack}\n`;
        }
        if (log.tag) txt += `${language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'console') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportConsole} ${index + 1}] [Console ${log.level.toUpperCase()}]  ${timeStr}\n`;
        txt += `${t.consoleDetailContent}: ${log.message}\n`;
        if (log.tag) txt += `${language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        txt += `------------------------------------------------------------\n\n`;
      } else if (log.type === 'request') {
        const timeStr = getFormattedTime(log.timestamp);
        txt += `[${t.reportRequest} ${index + 1}] [${log.tech}]  ${timeStr}\n`;
        txt += `${t.reqDetailMethod}: ${log.method}\n`;
        txt += `URL: ${log.url}\n`;
        txt += `${t.reqDetailStatus}: ${log.status}\n`;
        txt += `${t.reqDetailDuration}: ${log.durationMs !== null ? log.durationMs + 'ms' : 'Reading...'}\n`;
        if (log.tag) {
          txt += `${language === 'zh' ? '所属事项' : 'Tag'}: ${log.tag}\n`;
        }

        if (includeHeaders) {
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
  };

  const handleToggleListen = () => {
    state.update(s => { s.isListening = !s.isListening; });
  };

  const handleClearData = () => {
    state.clearLogs();
  };

  const handleActionTag = () => {
    if (!isTagActive) {
      // 开启打标
      const trimmed = tagInput.trim();
      if (!trimmed) {
        showToast(t.alertTagEmpty);
        return;
      }
      state.update(s => {
        s.isTagActive = true;
        s.currentTag = trimmed;
      });
      state.addLog({
        type: 'marker',
        action: 'start',
        text: trimmed,
        timestamp: Date.now()
      });
    } else {
      // 结束打标
      state.addLog({
        type: 'marker',
        action: 'end',
        text: currentTag,
        timestamp: Date.now()
      });
      state.update(s => {
        s.isTagActive = false;
        s.currentTag = '';
      });
      setTagInput('');
    }
  };

  const handleCopyAll = () => {
    if (logs.length === 0) {
      showToast(t.alertNoLogs);
      return;
    }
    const reportText = generateLogReport();
    navigator.clipboard.writeText(reportText).then(() => {
      showToast(t.toastCopiedAll);
    }).catch(err => {
      console.error('Copy all failed:', err);
      showToast(language === 'zh' ? '复制失败，请重试' : 'Copy failed, please retry');
    });
  };

  const handleExportTxt = () => {
    if (logs.length === 0) {
      showToast(t.alertNoLogs);
      return;
    }
    const reportText = generateLogReport();
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tagged_request_logs_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="brl-view-main">
      {/* 过滤匹配规则 */}
      <div className="brl-field-group">
        <div className="brl-label">{t.filterLabel}</div>
        <input
          type="text"
          className="brl-input"
          value={filterPattern}
          onChange={(e) => {
            state.update(s => { s.filterPattern = e.target.value.trim(); });
            localStorage.setItem('__trl_filter', e.target.value.trim());
          }}
          placeholder={t.filterPlaceholder}
        />
      </div>

      {/* 启动与清除操作行 */}
      <div className="brl-btn-row">
        <button className="brl-btn" onClick={handleToggleListen}>
          {isListening ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
          <span>{isListening ? t.btnPauseListen.replace(/^[⏸▶]\s*/, '') : t.btnStartListen.replace(/^[⏸▶]\s*/, '')}</span>
        </button>
        <button className="brl-btn danger" onClick={handleClearData}>
          <TrashIcon size={12} />
          <span>{t.btnClearData.replace(/^\S+\s*/, '')}</span>
        </button>
      </div>

      {/* 分类打标输入行 */}
      <div className="brl-btn-row">
        <input
          type="text"
          className="brl-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          disabled={isTagActive}
          placeholder={t.inputTagPlaceholder}
          style={{ flex: 1.5 }}
        />
        <button
          className={`brl-btn ${isTagActive ? 'active-tag' : 'primary'}`}
          onClick={handleActionTag}
          style={{ flex: 1 }}
        >
          {isTagActive ? `⏹ ${t.btnEndTag.replace(/^[⏺⏹]\s*/, '')}` : `⏺ ${t.btnStartTag.replace(/^[⏺⏹]\s*/, '')}`}
        </button>
      </div>

      {/* 时序打标运行状态栏 */}
      {isTagActive && (
        <div className="brl-tag-status-bar">
          <div>
            {t.tagStatusBarText} <span>{currentTag}</span>
          </div>
          <div style={{ fontSize: '9px', color: '#60a5fa', animation: 'brl-pulse-anim 1.5s infinite' }}>
            ● RECORDING
          </div>
        </div>
      )}

      {/* 日志时序渲染队列 */}
      <Timeline showToast={showToast} />

      {/* 底部功能性导出栏 */}
      <div className="brl-btn-row">
        <button className="brl-btn" onClick={handleExportTxt}>
          <ExportIcon size={12} />
          <span>{t.btnExportTxt.replace(/^\S+\s*/, '')}</span>
        </button>
        <button className="brl-btn primary" onClick={handleCopyAll}>
          <CopyIcon size={12} />
          <span>{t.btnCopyAll.replace(/^\S+\s*/, '')}</span>
        </button>
      </div>
    </div>
  );
}
