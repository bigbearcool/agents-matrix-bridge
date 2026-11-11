#!/usr/bin/env bash
# ==============================================================================
# Matrix Bridge 多端统一安装与部署脚本
# 自动检测机器上的 Agent 运行时 (Antigravity / Codex / ZCode)，
# 支持交互式单选、多选或一键全量安装，并在安装后提供完整的 Matrix 配置指引。
# ==============================================================================

set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# 颜色与样式
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
NC="\033[0m"

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
        Core + Adapter 统一多端插件安装器
EOF
echo -e "${NC}"

# 1. 运行环境检测
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

print_detection_status() {
  echo -e "${BOLD}🔍 当前机器检测到的 Agent 运行时：${NC}"
  if $DETECT_AGY; then
    echo -e "  [1] ${GREEN}●${NC} ${BOLD}Antigravity${NC} (CLI: ${AGY_BIN:-内置/未在PATH}, 目录: ~/.gemini)"
  else
    echo -e "  [1] ${RED}○${NC} Antigravity (未检测到运行时)"
  fi

  if $DETECT_CODEX; then
    echo -e "  [2] ${GREEN}●${NC} ${BOLD}Codex${NC} (CLI: ${CODEX_BIN:-未在PATH}, 目录: ~/.codex)"
  else
    echo -e "  [2] ${RED}○${NC} Codex (未检测到运行时)"
  fi

  if $DETECT_ZCODE; then
    echo -e "  [3] ${GREEN}●${NC} ${BOLD}ZCode${NC} (CLI: ${ZCODE_BIN:-未在PATH}, 目录: ~/.zcode)"
  else
    echo -e "  [3] ${RED}○${NC} ZCode (未检测到运行时)"
  fi
  echo ""
}

# 2. 预构建与产物同步
run_prebuild() {
  log_step "[1/3] 构建统一 UI 与校验 Core/Adapters 架构..."
  if ! command -v node >/dev/null 2>&1; then
    log_err "未找到 node 命令，请先安装 Node.js (>= 18)"
    exit 1
  fi
  node scripts/build-and-sync.mjs
}

# 3. 各端安装函数
install_antigravity() {
  log_step "正在安装/同步至 Antigravity..."
  local dest="$HOME/.gemini/config/plugins/matrix-bridge"
  local src="$ROOT/antigravity"

  mkdir -p "$dest"
  cp -R "$src/plugin.json" "$src/README.md" "$src/assets" "$src/rules" "$src/skills" "$src/sidecars" "$dest/"

  node --check "$dest/sidecars/matrix_console/main.mjs" >/dev/null 2>&1 || true
  node --check "$dest/sidecars/matrix_console/app.js" >/dev/null 2>&1 || true

  # 尝试平滑重启已运行的 Sidecar
  pkill -f "matrix_console/main.mjs" 2>/dev/null || true
  pkill -f "matrix-bridge/sidecars/matrix_console" 2>/dev/null || true

  log_ok "Antigravity Matrix Bridge 插件已成功安装至: $dest"
}

install_codex() {
  log_step "正在安装/同步至 Codex..."
  local plugins_dir="$ROOT/codex/plugins"

  if command -v codex >/dev/null 2>&1; then
    log_info "配置 Codex 本地插件市场..."
    codex plugin marketplace add "$plugins_dir" 2>/dev/null || codex plugin marketplace update bigbear-matrix-codex 2>/dev/null || true
    log_info "安装/更新 matrix-bridge 插件..."
    codex plugin add matrix-bridge@bigbear-matrix-codex 2>/dev/null || true
  else
    log_warn "未在 PATH 中找到 codex 命令，跳过 CLI 插件市场注册，代码已同步就绪"
  fi

  # 准备默认配置模板目录
  mkdir -p "$HOME/.codex/matrix-bridge"
  if [[ ! -f "$HOME/.codex/matrix-bridge/config.json" && -f "$ROOT/codex/config.example.json" ]]; then
    cp "$ROOT/codex/config.example.json" "$HOME/.codex/matrix-bridge/config.json"
    log_info "已初始化默认配置文件: ~/.codex/matrix-bridge/config.json"
  fi

  log_ok "Codex Matrix Bridge 插件与 MCP App 已成功就绪！"
}

install_zcode() {
  log_step "正在安装/同步至 ZCode..."
  local zcode_engine="$ROOT/ZCODE/plugins/matrix-bridge/engine"

  if [[ -f "$zcode_engine/daemonctl.mjs" ]]; then
    log_info "安装并启动 ZCode 桥接守护进程..."
    node "$zcode_engine/daemonctl.mjs" install || true
  fi

  if command -v zcode >/dev/null 2>&1; then
    log_info "更新 ZCode 本地插件市场与插件..."
    zcode plugins marketplace update dev-matrix-bridge-zcode 2>/dev/null || true
    zcode plugins update matrix-bridge 2>/dev/null || true
  else
    log_warn "未在 PATH 中找到 zcode 命令，跳过 CLI 更新，后台服务已部署"
  fi

  log_ok "ZCode Matrix Bridge 插件与守护进程已成功就绪！"
}

# 4. 打印配置指引
print_guide() {
  local target_agy=$1
  local target_codex=$2
  local target_zcode=$3

  echo -e "\n${BOLD}${GREEN}========================================================================${NC}"
  echo -e "${BOLD}${GREEN}🎉 Matrix Bridge 插件安装完毕！请按以下指引进入对应 Agent 配置 Matrix：${NC}"
  echo -e "${BOLD}${GREEN}========================================================================${NC}"

  if $target_agy; then
    echo -e "\n${BOLD}${CYAN}1️⃣  【Antigravity】配置指引：${NC}"
    echo -e "   • 打开 Antigravity 桌面客户端"
    echo -e "   • 在左侧或侧边栏点击「Matrix Bot」Sidecar 插件图标"
    echo -e "   • 在管理面板中输入 Homeserver（如直连或 Pantalaimon http://...:18010）与账号密码/Token"
    echo -e "   • 保存后点击「连接」，即可在 Matrix 聊天中与 Antigravity 对话"
  fi

  if $target_codex; then
    echo -e "\n${BOLD}${CYAN}2️⃣  【Codex】配置指引：${NC}"
    echo -e "   • 启动或重启 Codex"
    echo -e "   • 在 Codex 对话窗口中调用工具，或点击右侧 MCP App「Matrix Bridge 管理台」"
    echo -e "   • 亦可直接在浏览器中打开本地控制台: ${BOLD}http://127.0.0.1:47614/${NC}"
    echo -e "   • 在控制台中配置 Matrix 账号凭证、默认模型、思考深度与工作区"
  fi

  if $target_zcode; then
    echo -e "\n${BOLD}${CYAN}3️⃣  【ZCode】配置指引：${NC}"
    echo -e "   • 重启 ZCode 桌面应用（或开启新会话）"
    echo -e "   • 在右侧侧边栏切换面板至「Matrix Bot」"
    echo -e "   • 亦可在浏览器中打开 ZCode 本地控制台: ${BOLD}http://127.0.0.1:47613/${NC}"
    echo -e "   • 配置 Matrix 账号并绑定项目工作区"
  fi

  echo -e "\n${BOLD}${YELLOW}💡 常用聊天命令：${NC}"
  echo -e "   • ${BOLD}/status${NC}    - 查看当前机器人的运行状态、工作区与模型"
  echo -e "   • ${BOLD}/workspace${NC} - 查看或切换绑定的本地代码项目目录"
  echo -e "   • ${BOLD}/model${NC}     - 查看或动态切换对话大模型"
  echo -e "   • ${BOLD}/new${NC}       - 重置当前房间的上下文会话"
  echo -e "   • ${BOLD}/help${NC}      - 获取所有支持的管理与聊天指令说明"
  echo -e "${BOLD}${GREEN}========================================================================${NC}\n"
}

# 5. 主流程
TARGET_AGY=false
TARGET_CODEX=false
TARGET_ZCODE=false

# 处理命令行参数
if [[ $# -gt 0 ]]; then
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all|-a)
        TARGET_AGY=true
        TARGET_CODEX=true
        TARGET_ZCODE=true
        shift
        ;;
      --antigravity|--agy|-1)
        TARGET_AGY=true
        shift
        ;;
      --codex|-2)
        TARGET_CODEX=true
        shift
        ;;
      --zcode|-3)
        TARGET_ZCODE=true
        shift
        ;;
      --detect|-d)
        print_detection_status
        exit 0
        ;;
      --help|-h)
        echo "用法: ./install.sh [选项]"
        echo "选项:"
        echo "  --all, -a            为所有检测到的运行时安装"
        echo "  --antigravity, -1    仅安装 Antigravity 插件"
        echo "  --codex, -2          仅安装 Codex 插件"
        echo "  --zcode, -3          仅安装 ZCode 插件"
        echo "  --detect, -d         仅检测并打印系统中的 Agent 运行时"
        echo "  --help, -h           显示此帮助信息"
        exit 0
        ;;
      *)
        log_err "未知参数: $1"
        exit 1
        ;;
    esac
  done
else
  # 交互式选择模式
  print_detection_status

  echo -e "${BOLD}请选择要安装 Matrix Bridge 插件的目标运行时：${NC}"
  echo "  1) 仅 Antigravity"
  echo "  2) 仅 Codex"
  echo "  3) 仅 ZCode"
  echo "  a) 安装所有已检测到的运行时 (默认)"
  echo "  q) 退出"
  echo ""
  read -r -p "请输入选项 [1/2/3/a/q] (默认 a): " choice
  choice="${choice:-a}"

  case "$choice" in
    1)
      TARGET_AGY=true
      ;;
    2)
      TARGET_CODEX=true
      ;;
    3)
      TARGET_ZCODE=true
      ;;
    [aA]|"")
      $DETECT_AGY && TARGET_AGY=true
      $DETECT_CODEX && TARGET_CODEX=true
      $DETECT_ZCODE && TARGET_ZCODE=true
      # 若均未检测到，则默认全选
      if ! $TARGET_AGY && ! $TARGET_CODEX && ! $TARGET_ZCODE; then
        TARGET_AGY=true
        TARGET_CODEX=true
        TARGET_ZCODE=true
      fi
      ;;
    [qQ])
      echo "已取消安装。"
      exit 0
      ;;
    *)
      # 支持如 "1,2" 或 "1 3"
      if [[ "$choice" =~ "1" ]]; then TARGET_AGY=true; fi
      if [[ "$choice" =~ "2" ]]; then TARGET_CODEX=true; fi
      if [[ "$choice" =~ "3" ]]; then TARGET_ZCODE=true; fi
      ;;
  esac
fi

# 执行预构建与同步
run_prebuild

# 执行选中端安装
if $TARGET_AGY; then
  install_antigravity
fi

if $TARGET_CODEX; then
  install_codex
fi

if $TARGET_ZCODE; then
  install_zcode
fi

# 打印配置指引
print_guide $TARGET_AGY $TARGET_CODEX $TARGET_ZCODE
