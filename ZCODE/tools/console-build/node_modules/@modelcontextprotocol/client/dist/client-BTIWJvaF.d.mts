import { An as ListResourceTemplatesRequest, Bn as LoggingLevel, Ct as CompleteResult, E as Transport, En as ListChangedHandlers, Er as RequestMethod, Gt as GetPromptRequest, Mn as ListResourcesRequest, Nn as ListResourcesResult, Oi as UnsubscribeRequest, On as ListPromptsRequest, P as StandardSchemaV1, Pt as DiscoverResult, Qn as NotificationMethod, Rn as ListToolsRequest, Rr as Result, Ut as EmptyResult, Wn as MessageExtraInfo, _r as ReadResourceRequest, bn as JSONRPCRequest, f as BaseContext, h as NonCompleteResultFlow, i as ProtocolEra, jn as ListResourceTemplatesResult, kn as ListPromptsResult, lt as CallToolResult, mt as ClientCapabilities, n as InputRequiredOptions, nn as Implementation, p as ClientContext, qr as ServerCapabilities, qt as GetPromptResult, ri as SubscriptionFilter, st as CallToolRequest, ti as SubscribeRequest, v as Protocol, x as RequestOptions, xi as Tool, xn as JSONRPCResponse, y as ProtocolOptions, yn as JSONRPCNotification, yr as ReadResourceResult, yt as CompleteRequest, zn as ListToolsResult } from "./index-BCNZS4Ap.mjs";
import { i as jsonSchemaValidator } from "./types-CBjss2rA.mjs";

//#region src/client/probeClassifier.d.ts

/**
 * A cached era verdict for `connect({ prior })` — the persistable subset of
 * the {@linkcode ProbeVerdict} vocabulary (`'modern'` = speaks 2026-07-28+,
 * `'legacy'` = 2025-era `initialize` only). Freshness is the supplying host's
 * responsibility: a stale modern verdict fails loudly at the first request,
 * but a stale legacy verdict succeeds silently forever (an upgraded server
 * still answers `initialize`) — date cached legacy verdicts in your own
 * storage and stop supplying them past your policy horizon. Full recipe:
 * the gateway guide (`docs/advanced/gateway.md`).
 */
type PriorDiscovery = /** Adopt `discover` directly: zero round trips. */
{
  kind: 'modern';
  discover: DiscoverResult;
}
/** Known-legacy server: skip the `server/discover` probe and run the plain legacy `initialize` handshake. */ | {
  kind: 'legacy';
};
//#endregion
//#region src/client/responseCache.d.ts
/**
 * Client-side response cache for SEP-2549 (`CacheableResult`) freshness hints.
 *
 * The store is a dumb keyed-value carrier: every freshness, scope and
 * invalidation decision lives in the {@linkcode ClientResponseCache} (the
 * `Client`'s single cache-coordination collaborator). The `stamp` field is
 * mcp.d's re-derivation key — a derived view (e.g. the `name → Tool` index)
 * re-computes only when the backing entry's stamp changes.
 *
 * Reference design: mcp.d `client/cache.d` / `client/client.d` (`CacheStore`,
 * `cachedTool`, `cachedFetch`, `invalidateLogical`).
 */
/** A value or a promise of one. The store interface is async-ready; the in-memory default returns plain values. */
type MaybePromise<T> = T | Promise<T>;
/** The freshness scope of a cached entry (SEP-2549 `cacheHints.scope`). */
type CacheScope = 'public' | 'private';
/**
 * Per-call cache disposition for the cacheable verbs (`listTools()` /
 * `listPrompts()` / `listResources()` / `listResourceTemplates()` /
 * `readResource()`):
 *
 * - `'use'` (the default) — serve a still-fresh cached entry without a round
 *   trip; on miss/stale, fetch and write.
 * - `'refresh'` — always fetch (ignore any held entry) and write the fresh
 *   result.
 * - `'bypass'` — fetch without consulting OR writing the cache (the result is
 *   not stored). The `tools/list`-derived index (mirroring / output
 *   validation) is therefore unaffected by a `'bypass'` call.
 */
type CacheMode = 'use' | 'refresh' | 'bypass';
/**
 * A logical cache address. `params` is the canonical result-affecting params
 * key (`''` for the four list ops, the `uri` for `resources/read`); omitted is
 * equivalent to `''`. `partition` namespaces the entry by connected-server
 * identity AND per-principal scope: the `Client` writes a JSON-encoded
 * `[serverIdentity, principal]` pair (so a server-controlled `serverInfo`
 * string cannot bleed into the principal slot regardless of what characters
 * it contains). A `'public'`-scoped entry lives at `[serverIdentity, '']`; a
 * `'private'`-scoped entry at `[serverIdentity, cachePartition]`. Omitted is
 * equivalent to `''`.
 */
interface CacheKey {
  readonly method: string;
  readonly params?: string;
  readonly partition?: string;
}
/**
 * One cached response body. `value` is the JSON-serialized result document —
 * a store is a dumb string carrier and persists it verbatim; the cache owns
 * both codec halves. `stamp` is the store-generated monotonically increasing write counter —
 * opaque to callers. Derived views (e.g. a `name → Tool` index) memoize
 * against it and re-derive only when it changes. `expiresAt` (absolute ms
 * epoch, `now + ttlMs`) and `scope` are the client-computed freshness
 * metadata; the store MUST persist them and hand them back on `get` so the
 * read path can decide freshness and gate the shared-partition fallback on
 * `scope === 'public'`.
 */
interface CacheEntry {
  readonly value: string;
  readonly stamp: number;
  readonly expiresAt?: number;
  readonly scope?: CacheScope;
}
/**
 * The pluggable response-cache store. The interface is intentionally narrow;
 * the in-memory default is the only implementation the SDK ships.
 *
 * Every method is async-ready ({@linkcode MaybePromise}) so a Redis-style
 * store can implement the same interface without a later breaking change; the
 * in-memory default stays synchronous (plain values are valid under
 * `MaybePromise`). The `Client` `await`s every call site.
 *
 * Entries are keyed by `{method, params, partition}` where `partition` is the
 * `Client`-derived `[serverIdentity, principal]` JSON pair, so one store
 * instance is safe to share across `Client` instances connected to different
 * servers and/or principals: writes from distinct connections never collide,
 * the shared-partition read fallback is gated on the stored
 * `scope === 'public'`, and `list_changed` / `HEADER_MISMATCH` evictions are
 * scoped to the connected server's two partitions — co-tenants on a shared
 * store are unaffected. The `Client` constructor still allocates a fresh
 * {@linkcode InMemoryResponseCacheStore} per instance by default; supply your
 * own to share or persist.
 */
interface ResponseCacheStore {
  get(key: CacheKey): MaybePromise<CacheEntry | undefined>;
  /**
   * Writes `entry` under `key` and returns the store-generated stamp the
   * resulting {@linkcode CacheEntry} carries. The store owns the stamp
   * counter; callers do not supply one. The caller owns `expiresAt` and
   * `scope` (the client-computed freshness metadata); the store MUST persist
   * them and hand them back on `get`.
   */
  set(key: CacheKey, entry: {
    value: string;
    expiresAt?: number;
    scope?: CacheScope;
  }): MaybePromise<number>;
  /**
   * Drop the single entry under `key` (no-op if absent). Called for both
   * `notifications/resources/updated` (per-URI) and the `list_changed`
   * notifications (the list singletons live at `{method, params: '', partition}`).
   */
  delete(key: CacheKey): MaybePromise<void>;
  /**
   * Drop every entry for `method` across every partition. The `Client` does
   * NOT call this (its `list_changed` path issues two partition-scoped
   * `delete()` calls so co-tenants on a shared store keep their entries);
   * kept on the interface for callers that want a method-wide bulk-clear.
   */
  evict(method: string): MaybePromise<void>;
  /** Drop every entry (connection reset). */
  clear(): MaybePromise<void>;
}
/** Options for {@linkcode InMemoryResponseCacheStore}. */
interface InMemoryResponseCacheStoreOptions {
  /**
   * Maximum number of held `resources/read` entries (the only
   * unbounded-keyspace method). When inserting a new `resources/read` key
   * would exceed this, the oldest such entry (by insertion order) is
   * evicted first. The list-singleton methods (`tools/list`,
   * `prompts/list`, `resources/list`, `resources/templates/list`,
   * `server/discover`) are **exempt** — they hold at most one entry per
   * partition and back the `tools/list`-derived index, so an unbounded URI
   * working set never displaces them. The default of `512` bounds growth on
   * a long-lived client against template-expanded URIs. `0` disables the
   * bound.
   */
  maxEntries?: number;
}
/**
 * In-memory default. Bounded by an insertion-ordered size cap (default `512`;
 * see {@linkcode InMemoryResponseCacheStoreOptions.maxEntries}) on the
 * `resources/read` keyspace so an unbounded stream of distinct URIs cannot
 * grow it without limit; the list-singleton methods are exempt and never
 * evicted by the cap. `Map` preserves insertion order, so the oldest live
 * capped key is the first matching iteration entry.
 */
declare class InMemoryResponseCacheStore implements ResponseCacheStore {
  private readonly _entries;
  private readonly _maxEntries;
  private _stamp;
  /** Count of held entries that are subject to the cap (i.e. not in {@linkcode CAP_EXEMPT_METHODS}). */
  private _cappedSize;
  constructor(options?: InMemoryResponseCacheStoreOptions);
  /** Number of held entries (for diagnostics / bounding tests). */
  get size(): number;
  get(key: CacheKey): CacheEntry | undefined;
  set(key: CacheKey, entry: {
    value: string;
    expiresAt?: number;
    scope?: CacheScope;
  }): number;
  delete(key: CacheKey): void;
  evict(method: string): void;
  clear(): void;
}
/**
 * Upper bound on the server-supplied `ttlMs` honoured by
 * {@linkcode ClientResponseCache} (24h). A server cannot pin an entry
 * indefinitely.
 */
declare const MAX_CACHE_TTL_MS = 86400000;
//#endregion
//#region src/client/versionNegotiation.d.ts
/**
 * Probe policy for `'auto'` and pinned negotiation modes.
 *
 * There is no special probe timeout opinion: the probe inherits the client's
 * STANDARD request timeout unless `timeoutMs` overrides it.
 */
interface VersionNegotiationProbeOptions {
  /**
   * Timeout for the probe exchange, in milliseconds.
   *
   * The timeout verdict is transport-aware: on stdio, a probe that gets no
   * response within the timeout indicates a legacy server and falls back to
   * the `initialize` handshake (measured on the disposable sibling for the
   * SDK's own stdio transport, with the fallback running on the session
   * child's fresh pipe; in place for custom stdio-shaped transports); on
   * HTTP, where a deployed server answers and silence means an outage,
   * `connect()` rejects with the standard typed timeout error instead.
   *
   * @default the standard request timeout (`DEFAULT_REQUEST_TIMEOUT_MSEC`, or the `timeout` passed to `connect()`)
   */
  timeoutMs?: number;
  /**
   * Number of times to re-send the probe after a timeout before reaching the
   * timeout verdict. Governs timeout re-sends only — the spec-mandated
   * `-32022` corrective continuation (select-and-continue with a mutual
   * version) is a separate negotiation step and is never counted against
   * `maxRetries`.
   *
   * @default 0 (no retries)
   */
  maxRetries?: number;
}
/**
 * Negotiation mode:
 *
 * - `'legacy'` — no negotiation: the plain 2025 connect sequence, byte-identical
 *   to a client without this option.
 * - `'auto'` — probe with `server/discover` at connect; conservative fallback to
 *   the plain legacy `initialize` handshake unless the outcome is definitive
 *   modern evidence. Network outage rejects with a typed connect error; a
 *   probe timeout falls back to `initialize` on stdio (a silent server on a
 *   local pipe is a legacy server) and rejects with a typed timeout error on
 *   HTTP (silence there is an outage). On the SDK's stdio transport (the base
 *   `StdioClientTransport` exactly; subclasses probe in place) the probe
 *   runs on a short-lived sibling process spawned from the same parameters
 *   (its stderr is discarded) and the caller's transport starts once, after
 *   the era is known — so a child that exits on the unrecognized probe, the
 *   shape of servers built on SDKs that terminate on any pre-`initialize`
 *   request, is simply a legacy server. A mid-probe connection close on HTTP
 *   (or on a custom stdio-shaped transport, which probes in place) rejects
 *   with the typed connect error.
 * - `{ pin: '<version>' }` — modern era at exactly the pinned revision: the
 *   connect-time `server/discover` must offer it. No fallback — anything else
 *   fails loudly with a typed error.
 */
type VersionNegotiationMode = 'legacy' | 'auto' | {
  pin: string;
};
/**
 * Opt-in protocol version negotiation, configured on
 * `ClientOptions.versionNegotiation`.
 */
interface VersionNegotiationOptions {
  /**
   * @default 'legacy'
   */
  mode?: VersionNegotiationMode;
  /**
   * Probe timeout/retry policy (only consulted by the probing modes).
   */
  probe?: VersionNegotiationProbeOptions;
}
//#endregion
//#region src/client/client.d.ts
/**
 * Determines which elicitation modes are supported based on declared client capabilities.
 *
 * According to the spec:
 * - An empty elicitation capability object defaults to form mode support (backwards compatibility)
 * - URL mode is only supported if explicitly declared
 *
 * @param capabilities - The client's elicitation capabilities
 * @returns An object indicating which modes are supported
 */
declare function getSupportedElicitationModes(capabilities: ClientCapabilities['elicitation']): {
  supportsFormMode: boolean;
  supportsUrlMode: boolean;
};
type ClientOptions = ProtocolOptions & {
  /**
   * Capabilities to advertise as being supported by this client.
   */
  capabilities?: ClientCapabilities;
  /**
   * JSON Schema validator for tool output validation.
   *
   * The validator is used to validate structured content returned by tools
   * against their declared output schemas.
   *
   * @default Runtime-selected validator (AJV-backed on Node.js, `@cfworker/json-schema`-backed on browser/workerd runtimes)
   */
  jsonSchemaValidator?: jsonSchemaValidator;
  /**
   * Opt-in protocol version negotiation (protocol revision 2026-07-28 and later).
   *
   * **The default is `'legacy'`**: absent (or `mode: 'legacy'`), `connect()`
   * runs the plain 2025 sequence, byte-identical to today's behavior (no
   * probe, no new headers). Opt into `'auto'` or pin to talk to a 2026-07-28
   * server.
   *
   * - `mode: 'auto'` — `connect()` probes the server with `server/discover` first:
   *   definitive modern evidence selects the modern era; definitive legacy signals
   *   (and anything unrecognized) fall back to the plain legacy `initialize`
   *   handshake, byte-equivalent to a 2025 client. On the SDK's own stdio
   *   transport (the base `StdioClientTransport` exactly; subclasses probe in
   *   place) the probe runs on a short-lived sibling process spawned from the
   *   same parameters (one extra spawn per connect; its stderr is discarded) and
   *   the caller's transport starts once, after the era is known; HTTP — and
   *   custom or subclassed stdio-shaped transports — probe on the connection itself. A
   *   network outage rejects with a typed connect error. A probe timeout is
   *   transport-aware: on stdio it indicates a legacy server (some legacy servers
   *   never answer unknown pre-`initialize` requests) and falls back to
   *   `initialize`; on HTTP it rejects with a typed timeout
   *   error (silence on a deployed server is an outage, not a legacy signal).
   * - `mode: { pin: '2026-07-28' }` — modern era at exactly the pinned revision;
   *   no probe-and-fallback: anything else fails loudly.
   *
   * Probe policy lives under `probe: { timeoutMs?, maxRetries? }`; the probe
   * inherits the client's standard request timeout unless overridden, and
   * `maxRetries` (default `0`) governs timeout re-sends only — the
   * spec-mandated `-32022` corrective continuation is never counted against it.
   *
   * Once a modern era is negotiated, the client automatically attaches the
   * per-request `_meta` envelope (the reserved protocol-version / client-info /
   * client-capabilities keys) to every outgoing request and notification;
   * user-supplied `_meta` keys take precedence over the auto-attached ones.
   */
  versionNegotiation?: VersionNegotiationOptions;
  /**
   * Multi-round-trip auto-fulfilment (protocol revision 2026-07-28).
   *
   * On the 2026-07-28 era, servers obtain client input (elicitation,
   * sampling, roots) by answering `tools/call`, `prompts/get`, or
   * `resources/read` with an `input_required` result instead of sending a
   * server→client request. By default the client fulfils those embedded
   * requests automatically through the SAME handlers registered via
   * {@linkcode Client.setRequestHandler | setRequestHandler} (e.g.
   * `elicitation/create`), then retries the original call with the
   * collected `inputResponses` and a byte-exact echo of the opaque
   * `requestState`, on a fresh request id, up to `maxRounds` rounds.
   * `client.callTool()` (and its siblings) keep returning their plain
   * result type — the interactive rounds happen inside the call.
   *
   * Set `autoFulfill: false` for manual mode: an `input_required` response
   * then surfaces as a typed error unless the individual call passes
   * `allowInputRequired: true` (pair it with `withInputRequired()` on the
   * explicit-schema path to type both outcomes).
   *
   * Has no effect on 2025-era connections, which have no `input_required`
   * vocabulary.
   */
  inputRequired?: InputRequiredOptions;
  /**
   * Configure handlers for list changed notifications (tools, prompts, resources).
   *
   * @example
   * ```ts source="./client.examples.ts#ClientOptions_listChanged"
   * const client = new Client(
   *     { name: 'my-client', version: '1.0.0' },
   *     {
   *         listChanged: {
   *             tools: {
   *                 onChanged: (error, tools) => {
   *                     if (error) {
   *                         console.error('Failed to refresh tools:', error);
   *                         return;
   *                     }
   *                     console.log('Tools updated:', tools);
   *                 }
   *             },
   *             prompts: {
   *                 onChanged: (error, prompts) => console.log('Prompts updated:', prompts)
   *             }
   *         }
   *     }
   * );
   * ```
   */
  listChanged?: ListChangedHandlers;
  /**
   * Cap on the number of pages the auto-aggregating
   * {@linkcode Client.listTools | listTools()} /
   * {@linkcode Client.listPrompts | listPrompts()} /
   * {@linkcode Client.listResources | listResources()} /
   * {@linkcode Client.listResourceTemplates | listResourceTemplates()} walk
   * fetches before throwing (a defence against a server whose `nextCursor`
   * never converges). `0` disables the cap. Default: `64`. Applies only to
   * the no-argument auto-aggregate path; an explicit-`cursor` per-page call
   * is never capped.
   */
  listMaxPages?: number;
  /**
   * The response-cache store backing the client's derived views (the cached
   * `tools/list` result that {@linkcode Client.callTool | callTool}'s output
   * validation and SEP-2243 header mirroring read) and the SEP-2549
   * cache-hint serving on the cacheable verbs. Defaults to a fresh
   * {@linkcode InMemoryResponseCacheStore} per client.
   *
   * Entries are automatically scoped by connected-server identity (derived
   * from `serverInfo` after connect) AND, for `'private'`-scoped results,
   * by `cachePartition` — encoded collision-free via `JSON.stringify`, so a
   * server cannot craft a `serverInfo` that bleeds into another server's
   * namespace or another principal's slot. One store may therefore back
   * several clients (e.g. a host pool against the same server, or one
   * persistent KV across servers); `list_changed` evictions are scoped to
   * the connected server's partitions, so co-tenants are unaffected. Set
   * `cachePartition` to your principal identifier (e.g. the auth subject)
   * when sharing across principals. Note `serverInfo` is self-reported — a
   * server that deliberately impersonates
   * another's `name`/`version` shares its `'public'` slot; the
   * per-principal isolation via `cachePartition` holds regardless.
   */
  responseCacheStore?: ResponseCacheStore;
  /**
   * Opaque per-principal identifier for response-cache writes whose
   * server-reported `cacheScope` is `'private'` (the spec's "MUST NOT share
   * across authorization contexts"). Within the connected server's
   * namespace, `'public'`-scoped entries live at the shared
   * `[serverIdentity, '']` partition and `'private'`-scoped entries at
   * `[serverIdentity, cachePartition]`. Set this to a stable identity of
   * the authorization context (e.g. the auth subject) when one
   * `responseCacheStore` backs several principals; with the
   * default `''` every entry — public or private — lives at the server's
   * shared partition, which is the safe single-tenant posture.
   */
  cachePartition?: string;
  /**
   * TTL (ms) applied when a cacheable result arrives without a `ttlMs`
   * field. Default `0` — a result without an explicit hint is never served
   * from cache (every call refetches), but it is still **stored** so the
   * `tools/list`-derived index that {@linkcode Client.callTool | callTool}'s
   * SEP-2243 mirroring and output-schema validation read keeps working
   * regardless. The spec defines absent-or-≤0 as "immediately stale".
   */
  defaultCacheTtlMs?: number;
};
/**
 * Options for {@linkcode Client.connect}. Extends {@linkcode RequestOptions}
 * (the timeout/signal apply to the connect-time handshake or probe) with the
 * cached-era-verdict knob.
 */
type ConnectOptions = RequestOptions & {
  /**
   * A cached era verdict, taking precedence over `versionNegotiation`:
   * `{ kind: 'modern', discover }` adopts a prior {@linkcode DiscoverResult}
   * with zero round trips (throws `SdkError(EraNegotiationFailed)` on no
   * 2026-07-28+ overlap); `{ kind: 'legacy' }` skips the probe and runs the
   * plain legacy `initialize` handshake. Freshness is the supplying host's
   * responsibility — see {@linkcode PriorDiscovery}. Reuse only within one
   * authorization context.
   */
  prior?: PriorDiscovery;
};
/**
 * {@linkcode RequestOptions} extended with the per-call cache disposition for
 * the cacheable verbs (`listTools()` / `listPrompts()` / `listResources()` /
 * `listResourceTemplates()` / `readResource()`). See {@linkcode CacheMode}.
 */
type CacheableRequestOptions = RequestOptions & {
  /**
   * `'use'` (default) serves a still-fresh cached entry without a round
   * trip; `'refresh'` always fetches and re-stores; `'bypass'` fetches
   * without consulting or writing the cache. Applies to the no-`cursor`
   * auto-aggregate path on the list verbs and to `readResource`; ignored
   * elsewhere.
   */
  cacheMode?: CacheMode;
};
/**
 * Options for {@linkcode Client.callTool}. Extends {@linkcode RequestOptions}
 * with an escape hatch for callers that already hold the tool definition
 * (e.g. from a previous session or configuration) — pass it via
 * `toolDefinition` so SEP-2243 `Mcp-Param-*` header mirroring can run without a
 * prior `tools/list`.
 */
type CallToolRequestOptions = RequestOptions & {
  /**
   * The tool definition to use for SEP-2243 `Mcp-Param-*` header mirroring on
   * a 2026-07-28 connection over Streamable HTTP, AND for output-schema
   * validation of the result. When set, the client uses this definition's
   * `inputSchema` and `outputSchema` instead of (and without consulting) the
   * cached `tools/list` result, so the two derived views agree.
   */
  toolDefinition?: Tool;
};
/**
 * A handle to an open `subscriptions/listen` stream (protocol revision
 * 2026-07-28). Change notifications delivered on the stream dispatch to the
 * existing {@linkcode Client.setNotificationHandler} registrations.
 */
interface McpSubscription {
  /**
   * The subset of the requested filter the server agreed to honor (from
   * `notifications/subscriptions/acknowledged`).
   */
  readonly honoredFilter: SubscriptionFilter;
  /**
   * Tears the subscription down. Idempotent. Aborts the listen request's
   * stream (where the transport supports it) AND sends
   * `notifications/cancelled` referencing the listen request id — both,
   * always, so close works on any transport.
   */
  close(): Promise<void>;
  /**
   * Resolves exactly once when the subscription has terminated. Never
   * rejects — this is an observation, not an operation.
   *
   * - `'local'` — you called {@linkcode close} (or aborted the
   *   `RequestOptions.signal` you passed to `listen()`).
   * - `'graceful'` — the server ended the subscription deliberately by
   *   sending the empty `subscriptions/listen` response (e.g. on shutdown).
   * - `'remote'` — the stream ended without a response, or the transport
   *   dropped — an unexpected disconnect. Re-listen if you still want
   *   events.
   */
  readonly closed: Promise<'local' | 'graceful' | 'remote'>;
}
/**
 * An MCP client on top of a pluggable transport.
 *
 * The client will automatically begin the initialization flow with the server when {@linkcode connect} is called.
 *
 * To handle server-initiated requests (sampling, elicitation, roots), call {@linkcode setRequestHandler}.
 * The client must declare the corresponding capability for the handler to be accepted. For
 * `sampling/createMessage` and `elicitation/create`, the handler is automatically wrapped with
 * schema validation for both the incoming request and the returned result.
 *
 * Note: the `roots/list` and `sampling/createMessage` handler surfaces (and the corresponding
 * `roots` and `sampling` capabilities) are deprecated as of protocol version 2026-07-28
 * (SEP-2577). They remain functional during the deprecation window (at least twelve months).
 * Migrate sampling to calling LLM provider APIs directly, and roots to passing paths via tool
 * parameters, resource URIs, or configuration.
 *
 * @example Handling a sampling request
 * ```ts source="./client.examples.ts#Client_setRequestHandler_sampling"
 * client.setRequestHandler('sampling/createMessage', async request => {
 *     const lastMessage = request.params.messages.at(-1);
 *     console.log('Sampling request:', lastMessage);
 *
 *     // In production, send messages to your LLM here
 *     return {
 *         model: 'my-model',
 *         role: 'assistant' as const,
 *         content: {
 *             type: 'text' as const,
 *             text: 'Response from the model'
 *         }
 *     };
 * });
 * ```
 */
declare class Client extends Protocol<ClientContext> {
  private _clientInfo;
  private _serverCapabilities?;
  private _serverVersion?;
  private _capabilities;
  private _instructions?;
  private _jsonSchemaValidator;
  /**
   * The response-cache substrate. Owns the backing store, the per-method
   * eviction-generation counter, the user-supplied/default flag, and the
   * stamp-memoized derived `name → Tool` / `name → output-validator`
   * indices — the cache-coordination state that used to live as separate
   * private fields here. The internal aggregating walk writes one entry per
   * list verb; `list_changed` evicts the matching method;
   * `_resetConnectionState` resets the lot. {@linkcode callTool}'s
   * output-schema validation reads the derived `outputValidator` index (the
   * substrate's first production caller); the stacked SEP-2243 PR wires
   * `Mcp-Param-*` mirroring through `toolDefinition` on top.
   */
  private readonly _cache;
  private readonly _defaultCacheTtlMs;
  private readonly _listMaxPages;
  private _listChangedDebounceTimers;
  /**
   * The constructor `listChanged` configuration. Durable across reconnects:
   * read fresh on every connect (legacy or modern), never consumed.
   */
  private readonly _listChangedConfig?;
  private _enforceStrictCapabilities;
  private _versionNegotiation?;
  private _supportedProtocolVersionsOption?;
  private _inputRequiredDriverConfig;
  /**
   * Active subscriptions/listen state, keyed by subscription id (= the
   * listen request's JSON-RPC id verbatim). The id is a STRING from a
   * Client-owned counter (`'listen:' + N`) — JSON-RPC permits string ids,
   * and Protocol's numeric `_requestMessageId` counter only ever issues
   * numbers, so listen ids cannot collide with ordinary request ids.
   */
  private _listenState;
  private _nextListenId;
  /** The auto-opened subscription backing ClientOptions.listChanged on a modern connection. */
  private _autoOpenedSubscription?;
  /** Backing store for {@linkcode getDiscoverResult}. Per-connection. */
  private _discoverResult?;
  /**
   * Clears every per-connection field in one place. Called at the start of
   * each fresh (non-resuming) connect and from `close()`, so a stale
   * negotiated era / server identity / auto-opened subscription cannot
   * survive a reconnect.
   */
  private _resetConnectionState;
  close(): Promise<void>;
  /**
   * Initializes this client with the given name and version information.
   */
  constructor(_clientInfo: Implementation, options?: ClientOptions);
  protected buildContext(ctx: BaseContext, _transportInfo?: MessageExtraInfo): ClientContext;
  /**
   * Era-keyed direction enforcement for inbound traffic on channels whose
   * transport does not classify (e.g. stdio): the 2026-07-28 era has no
   * server→client JSON-RPC request channel — server-to-client interactions
   * are carried in-band in `input_required` results — and on stdio the
   * client must never write JSON-RPC responses. An inbound request arriving
   * on a connection that negotiated a modern era is therefore dropped
   * (surfaced via `onerror`) rather than answered. Connections on a legacy
   * era — and all responses and notifications — keep today's dispatch path.
   */
  protected _shouldDropInbound(message: JSONRPCRequest | JSONRPCNotification): 'drop' | undefined;
  /**
   * Per-request `_meta` envelope auto-emission (protocol revision 2026-07-28):
   * on a connection that negotiated a modern era — auto-negotiated or pinned —
   * every outgoing request and notification automatically carries the reserved
   * protocol-version / client-info / client-capabilities `_meta` keys (the
   * same envelope the connect-time `server/discover` probe sends).
   * User-supplied `_meta` keys take precedence over the auto-attached ones.
   *
   * Legacy-era connections return `undefined`: the envelope seam is a no-op
   * and outbound traffic is byte-identical to a 2025 client (the legacy
   * `'auto'` fallback included).
   */
  protected _outboundMetaEnvelope(): Readonly<Record<string, unknown>> | undefined;
  /**
   * Wires the multi-round-trip auto-fulfilment engine (protocol revision
   * 2026-07-28) into the response funnel: an `input_required` answer is
   * fulfilled through the registered elicitation/sampling/roots handlers
   * and the original request retried via `flow.retry`, up to
   * `inputRequired.maxRounds` rounds. With auto-fulfilment disabled the
   * response surfaces as a typed error steering to manual mode.
   */
  protected _resolveNonCompleteResult<T extends StandardSchemaV1>(decoded: {
    kind: 'input_required';
    inputRequests: Record<string, unknown>;
    requestState?: string;
  }, flow: NonCompleteResultFlow<T>): Promise<unknown>;
  /**
   * Set up handlers for list changed notifications based on config and server capabilities.
   * This should only be called after initialization when server capabilities are known.
   * Handlers are silently skipped if the server doesn't advertise the corresponding listChanged capability.
   * @internal
   */
  private _setupListChangedHandlers;
  /**
   * Registers new capabilities. This can only be called before connecting to a transport.
   *
   * The new capabilities will be merged with any existing capabilities previously given (e.g., at initialization).
   */
  registerCapabilities(capabilities: ClientCapabilities): void;
  /**
   * Configure protocol version negotiation before connecting (equivalent to
   * passing `versionNegotiation` at construction time). Can only be called
   * before connecting to a transport. Passing `undefined` clears a previously
   * configured negotiation, restoring the default `'legacy'` posture.
   *
   * See {@linkcode ClientOptions | ClientOptions.versionNegotiation} for the mode semantics.
   */
  setVersionNegotiation(options: VersionNegotiationOptions | undefined): void;
  /**
   * Enforces client-side validation for `elicitation/create` and `sampling/createMessage`
   * regardless of how the handler was registered.
   */
  protected _wrapHandler(method: string, handler: (request: JSONRPCRequest, ctx: ClientContext) => Promise<Result>): (request: JSONRPCRequest, ctx: ClientContext) => Promise<Result>;
  protected assertCapability(capability: keyof ServerCapabilities, method: string): void;
  /**
   * Connects to a server via the given transport and performs the MCP initialization handshake.
   *
   * @example Basic usage (stdio)
   * ```ts source="./client.examples.ts#Client_connect_stdio"
   * const client = new Client({ name: 'my-client', version: '1.0.0' });
   * const transport = new StdioClientTransport({ command: 'my-mcp-server' });
   * await client.connect(transport);
   * ```
   *
   * @example Streamable HTTP with SSE fallback
   * ```ts source="./client.examples.ts#Client_connect_sseFallback"
   * const baseUrl = new URL(url);
   *
   * try {
   *     // Try modern Streamable HTTP transport first
   *     const client = new Client({ name: 'my-client', version: '1.0.0' });
   *     const transport = new StreamableHTTPClientTransport(baseUrl);
   *     await client.connect(transport);
   *     return { client, transport };
   * } catch {
   *     // Fall back to legacy SSE transport
   *     const client = new Client({ name: 'my-client', version: '1.0.0' });
   *     const transport = new SSEClientTransport(baseUrl);
   *     await client.connect(transport);
   *     return { client, transport };
   * }
   * ```
   */
  connect(transport: Transport, options?: ConnectOptions): Promise<void>;
  /**
   * Plain legacy connect — the pinned 2025 sequence, byte-untouched. The
   * `mode: 'legacy'` connect body, shared with the `prior` legacy verdict.
   */
  private _connectPlainLegacy;
  /**
   * The 2025 `initialize` handshake — the body of the plain legacy connect and
   * the `'auto'`-mode fallback path (same `initialize` body, zero 2026 headers;
   * on the stdio sibling path it opens the session child's fresh pipe, in the
   * in-place modes it rides the probed connection). Callers clear the negotiated protocol version before
   * the handshake; its completion sets the negotiated (legacy) version.
   */
  private _legacyHandshake;
  /**
   * Negotiated connect (mode `'auto'` or `{ pin }`): probe with `server/discover`
   * before the Protocol machinery attaches — on a disposable sibling process for
   * the SDK's stdio transport, in place otherwise — then either establish the
   * modern era or perform the plain legacy handshake.
   */
  private _connectNegotiated;
  /**
   * Connect from a validated {@linkcode PriorDiscovery}: the modern arm
   * adopts the `DiscoverResult` (zero round trips; `EraNegotiationFailed`
   * on no 2026-07-28+ overlap), the legacy arm runs the plain legacy connect.
   */
  private _connectFromPrior;
  /**
   * After initialization has completed, this will be populated with the server's reported capabilities.
   */
  getServerCapabilities(): ServerCapabilities | undefined;
  /**
   * The connected server's self-reported name and version, when it
   * identified itself: required on the legacy `initialize` result; a spec
   * SHOULD in the discover result's `_meta` on 2026-07-28, so a successful
   * modern connect against an anonymous server leaves this `undefined`.
   */
  getServerVersion(): Implementation | undefined;
  /**
   * The connected server's identity for response-cache partitioning. The
   * `serverInfo` `name@version` pair when available (required on
   * `initialize`; a SHOULD in the discover result's `_meta` since spec PR
   * #3002); falls back to the transport's `sessionId`, then to a
   * per-connection surrogate. The surrogate matters since #3002 made
   * identity optional: without it, two identity-less servers reached over
   * sessionId-less transports would share the cache's pre-connect `''`
   * partition and read each other's entries — no stable identity means no
   * cross-connection cache reuse. The value itself is server-controlled —
   * the collision-safety of the storage partition comes from
   * {@linkcode ClientResponseCache}'s JSON-array encoding around it, not
   * from any character it does or does not contain.
   */
  private _deriveServerIdentity;
  /**
   * After initialization has completed, this will be populated with the protocol version negotiated
   * during the initialize handshake. When manually reconstructing a transport for reconnection, pass this
   * value to the new transport so it continues sending the required `mcp-protocol-version` header.
   */
  getNegotiatedProtocolVersion(): string | undefined;
  /**
   * After initialization has completed, this returns the protocol era of the
   * connection: `'modern'` when the connection negotiated a 2026-07-28+
   * revision (via `server/discover`), `'legacy'` for the 2025-era
   * `initialize` handshake, or `undefined` before the connection is
   * established.
   */
  getProtocolEra(): ProtocolEra | undefined;
  /**
   * After initialization has completed, this may be populated with information about the server's instructions.
   */
  getInstructions(): string | undefined;
  /**
   * The {@linkcode DiscoverResult} from the last `'auto'`/pinned probe,
   * {@linkcode discover} call, or `connect({ prior })` that adopted a
   * modern verdict (a legacy verdict leaves this `undefined` — there is no
   * `DiscoverResult` on that path). Persistable via `JSON.stringify`; wrap
   * as `{ kind: 'modern', discover }` and feed to {@linkcode ConnectOptions}
   * `prior`.
   */
  getDiscoverResult(): DiscoverResult | undefined;
  protected assertCapabilityForMethod(method: RequestMethod | string): void;
  protected assertNotificationCapability(method: NotificationMethod | string): void;
  protected assertRequestHandlerCapability(method: string): void;
  ping(options?: RequestOptions): Promise<EmptyResult>;
  /**
   * Send `server/discover` (2026-07-28+) and record the result for
   * {@linkcode getDiscoverResult}.
   */
  discover(options?: RequestOptions): Promise<DiscoverResult>;
  /** Requests argument autocompletion suggestions from the server for a prompt or resource. */
  complete(params: CompleteRequest['params'], options?: RequestOptions): Promise<CompleteResult>;
  /**
   * Sets the minimum severity level for log messages sent by the server.
   *
   * @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
   * Remains functional during the deprecation window (at least twelve months).
   * Migrate to stderr logging (STDIO servers) or OpenTelemetry.
   */
  setLoggingLevel(level: LoggingLevel, options?: RequestOptions): Promise<EmptyResult>;
  /** Retrieves a prompt by name from the server, passing the given arguments for template substitution. */
  getPrompt(params: GetPromptRequest['params'], options?: RequestOptions): Promise<GetPromptResult>;
  /**
   * Lists available prompts.
   *
   * Called without a `cursor` (the common case), this walks every page and
   * returns the complete aggregated list with no `nextCursor`; the
   * aggregate is also written to the {@linkcode ResponseCacheStore}. Pass an
   * explicit `{ cursor }` to fetch a single page and walk pagination
   * yourself — the per-page path returns the server's raw page (with
   * `nextCursor` for the next call) and does not write the response cache.
   * The auto-aggregate path is capped by
   * {@linkcode ClientOptions | ClientOptions.listMaxPages} (default 64); the per-page path
   * is not.
   *
   * Returns an empty list if the server does not advertise prompts capability
   * (or throws if {@linkcode ClientOptions.enforceStrictCapabilities} is enabled).
   *
   * @example
   * ```ts source="./client.examples.ts#Client_listPrompts_pagination"
   * // No cursor → all pages aggregated for you.
   * const { prompts } = await client.listPrompts();
   * console.log(
   *     'Available prompts:',
   *     prompts.map(p => p.name)
   * );
   * ```
   */
  listPrompts(params?: ListPromptsRequest['params'], options?: CacheableRequestOptions): Promise<ListPromptsResult>;
  /**
   * Lists available resources.
   *
   * Called without a `cursor` (the common case), this walks every page and
   * returns the complete aggregated list with no `nextCursor`; the
   * aggregate is also written to the {@linkcode ResponseCacheStore}. Pass an
   * explicit `{ cursor }` to fetch a single page and walk pagination
   * yourself — the per-page path returns the server's raw page (with
   * `nextCursor` for the next call) and does not write the response cache.
   * The auto-aggregate path is capped by
   * {@linkcode ClientOptions | ClientOptions.listMaxPages} (default 64); the per-page path
   * is not.
   *
   * Returns an empty list if the server does not advertise resources capability
   * (or throws if {@linkcode ClientOptions.enforceStrictCapabilities} is enabled).
   *
   * @example
   * ```ts source="./client.examples.ts#Client_listResources_pagination"
   * // No cursor → all pages aggregated for you.
   * const { resources } = await client.listResources();
   * console.log(
   *     'Available resources:',
   *     resources.map(r => r.name)
   * );
   * ```
   */
  listResources(params?: ListResourcesRequest['params'], options?: CacheableRequestOptions): Promise<ListResourcesResult>;
  /**
   * Lists available resource URI templates for dynamic resources.
   *
   * Called without a `cursor`, this walks every page and returns the
   * complete aggregated list with no `nextCursor`; the aggregate is
   * also written to the {@linkcode ResponseCacheStore}. Pass an explicit
   * `{ cursor }` to fetch a single page — see
   * {@linkcode listResources | listResources()} for the per-page contract.
   *
   * Returns an empty list if the server does not advertise resources capability
   * (or throws if {@linkcode ClientOptions.enforceStrictCapabilities} is enabled).
   */
  listResourceTemplates(params?: ListResourceTemplatesRequest['params'], options?: CacheableRequestOptions): Promise<ListResourceTemplatesResult>;
  /**
   * Walk every page of a paginated list verb, aggregate, and write ONE
   * entry to the response cache. Internal — backs the public `list*`
   * methods' no-`cursor` auto-aggregate path. Page 1's result object is
   * mutated in place (its items array is extended; `nextCursor` is
   * cleared); page-1 metadata (`ttlMs`, `cacheScope`, `_meta`) is preserved.
   * A page with the same items and `nextCursor` as the previous page ends the walk;
   * {@linkcode ClientOptions.listMaxPages} is a hard cap — hitting it
   * throws, so a partial aggregate is never cached. The
   * captured-generation guard skips the write when a `list_changed` landed
   * mid-walk, so the eviction is never overwritten by a stale aggregate.
   * `finalize` runs on the complete aggregate before the cache write — the
   * SEP-2243 invalid-`x-mcp-header` exclusion hooks here so the cached
   * `tools/list` entry is already filtered.
   *
   * The caller's `baseParams` (everything except `cursor`) is threaded into
   * every page request — page 1 sends `{...baseParams}`, later pages
   * `{...baseParams, cursor}` — so a typed, documented `_meta` (e.g. W3C
   * trace context) supplied to the public `list*()` reaches every wire
   * request the walk issues.
   */
  private _listAllPages;
  private _walkPages;
  /**
   * Compute the {@linkcode ClientResponseCache.write} freshness payload from
   * a cacheable result body. The single seam through which the client reads
   * `ttlMs`/`cacheScope` (mcp.d's `cachedFetch` engine). The fields pass
   * through the loose result schema, so they are read off the runtime body;
   * a missing `ttlMs` falls back to
   * {@linkcode ClientOptions | ClientOptions.defaultCacheTtlMs}; an explicit server-sent
   * `ttlMs` (including `0` — the spec's "immediately stale") is honoured
   * as-is. The default of `0` means `expiresAt === now()` ⇒ never served,
   * only stored. A missing `cacheScope` is treated as `'private'` — the
   * spec's `'public'` grant ("any client … MAY serve to any user") is too
   * strong to infer by default, and matches this SDK's server-side stamp
   * default.
   */
  private _freshness;
  /**
   * The cache-serving front of every cacheable verb (mcp.d's `cachedFetch`
   * read half): under `cacheMode: 'use'` (the default), a fresh held entry
   * is served and the round trip is skipped. `'refresh'` and `'bypass'`
   * always fetch (the caller decides whether to write). Freshness and
   * decoding live in {@linkcode ClientResponseCache.read}; every hit is
   * freshly parsed, so the caller owns it outright. A custom store
   * whose `get()` rejects is routed to `onerror` and treated as a miss —
   * cache bookkeeping never blocks a request from reaching the wire.
   */
  private _serveFromCache;
  /** Route a custom-store failure to `onerror` without aborting the surrounding dispatch. */
  private _reportStoreError;
  /**
   * Compile a single tool's `outputSchema`. Passed as the compile callback to
   * {@linkcode ClientResponseCache.outputValidator} so the cache class stays
   * free of any validator-provider dependency, and called directly for the
   * `options.toolDefinition` path of {@linkcode callTool} (a one-off
   * caller-supplied definition is compiled in isolation and never enters the
   * cache, so it cannot poison the listed tool of the same name).
   *
   * Returns `undefined` when the tool has no `outputSchema`, or a
   * discriminated `{ok}` result otherwise. SEP-2106: ANY throw from the
   * validator engine — unsupported `$schema` dialect, invalid `pattern`
   * regex, unresolvable `$ref`, or any other engine error — is captured as
   * `{ok: false, compileError}` so one bad schema does not poison the rest
   * of the listing; `callTool()` surfaces it as an `InvalidParams` error
   * before the request. The `{ok}` discriminator (not
   * `compileError !== undefined`) means a custom provider that does
   * `throw undefined` is still treated as a captured failure.
   */
  private _compileOutputValidator;
  /**
   * Resolve the SEP-2243 `x-mcp-header` declaration scan for a tool name.
   *
   * The caller-supplied `toolDefinition` escape hatch wins; otherwise the
   * cached `tools/list` entry (via the cache's `toolDefinition`) is the
   * source. Freshness is the response cache's lifecycle: `list_changed`
   * evicts, otherwise the held schema is the best information available
   * regardless of age, and a stale schema is recovered through the
   * `HEADER_MISMATCH` → evict-refetch-retry path in {@linkcode callTool}.
   * On a miss the call proceeds without `Mcp-Param-*` headers (the spec's
   * "client SHOULD send without custom headers" guidance) and relies on the
   * same recovery.
   */
  private _resolveXMcpHeaderScan;
  /**
   * Reads the contents of a resource by URI.
   *
   * Honours the result's `ttlMs`/`cacheScope` (SEP-2549): a still-fresh
   * cached body for the same `uri` is returned without a round trip
   * (`cacheMode: 'use'`, the default). The cache key is `{method, uri}`
   * partitioned by the resolved scope — `'private'` (the default when the
   * server omits the field) is stored under this client's
   * {@linkcode ClientOptions | ClientOptions.cachePartition}, so a shared
   * store cannot serve one principal's resource body to another. Unlike the
   * list verbs, a result whose resolved TTL is ≤0 is **not** stored
   * (`resources/read` has no derived index and the URI keyspace is
   * unbounded).
   */
  readResource(params: ReadResourceRequest['params'], options?: CacheableRequestOptions): Promise<ReadResourceResult>;
  private _readResource;
  /** Subscribes to change notifications for a resource. The server must support resource subscriptions. */
  subscribeResource(params: SubscribeRequest['params'], options?: RequestOptions): Promise<EmptyResult>;
  /** Unsubscribes from change notifications for a resource. */
  unsubscribeResource(params: UnsubscribeRequest['params'], options?: RequestOptions): Promise<EmptyResult>;
  /**
   * Opens a `subscriptions/listen` stream (protocol revision 2026-07-28).
   *
   * Resolves once the server's `notifications/subscriptions/acknowledged`
   * arrives (the standard request timeout applies to this ack phase). Change
   * notifications delivered on the stream are dispatched to the existing
   * {@linkcode setNotificationHandler} registrations — the same handlers the
   * 2025-era unsolicited notifications fire on a legacy connection — so
   * `listen()` is era-transparent for consumers that already register those.
   *
   * `close()` tears the subscription down by aborting the listen request's
   * `requestSignal` (closes the SSE stream where the transport honors it)
   * AND sending `notifications/cancelled` referencing the listen request id
   * — both, unconditionally, so any spec-compliant server on any transport
   * sees the cancel. No automatic re-listen — call `listen()` again to
   * re-establish.
   *
   * On a 2025-era connection this throws a typed
   * {@linkcode SdkErrorCode.MethodNotSupportedByProtocolVersion} steering to
   * `resources/subscribe` and `ClientOptions.listChanged` (the legacy
   * unsolicited delivery model still applies there); no transparent shim.
   */
  listen(filter: SubscriptionFilter, options?: RequestOptions): Promise<McpSubscription>;
  /**
   * The subscription auto-opened by `ClientOptions.listChanged` on a modern
   * connection — the listen filter is the intersection of the configured
   * sub-options and the server-advertised `listChanged` capabilities.
   * `undefined` on a legacy connection, before connect, or when that
   * intersection is empty (auto-open skipped). Exposed so the consumer can
   * `close()` it.
   */
  get autoOpenedSubscription(): McpSubscription | undefined;
  /**
   * Transport-level demux for `subscriptions/listen` notifications, before
   * any decoding/era-gating/handler dispatch. Consumes the leading
   * `notifications/subscriptions/acknowledged` referencing a live
   * subscription id (resolves the ack waiter) and an inbound
   * `notifications/cancelled` referencing a live string-typed subscription
   * id (server-side teardown on stdio). Change notifications carrying a
   * subscription id pass through to the existing registered handlers via
   * `super`. An unmatched ack/cancelled is NOT consumed: it reaches
   * `setNotificationHandler` / `fallbackNotificationHandler` instead of
   * being silently swallowed.
   */
  protected _onnotification(raw: JSONRPCNotification, extra?: MessageExtraInfo): void;
  /**
   * Transport-level demux for `subscriptions/listen` responses. A JSON-RPC
   * ERROR for the listen id is the server's pre-ack capacity/params
   * rejection; a JSON-RPC RESULT for the listen id is the spec's
   * `SubscriptionsListenResult` — the server's GRACEFUL-close signal (sent
   * on shutdown). A string-id response that matches a live `_listenState`
   * entry is consumed here (Protocol's `_responseHandlers` map is keyed by
   * NUMBER and never holds a listen id, so passing a string-id response
   * through would surface as "unknown message ID" via `onerror`).
   */
  protected _onresponse(response: JSONRPCResponse): void;
  /**
   * Settle every live per-listen state machine on a transport-initiated
   * close (the server dropping the connection on stdio/InMemory) before
   * Protocol's `_onclose` tears the transport down. The base
   * `_responseHandlers` settlement does not reach `_listenState` (listen
   * ids are never registered there), so without this override a remote
   * close would leave an in-flight `listen()` / open `McpSubscription`
   * hanging.
   */
  protected _onclose(): void;
  /**
   * Calls a tool on the connected server and returns the result. Automatically validates structured output
   * if the tool has an `outputSchema`.
   *
   * Tool results have two error surfaces: `result.isError` for tool-level failures (the tool ran but reported
   * a problem), and thrown {@linkcode ProtocolError} for protocol-level failures or {@linkcode SdkError} for
   * SDK-level issues (timeouts, missing capabilities).
   *
   * @example Basic usage
   * ```ts source="./client.examples.ts#Client_callTool_basic"
   * const result = await client.callTool({
   *     name: 'calculate-bmi',
   *     arguments: { weightKg: 70, heightM: 1.75 }
   * });
   *
   * // Tool-level errors are returned in the result, not thrown
   * if (result.isError) {
   *     console.error('Tool error:', result.content);
   *     return;
   * }
   *
   * console.log(result.content);
   * ```
   *
   * @example Structured output
   * ```ts source="./client.examples.ts#Client_callTool_structuredOutput"
   * const result = await client.callTool({
   *     name: 'calculate-bmi',
   *     arguments: { weightKg: 70, heightM: 1.75 }
   * });
   *
   * // Machine-readable output for the client application. SEP-2106: structuredContent is
   * // `unknown` (any JSON value). Check for presence with `!== undefined` and narrow before use.
   * if (result.structuredContent !== undefined) {
   *     const sc: unknown = result.structuredContent; // e.g. { bmi: 22.86 }
   *     if (typeof sc === 'object' && sc !== null && 'bmi' in sc) {
   *         console.log(sc.bmi);
   *     }
   * }
   * ```
   */
  callTool(params: CallToolRequest['params'], options?: CallToolRequestOptions): Promise<CallToolResult>;
  /**
   * Lists available tools.
   *
   * Called without a `cursor` (the common case), this walks every page and
   * returns the complete aggregated list with no `nextCursor`; the
   * aggregate is also written to the {@linkcode ResponseCacheStore} (the
   * source for {@linkcode callTool | callTool()}'s output-schema validation
   * and SEP-2243 `Mcp-Param-*` header mirroring). Pass an explicit
   * `{ cursor }` to fetch a single page and walk pagination yourself — the
   * per-page path returns the server's raw page (with `nextCursor` for the
   * next call) and does not write the response cache. The auto-aggregate
   * path is capped by {@linkcode ClientOptions | ClientOptions.listMaxPages} (default 64);
   * the per-page path is not.
   *
   * Returns an empty list if the server does not advertise tools capability
   * (or throws if {@linkcode ClientOptions.enforceStrictCapabilities} is enabled).
   *
   * @example
   * ```ts source="./client.examples.ts#Client_listTools_pagination"
   * // No cursor → all pages aggregated for you.
   * const { tools } = await client.listTools();
   * console.log(
   *     'Available tools:',
   *     tools.map(t => t.name)
   * );
   * ```
   */
  listTools(params?: ListToolsRequest['params'], options?: CacheableRequestOptions): Promise<ListToolsResult>;
  /**
   * SEP-2243 (protocol revision 2026-07-28): a Streamable HTTP client MUST
   * exclude tool definitions whose `x-mcp-header` declarations violate the
   * constraints, and SHOULD log a warning naming the tool and the reason.
   * Applied to the CACHED aggregated `tools/list` result (so the entry
   * mirroring reads never holds an unmirrorable tool) AND to every public
   * per-page {@linkcode listTools | listTools()} return (the spec's MUST
   * has no carve-out for paginated reads). The gate is era-only on
   * non-stdio transports — `detectProbeTransportKind` cannot distinguish a
   * real HTTP transport from in-memory/custom transports (it only
   * positively recognizes stdio), and over-excluding on a non-HTTP modern
   * connection is harmless: those transports never carry per-request
   * headers, so an excluded tool would have been uncallable on a Streamable
   * HTTP arm of the same server. Mutates `result.tools` in place.
   */
  private _excludeInvalidXMcpHeaderTools;
  /**
   * Set up a single list changed handler.
   * @internal
   */
  private _setupListChangedHandler;
  /**
   * Notifies the server that the client's root list has changed. Requires the `roots.listChanged` capability.
   *
   * @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
   * Remains functional during the deprecation window (at least twelve months).
   * Migrate to passing paths via tool parameters, resource URIs, or configuration.
   */
  sendRootsListChanged(): Promise<void>;
}
//#endregion
export { MAX_CACHE_TTL_MS as _, ConnectOptions as a, PriorDiscovery as b, VersionNegotiationMode as c, CacheEntry as d, CacheKey as f, InMemoryResponseCacheStoreOptions as g, InMemoryResponseCacheStore as h, ClientOptions as i, VersionNegotiationOptions as l, CacheScope as m, CallToolRequestOptions as n, McpSubscription as o, CacheMode as p, Client as r, getSupportedElicitationModes as s, CacheableRequestOptions as t, VersionNegotiationProbeOptions as u, MaybePromise as v, ResponseCacheStore as y };
//# sourceMappingURL=client-BTIWJvaF.d.mts.map