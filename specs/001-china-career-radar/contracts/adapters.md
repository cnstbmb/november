# Adapter Contracts

## SourceAdapter

```ts
type SourceMode =
  | 'public_http'
  | 'email'
  | 'search_discovery'
  | 'manual_url'
  | 'manual_text'
  | 'browser'
  | 'fixture';

interface SourceAdapter {
  readonly sourceId: string;
  readonly mode: SourceMode;
  collect(request: CollectRequest, context: SourceRunContext): AsyncIterable<RawJobInput>;
}

interface DocumentFetcher {
  fetch(request: PolicyApprovedFetchRequest): Promise<FetchedDocument>;
}
```

Adapters MUST NOT call a global HTTP client. `PolicyApprovedFetchRequest` is constructible only after a matching source policy and acquisition mode pass. Fixture and manual-text adapters are transport-free.

## JobAnalyzer

```ts
interface JobAnalyzer {
  readonly provider: 'mock' | 'deepseek';
  readonly model: string;
  analyze(input: AnalyzerInput, context: AnalysisContext): Promise<TrustedJobAnalysis>;
}
```

`AnalyzerInput.profile` is a privacy-safe capability projection and never the stored candidate profile. `TrustedJobAnalysis` exists only after envelope decoding, JSON parsing, strict schema validation, evidence verification, and local policy overlay.

## Notifier

```ts
interface Notifier {
  readonly channel: 'console' | 'telegram';
  notify(card: JobNotificationCard, destination: NotificationDestination): Promise<DeliveryReceipt>;
}
```

Notifier implementations do not query jobs or analyses. They receive a fully formatted trusted card and return a provider receipt. Database delivery uniqueness is established before the external side effect.

## RadarRepository

The application layer depends on a repository contract supporting:

- profile/source synchronization by semantic content hash;
- transactional raw observation + canonical identity + version upsert;
- per-profile hard-filter persistence;
- analysis reservation/completion/failure by stable analysis key;
- delivery reservation/completion;
- feedback/application upsert and global close;
- source-run lifecycle and statistics;
- latest/stats queries for CLI and Telegram.

The in-memory contract double and PostgreSQL implementation MUST pass the same idempotency scenarios.
