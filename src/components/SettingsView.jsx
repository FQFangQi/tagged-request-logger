import React, { useState } from 'react';
import { useLoggerState } from '../hooks/useLoggerState';
import { i18n } from '../i18n';
import { state } from '../state';
import WorkflowGuide from './WorkflowGuide';

export default function SettingsView({ onBack, showToast }) {
  const {
    language,
    version,
    includeHeaders,
    headersKeepPattern,
    headersExcludePattern,
    includeClicks,
    clickIncludeUrl,
    clickIncludeClass,
    includeErrors,
    includeConsole,
    consoleLevels
  } = useLoggerState();

  const t = i18n[language];

  // 检查更新本地状态
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateColor, setUpdateColor] = useState('#93c5fd');
  const [showDownloadBtn, setShowDownloadBtn] = useState(false);

  const handleUpdateCheck = async () => {
    setUpdateStatus(t.updateChecking);
    setUpdateColor('#93c5fd');
    setShowDownloadBtn(false);

    try {
      const res = await fetch('https://raw.githubusercontent.com/FQFangQi/tagged-request-logger/main/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Fetch status error');

      const data = await res.json();
      const onlineVersion = data.version;
      const localVersion = version;

      if (onlineVersion !== localVersion) {
        setUpdateColor('#f87171');
        setUpdateStatus(`${t.updateAvailable} (v${localVersion} -> v${onlineVersion})`);
        setShowDownloadBtn(true);
      } else {
        setUpdateColor('#34d399');
        setUpdateStatus(t.updateLatest);
      }
    } catch (err) {
      console.warn('[RequestLogger] Update check blocked:', err);
      setUpdateColor('#fbbf24');
      setUpdateStatus(t.updateErr);
      setShowDownloadBtn(true);
    }
  };

  return (
    <div id="brl-view-settings">

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
        
        {/* 卡片 1: Headers 调试开关 & 配置 */}
        <div className="brl-settings-card">
          <div className="brl-settings-card-header">
            <span className="brl-settings-card-title">{t.headersTitle}</span>
            <label className="brl-switch">
              <input 
                type="checkbox" 
                checked={includeHeaders} 
                onChange={(e) => {
                  state.update(s => { s.includeHeaders = e.target.checked; });
                  localStorage.setItem('__trl_headers', e.target.checked ? 'true' : 'false');
                }}
              />
              <span className="brl-slider"></span>
            </label>
          </div>
          
          {includeHeaders && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              <div className="brl-field-group">
                <div className="brl-label" style={{ color: '#34d399' }}>{t.keepHeadersLabel}</div>
                <input 
                  type="text" 
                  className="brl-input" 
                  value={headersKeepPattern} 
                  onChange={(e) => {
                    state.update(s => { s.headersKeepPattern = e.target.value; });
                    localStorage.setItem('__trl_headers_keep', e.target.value);
                  }}
                  placeholder={t.keepHeadersPlaceholder} 
                />
              </div>
              <div className="brl-field-group">
                <div className="brl-label" style={{ color: '#f87171' }}>{t.excludeHeadersLabel}</div>
                <input 
                  type="text" 
                  className="brl-input" 
                  value={headersExcludePattern} 
                  onChange={(e) => {
                    state.update(s => { s.headersExcludePattern = e.target.value; });
                    localStorage.setItem('__trl_headers_exclude', e.target.value);
                  }}
                  placeholder={t.excludeHeadersPlaceholder} 
                />
              </div>
            </div>
          )}
        </div>

        {/* 卡片 2: 点击交互配置 */}
        <div className="brl-settings-card">
          <div className="brl-settings-card-header">
            <span className="brl-settings-card-title">{t.clicksTitle}</span>
            <label className="brl-switch">
              <input 
                type="checkbox" 
                checked={includeClicks} 
                onChange={(e) => {
                  state.update(s => { s.includeClicks = e.target.checked; });
                  localStorage.setItem('__trl_clicks', e.target.checked ? 'true' : 'false');
                }}
              />
              <span className="brl-slider"></span>
            </label>
          </div>

          {includeClicks && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              <label className="brl-custom-cb">
                <input 
                  type="checkbox" 
                  checked={clickIncludeUrl} 
                  onChange={(e) => {
                    state.update(s => { s.clickIncludeUrl = e.target.checked; });
                    localStorage.setItem('__trl_click_url', e.target.checked ? 'true' : 'false');
                  }}
                />
                <span className="brl-checkbox-box"></span>
                <span style={{ color: '#93c5fd', fontWeight: 500 }}>{t.clicksUrlLabel}</span>
              </label>
              <label className="brl-custom-cb">
                <input 
                  type="checkbox" 
                  checked={clickIncludeClass} 
                  onChange={(e) => {
                    state.update(s => { s.clickIncludeClass = e.target.checked; });
                    localStorage.setItem('__trl_click_class', e.target.checked ? 'true' : 'false');
                  }}
                />
                <span className="brl-checkbox-box"></span>
                <span style={{ color: '#fbbf24', fontWeight: 500 }}>{t.clicksClassLabel}</span>
              </label>
            </div>
          )}
        </div>

        {/* 卡片 3: 异常与控制台日志追踪 */}
        <div className="brl-settings-card">
          <div className="brl-settings-card-header">
            <span className="brl-settings-card-title">{t.errorsTitle}</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
            <label className="brl-custom-cb">
              <input 
                type="checkbox" 
                checked={includeErrors} 
                onChange={(e) => {
                  state.update(s => { s.includeErrors = e.target.checked; });
                  localStorage.setItem('__trl_errors', e.target.checked ? 'true' : 'false');
                }}
              />
              <span className="brl-checkbox-box"></span>
              <span style={{ color: '#f87171', fontWeight: 500 }}>{t.errorsLabel}</span>
            </label>
            
            <label className="brl-custom-cb" style={{ marginTop: '4px' }}>
              <input 
                type="checkbox" 
                checked={includeConsole} 
                onChange={(e) => {
                  state.update(s => { s.includeConsole = e.target.checked; });
                  localStorage.setItem('__trl_console', e.target.checked ? 'true' : 'false');
                }}
              />
              <span className="brl-checkbox-box"></span>
              <span style={{ color: '#93c5fd', fontWeight: 500 }}>{t.consoleLabel}</span>
            </label>
            
            {includeConsole && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '20px', borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: '10px' }}>
                {['error', 'warn', 'info', 'log'].map(lvl => {
                  let lvlColor = '#ccc';
                  let badge = '⚪';
                  if (lvl === 'error') { lvlColor = '#ef4444'; badge = '🔴'; }
                  else if (lvl === 'warn') { lvlColor = '#fbbf24'; badge = '🟡'; }
                  else if (lvl === 'info') { lvlColor = '#60a5fa'; badge = '🔵'; }

                  return (
                    <label key={lvl} className="brl-custom-cb">
                      <input 
                        type="checkbox" 
                        checked={consoleLevels[lvl]} 
                        onChange={(e) => {
                          state.update(s => { s.consoleLevels[lvl] = e.target.checked; });
                          localStorage.setItem('__trl_console_levels', JSON.stringify({ ...consoleLevels, [lvl]: e.target.checked }));
                        }}
                      />
                      <span className="brl-checkbox-box"></span>
                      <span style={{ color: lvlColor, fontSize: '11px' }}>{lvl.charAt(0).toUpperCase() + lvl.slice(1)} {badge}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 卡片 4: 语言设置 */}
        <div className="brl-settings-card">
          <div className="brl-settings-card-header">
            <span className="brl-settings-card-title">{t.languageTitle}</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
            <div className="brl-field-group">
              <div className="brl-label">{t.languageLabel}</div>
              <select 
                className="brl-input" 
                value={language} 
                onChange={(e) => {
                  state.update(s => { s.language = e.target.value; });
                  localStorage.setItem('__trl_lang', e.target.value);
                }}
                style={{ background: 'rgba(20, 20, 20, 0.85)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.15)', cursor: 'pointer', padding: '4px 6px' }}
              >
                <option value="en">English</option>
                <option value="zh">中文 (Chinese)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 卡片 5: 使用说明 */}
        <WorkflowGuide />

        {/* 卡片 6: 版本与更新 */}
        <div className="brl-settings-card">
          <div className="brl-settings-card-header">
            <span className="brl-settings-card-title">{t.versionTitle}</span>
            <span style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace' }}>v{version}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: '#aaa' }}>{t.currentVersionLabel}: v{version}</span>
              <button 
                className="brl-btn" 
                onClick={handleUpdateCheck}
                style={{ padding: '4px 8px', fontSize: '10px', width: 'auto', background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#93c5fd' }}
              >
                {t.btnCheckUpdate}
              </button>
            </div>
            {updateStatus && (
              <div style={{ fontSize: '10px', lineHeight: 1.4, color: updateColor }}>
                {updateStatus}
              </div>
            )}
            {showDownloadBtn && (
              <button 
                className="brl-btn primary" 
                onClick={() => window.open('https://github.com/FQFangQi/tagged-request-logger/archive/refs/heads/main.zip', '_blank')}
                style={{ padding: '6px', fontSize: '10px', width: '100%' }}
              >
                {t.btnGetLatestZip}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
