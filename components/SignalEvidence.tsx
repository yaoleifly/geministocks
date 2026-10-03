import React from 'react';
import { useI18n } from '../hooks/useI18n';
import { safeSourceUrl } from '../services/jevService';
import type { SignalEvidence as Evidence, ScanMetadata } from '../services/jevIndicatorService';
export function ScanEngine({ scan }: { scan: ScanMetadata }) {
  const { locale } = useI18n();
  if (!scan.engine) return null;
  return <p className="text-xs text-stone-500 mb-3">{scan.engine === 'jev'
    ? (locale === 'zh' ? `Jev · ${scan.model} · 实验性新闻信号密度，非涨跌概率；与原模型评分口径不同。` : `Jev · ${scan.model} · Experimental news-signal prevalence, not a return probability; differs from main-model scoring.`)
    : (locale === 'zh' ? 'Jev 接口未成功，本次已使用主模型。' : 'Jev was unavailable; this scan used the main model.')}</p>;
}
export default function SignalEvidence({ signal }: { signal: Evidence }) {
  return <ul className="mt-1 space-y-1">{signal.sources?.map((source, i) => {
    const url = safeSourceUrl(source.url);
    return <li key={`${source.url}-${i}`} className="text-xs text-stone-600">{url ? <a className="underline underline-offset-2" href={url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}{source.publishedAt && <span className="ml-2 text-stone-400">{source.publishedAt.slice(0, 10)}</span>}</li>;
  })}</ul>;
}
