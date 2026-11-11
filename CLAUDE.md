# CLAUDE.md

Development guidance and operational instructions for Claude Code and Cursor agents working on `matrix-bridge`.

## Quick Reference Commands

- **Build UI & Sync Monorepo**: `npm run sync`
- **Run All Tests**: `npm test`
- **Run Core Tests**: `npm run test:core`
- **Run Adapters Tests**: `npm run test:adapters`
- **Run Codex Tests**: `npm run test:codex`
- **Install to Agents**: `./install.sh`

## Codebase Structure

- `packages/matrix-core`: Core protocol engine (Matrix sync, E2EE, DM recognition, security gates, REST API). Zero runtime dependencies.
- `packages/matrix-console-ui`: Unified Web Console UI. Single source of truth. Always edit here (`src/`), then run `npm run sync`.
- `adapters`: Thin runtime adapters for `antigravity`, `codex`, `zcode`.
- `antigravity/`, `codex/`, `ZCODE/`: Thin wrapper plugin distributions for each host environment.
- `install.sh`: Multi-agent auto-detection and installation script.

## Key Rules

1. **Never edit host UI directly**: Edit `packages/matrix-console-ui/src/` and run `npm run sync`.
2. **Pure ESM**: Use `import`/`export` and standard `node:*` modules.
3. **Zero Deps in Core**: `@matrix-bridge/core` must not have external npm dependencies.
4. **Security**: Never commit or log Matrix access tokens or private API keys.
5. See `AGENTS.md` for full architectural guidelines.
