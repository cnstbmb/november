#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TARGET_DIR="${REPO_ROOT}/.private/ansible/prod"
TARGET_FILE="${TARGET_DIR}/home-ai.env"
DEFAULT_MODEL="${TARGET_DIR}/artifacts/home-ai/qwen3.5-2b-w4a16-grq-rk3576.rkllm"
FORCE=0

usage() {
  printf '%s\n' \
    "Usage: tools/home-ai/configure_secrets.sh [--force|--check|--set-model PATH]" \
    "  --force  replace the private file atomically (no backup)" \
    "  --check  verify required keys and permissions without showing values" \
    "  --set-model PATH  atomically update only MODEL_LOCAL_PATH"
}

set_model_path() {
  local model_path="$1"
  if [[ ! -r "${model_path}" ]]; then
    printf 'Модель не читается: %s\n' "${model_path}" >&2
    return 1
  fi
  check_file >/dev/null
  local temp_file
  temp_file="$(mktemp "${TARGET_DIR}/.home-ai.env.XXXXXX")"
  trap 'rm -f "${temp_file:-}"' RETURN
  awk -v model_path="${model_path}" '
    BEGIN { updated = 0 }
    /^MODEL_LOCAL_PATH=/ {
      print "MODEL_LOCAL_PATH=" model_path
      updated = 1
      next
    }
    { print }
    END { if (!updated) exit 1 }
  ' "${TARGET_FILE}" >"${temp_file}"
  chmod 0600 "${temp_file}"
  mv "${temp_file}" "${TARGET_FILE}"
  trap - RETURN
  printf 'MODEL_LOCAL_PATH updated atomically; secret values were not displayed.\n'
}

check_file() {
  if [[ ! -f "${TARGET_FILE}" ]]; then
    printf 'Missing: %s\n' "${TARGET_FILE}" >&2
    return 1
  fi
  local key
  for key in \
    MODEL_LOCAL_PATH TELEGRAM_BOT_TOKEN ALLOWED_TELEGRAM_USER_ID ALLOWED_TELEGRAM_CHAT_ID \
    PAIRING_SECRET BRAVE_API_KEY ACTION_BROKER_TOKEN QBITTORRENT_USERNAME QBITTORRENT_PASSWORD; do
    if ! grep -q "^${key}=" "${TARGET_FILE}"; then
      printf 'Missing key: %s\n' "${key}" >&2
      return 1
    fi
  done
  local permissions
  permissions="$(stat -f '%Lp' "${TARGET_FILE}" 2>/dev/null || stat -c '%a' "${TARGET_FILE}")"
  if [[ "${permissions}" != "600" ]]; then
    printf 'Unsafe permissions: %s (expected 600)\n' "${permissions}" >&2
    return 1
  fi
  printf 'OK: %s exists, required keys are present, mode=0600.\n' "${TARGET_FILE}"
}

read_secret() {
  local prompt="$1"
  local variable_name="$2"
  local allow_empty="${3:-0}"
  local value
  printf '%s' "${prompt}" >&2
  stty -echo
  IFS= read -r value || true
  stty echo
  printf '\n' >&2
  if [[ "${allow_empty}" != "1" && -z "${value}" ]]; then
    printf 'Значение не может быть пустым.\n' >&2
    return 1
  fi
  printf -v "${variable_name}" '%s' "${value}"
}

discover_telegram_id() {
  printf '%s\n' "${telegram_bot_token}" | python3 -c '
import json
import sys
import urllib.request

token = sys.stdin.readline().strip()
request = urllib.request.Request(
    f"https://api.telegram.org/bot{token}/getUpdates?timeout=1&allowed_updates=%5B%22message%22%5D",
    headers={"User-Agent": "jarvis-configure/1.0"},
)
with urllib.request.urlopen(request, timeout=10) as response:
    payload = json.load(response)
for update in reversed(payload.get("result", [])):
    message = update.get("message", {})
    chat = message.get("chat", {})
    sender = message.get("from", {})
    if chat.get("type") == "private" and sender.get("id") == chat.get("id"):
        print(sender["id"])
        break
'
}

write_property() {
  local key="$1"
  local value="$2"
  if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* ]]; then
    printf 'Недопустимый перенос строки в %s.\n' "${key}" >&2
    return 1
  fi
  printf '%s=%s\n' "${key}" "${value}" >> "${TEMP_FILE}"
}

case "${1:-}" in
  --check)
    check_file
    exit $?
    ;;
  --force)
    FORCE=1
    ;;
  --set-model)
    if [[ -z "${2:-}" || -n "${3:-}" ]]; then
      usage >&2
      exit 2
    fi
    set_model_path "$2"
    exit $?
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  "") ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [[ -e "${TARGET_FILE}" && "${FORCE}" != "1" ]]; then
  printf '%s already exists. Re-run with --force to replace it without a backup.\n' "${TARGET_FILE}" >&2
  exit 1
fi

printf '\n[1/5] Telegram BotFather\n'
printf 'Открой @BotFather, выбери cnstbmb_jarvis_bot и скопируй HTTP API token.\n'
until read_secret 'Bot token (скрыт): ' telegram_bot_token; do :; done
if [[ ! "${telegram_bot_token}" =~ ^[0-9]+:[A-Za-z0-9_-]{20,}$ ]]; then
  printf 'Формат BotFather token выглядит неверно.\n' >&2
  exit 1
fi
printf 'Теперь отправь любое сообщение @cnstbmb_jarvis_bot и нажми Enter здесь.\n'
IFS= read -r _
telegram_user_id="$(discover_telegram_id 2>/dev/null || true)"
if [[ ! "${telegram_user_id}" =~ ^[0-9]+$ ]]; then
  printf 'Не удалось определить ID через Bot API.\n'
  printf 'Введи свой numeric Telegram user ID: '
  IFS= read -r telegram_user_id
fi
if [[ ! "${telegram_user_id}" =~ ^[0-9]+$ ]]; then
  printf 'Telegram user ID должен быть числом.\n' >&2
  exit 1
fi

printf '\n[2/5] Brave Search API\n'
printf '%s\n' \
  '1. В dashboard выбери план Search.' \
  '2. В API Keys создай subscription token.' \
  '3. Бесплатные $5/месяц покрывают 1000 Search-запросов; поставь spending limit $0.' \
  'Dashboard: https://api-dashboard.search.brave.com/app/keys'
until read_secret 'Brave subscription token (скрыт): ' brave_api_key; do :; done

printf '\n[3/5] DeepSeek (необязательно)\n'
read_secret 'DeepSeek API key, Enter чтобы пропустить (скрыт): ' deepseek_api_key 1

printf '\n[4/5] qBittorrent Web API\n'
printf 'Логин qBittorrent: '
IFS= read -r qbittorrent_username
if [[ -z "${qbittorrent_username}" ]]; then
  printf 'Логин не может быть пустым.\n' >&2
  exit 1
fi
until read_secret 'Пароль qBittorrent (скрыт): ' qbittorrent_password; do :; done

printf '\n[5/5] Локальная модель и генерируемые токены\n'
printf 'Путь к RKLLM-модели [%s]: ' "${DEFAULT_MODEL}"
IFS= read -r model_local_path
model_local_path="${model_local_path:-${DEFAULT_MODEL}}"
if [[ ! -r "${model_local_path}" ]]; then
  printf 'Модель не читается: %s\n' "${model_local_path}" >&2
  exit 1
fi
pairing_secret="$(openssl rand -hex 8)"
action_broker_token="$(openssl rand -hex 32)"

mkdir -p "${TARGET_DIR}"
TEMP_FILE="$(mktemp "${TARGET_DIR}/.home-ai.env.XXXXXX")"
trap 'rm -f "${TEMP_FILE:-}"; stty echo 2>/dev/null || true' EXIT

write_property MODEL_LOCAL_PATH "${model_local_path}"
write_property TELEGRAM_BOT_TOKEN "${telegram_bot_token}"
write_property ALLOWED_TELEGRAM_USER_ID "${telegram_user_id}"
write_property ALLOWED_TELEGRAM_CHAT_ID "${telegram_user_id}"
write_property PAIRING_SECRET "${pairing_secret}"
write_property BRAVE_API_KEY "${brave_api_key}"
write_property DEEPSEEK_API_KEY "${deepseek_api_key}"
write_property ACTION_BROKER_TOKEN "${action_broker_token}"
write_property QBITTORRENT_USERNAME "${qbittorrent_username}"
write_property QBITTORRENT_PASSWORD "${qbittorrent_password}"

install -m 0600 "${TEMP_FILE}" "${TARGET_FILE}"
rm -f "${TEMP_FILE}"
trap - EXIT

printf '\nГотово: %s (mode 0600, без резервной копии).\n' "${TARGET_FILE}"
printf 'Одноразовая команда привязки после деплоя: /pair %s\n' "${pairing_secret}"
printf 'Action broker token сохранён, но не выводился.\n'
