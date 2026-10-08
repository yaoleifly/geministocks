// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getApiConfig, saveApiConfig, getChatCompletionsUrl } from '../services/apiConfigService';
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ locale: 'zh' }) }));
vi.mock('./JevSettings', () => ({ default: () => null }));
import ApiSettingsModal from './ApiSettingsModal';
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('saves Monk with only a key and routes completion requests through the existing proxy', () => {
  saveApiConfig({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'old-key', model: 'deepseek-chat' });
  render(<ApiSettingsModal isOpen onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Monk' }));
  expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('monk');
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'monk-test-key' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  const config = getApiConfig()!;
  expect(config).toEqual({ baseUrl: 'https://monk.party/v1', apiKey: 'monk-test-key', model: 'monk' });
  expect(getChatCompletionsUrl(config)).toBe(`/api/cors-proxy?target=${encodeURIComponent('https://monk.party/v1/chat/completions')}`);
});
it('restores a saved Monk model and avoids carrying it into another provider', () => {
  saveApiConfig({ baseUrl: 'https://monk.party/v1', apiKey: 'monk-test-key', model: 'monk-fast' });
  render(<ApiSettingsModal isOpen onClose={vi.fn()} />);
  expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('monk-fast');
  fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }));
  expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('');
});
