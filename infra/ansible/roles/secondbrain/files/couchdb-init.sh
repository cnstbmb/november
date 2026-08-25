#!/bin/sh
# Copied from vrtmrz/obsidian-livesync docker/scripts/couchdb-init.sh
# Upstream commit: bc41355a740335172c9ca08dad6222f5e79698a8
set -eu

hostname="${COUCHDB_INTERNAL_URL:-http://couchdb:5984}"
username="${COUCHDB_USER:?COUCHDB_USER is required}"
password="${COUCHDB_PASSWORD:?COUCHDB_PASSWORD is required}"
node="${COUCHDB_NODE:-_local}"
db="${COUCHDB_DATABASE:-secondbrain}"

until curl -sf --user "${username}:${password}" "${hostname}/_up" 2>/dev/null | grep -q '"status":"ok"'; do
    sleep 2
done

cluster_status="$(curl -sS -o /tmp/cluster-setup-response -w '%{http_code}' -X POST "${hostname}/_cluster_setup" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"enable_single_node\",\"username\":\"${username}\",\"password\":\"${password}\",\"bind_address\":\"0.0.0.0\",\"port\":5984,\"singlenode\":true}" \
    --user "${username}:${password}")"

case "${cluster_status}" in
    200|201) ;;
    400)
        curl -sf --user "${username}:${password}" "${hostname}/_membership" | grep -q '"all_nodes"'
        ;;
    *)
        echo "CouchDB single-node setup failed with HTTP ${cluster_status}." >&2
        cat /tmp/cluster-setup-response >&2
        exit 1
        ;;
esac

put_config() {
    section="$1"
    key="$2"
    value="$3"
    curl -sf -X PUT "${hostname}/_node/${node}/_config/${section}/${key}" \
        -H "Content-Type: application/json" \
        -d "${value}" \
        --user "${username}:${password}" >/dev/null
}

put_config chttpd require_valid_user '"true"'
put_config chttpd_auth require_valid_user '"true"'
put_config httpd WWW-Authenticate '"Basic realm=\"couchdb\""'
put_config httpd enable_cors '"true"'
put_config chttpd enable_cors '"true"'
put_config chttpd max_http_request_size '"4294967296"'
put_config couchdb max_document_size '"50000000"'
put_config cors credentials '"true"'
put_config cors origins '"app://obsidian.md,capacitor://localhost,http://localhost"'

status="$(curl -sS -o /dev/null -w '%{http_code}' --user "${username}:${password}" "${hostname}/${db}")"
if [ "${status}" != "200" ]; then
    curl -sf -X PUT "${hostname}/${db}" --user "${username}:${password}" >/dev/null
fi

echo "CouchDB provisioning completed."
