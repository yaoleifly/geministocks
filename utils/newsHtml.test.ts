// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeNewsHtml } from './newsHtml';
describe('news article HTML', () => {
  it('preserves readable article formatting', () => {
    expect(sanitizeNewsHtml('<p>News <strong>detail</strong></p><a href="https://example.com/story">Source</a>')).toContain('<strong>detail</strong>');
  });
  it('removes scripts, event handlers, unsafe URLs and overlay styling', () => {
    const cleaned = sanitizeNewsHtml('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">click</a><p style="position:fixed">text</p><iframe src="https://example.com"></iframe>');
    expect(cleaned).not.toMatch(/script|onerror|javascript:|style=|iframe/i);
    expect(cleaned).toContain('text');
  });
});
