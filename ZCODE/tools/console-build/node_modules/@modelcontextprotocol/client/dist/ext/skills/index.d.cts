import { na as SdkError, x as RequestOptions } from "../../index-eUeYt8-s.cjs";
import { r as Client, t as CacheableRequestOptions } from "../../client-yR_t4i05.cjs";
import { DIRECTORY_MIME_TYPE, DirectoryResource, DirectoryResource as DirectoryResource$1, GetSkillResult, ListSkillsResult, RESOURCES_DIRECTORY_READ_METHOD, ReadResourceDirectoryResult, SKILLS_EXTENSION_ID, SKILLS_GET_METHOD, SKILLS_LIST_METHOD, SKILL_LIMITS, Skill, Skill as Skill$1, SkillCacheScope, SkillCacheScope as SkillCacheScope$1, SkillFrontmatter, SkillResourceEntry, SkillResources, SkillsCapability } from "@modelcontextprotocol/core/ext/skills";

//#region src/ext/skills/entries.d.ts
/** A `skills/list` entry the client refused, and why. `index` counts across every page walked. */
interface InvalidSkillEntry {
  index: number;
  uri?: string;
  reason: string;
}
//#endregion
//#region src/ext/skills/errors.d.ts
/** Why a skill file failed verification. */
type SkillVerificationReason = 'unlisted' | 'size' | 'digest' | 'frontmatter';
/**
 * A skill file failed verification against its skill entry: not listed,
 * wrong size, wrong digest, or (for `SKILL.md`) frontmatter that differs from
 * the entry. Hosts must not load the file; for `SKILL.md`, not the skill.
 */
declare class SkillVerificationError extends SdkError {
  readonly reason: SkillVerificationReason;
  readonly uri: string;
  /** For `frontmatter`: one line per differing field. */
  readonly differences: readonly string[];
  constructor(reason: SkillVerificationReason, uri: string, message: string, differences?: readonly string[], options?: ErrorOptions);
}
//#endregion
//#region src/ext/skills/skillsClient.d.ts
interface SkillsClientOptions {
  /**
   * Parses the YAML between a `SKILL.md`'s `---` lines (BOM and CRLF removed) for verification, instead of the
   * built-in parser (YAML 1.2 core-schema typing).
   */
  parseFrontmatter?: (yaml: string) => Record<string, unknown>;
  /** Return invalid `skills/list` entries in `invalid` instead of throwing. Default `false`: `list()` throws on any. */
  skipInvalid?: boolean;
}
/** What `list()` returns: the valid entries, the refused ones (only with `skipInvalid`), and the first page's caching fields. */
interface SkillListing {
  skills: Skill$1[];
  invalid: InvalidSkillEntry[];
  /** Only when `list()` was given a cursor (one page); a full walk has none. */
  nextCursor?: string;
  ttlMs?: number;
  cacheScope?: SkillCacheScope$1;
}
/** A skill file as read and checked by {@linkcode SkillsClient.read}. */
interface SkillFile {
  /** The URI requested: the entry's spelling of the file; for `"dynamic"` skills, the resolved ref in its normalised form. */
  uri: string;
  mimeType?: string;
  /** Exactly the bytes the entry's digest covers. */
  bytes: Uint8Array;
  /** When the server sent text (always, for the skill's own `SKILL.md`). */
  text?: string;
  /** Size and digest were checked. `false` only for `"dynamic"` skills. */
  verified: boolean;
  /** The skill's own `SKILL.md` only: its parsed frontmatter, equal to the entry's. */
  frontmatter?: Record<string, unknown>;
  /** The skill's own `SKILL.md` only: the markdown after the frontmatter. */
  body?: string;
}
/**
 * Host side of the MCP Skills extension (SEP-2640): lists, gets and reads a
 * server's skills, and verifies every file against the server's entry.
 * Approval, origin tagging and loading policy stay with the host.
 *
 * @example
 * ```ts
 * const skills = new SkillsClient(client);
 * const { skills: entries } = await skills.list();
 * const manifest = await skills.read(entries[0]!);
 * ```
 */
declare class SkillsClient {
  #private;
  constructor(client: Client, options?: SkillsClientOptions);
  /** The server declared the extension (and `resources`, under `enforceStrictCapabilities`). `false` before connect. */
  get supported(): boolean;
  /** The server serves `resources/directory/read`. */
  get directoryRead(): boolean;
  /**
   * Lists the server's skills, walking every page unless given a cursor
   * (bounded by the client's `listMaxPages`). Throws an `SdkError` naming
   * every invalid entry, and every copy of a repeated URI; with
   * `skipInvalid`, returns them in `invalid` instead. A 2026-07-28 page
   * without `ttlMs` and `cacheScope` throws either way. On a server without
   * the extension: an empty listing.
   */
  list(params?: {
    cursor?: string;
  }, options?: RequestOptions): Promise<SkillListing>;
  /**
   * One skill by its `SKILL.md` URI, listed or not, with the result's caching
   * fields on 2026-07-28. Throws if the server returns an invalid entry or
   * another skill.
   */
  get(uri: string, options?: RequestOptions): Promise<{
    skill: Skill$1;
    ttlMs?: number;
    cacheScope?: SkillCacheScope$1;
  }>;
  /**
   * Reads one file of `skill` and verifies it. `ref` is a path relative to
   * the skill's root (`references/FORMS.md`) or an absolute URI; the
   * default is the skill's own `SKILL.md`; a fragment is ignored. The file
   * must be listed in the entry (checked before any request, however either
   * side percent-encodes the name) and is requested by the entry's URI; its
   * size and digest must match;
   * for the skill's own `SKILL.md` the frontmatter must also equal the
   * entry's. A copy from the client's response cache that fails a check is
   * fetched once more with `cacheMode: 'refresh'`. `"dynamic"` skills skip
   * the listing, size and digest checks (`verified: false`) but not the
   * frontmatter. Pass entries from {@linkcode SkillsClient.list} or
   * {@linkcode SkillsClient.get}; an invalid entry throws a `TypeError`
   * before any request.
   *
   * @throws {SkillVerificationError} when a check fails.
   */
  read(skill: Skill$1, ref?: string, options?: CacheableRequestOptions): Promise<SkillFile>;
  /**
   * The direct children of a skill directory, every page walked, with the
   * first page's caching fields on 2026-07-28. Needs `directoryRead`.
   */
  readDirectory(uri: string, options?: RequestOptions): Promise<{
    resources: DirectoryResource$1[];
    ttlMs?: number;
    cacheScope?: SkillCacheScope$1;
  }>;
}
//#endregion
export { DIRECTORY_MIME_TYPE, type DirectoryResource, type GetSkillResult, type InvalidSkillEntry, type ListSkillsResult, RESOURCES_DIRECTORY_READ_METHOD, type ReadResourceDirectoryResult, SKILLS_EXTENSION_ID, SKILLS_GET_METHOD, SKILLS_LIST_METHOD, SKILL_LIMITS, type Skill, type SkillCacheScope, type SkillFile, type SkillFrontmatter, type SkillListing, type SkillResourceEntry, type SkillResources, SkillVerificationError, type SkillVerificationReason, type SkillsCapability, SkillsClient, type SkillsClientOptions };
//# sourceMappingURL=index.d.cts.map