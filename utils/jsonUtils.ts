import { jsonrepair } from 'jsonrepair';

/**
 * Extracts the likely JSON part from a string.
 * It looks for the first '{' or '['.
 * If it finds a balanced closing brace, it returns that segment.
 * If the string ends prematurely (truncated), it returns from the start brace to the end of the string,
 * allowing jsonrepair to fix the unclosed structures.
 */
export function extractJson(text: string): string {
    let startIndex = text.indexOf('{');
    const arrayStartIndex = text.indexOf('[');

    // Determine if we are looking for an object or an array
    // We prefer the one that appears first.
    let isObject = true;
    if (arrayStartIndex !== -1 && (startIndex === -1 || arrayStartIndex < startIndex)) {
        startIndex = arrayStartIndex;
        isObject = false;
    }

    if (startIndex === -1) return text; // No JSON start found

    const openChar = isObject ? '{' : '[';
    const closeChar = isObject ? '}' : ']';

    let balance = 0;
    let inString = false;
    let isEscaped = false;
    let endIndex = -1;

    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];

        if (isEscaped) {
            isEscaped = false;
            continue;
        }

        if (char === '\\') {
            isEscaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === openChar) {
                balance++;
            } else if (char === closeChar) {
                balance--;
                if (balance === 0) {
                    endIndex = i;
                    break;
                }
            }
        }
    }

    if (endIndex !== -1) {
        return text.substring(startIndex, endIndex + 1);
    }

    // If we couldn't balance the braces (e.g. truncated output due to max_tokens),
    // we return the substring from the start. `jsonrepair` will handle closing it.
    return text.substring(startIndex);
}

/** Ignore provider reasoning blocks; they are not the final answer. */
export function stripReasoning(text: string): string {
    return text.replace(/^\s*<(think|thinking|analysis)\b[^>]*>[\s\S]*?<\/\1\s*>\s*/i, '').trim();
}

/** Prefer explicit JSON fences and parseable objects over prose brackets. */
export function parseModelJson(content: unknown): any {
    const text = stripReasoning(typeof content === 'string' ? content :
        Array.isArray(content) ? content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n') : '');
    if (!text) throw new Error('Empty model answer');
    const fenced = Array.from(text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi), match => match[1].trim());
    const candidates = [...fenced, text];
    // Commentary such as [analysis] must not mask a valid object later in the answer.
    const objectStart = text.indexOf('{');
    if (objectStart !== -1) candidates.push(extractJson(text.slice(objectStart)));
    candidates.push(extractJson(text));
    for (const candidate of candidates) {
        try {
            const value = JSON.parse(candidate);
            if (value !== null && typeof value === 'object') return value;
        } catch { /* Try the next candidate before repairing malformed JSON. */ }
    }
    for (const candidate of candidates) {
        if (!/^[{[]/.test(candidate)) continue;
        try {
            const value = JSON.parse(jsonrepair(candidate));
            if (value !== null && typeof value === 'object') return value;
        } catch { /* A provider may return prose even when JSON mode was requested. */ }
    }
    throw new Error('Invalid structured model answer');
}
