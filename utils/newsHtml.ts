import DOMPurify from 'dompurify';

/** RSS descriptions are third-party HTML; retain article formatting, never executable content. */
export function sanitizeNewsHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'input', 'button', 'iframe', 'video', 'audio'],
    FORBID_ATTR: ['style'],
  });
}
