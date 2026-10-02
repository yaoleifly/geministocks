# Research experience improvements

The homepage now puts the core journey first: write an idea, configure a model if needed, run the analysis, and recover from failures without losing input.

- Drafts restore from browser storage; unavailable storage does not discard a successful report. Draft-saving status reflects the actual storage result.
- Sample topics, an accessible input label and Ctrl/Cmd+Enter help users start. Mobile controls have larger touch targets.
- Progress counts completed model requests rather than simulating streaming or time-based percentages. Elapsed time and a slow-response hint explain the wait.
- Stop aborts model requests and search requests, cancels retry waits and ignores late responses. Providers may still process or charge for requests already accepted.
- Retry uses fresh data; history reanalysis bypasses cache. Cache keys separate languages, model endpoints/model names and search modes.
- Editing a new topic does not rename the current report. A failed new analysis lets users return to the previous report.
- History is accessible near the input and while reading a report. Removal can be undone without losing analyses completed after removal.
- News appears before the market indicator panels. Failed feeds have a reload action, and late responses cannot overwrite a newly selected source.
- RSS descriptions are sanitized with DOMPurify before display, preserving article formatting and removing executable content and inline styling.
- Settings, user-guide and news-detail dialogs support Escape, focus trapping and focus restoration. Mobile navigation includes help and language controls.
- Tailwind CSS is generated at build time rather than fetched/compiled from a third-party CDN. Translations load with the application. Reduced-motion preferences are respected.

## Verification

Run:

```sh
pnpm typecheck
NODE_OPTIONS=--no-experimental-webstorage pnpm test
pnpm build
```

The Node option avoids Node 26's experimental storage implementation interfering with browser-environment tests. Browser-dependent tests provide their own storage.

Integration tests cover restoring drafts, storage quota failures, cancellation and late responses, failure/retry, configuration gating, stable report titles, undo after a new analysis, model cancellation and real completion counts, cache isolation/fresh requests, and HTML sanitization. Sanitization tests use jsdom, the environment supported by DOMPurify; other existing component tests use happy-dom.

Preview: https://super-digger-ux-preview.mastergo.workers.dev/

The preview uses a separate Worker with no production domain routes. Model-provider requests are tested with controlled responses, without spending user API credits. Live browser verification covers homepage/news rendering, draft restoration, setup/keyboard flows, language switching and mobile layout. Full paid-model report generation needs a user-configured provider and remains unverified in the live preview.
