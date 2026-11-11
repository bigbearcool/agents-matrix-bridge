#!/usr/bin/env bash
# ==============================================================================
# Agents Matrix Bridge — 傻瓜式一键配置与多端安装向导 (Bilingual Setup Wizard)
# ==============================================================================
# 流程：
# 1. 语言选择 (中文 / English)
# 2. 本机 Matrix 服务与 Docker 状态检测
# 3. 未检测到时支持一键拉起本地 Matrix 服务 (Conduit 极速轻量 / Synapse 官方完整)
# 4. 连通性测试与 Matrix 管理员账号配置
# 5. 自动配置/注册各 Agent 独立 Bot 账号
# 6. 检测本机 Agent 运行时 (Antigravity / Codex / ZCode) 并一键部署插件
# ==============================================================================

set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# 样式
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
MAGENTA="\033[0;35m"
NC="\033[0m"

# 默认变量
LANG_CHOICE=""
CLI_MODE=false
SELECTED_AGENT=""
MATRIX_URL=""
ADMIN_USER=""
ADMIN_PASS=""
DEPLOY_TYPE=""
ASSUME_YES=false

# ------------------------------------------------------------------------------
# 命令行参数解析
# ------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang)
      LANG_CHOICE="$2"; shift 2 ;;
    --all|-a)
      SELECTED_AGENT="all"; CLI_MODE=true; shift ;;
    --antigravity|-1)
      SELECTED_AGENT="antigravity"; CLI_MODE=true; shift ;;
    --codex|-2)
      SELECTED_AGENT="codex"; CLI_MODE=true; shift ;;
    --zcode|-3)
      SELECTED_AGENT="zcode"; CLI_MODE=true; shift ;;
    --matrix-url)
      MATRIX_URL="$2"; shift 2 ;;
    --admin-user)
      ADMIN_USER="$2"; shift 2 ;;
    --admin-pass)
      ADMIN_PASS="$2"; shift 2 ;;
    --deploy)
      DEPLOY_TYPE="$2"; shift 2 ;;
    -y|--yes|--non-interactive)
      ASSUME_YES=true; shift ;;
    --detect|-d)
      CLI_MODE=true; SELECTED_AGENT="detect"; shift ;;
    --help|-h)
      echo "Agents Matrix Bridge Installer"
      echo "Usage: ./install.sh [options]"
      echo "Options:"
      echo "  --lang zh|en             Set language (中文 or English)"
      echo "  --all, -a                Install plugins for all detected agents"
      echo "  --antigravity, -1        Install Antigravity plugin only"
      echo "  --codex, -2              Install Codex plugin only"
      echo "  --zcode, -3              Install ZCode plugin only"
      echo "  --matrix-url <url>       Specify Matrix homeserver URL"
      echo "  --admin-user <user>      Specify Admin user ID or username"
      echo "  --admin-pass <pass>      Specify Admin password"
      echo "  --deploy conduit|synapse Deploy local Matrix server using Docker"
      echo "  -y, --yes                Non-interactive default answers"
      echo "  --detect, -d             Detect installed agent runtimes only"
      echo "  --help, -h               Show this help"
      exit 0 ;;
    *)
      echo "Unknown option: $1 (run with --help for usage)"
      exit 1 ;;
  esac
done

# ------------------------------------------------------------------------------
# 1. 语言选择 (Step 0: Language Selection)
# ------------------------------------------------------------------------------
if [[ -z "$LANG_CHOICE" ]]; then
  if $ASSUME_YES; then
    LANG_CHOICE="zh"
  else
    echo -e "${BOLD}${CYAN}"
    echo "=========================================================================="
    echo "    Agents Matrix Bridge — Multi-Agent Collaboration Setup Wizard"
    echo "=========================================================================="
    echo -e "${NC}"
    echo -e "Please choose your language / 请选择首选语言:"
    echo -e "  [1] ${BOLD}简体中文 (Chinese)${NC} [默认]"
    echo -e "  [2] ${BOLD}English${NC}"
    read -r -p "Enter choice [1/2] (default 1): " raw_lang || true
    if [[ "$raw_lang" == "2" || "$raw_lang" =~ ^[eE] ]]; then
      LANG_CHOICE="en"
    else
      LANG_CHOICE="zh"
    fi
  fi
fi

# 国际化文案字典
t() {
  local key="$1"
  if [[ "$LANG_CHOICE" == "en" ]]; then
    case "$key" in
      welcome_sub) echo "Core + Adapter Multi-Agent Unified Installer & Wizard" ;;
      step_detect_agents) echo "Detecting local Agent runtimes..." ;;
      detected_agents) echo "Agent runtimes detected on this system:" ;;
      not_detected) echo "Not detected" ;;
      step_matrix_detect) echo "Detecting local Matrix homeserver & Docker..." ;;
      docker_found) echo "Docker is installed" ;;
      docker_not_found) echo "Docker not installed" ;;
      docker_running) echo "Docker daemon is running" ;;
      docker_stopped) echo "Docker daemon is stopped" ;;
      matrix_found_port) echo "Matrix service detected listening on:" ;;
      matrix_found_docker) echo "Matrix container detected:" ;;
      no_matrix_found) echo "No active local Matrix homeserver detected." ;;
      ask_deploy_matrix) echo "Would you like to deploy a local Matrix Homeserver now?" ;;
      opt_deploy_conduit) echo "1) One-Click Conduit (Recommended: Rust-based, starts in 2s, <50MB RAM)" ;;
      opt_deploy_synapse) echo "2) Official Matrix Synapse (Full-featured reference implementation)" ;;
      opt_skip_deploy) echo "3) Skip local deployment (Use existing or remote Matrix server)" ;;
      choice_prompt) echo "Enter choice" ;;
      deploying_conduit) echo "Deploying lightweight Matrix Conduit via Docker..." ;;
      deploying_synapse) echo "Deploying Matrix Synapse via Docker..." ;;
      docker_needed) echo "Docker is required for local Matrix deployment. Please start Docker first." ;;
      matrix_ready) echo "Matrix homeserver is online and responsive!" ;;
      input_matrix_url) echo "Enter Matrix Homeserver URL (e.g. http://127.0.0.1:6167 or https://matrix.org):" ;;
      input_admin_user) echo "Enter Matrix Administrator MXID/Username (e.g. @admin:localhost or admin):" ;;
      input_admin_pass) echo "Enter Matrix Administrator Password:" ;;
      checking_server) echo "Verifying Matrix server connection..." ;;
      server_ok) echo "Server connectivity verified successfully" ;;
      server_fail) echo "Failed to connect to Matrix server at:" ;;
      login_ok) echo "Matrix Admin login verified:" ;;
      login_fail) echo "Matrix Admin login failed:" ;;
      ask_bot_mode) echo "How would you like to configure Bot accounts for your Agents?" ;;
      opt_bot_auto) echo "1) Auto-register dedicated Bots for each agent (@antigravity_bot, @codex_bot, etc.) [Recommended]" ;;
      opt_bot_single) echo "2) Use a single Matrix account for all agents" ;;
      opt_bot_skip) echo "3) Skip credential injection (Configure later in Web Console)" ;;
      step_install_plugins) echo "Installing & updating Agent plugins..." ;;
      ask_agent_choice) echo "Select which agent plugins to install/update:" ;;
      opt_all_agents) echo "1) All detected agents (Recommended)" ;;
      building_artifacts) echo "Building unified UI and syncing Core + Adapters..." ;;
      installed_agy) echo "Antigravity plugin & sidecar successfully deployed" ;;
      installed_codex) echo "Codex plugin & engine successfully deployed" ;;
      installed_zcode) echo "ZCode plugin & background daemon successfully deployed" ;;
      summary_title) echo "Setup Completed Successfully!" ;;
      collab_tip) echo "Invite these bots to the same Matrix room (e.g. #ai-team) to enable multi-agent collaboration!" ;;
      *) echo "$key" ;;
    esac
  else
    case "$key" in
      welcome_sub) echo "Core + Adapter 多智能体统一安装配置向导" ;;
      step_detect_agents) echo "正在检测本机 Agent 运行时环境..." ;;
      detected_agents) echo "当前机器检测到的 Agent 运行时：" ;;
      not_detected) echo "未检测到运行时" ;;
      step_matrix_detect) echo "正在检测本机 Matrix 服务与 Docker 状态..." ;;
      docker_found) echo "已安装 Docker" ;;
      docker_not_found) echo "未安装 Docker" ;;
      docker_running) echo "Docker 守护进程正在运行" ;;
      docker_stopped) echo "Docker 守护进程未启动" ;;
      matrix_found_port) echo "检测到本地端口正在运行 Matrix 服务：" ;;
      matrix_found_docker) echo "检测到运行中的 Matrix 容器：" ;;
      no_matrix_found) echo "未检测到本机运行中的 Matrix 服务。" ;;
      ask_deploy_matrix) echo "是否需要在本地一键部署 Matrix 服务？" ;;
      opt_deploy_conduit) echo "1) 极速部署 Conduit (推荐: 轻量 Rust 实现，2秒启动，内存<50MB)" ;;
      opt_deploy_synapse) echo "2) 官方完整 Synapse (标准 Matrix 官方参考实现，功能完备)" ;;
      opt_skip_deploy) echo "3) 跳过本地部署 (使用已有或局域网/远程 Matrix 服务器)" ;;
      choice_prompt) echo "请输入选项" ;;
      deploying_conduit) echo "正在通过 Docker 部署极速轻量 Matrix Conduit..." ;;
      deploying_synapse) echo "正在通过 Docker 部署官方 Matrix Synapse..." ;;
      docker_needed) echo "本地部署 Matrix 需要 Docker 运行。请先启动 Docker。" ;;
      matrix_ready) echo "Matrix 服务器已成功启动并就绪！" ;;
      input_matrix_url) echo "请输入 Matrix 服务器地址 (例如 http://127.0.0.1:6167 或 https://matrix.org):" ;;
      input_admin_user) echo "请输入 Matrix 管理员账号 (例如 @admin:localhost 或 admin):" ;;
      input_admin_pass) echo "请输入 Matrix 管理员密码:" ;;
      checking_server) echo "正在校验 Matrix 服务器连通性..." ;;
      server_ok) echo "Matrix 服务器连通性测试通过！" ;;
      server_fail) echo "无法连接到 Matrix 服务器：" ;;
      login_ok) echo "Matrix 管理员登录验证成功：" ;;
      login_fail) echo "Matrix 管理员登录验证失败：" ;;
      ask_bot_mode) echo "请选择各 Agent 的 Matrix 机器人账号配置方式：" ;;
      opt_bot_auto) echo "1) 自动为各 Agent 注册专属独立 Bot (@antigravity_bot, @codex_bot, @zcode_bot) [推荐]" ;;
      opt_bot_single) echo "2) 所有 Agent 共用同一个 Matrix 机器人账号" ;;
      opt_bot_skip) echo "3) 暂不配置账号凭证 (稍后在 Web 控制台内输入)" ;;
      step_install_plugins) echo "正在安装与同步各 Agent 插件..." ;;
      ask_agent_choice) echo "请选择要安装/更新的 Agent 插件：" ;;
      opt_all_agents) echo "1) 全部安装 (推荐)" ;;
      building_artifacts) echo "正在构建统一 UI 并同步分发 Core 内核与适配器..." ;;
      installed_agy) echo "Antigravity 插件与 Sidecar 已成功部署" ;;
      installed_codex) echo "Codex 插件与引擎已成功部署" ;;
      installed_zcode) echo "ZCode 插件与后台守护进程已成功部署" ;;
      summary_title) echo "🎉 全部配置与安装已圆满完成！" ;;
      collab_tip) echo "提示：打开 Element 或任意 Matrix 客户端，将以上 Bot 拉入同一房间（如 #ai-team），即可开启多 Agent 协同协作！" ;;
      *) echo "$key" ;;
    esac
  fi
}

log_info()  { echo -e "${CYAN}ℹ️  $*${NC}"; }
log_ok()    { echo -e "${GREEN}✅ $*${NC}"; }
log_warn()  { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_err()   { echo -e "${RED}❌ $*${NC}"; }
log_step()  { echo -e "\n${BOLD}${BLUE}==> $*${NC}"; }

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
 __  __       _        _         ____       _     _             
|  \/  | __ _| |_ _ __(_)_  __  | __ ) _ __(_) __| | __ _  ___  
| |\/| |/ _` | __| '__| \ \/ /  |  _ \| '__| |/ _` |/ _` |/ _ \ 
| |  | | (_| | |_| |  | |>  <   | |_) | |  | | (_| | (_| |  __/ 
|_|  |_|\__,_|\__|_|  |_/_/\_\  |____/|_|  |_|\__,_|\__, |\___| 
                                                    |___/       
EOF
echo -e "        ${BOLD}$(t welcome_sub)${NC}\n"

# ------------------------------------------------------------------------------
# 2. Agent 运行时环境检测 (Step 1: Agent Runtime Detection)
# ------------------------------------------------------------------------------
DETECT_AGY=false
DETECT_CODEX=false
DETECT_ZCODE=false

AGY_BIN="$(command -v agy || true)"
CODEX_BIN="$(command -v codex || true)"
ZCODE_BIN="$(command -v zcode || true)"

if [[ -n "$AGY_BIN" || -d "$HOME/.gemini" || -d "$HOME/.antigravity" ]]; then
  DETECT_AGY=true
fi
if [[ -n "$CODEX_BIN" || -d "$HOME/.codex" ]]; then
  DETECT_CODEX=true
fi
if [[ -n "$ZCODE_BIN" || -d "$HOME/.zcode" ]]; then
  DETECT_ZCODE=true
fi

echo -e "${BOLD}🔍 $(t detected_agents)${NC}"
if $DETECT_AGY; then
  echo -e "  [1] ${GREEN}●${NC} ${BOLD}Antigravity${NC} (CLI: ${AGY_BIN:-内置/未在PATH}, 目录: ~/.gemini)"
else
  echo -e "  [1] ${RED}○${NC} Antigravity ($(t not_detected))"
fi
if $DETECT_CODEX; then
  echo -e "  [2] ${GREEN}●${NC} ${BOLD}Codex${NC} (CLI: ${CODEX_BIN:-未在PATH}, 目录: ~/.codex)"
else
  echo -e "  [2] ${RED}○${NC} Codex ($(t not_detected))"
fi
if $DETECT_ZCODE; then
  echo -e "  [3] ${GREEN}●${NC} ${BOLD}ZCode${NC} (CLI: ${ZCODE_BIN:-未在PATH}, 目录: ~/.zcode)"
else
  echo -e "  [3] ${RED}○${NC} ZCode ($(t not_detected))"
fi
echo ""

if [[ "$SELECTED_AGENT" == "detect" ]]; then
  exit 0
fi

# ------------------------------------------------------------------------------
# 3. 本机 Matrix 服务与 Docker 状态检测 (Step 2: Matrix & Docker Detection)
# ------------------------------------------------------------------------------
log_step "$(t step_matrix_detect)"

HAS_DOCKER=false
DOCKER_RUNNING=false
DETECTED_MATRIX_PORT=""
DETECTED_MATRIX_CONTAINER=""

if command -v docker >/dev/null 2>&1; then
  HAS_DOCKER=true
  log_info "$(t docker_found): $(command -v docker)"
  if docker info >/dev/null 2>&1; then
    DOCKER_RUNNING=true
    log_info "$(t docker_running)"
    # 检查是否有现成的 synapse 或 conduit 容器
    CONTAINER_MATCH="$(docker ps --filter "name=synapse" --filter "name=conduit" --format "{{.Names}} ({{.Ports}})" 2>/dev/null | head -n 1 || true)"
    if [[ -n "$CONTAINER_MATCH" ]]; then
      DETECTED_MATRIX_CONTAINER="$CONTAINER_MATCH"
      log_ok "$(t matrix_found_docker) $CONTAINER_MATCH"
    fi
  else
    log_warn "$(t docker_stopped)"
  fi
else
  log_warn "$(t docker_not_found)"
fi

# 检测本地标准端口是否已有活跃 Matrix 实例 (6167 / 8008 / 8448)
for p in 6167 8008 8448; do
  CHECK_RES="$(node scripts/matrix-helper.mjs check-server "http://127.0.0.1:$p" 2>/dev/null || true)"
  if [[ "$CHECK_RES" =~ "\"ok\":true" ]]; then
    DETECTED_MATRIX_PORT="$p"
    log_ok "$(t matrix_found_port) http://127.0.0.1:$p"
    MATRIX_URL="http://127.0.0.1:$p"
    break
  fi
done

# ------------------------------------------------------------------------------
# 4. 一键部署本地 Matrix 服务 (Step 3: Deploy Local Matrix if needed)
# ------------------------------------------------------------------------------
if [[ -z "$MATRIX_URL" && -z "$DEPLOY_TYPE" ]]; then
  log_warn "$(t no_matrix_found)"
  if ! $CLI_MODE && ! $ASSUME_YES; then
    echo -e "${BOLD}$(t ask_deploy_matrix)${NC}"
    echo -e "  $(t opt_deploy_conduit)"
    echo -e "  $(t opt_deploy_synapse)"
    echo -e "  $(t opt_skip_deploy)"
    read -r -p "$(t choice_prompt) [1/2/3] (default 1): " raw_deploy || true
    case "$raw_deploy" in
      2) DEPLOY_TYPE="synapse" ;;
      3) DEPLOY_TYPE="none" ;;
      *) DEPLOY_TYPE="conduit" ;;
    esac
  else
    DEPLOY_TYPE="none"
  fi
fi

# 执行本地部署
if [[ "$DEPLOY_TYPE" == "conduit" ]]; then
  if ! $DOCKER_RUNNING; then
    log_err "$(t docker_needed)"
    log_warn "跳过本地部署，将使用远程/已有 Matrix 地址。"
  else
    log_step "$(t deploying_conduit)"
    mkdir -p "$ROOT/matrix-server/conduit/data"
    cat > "$ROOT/matrix-server/conduit/docker-compose.yml" << 'EOF'
version: '3.8'
services:
  conduit:
    image: matrixconduit/conduit:latest
    container_name: matrix-conduit
    restart: unless-stopped
    environment:
      CONDUIT_SERVER_NAME: "localhost"
      CONDUIT_DATABASE_BACKEND: "rocksdb"
      CONDUIT_ALLOW_REGISTRATION: "true"
      CONDUIT_ALLOW_FEDERATION: "false"
      CONDUIT_TRUSTED_SERVERS: "[]"
      CONDUIT_MAX_REQUEST_SIZE: "20000000"
      CONDUIT_ADDRESS: "0.0.0.0"
      CONDUIT_PORT: "6167"
    ports:
      - "127.0.0.1:6167:6167"
    volumes:
      - ./data:/var/lib/matrix-conduit/data
EOF
    (cd "$ROOT/matrix-server/conduit" && docker compose up -d 2>/dev/null || docker-compose up -d)
    
    # 轮询等待就绪 (最多等待 15 秒)
    for i in {1..15}; do
      sleep 1
      CHECK_RES="$(node scripts/matrix-helper.mjs check-server "http://127.0.0.1:6167" 2>/dev/null || true)"
      if [[ "$CHECK_RES" =~ "\"ok\":true" ]]; then
        MATRIX_URL="http://127.0.0.1:6167"
        log_ok "$(t matrix_ready) (http://127.0.0.1:6167)"
        break
      fi
    done
  fi
elif [[ "$DEPLOY_TYPE" == "synapse" ]]; then
  if ! $DOCKER_RUNNING; then
    log_err "$(t docker_needed)"
  else
    log_step "$(t deploying_synapse)"
    mkdir -p "$ROOT/matrix-server/synapse/data"
    cat > "$ROOT/matrix-server/synapse/docker-compose.yml" << 'EOF'
version: '3.8'
services:
  synapse:
    image: matrixdotorg/synapse:latest
    container_name: matrix-synapse
    restart: unless-stopped
    environment:
      SYNAPSE_SERVER_NAME: "localhost"
      SYNAPSE_REPORT_STATS: "no"
      SYNAPSE_ENABLE_REGISTRATION: "yes"
    ports:
      - "127.0.0.1:8008:8008"
    volumes:
      - ./data:/data
EOF
    (cd "$ROOT/matrix-server/synapse" && docker compose up -d 2>/dev/null || docker-compose up -d)
    for i in {1..20}; do
      sleep 1
      CHECK_RES="$(node scripts/matrix-helper.mjs check-server "http://127.0.0.1:8008" 2>/dev/null || true)"
      if [[ "$CHECK_RES" =~ "\"ok\":true" ]]; then
        MATRIX_URL="http://127.0.0.1:8008"
        log_ok "$(t matrix_ready) (http://127.0.0.1:8008)"
        break
      fi
    done
  fi
fi

# ------------------------------------------------------------------------------
# 5. Matrix 地址与管理员凭据配置 (Step 4: Matrix URL & Admin Credentials)
# ------------------------------------------------------------------------------
if [[ -z "$MATRIX_URL" ]]; then
  if ! $CLI_MODE && ! $ASSUME_YES; then
    echo ""
    read -r -p "$(t input_matrix_url) " input_url || true
    MATRIX_URL="${input_url:-http://127.0.0.1:6167}"
  else
    MATRIX_URL="http://127.0.0.1:6167"
  fi
fi

log_info "$(t checking_server) $MATRIX_URL"
SERVER_STATUS="$(node scripts/matrix-helper.mjs check-server "$MATRIX_URL" 2>/dev/null || true)"
if [[ "$SERVER_STATUS" =~ "\"ok\":true" ]]; then
  log_ok "$(t server_ok)"
else
  log_warn "$(t server_fail) $MATRIX_URL (${SERVER_STATUS})"
fi

ADMIN_MXID=""
ADMIN_TOKEN=""

if [[ -z "$ADMIN_USER" && ! $ASSUME_YES && ! $CLI_MODE ]]; then
  echo ""
  read -r -p "$(t input_admin_user) " input_admin || true
  ADMIN_USER="${input_admin:-admin}"
  read -r -s -p "$(t input_admin_pass) " input_pass || true
  echo ""
  ADMIN_PASS="${input_pass:-AdminPass123!}"
fi

if [[ -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]]; then
  # 优先尝试直接登录
  LOGIN_RES="$(node scripts/matrix-helper.mjs login "$MATRIX_URL" "$ADMIN_USER" "$ADMIN_PASS" 2>/dev/null || true)"
  if [[ "$LOGIN_RES" =~ "\"ok\":true" ]]; then
    ADMIN_MXID="$(echo "$LOGIN_RES" | grep -o '"user_id":"[^"]*' | cut -d'"' -f4)"
    ADMIN_TOKEN="$(echo "$LOGIN_RES" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)"
    log_ok "$(t login_ok) $ADMIN_MXID"
  else
    # 尝试自动注册该管理员账号 (在本地 Conduit/Synapse 开机首次场景极有用)
    REG_RES="$(node scripts/matrix-helper.mjs register "$MATRIX_URL" "$ADMIN_USER" "$ADMIN_PASS" 2>/dev/null || true)"
    if [[ "$REG_RES" =~ "\"ok\":true" ]]; then
      ADMIN_MXID="$(echo "$REG_RES" | grep -o '"user_id":"[^"]*' | cut -d'"' -f4)"
      ADMIN_TOKEN="$(echo "$REG_RES" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)"
      log_ok "$(t login_ok) $ADMIN_MXID (已自动注册新管理员账号)"
    else
      log_warn "$(t login_fail) $ADMIN_USER"
      ADMIN_MXID="@${ADMIN_USER}:localhost"
    fi
  fi
else
  ADMIN_MXID="@admin:localhost"
fi

# ------------------------------------------------------------------------------
# 6. 配置各 Agent 机器人账号 (Step 5: Agent Bot Provisioning)
# ------------------------------------------------------------------------------
BOT_MODE="auto"
if ! $CLI_MODE && ! $ASSUME_YES; then
  echo -e "\n${BOLD}$(t ask_bot_mode)${NC}"
  echo -e "  $(t opt_bot_auto)"
  echo -e "  $(t opt_bot_single)"
  echo -e "  $(t opt_bot_skip)"
  read -r -p "$(t choice_prompt) [1/2/3] (default 1): " raw_bot_mode || true
  case "$raw_bot_mode" in
    2) BOT_MODE="single" ;;
    3) BOT_MODE="skip" ;;
    *) BOT_MODE="auto" ;;
  esac
fi

# 存储各 agent 的凭据映射
declare -A AGENT_USER_MAP
declare -A AGENT_TOKEN_MAP

provision_bot() {
  local agent_name="$1"
  local bot_username="$2"
  local bot_password="${3:-AgentPass123!}"

  if [[ "$BOT_MODE" == "skip" ]]; then
    AGENT_USER_MAP["$agent_name"]="@${bot_username}:localhost"
    return
  fi

  log_info "正在为 $agent_name 准备 Matrix 账号: $bot_username ..."
  local reg_res
  reg_res="$(node scripts/matrix-helper.mjs register "$MATRIX_URL" "$bot_username" "$bot_password" 2>/dev/null || true)"
  if [[ "$reg_res" =~ "\"ok\":true" ]]; then
    local uid tok
    uid="$(echo "$reg_res" | grep -o '"user_id":"[^"]*' | cut -d'"' -f4)"
    tok="$(echo "$reg_res" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)"
    AGENT_USER_MAP["$agent_name"]="$uid"
    AGENT_TOKEN_MAP["$agent_name"]="$tok"
    log_ok "$agent_name 机器人账号就绪: $uid"
  else
    local login_res
    login_res="$(node scripts/matrix-helper.mjs login "$MATRIX_URL" "$bot_username" "$bot_password" 2>/dev/null || true)"
    if [[ "$login_res" =~ "\"ok\":true" ]]; then
      local uid tok
      uid="$(echo "$login_res" | grep -o '"user_id":"[^"]*' | cut -d'"' -f4)"
      tok="$(echo "$login_res" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)"
      AGENT_USER_MAP["$agent_name"]="$uid"
      AGENT_TOKEN_MAP["$agent_name"]="$tok"
      log_ok "$agent_name 机器人账号就绪: $uid"
    else
      AGENT_USER_MAP["$agent_name"]="@${bot_username}:localhost"
      log_warn "未能自动注册/登录 $bot_username，将在配置中填入占位标识。"
    fi
  fi
}

if [[ "$BOT_MODE" == "auto" ]]; then
  provision_bot "antigravity" "antigravity_bot" "$ADMIN_PASS"
  provision_bot "codex" "codex_bot" "$ADMIN_PASS"
  provision_bot "zcode" "zcode_bot" "$ADMIN_PASS"
elif [[ "$BOT_MODE" == "single" ]]; then
  provision_bot "common" "matrix_agent_bot" "$ADMIN_PASS"
  AGENT_USER_MAP["antigravity"]="${AGENT_USER_MAP["common"]}"
  AGENT_TOKEN_MAP["antigravity"]="${AGENT_TOKEN_MAP["common"]}"
  AGENT_USER_MAP["codex"]="${AGENT_USER_MAP["common"]}"
  AGENT_TOKEN_MAP["codex"]="${AGENT_TOKEN_MAP["common"]}"
  AGENT_USER_MAP["zcode"]="${AGENT_USER_MAP["common"]}"
  AGENT_TOKEN_MAP["zcode"]="${AGENT_TOKEN_MAP["common"]}"
fi

# ------------------------------------------------------------------------------
# 7. 预构建与代码同步 (Step 6: Pre-build & Sync Monorepo)
# ------------------------------------------------------------------------------
log_step "$(t building_artifacts)"
if ! command -v node >/dev/null 2>&1; then
  log_err "未找到 node 命令，请先安装 Node.js (>= 18)"
  exit 1
fi
node scripts/build-and-sync.mjs

# ------------------------------------------------------------------------------
# 8. 选择要安装的 Agent (Step 7: Choose Agents to Install)
# ------------------------------------------------------------------------------
INSTALL_AGY=false
INSTALL_CODEX=false
INSTALL_ZCODE=false

if [[ -n "$SELECTED_AGENT" ]]; then
  case "$SELECTED_AGENT" in
    all) INSTALL_AGY=true; INSTALL_CODEX=true; INSTALL_ZCODE=true ;;
    antigravity) INSTALL_AGY=true ;;
    codex) INSTALL_CODEX=true ;;
    zcode) INSTALL_ZCODE=true ;;
  esac
elif ! $CLI_MODE && ! $ASSUME_YES; then
  echo -e "\n${BOLD}$(t ask_agent_choice)${NC}"
  echo -e "  $(t opt_all_agents)"
  echo -e "  2) 仅 Antigravity"
  echo -e "  3) 仅 Codex"
  echo -e "  4) 仅 ZCode"
  echo -e "  q) 退出"
  read -r -p "$(t choice_prompt) [1/2/3/4/q] (default 1): " raw_choice || true
  case "$raw_choice" in
    2) INSTALL_AGY=true ;;
    3) INSTALL_CODEX=true ;;
    4) INSTALL_ZCODE=true ;;
    [qQ]) exit 0 ;;
    *) INSTALL_AGY=true; INSTALL_CODEX=true; INSTALL_ZCODE=true ;;
  esac
else
  INSTALL_AGY=true
  INSTALL_CODEX=true
  INSTALL_ZCODE=true
fi

# ------------------------------------------------------------------------------
# 9. 安装与自动注入配置 (Step 8: Deploy Plugins & Inject Configs)
# ------------------------------------------------------------------------------
DEFAULT_CWD="$HOME/开发项目"
if [[ ! -d "$DEFAULT_CWD" ]]; then
  DEFAULT_CWD="$HOME"
fi

# Antigravity 安装
if $INSTALL_AGY; then
  log_step "正在安装/同步至 Antigravity..."
  dest="$HOME/.gemini/config/plugins/matrix-bridge"
  src="$ROOT/antigravity"
  mkdir -p "$dest"
  cp -R "$src/plugin.json" "$src/README.md" "$src/assets" "$src/rules" "$src/skills" "$src/sidecars" "$dest/"

  # 写入初始化配置
  agy_user="${AGENT_USER_MAP["antigravity"]:-@antigravity_bot:localhost}"
  agy_token="${AGENT_TOKEN_MAP["antigravity"]:-}"
  node -e "
    import { writeFileSync, existsSync, readFileSync } from 'node:fs';
    const cfgPath = '$dest/config.json';
    let cfg = {
      homeserver: '$MATRIX_URL',
      user_id: '$agy_user',
      access_token: '$agy_token',
      admins: ['$ADMIN_MXID'],
      allowed_senders: ['*'],
      direct_rooms: [],
      cwd: '$DEFAULT_CWD',
      console_port: 47612,
      auto_connect: true,
      group_reply_all: true
    };
    if (existsSync(cfgPath)) {
      try { cfg = { ...cfg, ...JSON.parse(readFileSync(cfgPath, 'utf8')) }; } catch {}
    }
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  "

  # 平滑重启旧 Sidecar 进程
  pkill -f "matrix_console/main.mjs" 2>/dev/null || true
  pkill -f "matrix-bridge/sidecars/matrix_console" 2>/dev/null || true
  log_ok "$(t installed_agy): $dest"
fi

# Codex 安装
if $INSTALL_CODEX; then
  log_step "正在安装/同步至 Codex..."
  plugins_dir="$ROOT/codex/plugins"

  if command -v codex >/dev/null 2>&1; then
    codex plugin marketplace add "$plugins_dir" 2>/dev/null || codex plugin marketplace update bigbear-matrix-codex 2>/dev/null || true
    codex plugin add matrix-bridge@bigbear-matrix-codex 2>/dev/null || true
  fi

  codex_dest="$HOME/.codex/matrix-bridge"
  mkdir -p "$codex_dest"
  codex_user="${AGENT_USER_MAP["codex"]:-@codex_bot:localhost}"
  codex_token="${AGENT_TOKEN_MAP["codex"]:-}"

  node -e "
    import { writeFileSync, existsSync, readFileSync } from 'node:fs';
    const cfgPath = '$codex_dest/config.json';
    let cfg = {
      homeserver: '$MATRIX_URL',
      user_id: '$codex_user',
      admins: ['$ADMIN_MXID'],
      allowed_senders: ['*'],
      direct_rooms: [],
      cwd: '$DEFAULT_CWD',
      console_port: 47614,
      group_reply_all: true,
      auto_join: true
    };
    if (existsSync(cfgPath)) {
      try { cfg = { ...cfg, ...JSON.parse(readFileSync(cfgPath, 'utf8')) }; } catch {}
    }
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
    if ('$codex_token') {
      writeFileSync('$codex_dest/token', '$codex_token\n', { mode: 0o600 });
    }
  "
  log_ok "$(t installed_codex)"
fi

# ZCode 安装
if $INSTALL_ZCODE; then
  log_step "正在安装/同步至 ZCode..."
  zcode_dest="$HOME/.zcode/matrix-bridge"
  mkdir -p "$zcode_dest"
  zcode_user="${AGENT_USER_MAP["zcode"]:-@zcode_bot:localhost}"
  zcode_token="${AGENT_TOKEN_MAP["zcode"]:-}"

  node -e "
    import { writeFileSync, existsSync, readFileSync } from 'node:fs';
    const cfgPath = '$zcode_dest/config.json';
    let cfg = {
      homeserver: '$MATRIX_URL',
      user_id: '$zcode_user',
      access_token: '$zcode_token',
      admins: ['$ADMIN_MXID'],
      allowed_senders: ['*'],
      direct_rooms: [],
      cwd: '$DEFAULT_CWD',
      console_port: 47613,
      auto_connect: true,
      group_reply_all: true
    };
    if (existsSync(cfgPath)) {
      try { cfg = { ...cfg, ...JSON.parse(readFileSync(cfgPath, 'utf8')) }; } catch {}
    }
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  "

  zcode_engine="$ROOT/ZCODE/plugins/matrix-bridge/engine"
  if [[ -f "$zcode_engine/daemonctl.mjs" ]]; then
    node "$zcode_engine/daemonctl.mjs" install || true
  fi

  if command -v zcode >/dev/null 2>&1; then
    zcode plugins marketplace update dev-matrix-bridge-zcode 2>/dev/null || true
    zcode plugins update matrix-bridge 2>/dev/null || true
  fi
  log_ok "$(t installed_zcode)"
fi

# ------------------------------------------------------------------------------
# 10. 部署与协同使用总结 (Step 9: Summary & Collaboration Guide)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}${GREEN}==========================================================================${NC}"
echo -e "${BOLD}${GREEN}   $(t summary_title)${NC}"
echo -e "${BOLD}${GREEN}==========================================================================${NC}"

echo -e "\n${BOLD}📡 Matrix 服务信息：${NC}"
echo -e "  • 服务器地址 (Homeserver): ${CYAN}${MATRIX_URL}${NC}"
echo -e "  • 管理员账号 (Admin MXID): ${CYAN}${ADMIN_MXID}${NC}"

echo -e "\n${BOLD}🤖 已部署的 Agent 机器人账号：${NC}"
if $INSTALL_AGY; then
  echo -e "  • ${BOLD}Antigravity${NC}: ${GREEN}${AGENT_USER_MAP["antigravity"]:-@antigravity_bot}${NC} (控制台: Antigravity Sidecar)"
fi
if $INSTALL_CODEX; then
  echo -e "  • ${BOLD}Codex${NC}:       ${GREEN}${AGENT_USER_MAP["codex"]:-@codex_bot}${NC} (控制台: http://127.0.0.1:47614/)"
fi
if $INSTALL_ZCODE; then
  echo -e "  • ${BOLD}ZCode${NC}:       ${GREEN}${AGENT_USER_MAP["zcode"]:-@zcode_bot}${NC} (控制台: http://127.0.0.1:47613/)"
fi

echo -e "\n${BOLD}🚀 快速开始多 Agent 协同：${NC}"
echo -e "  1. 打开 Element 或任何 Matrix 客户端登录管理员账号：${CYAN}${ADMIN_MXID}${NC}"
echo -e "  2. 创建一个协作加密/明文房间（如 ${BOLD}#ai-team${NC}）"
echo -e "  3. 将上面的机器人账号邀请进该房间"
echo -e "  4. 在群里发送：${CYAN}@antigravity_bot 制定架构，并让 @codex_bot 编写实现${NC}"
echo -e "\n${MAGENTA}$(t collab_tip)${NC}\n"
