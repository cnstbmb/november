#!/bin/bash
# reserve-ip.sh
# Резервирует публичный IP в Yandex Cloud, пока он не начнётся на 84.201
# Использование: IAM_TOKEN=... FOLDER_ID=... ZONE=ru-central1-a ./reserve-ip.sh
# Получить IAM-токен yc iam create-token
# Получить Folder ID yc config get folder-id

set -e

IAM_TOKEN="${IAM_TOKEN:?Укажи IAM_TOKEN}"
FOLDER_ID="${FOLDER_ID:?Укажи FOLDER_ID}"
ZONE="${ZONE:-ru-central1-a}"
PREFIX="${PREFIX:-84.201}"
API="https://vpc.api.cloud.yandex.net/vpc/v1"
OPS="https://operation.api.cloud.yandex.net/operations"

wait_for_operation() {
  local op_id="$1"
  echo "  Ожидаем операцию $op_id..."
  while true; do
    local done
    done=$(curl -sf -H "Authorization: Bearer $IAM_TOKEN" \
      "$OPS/$op_id" | python3 -c "import sys,json; print(json.load(sys.stdin).get('done', False))")
    [ "$done" = "True" ] && break
    sleep 1
  done
}

while true; do
  echo "→ Резервируем новый IP в зоне $ZONE..."

  RESPONSE=$(curl -sf -X POST "$API/addresses" \
    -H "Authorization: Bearer $IAM_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"folderId\": \"$FOLDER_ID\",
      \"externalIpv4AddressSpec\": {
        \"zoneId\": \"$ZONE\"
      }
    }")

  OP_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  wait_for_operation "$OP_ID"

  # Получаем данные свежесозданного адреса
  ADDR_DATA=$(curl -sf -H "Authorization: Bearer $IAM_TOKEN" \
    "$OPS/$OP_ID" | python3 -c "
import sys, json
data = json.load(sys.stdin)
resp = data.get('response', {})
print(resp.get('id', ''))
print(resp.get('externalIpv4Address', {}).get('address', ''))
")

  ADDR_ID=$(echo "$ADDR_DATA" | sed -n '1p')
  IP=$(echo "$ADDR_DATA" | sed -n '2p')

  echo "  Получен IP: $IP (id: $ADDR_ID)"

  if [[ "$IP" == ${PREFIX}* ]]; then
    echo ""
    echo "✅ DONE — IP $IP начинается на $PREFIX"
    echo "   Address ID: $ADDR_ID"
    break
  else
    echo "  ✗ Не подходит ($IP). Удаляем..."
    DEL_OP=$(curl -sf -X DELETE "$API/addresses/$ADDR_ID" \
      -H "Authorization: Bearer $IAM_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    wait_for_operation "$DEL_OP"
    echo "  Удалён. Пробуем снова..."
    echo ""
  fi
done
