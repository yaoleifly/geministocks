import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import type { NewsArticle } from '../services/newsService';
import { EVENT_TYPES, evaluateNews, isJevEnabled, jevErrorMessage, safeSourceUrl, type NewsSignal } from '../services/jevService';

export default function JevNewsSignals({ articles, onAnalyze }: { articles: NewsArticle[]; onAnalyze: (topic: string) => void }) {
  const { locale } = useI18n(); const zh = locale === 'zh';
  const [enabled, setEnabled] = useState(isJevEnabled);
  const [topic, setTopic] = useState(''); const [results, setResults] = useState<NewsSignal[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const update = () => { controller.current?.abort(); setBusy(false); setResults([]); setEnabled(isJevEnabled()); };
    window.addEventListener('jev-config-change', update); window.addEventListener('storage', update);
    return () => { window.removeEventListener('jev-config-change', update); window.removeEventListener('storage', update); controller.current?.abort(); };
  }, []);
  useEffect(() => { controller.current?.abort(); setResults([]); setError(''); setBusy(false); }, [articles, topic]);
  async function scan() {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true); setError('');
    try {
      const data = await evaluateNews(articles.map(a => ({ ...a, url: a.link, publishedAt: a.pubDate })), topic, current.signal);
      if (!current.signal.aborted) setResults(data);
    } catch (e) { if (!current.signal.aborted) setError(jevErrorMessage(e, zh)); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  if (!enabled) return null;
  return <section className="mb-5 rounded-xl border border-stone-200 bg-stone-50 p-4" aria-label={zh ? '新闻快速信号' : 'Fast news signals'}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{zh ? '新闻快速信号' : 'Fast news signals'} <span className="text-xs text-stone-500">Jev · Beta</span></h4>
      <button type="button" disabled={busy || !articles.length} onClick={scan} className="rounded-lg bg-black px-3 py-2 text-xs text-white disabled:opacity-40">{busy ? (zh ? '识别中…' : 'Evaluating…') : (zh ? '识别当前新闻' : 'Evaluate current news')}</button></div>
    <label className="mt-3 block text-xs text-stone-600">{zh ? '关注公司或主题（可选）' : 'Company or topic of interest (optional)'}<input maxLength={120} value={topic} onChange={e => setTopic(e.target.value)} placeholder={zh ? '例如：英伟达、半导体设备' : 'e.g. NVIDIA, semiconductor equipment'} className="mt-1 w-full rounded-lg border border-stone-200 bg-white p-2 text-sm" /></label>
    <p className="mt-2 text-xs text-stone-500">{zh ? '每次最多 8 条，按当前摘要判断；不确定时不评分。完整报告仍使用主模型。' : 'Up to 8 current summaries per scan. Uncertain items remain unrated. Full reports use your main model.'}</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    <div aria-live="polite" aria-busy={busy} className="mt-3 space-y-3">{results.map((r, i) => {
      const url = safeSourceUrl(r.article.url);
      const level = r.importance == null ? (zh ? '待核实' : 'Unrated') : [zh ? '一般' : 'Routine', zh ? '有限影响' : 'Limited', zh ? '重要' : 'Material', zh ? '广泛影响' : 'Broad impact'][Math.round(r.importance)];
      return <article key={i} className="rounded-lg border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap gap-2 text-xs text-stone-600"><span>{EVENT_TYPES[r.event][zh ? 0 : 1]}</span><span>· {level}</span>{topic && <span>· {r.related === 'yes' ? (zh ? '直接相关' : 'Directly related') : r.related === 'no' ? (zh ? '未发现直接关联' : 'No direct link found') : (zh ? '关联待核实' : 'Relation uncertain')}</span>}</div>
        <p className="mt-2 text-sm font-medium">{r.article.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-500"><span>{r.article.sourceName} · {r.article.publishedAt?.slice(0, 10) || (zh ? '时间未知' : 'Date unknown')}</span>{url && <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{zh ? '查看原文' : 'Source'}</a>}<button type="button" onClick={() => onAnalyze(r.article.title)} className="font-medium text-black underline">{zh ? '生成完整分析' : 'Full analysis'}</button></div>
      </article>;
    })}</div>
  </section>;
}
