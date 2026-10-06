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
vi.mock('./components/ApiSettingsModal', () => ({ default: ({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) => <div role="dialog"><button onClick={() => { mocks.configured = true; onSaved(); }}>Save model</button><button onClick={onClose}>Close setup</button></div> }));
import App from './App';

const report = { investmentScore: { score: 80 } };
const start = () => { fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AI topic' } }); fireEvent.click(screen.getByRole('button', { name: /analysisInput.button/ })); };
beforeEach(() => { window.location.hash = ''; localStorage.clear(); mocks.configured = true; mocks.analyze.mockReset(); window.scrollTo = vi.fn(); });
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
    fireEvent.click(screen.getByRole('button', { name: /配置并开始/ }));
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


it('opens an example without a model call or a history entry', () => {
  mocks.configured = false;
  render(<App />);
  fireEvent.click(screen.getByRole('button', {name: '查看示例报告 · 无需配置'}));
  expect(screen.getByRole('article', {name: '示例研究报告'})).toBeTruthy();
  expect(mocks.analyze).not.toHaveBeenCalled();
  expect(localStorage.getItem('gemini-analysis-history')).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: '用这个方向开始研究'}));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('AI 数据中心');
  expect(mocks.analyze).not.toHaveBeenCalled();
});
it('resumes exactly the submitted topic after setup is saved', async () => {
  mocks.configured = false;
  mocks.analyze.mockResolvedValue(report);
  render(<App />);
  fireEvent.change(screen.getByRole('textbox'), {target:{value:'Saved topic'}});
  fireEvent.click(screen.getByRole('button', {name:'配置并开始'}));
  fireEvent.click(await screen.findByRole('button', {name:'Save model'}));
  await screen.findByText('Report: Saved topic');
  expect(mocks.analyze).toHaveBeenCalledTimes(1);
});
it('cancelling setup preserves the draft and never starts analysis', async () => {
  mocks.configured = false;
  render(<App />);
  fireEvent.change(screen.getByRole('textbox'), {target:{value:'Keep this'}});
  fireEvent.click(screen.getByRole('button', {name:'配置并开始'}));
  fireEvent.click(await screen.findByRole('button', {name:'Close setup'}));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this');
  expect(mocks.analyze).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'配置并开始'}));
  expect(await screen.findByRole('dialog')).toBeTruthy();
});

it('continues company research after setup while preserving the original draft', async () => {
  mocks.configured = false;
  mocks.analyze.mockResolvedValue(report);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '公司研究' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'NVDA' } });
  fireEvent.click(screen.getByRole('button', { name: '配置并开始' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save model' }));
  await screen.findByText(/Report: 研究以下公司/);
  expect(mocks.analyze.mock.calls[0][0]).toContain('财务状况与风险');
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('NVDA');
});

it('requires explicit draft import and never automatically analyzes a stock handoff', async () => {
  const context = {ticker:'NVDA',company:'英伟达',theme:'算力',question:'核对订单',preview:true};
  window.location.hash = '/?stock=' + encodeURIComponent(JSON.stringify(context));
  localStorage.setItem('gemini-analysis-draft', JSON.stringify('Original draft'));
  render(<App />);
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Original draft');
  expect(mocks.analyze).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'载入研究草稿'}));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('核对订单');
  expect(mocks.analyze).not.toHaveBeenCalled();
  window.location.hash = '';
});


it('stores stock context and reopens the saved report from its return link without another model call', async () => {
  const context = {ticker:'NVDA',company:'英伟达',theme:'算力',question:'核对订单',preview:true};
  window.location.hash = '/?stock=' + encodeURIComponent(JSON.stringify(context));
  mocks.analyze.mockResolvedValue(report);
  const view = render(<App />);
  fireEvent.click(screen.getByRole('button', {name:'载入研究草稿'}));
  fireEvent.click(screen.getByRole('button', {name:/analysisInput.button/}));
  const link = await screen.findByRole('link', {name:'关联报告并返回股票池 ↗'});
  const returned = new URL(link.getAttribute('href')!);
  expect(returned.origin).toBe('https://stocks-design-preview.mastergo.workers.dev');
  const metadata = JSON.parse(decodeURIComponent(returned.hash.slice(10)));
  expect(metadata.ticker).toBe('NVDA');
  const saved = JSON.parse(localStorage.getItem('gemini-analysis-history')!)[0];
  expect(saved.stockContext).toEqual(context);
  expect(metadata.reportId).toBe(saved.id);
  view.unmount();
  window.location.hash = '/?report=' + saved.id;
  render(<App />);
  await screen.findByText(/Report: 研究 英伟达/);
  expect(mocks.analyze).toHaveBeenCalledTimes(1);
});

it('handles a missing report and corrupted saved history safely', () => {
  localStorage.setItem('gemini-analysis-history', JSON.stringify([null]));
  window.location.hash = '/?report=123';
  render(<App />);
  expect(screen.getByText(/此浏览器找不到该报告/)).toBeTruthy();
  expect(mocks.analyze).not.toHaveBeenCalled();
});
