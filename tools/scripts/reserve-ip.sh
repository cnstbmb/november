#!/bin/bash
# reserve-ip.sh
# Резервирует публичный IP в Yandex Cloud, пока он не начнётся на нужный PREFIX.
# Токен берётся автоматически из metadata service (VM должна иметь привязанный service account).
#
# Использование:
#   FOLDER_ID=b1gxxxxxxx ./reserve-ip.sh
#   FOLDER_ID=b1gxxxxxxx PREFIX=84.201 ZONE=ru-central1-b ./reserve-ip.sh
#
# Получить Folder ID: yc config get folder-id

set -uo pipefail

FOLDER_ID="${FOLDER_ID:?Укажи FOLDER_ID}"
ZONE="${ZONE:-ru-central1-a}"
PREFIX="${PREFIX:-84.201}"
API="https://vpc.api.cloud.yandex.net/vpc/v1"
OPS="https://operation.api.cloud.yandex.net/operations"
POLL_INTERVAL="${POLL_INTERVAL:-1}"
MAX_POLLS="${MAX_POLLS:-300}"
RETRY_DELAY="${RETRY_DELAY:-3}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"
CURL_MAX_TIME="${CURL_MAX_TIME:-30}"

API_BODY=""
OPERATION_JSON=""
CURRENT_CREATE_OP_ID=""
CURRENT_ADDR_ID=""
CURRENT_IP=""
MATCH_FOUND=0
PENDING_DELETE_IDS=()

log_warn() {
  echo "  ! $*" >&2
}

get_iam_token() {
  python3 -c '
import json
import sys
import urllib.error
import urllib.request

url = "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token"
req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})

try:
    with urllib.request.urlopen(req, timeout=5) as response:
        raw = response.read().decode("utf-8")
except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8", errors="replace")
    print(f"metadata HTTP {exc.code}: {body}", file=sys.stderr)
    sys.exit(1)
except urllib.error.URLError as exc:
    print(f"metadata request failed: {exc.reason}", file=sys.stderr)
    sys.exit(1)
except TimeoutError:
    print("metadata request timed out", file=sys.stderr)
    sys.exit(1)

try:
    data = json.loads(raw)
except json.JSONDecodeError as exc:
    print(f"metadata JSON decode error: {exc}", file=sys.stderr)
    sys.exit(1)

token = data.get("access_token")
if not token:
    print(f"metadata response has no access_token: {raw}", file=sys.stderr)
    sys.exit(1)

print(token)
' || return 1
}

queue_pending_delete() {
  local addr_id="$1"
  [[ -z "$addr_id" ]] && return
  PENDING_DELETE_IDS+=("$addr_id")
}

api_request() {
  local method="$1"
  local url="$2"
  local data="${3-}"
  local response http_code

  local IAM_TOKEN
  if ! IAM_TOKEN=$(get_iam_token); then
    log_warn "не удалось получить IAM-токен"
    return 1
  fi

  local -a curl_args=(
    -sS
    --connect-timeout "$CURL_CONNECT_TIMEOUT"
    --max-time "$CURL_MAX_TIME"
    --retry 3
    --retry-delay 1
    -X "$method"
    -H "Authorization: Bearer $IAM_TOKEN"
  )

  if [[ -n "$data" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$data")
  fi

  if ! response=$(curl "${curl_args[@]}" -w $'\n%{http_code}' "$url"); then
    log_warn "curl $method $url завершился с ошибкой"
    return 1
  fi

  http_code="${response##*$'\n'}"
  API_BODY="${response%$'\n'*}"

  if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    log_warn "API $method $url вернул HTTP $http_code"
    [[ -n "$API_BODY" ]] && log_warn "Ответ API: $API_BODY"
    return 1
  fi

  if [[ -z "$API_BODY" ]]; then
    log_warn "API $method $url вернул пустой ответ"
    return 1
  fi
}

extract_operation_id() {
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError as exc:
    print(f"JSON decode error: {exc}", file=sys.stderr)
    sys.exit(1)
op_id = data.get("id")
if not op_id:
    print("operation id is missing", file=sys.stderr)
    sys.exit(1)
print(op_id)
'
}

extract_operation_status() {
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError as exc:
    print(f"JSON decode error: {exc}", file=sys.stderr)
    sys.exit(1)
error = data.get("error") or {}
message = error.get("message", "")
code = error.get("code", "")
details = f"{code}: {message}" if code and message else message or code
print("True" if data.get("done") else "False")
print(details)
'
}

extract_address_info() {
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError as exc:
    print(f"JSON decode error: {exc}", file=sys.stderr)
    sys.exit(1)
response = data.get("response") or {}
address = response.get("externalIpv4Address") or {}
print(response.get("id", ""))
print(address.get("address", ""))
'
}

wait_for_operation() {
  local op_id="$1"
  local attempt=1
  local status done error_message

  echo "  Ожидаем операцию $op_id..."

  while (( attempt <= MAX_POLLS )); do
    if ! api_request GET "$OPS/$op_id"; then
      log_warn "не удалось получить статус операции $op_id (попытка $attempt/$MAX_POLLS)"
      sleep "$POLL_INTERVAL"
      ((attempt++))
      continue
    fi

    if ! status=$(printf '%s' "$API_BODY" | extract_operation_status); then
      log_warn "не удалось разобрать статус операции $op_id (попытка $attempt/$MAX_POLLS)"
      sleep "$POLL_INTERVAL"
      ((attempt++))
      continue
    fi

    done=$(printf '%s\n' "$status" | sed -n '1p')
    error_message=$(printf '%s\n' "$status" | sed -n '2p')

    if [[ "$done" == "True" ]]; then
      if [[ -n "$error_message" ]]; then
        log_warn "операция $op_id завершилась ошибкой: $error_message"
        return 2
      fi
      OPERATION_JSON="$API_BODY"
      return 0
    fi

    sleep "$POLL_INTERVAL"
    ((attempt++))
  done

  log_warn "таймаут ожидания операции $op_id после $MAX_POLLS проверок"
  return 1
}

delete_address() {
  local addr_id="$1"
  local del_op

  if ! api_request DELETE "$API/addresses/$addr_id"; then
    log_warn "не удалось отправить запрос на удаление адреса $addr_id"
    return 1
  fi

  if ! del_op=$(printf '%s' "$API_BODY" | extract_operation_id); then
    log_warn "не удалось извлечь id операции удаления адреса $addr_id"
    return 1
  fi

  if ! wait_for_operation "$del_op"; then
    log_warn "удаление адреса $addr_id не завершилось успешно"
    return 1
  fi

  return 0
}

wait_for_create_operation() {
  local op_id="$1"
  local wait_status

  CURRENT_CREATE_OP_ID="$op_id"

  while true; do
    wait_for_operation "$op_id"
    wait_status=$?

    case "$wait_status" in
      0)
        CURRENT_CREATE_OP_ID=""
        return 0
        ;;
      2)
        CURRENT_CREATE_OP_ID=""
        return 2
        ;;
      *)
        log_warn "состояние операции создания $op_id неизвестно; новый адрес не создаём"
        log_warn "продолжаем ждать эту же операцию через ${RETRY_DELAY}s"
        sleep "$RETRY_DELAY"
        ;;
    esac
  done
}

retry_pending_deletes() {
  local addr_id
  local -a remaining_ids=()

  (( ${#PENDING_DELETE_IDS[@]} == 0 )) && return

  echo "→ Повторно пытаемся удалить ранее неочищенные адреса..."
  for addr_id in "${PENDING_DELETE_IDS[@]}"; do
    if delete_address "$addr_id"; then
      echo "  Удалён адрес $addr_id."
    else
      log_warn "адрес $addr_id всё ещё не удалён"
      remaining_ids+=("$addr_id")
    fi
  done

  PENDING_DELETE_IDS=("${remaining_ids[@]}")
}

cleanup_on_exit() {
  local addr_id
  local addr_data cleanup_addr_id
  local wait_status
  local -a remaining_ids=()

  trap - EXIT INT TERM

  if (( MATCH_FOUND == 0 )) && [[ -n "$CURRENT_CREATE_OP_ID" && -z "$CURRENT_ADDR_ID" ]]; then
    echo ""
    echo "→ Проверяем незавершённую операцию создания $CURRENT_CREATE_OP_ID перед выходом..."
    wait_for_operation "$CURRENT_CREATE_OP_ID"
    wait_status=$?
    case "$wait_status" in
      0)
        if addr_data=$(printf '%s' "$OPERATION_JSON" | extract_address_info); then
          cleanup_addr_id=$(printf '%s\n' "$addr_data" | sed -n '1p')
          queue_pending_delete "$cleanup_addr_id"
        else
          log_warn "не удалось прочитать адрес из операции $CURRENT_CREATE_OP_ID"
        fi
        ;;
      2)
        log_warn "операция создания $CURRENT_CREATE_OP_ID завершилась ошибкой, удалять нечего"
        ;;
      *)
        log_warn "не удалось подтвердить результат операции $CURRENT_CREATE_OP_ID"
        log_warn "если она позже завершится успешно, IP может остаться зарезервированным"
        ;;
    esac
    CURRENT_CREATE_OP_ID=""
  fi

  if (( MATCH_FOUND == 0 )) && [[ -n "$CURRENT_ADDR_ID" ]]; then
    queue_pending_delete "$CURRENT_ADDR_ID"
    CURRENT_ADDR_ID=""
    CURRENT_IP=""
  fi

  if (( ${#PENDING_DELETE_IDS[@]} == 0 )); then
    return
  fi

  echo ""
  echo "→ Пытаемся удалить незавершённые адреса перед выходом..."
  for addr_id in "${PENDING_DELETE_IDS[@]}"; do
    if delete_address "$addr_id"; then
      echo "  Удалён адрес $addr_id."
    else
      log_warn "адрес $addr_id мог остаться зарезервированным"
      remaining_ids+=("$addr_id")
    fi
  done

  PENDING_DELETE_IDS=("${remaining_ids[@]}")
}

handle_signal() {
  local signal_name="$1"
  local exit_code="$2"
  echo ""
  echo "→ Получен сигнал $signal_name, завершаем..."
  exit "$exit_code"
}

trap cleanup_on_exit EXIT
trap 'handle_signal INT 130' INT
trap 'handle_signal TERM 143' TERM

while true; do
  retry_pending_deletes
  echo "→ Резервируем новый IP в зоне $ZONE..."

  CURRENT_ADDR_ID=""
  CURRENT_IP=""

  if ! api_request POST "$API/addresses" "{
    \"folderId\": \"$FOLDER_ID\",
    \"externalIpv4AddressSpec\": {
      \"zoneId\": \"$ZONE\"
    }
  }"; then
    log_warn "не удалось создать адрес, повторяем через ${RETRY_DELAY}s"
    sleep "$RETRY_DELAY"
    continue
  fi

  if ! OP_ID=$(printf '%s' "$API_BODY" | extract_operation_id); then
    log_warn "не удалось извлечь id операции создания, повторяем через ${RETRY_DELAY}s"
    sleep "$RETRY_DELAY"
    continue
  fi

  wait_for_create_operation "$OP_ID"
  WAIT_STATUS=$?
  if (( WAIT_STATUS != 0 )); then
    log_warn "создание адреса завершилось ошибкой, повторяем через ${RETRY_DELAY}s"
    sleep "$RETRY_DELAY"
    continue
  fi

  if ! ADDR_DATA=$(printf '%s' "$OPERATION_JSON" | extract_address_info); then
    log_warn "не удалось прочитать данные адреса из операции $OP_ID, повторяем через ${RETRY_DELAY}s"
    sleep "$RETRY_DELAY"
    continue
  fi

  CURRENT_ADDR_ID=$(printf '%s\n' "$ADDR_DATA" | sed -n '1p')
  CURRENT_IP=$(printf '%s\n' "$ADDR_DATA" | sed -n '2p')

  if [[ -z "$CURRENT_ADDR_ID" || -z "$CURRENT_IP" ]]; then
    log_warn "операция $OP_ID не вернула address id или IP, повторяем через ${RETRY_DELAY}s"
    sleep "$RETRY_DELAY"
    continue
  fi

  echo "  Получен IP: $CURRENT_IP (id: $CURRENT_ADDR_ID)"

  if [[ "$CURRENT_IP" == "${PREFIX}"* ]]; then
    MATCH_FOUND=1
    echo ""
    echo "✅ DONE — IP $CURRENT_IP начинается на $PREFIX"
    echo "   Address ID: $CURRENT_ADDR_ID"
    break
  fi

  echo "  ✗ Не подходит ($CURRENT_IP). Удаляем..."
  if delete_address "$CURRENT_ADDR_ID"; then
    echo "  Удалён. Пробуем снова..."
    CURRENT_ADDR_ID=""
    CURRENT_IP=""
  else
    log_warn "не удалось удалить $CURRENT_ADDR_ID, продолжаем цикл"
    queue_pending_delete "$CURRENT_ADDR_ID"
    CURRENT_ADDR_ID=""
    CURRENT_IP=""
  fi
  echo ""
done
