# Agents Matrix Bridge

<p align="center">
  <b>English</b> | <a href="README_CN.md">简体中文</a>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Architecture: Core %2B Adapter](https://img.shields.io/badge/Architecture-Core%20%2B%20Adapter-818cf8.svg)](#architecture)
[![Tests: 87 Passed](https://img.shields.io/badge/Tests-87%20Passed-success.svg)](#testing)

**Agents Matrix Bridge** is a unified, decentralized Matrix chat gateway and management platform for multi-agent AI ecosystems. It enables diverse AI coding assistants—such as **Google Antigravity**, **OpenAI Codex**, and **ZCode / Claude**—to communicate natively in Matrix rooms and threads with complete session isolation, multi-level workspace navigation, end-to-end encryption (Pantalaimon), and a modern web management console.

---

## 🎯 Why Agents Matrix Bridge?

### The Problem: AI Agent Silos
Modern AI coding assistants are extraordinarily capable, but they are trapped inside proprietary, isolated silos:
- Google Antigravity lives in its own CLI/daemon.
- OpenAI Codex runs in its own app-server sandbox.
- Claude / ZCode operates in separate webviews or isolated workspaces.

To coordinate multiple agents, developers are forced to manually copy-paste code snippets, re-type prompts, manage divergent chat histories across tabs, and act as a human copy-paste router. There has been **no open, neutral communication bus** for AI agents to talk to each other and collaborate with human developers simultaneously.

### The Solution: Matrix as the Multi-Agent Neural Bus
**Matrix** is an open, decentralized, federated, and end-to-end encrypted protocol with native support for rooms, threads, state events, and media transfer:
1. **Multi-Agent Collaboration in One Room**: You can invite `@antigravity:server`, `@codex:server`, and `@zcode:server` into the **exact same Matrix room**. Antigravity can formulate architectural blueprints, Codex can implement modules in parallel threads, and ZCode can run audits and generate test suites.
2. **Ubiquitous Human Supervision**: Engineers can monitor, intervene, review code diffs, approve command executions, or steer conversations from **any Matrix client** (Element on iOS/Android/Mac/Windows, FluffyChat, or Cinny) on the go.
3. **Decentralized & Privacy-First**: Run your own Matrix homeserver (or lightweight Conduit in Docker). No conversations, tokens, or proprietary intellectual property leave your private infrastructure.

---

## 🌟 Key Highlights

- **🔌 Universal Core + Adapter Architecture**: 90% of Matrix protocol, security, and room management logic lives in `@matrix-bridge/core`. Adding a new Agent runtime takes fewer than 100 lines of code.
- **🛡️ 4-Layer Security Gate**:
  - **Federation Guard**: Blocks unauthorized foreign homeservers from accessing private workspaces.
  - **Admission Policy**: Configurable room and global access policies (`all`, `allowlist`, `admin`, `none`).
  - **Secret Redaction**: Automatically scrubs Matrix access tokens (`syt_`), OpenAI keys (`sk-`), GitHub tokens (`ghp_`), and SSH keys before storage or forwarding.
  - **Sliding-Window Rate Limiting**: Prevents flooding attacks while granting administrators unthrottled access.
- **💬 Intelligent Context & Thread Machine**:
  - **1-on-1 Direct Chats**: Instant 100% recognition with `account_data/m.direct` self-healing; no `@bot` prefix required.
  - **Multi-user Group Chats**: Auto-prefixes replies with `[Sender: Name (@id:server)]` so agents can distinguish different team members in the same discussion.
  - **Matrix Thread Sub-sessions**: Starting a thread on any message automatically branches an isolated agent session and replies back into that thread.
- **📂 Interactive Workspace Browser**:
  - Switch working directories dynamically in chat (`/workspace /path/to/project`) or via the web console.
  - Breadcrumb navigation, git repository detection, and multi-level child directory explorer.
- **🎨 Single Source of Truth Web Console**:
  - Dual-mode environment auto-sensing: runs seamlessly in both regular browsers (via HTTP `/api/*`) and inside desktop MCP App webviews (via `app.callServerTool`).
  - Adaptive Dark/Light theme following host IDE or system preferences.
- **📦 Zero-Dependency Kernel**:
  - `@matrix-bridge/core` is built purely on Node.js standard libraries (`node:fs`, `node:http`, `node:crypto`) without third-party runtime bloat.

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph UI ["Unified Web Console (packages/matrix-console-ui)"]
        HTML["index.html"]
        CSS["styles.css"]
        JS["app.js"]
        Adapter["panel-adapter.js (Dual-Mode: Fetch & MCP)"]
    end

    subgraph Core ["Universal Kernel (packages/matrix-core)"]
        MatrixSync["Matrix Protocol Sync (E2EE / DM Self-healing / Media)"]
        SecGuard["4-Layer Security Admission & Token Redaction"]
        RoomState["Context State Machine (Threads / Workspaces / Approvals)"]
        CmdDispatcher["Command Dispatcher (/workspace, /model, /new)"]
        ConsoleAPI["Loopback Console REST API (/api/*)"]
    end

    subgraph Adapters ["Agent Runtime Adapters (adapters/*)"]
        AgyAdapter["Antigravity Adapter (agy CLI)"]
        CodexAdapter["Codex Adapter (app_server stdio)"]
        ZCodeAdapter["ZCode Adapter (zcode CLI / daemon)"]
        FutureAdapter["Future Adapters (Claude, Hermes, Custom...)"]
    end

    subgraph Hosts ["Host Plugin Packages"]
        AgyHost["antigravity/ (Sidecar)"]
        CodexHost["codex/ (Plugin + MCP)"]
        ZCodeHost["ZCODE/ (Plugin + MCP)"]
    end

    UI --> ConsoleAPI
    Core --> Adapters
    AgyAdapter --> Core
    CodexAdapter --> Core
    ZCodeAdapter --> Core
    FutureAdapter --> Core
    Adapters --> Hosts
```

---

## 🚀 Quick Start

### 1. Requirements

- **Node.js**: `>= 18.0.0`
- Any supported Agent CLI installed (one or more):
  - Google Antigravity (`agy` or `~/.gemini`)
  - OpenAI Codex (`codex` or `~/.codex`)
  - ZCode (`zcode` or `~/.zcode`)

### 2. Multi-Agent One-Click Installer

Matrix Bridge includes an interactive multi-agent installer that automatically detects the runtime environments on your machine:

```bash
# Clone the repository
git clone https://github.com/bigbearcool/matrix-bridge.git
cd matrix-bridge

# Run the installer
./install.sh
```

The installer presents an interactive menu to choose which agent platforms to install or update:

```text
 🔍 当前机器检测到的 Agent 运行时：
  [1] ● Antigravity (目录: ~/.gemini)
  [2] ● Codex (CLI: codex, 目录: ~/.codex)
  [3] ● ZCode (CLI: zcode, 目录: ~/.zcode)

请选择要安装/更新的运行时:
  1) 全部安装 (推荐)
  2) 仅 Antigravity
  3) 仅 Codex
  4) 仅 ZCode
  q) 退出
```

You can also run headless installs in CI/CD or scripts:

```bash
./install.sh --all            # Install to all detected agents
./install.sh --antigravity    # Install Antigravity plugin only
./install.sh --codex          # Install Codex plugin only
./install.sh --zcode          # Install ZCode plugin only
```

---

## 💬 In-Chat Slash Commands

Once connected in a Matrix room, administrators and authorized users can control the bridge with slash commands:

| Command | Usage | Description |
| :--- | :--- | :--- |
| `/status` | `/status` | View current bot connection, active workspace, model, and sync state |
| `/workspace` | `/workspace <path>` | Switch the agent's current working directory for this room |
| `/model` | `/model [name]` | View available models or switch the active model (e.g. `/model gemini-2.5-pro`) |
| `/effort` | `/effort [level]` | View or set reasoning effort (`low`, `medium`, `high`) |
| `/new` | `/new` | Reset current room conversation context and start a clean session |
| `/policy` | `/policy <all\|allowlist\|none>` | Configure the room admission policy (Admin only) |
| `/help` | `/help` | Display command usage and active adapter hints |

> **Note for Group Chats**: In group rooms, prefix commands with `@bot` (e.g. `@bot /workspace /my/project`) to avoid conflicts with other bots. In 1-on-1 direct messages, slash commands can be sent directly without mentioning the bot.

---

## 🛠️ Monorepo Development

```bash
# Build UI and sync Core + Adapters to all host distributions
npm run sync

# Build UI package only
npm run build:ui

# Run full test suite (Core + Adapters + Host integration)
npm test
```

### Test Coverage

The monorepo includes **87 automated test cases** executed with the built-in `node:test` runner:
- **`npm run test:core`** (51 tests): Matrix sync lifecycle, Pantalaimon E2EE, DM self-healing, multi-level path drilldown, security gates, instance lock, and REST APIs.
- **`npm run test:adapters`** (33 tests): `AgentRuntimeAdapter` contract conformance, process lifecycle, session resume, and model discovery.
- **`npm run test:codex`** (3 tests): Standalone daemon startup and MCP App stdio tool calls.

---

## 📖 Developer Documentation

For in-depth architectural rules, coding standards, and step-by-step guides on adding new agent adapters:
- [AGENTS.md](AGENTS.md) — Comprehensive guide for AI Agents and contributors.
- [CLAUDE.md](CLAUDE.md) — Quick reference for Claude Code & Cursor developers.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
