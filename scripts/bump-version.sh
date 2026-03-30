#!/bin/bash
# bump-version.sh — record a release event in Supabase, rewrite version strings
# in all HTML files, and write version.json.
#
# Called by CI (GitHub Action) on every push to main.
# Idempotent per push SHA: repeated runs return the same sequence number.
#
# Usage:  ./scripts/bump-version.sh [--model CODE] [--source SRC]

set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────
json_esc() { printf "%s" "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# ── parse args / env ─────────────────────────────────────────────────
MODEL="${AAP_MODEL_CODE:-}"
SOURCE="${RELEASE_SOURCE:-}"
PUSH_SHA="${RELEASE_PUSH_SHA:-}"
ACTOR="${RELEASE_ACTOR_LOGIN:-}"
BRANCH="${RELEASE_BRANCH:-}"
FROM_SHA="${RELEASE_COMPARE_FROM_SHA:-}"
TO_SHA="${RELEASE_COMPARE_TO_SHA:-}"
PUSHED_AT="${RELEASE_PUSHED_AT:-}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --model)  MODEL="$2";  shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    *) echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

# ── resolve Supabase REST API (optional — offline mode if no URL) ────
SB_URL="${SUPABASE_URL:-}"
SB_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
OFFLINE_MODE=false

if [ -z "$SB_URL" ] || [ -z "$SB_KEY" ]; then
  OFFLINE_MODE=true
  echo "INFO: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — running in offline mode (no DB recording)"
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# ── defaults from git / env ──────────────────────────────────────────
[ -z "$PUSH_SHA" ]  && PUSH_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
[ -z "$TO_SHA" ]    && TO_SHA="$PUSH_SHA"
[ -z "$BRANCH" ]    && BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
[ -z "$ACTOR" ]     && ACTOR=$(git log -1 --pretty='%an' 2>/dev/null || echo "${USER:-unknown}")
[ -z "$SOURCE" ]    && SOURCE="local-script"
[ -z "$PUSHED_AT" ] && PUSHED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -z "$MODEL" ]; then
  case "$BRANCH" in
    claude/*) MODEL="claude" ;; gemini/*) MODEL="gemini" ;;
    gpt/*)    MODEL="gpt" ;;    cursor/*) MODEL="cursor" ;;
    *)        MODEL="cur" ;;
  esac
fi

# Machine name
MACHINE="${AAP_MACHINE_NAME:-}"
[ -z "$MACHINE" ] && [ -f "$PROJECT_ROOT/.machine-name" ] && MACHINE=$(head -1 "$PROJECT_ROOT/.machine-name" | tr -d '\r')
[ -z "$MACHINE" ] && command -v scutil >/dev/null 2>&1 && MACHINE=$(scutil --get ComputerName 2>/dev/null || true)
[ -z "$MACHINE" ] && MACHINE=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo "unknown")

# ── gather commits in the push range ─────────────────────────────────
RANGE=""
if [ -n "$FROM_SHA" ] && [ "$FROM_SHA" != "0000000000000000000000000000000000000000" ]; then
  RANGE="$FROM_SHA..$TO_SHA"
elif [ -n "$TO_SHA" ]; then
  RANGE="$TO_SHA~1..$TO_SHA"
fi

COMMITS_JSON="[]"
COMMITS_FOR_DB="[]"
if [ -n "$RANGE" ]; then
  LOG=$(git log --reverse --pretty=format:'%H%x09%h%x09%an%x09%ae%x09%cI%x09%s' "$RANGE" 2>/dev/null || true)
  if [ -n "$LOG" ]; then
    DB_ENTRIES=""
    VJ_ENTRIES=""
    while IFS=$'\t' read -r sha short aname aemail cat subj; do
      [ -z "$sha" ] && continue
      # For version.json (simple)
      [ -n "$VJ_ENTRIES" ] && VJ_ENTRIES="$VJ_ENTRIES,"
      VJ_ENTRIES="$VJ_ENTRIES{\"sha\":\"$(json_esc "$short")\",\"message\":\"$(json_esc "$subj")\",\"author\":\"$(json_esc "$aname")\"}"
      # For DB (full)
      [ -n "$DB_ENTRIES" ] && DB_ENTRIES="$DB_ENTRIES,"
      DB_ENTRIES="$DB_ENTRIES{\"sha\":\"$(json_esc "$sha")\",\"short\":\"$(json_esc "$short")\",\"author_name\":\"$(json_esc "$aname")\",\"author_email\":\"$(json_esc "$aemail")\",\"committed_at\":\"$(json_esc "$cat")\",\"message\":\"$(json_esc "$subj")\"}"
    done <<< "$LOG"
    [ -n "$VJ_ENTRIES" ] && COMMITS_JSON="[$VJ_ENTRIES]"
    [ -n "$DB_ENTRIES" ] && COMMITS_FOR_DB="[$DB_ENTRIES]"
  fi
fi

COMMIT_COUNT=$(echo "$COMMITS_FOR_DB" | python3 -c "import sys,json;print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo 0)

# ── helper: call Supabase REST API RPC ───────────────────────────────
sb_rpc() {
  local func_name="$1"
  local payload="$2"
  curl -sf -X POST "${SB_URL}/rest/v1/rpc/${func_name}" \
    -H "apikey: ${SB_KEY}" \
    -H "Authorization: Bearer ${SB_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$payload"
}

# ── helper: PATCH a table via Supabase REST API ──────────────────────
sb_patch() {
  local table="$1"
  local filter="$2"
  local payload="$3"
  curl -sf -X PATCH "${SB_URL}/rest/v1/${table}?${filter}" \
    -H "apikey: ${SB_KEY}" \
    -H "Authorization: Bearer ${SB_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$payload"
}

# ── 1) record release event ──────────────────────────────────────────
if [ "$OFFLINE_MODE" = true ]; then
  # Offline: generate version locally from date + sequence
  TODAY=$(date -u +"%y%m%d")
  # Read current version to determine sequence
  CURRENT_VER=""
  [ -f "$PROJECT_ROOT/version.json" ] && CURRENT_VER=$(python3 -c "import json;print(json.load(open('$PROJECT_ROOT/version.json')).get('version',''))" 2>/dev/null || true)
  CURRENT_DATE=$(echo "$CURRENT_VER" | grep -o 'v[0-9]\{6\}' | sed 's/v//' || true)
  CURRENT_SEQ=$(echo "$CURRENT_VER" | grep -o '\.[0-9]\{2\}' | sed 's/\.//' || echo "00")
  if [ "$CURRENT_DATE" = "$TODAY" ]; then
    SEQ=$((10#$CURRENT_SEQ + 1))
  else
    SEQ=1
  fi
  SEQ_PAD=$(printf "%02d" "$SEQ")
  HOUR=$(date -u +"%l" | tr -d ' ')
  MIN=$(date -u +"%M")
  AMPM=$(date -u +"%p" | tr '[:upper:]' '[:lower:]' | head -c1)
  VER="v${TODAY}.${SEQ_PAD} ${HOUR}:${MIN}${AMPM}"
  R_AT="$PUSHED_AT"
  R_ACT="$ACTOR"
  R_SRC="$SOURCE"
else
  # Online: record via Supabase REST API
  META=$(python3 -c "
import json, sys
print(json.dumps({
  'workflow': 'bump-version.sh',
  'commit_count': $COMMIT_COUNT,
  'commit_summaries': json.loads('''$COMMITS_FOR_DB''')
}))
" 2>/dev/null || echo '{}')

  RPC_PAYLOAD=$(python3 -c "
import json
payload = {
  'p_push_sha': '''$(json_esc "$PUSH_SHA")''',
  'p_branch': '''$(json_esc "$BRANCH")''',
  'p_from_sha': '''$(json_esc "$FROM_SHA")''' or None,
  'p_to_sha': '''$(json_esc "$TO_SHA")''' or None,
  'p_pushed_at': '''$(json_esc "$PUSHED_AT")''',
  'p_actor_login': '''$(json_esc "$ACTOR")''',
  'p_actor_name': None,
  'p_source': '''$(json_esc "$SOURCE")''',
  'p_model_code': '''$(json_esc "$MODEL")''' or None,
  'p_machine_name': '''$(json_esc "$MACHINE")''' or None,
  'p_meta': json.loads('''$META''') if '''$META''' != '{}' else {},
  'p_commits': json.loads('''$COMMITS_FOR_DB''')
}
print(json.dumps(payload))
")

  ROW=$(sb_rpc "record_release_event" "$RPC_PAYLOAD")

  [ -z "$ROW" ] && { echo "ERROR: Failed to record release event" >&2; exit 1; }

  # Parse the response — RPC returns a single row or array with one element
  SEQ=$(echo "$ROW" | python3 -c "import sys,json; r=json.loads(sys.stdin.read()); r=r[0] if isinstance(r,list) else r; print(r.get('seq',''))" 2>/dev/null || echo "")
  VER=$(echo "$ROW" | python3 -c "import sys,json; r=json.loads(sys.stdin.read()); r=r[0] if isinstance(r,list) else r; print(r.get('display_version',''))" 2>/dev/null || echo "")
  R_AT=$(echo "$ROW" | python3 -c "import sys,json; r=json.loads(sys.stdin.read()); r=r[0] if isinstance(r,list) else r; print(r.get('pushed_at',''))" 2>/dev/null || echo "")
  R_ACT=$(echo "$ROW" | python3 -c "import sys,json; r=json.loads(sys.stdin.read()); r=r[0] if isinstance(r,list) else r; print(r.get('actor_login',''))" 2>/dev/null || echo "")
  R_SRC=$(echo "$ROW" | python3 -c "import sys,json; r=json.loads(sys.stdin.read()); r=r[0] if isinstance(r,list) else r; print(r.get('source',''))" 2>/dev/null || echo "")
  [ -z "$R_AT" ]  && R_AT="$PUSHED_AT"
  [ -z "$R_ACT" ] && R_ACT="$ACTOR"
  [ -z "$R_SRC" ] && R_SRC="$SOURCE"

  # Keep legacy site_config in sync
  sb_patch "site_config" "id=eq.1" "{\"version\":\"$(json_esc "$VER")\"}" 2>/dev/null || true

  # Backfill deployed_version for feature requests whose commit is in this push
  if [ -n "$COMMITS_FOR_DB" ] && [ "$COMMITS_FOR_DB" != "[]" ]; then
    SHAS=$(echo "$COMMITS_FOR_DB" | python3 -c "
import sys, json
commits = json.loads(sys.stdin.read())
for c in commits:
    print(c['sha'])
" 2>/dev/null || true)
    if [ -n "$SHAS" ]; then
      while IFS= read -r sha; do
        [ -z "$sha" ] && continue
        sb_patch "feature_requests" "commit_sha=eq.${sha}&deployed_version=is.null" \
          "{\"deployed_version\":\"$(json_esc "$VER")\",\"status\":\"completed\"}" 2>/dev/null || true
      done <<< "$SHAS"
    fi
  fi
fi

# ── 2) rewrite version string in all HTML files ─────────────────────
# Strategy: target spans by attribute/class name (robust even if content is empty).
IS_GNU=false; sed --version 2>/dev/null | grep -q 'GNU' && IS_GNU=true

do_sed() {
  if [ "$IS_GNU" = true ]; then
    sed -i "$1" "$2"
  else
    sed -i '' "$1" "$2"
  fi
}

find . -name "*.html" -not -path "./.git/*" | while read -r f; do
  changed=false
  # 1) data-site-version spans: replace content between > and </
  if grep -q 'data-site-version' "$f"; then
    do_sed "s/\(data-site-version[^>]*>\)[^<]*/\1$VER/" "$f"
    changed=true
  fi
  # 2) site-nav__version spans: replace content between > and </
  if grep -q 'site-nav__version' "$f"; then
    do_sed "s/\(site-nav__version[^>]*>\)[^<]*/\1$VER/" "$f"
    changed=true
  fi
  # 3) Fallback: pattern-match any remaining version strings (v or r format)
  if grep -q '\(v[0-9]\{6\}\.[0-9]\{2\}\|r[0-9]\{9\}\)' "$f"; then
    PAT='\(v[0-9]\{6\}\.[0-9]\{2\}\( [0-9]\{1,2\}:[0-9]\{2\}[ap]\)\{0,1\}\|r[0-9]\{9\}\)'
    do_sed "s/$PAT/$VER/g" "$f"
    changed=true
  fi
done

# ── 3) write version.json ────────────────────────────────────────────
cat > "$PROJECT_ROOT/version.json" << ENDJSON
{
  "version": "$(json_esc "$VER")",
  "release": $SEQ,
  "sha": "$(json_esc "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)")",
  "fullSha": "$(json_esc "$(git rev-parse HEAD 2>/dev/null || echo unknown)")",
  "actor": "$(json_esc "$R_ACT")",
  "source": "$(json_esc "$R_SRC")",
  "model": "$(json_esc "$MODEL")",
  "machine": "$(json_esc "$MACHINE")",
  "pushedAt": "$(json_esc "$R_AT")",
  "commits": $COMMITS_JSON
}
ENDJSON

# ── 4) output ────────────────────────────────────────────────────────
echo "$VER  [$MODEL]"
