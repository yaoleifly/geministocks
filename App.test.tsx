// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ analyze: vi.fn(), configured: true, t: (key: string) => key }));
vi.mock('./hooks/useI18n', () => ({ useI18n: () => ({ t: mocks.t, locale: 'zh' }) }));
vi.mock('./services/streamingService', () => ({ getAnalysisWithStreaming: mocks.analyze, getPolymarketAnalysis: mocks.analyze }));
vi.mock('./services/apiConfigService', () => ({ isApiConfigured: () => mocks.configured }));
vi.mock('./services/newsService', () => ({ NEWS_SOURCES: [] }));
vi.mock('./components/CacheStats', () => ({ CacheStats: () => null }));
vi.mock('./components/AppHeader', () => ({ default: () => null }));
vi.mock('./components/LatestNews', () => ({ default: () => null }));
vi.mock('./components/MarketThermometer', () => ({ default: () => null }));
vi.mock('./components/TacoMonitor', () => ({ default: () => null }));
vi.mock('./components/AnalysisResult', () => ({ default: ({ userInput }: { userInput: string }) => <div>Report: {userInput}</div> }));
vi.mock('./components/ApiSettingsModal', () => ({ default: () => <div role="dialog">Model setup</div> }));
import App from './App';

const report = { investmentScore: { score: 80 } };
const start = () => { fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AI topic' } }); fireEvent.click(screen.getByRole('button', { name: /analysisInput.button/ })); };
beforeEach(() => { localStorage.clear(); mocks.configured = true; mocks.analyze.mockReset(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('research user journey', () => {
  it('restores draft and keeps results usable when browser storage is full', async () => {
    localStorage.setItem('gemini-analysis-draft', JSON.stringify('Saved idea'));
    mocks.analyze.mockResolvedValue(report);
    render(<App />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Saved idea');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    start();
    await screen.findByText('Report: AI topic');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('stops a request and ignores its late result while a new analysis runs', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveNext!: (value: unknown) => void;
    mocks.analyze.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    mocks.analyze.mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve; }));
    render(<App />); start();
    const signal = mocks.analyze.mock.calls[0][4].signal as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: '停止分析' }));
    expect(signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /analysisInput.button/ }));
    await act(async () => { resolveFirst(report); });
    expect(screen.queryByText('Report: AI topic')).toBeNull();
    expect(screen.getByRole('button', { name: '停止分析' })).toBeTruthy();
    await act(async () => { resolveNext(report); });
    await screen.findByText('Report: AI topic');
  });
  it('preserves input on failure and retries with fresh data', async () => {
    mocks.analyze.mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce(report);
    render(<App />); start();
    const retry = await screen.findByRole('button', { name: '重试分析' });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('AI topic');
    fireEvent.click(retry);
    await screen.findByText('Report: AI topic');
    expect(mocks.analyze.mock.calls[1][4].fresh).toBe(true);
  });
  it('offers setup without losing input or sending an unconfigured request', async () => {
    mocks.configured = false;
    render(<App />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My idea' } });
    fireEvent.click(screen.getByRole('button', { name: /配置模型后开始/ }));
    await screen.findByRole('dialog');
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('My idea');
  });
  it('does not change the displayed report title when editing the next topic', async () => {
    mocks.analyze.mockResolvedValue(report);
    render(<App />); start();
    await screen.findByText('Report: AI topic');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Next topic' } });
    expect(screen.getByText('Report: AI topic')).toBeTruthy();
  });
});

it('undo restores deleted history without removing a newer analysis', async () => {
  localStorage.setItem('gemini-analysis-history', JSON.stringify([{ id: 1, topic: 'Old topic', report }]));
  mocks.analyze.mockResolvedValue(report);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /analysisHistory.title/ }));
  fireEvent.click(screen.getByRole('button', { name: 'analysisHistory.deleteLabel: Old topic' }));
  start();
  await screen.findByText('Report: AI topic');
  fireEvent.click(screen.getByRole('button', { name: '撤销删除' }));
  const stored = JSON.parse(localStorage.getItem('gemini-analysis-history')!);
  expect(stored.map((entry: { topic: string }) => entry.topic)).toEqual(['AI topic', 'Old topic']);
});
