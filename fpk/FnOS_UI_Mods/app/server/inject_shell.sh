#!/bin/sh
set -eu

BACKUP_DIR="/usr/cqshbak"
BACKUP_FILE="${BACKUP_DIR}/index.html.original"
TARGET_DIR="/usr/trim/www"
INDEX_FILE="${TARGET_DIR}/index.html"

CSS_PATH="${1-}"
JS_PATH="${2-}"
DELAY_SEC="${3-0}"

is_valid_delay() {
    case "$1" in
        ''|*[!0-9.]*|*.*.*|.*|*.) return 1 ;;
        *) return 0 ;;
    esac
}

if ! is_valid_delay "${DELAY_SEC}"; then
    DELAY_SEC="0"
fi

ensure_backup() {
    mkdir -p "${BACKUP_DIR}"
    if [ ! -f "${BACKUP_FILE}" ]; then
        if [ ! -f "${INDEX_FILE}" ]; then
            echo "未找到系统文件: ${INDEX_FILE}" >&2
            exit 1
        fi
        cp "${INDEX_FILE}" "${BACKUP_FILE}"
    fi
}

restore_original() {
    if [ ! -f "${BACKUP_FILE}" ]; then
        echo "未找到备份文件" >&2
        exit 1
    fi
    cp -f "${BACKUP_FILE}" "${INDEX_FILE}"
    chmod 644 "${INDEX_FILE}"
}

inject_css() {
    css_file="$1"
    temp_file="$(mktemp)"

    awk -v insert_file="${css_file}" '
    BEGIN { found = 0 }
    /<\/head>/ && found == 0 {
        match($0, /<\/head>/)
        printf "%s", substr($0, 1, RSTART - 1)
        print "<style>"
        print "/* Injected CSS */"
        while ((getline line < insert_file) > 0) {
            print line
        }
        close(insert_file)
        print "</style>"
        print substr($0, RSTART)
        found = 1
        next
    }
    { print }
    ' "${INDEX_FILE}" > "${temp_file}"

    mv "${temp_file}" "${INDEX_FILE}"
}

inject_js() {
    js_file="$1"
    temp_file="$(mktemp)"

    awk -v insert_file="${js_file}" '
    BEGIN { found = 0 }
    /<\/body>/ && found == 0 {
        match($0, /<\/body>/)
        printf "%s", substr($0, 1, RSTART - 1)
        print "<script>"
        print "// Injected JS"
        while ((getline line < insert_file) > 0) {
            print line
        }
        close(insert_file)
        print "</script>"
        print substr($0, RSTART)
        found = 1
        next
    }
    { print }
    ' "${INDEX_FILE}" > "${temp_file}"

    mv "${temp_file}" "${INDEX_FILE}"
}

if [ -z "${CSS_PATH}" ] && [ -z "${JS_PATH}" ]; then
    echo "未提供任何 CSS/JS 内容" >&2
    exit 2
fi

ensure_backup
restore_original

if [ "${DELAY_SEC}" != "0" ]; then
    sleep "${DELAY_SEC}"
fi

if [ -n "${CSS_PATH}" ]; then
    if [ ! -f "${CSS_PATH}" ]; then
        echo "CSS 文件不存在: ${CSS_PATH}" >&2
        exit 3
    fi
    inject_css "${CSS_PATH}"
fi

if [ -n "${JS_PATH}" ]; then
    if [ ! -f "${JS_PATH}" ]; then
        echo "JS 文件不存在: ${JS_PATH}" >&2
        exit 4
    fi
    inject_js "${JS_PATH}"
fi

chmod 644 "${INDEX_FILE}"
