import { $ as ProtocolErrorCode, A as assertCompleteRequestPrompt, B as isJSONRPCResultResponse, C as withInputRequired, Ct as checkResourceAllowed, E as mcpNameSource, Et as IdJagTokenExchangeResponseSchema, F as isInputRequiredResult, Ft as SdkHttpError, H as parseJSONRPCMessage, I as isJSONRPCErrorResponse, It as OAuthError, J as MissingRequiredClientCapabilityError, L as isJSONRPCNotification, Lt as OAuthErrorCode, M as isCallToolResult, N as isInitializeRequest, Nt as SdkError, O as encodeMcpParamValue, Ot as OAuthErrorResponseSchema, P as isInitializedNotification, Pt as SdkErrorCode, Q as UrlElicitationRequiredError, R as isJSONRPCRequest, Rt as brandedHasInstance, St as TRACESTATE_META_KEY, Tt as withoutIssuer, V as isTaskAugmentedRequestParams, W as JSONRPCMessageSchema, X as ResourceNotFoundError, Y as ProtocolError, Z as UnsupportedProtocolVersionError, _ as DEFAULT_REQUEST_TIMEOUT_MSEC, _t as RELATED_TASK_META_KEY, a as createFetchWithInit, at as CLIENT_CAPABILITIES_META_KEY, b as isSpecType, bt as SUPPORTED_PROTOCOL_VERSIONS, c as unfollowedRedirect, ct as INTERNAL_ERROR, d as deserializeMessage, dt as JSONRPC_VERSION, f as serializeMessage, ft as LATEST_PROTOCOL_VERSION, gt as PROTOCOL_VERSION_META_KEY, h as mediaTypeEssence, ht as PARSE_ERROR, i as UriTemplate, it as BAGGAGE_META_KEY, j as assertCompleteRequestResourceTemplate, jt as OAuthTokensSchema, l as ReadBuffer, lt as INVALID_PARAMS, m as isJsonContentType, mt as METHOD_NOT_FOUND, n as preloadSchemas, o as fetchLeavingRedirects, ot as CLIENT_INFO_META_KEY, p as getDisplayName, pt as LOG_LEVEL_META_KEY, r as InMemoryTransport, s as fetchWithinOrigin, st as DEFAULT_NEGOTIATED_PROTOCOL_VERSION, t as fromJsonSchema$1, tt as isModernProtocolVersion, u as STDIO_DEFAULT_MAX_BUFFER_SIZE, ut as INVALID_REQUEST, v as Protocol, vt as SERVER_INFO_META_KEY, wt as resourceUrlFromServerUrl, x as specTypeSchemas, xt as TRACEPARENT_META_KEY, y as mergeCapabilities, yt as SUBSCRIPTION_ID_META_KEY, z as isJSONRPCResponse, zt as stampErrorBrands } from "./src-CeKsbNLO.mjs";
import { A as resolveClientMetadata, B as OAuthClientFlowError, C as isOAuthClientProvider, D as refreshAuthorization, E as prepareAuthorizationCodeRequest, F as validateClientMetadataUrl, I as AuthorizationServerMismatchError, L as InsecureTokenEndpointError, M as selectResourceURL, N as startAuthorization, O as registerClient, P as validateAuthorizationResponseIssuer, R as InsufficientScopeError, S as isHttpsUrl, T as parseErrorResponse, V as RegistrationRejectedError, _ as discoverOAuthServerInfo, a as InMemoryResponseCacheStore, b as extractWWWAuthenticateParams, c as adaptOAuthProvider, d as auth, f as buildDiscoveryUrls, g as discoverOAuthProtectedResourceMetadata, h as discoverOAuthMetadata, i as markAuthSeamEscape, j as selectClientAuthMethod, k as resolveAuthorizationCallbackParams, l as applyClientAuthentication, m as discoverAuthorizationServerMetadata, o as MAX_CACHE_TTL_MS, p as computeScopeUnion, r as getSupportedElicitationModes, s as UnauthorizedError, t as Client, u as assertSecureTokenEndpoint, v as exchangeAuthorization, w as isStrictScopeSuperset, x as fetchToken, y as extractResourceMetadataUrl, z as IssuerMismatchError } from "./public-CvV4ZHkX.mjs";
import { DefaultJsonSchemaValidator } from "@modelcontextprotocol/client/_shims";
import { EventSource } from "eventsource";
import { EventSourceParserStream } from "eventsource-parser/stream";

//#region src/client/authExtensions.ts
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
function createPrivateKeyJwtAuth(options) {
	return async (_headers, params, url, metadata) => {
		if (globalThis.crypto === void 0) throw new TypeError("crypto is not available, please ensure you have Web Crypto API support for older Node.js versions (see https://github.com/modelcontextprotocol/typescript-sdk#nodejs-web-crypto-globalthiscrypto-compatibility)");
		const jose = await import("jose");
		const audience = String(options.audience ?? metadata?.issuer ?? url);
		const lifetimeSeconds = options.lifetimeSeconds ?? 300;
		const now = Math.floor(Date.now() / 1e3);
		const jti = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const baseClaims = {
			iss: options.issuer,
			sub: options.subject,
			aud: audience,
			exp: now + lifetimeSeconds,
			iat: now,
			jti
		};
		const claims = options.claims ? {
			...baseClaims,
			...options.claims
		} : baseClaims;
		const alg = options.alg;
		let key;
		if (typeof options.privateKey === "string") if (alg.startsWith("RS") || alg.startsWith("ES") || alg.startsWith("PS")) key = await jose.importPKCS8(options.privateKey, alg);
		else if (alg.startsWith("HS")) key = new TextEncoder().encode(options.privateKey);
		else throw new Error(`Unsupported algorithm ${alg}`);
		else if (options.privateKey instanceof Uint8Array) key = alg.startsWith("HS") ? options.privateKey : await jose.importPKCS8(new TextDecoder().decode(options.privateKey), alg);
		else key = await jose.importJWK(options.privateKey, alg);
		const assertion = await new jose.SignJWT(claims).setProtectedHeader({
			alg,
			typ: "JWT"
		}).setIssuer(options.issuer).setSubject(options.subject).setAudience(audience).setIssuedAt(now).setExpirationTime(now + lifetimeSeconds).setJti(jti).sign(key);
		params.set("client_assertion", assertion);
		params.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
	};
}
/**
* The `issuer` stamp for constructor-supplied client information. Omitting `expectedIssuer` is
* deprecated: nothing else says which authorization server such credentials belong to.
*/
function checkedExpectedIssuer(expectedIssuer) {
	if (expectedIssuer === void 0) console.warn("[mcp-sdk] Omitting `expectedIssuer` is deprecated. Without it, the MCP server decides which authorization server receives this client's credentials; pass your authorization server's issuer URL as `expectedIssuer` so they are only sent there.");
	else if (typeof expectedIssuer !== "string" || !expectedIssuer) throw new Error("expectedIssuer must be the authorization server's issuer URL");
	return expectedIssuer;
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
var ClientCredentialsProvider = class {
	_tokens;
	_clientInfo;
	_clientMetadata;
	constructor(options) {
		this._clientInfo = {
			client_id: options.clientId,
			client_secret: options.clientSecret,
			issuer: checkedExpectedIssuer(options.expectedIssuer)
		};
		this._clientMetadata = {
			client_name: options.clientName ?? "client-credentials-client",
			redirect_uris: [],
			grant_types: ["client_credentials"],
			token_endpoint_auth_method: "client_secret_basic",
			scope: options.scope
		};
	}
	get redirectUrl() {}
	get clientMetadata() {
		return this._clientMetadata;
	}
	clientInformation() {
		return this._clientInfo;
	}
	tokens() {
		return this._tokens;
	}
	saveTokens(tokens) {
		this._tokens = tokens;
	}
	redirectToAuthorization() {
		throw new Error("redirectToAuthorization is not used for client_credentials flow");
	}
	saveCodeVerifier() {}
	codeVerifier() {
		throw new Error("codeVerifier is not used for client_credentials flow");
	}
	prepareTokenRequest(scope) {
		const params = new URLSearchParams({ grant_type: "client_credentials" });
		if (scope) params.set("scope", scope);
		return params;
	}
};
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
var PrivateKeyJwtProvider = class {
	_tokens;
	_clientInfo;
	_clientMetadata;
	addClientAuthentication;
	constructor(options) {
		this._clientInfo = {
			client_id: options.clientId,
			issuer: checkedExpectedIssuer(options.expectedIssuer)
		};
		this._clientMetadata = {
			client_name: options.clientName ?? "private-key-jwt-client",
			redirect_uris: [],
			grant_types: ["client_credentials"],
			token_endpoint_auth_method: "private_key_jwt",
			scope: options.scope
		};
		this.addClientAuthentication = createPrivateKeyJwtAuth({
			issuer: options.clientId,
			subject: options.clientId,
			privateKey: options.privateKey,
			alg: options.algorithm,
			lifetimeSeconds: options.jwtLifetimeSeconds,
			claims: options.claims
		});
	}
	get redirectUrl() {}
	get clientMetadata() {
		return this._clientMetadata;
	}
	clientInformation() {
		return this._clientInfo;
	}
	tokens() {
		return this._tokens;
	}
	saveTokens(tokens) {
		this._tokens = tokens;
	}
	redirectToAuthorization() {
		throw new Error("redirectToAuthorization is not used for client_credentials flow");
	}
	saveCodeVerifier() {}
	codeVerifier() {
		throw new Error("codeVerifier is not used for client_credentials flow");
	}
	prepareTokenRequest(scope) {
		const params = new URLSearchParams({ grant_type: "client_credentials" });
		if (scope) params.set("scope", scope);
		return params;
	}
};
/**
* OAuth provider for `client_credentials` grant with a static `private_key_jwt` assertion.
*
* This provider mirrors {@linkcode PrivateKeyJwtProvider} but instead of constructing and
* signing a JWT on each request, it accepts a pre-built JWT assertion string and
* uses it directly for authentication.
*/
var StaticPrivateKeyJwtProvider = class {
	_tokens;
	_clientInfo;
	_clientMetadata;
	addClientAuthentication;
	constructor(options) {
		this._clientInfo = {
			client_id: options.clientId,
			issuer: checkedExpectedIssuer(options.expectedIssuer)
		};
		this._clientMetadata = {
			client_name: options.clientName ?? "static-private-key-jwt-client",
			redirect_uris: [],
			grant_types: ["client_credentials"],
			token_endpoint_auth_method: "private_key_jwt",
			scope: options.scope
		};
		const assertion = options.jwtBearerAssertion;
		this.addClientAuthentication = async (_headers, params) => {
			params.set("client_assertion", assertion);
			params.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
		};
	}
	get redirectUrl() {}
	get clientMetadata() {
		return this._clientMetadata;
	}
	clientInformation() {
		return this._clientInfo;
	}
	tokens() {
		return this._tokens;
	}
	saveTokens(tokens) {
		this._tokens = tokens;
	}
	redirectToAuthorization() {
		throw new Error("redirectToAuthorization is not used for client_credentials flow");
	}
	saveCodeVerifier() {}
	codeVerifier() {
		throw new Error("codeVerifier is not used for client_credentials flow");
	}
	prepareTokenRequest(scope) {
		const params = new URLSearchParams({ grant_type: "client_credentials" });
		if (scope) params.set("scope", scope);
		return params;
	}
};
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
var CrossAppAccessProvider = class {
	_tokens;
	_clientInfo;
	_clientMetadata;
	_assertionCallback;
	_fetchFn;
	_authorizationServerUrl;
	_resourceUrl;
	_scope;
	constructor(options) {
		this._clientInfo = {
			client_id: options.clientId,
			client_secret: options.clientSecret,
			issuer: checkedExpectedIssuer(options.expectedIssuer)
		};
		this._clientMetadata = {
			client_name: options.clientName ?? "cross-app-access-client",
			redirect_uris: [],
			grant_types: ["urn:ietf:params:oauth:grant-type:jwt-bearer"],
			token_endpoint_auth_method: "client_secret_basic"
		};
		this._assertionCallback = options.assertion;
		this._fetchFn = options.fetchFn ?? fetch;
	}
	get redirectUrl() {}
	get clientMetadata() {
		return this._clientMetadata;
	}
	clientInformation() {
		return this._clientInfo;
	}
	tokens() {
		return this._tokens;
	}
	saveTokens(tokens) {
		this._tokens = tokens;
	}
	redirectToAuthorization() {
		throw new Error("redirectToAuthorization is not used for jwt-bearer flow");
	}
	saveCodeVerifier() {}
	codeVerifier() {
		throw new Error("codeVerifier is not used for jwt-bearer flow");
	}
	/**
	* Saves the authorization server URL discovered during OAuth flow.
	* This is called by the auth() function after RFC 9728 discovery.
	*/
	saveAuthorizationServerUrl(authorizationServerUrl) {
		this._authorizationServerUrl = authorizationServerUrl;
	}
	/**
	* Returns the cached authorization server URL if available.
	*/
	authorizationServerUrl() {
		return this._authorizationServerUrl;
	}
	/**
	* Saves the resource URL discovered during OAuth flow.
	* This is called by the auth() function after RFC 9728 discovery.
	*/
	saveResourceUrl(resourceUrl) {
		this._resourceUrl = resourceUrl;
	}
	/**
	* Returns the cached resource URL if available.
	*/
	resourceUrl() {
		return this._resourceUrl;
	}
	async prepareTokenRequest(scope) {
		const authServerUrl = this._authorizationServerUrl;
		const resourceUrl = this._resourceUrl;
		if (!authServerUrl) throw new Error("Authorization server URL not available. Ensure auth() has been called first.");
		if (!resourceUrl) throw new Error("Resource URL not available — server may not implement RFC 9728 Protected Resource Metadata (required for Cross-App Access), or auth() has not been called");
		this._scope = scope;
		const jwtAuthGrant = await this._assertionCallback({
			authorizationServerUrl: authServerUrl,
			resourceUrl,
			scope: this._scope,
			fetchFn: this._fetchFn
		});
		const params = new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: jwtAuthGrant
		});
		if (scope) params.set("scope", scope);
		return params;
	}
};

//#endregion
//#region src/client/crossAppAccess.ts
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
async function requestJwtAuthorizationGrant(options) {
	const { tokenEndpoint, audience, resource, idToken, clientId, clientSecret, scope, fetchFn = fetch } = options;
	const tokenUrl = assertSecureTokenEndpoint(tokenEndpoint);
	const params = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
		requested_token_type: "urn:ietf:params:oauth:token-type:id-jag",
		audience: String(audience),
		resource: String(resource),
		subject_token: idToken,
		subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
		client_id: clientId
	});
	if (clientSecret) params.set("client_secret", clientSecret);
	if (scope) params.set("scope", scope);
	const response = await fetchWithinOrigin(fetchFn)(tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params.toString()
	});
	if (!response.ok) {
		const errorBody = await response.json().catch(() => ({}));
		const parseResult$1 = OAuthErrorResponseSchema.safeParse(errorBody);
		if (parseResult$1.success) {
			const { error, error_description } = parseResult$1.data;
			throw new Error(`Token exchange failed: ${error}${error_description ? ` - ${error_description}` : ""}`);
		}
		throw new Error(`Token exchange failed with status ${response.status}: ${JSON.stringify(errorBody)}`);
	}
	const parseResult = IdJagTokenExchangeResponseSchema.safeParse(await response.json());
	if (!parseResult.success) throw new Error(`Invalid token exchange response: ${parseResult.error.message}`);
	return {
		jwtAuthGrant: parseResult.data.access_token,
		expiresIn: parseResult.data.expires_in,
		scope: parseResult.data.scope
	};
}
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
async function discoverAndRequestJwtAuthGrant(options) {
	const { idpUrl, fetchFn = fetch, ...restOptions } = options;
	const metadata = await discoverAuthorizationServerMetadata(String(idpUrl), { fetchFn });
	if (!metadata?.token_endpoint) throw new Error(`Failed to discover token endpoint for IdP: ${idpUrl}`);
	return requestJwtAuthorizationGrant({
		...restOptions,
		tokenEndpoint: metadata.token_endpoint,
		fetchFn
	});
}
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
async function exchangeJwtAuthGrant(options) {
	const { tokenEndpoint, jwtAuthGrant, clientId, clientSecret, authMethod = "client_secret_basic", fetchFn = fetch } = options;
	const tokenUrl = assertSecureTokenEndpoint(tokenEndpoint);
	const params = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		assertion: jwtAuthGrant
	});
	const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
	applyClientAuthentication(authMethod, {
		client_id: clientId,
		client_secret: clientSecret
	}, headers, params);
	const response = await fetchWithinOrigin(fetchFn)(tokenUrl, {
		method: "POST",
		headers,
		body: params.toString()
	});
	if (!response.ok) {
		const errorBody = await response.json().catch(() => ({}));
		const parseResult$1 = OAuthErrorResponseSchema.safeParse(errorBody);
		if (parseResult$1.success) {
			const { error, error_description } = parseResult$1.data;
			throw new Error(`JWT grant exchange failed: ${error}${error_description ? ` - ${error_description}` : ""}`);
		}
		throw new Error(`JWT grant exchange failed with status ${response.status}: ${JSON.stringify(errorBody)}`);
	}
	const responseBody = await response.json();
	const parseResult = OAuthTokensSchema.safeParse(withoutIssuer(responseBody));
	if (!parseResult.success) throw new Error(`Invalid token response: ${parseResult.error.message}`);
	return parseResult.data;
}

//#endregion
//#region src/client/dpop.ts
/** Asymmetric JWS algorithms usable for a DPoP proof (RFC 9449 §11.6 forbids symmetric algs and `none`). */
const DPOP_SUPPORTED_ALGS = [
	"ES256",
	"ES384",
	"ES512",
	"RS256",
	"RS384",
	"RS512",
	"PS256",
	"PS384",
	"PS512",
	"EdDSA"
];
const DEFAULT_DPOP_ALG = "ES256";
const DPOP_TYP = "dpop+jwt";
async function importJose() {
	if (globalThis.crypto === void 0) throw new TypeError("crypto is not available, please ensure you have Web Crypto API support for older Node.js versions (see https://github.com/modelcontextprotocol/typescript-sdk#nodejs-web-crypto-globalthiscrypto-compatibility)");
	return import("jose");
}
/** Generate an asymmetric DPoP signing key pair. Non-extractable by default (RFC 9449 §11). */
async function generateDpopKeyPair(options = {}) {
	const alg = options.alg ?? DEFAULT_DPOP_ALG;
	const jose = await importJose();
	const { publicKey, privateKey } = await jose.generateKeyPair(alg, { extractable: options.extractable ?? false });
	const publicJwk = await jose.exportJWK(publicKey);
	return {
		privateKey,
		publicKey,
		publicJwk,
		thumbprint: await jose.calculateJwkThumbprint(publicJwk, "sha256"),
		alg
	};
}
/**
* Compute the `ath` claim for a DPoP proof presented alongside an access token: the
* base64url-encoded SHA-256 digest of the ASCII access-token value (RFC 9449 §4.1).
*
* Uses Web Crypto (`crypto.subtle`) rather than a Node-only hashing API so this stays usable
* in browser and edge runtimes.
*/
async function accessTokenHash(accessToken) {
	if (globalThis.crypto?.subtle === void 0) throw new TypeError("crypto.subtle is not available, please ensure you have Web Crypto API support for older Node.js versions (see https://github.com/modelcontextprotocol/typescript-sdk#nodejs-web-crypto-globalthiscrypto-compatibility)");
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
	return base64UrlEncode(new Uint8Array(digest));
}
function base64UrlEncode(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCodePoint(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
/** Strip the query and fragment from a URL, per RFC 9449 §4.2 (`htu` MUST NOT contain either). */
function stripQueryAndFragment(url) {
	const u = new URL(url.toString());
	return `${u.origin}${u.pathname}`;
}
/** A fresh, cryptographically random `jti` (RFC 9449 §4.2 — MUST be unique per proof). */
function randomJti() {
	const bytes = new Uint8Array(16);
	globalThis.crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}
/**
* A DPoP signing identity plus the small amount of state RFC 9449 requires across requests:
* the key pair and, per origin, the most recently server-supplied nonce (RFC 9449 §8/§9).
*
* One `DpopSession` is meant to live for the lifetime of a single OAuth client registration —
* the token endpoint and the resource server are different origins and get independent nonce
* slots, so a nonce challenge from one never leaks into proofs sent to the other.
*/
var DpopSession = class DpopSession {
	nonces = /* @__PURE__ */ new Map();
	constructor(keyPair) {
		this.keyPair = keyPair;
	}
	/** Create a session with a fresh key pair, or reuse a caller-supplied one. */
	static async create(options = {}) {
		return new DpopSession(options.keyPair ?? await generateDpopKeyPair({ alg: options.alg }));
	}
	/** RFC 7638 JWK SHA-256 thumbprint of the signing key — matches the token's `cnf.jkt` once bound. */
	get thumbprint() {
		return this.keyPair.thumbprint;
	}
	/** The JWS algorithm this session signs proofs with. */
	get alg() {
		return this.keyPair.alg;
	}
	/** The public JWK embedded in every proof's `jwk` header parameter. */
	get publicJwk() {
		return this.keyPair.publicJwk;
	}
	/** The remembered nonce for `url`'s origin, if the server has issued one (RFC 9449 §8/§9). */
	nonceFor(url) {
		return this.nonces.get(new URL(url.toString()).origin);
	}
	/** Record a server-supplied nonce for `url`'s origin (newest-wins, RFC 9449 §8.2). */
	rememberNonce(url, nonce) {
		this.nonces.set(new URL(url.toString()).origin, nonce);
	}
	/**
	* Capture a `DPoP-Nonce` response header, if present, for `url`'s origin. RFC 9449 §8.2 says a
	* fresh nonce may ride on *any* response (success or failure), so call this unconditionally
	* after every request, not only on a `use_dpop_nonce` challenge.
	*/
	observeNonce(response, url) {
		const nonce = response.headers.get("dpop-nonce");
		if (nonce) this.rememberNonce(url, nonce);
	}
	/**
	* Build a fresh DPoP proof JWT. Always mints a new `jti` — proofs are never cached or reused,
	* since RFC 9449 §4.3 step 9 requires each to be presented at most once.
	*/
	async buildProof(request) {
		const jose = await importJose();
		const htu = stripQueryAndFragment(request.htu);
		const nonce = request.nonce ?? this.nonceFor(request.htu);
		const payload = {
			jti: randomJti(),
			htm: request.htm.toUpperCase(),
			htu,
			iat: Math.floor(Date.now() / 1e3)
		};
		if (request.accessToken !== void 0) payload.ath = await accessTokenHash(request.accessToken);
		if (nonce !== void 0) payload.nonce = nonce;
		return new jose.SignJWT(payload).setProtectedHeader({
			alg: this.keyPair.alg,
			typ: DPOP_TYP,
			jwk: this.keyPair.publicJwk
		}).sign(this.keyPair.privateKey);
	}
};
/**
* Whether `wwwAuthenticate` advertises a `DPoP` auth-scheme challenge (matched at the start of the
* header or after a comma, per RFC 9110 §11.6.1 — a server may list several schemes together, e.g.
* `Bearer …, DPoP …`).
*/
function hasDpopChallenge(wwwAuthenticate) {
	return /(?:^|,)\s*dpop(?:\s|$|,)/i.test(wwwAuthenticate);
}
/**
* Whether `response` is a resource-server `use_dpop_nonce` challenge (RFC 9449 §9): a `401` whose
* `WWW-Authenticate` header carries a `DPoP` challenge with `error="use_dpop_nonce"`.
*
* A conformant retry re-signs the proof with the nonce {@linkcode DpopSession.observeNonce} just
* captured — never resend the original proof: RFC 9449 §4.2 requires a unique `jti` per proof, and
* replaying one across the challenge/retry boundary is itself a violation.
*/
function isDpopNonceChallenge(response) {
	if (response.status !== 401) return false;
	const wwwAuthenticate = response.headers.get("www-authenticate") ?? "";
	return hasDpopChallenge(wwwAuthenticate) && /use_dpop_nonce/i.test(wwwAuthenticate);
}

//#endregion
//#region src/client/middleware.ts
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
const withOAuth = (provider, baseUrl) => (baseNext) => {
	const next = provider.dpop ? withDpopFromProvider(provider)(baseNext) : baseNext;
	return async (input, init) => {
		const makeRequest = async () => {
			const headers = new Headers(init?.headers);
			const tokens = await provider.tokens();
			if (tokens) headers.set("Authorization", `Bearer ${tokens.access_token}`);
			return await next(input, {
				...init,
				headers
			});
		};
		let response = await makeRequest();
		if (response.status === 401) try {
			const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
			const result = await auth(provider, {
				serverUrl: baseUrl || (typeof input === "string" ? new URL(input).origin : input.origin),
				resourceMetadataUrl,
				scope,
				fetchFn: baseNext
			});
			if (result === "REDIRECT") throw new UnauthorizedError("Authentication requires user authorization - redirect initiated");
			if (result !== "AUTHORIZED") throw new UnauthorizedError(`Authentication failed with result: ${result}`);
			response = await makeRequest();
		} catch (error) {
			if (error instanceof UnauthorizedError) throw error;
			throw new UnauthorizedError(`Failed to re-authenticate: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (response.status === 401) throw new UnauthorizedError(`Authentication failed for ${typeof input === "string" ? input : input.toString()}`);
		return response;
	};
};
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
const withDpop = (session, getToken) => (next) => {
	const resolveSession = typeof session === "function" ? session : () => session;
	return async (input, init) => {
		const method = (init?.method ?? "GET").toUpperCase();
		const url = new URL(input.toString());
		const activeSession = await resolveSession();
		if (!activeSession) return next(input, init);
		const makeRequest = async () => {
			const accessToken = await getToken();
			if (!accessToken) return next(input, init);
			const headers = new Headers(init?.headers);
			const proof = await activeSession.buildProof({
				htm: method,
				htu: url,
				accessToken
			});
			headers.set("Authorization", `DPoP ${accessToken}`);
			headers.set("DPoP", proof);
			return next(input, {
				...init,
				headers
			});
		};
		let response = await makeRequest();
		if (isDpopNonceChallenge(response) && response.headers.has("dpop-nonce")) {
			activeSession.observeNonce(response, url);
			await response.text?.().catch(() => {});
			response = await makeRequest();
		}
		activeSession.observeNonce(response, url);
		return response;
	};
};
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
const withDpopFromProvider = (provider) => withDpop(async () => {
	try {
		return await provider.dpop?.();
	} catch (error) {
		throw markAuthSeamEscape(error);
	}
}, async () => {
	let tokens;
	try {
		tokens = await provider.tokens();
	} catch (error) {
		throw markAuthSeamEscape(error);
	}
	return tokens?.token_type?.toLowerCase() === "dpop" ? tokens.access_token : void 0;
});
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
const withLogging = (options = {}) => {
	const { logger, includeRequestHeaders = false, includeResponseHeaders = false, statusLevel = 0 } = options;
	const defaultLogger = (input) => {
		const { method, url, status, statusText, duration, requestHeaders, responseHeaders, error } = input;
		let message = error ? `HTTP ${method} ${url} failed: ${error.message} (${duration}ms)` : `HTTP ${method} ${url} ${status} ${statusText} (${duration}ms)`;
		if (includeRequestHeaders && requestHeaders) {
			const reqHeaders = [...requestHeaders.entries()].map(([key, value]) => `${key}: ${value}`).join(", ");
			message += `\n  Request Headers: {${reqHeaders}}`;
		}
		if (includeResponseHeaders && responseHeaders) {
			const resHeaders = [...responseHeaders.entries()].map(([key, value]) => `${key}: ${value}`).join(", ");
			message += `\n  Response Headers: {${resHeaders}}`;
		}
		if (error || status >= 400) console.error(message);
		else console.log(message);
	};
	const logFn = logger || defaultLogger;
	return (next) => async (input, init) => {
		const startTime = performance.now();
		const method = init?.method || "GET";
		const url = typeof input === "string" ? input : input.toString();
		const requestHeaders = includeRequestHeaders ? new Headers(init?.headers) : void 0;
		try {
			const response = await next(input, init);
			const duration = performance.now() - startTime;
			if (response.status >= statusLevel) logFn({
				method,
				url,
				status: response.status,
				statusText: response.statusText,
				duration,
				requestHeaders,
				responseHeaders: includeResponseHeaders ? response.headers : void 0
			});
			return response;
		} catch (error) {
			logFn({
				method,
				url,
				status: 0,
				statusText: "Network Error",
				duration: performance.now() - startTime,
				requestHeaders,
				error
			});
			throw error;
		}
	};
};
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
const applyMiddlewares = (...middleware) => {
	return (next) => {
		let handler = next;
		for (const mw of middleware) handler = mw(handler);
		return handler;
	};
};
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
const createMiddleware = (handler) => {
	return (next) => (input, init) => handler(next, input, init);
};

//#endregion
//#region src/client/sse.ts
var SseError = class extends Error {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.SseError" });
	}
	static [Symbol.hasInstance](value) {
		return brandedHasInstance(this, value);
	}
	/**
	* Brand-based type guard: equivalent to `value instanceof this`, as an
	* explicit static predicate (the axios/AWS-SDK `isInstance` style). Reads
	* the caller's own brand via `this`, so every branded subclass gets a
	* correctly-scoped guard by inheritance. Must be invoked on the class —
	* in callback position write `v => SdkError.isInstance(v)`, not
	* `.filter(SdkError.isInstance)` (detached calls throw rather than
	* silently matching nothing).
	*/
	static isInstance(value) {
		if (typeof this !== "function") throw new TypeError("isInstance must be called on the class (e.g. `SdkError.isInstance(value)`); for callbacks use `v => SdkError.isInstance(v)`");
		return brandedHasInstance(this, value);
	}
	constructor(code, message, event) {
		super(`SSE error: ${message}`);
		this.code = code;
		this.event = event;
		stampErrorBrands(this, new.target);
	}
};
/**
* Client transport for SSE: this will connect to a server using Server-Sent Events for receiving
* messages and make separate `POST` requests for sending messages.
* @deprecated SSEClientTransport is deprecated. Prefer to use {@linkcode index.StreamableHTTPClientTransport | StreamableHTTPClientTransport} where possible instead. Note that because some servers are still using SSE, clients may need to support both transports during the migration period.
*/
var SSEClientTransport = class {
	_eventSource;
	_endpoint;
	_abortController;
	_url;
	_resourceMetadataUrl;
	_scope;
	_eventSourceInit;
	_requestInit;
	_authProvider;
	_oauthProvider;
	_skipIssuerMetadataValidation;
	_fetch;
	_fetchWithInit;
	_redirectPolicy;
	_dpop;
	_protocolVersion;
	onclose;
	onerror;
	onmessage;
	constructor(url, opts) {
		this._url = url;
		this._resourceMetadataUrl = void 0;
		this._scope = void 0;
		this._eventSourceInit = opts?.eventSourceInit;
		this._requestInit = opts?.requestInit;
		this._skipIssuerMetadataValidation = opts?.skipIssuerMetadataValidation;
		this._fetch = opts?.fetch;
		if (isOAuthClientProvider(opts?.authProvider)) {
			this._oauthProvider = opts.authProvider;
			this._authProvider = adaptOAuthProvider(opts.authProvider, { skipIssuerMetadataValidation: opts.skipIssuerMetadataValidation });
			if (opts.authProvider.dpop) {
				this._dpop = withDpopFromProvider(opts.authProvider);
				this._fetch = this._dpop(opts.fetch ?? fetch);
			}
		} else this._authProvider = opts?.authProvider;
		this._redirectPolicy = opts?.redirectPolicy;
		this._fetchWithInit = createFetchWithInit(opts?.fetch, opts?.requestInit);
		if (this._redirectPolicy === "follow") this._fetchWithInit = fetchLeavingRedirects(this._fetchWithInit);
	}
	_last401Response;
	_connectAuthRetried = false;
	/** `baseFetch` with redirects handled as `redirectPolicy` says. */
	_redirects(baseFetch) {
		return this._redirectPolicy === "follow" ? baseFetch : fetchWithinOrigin(baseFetch);
	}
	/** Error text for a redirect `response` that was not followed, or `undefined` for any other response. */
	_unfollowedRedirect(url, response) {
		const text = this._redirectPolicy === "follow" ? void 0 : unfollowedRedirect(url, response);
		return text && `${text} (redirectPolicy: 'same-origin')`;
	}
	async _commonHeaders() {
		const headers = new Headers(this._requestInit?.headers || void 0);
		let token;
		try {
			token = await this._authProvider?.token();
		} catch (error) {
			throw markAuthSeamEscape(error);
		}
		if (token) headers.set("Authorization", `Bearer ${token}`);
		if (this._protocolVersion) headers.set("mcp-protocol-version", this._protocolVersion);
		return headers;
	}
	_startOrAuth() {
		const eventSourceFetch = this._eventSourceInit?.fetch;
		const fetchImpl = this._redirects(eventSourceFetch ? this._dpop?.(eventSourceFetch) ?? eventSourceFetch : this._fetch ?? fetch);
		let redirect;
		return new Promise((resolve, reject) => {
			this._eventSource = new EventSource(this._url.href, {
				...this._eventSourceInit,
				fetch: async (url, init) => {
					const headers = await this._commonHeaders();
					headers.set("Accept", "text/event-stream");
					const response = await fetchImpl(url, {
						...init,
						headers
					});
					redirect = this._unfollowedRedirect(url, response);
					if (response.status === 401) {
						this._last401Response = response;
						if (response.headers.has("www-authenticate")) {
							const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
							this._resourceMetadataUrl = resourceMetadataUrl;
							this._scope = scope;
						}
					}
					return response;
				}
			});
			this._abortController = new AbortController();
			this._eventSource.onerror = (event) => {
				if (event.code === 401 && this._authProvider) {
					if (this._authProvider.onUnauthorized && this._last401Response && !this._connectAuthRetried) {
						const response = this._last401Response;
						this._last401Response = void 0;
						this._connectAuthRetried = true;
						this._eventSource?.close();
						this._authProvider.onUnauthorized({
							response,
							serverUrl: this._url,
							fetchFn: this._fetchWithInit
						}).then(() => this._startOrAuth().then(resolve, reject), (error$2) => {
							this._connectAuthRetried = false;
							markAuthSeamEscape(error$2);
							this.onerror?.(error$2);
							reject(error$2);
						});
						return;
					}
					const retried = this._connectAuthRetried;
					this._connectAuthRetried = false;
					const error$1 = markAuthSeamEscape(retried ? new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, "Server returned 401 after re-authentication", {
						status: 401,
						statusText: this._last401Response?.statusText ?? ""
					}) : new UnauthorizedError());
					this._last401Response = void 0;
					reject(error$1);
					this.onerror?.(error$1);
					return;
				}
				this._connectAuthRetried = false;
				const error = new SseError(event.code, redirect ?? event.message, event);
				reject(error);
				this.onerror?.(error);
			};
			this._eventSource.onopen = () => {
				this._connectAuthRetried = false;
			};
			this._eventSource.addEventListener("endpoint", (event) => {
				const messageEvent = event;
				try {
					this._endpoint = new URL(messageEvent.data, this._url);
					if (this._endpoint.origin !== this._url.origin) throw new Error(`Endpoint origin does not match connection origin: ${this._endpoint.origin}`);
				} catch (error) {
					reject(error);
					this.onerror?.(error);
					this.close();
					return;
				}
				resolve();
			});
			this._eventSource.onmessage = (event) => {
				const messageEvent = event;
				let message;
				try {
					message = JSONRPCMessageSchema.parse(JSON.parse(messageEvent.data));
				} catch (error) {
					this.onerror?.(error);
					return;
				}
				this.onmessage?.(message);
			};
		});
	}
	async start() {
		if (this._eventSource) throw new Error("SSEClientTransport already started! If using Client class, note that connect() calls start() automatically.");
		return await this._startOrAuth();
	}
	async finishAuth(codeOrParams, iss) {
		if (!this._oauthProvider) throw new UnauthorizedError("finishAuth requires an OAuthClientProvider");
		const { authorizationCode, iss: issParam } = await resolveAuthorizationCallbackParams(codeOrParams, iss, this._oauthProvider, this._url, {
			fetchFn: this._fetchWithInit,
			resourceMetadataUrl: this._resourceMetadataUrl
		});
		if (await auth(this._oauthProvider, {
			serverUrl: this._url,
			authorizationCode,
			iss: issParam,
			resourceMetadataUrl: this._resourceMetadataUrl,
			scope: this._scope,
			fetchFn: this._fetchWithInit,
			skipIssuerMetadataValidation: this._skipIssuerMetadataValidation
		}) !== "AUTHORIZED") throw new UnauthorizedError("Failed to authorize");
	}
	async close() {
		this._abortController?.abort();
		this._eventSource?.close();
		this.onclose?.();
	}
	async send(message) {
		return this._send(message, false);
	}
	async _send(message, isAuthRetry) {
		if (!this._endpoint) throw new SdkError(SdkErrorCode.NotConnected, "Not connected");
		try {
			const headers = await this._commonHeaders();
			headers.set("content-type", "application/json");
			const init = {
				...this._requestInit,
				method: "POST",
				headers,
				body: JSON.stringify(message),
				signal: this._abortController?.signal
			};
			const response = await this._redirects(this._fetch ?? fetch)(this._endpoint, init);
			if (!response.ok) {
				if (response.status === 401 && this._authProvider) {
					if (response.headers.has("www-authenticate")) {
						const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
						this._resourceMetadataUrl = resourceMetadataUrl;
						this._scope = scope;
					}
					if (this._authProvider.onUnauthorized && !isAuthRetry) {
						try {
							await this._authProvider.onUnauthorized({
								response,
								serverUrl: this._url,
								fetchFn: this._fetchWithInit
							});
						} catch (error) {
							throw markAuthSeamEscape(error);
						}
						await response.text?.().catch(() => {});
						return this._send(message, true);
					}
					await response.text?.().catch(() => {});
					if (isAuthRetry) throw markAuthSeamEscape(new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, "Server returned 401 after re-authentication", {
						status: 401,
						statusText: response.statusText
					}));
					throw markAuthSeamEscape(new UnauthorizedError());
				}
				const text = await response.text?.().catch(() => null);
				throw new Error(`Error POSTing to endpoint (HTTP ${response.status}): ${this._unfollowedRedirect(this._endpoint, response) ?? text}`);
			}
			await response.text?.().catch(() => {});
		} catch (error) {
			this.onerror?.(error);
			throw error;
		}
	}
	setProtocolVersion(version) {
		this._protocolVersion = version;
	}
};

//#endregion
//#region src/client/streamableHttp.ts
/** Default cap on step-up re-authorization retries within a single send/stream-open. */
const DEFAULT_MAX_STEP_UP_RETRIES = 1;
const DEFAULT_STREAMABLE_HTTP_RECONNECTION_OPTIONS = {
	initialReconnectionDelay: 1e3,
	maxReconnectionDelay: 3e4,
	reconnectionDelayGrowFactor: 1.5,
	maxRetries: 2
};
/**
* Standard/auth header names the transport owns. The per-request
* `TransportSendOptions.headers` carrier MUST NOT be able to override these —
* they are derived from connection state (`authorization`, `mcp-session-id`)
* or from the message body itself (`mcp-protocol-version`, `mcp-method`,
* `mcp-name`), and a per-request override would let a caller produce a
* header/body disagreement the server's SEP-2243 cross-checks reject.
*/
const RESERVED_REQUEST_HEADER_NAMES = new Set([
	"authorization",
	"dpop",
	"content-type",
	"mcp-protocol-version",
	"mcp-method",
	"mcp-name",
	"mcp-session-id"
]);
/**
* `AbortSignal.any` with a manual fallback. `AbortSignal.any` landed in
* Node 20.3; this package's `engines` floor is `>=20`, so 20.0–20.2 must be
* served by the fallback combinator (a controller that aborts on the first
* of `a` or `b`). The native path is preferred because it propagates the
* originating signal's `reason` and participates in GC the way the spec
* defines.
*/
function anySignal(a, b) {
	if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
	const controller = new AbortController();
	if (a.aborted) return controller.abort(a.reason), controller.signal;
	if (b.aborted) return controller.abort(b.reason), controller.signal;
	const cleanup = () => {
		a.removeEventListener("abort", onA);
		b.removeEventListener("abort", onB);
	};
	function onA() {
		cleanup();
		controller.abort(a.reason);
	}
	function onB() {
		cleanup();
		controller.abort(b.reason);
	}
	a.addEventListener("abort", onA, { once: true });
	b.addEventListener("abort", onB, { once: true });
	return controller.signal;
}
/**
* Client transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
* It will connect to a server using HTTP `POST` for sending messages and HTTP `GET` with Server-Sent Events
* for receiving messages.
*/
var StreamableHTTPClientTransport = class {
	_abortController;
	_url;
	_resourceMetadataUrl;
	_scope;
	_requestInit;
	_authProvider;
	_oauthProvider;
	_skipIssuerMetadataValidation;
	_fetch;
	_fetchWithInit;
	_redirectPolicy;
	_sessionId;
	_reconnectionOptions;
	_protocolVersion;
	_onInsufficientScope;
	_maxStepUpRetries;
	_serverRetryMs;
	_reconnectionScheduler;
	_cancelReconnection;
	onclose;
	onerror;
	onmessage;
	/**
	* Streamable HTTP opens one POST (and SSE response stream) per outbound
	* request and honors `TransportSendOptions.requestSignal`. On a 2026-era
	* connection the protocol layer aborts that per-request stream as the
	* spec cancellation signal instead of POSTing `notifications/cancelled`.
	*/
	hasPerRequestStream = true;
	constructor(url, opts) {
		this._url = url;
		this._resourceMetadataUrl = void 0;
		this._scope = void 0;
		this._requestInit = opts?.requestInit;
		this._skipIssuerMetadataValidation = opts?.skipIssuerMetadataValidation;
		this._fetch = opts?.fetch;
		if (isOAuthClientProvider(opts?.authProvider)) {
			this._oauthProvider = opts.authProvider;
			this._authProvider = adaptOAuthProvider(opts.authProvider, { skipIssuerMetadataValidation: opts.skipIssuerMetadataValidation });
			if (opts.authProvider.dpop) this._fetch = withDpopFromProvider(opts.authProvider)(opts.fetch ?? fetch);
		} else this._authProvider = opts?.authProvider;
		this._redirectPolicy = opts?.redirectPolicy;
		this._fetchWithInit = createFetchWithInit(opts?.fetch, opts?.requestInit);
		if (this._redirectPolicy === "follow") this._fetchWithInit = fetchLeavingRedirects(this._fetchWithInit);
		this._sessionId = opts?.sessionId;
		this._protocolVersion = opts?.protocolVersion;
		this._reconnectionOptions = opts?.reconnectionOptions ?? DEFAULT_STREAMABLE_HTTP_RECONNECTION_OPTIONS;
		this._reconnectionScheduler = opts?.reconnectionScheduler;
		this._onInsufficientScope = opts?.onInsufficientScope ?? "reauthorize";
		this._maxStepUpRetries = Math.max(0, opts?.maxStepUpRetries ?? DEFAULT_MAX_STEP_UP_RETRIES);
	}
	/**
	* SEP-2350 step-up: compute the union scope, decide whether refresh must be
	* bypassed, and run {@linkcode auth}. Returns the auth result so the caller
	* can decide whether to retry. Shared by the POST `_send` path and the GET
	* `_startOrAuthSse` path so both apply the same `'throw'` short-circuit,
	* the same superset-gated refresh bypass, and the same retry cap.
	*/
	async _stepUpAuthorize(challenge, stepUpRetries) {
		try {
			return await this._stepUpAuthorizeInner(challenge, stepUpRetries);
		} catch (error) {
			throw markAuthSeamEscape(error);
		}
	}
	async _stepUpAuthorizeInner(challenge, stepUpRetries) {
		if (this._onInsufficientScope === "throw") throw new InsufficientScopeError({
			requiredScope: challenge.scope,
			resourceMetadataUrl: challenge.resourceMetadataUrl,
			errorDescription: challenge.errorDescription
		});
		if (!this._oauthProvider) throw new InsufficientScopeError({
			requiredScope: challenge.scope,
			resourceMetadataUrl: challenge.resourceMetadataUrl,
			errorDescription: challenge.errorDescription
		});
		if (stepUpRetries >= this._maxStepUpRetries) throw new SdkHttpError(SdkErrorCode.ClientHttpForbidden, `Server returned 403 insufficient_scope after step-up re-authorization (retry limit ${this._maxStepUpRetries} reached)`, {
			status: 403,
			statusText: challenge.statusText ?? "Forbidden",
			text: challenge.text
		});
		if (challenge.resourceMetadataUrl) this._resourceMetadataUrl = challenge.resourceMetadataUrl;
		const tokens = await this._oauthProvider.tokens();
		const unionScope = computeScopeUnion(this._scope, tokens?.scope, challenge.scope);
		this._scope = unionScope;
		const forceReauthorization = isStrictScopeSuperset(unionScope, tokens?.scope);
		return auth(this._oauthProvider, {
			serverUrl: this._url,
			resourceMetadataUrl: this._resourceMetadataUrl,
			scope: unionScope,
			forceReauthorization,
			fetchFn: this._fetchWithInit,
			skipIssuerMetadataValidation: this._skipIssuerMetadataValidation
		});
	}
	/** `baseFetch` with redirects handled as `redirectPolicy` says. */
	_redirects(baseFetch) {
		return this._redirectPolicy === "follow" ? baseFetch : fetchWithinOrigin(baseFetch);
	}
	/** Error text for a redirect `response` that was not followed, or `undefined` for any other response. */
	_unfollowedRedirect(url, response) {
		const text = this._redirectPolicy === "follow" ? void 0 : unfollowedRedirect(url, response);
		return text && `${text} (redirectPolicy: 'same-origin')`;
	}
	async _commonHeaders() {
		const headers = new Headers(this._requestInit?.headers || void 0);
		let token;
		try {
			token = await this._authProvider?.token();
		} catch (error) {
			throw markAuthSeamEscape(error);
		}
		if (token) headers.set("Authorization", `Bearer ${token}`);
		if (this._sessionId) headers.set("mcp-session-id", this._sessionId);
		if (this._protocolVersion) headers.set("mcp-protocol-version", this._protocolVersion);
		return headers;
	}
	/**
	* Body-derived per-request headers: when an outgoing request carries a
	* protocol-version claim in its `_meta` envelope (the version negotiation
	* probe is the first such sender), `MCP-Protocol-Version` and `Mcp-Method`
	* derive from the message itself. The connection-level version slot is
	* neither consulted nor mutated; messages without an envelope claim are
	* untouched, so no 2026 header can appear on a legacy exchange.
	*/
	_applyBodyDerivedHeaders(headers, message) {
		if (Array.isArray(message) || !isJSONRPCRequest(message)) return;
		const envelopeVersion = (message.params?._meta)?.[PROTOCOL_VERSION_META_KEY];
		if (typeof envelopeVersion !== "string") return;
		headers.set("mcp-protocol-version", envelopeVersion);
		headers.set("mcp-method", message.method);
		const source = mcpNameSource(message.method, message.params);
		if (source?.value !== void 0) headers.set("mcp-name", encodeMcpParamValue(source.value));
	}
	/**
	* `true` when the outbound message is a single request carrying a
	* modern-era protocol-version envelope claim — the same predicate that
	* gates body-derived `mcp-method`/`mcp-name` emission. Used to confine the
	* 400-body-as-ProtocolError delivery to modern-era exchanges only.
	*/
	_isModernEnvelopedRequest(message) {
		if (Array.isArray(message) || !isJSONRPCRequest(message)) return false;
		const v = (message.params?._meta)?.[PROTOCOL_VERSION_META_KEY];
		return typeof v === "string" && isModernProtocolVersion(v);
	}
	async _startOrAuthSse(options, isAuthRetry = false, stepUpRetries = 0) {
		const { resumptionToken, requestSignal } = options;
		const isIntentionalAbort = () => this._abortController?.signal.aborted === true || requestSignal?.aborted === true;
		try {
			const headers = await this._commonHeaders();
			const types = [...headers.get("accept")?.split(",").map((s) => s.trim().toLowerCase()) ?? [], "text/event-stream"];
			headers.set("accept", [...new Set(types)].join(", "));
			if (resumptionToken) headers.set("last-event-id", resumptionToken);
			const transportSignal = this._abortController?.signal;
			const signal = requestSignal !== void 0 && transportSignal !== void 0 ? anySignal(transportSignal, requestSignal) : requestSignal ?? transportSignal;
			const response = await this._redirects(this._fetch ?? fetch)(this._url, {
				...this._requestInit,
				method: "GET",
				headers,
				signal
			});
			if (!response.ok) {
				if (response.status === 401 && this._authProvider) {
					if (response.headers.has("www-authenticate")) {
						const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
						this._resourceMetadataUrl = resourceMetadataUrl;
						this._scope = computeScopeUnion(this._scope, scope);
					}
					if (this._authProvider.onUnauthorized && !isAuthRetry) {
						try {
							await this._authProvider.onUnauthorized({
								response,
								serverUrl: this._url,
								fetchFn: this._fetchWithInit
							});
						} catch (error) {
							throw markAuthSeamEscape(error);
						}
						await response.text?.().catch(() => {});
						return this._startOrAuthSse(options, true, stepUpRetries);
					}
					await response.text?.().catch(() => {});
					if (isAuthRetry) throw markAuthSeamEscape(new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, "Server returned 401 after re-authentication", {
						status: 401,
						statusText: response.statusText
					}));
					throw markAuthSeamEscape(new UnauthorizedError());
				}
				if (response.status === 403) {
					const { resourceMetadataUrl, scope, error, errorDescription } = extractWWWAuthenticateParams(response);
					if (error === "insufficient_scope") {
						const text = await response.text?.().catch(() => null);
						if (await this._stepUpAuthorize({
							scope,
							resourceMetadataUrl,
							errorDescription,
							statusText: response.statusText,
							text
						}, stepUpRetries) !== "AUTHORIZED") throw markAuthSeamEscape(new UnauthorizedError());
						return this._startOrAuthSse(options, isAuthRetry, stepUpRetries + 1);
					}
				}
				await response.text?.().catch(() => {});
				if (response.status === 405) {
					options.onRequestStreamEnd?.();
					return;
				}
				const reason = this._unfollowedRedirect(this._url, response) ?? response.statusText;
				throw new SdkHttpError(SdkErrorCode.ClientHttpFailedToOpenStream, `Failed to open SSE stream: ${reason}`, {
					status: response.status,
					statusText: response.statusText
				});
			}
			this._handleSseStream(response.body, options, true);
		} catch (error) {
			if (!isIntentionalAbort()) this.onerror?.(error);
			throw error;
		}
	}
	/**
	* Calculates the next reconnection delay using a backoff algorithm
	*
	* @param attempt Current reconnection attempt count for the specific stream
	* @returns Time to wait in milliseconds before next reconnection attempt
	*/
	_getNextReconnectionDelay(attempt) {
		if (this._serverRetryMs !== void 0) return this._serverRetryMs;
		const initialDelay = this._reconnectionOptions.initialReconnectionDelay;
		const growFactor = this._reconnectionOptions.reconnectionDelayGrowFactor;
		const maxDelay = this._reconnectionOptions.maxReconnectionDelay;
		return Math.min(initialDelay * Math.pow(growFactor, attempt), maxDelay);
	}
	/**
	* Schedule a reconnection attempt using server-provided retry interval or backoff
	*
	* @param lastEventId The ID of the last received event for resumability
	* @param attemptCount Current reconnection attempt count for this specific stream
	*/
	_scheduleReconnection(options, attemptCount = 0) {
		const maxRetries = this._reconnectionOptions.maxRetries;
		if (attemptCount >= maxRetries) {
			this.onerror?.(/* @__PURE__ */ new Error(`Maximum reconnection attempts (${maxRetries}) exceeded.`));
			options.onRequestStreamEnd?.();
			return;
		}
		const delay = this._getNextReconnectionDelay(attemptCount);
		const reconnect = () => {
			this._cancelReconnection = void 0;
			if (this._abortController?.signal.aborted || options.requestSignal?.aborted) return;
			this._startOrAuthSse(options).catch((error) => {
				if (this._abortController?.signal.aborted || options.requestSignal?.aborted) return;
				this.onerror?.(/* @__PURE__ */ new Error(`Failed to reconnect SSE stream: ${error instanceof Error ? error.message : String(error)}`));
				try {
					this._scheduleReconnection(options, attemptCount + 1);
				} catch (scheduleError) {
					this.onerror?.(scheduleError instanceof Error ? scheduleError : new Error(String(scheduleError)));
				}
			});
		};
		if (this._reconnectionScheduler) {
			const cancel = this._reconnectionScheduler(reconnect, delay, attemptCount);
			this._cancelReconnection = typeof cancel === "function" ? cancel : void 0;
		} else {
			const handle = setTimeout(reconnect, delay);
			this._cancelReconnection = () => clearTimeout(handle);
		}
	}
	_handleSseStream(stream, options, isReconnectable) {
		if (!stream) {
			options.onRequestStreamEnd?.();
			return;
		}
		const { onresumptiontoken, replayMessageId, requestSignal, onRequestStreamEnd } = options;
		const isIntentionalAbort = () => this._abortController?.signal.aborted === true || requestSignal?.aborted === true;
		let lastEventId;
		let hasPrimingEvent = false;
		let receivedResponse = false;
		const processStream = async () => {
			try {
				const reader = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ onRetry: (retryMs) => {
					this._serverRetryMs = retryMs;
				} })).getReader();
				while (true) {
					const { value: event, done } = await reader.read();
					if (done) break;
					if (event.id) {
						lastEventId = event.id;
						hasPrimingEvent = true;
						onresumptiontoken?.(event.id);
					}
					if (!event.data) continue;
					if (!event.event || event.event === "message") try {
						const message = JSONRPCMessageSchema.parse(JSON.parse(event.data));
						if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) {
							receivedResponse = true;
							if (replayMessageId !== void 0) message.id = replayMessageId;
						}
						this.onmessage?.(message);
					} catch (error) {
						this.onerror?.(error);
					}
				}
				if ((isReconnectable || hasPrimingEvent) && !receivedResponse && this._abortController && !isIntentionalAbort()) this._scheduleReconnection({
					resumptionToken: lastEventId,
					onresumptiontoken,
					replayMessageId,
					requestSignal,
					onRequestStreamEnd
				}, 0);
				else if (!isIntentionalAbort()) onRequestStreamEnd?.();
			} catch (error) {
				if (isIntentionalAbort()) return;
				this.onerror?.(/* @__PURE__ */ new Error(`SSE stream disconnected: ${error}`));
				if ((isReconnectable || hasPrimingEvent) && !receivedResponse && this._abortController && !isIntentionalAbort()) try {
					this._scheduleReconnection({
						resumptionToken: lastEventId,
						onresumptiontoken,
						replayMessageId,
						requestSignal,
						onRequestStreamEnd
					}, 0);
				} catch (error$1) {
					this.onerror?.(/* @__PURE__ */ new Error(`Failed to reconnect: ${error$1 instanceof Error ? error$1.message : String(error$1)}`));
					onRequestStreamEnd?.();
				}
				else onRequestStreamEnd?.();
			}
		};
		processStream();
	}
	async start() {
		if (this._abortController) throw new Error("StreamableHTTPClientTransport already started! If using Client class, note that connect() calls start() automatically.");
		this._abortController = new AbortController();
	}
	async finishAuth(codeOrParams, iss) {
		if (!this._oauthProvider) throw new UnauthorizedError("finishAuth requires an OAuthClientProvider");
		const { authorizationCode, iss: issParam } = await resolveAuthorizationCallbackParams(codeOrParams, iss, this._oauthProvider, this._url, {
			fetchFn: this._fetchWithInit,
			resourceMetadataUrl: this._resourceMetadataUrl
		});
		if (await auth(this._oauthProvider, {
			serverUrl: this._url,
			authorizationCode,
			iss: issParam,
			resourceMetadataUrl: this._resourceMetadataUrl,
			scope: this._scope,
			fetchFn: this._fetchWithInit,
			skipIssuerMetadataValidation: this._skipIssuerMetadataValidation
		}) !== "AUTHORIZED") throw new UnauthorizedError("Failed to authorize");
	}
	async close() {
		try {
			this._cancelReconnection?.();
		} finally {
			this._cancelReconnection = void 0;
			this._abortController?.abort();
			this.onclose?.();
		}
	}
	async send(message, options) {
		return this._send(message, options, false);
	}
	async _send(message, options, isAuthRetry, stepUpRetries = 0) {
		try {
			const { resumptionToken, onresumptiontoken } = options || {};
			if (resumptionToken) {
				this._startOrAuthSse({
					resumptionToken,
					replayMessageId: isJSONRPCRequest(message) ? message.id : void 0,
					requestSignal: options?.requestSignal
				}).catch((error) => this.onerror?.(error));
				return;
			}
			const headers = await this._commonHeaders();
			this._applyBodyDerivedHeaders(headers, message);
			const isHandshake = Array.isArray(message) ? message.some((m) => isInitializeRequest(m)) : isInitializeRequest(message);
			if (isHandshake) headers.delete("mcp-session-id");
			if (options?.headers !== void 0) for (const [name, value] of Object.entries(options.headers)) {
				if (RESERVED_REQUEST_HEADER_NAMES.has(name.toLowerCase())) continue;
				headers.set(name, value);
			}
			headers.set("content-type", "application/json");
			const types = [
				...headers.get("accept")?.split(",").map((s) => s.trim().toLowerCase()) ?? [],
				"application/json",
				"text/event-stream"
			];
			headers.set("accept", [...new Set(types)].join(", "));
			const transportSignal = this._abortController?.signal;
			const signal = options?.requestSignal !== void 0 && transportSignal !== void 0 ? anySignal(transportSignal, options.requestSignal) : options?.requestSignal ?? transportSignal;
			const init = {
				...this._requestInit,
				method: "POST",
				headers,
				body: JSON.stringify(message),
				signal
			};
			const response = await this._redirects(this._fetch ?? fetch)(this._url, init);
			if (isHandshake && response.ok) this._sessionId = response.headers.get("mcp-session-id") || void 0;
			if (!response.ok) {
				if (response.status === 401 && this._authProvider) {
					if (response.headers.has("www-authenticate")) {
						const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
						this._resourceMetadataUrl = resourceMetadataUrl;
						this._scope = computeScopeUnion(this._scope, scope);
					}
					if (this._authProvider.onUnauthorized && !isAuthRetry) {
						try {
							await this._authProvider.onUnauthorized({
								response,
								serverUrl: this._url,
								fetchFn: this._fetchWithInit
							});
						} catch (error) {
							throw markAuthSeamEscape(error);
						}
						await response.text?.().catch(() => {});
						return this._send(message, options, true, stepUpRetries);
					}
					await response.text?.().catch(() => {});
					if (isAuthRetry) throw markAuthSeamEscape(new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, "Server returned 401 after re-authentication", {
						status: 401,
						statusText: response.statusText
					}));
					throw markAuthSeamEscape(new UnauthorizedError());
				}
				const text = await response.text?.().catch(() => null);
				if (response.status === 403) {
					const { resourceMetadataUrl, scope, error, errorDescription } = extractWWWAuthenticateParams(response);
					if (error === "insufficient_scope") {
						if (await this._stepUpAuthorize({
							scope,
							resourceMetadataUrl,
							errorDescription,
							statusText: response.statusText,
							text
						}, stepUpRetries) !== "AUTHORIZED") throw markAuthSeamEscape(new UnauthorizedError());
						return this._send(message, options, isAuthRetry, stepUpRetries + 1);
					}
				}
				if (response.status === 400 && typeof text === "string" && this._isModernEnvelopedRequest(message)) try {
					const parsed = JSONRPCMessageSchema.parse(JSON.parse(text));
					const requests = (Array.isArray(message) ? message : [message]).filter((m) => isJSONRPCRequest(m));
					if (isJSONRPCErrorResponse(parsed) && requests.some((r) => r.id === parsed.id)) {
						this.onmessage?.(parsed);
						return;
					}
				} catch {}
				const reason = this._unfollowedRedirect(this._url, response) ?? text;
				throw new SdkHttpError(SdkErrorCode.ClientHttpNotImplemented, `Error POSTing to endpoint: ${reason}`, {
					status: response.status,
					statusText: response.statusText,
					text
				});
			}
			if (response.status === 202) {
				await response.text?.().catch(() => {});
				if (isInitializedNotification(message)) this._startOrAuthSse({ resumptionToken: void 0 }).catch((error) => this.onerror?.(error));
				return;
			}
			const hasRequests = (Array.isArray(message) ? message : [message]).some((msg) => "method" in msg && "id" in msg && msg.id !== void 0);
			const contentType = response.headers.get("content-type");
			const responseMediaType = mediaTypeEssence(contentType);
			if (hasRequests) if (responseMediaType === "text/event-stream") this._handleSseStream(response.body, {
				onresumptiontoken,
				requestSignal: options?.requestSignal,
				onRequestStreamEnd: options?.onRequestStreamEnd
			}, false);
			else if (responseMediaType === "application/json") {
				const data = await response.json();
				const responseMessages = Array.isArray(data) ? data.map((msg) => JSONRPCMessageSchema.parse(msg)) : [JSONRPCMessageSchema.parse(data)];
				for (const msg of responseMessages) this.onmessage?.(msg);
			} else {
				await response.text?.().catch(() => {});
				throw new SdkError(SdkErrorCode.ClientHttpUnexpectedContent, `Unexpected content type: ${contentType}`, { contentType });
			}
			else await response.text?.().catch(() => {});
		} catch (error) {
			if (options?.requestSignal?.aborted !== true) this.onerror?.(error);
			throw error;
		}
	}
	get sessionId() {
		return this._sessionId;
	}
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
	async terminateSession() {
		if (!this._sessionId) return;
		try {
			const headers = await this._commonHeaders();
			const init = {
				...this._requestInit,
				method: "DELETE",
				headers,
				signal: this._abortController?.signal
			};
			const response = await this._redirects(this._fetch ?? fetch)(this._url, init);
			await response.text?.().catch(() => {});
			if (!response.ok && response.status !== 405) throw new SdkHttpError(SdkErrorCode.ClientHttpFailedToTerminateSession, `Failed to terminate session: ${this._unfollowedRedirect(this._url, response) ?? response.statusText}`, {
				status: response.status,
				statusText: response.statusText
			});
			this._sessionId = void 0;
		} catch (error) {
			this.onerror?.(error);
			throw error;
		}
	}
	setProtocolVersion(version) {
		this._protocolVersion = version;
	}
	get protocolVersion() {
		return this._protocolVersion;
	}
	/**
	* Resume an SSE stream from a previous event ID.
	* Opens a `GET` SSE connection with `Last-Event-ID` header to replay missed events.
	*
	* @param lastEventId The event ID to resume from
	* @param options Optional callback to receive new resumption tokens
	*/
	async resumeStream(lastEventId, options) {
		await this._startOrAuthSse({
			resumptionToken: lastEventId,
			onresumptiontoken: options?.onresumptiontoken
		});
	}
};

//#endregion
//#region src/fromJsonSchema.ts
let _defaultValidator;
function fromJsonSchema(schema, validator) {
	return fromJsonSchema$1(schema, validator ?? (_defaultValidator ??= new DefaultJsonSchemaValidator()));
}

//#endregion
export { AuthorizationServerMismatchError, BAGGAGE_META_KEY, CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, Client, ClientCredentialsProvider, CrossAppAccessProvider, DEFAULT_NEGOTIATED_PROTOCOL_VERSION, DEFAULT_REQUEST_TIMEOUT_MSEC, DPOP_SUPPORTED_ALGS, DpopSession, INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, InMemoryResponseCacheStore, InMemoryTransport, InsecureTokenEndpointError, InsufficientScopeError, IssuerMismatchError, JSONRPC_VERSION, LATEST_PROTOCOL_VERSION, LOG_LEVEL_META_KEY, MAX_CACHE_TTL_MS, METHOD_NOT_FOUND, MissingRequiredClientCapabilityError, OAuthClientFlowError, OAuthError, OAuthErrorCode, PARSE_ERROR, PROTOCOL_VERSION_META_KEY, PrivateKeyJwtProvider, Protocol, ProtocolError, ProtocolErrorCode, RELATED_TASK_META_KEY, ReadBuffer, RegistrationRejectedError, ResourceNotFoundError, SERVER_INFO_META_KEY, SSEClientTransport, STDIO_DEFAULT_MAX_BUFFER_SIZE, SUBSCRIPTION_ID_META_KEY, SUPPORTED_PROTOCOL_VERSIONS, SdkError, SdkErrorCode, SdkHttpError, SseError, StaticPrivateKeyJwtProvider, StreamableHTTPClientTransport, TRACEPARENT_META_KEY, TRACESTATE_META_KEY, UnauthorizedError, UnsupportedProtocolVersionError, UriTemplate, UrlElicitationRequiredError, accessTokenHash, applyMiddlewares, assertCompleteRequestPrompt, assertCompleteRequestResourceTemplate, assertSecureTokenEndpoint, auth, buildDiscoveryUrls, checkResourceAllowed, computeScopeUnion, createFetchWithInit, createMiddleware, createPrivateKeyJwtAuth, deserializeMessage, discoverAndRequestJwtAuthGrant, discoverAuthorizationServerMetadata, discoverOAuthMetadata, discoverOAuthProtectedResourceMetadata, discoverOAuthServerInfo, exchangeAuthorization, exchangeJwtAuthGrant, extractResourceMetadataUrl, extractWWWAuthenticateParams, fetchToken, fromJsonSchema, generateDpopKeyPair, getDisplayName, getSupportedElicitationModes, isCallToolResult, isDpopNonceChallenge, isHttpsUrl, isInitializeRequest, isInitializedNotification, isInputRequiredResult, isJSONRPCErrorResponse, isJSONRPCNotification, isJSONRPCRequest, isJSONRPCResponse, isJSONRPCResultResponse, isJsonContentType, isSpecType, isStrictScopeSuperset, isTaskAugmentedRequestParams, mergeCapabilities, parseErrorResponse, parseJSONRPCMessage, preloadSchemas, prepareAuthorizationCodeRequest, refreshAuthorization, registerClient, requestJwtAuthorizationGrant, resolveClientMetadata, resourceUrlFromServerUrl, selectClientAuthMethod, selectResourceURL, serializeMessage, specTypeSchemas, startAuthorization, validateAuthorizationResponseIssuer, validateClientMetadataUrl, withDpop, withDpopFromProvider, withInputRequired, withLogging, withOAuth };
//# sourceMappingURL=index.mjs.map