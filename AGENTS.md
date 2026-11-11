# Agent Development Guidelines (`AGENTS.md`)

Welcome! This document provides architectural rules, guidelines, and commands for AI agents and human contributors working on the **Matrix Bridge** codebase.

---

## 1. Architecture Overview

Matrix Bridge is designed as a **Core + Adapter + Single Source of Truth UI** monorepo:

```text
┌─────────────────────────────────────────────────────────────┐
│                 Single Source of Truth UI                   │
│               (packages/matrix-console-ui)                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ built & distributed to hosts
┌──────────────────────────────▼──────────────────────────────┐
│                    Universal Core Kernel                    │
│                    (packages/matrix-core)                   │
│  - Matrix Client Sync & E2EE (Pantalaimon)                  │
│  - 4-Layer Security Gate & Secret Redaction                 │
│  - Multi-level Workspace Browser & Context State Machine    │
│  - Command Parser (/workspace, /model, /effort, /new)       │
│  - Console REST API & Instance Lock                         │
└──────────────────────────────┬──────────────────────────────┘
                               │ consumes
┌──────────────────────────────▼──────────────────────────────┐
│                  Agent Runtime Adapters                     │
│                        (adapters/*)                         │
│  - AntigravityAdapter (Google Antigravity agy CLI)          │
│  - CodexAdapter (OpenAI Codex app-server stdio)             │
│  - ZCodeAdapter (ZCode zcode CLI / local daemon)            │
│  - Future: ClaudeAdapter, HermesAdapter, Custom Agents      │
└──────────────────────────────┬──────────────────────────────┘
                               │ deployed into
┌──────────────────────────────▼──────────────────────────────┐
│                    Host Plugin Wrappers                     │
│         antigravity/    ·    codex/    ·    ZCODE/          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Strict Architectural Invariants

Whenever you edit or extend this codebase, you **MUST** adhere to the following invariants:

### 1. UI Single Source of Truth
- **Never** directly edit HTML, CSS, or JS in host distribution directories (`antigravity/sidecars/matrix_console/`, `codex/.../console/`, or `ZCODE/.../console/`).
- **All UI edits** must be made in `packages/matrix-console-ui/src/`.
- Run `npm run sync` (or `npm run build:ui`) to compile and distribute UI artifacts to all target hosts.

### 2. Core Kernel Zero External Dependencies
- `packages/matrix-core` must maintain **zero external runtime npm dependencies**.
- Rely strictly on standard Node.js built-ins (`node:fs/promises`, `node:http`, `node:crypto`, `node:path`, `node:child_process`, `node:events`).
- All Matrix protocols, Pantalaimon integration, and REST endpoints belong in `packages/matrix-core`.

### 3. Thin Adapter Contract
- Every agent runtime adapter must extend `AgentRuntimeAdapter` from `@matrix-bridge/core` (or implement the interface).
- Adapters only handle CLI invocation, process lifecycle, session resume, and model catalog discovery.
- Keep adapters focused and lightweight (typically < 300 lines).

### 4. Four-Layer Security Gate
- **Layer 1: Identity & Federation**: Block untrusted federation servers if not in allowlist.
- **Layer 2: Sender Policy**: Hard check against allowed senders / admins.
- **Layer 3: Rate Limiting**: Sliding window rate limits for normal users.
- **Layer 4: Secret Redaction**: Strip tokens (`syt_`, `sk-`, `ghp_`, private keys) before messages are stored or forwarded.
- **Rule**: Tokens must NEVER be persisted in plaintext `config.json` files or passed to agent subprocesses.

---

## 3. Common Development Commands

### Building and Syncing
```bash
# Validate and build packages/matrix-console-ui
npm run build:ui

# Build UI and sync Core + Adapters to all host distribution directories
npm run sync
```

### Running Tests
```bash
# Run the entire test suite (Core + Adapters + Host integration)
npm test

# Run individual test suites
npm run test:core        # 51 unit tests for @matrix-bridge/core
npm run test:adapters    # 33 contract tests for adapters
npm run test:codex       # Host end-to-end and MCP integration tests
```

### Installing to Local Agent Hosts
```bash
# Interactive multi-agent installer
./install.sh

# Target-specific headless installs
./install.sh --antigravity
./install.sh --codex
./install.sh --zcode
./install.sh --all
```

---

## 4. How to Add a New Agent Runtime

Adding a new Agent runtime (e.g., `ClaudeAdapter` or `HermesAdapter`) is simple:

1. **Create Adapter**:
   Create `adapters/<agent-name>/index.mjs` extending `AgentRuntimeAdapter`:
   ```javascript
   import { AgentRuntimeAdapter } from '../../packages/matrix-core/src/index.mjs';

   export class MyAgentAdapter extends AgentRuntimeAdapter {
     constructor(options = {}) {
       super({ name: 'myagent', defaultCliPath: options.cliPath || 'myagent' });
     }

     async executeTurn({ prompt, cwd, model, effort, threadId, attachments }) {
       // Invoke CLI / stdio API
       return {
         replyText: 'Response from agent',
         generatedFiles: [],
         threadId: threadId || 'session-1'
       };
     }

     async listAvailableModels() {
       return { models: [{ id: 'default', name: 'Default Model' }], efforts: [] };
     }
   }
   ```

2. **Register in Factory**:
   Add the adapter mapping to `adapters/index.mjs` in `createAdapter()`.

3. **Add Tests**:
   Add unit tests in `adapters/tests/<agent-name>.test.mjs` and verify with `npm run test:adapters`.

4. **Update Sync Script**:
   Add host destination in `scripts/build-and-sync.mjs` and installer option in `install.sh`.

---

## 5. Coding Standards

- **Language**: Modern Pure ECMAScript Modules (ESM) with Node.js `>= 18`.
- **Formatting**: 2 spaces indentation, clean comments, standard semicolons.
- **Testing**: Built-in `node:test` and `node:assert/strict` without heavy third-party testing frameworks.
- **Verification**: Always ensure `npm test` passes before submitting pull requests or making commits.
