# Jev fast signals (experimental)

Scope: optional, user-funded TypeSafe adapter for news cards and the existing sentiment/TACO indicators. Off by default. Full reports and free-form concept extraction still use the existing main model.

## Use

Open model settings → Jev fast signals. Enter a TypeSafe API key, test the connection, enable and save the separate Jev settings. A connection test makes one small paid provider request. Keys are stored in browser localStorage, forwarded by the same-origin Worker to TypeSafe and are not persisted by the Worker. Never put keys in Git, VITE variables or screenshots.

The news panel evaluates up to eight currently displayed summaries on demand. An optional company/topic enables explicit-relevance classification. It does not infer ticker mappings, discover a watchlist, detect historical novelty or generate buy/sell recommendations. Original links let users verify context.

Indicator scans use up to 32 unique headlines with known publication dates within seven days. They preserve supporting URLs and publication dates. For each article and each existing signal, Jev chooses present / absent / unknown. Confidence below 0.6 is treated as unknown. Every signal requires at least three assessable articles and at least 50% window coverage. Otherwise no new indicator/history point is written and the UI retains prior results with an error. This is a conservative engineering threshold, not a calibrated accuracy claim.

Strength is `100 * present / (present + absent)`. Unknowns are excluded, never treated as absent. The thermometer's news score is the equal-weight mean of its five strengths; existing gauge math then applies. This experimental news prevalence is NOT a stock probability or directly comparable with the previous model's holistic score. Jev history uses separate `*-history-jev-v1` storage keys. Title deduplication is not semantic event clustering: syndicated reports may still overrepresent a story.

Fallback to the user's main model is off by default. When explicitly enabled, transport/response failures can use the configured main model, with a visible fallback label. Insufficient evidence never triggers automatic fallback. The original provider behavior is unchanged when Jev is off.

## Implementation

- `services/jevService.ts`: config, HTTP adapter, strict answer checks, abort/20-second timeout, 10-minute bounded memory cache, news questions.
- `services/jevIndicatorService.ts`: focused per-article questions, freshness filter, evidence aggregation.
- `worker/index.ts`: POST `/api/jev/evaluate`, fixed TypeSafe destination, required user key, same-origin gate, 200 KB body cap, 160-question cap, existing rate limiting and redirect rejection. No shared paid key or public funded endpoint.
- `components/JevSettings.tsx`, `JevNewsSignals.tsx`, `SignalEvidence.tsx`: bilingual settings, opt-in cards, source links and engine labels.
- Vite forwards the same route in development. Use `pnpm dev:cloudflare` to exercise production validation locally.

API contract: https://docs.typesafe.ai/introduction/quickstart
Question semantics: https://docs.typesafe.ai/primitives
Confidence semantics: https://docs.typesafe.ai/confidence

## Validation and rollout

Automated tests cover malformed responses, unknown values, absent dates, cancellations, explicit fallback, fixed upstream routing, credential requirements and payload caps. Node versions exposing experimental global Web Storage need `NODE_OPTIONS=--no-experimental-webstorage pnpm test` for happy-dom tests.

Live provider performance and accuracy remain unverified until a real TypeSafe key is configured. Before broad adoption, label 200–500 representative Chinese/English articles with event type and signal presence/absence/insufficient evidence; group related events before train/evaluation time splits to prevent syndicated-news leakage. Compare against the main-model baseline: per-signal precision/recall, abstention and coverage rates, p50/p95 end-to-end latency and actual token cost. Tune thresholds on a development subset, then report on the held-out subset. Do not translate confidence into a claimed correctness percentage.

Deployment should begin with a separate preview Worker. Review and verify with the user's TypeSafe account before merging to production. Cron-based monitoring, D1 persistence, shared billing and automatic trading are outside this release.
