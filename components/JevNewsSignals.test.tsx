// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import JevNewsSignals from './JevNewsSignals';
import { evaluateNews } from '../services/jevService';
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ locale: 'zh' }) }));
vi.mock('../services/jevService', async importOriginal => ({ ...(await importOriginal<typeof import('../services/jevService')>()), isJevEnabled: () => true, evaluateNews: vi.fn() }));
const article = { title: 'Example headline', description: 'Text', pubDate: '2026-10-03', sourceName: 'News', link: 'https://news.org/a' };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows uncertainty, safe evidence links and the full-analysis action', async () => {
  vi.mocked(evaluateNews).mockResolvedValue([{ article: { ...article, url: article.link, publishedAt: article.pubDate }, event: 'unknown', importance: null, related: 'unknown', model: 'jev-test' }]);
  const analyze = vi.fn(); render(<JevNewsSignals articles={[article]} onAnalyze={analyze} />);
  fireEvent.click(screen.getByText('识别当前新闻'));
  await screen.findByText('待核实', { exact: false });
  expect(screen.getByText('查看原文').getAttribute('href')).toBe(article.link);
  fireEvent.click(screen.getByText('生成完整分析'));
  expect(analyze).toHaveBeenCalledWith(article.title);
});
it('cancels old scans when the focus changes and ignores late results', async () => {
  let resolve!: (v: Awaited<ReturnType<typeof evaluateNews>>) => void;
  vi.mocked(evaluateNews).mockImplementation(() => new Promise(r => { resolve = r; }));
  render(<JevNewsSignals articles={[article]} onAnalyze={vi.fn()} />);
  fireEvent.click(screen.getByText('识别当前新闻'));
  const signal = vi.mocked(evaluateNews).mock.calls[0][2];
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New focus' } });
  expect(signal?.aborted).toBe(true);
  resolve([{ article, event: 'earnings', importance: 3, related: 'yes', model: 'jev-test' }]);
  await waitFor(() => expect(screen.queryByText(article.title)).toBeNull());
});
