import { describe, it, expect } from 'vitest';
import { extractJson, parseModelJson } from './jsonUtils';

describe('extractJson', () => {
  it('returns plain JSON object unchanged', () => {
    const input = '{"a": 1, "b": "x"}';
    expect(extractJson(input)).toBe(input);
  });

  it('strips markdown code fences around JSON', () => {
    const input = '```json\n{"score": 85, "reason": "strong"}\n```';
    expect(extractJson(input)).toBe('{"score": 85, "reason": "strong"}');
  });

  it('strips leading prose before the JSON object', () => {
    const input = 'Here is the analysis you requested:\n\n{"summary": "ok"}';
    expect(extractJson(input)).toBe('{"summary": "ok"}');
  });

  it('extracts arrays when the array appears first', () => {
    const input = 'Result: [1, 2, 3] trailing text';
    expect(extractJson(input)).toBe('[1, 2, 3]');
  });

  it('handles nested objects and keeps balance', () => {
    const inner = '{"a": {"b": {"c": [1, {"d": 2}]}}}';
    expect(extractJson(`prefix ${inner} suffix`)).toBe(inner);
  });

  it('ignores braces inside string values', () => {
    const inner = '{"text": "a } tricky { value", "n": 1}';
    expect(extractJson(`x ${inner} y`)).toBe(inner);
  });

  it('ignores escaped quotes inside strings', () => {
    const inner = '{"text": "he said \\"hi }\\" ok", "n": 2}';
    expect(extractJson(inner)).toBe(inner);
  });

  it('returns from start brace to end for truncated JSON (repair downstream)', () => {
    const input = 'blah {"a": 1, "b": [1, 2';
    expect(extractJson(input)).toBe('{"a": 1, "b": [1, 2');
  });

  it('returns input unchanged when no JSON start is found', () => {
    const input = 'no json here at all';
    expect(extractJson(input)).toBe(input);
  });
});


describe('structured model answers', () => {
  it('ignores reasoning JSON and commentary brackets before a fenced final answer', () => {
    expect(parseModelJson('<think>{"draft":true} [planning]</think>\n[analysis]\n```json\n{"summary":"final"}\n```')).toEqual({ summary: 'final' });
  });
  it('does not mistake a prose label for the final report', () => {
    expect(parseModelJson('[report] Here is the result: {"summary":"ok"}')).toEqual({ summary: 'ok' });
  });
  it('supports OpenAI text content blocks without using reasoning blocks', () => {
    expect(parseModelJson([{ type: 'reasoning', text: '{"draft":true}' }, { type: 'text', text: '{"summary":"ok"}' }])).toEqual({ summary: 'ok' });
  });
  it('preserves literal thinking tags within report strings', () => {
    expect(parseModelJson('{"summary":"literal <think>example</think>"}')).toEqual({ summary: 'literal <think>example</think>' });
  });
  it('rejects prose instead of treating it as a report', () => {
    expect(() => parseModelJson('Sorry, I cannot produce a report.')).toThrow();
  });
});
