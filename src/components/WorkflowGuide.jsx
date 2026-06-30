import React from 'react';
import { useLoggerState } from '../hooks/useLoggerState';
import { i18n } from '../i18n';

export default function WorkflowGuide() {
  const { language } = useLoggerState();
  const t = i18n[language];

  return (
    <div className="brl-settings-card">
      <div className="brl-settings-card-header">
        <span className="brl-settings-card-title">{t.howToUseTitle}</span>
      </div>
      <div style={{ marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
        <div className="brl-timeline">
          <div className="brl-timeline-item">
            <div className="brl-timeline-dot">1</div>
            <div className="brl-timeline-title">{t.step1Title}</div>
            <div className="brl-timeline-desc">{t.step1Desc}</div>
          </div>
          <div className="brl-timeline-item">
            <div className="brl-timeline-dot">2</div>
            <div className="brl-timeline-title">{t.step2Title}</div>
            <div className="brl-timeline-desc">{t.step2Desc}</div>
          </div>
          <div className="brl-timeline-item">
            <div className="brl-timeline-dot">3</div>
            <div className="brl-timeline-title">{t.step3Title}</div>
            <div className="brl-timeline-desc">{t.step3Desc}</div>
          </div>
          <div className="brl-timeline-item">
            <div className="brl-timeline-dot">4</div>
            <div className="brl-timeline-title">{t.step4Title}</div>
            <div className="brl-timeline-desc">{t.step4Desc}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
