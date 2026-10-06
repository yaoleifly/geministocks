import React from 'react';
import { ResearchIcon } from './icons/ResearchIcons';
import { useI18n } from '../hooks/useI18n';

export default function WorkspaceNav({ onSettings, onNews, onHistory, busy }: { busy: boolean; onSettings: () => void; onNews: () => void; onHistory: () => void }) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const focusResearch = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const input = document.getElementById('news-input');
    input?.scrollIntoView({ block: 'center' });
    input?.focus({ preventScroll: true });
  };
  return <aside className="workspace-nav">
    <a className="workspace-brand" href="#news-input" onClick={focusResearch}><ResearchIcon name="brand"/><span>{zh ? '挖掘机' : 'Mastersgo'}<small>MASTERSGO</small></span></a>
    <nav aria-label={zh ? '研究导航' : 'Research navigation'}>
      <a className="nav-primary" href="#news-input" onClick={focusResearch}><ResearchIcon name="research"/>{zh ? '研究工作台' : 'Workspace'}</a>
      <button disabled={busy} onClick={onNews}><ResearchIcon name="radar"/>{zh ? '热点线索' : 'News signals'}</button>
      <a href={window.location.hostname === 'super-digger-linked-preview.mastergo.workers.dev' ? 'https://stocks-design-preview.mastergo.workers.dev' : 'https://stocks.mastersgo.cc'} target="_blank" rel="noopener noreferrer"><ResearchIcon name="map"/>{zh ? '产业图谱' : 'Industry map'}<span className="ml-auto text-xs">↗</span></a>
      <button disabled={busy} onClick={onHistory}><ResearchIcon name="history"/>{zh ? '研究记录' : 'Research history'}</button>
    </nav>
    <button className="nav-settings" onClick={onSettings}><ResearchIcon name="settings"/>{zh ? '模型设置' : 'Model settings'}</button>
  </aside>;
}
