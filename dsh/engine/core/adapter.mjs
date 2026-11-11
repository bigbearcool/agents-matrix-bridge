/**
 * Agent runtime adapter contract for @matrix-bridge/core.
 *
 * The bridge only knows about this interface. Every concrete agent runtime
 * (Codex app-server, Antigravity `agy`, ZCode, ...) is expected to subclass
 * {@link AgentRuntimeAdapter} and implement `executeTurn`.
 *
 * Contract:
 *   name             string  — agent identifier, e.g. "codex"
 *   defaultCliPath   string  — default executable used by the adapter
 *   executeTurn(p)   Promise<{ replyText, generatedFiles?, error?, threadId? }>
 *   listAvailableModels() Promise<{ models: Array<{id,name,description}>, efforts: string[] }>
 *   resetSession(roomId, threadId) Promise<void>
 */

export const ADAPTER_METHODS = Object.freeze([
  'executeTurn',
  'listAvailableModels',
  'resetSession'
]);

export class AgentRuntimeAdapter {
  constructor(options = {}) {
    this.name = options.name || 'generic';
    this.defaultCliPath = options.defaultCliPath || '';
  }

  /**
   * Execute one conversational turn.
   *
   * @param {object} params
   * @param {string} params.prompt        Fully rendered prompt, including Matrix sender metadata.
   * @param {string} params.cwd           Working directory bound to the room.
   * @param {string} [params.model]       Model override selected by the room.
   * @param {string} [params.effort]      Reasoning effort selected by the room.
   * @param {string} [params.threadId]    Agent thread to resume, empty for a fresh one.
   * @param {Array}  [params.attachments] Normalized attachments ({type,path}).
   * @param {Function} [params.onApproval] `request => Promise<'accept'|'decline'>`.
   * @param {Function} [params.onInput]    `request => Promise<answers>`.
   * @param {Function} [params.onThread]   Optional hook invoked once a thread id is known.
   * @param {string} [params.roomId]      Matrix room id, for adapter-side bookkeeping.
   * @returns {Promise<{replyText: string, generatedFiles?: string[], error?: any, threadId?: string}>}
   */
  async executeTurn(params) { // eslint-disable-line no-unused-vars
    throw new Error('executeTurn must be implemented by adapter');
  }

  /**
   * Return the models and reasoning efforts supported by the runtime.
   * @returns {Promise<{models: Array<{id: string, name: string, description: string}>, efforts: string[]}>}
   */
  async listAvailableModels() {
    return { models: [], efforts: [] };
  }

  /**
   * Reset the conversational context associated with a room/thread.
   * Called for `/new` and `/reset`.
   */
  async resetSession(roomId, threadId) { // eslint-disable-line no-unused-vars
    return;
  }
}

/**
 * Validate that a value satisfies the adapter contract and return it.
 * Throws a descriptive error instead of failing later inside a turn.
 */
export function assertAgentRuntimeAdapter(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('adapter must be an object implementing AgentRuntimeAdapter');
  }
  for (const method of ADAPTER_METHODS) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`adapter.${method} must be a function`);
    }
  }
  return candidate;
}

export function isAgentRuntimeAdapter(candidate) {
  try {
    assertAgentRuntimeAdapter(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize a raw adapter reply into the canonical result shape.
 * Adapters written against older bridge internals may return `{ text }`.
 */
export function normalizeTurnResult(result) {
  if (result == null) return { replyText: '', generatedFiles: [], error: null, threadId: '' };
  if (typeof result === 'string') {
    return { replyText: result, generatedFiles: [], error: null, threadId: '' };
  }
  const rawReply = result.replyText ?? result.text ?? '';
  const generatedFiles = Array.isArray(result.generatedFiles)
    ? result.generatedFiles.filter((file) => typeof file === 'string' && file.trim()).map((file) => file.trim())
    : [];
  return {
    replyText: String(rawReply ?? ''),
    generatedFiles,
    error: result.error ?? null,
    threadId: typeof result.threadId === 'string' ? result.threadId : ''
  };
}

/**
 * Normalize the catalog returned by `listAvailableModels()`.
 * Guarantees stable arrays and plain model objects for the console/commands.
 */
export function normalizeModelCatalog(catalog) {
  const source = catalog && typeof catalog === 'object' ? catalog : {};
  const models = Array.isArray(source.models) ? source.models : [];
  const efforts = Array.isArray(source.efforts) ? source.efforts : [];
  return {
    models: models
      .map((model) => {
        if (typeof model === 'string') return { id: model, name: model, description: '' };
        if (!model || typeof model !== 'object' || !model.id) return null;
        return {
          id: String(model.id),
          name: String(model.name || model.displayName || model.id),
          description: String(model.description || '')
        };
      })
      .filter(Boolean),
    efforts: [...new Set(efforts.filter((effort) => typeof effort === 'string' && effort))]
  };
}
