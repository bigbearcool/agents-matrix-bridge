import { $ as UnsupportedProtocolVersionError, $i as isJsonContentType, $n as NotificationParams, $r as SingleSelectEnumSchema, $t as Icon, A as SpecTypeName, Ai as UnsupportedProtocolVersionErrorData, An as ListResourceTemplatesRequest, Ar as ResourceContents, At as CreateMessageResultWithTools, B as isInitializeRequest, Bi as INVALID_REQUEST, Bn as LoggingLevel, Br as ResultTypeMap, Bt as ElicitationCompleteNotification, C as ServerContext, Ca as StoredOAuthTokens, Ci as ToolChoice, Cn as JSONValue, Cr as RequestMeta, Ct as CompleteResult, D as TransportSendOptions, Di as ToolUseContent, Dn as ListChangedOptions, Dr as RequestParams, Dt as CreateMessageRequestParamsBase, E as Transport, Ei as ToolResultContent, En as ListChangedHandlers, Er as RequestMethod, Et as CreateMessageRequestParams, F as StandardSchemaV1Sync, Fi as CLIENT_CAPABILITIES_META_KEY, Fn as ListRootsResult, Fr as ResourceTemplateType, Ft as ElicitRequest, G as isJSONRPCRequest, Gi as PARSE_ERROR, Gn as MetaObject, Gr as SamplingMessage, Gt as GetPromptRequest, H as isInputRequiredResult, Hi as LATEST_PROTOCOL_VERSION, Hn as LoggingMessageNotificationParams, Hr as Root, Ht as EmbeddedResource, I as StandardSchemaWithJSON, Ii as CLIENT_INFO_META_KEY, In as ListTasksRequest, Ir as ResourceUpdatedNotification, It as ElicitRequestFormParams, J as isTaskAugmentedRequestParams, Ji as SERVER_INFO_META_KEY, Jn as ModelHint, Jr as ServerNotification, Jt as GetTaskPayloadRequest, K as isJSONRPCResponse, Ki as PROTOCOL_VERSION_META_KEY, Kn as MethodNotFoundError, Kr as SamplingMessageContentBlock, Kt as GetPromptRequestParams, L as assertCompleteRequestPrompt, Li as DEFAULT_NEGOTIATED_PROTOCOL_VERSION, Ln as ListTasksResult, Lr as ResourceUpdatedNotificationParams, Lt as ElicitRequestParams, M as isSpecType, Mi as UntitledSingleSelectEnumSchema, Mn as ListResourcesRequest, Mr as ResourceListChangedNotification, Mt as Cursor, N as specTypeSchemas, Ni as ProtocolErrorCode, Nn as ListResourcesResult, Nr as ResourceRequestParams, Nt as DiscoverRequest, O as createFetchWithInit, Oi as UnsubscribeRequest, On as ListPromptsRequest, Or as RequestTypeMap, Ot as CreateMessageRequestParamsWithTools, P as StandardSchemaV1, Pi as BAGGAGE_META_KEY, Pn as ListRootsRequest, Pr as ResourceTemplateReference, Pt as DiscoverResult, Q as ResourceNotFoundError, Qi as TRACESTATE_META_KEY, Qn as NotificationMethod, Qr as SetLevelRequestParams, Qt as HandlerResultTypeMap, R as assertCompleteRequestResourceTemplate, Ri as INTERNAL_ERROR, Rn as ListToolsRequest, Rr as Result, Rt as ElicitRequestURLParams, S as RequestStateAccessor, Sa as StoredOAuthClientInformation, Si as ToolAnnotations, Sn as JSONRPCResultResponse, Sr as RequestId, St as CompleteRequestResourceTemplate, T as FetchLike, Ti as ToolListChangedNotification, Tn as ListChangedCallback, Tr as RequestMetaObject, Tt as CreateMessageRequest, U as isJSONRPCErrorResponse, Ui as LOG_LEVEL_META_KEY, Un as MessageClassification, Ur as RootsListChangedNotification, Ut as EmptyResult, V as isInitializedNotification, Vi as JSONRPC_VERSION, Vn as LoggingMessageNotification, Vr as Role, Vt as ElicitationCompleteNotificationParams, W as isJSONRPCNotification, Wi as METHOD_NOT_FOUND, Wn as MessageExtraInfo, Wr as SamplingContent, Wt as EnumSchema, X as MissingRequiredClientCapabilityError, Xi as SUPPORTED_PROTOCOL_VERSIONS, Xn as MultiSelectEnumSchema, Xr as ServerResult, Xt as GetTaskRequest, Y as parseJSONRPCMessage, Yi as SUBSCRIPTION_ID_META_KEY, Yn as ModelPreferences, Yr as ServerRequest, Yt as GetTaskPayloadResult, Z as ProtocolError, Zi as TRACEPARENT_META_KEY, Zn as Notification, Zr as SetLevelRequest, Zt as GetTaskResult, _ as ProgressCallback, _a as OAuthProtectedResourceMetadata, _i as TextContent, _n as JSONRPCErrorResponse, _r as ReadResourceRequest, _t as ClientResult, a as UriTemplate, aa as SdkHttpErrorData, ai as SubscriptionsAcknowledgedNotificationParams, an as InitializeResult, ar as ParseError, at as BlobResourceContents, b as RequestHandlerSchemas, ba as OpenIdProviderDiscoveryMetadata, bi as TitledSingleSelectEnumSchema, bn as JSONRPCRequest, br as RelatedTaskMetadata, bt as CompleteRequestParams, c as ReadBuffer, ca as AuthorizationServerMetadata, ci as SubscriptionsListenResult, cn as InputRequests, cr as Progress, ct as CallToolRequestParams, d as serializeMessage, da as OAuthClientInformationFull, di as TaskAugmentedRequestParams, dn as InputResponses, dr as ProgressToken, dt as CancelTaskResult, ea as checkResourceAllowed, ei as StringSchema, en as Icons, er as NotificationTypeMap, et as UrlElicitationRequiredError, f as BaseContext, fa as OAuthClientInformationMixed, fi as TaskCreationParams, fn as InternalError, fr as Prompt, ft as CancelledNotification, g as NotificationOptions, ga as OAuthMetadata, gi as TaskStatusNotificationParams, gn as JSONObject, gr as PromptReference, gt as ClientRequest, ha as OAuthErrorResponse, hi as TaskStatusNotification, hn as JSONArray, hr as PromptMessage, ht as ClientNotification, i as ProtocolEra, ia as SdkHttpError, ii as SubscriptionsAcknowledgedNotification, in as InitializeRequestParams, ir as PaginatedResult, it as BaseMetadata, j as SpecTypes, ji as UntitledMultiSelectEnumSchema, jn as ListResourceTemplatesResult, jr as ResourceLink, jt as CreateTaskResult, k as getDisplayName, ki as UnsubscribeRequestParams, kn as ListPromptsResult, kr as Resource, kt as CreateMessageResult, l as STDIO_DEFAULT_MAX_BUFFER_SIZE, la as IdJagTokenExchangeResponse, li as SubscriptionsListenResultMeta, ln as InputRequiredResult, lr as ProgressNotification, lt as CallToolResult, m as DEFAULT_REQUEST_TIMEOUT_MSEC, ma as OAuthClientRegistrationError, mi as TaskStatus, mn as InvalidRequestError, mr as PromptListChangedNotification, mt as ClientCapabilities, n as InputRequiredOptions, na as SdkError, ni as SubscribeRequestParams, nn as Implementation, nr as PaginatedRequest, nt as AudioContent, o as Variables, oa as OAuthError, oi as SubscriptionsListenRequest, on as InitializedNotification, or as PingRequest, ot as BooleanSchema, p as ClientContext, pa as OAuthClientMetadata, pi as TaskMetadata, pn as InvalidParamsError, pr as PromptArgument, pt as CancelledNotificationParams, q as isJSONRPCResultResponse, qi as RELATED_TASK_META_KEY, qn as MissingRequiredClientCapabilityErrorData, qr as ServerCapabilities, qt as GetPromptResult, r as withInputRequired, ra as SdkErrorCode, ri as SubscriptionFilter, rn as InitializeRequest, rr as PaginatedRequestParams, rt as AuthInfo, s as InMemoryTransport, sa as OAuthErrorCode, si as SubscriptionsListenRequestParams, sn as InputRequest, sr as PrimitiveSchemaDefinition, st as CallToolRequest, t as preloadSchemas, ta as resourceUrlFromServerUrl, ti as SubscribeRequest, tn as ImageContent, tr as NumberSchema, tt as Annotations, u as deserializeMessage, ua as OAuthClientInformation, ui as Task, un as InputResponse, ur as ProgressNotificationParams, ut as CancelTaskRequest, v as Protocol, va as OAuthTokenRevocationRequest, vi as TextResourceContents, vn as JSONRPCMessage, vr as ReadResourceRequestParams, vt as CompatibilityCallToolResult, w as mergeCapabilities, wi as ToolExecution, wn as LegacyTitledEnumSchema, wr as RequestMetaEnvelope, wt as ContentBlock, x as RequestOptions, xa as OpenIdProviderMetadata, xi as Tool, xn as JSONRPCResponse, xr as Request, xt as CompleteRequestPrompt, y as ProtocolOptions, ya as OAuthTokens, yi as TitledMultiSelectEnumSchema, yn as JSONRPCNotification, yr as ReadResourceResult, yt as CompleteRequest, z as isCallToolResult, zi as INVALID_PARAMS, zn as ListToolsResult, zr as ResultMetaObject, zt as ElicitResult } from "./index-eUeYt8-s.cjs";
import { i as jsonSchemaValidator, n as JsonSchemaValidator, r as JsonSchemaValidatorResult, t as JsonSchemaType } from "./types-Pc2fJzyM.cjs";
import { _ as MAX_CACHE_TTL_MS, a as ConnectOptions, b as PriorDiscovery, c as VersionNegotiationMode, d as CacheEntry, f as CacheKey, g as InMemoryResponseCacheStoreOptions, h as InMemoryResponseCacheStore, i as ClientOptions, l as VersionNegotiationOptions, m as CacheScope, n as CallToolRequestOptions, o as McpSubscription, p as CacheMode, r as Client, s as getSupportedElicitationModes, t as CacheableRequestOptions, u as VersionNegotiationProbeOptions, v as MaybePromise, y as ResponseCacheStore } from "./client-yR_t4i05.cjs";
import { ErrorEvent, EventSourceInit } from "eventsource";

//#region ../../node_modules/.pnpm/jose@6.2.2/node_modules/jose/dist/types/types.d.ts
/** Generic JSON Web Key Parameters. */
interface JWKParameters {
  /** JWK "kty" (Key Type) Parameter */
  kty?: string;
  /**
   * JWK "alg" (Algorithm) Parameter
   *
   * @see {@link https://github.com/panva/jose/issues/210 Algorithm Key Requirements}
   */
  alg?: string;
  /** JWK "key_ops" (Key Operations) Parameter */
  key_ops?: string[];
  /** JWK "ext" (Extractable) Parameter */
  ext?: boolean;
  /** JWK "use" (Public Key Use) Parameter */
  use?: string;
  /** JWK "x5c" (X.509 Certificate Chain) Parameter */
  x5c?: string[];
  /** JWK "x5t" (X.509 Certificate SHA-1 Thumbprint) Parameter */
  x5t?: string;
  /** JWK "x5t#S256" (X.509 Certificate SHA-256 Thumbprint) Parameter */
  'x5t#S256'?: string;
  /** JWK "x5u" (X.509 URL) Parameter */
  x5u?: string;
  /** JWK "kid" (Key ID) Parameter */
  kid?: string;
}
/**
 * JSON Web Key ({@link https://www.rfc-editor.org/rfc/rfc7517 JWK}). "RSA", "EC", "OKP", "AKP", and
 * "oct" key types are supported.
 *
 * @see {@link JWK_AKP_Public}
 * @see {@link JWK_AKP_Private}
 * @see {@link JWK_OKP_Public}
 * @see {@link JWK_OKP_Private}
 * @see {@link JWK_EC_Public}
 * @see {@link JWK_EC_Private}
 * @see {@link JWK_RSA_Public}
 * @see {@link JWK_RSA_Private}
 * @see {@link JWK_oct}
 */
interface JWK extends JWKParameters {
  /**
   * - EC JWK "crv" (Curve) Parameter
   * - OKP JWK "crv" (The Subtype of Key Pair) Parameter
   */
  crv?: string;
  /**
   * - Private RSA JWK "d" (Private Exponent) Parameter
   * - Private EC JWK "d" (ECC Private Key) Parameter
   * - Private OKP JWK "d" (The Private Key) Parameter
   */
  d?: string;
  /** Private RSA JWK "dp" (First Factor CRT Exponent) Parameter */
  dp?: string;
  /** Private RSA JWK "dq" (Second Factor CRT Exponent) Parameter */
  dq?: string;
  /** RSA JWK "e" (Exponent) Parameter */
  e?: string;
  /** Oct JWK "k" (Key Value) Parameter */
  k?: string;
  /** RSA JWK "n" (Modulus) Parameter */
  n?: string;
  /** Private RSA JWK "p" (First Prime Factor) Parameter */
  p?: string;
  /** Private RSA JWK "q" (Second Prime Factor) Parameter */
  q?: string;
  /** Private RSA JWK "qi" (First CRT Coefficient) Parameter */
  qi?: string;
  /**
   * - EC JWK "x" (X Coordinate) Parameter
   * - OKP JWK "x" (The public key) Parameter
   */
  x?: string;
  /** EC JWK "y" (Y Coordinate) Parameter */
  y?: string;
  /** AKP JWK "pub" (Public Key) Parameter */
  pub?: string;
  /** AKP JWK "priv" (Private key) Parameter */
  priv?: string;
}
/**
 * {@link !CryptoKey} is a representation of a key/secret available in all supported runtimes. In
 * addition to the {@link key/import Key Import Functions} you may use the
 * {@link !SubtleCrypto.importKey} API to obtain a {@link !CryptoKey} from your existing key
 * material.
 */
type CryptoKey = Extract<Awaited<ReturnType<typeof crypto.subtle.generateKey>>, {
  type: string;
}>;
//#endregion
//#region src/client/dpop.d.ts

/** Asymmetric JWS algorithms usable for a DPoP proof (RFC 9449 §11.6 forbids symmetric algs and `none`). */
declare const DPOP_SUPPORTED_ALGS: readonly ["ES256", "ES384", "ES512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "EdDSA"];
/** A DPoP JWS algorithm this SDK can sign proofs with. */
type DpopAlg = (typeof DPOP_SUPPORTED_ALGS)[number];
/** A DPoP signing key pair: the private key signs proofs, the public JWK is embedded in them. */
interface DpopKeyPair {
  /** Signs proofs. Non-extractable unless {@linkcode GenerateDpopKeyPairOptions.extractable} was set. */
  privateKey: CryptoKey;
  /** Matches {@linkcode publicJwk}; rarely needed directly. */
  publicKey: CryptoKey;
  /** Embedded in each proof's `jwk` header parameter (RFC 9449 §4.2). */
  publicJwk: JWK;
  /** RFC 7638 JWK SHA-256 thumbprint — the value an authorization server binds as the token's `cnf.jkt`. */
  thumbprint: string;
  /** The JWS algorithm this key pair signs with. */
  alg: DpopAlg;
}
interface GenerateDpopKeyPairOptions {
  /** Signing algorithm. @default 'ES256' */
  alg?: DpopAlg;
  /**
   * Allow the private key to be exported (e.g. for persistence across process restarts).
   *
   * @default false — RFC 9449 §11.1 and §11.7 recommend non-extractable keys (hardware-backed
   * where available) so the private key cannot be exfiltrated by XSS or a compromised dependency.
   * Only set this when the host has its own plan for protecting the exported key material.
   */
  extractable?: boolean;
}
/** Generate an asymmetric DPoP signing key pair. Non-extractable by default (RFC 9449 §11). */
declare function generateDpopKeyPair(options?: GenerateDpopKeyPairOptions): Promise<DpopKeyPair>;
/**
 * Compute the `ath` claim for a DPoP proof presented alongside an access token: the
 * base64url-encoded SHA-256 digest of the ASCII access-token value (RFC 9449 §4.1).
 *
 * Uses Web Crypto (`crypto.subtle`) rather than a Node-only hashing API so this stays usable
 * in browser and edge runtimes.
 */
declare function accessTokenHash(accessToken: string): Promise<string>;
/** Inputs for a single DPoP proof (RFC 9449 §4.2). */
interface DpopProofRequest {
  /** HTTP method of the target request (`htm` claim). Case-normalized to upper-case. */
  htm: string;
  /** HTTP target URI of the request (`htu` claim) — query/fragment are stripped automatically. */
  htu: string | URL;
  /** When set, binds the proof to this access token via the `ath` claim (RFC 9449 §4.1). */
  accessToken?: string;
  /**
   * Explicit server-provided nonce to embed. When omitted, the session's remembered nonce for
   * `htu`'s origin (if any) is used automatically — see {@linkcode DpopSession.rememberNonce}.
   */
  nonce?: string;
}
/**
 * A DPoP signing identity plus the small amount of state RFC 9449 requires across requests:
 * the key pair and, per origin, the most recently server-supplied nonce (RFC 9449 §8/§9).
 *
 * One `DpopSession` is meant to live for the lifetime of a single OAuth client registration —
 * the token endpoint and the resource server are different origins and get independent nonce
 * slots, so a nonce challenge from one never leaks into proofs sent to the other.
 */
declare class DpopSession {
  private readonly keyPair;
  private readonly nonces;
  private constructor();
  /** Create a session with a fresh key pair, or reuse a caller-supplied one. */
  static create(options?: {
    alg?: DpopAlg;
    keyPair?: DpopKeyPair;
  }): Promise<DpopSession>;
  /** RFC 7638 JWK SHA-256 thumbprint of the signing key — matches the token's `cnf.jkt` once bound. */
  get thumbprint(): string;
  /** The JWS algorithm this session signs proofs with. */
  get alg(): DpopAlg;
  /** The public JWK embedded in every proof's `jwk` header parameter. */
  get publicJwk(): JWK;
  /** The remembered nonce for `url`'s origin, if the server has issued one (RFC 9449 §8/§9). */
  nonceFor(url: string | URL): string | undefined;
  /** Record a server-supplied nonce for `url`'s origin (newest-wins, RFC 9449 §8.2). */
  rememberNonce(url: string | URL, nonce: string): void;
  /**
   * Capture a `DPoP-Nonce` response header, if present, for `url`'s origin. RFC 9449 §8.2 says a
   * fresh nonce may ride on *any* response (success or failure), so call this unconditionally
   * after every request, not only on a `use_dpop_nonce` challenge.
   */
  observeNonce(response: Response, url: string | URL): void;
  /**
   * Build a fresh DPoP proof JWT. Always mints a new `jti` — proofs are never cached or reused,
   * since RFC 9449 §4.3 step 9 requires each to be presented at most once.
   */
  buildProof(request: DpopProofRequest): Promise<string>;
}
/**
 * Whether `response` is a resource-server `use_dpop_nonce` challenge (RFC 9449 §9): a `401` whose
 * `WWW-Authenticate` header carries a `DPoP` challenge with `error="use_dpop_nonce"`.
 *
 * A conformant retry re-signs the proof with the nonce {@linkcode DpopSession.observeNonce} just
 * captured — never resend the original proof: RFC 9449 §4.2 requires a unique `jti` per proof, and
 * replaying one across the challenge/retry boundary is itself a violation.
 */
declare function isDpopNonceChallenge(response: Response): boolean;
//#endregion
//#region src/client/authErrors.d.ts
/**
 * Base class for the OAuth-client-flow error family. Concrete subclasses are
 * added to this module alongside the SEP-2468/837/2207/2350/2352 behavior
 * changes that throw them, so callers can catch the whole family with a single
 * `instanceof OAuthClientFlowError` guard once those land.
 *
 * @remarks Nothing in the SDK throws this base class directly. In the release
 * that introduces it no subclass exists yet — the guard is a forward-compat
 * hook and will not match anything until the first behavior change ships.
 */
declare class OAuthClientFlowError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean;
  /**
   * Brand-based type guard: equivalent to `value instanceof this`, as an
   * explicit static predicate (the axios/AWS-SDK `isInstance` style). Reads
   * the caller's own brand via `this`, so every branded subclass gets a
   * correctly-scoped guard by inheritance. Must be invoked on the class —
   * in callback position write `v => SdkError.isInstance(v)`, not
   * `.filter(SdkError.isInstance)` (detached calls throw rather than
   * silently matching nothing).
   */
  static isInstance<T extends abstract new (...args: never[]) => unknown>(this: T, value: unknown): value is InstanceType<T>;
  constructor(message: string);
}
/**
 * Thrown when an authorization-server issuer identifier fails validation.
 *
 * Two checks raise this error, distinguished by {@linkcode IssuerMismatchError.kind | kind}:
 * - `'metadata'` — the `issuer` in fetched authorization-server metadata does
 *   not match the issuer identifier the well-known URL was constructed from
 *   (RFC 8414 §3.3 / OpenID Connect Discovery §4.3).
 * - `'authorization_response'` — the `iss` parameter on the authorization
 *   callback failed RFC 9207 §2.4 validation against the recorded issuer.
 *
 * Intentionally does **not** extend `OAuthError`: the `auth()`
 * orchestrator's `OAuthError` retry block must not swallow this — a mix-up
 * indication is fatal for the flow, not a retryable credential problem.
 *
 * On the `'authorization_response'` path the {@linkcode IssuerMismatchError.received | received}
 * value is attacker-controllable in a mix-up attack; callers **MUST NOT** display
 * it (or any `error`/`error_description`/`error_uri` from the same callback) to
 * end users. The values are JSON-encoded in the message to neutralize log-injection.
 */
declare class IssuerMismatchError extends OAuthClientFlowError {
  /** Which check failed — metadata echo (RFC 8414 §3.3) or authorization-response `iss` (RFC 9207). */
  readonly kind: 'metadata' | 'authorization_response';
  /** The issuer the client expected (from validated metadata / discovery input). */
  readonly expected: string | undefined;
  /** The issuer value that was received. Attacker-controllable on the `'authorization_response'` path. */
  readonly received: string | undefined;
  constructor(kind: 'metadata' | 'authorization_response', expected: string | undefined, received: string | undefined);
}
/**
 * Thrown by `registerClient()` when the authorization server rejects a
 * Dynamic Client Registration request. Carries the HTTP status, the raw
 * response body, and the metadata that was submitted, so callers can inspect
 * the AS's `error` / `error_description` and retry with adjusted metadata
 * (for example a different `application_type`) per SEP-837.
 *
 * The `body` is the raw RFC 7591 error JSON; compare `JSON.parse(body).error`
 * against `OAuthErrorCode` (e.g. `OAuthErrorCode.InvalidRedirectUri`,
 * `OAuthErrorCode.InvalidClientMetadata`).
 *
 * Intentionally does **not** extend `OAuthError`: registration rejection is
 * not a recoverable-by-credential-invalidation condition, and staying outside
 * that hierarchy keeps it from being caught by `auth()`'s `OAuthError` retry
 * path.
 */
declare class RegistrationRejectedError extends OAuthClientFlowError {
  /** HTTP status code returned by the registration endpoint. */
  readonly status: number;
  /** Raw response body text (typically an RFC 7591 error JSON document). */
  readonly body: string;
  /** The exact client metadata that was POSTed (after SDK defaults were applied). */
  readonly submittedMetadata: OAuthClientMetadata;
  constructor(args: {
    status: number;
    body: string;
    submittedMetadata: OAuthClientMetadata;
  });
}
/**
 * Thrown by the token-exchange and refresh paths when the resolved token
 * endpoint is not `https:` and is not a loopback host. The MCP authorization
 * specification requires authorization server endpoints to use HTTPS; loopback
 * hosts are exempt here for local development. This is a configuration error —
 * re-authorizing cannot fix it — so it intentionally does **not** extend
 * `OAuthError` and `auth()`'s refresh branch rethrows it instead of falling
 * through to a fresh `/authorize` redirect.
 */
declare class InsecureTokenEndpointError extends OAuthClientFlowError {
  /** The token endpoint URL that was rejected. */
  readonly tokenEndpoint: string;
  constructor(tokenEndpoint: string);
}
/**
 * Thrown by the HTTP client transport when the server responds with
 * `403 Forbidden` and `WWW-Authenticate: Bearer error="insufficient_scope"`,
 * and either (a) the transport's `onInsufficientScope` option is `'throw'`, or
 * (b) `onInsufficientScope` is the default `'reauthorize'` but the transport
 * has no {@linkcode index.OAuthClientProvider | OAuthClientProvider} to drive
 * step-up (e.g. a minimal `AuthProvider`, `requestInit`-only headers, or no
 * `authProvider`).
 *
 * Carries the challenge parameters so the host can decide whether to initiate
 * step-up authorization itself (e.g., behind a UX gate) or surface the error.
 *
 * Does **not** extend `OAuthError`: that class represents OAuth protocol errors
 * from the authorization server; this is a resource-server challenge surfaced
 * at the transport layer.
 *
 * All fields originate from the resource server's `WWW-Authenticate` header;
 * treat them as untrusted input when displaying or logging (this includes
 * `requiredScope`, which appears in the error message).
 */
/**
 * Thrown by `auth()` and `fetchToken()` when the authorization server in use differs
 * from the one a credential is bound to and the flow cannot simply start over:
 *
 * - on the authorization-code callback leg, when it differs from the one recorded
 *   in `discoveryState()` at redirect time — the `authorization_code` and PKCE
 *   `code_verifier` are bound to the AS that minted the code (RFC 7636);
 * - for client information whose `issuer` stamp names a different authorization
 *   server on a provider that cannot re-register (no `saveClientInformation()`,
 *   e.g. the bundled static-credential providers); `fetchToken()` throws for any provider.
 *
 * Stored tokens and re-registrable client information are protected structurally
 * by the `issuer` stamp instead (they read back as absent).
 */
declare class AuthorizationServerMismatchError extends OAuthClientFlowError {
  /** The issuer the credential is bound to (recorded in `discoveryState()` at redirect time, or stamped on the client information). */
  readonly recordedIssuer: string;
  /** The issuer resolved by discovery on this call. */
  readonly currentIssuer: string;
  constructor(/** The issuer the credential is bound to (recorded in `discoveryState()` at redirect time, or stamped on the client information). */
  recordedIssuer: string, /** The issuer resolved by discovery on this call. */
  currentIssuer: string);
}
declare class InsufficientScopeError extends OAuthClientFlowError {
  /** The `scope` value from the `WWW-Authenticate` challenge — the scopes the resource server says are required. */
  readonly requiredScope?: string;
  /** The `resource_metadata` URL from the `WWW-Authenticate` challenge, if present. */
  readonly resourceMetadataUrl?: URL;
  /** The `error_description` from the `WWW-Authenticate` challenge, if present. */
  readonly errorDescription?: string;
  constructor(init: {
    requiredScope?: string;
    resourceMetadataUrl?: URL;
    errorDescription?: string;
  });
}
//#endregion
//#region src/client/auth.d.ts
/**
 * Function type for adding client authentication to token requests.
 */
type AddClientAuthentication = (headers: Headers, params: URLSearchParams, url: string | URL, metadata?: AuthorizationServerMetadata) => void | Promise<void>;
/**
 * Context passed to {@linkcode AuthProvider.onUnauthorized} when the server
 * responds with 401. Provides everything needed to refresh credentials.
 */
interface UnauthorizedContext {
  /** The 401 response — inspect `WWW-Authenticate` for resource metadata, scope, etc. */
  response: Response;
  /** The MCP server URL, for passing to {@linkcode auth} or discovery helpers. */
  serverUrl: URL;
  /** Fetch function configured with the transport's `requestInit`, for making auth requests. */
  fetchFn: FetchLike;
}
/**
 * Minimal interface for authenticating MCP client transports with bearer tokens.
 *
 * Transports call {@linkcode AuthProvider.token | token()} before every request
 * to obtain the current token, and {@linkcode AuthProvider.onUnauthorized | onUnauthorized()}
 * (if provided) when the server responds with 401, giving the provider a chance
 * to refresh credentials before the transport retries once.
 *
 * For simple cases (API keys, gateway-managed tokens), implement only `token()`:
 * ```typescript
 * const authProvider: AuthProvider = { token: async () => process.env.API_KEY };
 * ```
 *
 * For OAuth flows, pass an {@linkcode OAuthClientProvider} directly — transports
 * accept either shape and adapt OAuth providers automatically via {@linkcode adaptOAuthProvider}.
 */
interface AuthProvider {
  /**
   * Returns the current bearer token, or `undefined` if no token is available.
   * Called before every request.
   */
  token(): Promise<string | undefined>;
  /**
   * Called when the server responds with 401. If provided, the transport will
   * await this, then retry the request once. If the retry also gets 401, the
   * transport throws `SdkHttpError` (`SdkErrorCode.ClientHttpAuthentication`). If
   * this method is not provided, the transport throws {@linkcode UnauthorizedError}.
   *
   * Implementations should refresh tokens, re-authenticate, etc. — whatever is
   * needed so the next `token()` call returns a valid token.
   */
  onUnauthorized?(ctx: UnauthorizedContext): Promise<void>;
}
/**
 * Context passed to the credential-persistence methods on
 * {@linkcode OAuthClientProvider} — `clientInformation` / `saveClientInformation`
 * and `tokens` / `saveTokens`. Carries the resolved authorization-server `issuer`
 * so provider implementations can key persisted credentials per authorization
 * server (RFC 6749 §2.2 — client identifiers are unique to the AS that issued
 * them). Providers that store a single credential set may ignore it.
 */
interface OAuthClientInformationContext {
  /**
   * The authorization server's `issuer` identifier from its validated metadata
   * document, used as the binding key for persisted credentials.
   */
  issuer: string;
}
/**
 * Implements an end-to-end OAuth client to be used with one MCP server.
 *
 * This client relies upon a concept of an authorized "session," the exact
 * meaning of which is application-defined. Tokens, authorization codes, and
 * code verifiers should not cross different sessions.
 *
 * Transports accept `OAuthClientProvider` directly via the `authProvider` option —
 * they adapt it to {@linkcode AuthProvider} internally via {@linkcode adaptOAuthProvider}.
 * No changes are needed to existing implementations.
 */
interface OAuthClientProvider {
  /**
   * The URL to redirect the user agent to after authorization.
   * Return `undefined` for non-interactive flows that don't require user interaction
   * (e.g., `client_credentials`, `jwt-bearer`).
   */
  get redirectUrl(): string | URL | undefined;
  /**
   * External URL the server should use to fetch client metadata document
   */
  clientMetadataUrl?: string;
  /**
   * Metadata about this OAuth client.
   */
  get clientMetadata(): OAuthClientMetadata;
  /**
   * Returns an OAuth2 state parameter.
   */
  state?(): string | Promise<string>;
  /**
   * Loads information about this OAuth client, as registered already with the
   * server, or returns `undefined` if the client is not registered with the
   * server.
   *
   * @param ctx - Carries the resolved authorization-server `issuer`. Providers
   *   that persist credentials per authorization server should return the entry
   *   keyed by `ctx.issuer`. Providers with a single credential set may ignore it.
   */
  clientInformation(ctx?: OAuthClientInformationContext): StoredOAuthClientInformation | undefined | Promise<StoredOAuthClientInformation | undefined>;
  /**
   * If implemented, this permits the OAuth client to dynamically register with
   * the server. Client information saved this way should later be read via
   * {@linkcode OAuthClientProvider.clientInformation | clientInformation()}.
   *
   * This method is not required to be implemented if client information is
   * statically known (e.g., pre-registered).
   *
   * @param ctx - Carries the resolved authorization-server `issuer`. Providers
   *   that persist credentials per authorization server should store the entry
   *   keyed by `ctx.issuer`.
   */
  saveClientInformation?(clientInformation: StoredOAuthClientInformation, ctx?: OAuthClientInformationContext): void | Promise<void>;
  /**
   * Loads any existing OAuth tokens for the current session, or returns
   * `undefined` if there are no saved tokens.
   *
   * @param ctx - Carries the resolved authorization-server `issuer`. Providers
   *   that persist tokens per authorization server should return the entry
   *   keyed by `ctx.issuer`. Providers with a single token set may ignore it.
   *   When called with no `ctx` — the transport's per-request bearer-token
   *   read — return the most-recently-saved token set; do not return
   *   `undefined` for `ctx === undefined`.
   */
  tokens(ctx?: OAuthClientInformationContext): StoredOAuthTokens | undefined | Promise<StoredOAuthTokens | undefined>;
  /**
   * Stores new OAuth tokens for the current session, after a successful
   * authorization.
   *
   * @param ctx - Carries the resolved authorization-server `issuer`. Providers
   *   that persist tokens per authorization server should store the entry
   *   keyed by `ctx.issuer`.
   */
  saveTokens(tokens: StoredOAuthTokens, ctx?: OAuthClientInformationContext): void | Promise<void>;
  /**
   * Invoked to redirect the user agent to the given URL to begin the authorization flow.
   */
  redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;
  /**
   * Saves a PKCE code verifier for the current session, before redirecting to
   * the authorization flow.
   */
  saveCodeVerifier(codeVerifier: string): void | Promise<void>;
  /**
   * Loads the PKCE code verifier for the current session, necessary to validate
   * the authorization result.
   */
  codeVerifier(): string | Promise<string>;
  /**
   * Adds custom client authentication to OAuth token requests.
   *
   * This optional method allows implementations to customize how client credentials
   * are included in token exchange and refresh requests. When provided, this method
   * is called instead of the default authentication logic, giving full control over
   * the authentication mechanism.
   *
   * Common use cases include:
   * - Supporting authentication methods beyond the standard OAuth 2.0 methods
   * - Adding custom headers for proprietary authentication schemes
   * - Implementing client assertion-based authentication (e.g., JWT bearer tokens)
   *
   * @param headers - The request headers (can be modified to add authentication)
   * @param params - The request body parameters (can be modified to add credentials)
   * @param url - The token endpoint URL being called
   * @param metadata - Optional OAuth metadata for the server, which may include supported authentication methods
   */
  addClientAuthentication?: AddClientAuthentication;
  /**
   * Enables DPoP (RFC 9449 / SEP-1932) sender-constrained tokens when implemented. When this
   * resolves to a {@linkcode DpopSession}, {@linkcode auth} signs a DPoP proof into the token
   * request, and the transports (and {@linkcode withOAuth}) present a resulting `token_type: DPoP`
   * access token with the `DPoP` Authorization scheme plus a fresh per-request proof instead of
   * `Bearer`, by wrapping their resource-server `fetch` with {@linkcode withDpopFromProvider}.
   *
   * Return the *same* session across calls — the AS/RS nonce state and signing key it holds are
   * meant to persist for the life of this client registration. A minimal implementation:
   * ```typescript
   * class MyProvider implements OAuthClientProvider {
   *     private _dpop = DpopSession.create();
   *     dpop() { return this._dpop; }
   *     // ...
   * }
   * ```
   *
   * Left undefined (the default), the provider behaves exactly as before this option existed:
   * plain Bearer tokens throughout.
   */
  dpop?(): DpopSession | undefined | Promise<DpopSession | undefined>;
  /**
   * If defined, overrides the selection and validation of the
   * RFC 8707 Resource Indicator. If left undefined, default
   * validation behavior will be used.
   *
   * Implementations must verify the returned resource matches the MCP server.
   */
  validateResourceURL?(serverUrl: string | URL, resource?: string): Promise<URL | undefined>;
  /**
   * Returns the `scope` that {@linkcode auth} sends on a refresh-token request. Left undefined
   * (the default), or when it returns `undefined` or `''`, the request carries no `scope`, which
   * asks for the scope already granted (RFC 6749 §6).
   *
   * Implement it only for an authorization server that rejects a refresh without `scope`:
   * other servers may reject or narrow a refresh that carries one. The returned value must
   * not include a scope that was not originally granted.
   *
   * @param tokens - The stored tokens being refreshed; `tokens.scope` is the scope last saved with them.
   */
  scopeForRefresh?(tokens: StoredOAuthTokens): string | undefined | Promise<string | undefined>;
  /**
   * If implemented, provides a way for the client to invalidate (e.g. delete) the specified
   * credentials, in the case where the server has indicated that they are no longer valid.
   * This avoids requiring the user to intervene manually.
   */
  invalidateCredentials?(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void | Promise<void>;
  /**
   * Prepares grant-specific parameters for a token request.
   *
   * This optional method allows providers to customize the token request based on
   * the grant type they support. When implemented, it returns the grant type and
   * any grant-specific parameters needed for the token exchange.
   *
   * If not implemented, the default behavior depends on the flow:
   * - For authorization code flow: uses `code`, `code_verifier`, and `redirect_uri`
   * - For `client_credentials`: detected via `grant_types` in {@linkcode OAuthClientProvider.clientMetadata | clientMetadata}
   *
   * @param scope - Optional scope to request
   * @returns Grant type and parameters, or `undefined` to use default behavior
   *
   * @example
   * // For client_credentials grant:
   * prepareTokenRequest(scope) {
   *   return {
   *     grantType: 'client_credentials',
   *     params: scope ? { scope } : {}
   *   };
   * }
   *
   * @example
   * // For authorization_code grant (default behavior):
   * async prepareTokenRequest() {
   *   return {
   *     grantType: 'authorization_code',
   *     params: {
   *       code: this.authorizationCode,
   *       code_verifier: await this.codeVerifier(),
   *       redirect_uri: String(this.redirectUrl)
   *     }
   *   };
   * }
   */
  prepareTokenRequest?(scope?: string): URLSearchParams | Promise<URLSearchParams | undefined> | undefined;
  /**
   * Saves the resolved authorization-server **issuer**. Called after a successful
   * token exchange (timing changed in v2: was post-discovery, now post-`saveTokens`).
   *
   * @deprecated Superseded by the `issuer` stamp on stored tokens / client credentials
   * (SEP-2352). {@linkcode auth} still **writes** this for back-compat with providers
   * that read it (e.g. Cross-App Access), but the SDK never reads it. Prefer reading
   * the `issuer` field on the value passed to {@linkcode saveTokens} /
   * {@linkcode saveClientInformation}, or the `ctx.issuer` argument.
   */
  saveAuthorizationServerUrl?(authorizationServerUrl: string): void | Promise<void>;
  /**
   * Returns the previously saved authorization server URL, if available.
   *
   * @deprecated Superseded by the `issuer` stamp on stored tokens / client credentials
   * (SEP-2352). The SDK never reads this method; it remains for provider implementations
   * that consume the value internally (e.g. Cross-App Access).
   */
  authorizationServerUrl?(): string | undefined | Promise<string | undefined>;
  /**
   * Saves the resource URL after RFC 9728 discovery.
   * This method is called by {@linkcode auth} after successful discovery of the
   * resource metadata.
   *
   * Providers implementing Cross-App Access or other flows that need access to
   * the discovered resource URL should implement this method.
   *
   * @param resourceUrl - The resource URL discovered via RFC 9728
   */
  saveResourceUrl?(resourceUrl: string): void | Promise<void>;
  /**
   * Returns the previously saved resource URL, if available.
   *
   * Providers implementing Cross-App Access can use this to access the
   * resource URL discovered during the OAuth flow.
   *
   * @returns The resource URL, or `undefined` if not available
   */
  resourceUrl?(): string | undefined | Promise<string | undefined>;
  /**
   * Saves the OAuth discovery state after RFC 9728 and authorization server metadata
   * discovery. Providers can persist this state to avoid redundant discovery requests
   * on subsequent {@linkcode auth} calls.
   *
   * This state can also be provided out-of-band (e.g., from a previous session or
   * external configuration) to bootstrap the OAuth flow without discovery.
   *
   * Called by {@linkcode auth} after successful discovery.
   *
   * MUST persist with the same durability as `codeVerifier` (survives the redirect
   * round-trip).
   */
  saveDiscoveryState?(state: OAuthDiscoveryState): void | Promise<void>;
  /**
   * Returns previously saved discovery state, or `undefined` if none is cached.
   *
   * When available, {@linkcode auth} restores the discovery state (authorization server
   * URL, resource metadata, etc.) instead of performing RFC 9728 discovery, reducing
   * latency on subsequent calls.
   *
   * Hosts should call {@linkcode invalidateCredentials} with scope `'discovery'`
   * on repeated 401s so a changed `authorization_servers` list is picked up; the
   * SDK does not invoke that scope itself.
   *
   * MUST persist with the same durability as `codeVerifier` (survives the redirect
   * round-trip).
   */
  discoveryState?(): OAuthDiscoveryState | undefined | Promise<OAuthDiscoveryState | undefined>;
}
/**
 * Discovery state that can be persisted across sessions by an {@linkcode OAuthClientProvider}.
 *
 * Contains the results of RFC 9728 protected resource metadata discovery and
 * authorization server metadata discovery. Persisting this state avoids
 * redundant discovery HTTP requests on subsequent {@linkcode auth} calls.
 */
interface OAuthDiscoveryState extends OAuthServerInfo {
  /** The URL at which the protected resource metadata was found, if available. */
  resourceMetadataUrl?: string;
}
type AuthResult = 'AUTHORIZED' | 'REDIRECT';
declare class UnauthorizedError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean;
  /**
   * Brand-based type guard: equivalent to `value instanceof this`, as an
   * explicit static predicate (the axios/AWS-SDK `isInstance` style). Reads
   * the caller's own brand via `this`, so every branded subclass gets a
   * correctly-scoped guard by inheritance. Must be invoked on the class —
   * in callback position write `v => SdkError.isInstance(v)`, not
   * `.filter(SdkError.isInstance)` (detached calls throw rather than
   * silently matching nothing).
   */
  static isInstance<T extends abstract new (...args: never[]) => unknown>(this: T, value: unknown): value is InstanceType<T>;
  constructor(message?: string);
}
declare function validateAuthorizationResponseIssuer({
  iss,
  expectedIssuer,
  issParameterSupported
}: {
  /** The form-urldecoded `iss` query parameter from the authorization callback, or `undefined` if absent. */
  iss: string | undefined;
  /** The `issuer` value from the authorization server's validated metadata document. */
  expectedIssuer: string | undefined;
  /** Whether the metadata advertised `authorization_response_iss_parameter_supported: true`. */
  issParameterSupported: boolean;
}): void;
/**
 * Computes the union of one or more OAuth `scope` strings.
 *
 * Each argument is a space-delimited scope string per RFC 6749 §3.3, or
 * `undefined`. The result is a single space-delimited string containing each
 * distinct scope token exactly once, in first-seen order, or `undefined` if
 * every input is empty/undefined.
 *
 * No hierarchical deduplication is performed: a union may contain semantically
 * redundant entries (e.g., a broad scope alongside a narrower one it implies).
 * Authorization servers normalize such redundancy during token issuance; the
 * spec's step-up flow does not require clients to.
 *
 * Used by the transport's `403 insufficient_scope` step-up path to accumulate
 * previously-requested scopes with newly-challenged scopes so re-authorization
 * does not lose previously-granted permissions.
 */
declare function computeScopeUnion(...scopes: ReadonlyArray<string | undefined>): string | undefined;
/**
 * Whether `union` contains at least one scope token not present in `current`.
 * Both arguments are space-delimited scope strings per RFC 6749 §3.3.
 *
 * Used to gate the step-up refresh bypass: when the union of previously-requested
 * and newly-challenged scopes is a strict superset of the current token's
 * granted scope, refreshing cannot widen the grant (RFC 6749 §6), so the
 * transport must force a fresh authorization request instead. When the current
 * token already covers the union, refresh remains valid.
 *
 * An undefined or empty `current` is treated as the empty set, so any non-empty
 * `union` is a strict superset. Note that per RFC 6749 §3.3 an authorization
 * server MAY omit the token's `scope` field when it equals the requested scope;
 * this helper is conservative and treats an absent token `scope` as empty, so
 * step-up always forces a fresh authorization request in that case rather than
 * risking a refresh that silently drops the widened scope.
 */
declare function isStrictScopeSuperset(union: string | undefined, current: string | undefined): boolean;
type ClientAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none';
/**
 * Determines the best client authentication method to use based on server support and client configuration.
 *
 * Priority order (highest to lowest):
 * 1. `client_secret_basic` (if client secret is available)
 * 2. `client_secret_post` (if client secret is available)
 * 3. `none` (for public clients)
 *
 * @param clientInformation - OAuth client information containing credentials
 * @param supportedMethods - Authentication methods supported by the authorization server
 * @returns The selected authentication method
 */
declare function selectClientAuthMethod(clientInformation: OAuthClientInformationMixed, supportedMethods: string[]): ClientAuthMethod;
/**
 * Refuse to send credentials to a non-TLS token endpoint. The MCP authorization
 * specification requires authorization server endpoints to use HTTPS. Loopback
 * hosts are exempt here for local development.
 *
 * @throws {@linkcode InsecureTokenEndpointError} if the endpoint is insecure.
 */
declare function assertSecureTokenEndpoint(tokenEndpoint: string | URL): URL;
/**
 * Reads {@linkcode OAuthClientProvider.clientMetadata | clientMetadata} from the
 * provider and fills the SEP-837 / SEP-2207 defaults the SDK relies on, so
 * {@linkcode registerClient} sees a consistent, fully-populated document.
 *
 * - `grant_types` defaults to `['authorization_code', 'refresh_token']` for
 *   interactive providers (those with a {@linkcode OAuthClientProvider.redirectUrl | redirectUrl})
 *   so authorization servers that gate refresh-token issuance on the registered
 *   grant types issue one (SEP-2207). Non-interactive providers (no
 *   `redirectUrl`) get no `grant_types` default. This default applies to the
 *   Dynamic Client Registration body only — it does **not** drive
 *   {@linkcode determineScope}'s `offline_access` augmentation.
 * - `application_type` defaults from `redirect_uris`: loopback redirect hosts
 *   and custom URI schemes → `'native'`, otherwise `'web'` (SEP-837 / RFC 8252).
 *
 * A field the consumer set explicitly is **never** overwritten. {@linkcode auth}
 * calls this once at the top of the flow; direct callers of
 * {@linkcode registerClient} that want the same defaults should pass the result
 * of this function as `clientMetadata`.
 */
declare function resolveClientMetadata(provider: Pick<OAuthClientProvider, 'clientMetadata' | 'redirectUrl'>): OAuthClientMetadata;
/**
 * Parses an OAuth error response from a string or Response object.
 *
 * If the input is a standard OAuth2.0 error response, it will be parsed according to the spec
 * and an {@linkcode OAuthError} will be returned with the appropriate error code.
 * If parsing fails, it falls back to a generic {@linkcode OAuthErrorCode.ServerError | ServerError} that includes
 * the response status (if available) and original content.
 *
 * @param input - A Response object or string containing the error response
 * @returns A Promise that resolves to an {@linkcode OAuthError} instance
 */
declare function parseErrorResponse(input: Response | string): Promise<OAuthError>;
/**
 * Options for {@linkcode auth}. The full OAuth flow orchestrator's input.
 */
interface AuthOptions {
  /** The MCP server URL — the protected resource the flow authorizes against. */
  serverUrl: string | URL;
  /**
   * The authorization code returned by the authorization server on the redirect
   * callback. When set, {@linkcode auth} exchanges it for tokens; when unset,
   * {@linkcode auth} runs discovery and either refreshes or initiates redirect.
   */
  authorizationCode?: string;
  /**
   * The form-urldecoded `iss` query parameter from the authorization callback,
   * if present. Passed through to RFC 9207 §2.4 issuer validation alongside
   * `authorizationCode`. Validated against the recorded issuer per RFC 9207
   * §2.4 before the code is redeemed — see
   * {@linkcode validateAuthorizationResponseIssuer} and the migration guide's
   * *Authorization-server mix-up defense* section.
   */
  iss?: string;
  /** Scope to request; computed by Scope Selection Strategy when omitted. */
  scope?: string;
  /** Explicit `resource_metadata` URL from a `WWW-Authenticate` challenge. */
  resourceMetadataUrl?: URL;
  /** Custom `fetch` implementation. */
  fetchFn?: FetchLike;
  /**
   * Opt-out for the RFC 8414 §3.3 issuer-echo check during authorization
   * server discovery. Disabling it is **security-weakening** and intended only
   * for authorization servers known to publish a mismatched `issuer`. The unchecked
   * `issuer` is also what `expectedIssuer` and stored `issuer` stamps are compared with.
   *
   * @default false
   */
  skipIssuerMetadataValidation?: boolean;
  /**
   * When `true`, {@linkcode auth} skips the refresh-token branch even when a
   * `refresh_token` is available, and proceeds directly to a fresh
   * authorization request ({@linkcode startAuthorization}).
   *
   * Set by the transport's `403 insufficient_scope` step-up path when the
   * required scope is a strict superset of the current token's granted scope:
   * the refresh grant cannot widen scope (RFC 6749 §6), so refreshing would
   * silently drop the new scope and the next request would 403 again. Forcing
   * a fresh authorization request ensures the widened scope reaches the
   * authorization server.
   *
   * Hosts driving step-up themselves (with `onInsufficientScope: 'throw'`)
   * should set this when {@linkcode isStrictScopeSuperset} of the union over
   * the current token's `scope` is `true`.
   *
   * @default false
   */
  forceReauthorization?: boolean;
}
/**
 * Orchestrates the full auth flow with a server.
 *
 * This can be used as a single entry point for all authorization functionality,
 * instead of linking together the other lower-level functions in this module.
 */
declare function auth(provider: OAuthClientProvider, options: AuthOptions): Promise<AuthResult>;
/**
 * Validates that the given `clientMetadataUrl` is a valid HTTPS URL with a non-root pathname.
 *
 * No-op when `url` is `undefined` or empty (providers that do not use URL-based client IDs
 * are unaffected). When the value is defined but invalid, throws an {@linkcode OAuthError}
 * with code {@linkcode OAuthErrorCode.InvalidClientMetadata}.
 *
 * {@linkcode OAuthClientProvider} implementations that accept a `clientMetadataUrl` should
 * call this in their constructors for early validation.
 *
 * @param url - The `clientMetadataUrl` value to validate (from `OAuthClientProvider.clientMetadataUrl`)
 * @throws {OAuthError} When `url` is defined but is not a valid HTTPS URL with a non-root pathname
 */
declare function validateClientMetadataUrl(url: string | undefined): void;
/**
 * SEP-991: URL-based Client IDs
 * Validate that the `client_id` is a valid URL with `https` scheme
 */
declare function isHttpsUrl(value?: string): boolean;
/**
 * Selects the RFC 8707 resource indicator for an MCP server: the provider's
 * {@linkcode OAuthClientProvider.validateResourceURL | validateResourceURL} result when
 * implemented, otherwise the protected resource metadata's `resource` (checked against the
 * server URL with `checkResourceAllowed`), or `undefined` when there is no metadata.
 *
 * The result is a parsed `URL`, so a pathless indicator such as `https://example.com` has
 * the `href` `https://example.com/`. {@linkcode auth} therefore sends the metadata string
 * verbatim instead of this URL's `href` (#1968); callers that emit the `resource`
 * parameter themselves should do the same.
 */
declare function selectResourceURL(serverUrl: string | URL, provider: OAuthClientProvider, resourceMetadata?: OAuthProtectedResourceMetadata): Promise<URL | undefined>;
/**
 * Extract `resource_metadata`, `scope`, `error`, and `error_description` from a
 * `WWW-Authenticate` header.
 *
 * Recognizes both the `Bearer` scheme (RFC 6750) and the `DPoP` scheme (RFC 9449 §7.1,
 * SEP-1932) — a DPoP-protected resource's challenge carries the same parameters under `DPoP`
 * instead of `Bearer`, and this must still surface `resource_metadata`/`scope` from it for
 * discovery and SEP-2350 step-up to work against such a resource.
 */
declare function extractWWWAuthenticateParams(res: Response): {
  resourceMetadataUrl?: URL;
  scope?: string;
  error?: string;
  errorDescription?: string;
};
/**
 * Extract `resource_metadata` from response header.
 * @deprecated Use {@linkcode extractWWWAuthenticateParams} instead.
 */
declare function extractResourceMetadataUrl(res: Response): URL | undefined;
/**
 * Looks up {@link https://datatracker.ietf.org/doc/html/rfc9728 | RFC 9728}
 * OAuth 2.0 Protected Resource Metadata.
 *
 * If the server returns a 404 for the well-known endpoint, this function will
 * return `undefined`. Any other errors will be thrown as exceptions.
 */
declare function discoverOAuthProtectedResourceMetadata(serverUrl: string | URL, opts?: {
  protocolVersion?: string;
  resourceMetadataUrl?: string | URL;
}, fetchFn?: FetchLike): Promise<OAuthProtectedResourceMetadata>;
/**
 * Looks up RFC 8414 OAuth 2.0 Authorization Server Metadata.
 *
 * If the server returns a 404 for the well-known endpoint, this function will
 * return `undefined`. Any other errors will be thrown as exceptions.
 *
 * @deprecated This function is deprecated in favor of {@linkcode discoverAuthorizationServerMetadata}.
 */
declare function discoverOAuthMetadata(issuer: string | URL, {
  authorizationServerUrl,
  protocolVersion
}?: {
  authorizationServerUrl?: string | URL;
  protocolVersion?: string;
}, fetchFn?: FetchLike): Promise<OAuthMetadata | undefined>;
/**
 * Builds a list of discovery URLs to try for authorization server metadata.
 * URLs are returned in priority order:
 * 1. OAuth metadata at the given URL
 * 2. OIDC metadata endpoints at the given URL
 */
declare function buildDiscoveryUrls(authorizationServerUrl: string | URL): {
  url: URL;
  type: 'oauth' | 'oidc';
}[];
/**
 * Discovers authorization server metadata with support for
 * {@link https://datatracker.ietf.org/doc/html/rfc8414 | RFC 8414} OAuth 2.0
 * Authorization Server Metadata and
 * {@link https://openid.net/specs/openid-connect-discovery-1_0.html | OpenID Connect Discovery 1.0}
 * specifications.
 *
 * This function implements a fallback strategy for authorization server discovery:
 * 1. Attempts RFC 8414 OAuth metadata discovery first
 * 2. If OAuth discovery fails, falls back to OpenID Connect Discovery
 *
 * @param authorizationServerUrl - The authorization server URL obtained from the MCP Server's
 *                                 protected resource metadata, or the MCP server's URL if the
 *                                 metadata was not found.
 * The returned metadata's `issuer` is validated against `authorizationServerUrl`
 * per RFC 8414 §3.3 (and OIDC Discovery §4.3): if they differ the metadata is
 * **rejected** with {@linkcode IssuerMismatchError} and not returned. Set
 * `skipIssuerValidation: true` to suppress this check — **security-weakening**,
 * intended only for known-misconfigured authorization servers.
 *
 * @param options - Configuration options
 * @param options.fetchFn - Optional fetch function for making HTTP requests, defaults to global fetch
 * @param options.protocolVersion - MCP protocol version to use, defaults to {@linkcode LATEST_PROTOCOL_VERSION}
 * @param options.skipIssuerValidation - Skip the RFC 8414 §3.3 `issuer` echo check. **Security-weakening.**
 * @returns Promise resolving to authorization server metadata, or undefined if discovery fails
 * @throws {IssuerMismatchError} when the metadata's `issuer` does not match `authorizationServerUrl`
 */
declare function discoverAuthorizationServerMetadata(authorizationServerUrl: string | URL, {
  fetchFn,
  protocolVersion,
  skipIssuerValidation
}?: {
  fetchFn?: FetchLike;
  protocolVersion?: string;
  skipIssuerValidation?: boolean;
}): Promise<AuthorizationServerMetadata | undefined>;
/**
 * Result of {@linkcode discoverOAuthServerInfo}.
 */
interface OAuthServerInfo {
  /**
   * The authorization server URL, either discovered via RFC 9728
   * or derived from the MCP server URL as a fallback.
   */
  authorizationServerUrl: string;
  /**
   * The authorization server metadata (endpoints, capabilities),
   * or `undefined` if metadata discovery failed.
   */
  authorizationServerMetadata?: AuthorizationServerMetadata;
  /**
   * The OAuth 2.0 Protected Resource Metadata from RFC 9728,
   * or `undefined` if the server does not support it.
   */
  resourceMetadata?: OAuthProtectedResourceMetadata;
}
/**
 * Discovers the authorization server for an MCP server following
 * {@link https://datatracker.ietf.org/doc/html/rfc9728 | RFC 9728} (OAuth 2.0 Protected
 * Resource Metadata), with fallback to treating the server URL as the
 * authorization server.
 *
 * This function combines two discovery steps into one call:
 * 1. Probes `/.well-known/oauth-protected-resource` on the MCP server to find the
 *    authorization server URL (RFC 9728).
 * 2. Fetches authorization server metadata from that URL (RFC 8414 / OpenID Connect Discovery).
 *
 * Use this when you need the authorization server metadata for operations outside the
 * {@linkcode auth} orchestrator, such as token refresh or token revocation.
 *
 * @param serverUrl - The MCP resource server URL
 * @param opts - Optional configuration
 * @param opts.resourceMetadataUrl - Override URL for the protected resource metadata endpoint
 * @param opts.fetchFn - Custom fetch function for HTTP requests
 * @returns Authorization server URL, metadata, and resource metadata (if available)
 */
declare function discoverOAuthServerInfo(serverUrl: string | URL, opts?: {
  resourceMetadataUrl?: URL;
  fetchFn?: FetchLike;
  /**
   * Forwarded to {@linkcode discoverAuthorizationServerMetadata} as
   * `skipIssuerValidation`. **Security-weakening** — see {@linkcode AuthOptions.skipIssuerMetadataValidation}.
   */
  skipIssuerMetadataValidation?: boolean;
}): Promise<OAuthServerInfo>;
/**
 * Begins the authorization flow with the given server, by generating a PKCE challenge and constructing the authorization URL.
 */
declare function startAuthorization(authorizationServerUrl: string | URL, {
  metadata,
  clientInformation,
  redirectUrl,
  scope,
  state,
  resource
}: {
  metadata?: AuthorizationServerMetadata;
  clientInformation: OAuthClientInformationMixed;
  redirectUrl: string | URL;
  scope?: string;
  state?: string;
  resource?: string | URL;
}): Promise<{
  authorizationUrl: URL;
  codeVerifier: string;
}>;
/**
 * Prepares token request parameters for an authorization code exchange.
 *
 * This is the default implementation used by {@linkcode fetchToken} when the provider
 * doesn't implement {@linkcode OAuthClientProvider.prepareTokenRequest | prepareTokenRequest}.
 *
 * @param authorizationCode - The authorization code received from the authorization endpoint
 * @param codeVerifier - The PKCE code verifier
 * @param redirectUri - The redirect URI used in the authorization request
 * @returns URLSearchParams for the `authorization_code` grant
 */
declare function prepareAuthorizationCodeRequest(authorizationCode: string, codeVerifier: string, redirectUri: string | URL): URLSearchParams;
/**
 * Exchanges an authorization code for an access token with the given server.
 *
 * Supports multiple client authentication methods as specified in OAuth 2.1:
 * - Automatically selects the best authentication method based on server support
 * - Falls back to appropriate defaults when server metadata is unavailable
 *
 * @param authorizationServerUrl - The authorization server's base URL
 * @param options - Configuration object containing client info, auth code, etc.
 * @returns Promise resolving to OAuth tokens
 * @throws {Error} When token exchange fails or authentication is invalid
 */
declare function exchangeAuthorization(authorizationServerUrl: string | URL, {
  metadata,
  clientInformation,
  authorizationCode,
  iss,
  codeVerifier,
  redirectUri,
  resource,
  addClientAuthentication,
  dpop,
  fetchFn
}: {
  metadata?: AuthorizationServerMetadata;
  clientInformation: OAuthClientInformationMixed;
  authorizationCode: string;
  /**
   * The form-urldecoded `iss` query parameter from the authorization callback.
   * Validated per RFC 9207 §2.4 against `metadata.issuer` before the code is
   * redeemed; see {@linkcode validateAuthorizationResponseIssuer}.
   */
  iss?: string;
  codeVerifier: string;
  redirectUri: string | URL;
  resource?: string | URL;
  addClientAuthentication?: OAuthClientProvider['addClientAuthentication'];
  /** SEP-1932 / RFC 9449: see {@linkcode executeTokenRequest}'s `dpop` option. */
  dpop?: DpopSession;
  fetchFn?: FetchLike;
}): Promise<OAuthTokens>;
/**
 * Exchange a refresh token for an updated access token.
 *
 * Supports multiple client authentication methods as specified in OAuth 2.1:
 * - Automatically selects the best authentication method based on server support
 * - Preserves the original refresh token if a new one is not returned
 *
 * @param authorizationServerUrl - The authorization server's base URL
 * @param options - Configuration object containing client info, refresh token, etc.
 * @returns Promise resolving to OAuth tokens (preserves original `refresh_token` if not replaced)
 * @throws {Error} When token refresh fails or authentication is invalid
 */
declare function refreshAuthorization(authorizationServerUrl: string | URL, {
  metadata,
  clientInformation,
  refreshToken,
  scope,
  resource,
  addClientAuthentication,
  dpop,
  fetchFn
}: {
  metadata?: AuthorizationServerMetadata;
  clientInformation: OAuthClientInformationMixed;
  refreshToken: string;
  /**
   * `scope` to send on the request; omitted or `''` sends none, which asks for the scope
   * already granted (RFC 6749 §6). When sent, it is also the result's `scope` if the response has none.
   */
  scope?: string;
  resource?: string | URL;
  addClientAuthentication?: OAuthClientProvider['addClientAuthentication'];
  /** SEP-1932 / RFC 9449: see {@linkcode executeTokenRequest}'s `dpop` option. */
  dpop?: DpopSession;
  fetchFn?: FetchLike;
}): Promise<OAuthTokens>;
/**
 * Unified token fetching that works with any grant type via {@linkcode OAuthClientProvider.prepareTokenRequest | prepareTokenRequest()}.
 *
 * This function provides a single entry point for obtaining tokens regardless of the
 * OAuth grant type. The provider's `prepareTokenRequest()` method determines which grant
 * to use and supplies the grant-specific parameters.
 *
 * @param provider - OAuth client provider that implements `prepareTokenRequest()`
 * @param authorizationServerUrl - The authorization server's base URL
 * @param options - Configuration for the token request
 * @returns Promise resolving to OAuth tokens
 * @throws {Error} When provider doesn't implement `prepareTokenRequest` or token fetch fails
 *
 * @example
 * ```ts source="./auth.examples.ts#fetchToken_clientCredentials"
 * // Provider for client_credentials:
 * class MyProvider extends MyProviderBase implements OAuthClientProvider {
 *     prepareTokenRequest(scope?: string) {
 *         const params = new URLSearchParams({ grant_type: 'client_credentials' });
 *         if (scope) params.set('scope', scope);
 *         return params;
 *     }
 * }
 *
 * const tokens = await fetchToken(new MyProvider(), authServerUrl, { metadata });
 * ```
 */
declare function fetchToken(provider: OAuthClientProvider, authorizationServerUrl: string | URL, {
  metadata,
  resource,
  authorizationCode,
  iss,
  scope,
  fetchFn
}?: {
  metadata?: AuthorizationServerMetadata;
  resource?: string | URL;
  /** Authorization code for the default `authorization_code` grant flow */
  authorizationCode?: string;
  /**
   * The form-urldecoded `iss` query parameter from the authorization callback.
   * Validated per RFC 9207 §2.4 when `authorizationCode` is present;
   * see {@linkcode validateAuthorizationResponseIssuer}.
   */
  iss?: string;
  /** Optional scope parameter from auth() options */
  scope?: string;
  fetchFn?: FetchLike;
}): Promise<OAuthTokens>;
/**
 * Performs OAuth 2.0 Dynamic Client Registration according to
 * {@link https://datatracker.ietf.org/doc/html/rfc7591 | RFC 7591}.
 *
 * If `scope` is provided, it overrides `clientMetadata.scope` in the registration
 * request body. This allows callers to apply the Scope Selection Strategy (SEP-835)
 * consistently across both DCR and the subsequent authorization request.
 *
 * @deprecated Dynamic Client Registration is deprecated as of protocol version
 * 2026-07-28 in favor of Client ID Metadata Documents (SEP-991); the deprecation
 * landed via spec PR
 * {@link https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2858 | modelcontextprotocol#2858}
 * (SEP-2577 is the separate roots/sampling/logging deprecation). Remains
 * functional during the deprecation window — at least twelve months under the
 * feature lifecycle policy (SEP-2596), so 2027-07-28 is the earliest possible
 * removal date. Prefer a CIMD URL `client_id` when the authorization server
 * advertises `client_id_metadata_document_supported`: the built-in `auth()` flow
 * skips registration for you when that capability is advertised AND your
 * provider supplies `clientMetadataUrl`, but `registerClient` itself does not
 * gate — calling it directly always sends the registration request.
 */
declare function registerClient(authorizationServerUrl: string | URL, {
  metadata,
  clientMetadata,
  scope,
  fetchFn
}: {
  metadata?: AuthorizationServerMetadata;
  clientMetadata: OAuthClientMetadata;
  scope?: string;
  fetchFn?: FetchLike;
}): Promise<OAuthClientInformationFull>;
//#endregion
//#region src/client/authExtensions.d.ts
/**
 * Helper to produce a `private_key_jwt` client authentication function.
 *
 * @example
 * ```ts source="./authExtensions.examples.ts#createPrivateKeyJwtAuth_basicUsage"
 * const addClientAuth = createPrivateKeyJwtAuth({
 *     issuer: 'my-client',
 *     subject: 'my-client',
 *     privateKey: pemEncodedPrivateKey,
 *     alg: 'RS256'
 * });
 * // pass addClientAuth as provider.addClientAuthentication implementation
 * ```
 */
declare function createPrivateKeyJwtAuth(options: {
  issuer: string;
  subject: string;
  privateKey: string | Uint8Array | Record<string, unknown>;
  alg: string;
  audience?: string | URL;
  lifetimeSeconds?: number;
  claims?: Record<string, unknown>;
}): AddClientAuthentication;
/**
 * Options for creating a {@linkcode ClientCredentialsProvider}.
 */
interface ClientCredentialsProviderOptions {
  /**
   * The `client_id` for this OAuth client.
   */
  clientId: string;
  /**
   * The `client_secret` for `client_secret_basic` authentication.
   */
  clientSecret: string;
  /**
   * Optional client name for metadata.
   */
  clientName?: string;
  /**
   * Space-separated scopes values requested by the client.
   */
  scope?: string;
  /**
   * The authorization server's `issuer` identifier these credentials were registered with.
   * Stamped onto the stored client information so `auth()`'s SEP-2352 issuer check
   * refuses to send the credential to any other authorization server.
   *
   * Omitting it is deprecated: the credential then goes to whichever authorization server
   * the MCP server advertises.
   */
  expectedIssuer?: string;
}
/**
 * OAuth provider for `client_credentials` grant with `client_secret_basic` authentication.
 *
 * This provider is designed for machine-to-machine authentication where
 * the client authenticates using a `client_id` and `client_secret`.
 *
 * @example
 * ```ts source="./authExtensions.examples.ts#ClientCredentialsProvider_basicUsage"
 * const provider = new ClientCredentialsProvider({
 *     clientId: 'my-client',
 *     clientSecret: 'my-secret',
 *     expectedIssuer: 'https://auth.example.com'
 * });
 *
 * const transport = new StreamableHTTPClientTransport(serverUrl, {
 *     authProvider: provider
 * });
 * ```
 */
declare class ClientCredentialsProvider implements OAuthClientProvider {
  private _tokens?;
  private _clientInfo;
  private _clientMetadata;
  constructor(options: ClientCredentialsProviderOptions & {
    expectedIssuer: string;
  });
  /** @deprecated Pass `expectedIssuer` so the credentials are only sent to that authorization server. */
  constructor(options: ClientCredentialsProviderOptions);
  get redirectUrl(): undefined;
  get clientMetadata(): OAuthClientMetadata;
  clientInformation(): StoredOAuthClientInformation;
  tokens(): StoredOAuthTokens | undefined;
  saveTokens(tokens: StoredOAuthTokens): void;
  redirectToAuthorization(): void;
  saveCodeVerifier(): void;
  codeVerifier(): string;
  prepareTokenRequest(scope?: string): URLSearchParams;
}
/**
 * Options for creating a {@linkcode PrivateKeyJwtProvider}.
 */
interface PrivateKeyJwtProviderOptions {
  /**
   * The `client_id` for this OAuth client.
   */
  clientId: string;
  /**
   * The private key for signing JWT assertions.
   * Can be a PEM string, Uint8Array, or JWK object.
   */
  privateKey: string | Uint8Array | Record<string, unknown>;
  /**
   * The algorithm to use for signing (e.g., 'RS256', 'ES256').
   */
  algorithm: string;
  /**
   * Optional client name for metadata.
   */
  clientName?: string;
  /**
   * Optional JWT lifetime in seconds (default: 300).
   */
  jwtLifetimeSeconds?: number;
  /**
   * Space-separated scopes values requested by the client.
   */
  scope?: string;
  /**
   * Optional custom claims to include in the JWT assertion.
   * These are merged with the standard claims (`iss`, `sub`, `aud`, `exp`, `iat`, `jti`),
   * with custom claims taking precedence for any overlapping keys.
   *
   * Useful for including additional claims that help scope the access token
   * with finer granularity than what scopes alone allow.
   */
  claims?: Record<string, unknown>;
  /**
   * The authorization server's `issuer` identifier these credentials were registered with.
   * Seeds the SEP-2352 issuer stamp — see {@linkcode ClientCredentialsProviderOptions.expectedIssuer}.
   */
  expectedIssuer?: string;
}
/**
 * OAuth provider for `client_credentials` grant with `private_key_jwt` authentication.
 *
 * This provider is designed for machine-to-machine authentication where
 * the client authenticates using a signed JWT assertion
 * ({@link https://datatracker.ietf.org/doc/html/rfc7523#section-2.2 | RFC 7523 Section 2.2}).
 *
 * @example
 * ```ts source="./authExtensions.examples.ts#PrivateKeyJwtProvider_basicUsage"
 * const provider = new PrivateKeyJwtProvider({
 *     clientId: 'my-client',
 *     privateKey: pemEncodedPrivateKey,
 *     algorithm: 'RS256',
 *     expectedIssuer: 'https://auth.example.com'
 * });
 *
 * const transport = new StreamableHTTPClientTransport(serverUrl, {
 *     authProvider: provider
 * });
 * ```
 */
declare class PrivateKeyJwtProvider implements OAuthClientProvider {
  private _tokens?;
  private _clientInfo;
  private _clientMetadata;
  addClientAuthentication: AddClientAuthentication;
  constructor(options: PrivateKeyJwtProviderOptions & {
    expectedIssuer: string;
  });
  /** @deprecated Pass `expectedIssuer` so the credentials are only sent to that authorization server. */
  constructor(options: PrivateKeyJwtProviderOptions);
  get redirectUrl(): undefined;
  get clientMetadata(): OAuthClientMetadata;
  clientInformation(): StoredOAuthClientInformation;
  tokens(): StoredOAuthTokens | undefined;
  saveTokens(tokens: StoredOAuthTokens): void;
  redirectToAuthorization(): void;
  saveCodeVerifier(): void;
  codeVerifier(): string;
  prepareTokenRequest(scope?: string): URLSearchParams;
}
/**
 * Options for creating a {@linkcode StaticPrivateKeyJwtProvider}.
 */
interface StaticPrivateKeyJwtProviderOptions {
  /**
   * The `client_id` for this OAuth client.
   */
  clientId: string;
  /**
   * A pre-built JWT client assertion to use for authentication.
   *
   * This token should already contain the appropriate claims
   * (`iss`, `sub`, `aud`, `exp`, etc.) and be signed by the client's key.
   */
  jwtBearerAssertion: string;
  /**
   * Optional client name for metadata.
   */
  clientName?: string;
  /**
   * Space-separated scopes values requested by the client.
   */
  scope?: string;
  /**
   * The authorization server's `issuer` identifier this assertion was minted for.
   * Seeds the SEP-2352 issuer stamp — see {@linkcode ClientCredentialsProviderOptions.expectedIssuer}.
   */
  expectedIssuer?: string;
}
/**
 * OAuth provider for `client_credentials` grant with a static `private_key_jwt` assertion.
 *
 * This provider mirrors {@linkcode PrivateKeyJwtProvider} but instead of constructing and
 * signing a JWT on each request, it accepts a pre-built JWT assertion string and
 * uses it directly for authentication.
 */
declare class StaticPrivateKeyJwtProvider implements OAuthClientProvider {
  private _tokens?;
  private _clientInfo;
  private _clientMetadata;
  addClientAuthentication: AddClientAuthentication;
  constructor(options: StaticPrivateKeyJwtProviderOptions & {
    expectedIssuer: string;
  });
  /** @deprecated Pass `expectedIssuer` so the credentials are only sent to that authorization server. */
  constructor(options: StaticPrivateKeyJwtProviderOptions);
  get redirectUrl(): undefined;
  get clientMetadata(): OAuthClientMetadata;
  clientInformation(): StoredOAuthClientInformation;
  tokens(): StoredOAuthTokens | undefined;
  saveTokens(tokens: StoredOAuthTokens): void;
  redirectToAuthorization(): void;
  saveCodeVerifier(): void;
  codeVerifier(): string;
  prepareTokenRequest(scope?: string): URLSearchParams;
}
/**
 * Context provided to the assertion callback in {@linkcode CrossAppAccessProvider}.
 * Contains orchestrator-discovered information needed for JWT Authorization Grant requests.
 */
interface CrossAppAccessContext {
  /**
   * The authorization server URL of the target MCP server.
   * Discovered via RFC 9728 protected resource metadata.
   */
  authorizationServerUrl: string;
  /**
   * The resource URL of the target MCP server.
   * Discovered via RFC 9728 protected resource metadata.
   */
  resourceUrl: string;
  /**
   * Optional scope being requested for the MCP server.
   */
  scope?: string;
  /**
   * Fetch function to use for HTTP requests (e.g., for IdP token exchange).
   */
  fetchFn: FetchLike;
}
/**
 * Callback function type that provides a JWT Authorization Grant (ID-JAG).
 *
 * The callback receives context about the target MCP server (authorization server URL,
 * resource URL, scope) and should return a JWT Authorization Grant that will be used
 * to obtain an access token from the MCP server.
 */
type AssertionCallback = (context: CrossAppAccessContext) => string | Promise<string>;
/**
 * Options for creating a {@linkcode CrossAppAccessProvider}.
 */
interface CrossAppAccessProviderOptions {
  /**
   * Callback function that provides a JWT Authorization Grant (ID-JAG).
   *
   * The callback receives the MCP server's authorization server URL, resource URL,
   * and requested scope, and should return a JWT Authorization Grant obtained from
   * the enterprise IdP via RFC 8693 token exchange.
   *
   * You can use the utility functions from the `crossAppAccess` module
   * for standard flows, or implement custom logic.
   *
   * @example
   * ```ts
   * assertion: async (ctx) => {
   *     const result = await discoverAndRequestJwtAuthGrant({
   *         idpUrl: 'https://idp.example.com',
   *         audience: ctx.authorizationServerUrl,
   *         resource: ctx.resourceUrl,
   *         idToken: await getIdToken(),
   *         clientId: 'my-idp-client',
   *         clientSecret: 'my-idp-secret',
   *         scope: ctx.scope,
   *         fetchFn: ctx.fetchFn
   *     });
   *     return result.jwtAuthGrant;
   * }
   * ```
   */
  assertion: AssertionCallback;
  /**
   * The `client_id` registered with the MCP server's authorization server.
   */
  clientId: string;
  /**
   * The `client_secret` for authenticating with the MCP server's authorization server.
   */
  clientSecret: string;
  /**
   * Optional client name for metadata.
   */
  clientName?: string;
  /**
   * Custom fetch implementation. Defaults to global fetch.
   */
  fetchFn?: FetchLike;
  /**
   * The MCP authorization server's `issuer` identifier these credentials were registered with.
   * Seeds the SEP-2352 issuer stamp — see {@linkcode ClientCredentialsProviderOptions.expectedIssuer}.
   */
  expectedIssuer?: string;
}
/**
 * OAuth provider for Cross-App Access (Enterprise Managed Authorization) using JWT Authorization Grant.
 *
 * This provider implements the Enterprise Managed Authorization flow (SEP-990) where:
 * 1. User authenticates with an enterprise IdP and the client obtains an ID Token
 * 2. Client exchanges the ID Token for a JWT Authorization Grant (ID-JAG) via RFC 8693 token exchange
 * 3. Client uses the JAG to obtain an access token from the MCP server via RFC 7523 JWT bearer grant
 *
 * The provider handles steps 2-3 automatically, with the JAG acquisition delegated to
 * a callback function that you provide. This allows flexibility in how you obtain and
 * cache ID Tokens from the IdP.
 *
 * @see https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/stable/enterprise-managed-authorization.mdx
 *
 * @example
 * ```ts
 * const provider = new CrossAppAccessProvider({
 *     assertion: async (ctx) => {
 *         const result = await discoverAndRequestJwtAuthGrant({
 *             idpUrl: 'https://idp.example.com',
 *             audience: ctx.authorizationServerUrl,
 *             resource: ctx.resourceUrl,
 *             idToken: await getIdToken(), // Your function to get ID token
 *             clientId: 'my-idp-client',
 *             clientSecret: 'my-idp-secret',
 *             scope: ctx.scope,
 *             fetchFn: ctx.fetchFn
 *         });
 *         return result.jwtAuthGrant;
 *     },
 *     clientId: 'my-mcp-client',
 *     clientSecret: 'my-mcp-secret',
 *     expectedIssuer: 'https://auth.example.com'
 * });
 *
 * const transport = new StreamableHTTPClientTransport(serverUrl, {
 *     authProvider: provider
 * });
 * ```
 */
declare class CrossAppAccessProvider implements OAuthClientProvider {
  private _tokens?;
  private _clientInfo;
  private _clientMetadata;
  private _assertionCallback;
  private _fetchFn;
  private _authorizationServerUrl?;
  private _resourceUrl?;
  private _scope?;
  constructor(options: CrossAppAccessProviderOptions & {
    expectedIssuer: string;
  });
  /** @deprecated Pass `expectedIssuer` so the credentials are only sent to that authorization server. */
  constructor(options: CrossAppAccessProviderOptions);
  get redirectUrl(): undefined;
  get clientMetadata(): OAuthClientMetadata;
  clientInformation(): StoredOAuthClientInformation;
  tokens(): StoredOAuthTokens | undefined;
  saveTokens(tokens: StoredOAuthTokens): void;
  redirectToAuthorization(): void;
  saveCodeVerifier(): void;
  codeVerifier(): string;
  /**
   * Saves the authorization server URL discovered during OAuth flow.
   * This is called by the auth() function after RFC 9728 discovery.
   */
  saveAuthorizationServerUrl(authorizationServerUrl: string): void;
  /**
   * Returns the cached authorization server URL if available.
   */
  authorizationServerUrl(): string | undefined;
  /**
   * Saves the resource URL discovered during OAuth flow.
   * This is called by the auth() function after RFC 9728 discovery.
   */
  saveResourceUrl?(resourceUrl: string): void;
  /**
   * Returns the cached resource URL if available.
   */
  resourceUrl?(): string | undefined;
  prepareTokenRequest(scope?: string): Promise<URLSearchParams>;
}
//#endregion
//#region src/client/crossAppAccess.d.ts
/**
 * Options for requesting a JWT Authorization Grant via RFC 8693 Token Exchange.
 */
interface RequestJwtAuthGrantOptions {
  /**
   * The IdP's token endpoint URL where the token exchange request will be sent.
   */
  tokenEndpoint: string | URL;
  /**
   * The authorization server URL of the target MCP server (used as `audience` in the token exchange request).
   */
  audience: string | URL;
  /**
   * The resource identifier of the target MCP server (RFC 9728).
   */
  resource: string | URL;
  /**
   * The identity assertion (ID Token) from the enterprise IdP.
   * This should be the OpenID Connect ID Token obtained during user authentication.
   */
  idToken: string;
  /**
   * The client ID registered with the IdP for token exchange.
   */
  clientId: string;
  /**
   * The client secret for authenticating with the IdP.
   *
   * Optional: the IdP may register the MCP client as a public client. RFC 8693 does
   * not mandate confidential clients for token exchange. Omitting this parameter
   * omits `client_secret` from the request body.
   */
  clientSecret?: string;
  /**
   * Optional space-separated list of scopes to request for the target MCP server.
   */
  scope?: string;
  /**
   * Custom fetch implementation. Defaults to global fetch.
   */
  fetchFn?: FetchLike;
}
/**
 * Options for discovering the IdP's token endpoint and requesting a JWT Authorization Grant.
 * Extends {@linkcode RequestJwtAuthGrantOptions} with IdP discovery.
 */
interface DiscoverAndRequestJwtAuthGrantOptions extends Omit<RequestJwtAuthGrantOptions, 'tokenEndpoint'> {
  /**
   * The IdP's issuer URL for OAuth metadata discovery.
   * Will be used to discover the token endpoint via `.well-known/oauth-authorization-server`.
   */
  idpUrl: string | URL;
}
/**
 * Result from a successful JWT Authorization Grant token exchange.
 */
interface JwtAuthGrantResult {
  /**
   * The JWT Authorization Grant (ID-JAG) that can be used to request an access token from the MCP server.
   */
  jwtAuthGrant: string;
  /**
   * Optional expiration time in seconds for the JWT Authorization Grant.
   */
  expiresIn?: number;
  /**
   * Optional scope granted by the IdP (may differ from requested scope).
   */
  scope?: string;
}
/**
 * Requests a JWT Authorization Grant (ID-JAG) from an enterprise IdP using RFC 8693 Token Exchange.
 *
 * This function performs step 2 of the Enterprise Managed Authorization flow:
 * exchanges an ID Token for a JWT Authorization Grant that can be used with the target MCP server.
 *
 * @param options - Configuration for the token exchange request
 * @returns The JWT Authorization Grant and related metadata
 * @throws {Error} If the token exchange fails or returns an error response
 *
 * @example
 * ```ts
 * const result = await requestJwtAuthorizationGrant({
 *     tokenEndpoint: 'https://idp.example.com/token',
 *     audience: 'https://auth.chat.example/',
 *     resource: 'https://mcp.chat.example/',
 *     idToken: 'eyJhbGciOiJS...',
 *     clientId: 'my-idp-client',
 *     clientSecret: 'my-idp-secret',
 *     scope: 'chat.read chat.history'
 * });
 *
 * // Use result.jwtAuthGrant with the MCP server's authorization server
 * ```
 */
declare function requestJwtAuthorizationGrant(options: RequestJwtAuthGrantOptions): Promise<JwtAuthGrantResult>;
/**
 * Discovers the IdP's token endpoint and requests a JWT Authorization Grant.
 *
 * This is a convenience wrapper around {@linkcode requestJwtAuthorizationGrant} that
 * first performs OAuth metadata discovery to find the token endpoint.
 *
 * @param options - Configuration including IdP URL for discovery
 * @returns The JWT Authorization Grant and related metadata
 * @throws {Error} If discovery fails or the token exchange fails
 *
 * @example
 * ```ts
 * const result = await discoverAndRequestJwtAuthGrant({
 *     idpUrl: 'https://idp.example.com',
 *     audience: 'https://auth.chat.example/',
 *     resource: 'https://mcp.chat.example/',
 *     idToken: await getIdToken(),
 *     clientId: 'my-idp-client',
 *     clientSecret: 'my-idp-secret'
 * });
 * ```
 */
declare function discoverAndRequestJwtAuthGrant(options: DiscoverAndRequestJwtAuthGrantOptions): Promise<JwtAuthGrantResult>;
/**
 * Exchanges a JWT Authorization Grant for an access token at the MCP server's authorization server.
 *
 * This function performs step 3 of the Enterprise Managed Authorization flow:
 * uses the JWT Authorization Grant to obtain an access token from the MCP server.
 *
 * @param options - Configuration for the JWT grant exchange
 * @returns OAuth tokens (access token, token type, etc.)
 * @throws {Error} If the exchange fails or returns an error response
 *
 * Defaults to `client_secret_basic` (HTTP Basic Authorization header), matching
 * `CrossAppAccessProvider`'s declared `token_endpoint_auth_method` and the
 * SEP-990 conformance test requirements. Use `authMethod: 'client_secret_post'` only
 * when the authorization server explicitly requires it.
 *
 * @example
 * ```ts
 * const tokens = await exchangeJwtAuthGrant({
 *     tokenEndpoint: 'https://auth.chat.example/token',
 *     jwtAuthGrant: 'eyJhbGci...',
 *     clientId: 'my-mcp-client',
 *     clientSecret: 'my-mcp-secret'
 * });
 *
 * // Use tokens.access_token to access the MCP server
 * ```
 */
declare function exchangeJwtAuthGrant(options: {
  tokenEndpoint: string | URL;
  jwtAuthGrant: string;
  clientId: string;
  clientSecret?: string;
  /**
   * Client authentication method. Defaults to `'client_secret_basic'` to align with
   * `CrossAppAccessProvider` and SEP-990 conformance requirements.
   * Callers with no `clientSecret` should pass `'none'` for public-client auth.
   */
  authMethod?: ClientAuthMethod;
  fetchFn?: FetchLike;
}): Promise<{
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}>;
//#endregion
//#region src/client/middleware.d.ts
/**
 * Middleware function that wraps and enhances fetch functionality.
 * Takes a fetch handler and returns an enhanced fetch handler.
 */
type Middleware = (next: FetchLike) => FetchLike;
/**
 * Creates a fetch wrapper that handles OAuth authentication automatically.
 *
 * This wrapper will:
 * - Add `Authorization` headers with access tokens
 * - Handle 401 responses by attempting re-authentication
 * - Retry the original request after successful auth
 * - Handle OAuth errors appropriately ({@linkcode index.OAuthErrorCode.InvalidClient | OAuthErrorCode.InvalidClient}, etc.)
 * - When {@linkcode OAuthClientProvider.dpop | provider.dpop()} is implemented, present DPoP-bound
 *   tokens with the `DPoP` scheme plus a per-request proof (RFC 9449 / SEP-1932) by composing
 *   {@linkcode withDpopFromProvider} underneath — so a `use_dpop_nonce` challenge is retried
 *   inline on every attempt, independently of the single re-authentication retry here
 *
 * The `baseUrl` parameter is optional and defaults to using the domain from the request URL.
 * However, you should explicitly provide `baseUrl` when:
 * - Making requests to multiple subdomains (e.g., api.example.com, cdn.example.com)
 * - Using API paths that differ from OAuth discovery paths (e.g., requesting /api/v1/data but OAuth is at /)
 * - The OAuth server is on a different domain than your API requests
 * - You want to ensure consistent OAuth behavior regardless of request URLs
 *
 * For MCP transports, set `baseUrl` to the same URL you pass to the transport constructor.
 *
 * Note: This wrapper is designed for general-purpose fetch operations.
 * MCP transports (SSE and StreamableHTTP) already have built-in OAuth handling
 * and should not need this wrapper.
 *
 * @param provider - OAuth client provider for authentication
 * @param baseUrl - Base URL for OAuth server discovery (defaults to request URL domain)
 * @returns A fetch middleware function
 */
declare const withOAuth: (provider: OAuthClientProvider, baseUrl?: string | URL) => Middleware;
/**
 * A function returning the current access token, or `undefined` if none is available yet. See
 * {@linkcode withDpop}.
 */
type DpopTokenSource = () => string | undefined | Promise<string | undefined>;
/**
 * A {@linkcode DpopSession}, or a function resolving to one (or to `undefined` to leave the request
 * untouched). The function form lets the session be created lazily or come from
 * {@linkcode OAuthClientProvider.dpop}. See {@linkcode withDpop}.
 */
type DpopSessionSource = DpopSession | (() => DpopSession | undefined | Promise<DpopSession | undefined>);
/**
 * Creates a fetch wrapper that presents an access token using the `DPoP` Authorization scheme
 * (RFC 9449 / SEP-1932) instead of `Bearer`: every request carries `Authorization: DPoP <token>`
 * plus a fresh `DPoP` proof bound to that request's method and URL, a resource-server
 * `use_dpop_nonce` challenge (RFC 9449 §9) is retried once, inline, with the server-supplied nonce,
 * and a `DPoP-Nonce` delivered on any response is remembered for the next proof (RFC 9449 §8.2).
 *
 * Because it wraps `fetch` itself, the proof is always bound to the request actually sent and every
 * response is observed — which is why the MCP transports apply this wrapper internally (via
 * {@linkcode withDpopFromProvider}) when their `authProvider` implements
 * {@linkcode OAuthClientProvider.dpop | dpop()}, rather than threading request context through
 * {@linkcode AuthProvider}.
 *
 * Use this directly when you already manage the access token yourself (a non-OAuth token source,
 * or credentials obtained out-of-band) and only need DPoP's request-signing behavior — e.g.
 * `fetch: withDpop(session, getToken)(fetch)` alongside a minimal `authProvider: { token }`.
 *
 * @param session - The DPoP signing session (key pair + nonce state), or a function resolving to
 *   it. Reuse the same session across requests to the same server so its nonce state persists.
 *   When the function resolves to `undefined` the request passes through unchanged.
 * @param getToken - Returns the current access token, or `undefined` if none is available (the
 *   request passes through unchanged — any `Authorization` header already on it is left as is).
 * @returns A fetch middleware function
 */
declare const withDpop: (session: DpopSessionSource, getToken: DpopTokenSource) => Middleware;
/**
 * {@linkcode withDpop} driven by an {@linkcode OAuthClientProvider}: the session comes from
 * {@linkcode OAuthClientProvider.dpop | provider.dpop()} and the token from
 * {@linkcode OAuthClientProvider.tokens | provider.tokens()} — presented with the DPoP scheme only
 * when the AS actually issued `token_type: "DPoP"` (RFC 9449 §7.1); a Bearer token passes through
 * untouched.
 *
 * This is what the MCP transports and {@linkcode withOAuth} compose internally when the provider
 * implements `dpop()`. Use it directly only when building your own fetch pipeline around an
 * `OAuthClientProvider` (e.g. a custom re-authorization middleware) — place it *innermost*, below
 * whatever sets `Authorization: Bearer` and handles 401 re-authentication.
 */
declare const withDpopFromProvider: (provider: OAuthClientProvider) => Middleware;
/**
 * Logger function type for HTTP requests
 */
type RequestLogger = (input: {
  method: string;
  url: string | URL;
  status: number;
  statusText: string;
  duration: number;
  requestHeaders?: Headers;
  responseHeaders?: Headers;
  error?: Error;
}) => void;
/**
 * Configuration options for the logging middleware
 */
type LoggingOptions = {
  /**
   * Custom logger function, defaults to console logging
   */
  logger?: RequestLogger;
  /**
   * Whether to include request headers in logs
   * @default false
   */
  includeRequestHeaders?: boolean;
  /**
   * Whether to include response headers in logs
   * @default false
   */
  includeResponseHeaders?: boolean;
  /**
   * Status level filter - only log requests with status >= this value
   * Set to `0` to log all requests, `400` to log only errors
   * @default 0
   */
  statusLevel?: number;
};
/**
 * Creates a fetch middleware that logs HTTP requests and responses.
 *
 * When called without arguments `withLogging()`, it uses the default logger that:
 * - Logs successful requests (2xx) to `console.log`
 * - Logs error responses (4xx/5xx) and network errors to `console.error`
 * - Logs all requests regardless of status (`statusLevel: 0`)
 * - Does not include request or response headers in logs
 * - Measures and displays request duration in milliseconds
 *
 * Important: the default logger uses both `console.log` and `console.error` so it should not be used with
 * `stdio` transports and applications.
 *
 * @param options - Logging configuration options
 * @returns A fetch middleware function
 */
declare const withLogging: (options?: LoggingOptions) => Middleware;
/**
 * Composes multiple fetch middleware functions into a single middleware pipeline.
 * Middleware are applied in the order they appear, creating a chain of handlers.
 *
 * @example
 * ```ts source="./middleware.examples.ts#applyMiddlewares_basicUsage"
 * // Create a middleware pipeline that handles both OAuth and logging
 * const enhancedFetch = applyMiddlewares(withOAuth(oauthProvider, 'https://api.example.com'), withLogging({ statusLevel: 400 }))(fetch);
 *
 * // Use the enhanced fetch - it will handle auth and log errors
 * const response = await enhancedFetch('https://api.example.com/data');
 * ```
 *
 * @param middleware - Array of fetch middleware to compose into a pipeline
 * @returns A single composed middleware function
 */
declare const applyMiddlewares: (...middleware: Middleware[]) => Middleware;
/**
 * Helper function to create custom fetch middleware with cleaner syntax.
 * Provides the next handler and request details as separate parameters for easier access.
 *
 * @example
 * ```ts source="./middleware.examples.ts#createMiddleware_examples"
 * // Create custom authentication middleware
 * const customAuthMiddleware = createMiddleware(async (next, input, init) => {
 *     const headers = new Headers(init?.headers);
 *     headers.set('X-Custom-Auth', 'my-token');
 *
 *     const response = await next(input, { ...init, headers });
 *
 *     if (response.status === 401) {
 *         console.log('Authentication failed');
 *     }
 *
 *     return response;
 * });
 *
 * // Create conditional middleware
 * const conditionalMiddleware = createMiddleware(async (next, input, init) => {
 *     const url = typeof input === 'string' ? input : input.toString();
 *
 *     // Only add headers for API routes
 *     if (url.includes('/api/')) {
 *         const headers = new Headers(init?.headers);
 *         headers.set('X-API-Version', 'v2');
 *         return next(input, { ...init, headers });
 *     }
 *
 *     // Pass through for non-API routes
 *     return next(input, init);
 * });
 *
 * // Create caching middleware
 * const cacheMiddleware = createMiddleware(async (next, input, init) => {
 *     const cacheKey = typeof input === 'string' ? input : input.toString();
 *
 *     // Check cache first
 *     const cached = await getFromCache(cacheKey);
 *     if (cached) {
 *         return new Response(cached, { status: 200 });
 *     }
 *
 *     // Make request and cache result
 *     const response = await next(input, init);
 *     if (response.ok) {
 *         await saveToCache(cacheKey, await response.clone().text());
 *     }
 *
 *     return response;
 * });
 * ```
 *
 * @param handler - Function that receives the next handler and request parameters
 * @returns A fetch middleware function
 */
declare const createMiddleware: (handler: (next: FetchLike, input: string | URL, init?: RequestInit) => Promise<Response>) => Middleware;
//#endregion
//#region src/client/sse.d.ts
declare class SseError extends Error {
  readonly code: number | undefined;
  readonly event: ErrorEvent;
  static [Symbol.hasInstance](value: unknown): boolean;
  /**
   * Brand-based type guard: equivalent to `value instanceof this`, as an
   * explicit static predicate (the axios/AWS-SDK `isInstance` style). Reads
   * the caller's own brand via `this`, so every branded subclass gets a
   * correctly-scoped guard by inheritance. Must be invoked on the class —
   * in callback position write `v => SdkError.isInstance(v)`, not
   * `.filter(SdkError.isInstance)` (detached calls throw rather than
   * silently matching nothing).
   */
  static isInstance<T extends abstract new (...args: never[]) => unknown>(this: T, value: unknown): value is InstanceType<T>;
  constructor(code: number | undefined, message: string | undefined, event: ErrorEvent);
}
/**
 * Configuration options for the {@linkcode SSEClientTransport}.
 */
type SSEClientTransportOptions = {
  /**
   * An OAuth client provider to use for authentication.
   *
   * {@linkcode AuthProvider.token | token()} is called before every request to obtain the
   * bearer token. When the server responds with 401, {@linkcode AuthProvider.onUnauthorized | onUnauthorized()}
   * is called (if provided) to refresh credentials, then the request is retried once. If
   * the retry also gets 401, `SdkHttpError` (`SdkErrorCode.ClientHttpAuthentication`) is thrown.
   * If `onUnauthorized` is not provided, {@linkcode UnauthorizedError} is thrown.
   *
   * For simple bearer tokens: `{ token: async () => myApiKey }`.
   *
   * For OAuth flows, pass an {@linkcode index.OAuthClientProvider | OAuthClientProvider} implementation.
   * Interactive flows: after {@linkcode UnauthorizedError}, redirect the user, then call
   * {@linkcode SSEClientTransport.finishAuth | finishAuth} with the authorization code before reconnecting.
   */
  authProvider?: AuthProvider | OAuthClientProvider;
  /**
   * Opt-out for the RFC 8414 §3.3 issuer-echo check during authorization-server
   * metadata discovery. **Security-weakening** — see
   * {@linkcode index.AuthOptions.skipIssuerMetadataValidation | AuthOptions.skipIssuerMetadataValidation}.
   * Only honoured when {@linkcode SSEClientTransportOptions.authProvider | authProvider}
   * is an `OAuthClientProvider`.
   */
  skipIssuerMetadataValidation?: boolean;
  /**
   * Customizes the initial SSE request to the server (the request that begins the stream).
   *
   * A custom `fetch` supplied here is still wrapped by the transport: the
   * transport-managed headers, including the `Authorization` header derived from
   * {@linkcode SSEClientTransportOptions.authProvider | authProvider}, are attached to the
   * SSE request and take precedence over a same-named entry in `requestInit.headers`
   * (see {@linkcode SSEClientTransportOptions.requestInit | requestInit}).
   */
  eventSourceInit?: EventSourceInit;
  /**
   * Customizes recurring `POST` requests to the server.
   *
   * The transport-managed headers take precedence over a same-named entry in
   * `headers`: `Authorization` when
   * {@linkcode SSEClientTransportOptions.authProvider | authProvider} yields a token, and
   * `mcp-protocol-version`. A caller-supplied `Authorization` value is therefore only sent
   * while the provider has no token, which lets a static API key fall back to OAuth once
   * the provider obtains one.
   *
   * A `redirect` of `'error'` or `'manual'` is passed to fetch as it is for the `POST`
   * requests that carry messages. For the OAuth requests, and for any other value,
   * `redirect` is consulted only when
   * {@linkcode SSEClientTransportOptions.redirectPolicy | redirectPolicy} is `'follow'`. The
   * request that begins the stream does not read it.
   */
  requestInit?: RequestInit;
  /**
   * Custom fetch implementation used for all network requests.
   */
  fetch?: FetchLike;
  /**
   * How a redirect of one of the transport's requests is handled, including the OAuth
   * requests it makes for {@linkcode SSEClientTransportOptions.authProvider | authProvider}.
   * The option does not reach requests that a provider makes with a fetch of its own, such as
   * those of the `assertion` callback of a `CrossAppAccessProvider`.
   *
   * - `'same-origin'` (default): a redirect is followed only when it stays within the origin
   *   of the request and keeps the method, and any other redirect fails the request.
   * - `'follow'`: redirects are left to the fetch implementation, as in earlier versions. It
   *   follows them to any origin unless `requestInit.redirect` says otherwise, which the
   *   request that begins the stream does not read.
   *
   * @default 'same-origin'
   */
  redirectPolicy?: 'same-origin' | 'follow';
};
/**
 * Client transport for SSE: this will connect to a server using Server-Sent Events for receiving
 * messages and make separate `POST` requests for sending messages.
 * @deprecated SSEClientTransport is deprecated. Prefer to use {@linkcode index.StreamableHTTPClientTransport | StreamableHTTPClientTransport} where possible instead. Note that because some servers are still using SSE, clients may need to support both transports during the migration period.
 */
declare class SSEClientTransport implements Transport {
  private _eventSource?;
  private _endpoint?;
  private _abortController?;
  private _url;
  private _resourceMetadataUrl?;
  private _scope?;
  private _eventSourceInit?;
  private _requestInit?;
  private _authProvider?;
  private _oauthProvider?;
  private _skipIssuerMetadataValidation?;
  private _fetch?;
  private _fetchWithInit;
  private _redirectPolicy?;
  private _dpop?;
  private _protocolVersion?;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  constructor(url: URL, opts?: SSEClientTransportOptions);
  private _last401Response?;
  private _connectAuthRetried;
  /** `baseFetch` with redirects handled as `redirectPolicy` says. */
  private _redirects;
  /** Error text for a redirect `response` that was not followed, or `undefined` for any other response. */
  private _unfollowedRedirect;
  private _commonHeaders;
  private _startOrAuth;
  start(): Promise<void>;
  /**
   * Call this method after the user has finished authorizing via their user agent and is redirected back to the MCP client application. This will exchange the authorization code for an access token, enabling the next connection attempt to successfully auth.
   *
   * **Preferred:** pass the callback URL's `searchParams` directly. The SDK extracts `code`
   * and `iss`, validates `iss` against the recorded issuer (RFC 9207) **before** reading any
   * other parameter, and on mismatch throws an {@linkcode IssuerMismatchError} that carries
   * none of the callback's `error`/`error_description`/`error_uri` text. The `(code, iss?)`
   * positional form remains supported for back-compat.
   *
   * The SDK does **not** validate `state`; compare it to your stored value before calling
   * `finishAuth`.
   *
   * @param callbackParams - The `URLSearchParams` from the authorization callback URL
   *   (e.g. `new URL(callbackUrl).searchParams`). `code` and `iss` are read from it.
   */
  finishAuth(callbackParams: URLSearchParams): Promise<void>;
  /**
   * @param authorizationCode - The `code` query parameter from the authorization callback URL.
   * @param iss - The form-urldecoded `iss` query parameter from the same callback URL, if
   *   present. Validated per RFC 9207 against the recorded issuer before the code is redeemed.
   */
  finishAuth(authorizationCode: string, iss?: string): Promise<void>;
  close(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  private _send;
  setProtocolVersion(version: string): void;
}
//#endregion
//#region src/client/streamableHttp.d.ts
/**
 * Options for starting or authenticating an SSE connection
 */
interface StartSSEOptions {
  /**
   * The resumption token used to continue long-running requests that were interrupted.
   *
   * This allows clients to reconnect and continue from where they left off.
   */
  resumptionToken?: string;
  /**
   * A callback that is invoked when the resumption token changes.
   *
   * This allows clients to persist the latest token for potential reconnection.
   */
  onresumptiontoken?: (token: string) => void;
  /**
   * Override Message ID to associate with the replay message
   * so that the response can be associated with the new resumed request.
   */
  replayMessageId?: string | number;
  /**
   * The per-request abort signal supplied by the caller via
   * `TransportSendOptions.requestSignal`. When this signal is aborted the
   * originating POST and its SSE response stream are torn down
   * intentionally — `_handleSseStream` treats it exactly like the
   * transport-level abort: no `onerror`, no reconnect.
   */
  requestSignal?: AbortSignal;
  /**
   * The per-request stream-end callback supplied via
   * `TransportSendOptions.onRequestStreamEnd`. Fired when the SSE response
   * stream for the originating POST ends or errors for any non-deliberate
   * reason (server closed, network dropped, reconnection exhausted) — never
   * when `requestSignal` was aborted.
   */
  onRequestStreamEnd?: () => void;
}
/**
 * Configuration options for reconnection behavior of the {@linkcode StreamableHTTPClientTransport}.
 */
interface StreamableHTTPReconnectionOptions {
  /**
   * Maximum backoff time between reconnection attempts in milliseconds.
   * Default is 30000 (30 seconds).
   */
  maxReconnectionDelay: number;
  /**
   * Initial backoff time between reconnection attempts in milliseconds.
   * Default is 1000 (1 second).
   */
  initialReconnectionDelay: number;
  /**
   * The factor by which the reconnection delay increases after each attempt.
   * Default is 1.5.
   */
  reconnectionDelayGrowFactor: number;
  /**
   * Maximum number of reconnection attempts before giving up.
   * Default is 2.
   */
  maxRetries: number;
}
/**
 * Custom scheduler for SSE stream reconnection attempts.
 *
 * Called instead of `setTimeout` when the transport needs to schedule a reconnection.
 * Useful in environments where `setTimeout` is unsuitable (serverless functions that
 * terminate before the timer fires, mobile apps that need platform background scheduling,
 * desktop apps handling sleep/wake).
 *
 * @param reconnect - Call this to perform the reconnection attempt.
 * @param delay - Suggested delay in milliseconds (from backoff calculation).
 * @param attemptCount - Zero-indexed retry attempt number.
 * @returns An optional cancel function. If returned, it will be called on
 * {@linkcode StreamableHTTPClientTransport.close | transport.close()} to abort the
 * pending reconnection.
 *
 * @example
 * ```ts source="./streamableHttp.examples.ts#ReconnectionScheduler_basicUsage"
 * const scheduler: ReconnectionScheduler = (reconnect, delay) => {
 *     const id = platformBackgroundTask.schedule(reconnect, delay);
 *     return () => platformBackgroundTask.cancel(id);
 * };
 * ```
 */
type ReconnectionScheduler = (reconnect: () => void, delay: number, attemptCount: number) => (() => void) | void;
/**
 * Configuration options for the {@linkcode StreamableHTTPClientTransport}.
 */
type StreamableHTTPClientTransportOptions = {
  /**
   * An OAuth client provider to use for authentication.
   *
   * {@linkcode AuthProvider.token | token()} is called before every request to obtain the
   * bearer token. When the server responds with 401, {@linkcode AuthProvider.onUnauthorized | onUnauthorized()}
   * is called (if provided) to refresh credentials, then the request is retried once. If
   * the retry also gets 401, `SdkHttpError` (`SdkErrorCode.ClientHttpAuthentication`) is thrown.
   * If `onUnauthorized` is not provided, {@linkcode UnauthorizedError} is thrown.
   *
   * For simple bearer tokens: `{ token: async () => myApiKey }`.
   *
   * For OAuth flows, pass an {@linkcode index.OAuthClientProvider | OAuthClientProvider} implementation
   * directly — the transport adapts it to `AuthProvider` internally. Interactive flows: after
   * {@linkcode UnauthorizedError}, redirect the user, then call
   * {@linkcode StreamableHTTPClientTransport.finishAuth | finishAuth} with the authorization code before
   * reconnecting.
   */
  authProvider?: AuthProvider | OAuthClientProvider;
  /**
   * Opt-out for the RFC 8414 §3.3 issuer-echo check during authorization-server
   * metadata discovery. **Security-weakening** — see
   * {@linkcode index.AuthOptions.skipIssuerMetadataValidation | AuthOptions.skipIssuerMetadataValidation}.
   * Only honoured when {@linkcode StreamableHTTPClientTransportOptions.authProvider | authProvider}
   * is an `OAuthClientProvider`.
   */
  skipIssuerMetadataValidation?: boolean;
  /**
   * Customizes HTTP requests to the server.
   *
   * `headers` are sent on every request, but the transport-managed headers take
   * precedence over a same-named entry here: `Authorization` when
   * {@linkcode StreamableHTTPClientTransportOptions.authProvider | authProvider} yields a
   * token, `mcp-session-id`, and `mcp-protocol-version`. A caller-supplied `Authorization`
   * value is therefore only sent while the provider has no token, which lets a static API
   * key fall back to OAuth once the provider obtains one.
   *
   * A `redirect` of `'error'` or `'manual'` is passed to fetch as it is for the POST, GET and
   * DELETE requests to the server URL. For the OAuth requests, and for any other value,
   * `redirect` is consulted only when
   * {@linkcode StreamableHTTPClientTransportOptions.redirectPolicy | redirectPolicy} is `'follow'`.
   */
  requestInit?: RequestInit;
  /**
   * Custom fetch implementation used for all network requests.
   */
  fetch?: FetchLike;
  /**
   * How a redirect of one of the transport's requests is handled, including the OAuth
   * requests it makes for {@linkcode StreamableHTTPClientTransportOptions.authProvider | authProvider}.
   * The option does not reach requests that a provider makes with a fetch of its own, such as
   * those of the `assertion` callback of a `CrossAppAccessProvider`.
   *
   * - `'same-origin'` (default): a redirect is followed only when it stays within the origin
   *   of the request and keeps the method, and any other redirect fails the request.
   * - `'follow'`: redirects are left to the fetch implementation, as in earlier versions. It
   *   follows them to any origin unless `requestInit.redirect` says otherwise.
   *
   * @default 'same-origin'
   */
  redirectPolicy?: 'same-origin' | 'follow';
  /**
   * Options to configure the reconnection behavior.
   */
  reconnectionOptions?: StreamableHTTPReconnectionOptions;
  /**
   * Custom scheduler for reconnection attempts. If not provided, `setTimeout` is used.
   * See {@linkcode ReconnectionScheduler}.
   */
  reconnectionScheduler?: ReconnectionScheduler;
  /**
   * Session ID for the connection. This is used to identify the session on the server.
   * When not provided and connecting to a server that supports session IDs, the server will generate a new session ID.
   */
  sessionId?: string;
  /**
   * The MCP protocol version to include in the `mcp-protocol-version` header on all requests.
   * When reconnecting with a preserved `sessionId`, set this to the version negotiated during the original
   * handshake so the reconnected transport continues sending the required header.
   */
  protocolVersion?: string;
  /**
   * How the transport reacts to a `403 Forbidden` response carrying
   * `WWW-Authenticate: Bearer error="insufficient_scope"`.
   *
   * - `'reauthorize'` (default): the transport runs the step-up authorization
   *   flow — computes the union of the previously-requested scope and the
   *   challenged scope, calls {@linkcode index.auth | auth()} (forcing a
   *   fresh authorization request when the union strictly exceeds the current
   *   token's granted scope, since refresh cannot widen scope per RFC 6749
   *   §6), and retries the request once. Retries are bounded by
   *   {@linkcode StreamableHTTPClientTransportOptions.maxStepUpRetries | maxStepUpRetries}.
   *   If no {@linkcode index.OAuthClientProvider | OAuthClientProvider} is
   *   configured, step-up cannot run and the transport throws
   *   {@linkcode index.InsufficientScopeError | InsufficientScopeError} instead.
   * - `'throw'`: the transport throws {@linkcode index.InsufficientScopeError | InsufficientScopeError}
   *   carrying the challenge parameters and does not re-authorize. Use this
   *   for `client_credentials` / m2m clients where re-authorization cannot
   *   widen scope, or for interactive clients that want to gate the consent
   *   prompt behind UX.
   *
   * @default 'reauthorize'
   */
  onInsufficientScope?: 'reauthorize' | 'throw';
  /**
   * Maximum number of step-up re-authorization attempts the transport makes
   * per send (and per GET stream open) before giving up. Only consulted when
   * {@linkcode StreamableHTTPClientTransportOptions.onInsufficientScope | onInsufficientScope}
   * is `'reauthorize'`. Cross-request tracking ("this resource+operation
   * already failed N times across the session") is host responsibility.
   *
   * @default 1
   */
  maxStepUpRetries?: number;
};
/**
 * Client transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It will connect to a server using HTTP `POST` for sending messages and HTTP `GET` with Server-Sent Events
 * for receiving messages.
 */
declare class StreamableHTTPClientTransport implements Transport {
  private _abortController?;
  private _url;
  private _resourceMetadataUrl?;
  private _scope?;
  private _requestInit?;
  private _authProvider?;
  private _oauthProvider?;
  private _skipIssuerMetadataValidation?;
  private _fetch?;
  private _fetchWithInit;
  private _redirectPolicy?;
  private _sessionId?;
  private _reconnectionOptions;
  private _protocolVersion?;
  private _onInsufficientScope;
  private _maxStepUpRetries;
  private _serverRetryMs?;
  private readonly _reconnectionScheduler?;
  private _cancelReconnection?;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  /**
   * Streamable HTTP opens one POST (and SSE response stream) per outbound
   * request and honors `TransportSendOptions.requestSignal`. On a 2026-era
   * connection the protocol layer aborts that per-request stream as the
   * spec cancellation signal instead of POSTing `notifications/cancelled`.
   */
  readonly hasPerRequestStream = true;
  constructor(url: URL, opts?: StreamableHTTPClientTransportOptions);
  /**
   * SEP-2350 step-up: compute the union scope, decide whether refresh must be
   * bypassed, and run {@linkcode auth}. Returns the auth result so the caller
   * can decide whether to retry. Shared by the POST `_send` path and the GET
   * `_startOrAuthSse` path so both apply the same `'throw'` short-circuit,
   * the same superset-gated refresh bypass, and the same retry cap.
   */
  private _stepUpAuthorize;
  private _stepUpAuthorizeInner;
  /** `baseFetch` with redirects handled as `redirectPolicy` says. */
  private _redirects;
  /** Error text for a redirect `response` that was not followed, or `undefined` for any other response. */
  private _unfollowedRedirect;
  private _commonHeaders;
  /**
   * Body-derived per-request headers: when an outgoing request carries a
   * protocol-version claim in its `_meta` envelope (the version negotiation
   * probe is the first such sender), `MCP-Protocol-Version` and `Mcp-Method`
   * derive from the message itself. The connection-level version slot is
   * neither consulted nor mutated; messages without an envelope claim are
   * untouched, so no 2026 header can appear on a legacy exchange.
   */
  private _applyBodyDerivedHeaders;
  /**
   * `true` when the outbound message is a single request carrying a
   * modern-era protocol-version envelope claim — the same predicate that
   * gates body-derived `mcp-method`/`mcp-name` emission. Used to confine the
   * 400-body-as-ProtocolError delivery to modern-era exchanges only.
   */
  private _isModernEnvelopedRequest;
  private _startOrAuthSse;
  /**
   * Calculates the next reconnection delay using a backoff algorithm
   *
   * @param attempt Current reconnection attempt count for the specific stream
   * @returns Time to wait in milliseconds before next reconnection attempt
   */
  private _getNextReconnectionDelay;
  /**
   * Schedule a reconnection attempt using server-provided retry interval or backoff
   *
   * @param lastEventId The ID of the last received event for resumability
   * @param attemptCount Current reconnection attempt count for this specific stream
   */
  private _scheduleReconnection;
  private _handleSseStream;
  start(): Promise<void>;
  /**
   * Call this method after the user has finished authorizing via their user agent and is redirected back to the MCP client application. This will exchange the authorization code for an access token, enabling the next connection attempt to successfully auth.
   *
   * **Preferred:** pass the callback URL's `searchParams` directly. The SDK extracts `code`
   * and `iss`, validates `iss` against the recorded issuer (RFC 9207) **before** reading any
   * other parameter, and on mismatch throws an {@linkcode IssuerMismatchError} that carries
   * none of the callback's `error`/`error_description`/`error_uri` text — those are
   * attacker-controlled in a mix-up attack and MUST NOT be displayed. The `(code, iss?)`
   * positional form remains supported for back-compat.
   *
   * The SDK does **not** validate `state`; compare it to your stored value before calling
   * `finishAuth`.
   *
   * @param callbackParams - The `URLSearchParams` from the authorization callback URL
   *   (e.g. `new URL(callbackUrl).searchParams`). `code` and `iss` are read from it.
   */
  finishAuth(callbackParams: URLSearchParams): Promise<void>;
  /**
   * @param authorizationCode - The `code` query parameter from the authorization callback URL.
   * @param iss - The form-urldecoded `iss` query parameter from the same callback URL, if
   *   present. Validated per RFC 9207 against the recorded issuer before the code is redeemed.
   *   When the authorization server advertises `authorization_response_iss_parameter_supported: true`,
   *   omitting this causes the exchange to be **rejected** with {@linkcode IssuerMismatchError}.
   */
  finishAuth(authorizationCode: string, iss?: string): Promise<void>;
  close(): Promise<void>;
  send(message: JSONRPCMessage | JSONRPCMessage[], options?: {
    resumptionToken?: string;
    onresumptiontoken?: (token: string) => void;
    requestSignal?: AbortSignal;
    onRequestStreamEnd?: () => void;
    headers?: Readonly<Record<string, string>>;
  }): Promise<void>;
  private _send;
  get sessionId(): string | undefined;
  /**
   * Terminates the current session by sending a `DELETE` request to the server.
   *
   * Clients that no longer need a particular session
   * (e.g., because the user is leaving the client application) SHOULD send an
   * HTTP `DELETE` to the MCP endpoint with the `Mcp-Session-Id` header to explicitly
   * terminate the session.
   *
   * The server MAY respond with HTTP `405 Method Not Allowed`, indicating that
   * the server does not allow clients to terminate sessions.
   */
  terminateSession(): Promise<void>;
  setProtocolVersion(version: string): void;
  get protocolVersion(): string | undefined;
  /**
   * Resume an SSE stream from a previous event ID.
   * Opens a `GET` SSE connection with `Last-Event-ID` header to replay missed events.
   *
   * @param lastEventId The event ID to resume from
   * @param options Optional callback to receive new resumption tokens
   */
  resumeStream(lastEventId: string, options?: {
    onresumptiontoken?: (token: string) => void;
  }): Promise<void>;
}
//#endregion
//#region src/fromJsonSchema.d.ts
declare function fromJsonSchema<T = unknown>(schema: JsonSchemaType, validator?: jsonSchemaValidator): StandardSchemaWithJSON<T, T>;
//#endregion
export { type AddClientAuthentication, Annotations, type AssertionCallback, AudioContent, AuthInfo, type AuthOptions, type AuthProvider, type AuthResult, AuthorizationServerMetadata, AuthorizationServerMismatchError, BAGGAGE_META_KEY, BaseContext, BaseMetadata, BlobResourceContents, BooleanSchema, CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, type CacheEntry, type CacheKey, type CacheMode, type CacheScope, type CacheableRequestOptions, CallToolRequest, type CallToolRequestOptions, CallToolRequestParams, CallToolResult, CancelTaskRequest, CancelTaskResult, CancelledNotification, CancelledNotificationParams, Client, type ClientAuthMethod, ClientCapabilities, ClientContext, ClientCredentialsProvider, type ClientCredentialsProviderOptions, ClientNotification, type ClientOptions, ClientRequest, ClientResult, CompatibilityCallToolResult, CompleteRequest, CompleteRequestParams, CompleteRequestPrompt, CompleteRequestResourceTemplate, CompleteResult, type ConnectOptions, ContentBlock, CreateMessageRequest, CreateMessageRequestParams, CreateMessageRequestParamsBase, CreateMessageRequestParamsWithTools, CreateMessageResult, CreateMessageResultWithTools, CreateTaskResult, type CrossAppAccessContext, CrossAppAccessProvider, type CrossAppAccessProviderOptions, Cursor, DEFAULT_NEGOTIATED_PROTOCOL_VERSION, DEFAULT_REQUEST_TIMEOUT_MSEC, DPOP_SUPPORTED_ALGS, type DiscoverAndRequestJwtAuthGrantOptions, DiscoverRequest, DiscoverResult, type DpopAlg, type DpopKeyPair, type DpopProofRequest, DpopSession, type DpopSessionSource, type DpopTokenSource, ElicitRequest, ElicitRequestFormParams, ElicitRequestParams, ElicitRequestURLParams, ElicitResult, ElicitationCompleteNotification, ElicitationCompleteNotificationParams, EmbeddedResource, EmptyResult, EnumSchema, FetchLike, type GenerateDpopKeyPairOptions, GetPromptRequest, GetPromptRequestParams, GetPromptResult, GetTaskPayloadRequest, GetTaskPayloadResult, GetTaskRequest, GetTaskResult, HandlerResultTypeMap, INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, Icon, Icons, IdJagTokenExchangeResponse, ImageContent, Implementation, InMemoryResponseCacheStore, type InMemoryResponseCacheStoreOptions, InMemoryTransport, InitializeRequest, InitializeRequestParams, InitializeResult, InitializedNotification, InputRequest, InputRequests, type InputRequiredOptions, InputRequiredResult, InputResponse, InputResponses, InsecureTokenEndpointError, InsufficientScopeError, InternalError, InvalidParamsError, InvalidRequestError, IssuerMismatchError, JSONArray, JSONObject, JSONRPCErrorResponse, JSONRPCMessage, JSONRPCNotification, JSONRPCRequest, JSONRPCResponse, JSONRPCResultResponse, JSONRPC_VERSION, JSONValue, JsonSchemaType, JsonSchemaValidator, JsonSchemaValidatorResult, type JwtAuthGrantResult, LATEST_PROTOCOL_VERSION, LOG_LEVEL_META_KEY, LegacyTitledEnumSchema, ListChangedCallback, ListChangedHandlers, ListChangedOptions, ListPromptsRequest, ListPromptsResult, ListResourceTemplatesRequest, ListResourceTemplatesResult, ListResourcesRequest, ListResourcesResult, ListRootsRequest, ListRootsResult, ListTasksRequest, ListTasksResult, ListToolsRequest, ListToolsResult, LoggingLevel, LoggingMessageNotification, LoggingMessageNotificationParams, type LoggingOptions, MAX_CACHE_TTL_MS, METHOD_NOT_FOUND, type MaybePromise, type McpSubscription, MessageClassification, MessageExtraInfo, MetaObject, MethodNotFoundError, type Middleware, MissingRequiredClientCapabilityError, MissingRequiredClientCapabilityErrorData, ModelHint, ModelPreferences, MultiSelectEnumSchema, Notification, NotificationMethod, NotificationOptions, NotificationParams, NotificationTypeMap, NumberSchema, OAuthClientFlowError, OAuthClientInformation, type OAuthClientInformationContext, OAuthClientInformationFull, OAuthClientInformationMixed, OAuthClientMetadata, type OAuthClientProvider, OAuthClientRegistrationError, type OAuthDiscoveryState, OAuthError, OAuthErrorCode, OAuthErrorResponse, OAuthMetadata, OAuthProtectedResourceMetadata, type OAuthServerInfo, OAuthTokenRevocationRequest, OAuthTokens, OpenIdProviderDiscoveryMetadata, OpenIdProviderMetadata, PARSE_ERROR, PROTOCOL_VERSION_META_KEY, PaginatedRequest, PaginatedRequestParams, PaginatedResult, ParseError, PingRequest, PrimitiveSchemaDefinition, type PriorDiscovery, PrivateKeyJwtProvider, type PrivateKeyJwtProviderOptions, Progress, ProgressCallback, ProgressNotification, ProgressNotificationParams, ProgressToken, Prompt, PromptArgument, PromptListChangedNotification, PromptMessage, PromptReference, Protocol, ProtocolEra, ProtocolError, ProtocolErrorCode, ProtocolOptions, RELATED_TASK_META_KEY, ReadBuffer, ReadResourceRequest, ReadResourceRequestParams, ReadResourceResult, type ReconnectionScheduler, RegistrationRejectedError, RelatedTaskMetadata, Request, RequestHandlerSchemas, RequestId, type RequestJwtAuthGrantOptions, type RequestLogger, RequestMeta, RequestMetaEnvelope, RequestMetaObject, RequestMethod, RequestOptions, RequestParams, RequestStateAccessor, RequestTypeMap, Resource, ResourceContents, ResourceLink, ResourceListChangedNotification, ResourceNotFoundError, ResourceRequestParams, ResourceTemplateReference, ResourceTemplateType, ResourceUpdatedNotification, ResourceUpdatedNotificationParams, type ResponseCacheStore, Result, ResultMetaObject, ResultTypeMap, Role, Root, RootsListChangedNotification, SERVER_INFO_META_KEY, SSEClientTransport, type SSEClientTransportOptions, STDIO_DEFAULT_MAX_BUFFER_SIZE, SUBSCRIPTION_ID_META_KEY, SUPPORTED_PROTOCOL_VERSIONS, SamplingContent, SamplingMessage, SamplingMessageContentBlock, SdkError, SdkErrorCode, SdkHttpError, SdkHttpErrorData, ServerCapabilities, ServerContext, ServerNotification, ServerRequest, ServerResult, SetLevelRequest, SetLevelRequestParams, SingleSelectEnumSchema, SpecTypeName, SpecTypes, SseError, StandardSchemaV1, StandardSchemaV1Sync, StandardSchemaWithJSON, type StartSSEOptions, StaticPrivateKeyJwtProvider, type StaticPrivateKeyJwtProviderOptions, StoredOAuthClientInformation, StoredOAuthTokens, StreamableHTTPClientTransport, type StreamableHTTPClientTransportOptions, type StreamableHTTPReconnectionOptions, StringSchema, SubscribeRequest, SubscribeRequestParams, SubscriptionFilter, SubscriptionsAcknowledgedNotification, SubscriptionsAcknowledgedNotificationParams, SubscriptionsListenRequest, SubscriptionsListenRequestParams, SubscriptionsListenResult, SubscriptionsListenResultMeta, TRACEPARENT_META_KEY, TRACESTATE_META_KEY, Task, TaskAugmentedRequestParams, TaskCreationParams, TaskMetadata, TaskStatus, TaskStatusNotification, TaskStatusNotificationParams, TextContent, TextResourceContents, TitledMultiSelectEnumSchema, TitledSingleSelectEnumSchema, Tool, ToolAnnotations, ToolChoice, ToolExecution, ToolListChangedNotification, ToolResultContent, ToolUseContent, Transport, TransportSendOptions, UnauthorizedError, UnsubscribeRequest, UnsubscribeRequestParams, UnsupportedProtocolVersionError, UnsupportedProtocolVersionErrorData, UntitledMultiSelectEnumSchema, UntitledSingleSelectEnumSchema, UriTemplate, UrlElicitationRequiredError, Variables, type VersionNegotiationMode, type VersionNegotiationOptions, type VersionNegotiationProbeOptions, accessTokenHash, applyMiddlewares, assertCompleteRequestPrompt, assertCompleteRequestResourceTemplate, assertSecureTokenEndpoint, auth, buildDiscoveryUrls, checkResourceAllowed, computeScopeUnion, createFetchWithInit, createMiddleware, createPrivateKeyJwtAuth, deserializeMessage, discoverAndRequestJwtAuthGrant, discoverAuthorizationServerMetadata, discoverOAuthMetadata, discoverOAuthProtectedResourceMetadata, discoverOAuthServerInfo, exchangeAuthorization, exchangeJwtAuthGrant, extractResourceMetadataUrl, extractWWWAuthenticateParams, fetchToken, fromJsonSchema, generateDpopKeyPair, getDisplayName, getSupportedElicitationModes, isCallToolResult, isDpopNonceChallenge, isHttpsUrl, isInitializeRequest, isInitializedNotification, isInputRequiredResult, isJSONRPCErrorResponse, isJSONRPCNotification, isJSONRPCRequest, isJSONRPCResponse, isJSONRPCResultResponse, isJsonContentType, isSpecType, isStrictScopeSuperset, isTaskAugmentedRequestParams, jsonSchemaValidator, mergeCapabilities, parseErrorResponse, parseJSONRPCMessage, preloadSchemas, prepareAuthorizationCodeRequest, refreshAuthorization, registerClient, requestJwtAuthorizationGrant, resolveClientMetadata, resourceUrlFromServerUrl, selectClientAuthMethod, selectResourceURL, serializeMessage, specTypeSchemas, startAuthorization, validateAuthorizationResponseIssuer, validateClientMetadataUrl, withDpop, withDpopFromProvider, withInputRequired, withLogging, withOAuth };
//# sourceMappingURL=index.d.cts.map