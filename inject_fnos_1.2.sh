#!/bin/bash
set -euo pipefail

# ==================== 变量定义区 ====================
readonly BACKUP_DIR="/usr/cqshbak"
readonly BACKUP_FILE="${BACKUP_DIR}/index.html.original"

# 颜色定义
readonly GRAD_1='\033[38;5;196m' # 亮红色
readonly GRAD_4='\033[38;5;214m' # 亮橙色
readonly GRAD_8='\033[38;5;118m' # 亮绿色
readonly GRAD_11='\033[38;5;48m' # 深青绿色
readonly GRAD_12='\033[38;5;63m' # 深蓝色
readonly GRAD_15='\033[38;5;51m' # 玫红色
readonly GRAD_17='\033[38;5;197m' # 深红色
readonly GRAD_18='\033[38;5;201m' # 紫红色
readonly NC='\033[0m'
readonly BLINK='\033[5m'
readonly NOBLINK='\033[25m'
readonly BOLD='\033[1m'
readonly NO_EFFECT='\033[21;24;25;27m'

readonly TARGET_DIR="/usr/trim/www"
readonly INDEX_FILE="${TARGET_DIR}/index.html"

# ==================== 核心功能函数 ====================

check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo -e "${GRAD_17}✗ 错误：此脚本需要root权限${NC}" >&2
        exit 1
    fi
}

show_header() {
    local title="$1"
    echo -e "\n${GRAD_15}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GRAD_15}          -- ${BLINK}${title}${NOBLINK} --${NC}"
    echo -e "${GRAD_15}╚══════════════════════════════════════════════╝${NC}"
}

ensure_backup() {
    mkdir -p "$BACKUP_DIR"
    if [ ! -f "$BACKUP_FILE" ]; then
        if [ -f "$INDEX_FILE" ]; then
            cp "$INDEX_FILE" "$BACKUP_FILE"
            echo -e "${GRAD_8}✓ 原始文件备份完成${NC}"
        else
            echo -e "${GRAD_17}✗ 错误：未找到系统文件 $INDEX_FILE${NC}"
            return 1
        fi
    fi
}

restore_original() {
    if [ -f "$BACKUP_FILE" ]; then
        cp -f "$BACKUP_FILE" "$INDEX_FILE"
        chmod 644 "$INDEX_FILE"
        echo -e "${GRAD_8}✓ 已还原至官方默认状态${NC}"
    else
        echo -e "${GRAD_17}✗ 错误：未找到备份文件${NC}"
    fi
}

# 注入函数 (修复了 & 符号被转义的问题)
inject_code() {
    ensure_backup || return 1
    
    # 强制还原后再注入，防止重复
    cp -f "$BACKUP_FILE" "$INDEX_FILE"

    local css_path=""
    local js_path=""
    
    show_header "CSS/JS 注入配置"
    echo -e "${GRAD_4}请输入文件路径（支持中文路径，可直接拖入终端）：${NC}"
    read -p "→ CSS 文件路径: " css_path
    read -p "→ JS 文件路径: " js_path

    if [ -z "$css_path" ] && [ -z "$js_path" ]; then
        echo -e "${GRAD_4}⚠️ 未输入任何路径，操作取消${NC}"
        return 0
    fi

    local temp_file=$(mktemp)
    cp "$INDEX_FILE" "$temp_file"

    # 处理 CSS
    if [ -n "$css_path" ] && [ -f "$css_path" ]; then
        echo -e "${GRAD_12}正在注入 CSS...${NC}"
        # 使用更安全的 awk 逻辑：找到位置，切断字符串，直接 print 内容，避免 gsub 转义问题
        awk -v content="$(cat "$css_path")" '
        BEGIN { found = 0 }
        /<\/head>/ && found == 0 {
            match($0, /<\/head>/)
            # 打印 </head> 之前的内容
            printf "%s", substr($0, 1, RSTART - 1)
            # 打印 CSS 标签和内容
            print "<style>"
            print "/* Injected by script */"
            print content
            print "</style>"
            # 打印 </head> 及其之后的内容
            print substr($0, RSTART)
            found = 1
            next
        }
        { print }
        ' "$temp_file" > "${temp_file}.tmp" && mv "${temp_file}.tmp" "$temp_file"
    fi

    # 处理 JS
    if [ -n "$js_path" ] && [ -f "$js_path" ]; then
        echo -e "${GRAD_12}正在注入 JS...${NC}"
        # 同样使用安全的逻辑，防止 && 变成 </body></body>
        awk -v content="$(cat "$js_path")" '
        BEGIN { found = 0 }
        /<\/body>/ && found == 0 {
            match($0, /<\/body>/)
            # 打印 </body> 之前的内容
            printf "%s", substr($0, 1, RSTART - 1)
            # 打印 JS 标签和内容
            print "<script>"
            print "// Injected by script"
            print content
            print "</script>"
            # 打印 </body> 及其之后的内容
            print substr($0, RSTART)
            found = 1
            next
        }
        { print }
        ' "$temp_file" > "${temp_file}.tmp" && mv "${temp_file}.tmp" "$temp_file"
    fi

    # 应用修改
    if mv "$temp_file" "$INDEX_FILE"; then
        chmod 644 "$INDEX_FILE"
        echo -e "${GRAD_8}✓ 注入成功！请强制刷新浏览器 (Ctrl+F5) 查看效果。${NC}"
    else
        echo -e "${GRAD_17}✗ 应用失败${NC}"
        restore_original
    fi
}

# ==================== 菜单逻辑 ====================

show_menu() {
    echo -e "\n${GRAD_12}╔═══════════════════════════════════════════╗${NC}"
    echo -e "${GRAD_12}║${GRAD_15}    ${BOLD}${BLINK}-- 飞牛前端代码注入工具 v1.2 --${NO_EFFECT}    ${GRAD_12}║${NC}"
    echo -e "${GRAD_12}╚═══════════════════════════════════════════╝${NC}"
    echo -e "${GRAD_8} 1. 注入自定义 CSS/JS${NC}"
    echo -e "${GRAD_4} 2. 还原官方默认状态${NC}"
    echo -e "${GRAD_18} 0. 退出脚本${NC}"
}

main() {
    check_root
    while true; do
        show_menu
        read -p "→ 选择 (0-2): " choice
        case "$choice" in
            1) inject_code ;;
            2) restore_original ;;
            0) exit 0 ;;
            *) echo -e "${GRAD_17}无效选择${NC}" ;;
        esac
    done
}

main