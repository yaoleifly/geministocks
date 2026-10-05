// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ locale: 'zh' }) }));
import WorkspaceNav from './WorkspaceNav';
afterEach(cleanup);
it('focuses the composer without changing the hash-router route', () => {
  render(<><WorkspaceNav busy={false} onSettings={vi.fn()} onNews={vi.fn()} onHistory={vi.fn()} /><textarea id="news-input" /></>);
  const input = screen.getByRole('textbox');
  input.scrollIntoView = vi.fn();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  fireEvent(screen.getByRole('link', { name: '研究工作台' }), event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(input);
});
