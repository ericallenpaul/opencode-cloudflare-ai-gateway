#!/usr/bin/env bash
#
# verify-models.sh
#
# Reads an opencode.json configuration, probes configured gateway models, and
# writes Markdown + JSON reports. Local providers such as LM Studio are skipped
# by default because they are optional and hardware-dependent, not required setup.
#
# Requires: bash 4+, jq, curl. Optional: python3 (for millisecond-precision
# latency on systems whose date(1) doesn't support %N).
#
# Equivalent to scripts/verify-models.ps1 for non-Windows hosts.

set -euo pipefail

# ------------------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------------------

CONFIG_PATH="${HOME}/.config/opencode/opencode.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR"
PROMPT="Reply with exactly: VERIFY OK"
TIMEOUT_SEC=60
INCLUDE_LOCAL=false

usage() {
  cat <<EOF
verify-models.sh -- probe configured gateway models in opencode.json

Usage: $0 [options]

Options:
  -c, --config PATH       Path to opencode.json
                          (default: \$HOME/.config/opencode/opencode.json)
  -o, --output-dir DIR    Where to write reports (default: this script's directory)
  -p, --prompt TEXT       Test prompt (default: "Reply with exactly: VERIFY OK")
  -t, --timeout SEC       Per-request timeout in seconds (default: 60)
      --include-local     Also probe local OpenAI-compatible providers such as LM Studio
  -h, --help              Show this help and exit

Required env vars (must be set BEFORE running):
  CF_ACCOUNT_ID    Your 32-char Cloudflare account ID
  CF_GATEWAY_NAME  The slug of your AI Gateway
  CF_AIG_TOKEN     The Authenticated Gateway token from your gateway settings
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--config) CONFIG_PATH="$2"; shift 2 ;;
    -o|--output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    -p|--prompt) PROMPT="$2"; shift 2 ;;
    -t|--timeout) TIMEOUT_SEC="$2"; shift 2 ;;
    --include-local) INCLUDE_LOCAL=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# ------------------------------------------------------------------------------
# Dependency + env checks
# ------------------------------------------------------------------------------

require() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
require jq
require curl

: "${CF_ACCOUNT_ID:?Missing required env var: CF_ACCOUNT_ID}"
: "${CF_GATEWAY_NAME:?Missing required env var: CF_GATEWAY_NAME}"
: "${CF_AIG_TOKEN:?Missing required env var: CF_AIG_TOKEN}"

[[ -f "$CONFIG_PATH" ]] || { echo "Config not found: $CONFIG_PATH" >&2; exit 1; }
mkdir -p "$OUTPUT_DIR"

# Color helpers — only emit ANSI codes if stdout is a terminal
if [[ -t 1 ]]; then
  C_GREEN='\033[32m'; C_RED='\033[31m'; C_YELLOW='\033[33m'; C_CYAN='\033[36m'; C_RESET='\033[0m'
else
  C_GREEN=''; C_RED=''; C_YELLOW=''; C_CYAN=''; C_RESET=''
fi

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

# Substitute {env:NAME} tokens in a value. Recognized: CF_ACCOUNT_ID,
# CF_GATEWAY_NAME, CF_AIG_TOKEN.
resolve_env() {
  local s="$1"
  s="${s//\{env:CF_ACCOUNT_ID\}/$CF_ACCOUNT_ID}"
  s="${s//\{env:CF_GATEWAY_NAME\}/$CF_GATEWAY_NAME}"
  s="${s//\{env:CF_AIG_TOKEN\}/$CF_AIG_TOKEN}"
  printf '%s' "$s"
}

# Replace sensitive identifiers with placeholders so reports are safe to share.
sanitize() {
  local s="$1"
  s="${s//$CF_ACCOUNT_ID/<account-id>}"
  s="${s//$CF_GATEWAY_NAME/<gateway>}"
  s="${s//$CF_AIG_TOKEN/<aig-token>}"
  printf '%s' "$s"
}

# Millisecond-precision timestamp.
# Uses GNU date's %N nanoseconds when available (Linux, Git Bash on Windows).
# Falls back to perl, then seconds-precision. macOS default date(1) lacks %N;
# install coreutils or perl for ms precision there.
now_ms() {
  local n
  n=$(date +%N 2>/dev/null)
  if [[ "$n" =~ ^[0-9]+$ ]]; then
    # 10# forces base-10 parsing so leading zeros don't trigger octal interpretation
    echo $(( ($(date +%s) * 1000) + 10#$n / 1000000 ))
  elif command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes=time -e 'printf("%d\n", time()*1000)'
  else
    echo $(( $(date +%s) * 1000 ))
  fi
}

# Probe one model. Args:
#   $1 provider key
#   $2 model key
#   $3 fully-resolved request URL
#   $4 JSON request body
#   $5 (optional) anthropic-version header value, "" for none
# Emits a JSON object on stdout describing the result.
probe_model() {
  local provider="$1" model="$2" url="$3" body="$4" anthropic_version="${5:-}"

  local resp_file
  resp_file=$(mktemp)
  trap 'rm -f "$resp_file"' RETURN

  local headers=(-H "Authorization: Bearer ${CF_AIG_TOKEN}" -H "Content-Type: application/json")
  if [[ -n "$anthropic_version" ]]; then
    headers+=(-H "anthropic-version: $anthropic_version")
  fi

  local start_ms end_ms latency http_code body_resp
  start_ms=$(now_ms)

  http_code=$(curl -sS -o "$resp_file" -w "%{http_code}" -X POST "$url" \
    "${headers[@]}" \
    --max-time "$TIMEOUT_SEC" \
    -d "$body" 2>/dev/null) || http_code="000"

  end_ms=$(now_ms)
  latency=$((end_ms - start_ms))
  body_resp=$(cat "$resp_file" 2>/dev/null || echo "")

  if [[ "$http_code" =~ ^2 ]]; then
    local text
    text=$(printf '%s' "$body_resp" | jq -r '
      .choices[0].message.content //
      .content[0].text //
      .candidates[0].content.parts[0].text //
      "(empty response — reasoning model may need higher token budget)"
    ' 2>/dev/null || printf '(parse error)')
    # Trim and cap length so the report table stays readable
    text=$(printf '%s' "$text" | tr '\n' ' ' | sed 's/  */ /g')
    if [[ ${#text} -gt 120 ]]; then text="${text:0:120}..."; fi

    jq -n \
      --arg provider "$provider" \
      --arg model    "$model" \
      --argjson latency "$latency" \
      --arg response "$text" \
      --arg url      "$url" \
      '{provider:$provider, model:$model, status:"PASS",
        latency_ms:$latency, response:$response,
        actual_model:null, error:null, request_url:$url}'
  else
    local err="$body_resp"
    err=$(printf '%s' "$err" | tr '\n' ' ' | sed 's/  */ /g')
    if [[ ${#err} -gt 400 ]]; then err="${err:0:400}..."; fi

    jq -n \
      --arg provider "$provider" \
      --arg model    "$model" \
      --argjson latency "$latency" \
      --arg error    "$err" \
      --arg url      "$url" \
      '{provider:$provider, model:$model, status:"FAIL",
        latency_ms:$latency, response:null,
        actual_model:null, error:$error, request_url:$url}'
  fi
}

# ------------------------------------------------------------------------------
# Run probes
# ------------------------------------------------------------------------------

printf '\n%bopencode-cloudflare-ai-gateway :: verify-models%b\n' "$C_CYAN" "$C_RESET"
echo "Config:       $CONFIG_PATH"
echo "Account ID:   ${CF_ACCOUNT_ID:0:8}..."
echo "Gateway:      $CF_GATEWAY_NAME"
echo

results_file=$(mktemp)
trap 'rm -f "$results_file"' EXIT
echo "[]" > "$results_file"

append_result() {
  local r="$1"
  jq --argjson item "$r" '. + [$item]' "$results_file" > "${results_file}.tmp"
  mv "${results_file}.tmp" "$results_file"
}

# Iterate providers
while IFS= read -r provider_key; do
  provider_key="${provider_key%$'\r'}"   # defend against CRLF from jq on Windows
  [[ -z "$provider_key" ]] && continue
  provider_display=$(jq -r --arg k "$provider_key" '.provider[$k].name // $k' "$CONFIG_PATH" | tr -d '\r')
  npm=$(jq -r --arg k "$provider_key" '.provider[$k].npm // ""' "$CONFIG_PATH" | tr -d '\r')
  base_url_raw=$(jq -r --arg k "$provider_key" '.provider[$k].options.baseURL // ""' "$CONFIG_PATH" | tr -d '\r')
  base_url=$(resolve_env "$base_url_raw")

  is_local=false
  if [[ "$base_url" =~ localhost|127\.0\.0\.1 ]]; then is_local=true; fi

  printf '%bProvider: %s (%s)%b\n' "$C_CYAN" "$provider_key" "$provider_display" "$C_RESET"

  while IFS= read -r model_key; do
    model_key="${model_key%$'\r'}"   # defend against CRLF from jq on Windows
    [[ -z "$model_key" ]] && continue
    printf '  %s/%s ... ' "$provider_key" "$model_key"

    if $is_local; then
      if ! $INCLUDE_LOCAL; then
        echo "SKIP"
        r=$(jq -n --arg p "$provider_key" --arg m "$model_key" --arg u "$base_url" \
          '{provider:$p, model:$m, status:"SKIP", latency_ms:0,
            response:"skipped local provider; pass --include-local to probe", actual_model:null, error:null, request_url:$u}')
        append_result "$r"
        continue
      fi
      url="${base_url}/chat/completions"
      body=$(jq -n --arg m "$model_key" --arg p "$PROMPT" \
        '{model:$m, messages:[{role:"user", content:$p}], stream:false}')
      r=$(probe_model "$provider_key" "$model_key" "$url" "$body")
    elif [[ "$npm" == "@ai-sdk/anthropic" ]]; then
      url="${base_url}/v1/messages"
      body=$(jq -n --arg m "$model_key" --arg p "$PROMPT" \
        '{model:$m, max_tokens:30, messages:[{role:"user", content:$p}]}')
      r=$(probe_model "$provider_key" "$model_key" "$url" "$body" "2023-06-01")
    elif [[ "$npm" == "@ai-sdk/openai" ]]; then
      url="${base_url}/chat/completions"
      # gpt-5 family and o-series reasoning models require max_completion_tokens
      if [[ "$model_key" =~ ^(gpt-5|o1|o3|o4) ]]; then
        body=$(jq -n --arg m "$model_key" --arg p "$PROMPT" \
          '{model:$m, max_completion_tokens:256, messages:[{role:"user", content:$p}]}')
      else
        body=$(jq -n --arg m "$model_key" --arg p "$PROMPT" \
          '{model:$m, max_tokens:30, messages:[{role:"user", content:$p}]}')
      fi
      r=$(probe_model "$provider_key" "$model_key" "$url" "$body")
    elif [[ "$npm" == "@ai-sdk/google" ]]; then
      # Google AI Studio openai-compatible endpoint sits under the v1beta path
      url="${base_url}/openai/chat/completions"
      body=$(jq -n --arg m "$model_key" --arg p "$PROMPT" \
        '{model:$m, max_tokens:30, messages:[{role:"user", content:$p}]}')
      r=$(probe_model "$provider_key" "$model_key" "$url" "$body")
    else
      # @ai-sdk/openai-compatible or anything else — assume OpenAI Chat Completions shape
      url="${base_url}/chat/completions"
      body=$(jq -n --arg m "$model_key" --arg p "$PROMPT" \
        '{model:$m, max_tokens:30, messages:[{role:"user", content:$p}]}')
      r=$(probe_model "$provider_key" "$model_key" "$url" "$body")
    fi

    status=$(printf '%s' "$r" | jq -r '.status')
    latency=$(printf '%s' "$r" | jq -r '.latency_ms')
    case "$status" in
      PASS) printf '%bPASS%b (%sms)\n' "$C_GREEN" "$C_RESET" "$latency" ;;
      FAIL) printf '%bFAIL%b (%sms)\n' "$C_RED"   "$C_RESET" "$latency" ;;
      *)    printf '%s\n' "$status" ;;
    esac
    append_result "$r"
  done < <(jq -r --arg k "$provider_key" '.provider[$k].models | keys[]' "$CONFIG_PATH")

  echo
done < <(jq -r '.provider | keys[]' "$CONFIG_PATH")

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------

pass=$(jq '[.[] | select(.status=="PASS")] | length' "$results_file")
fail=$(jq '[.[] | select(.status=="FAIL")] | length' "$results_file")
skip=$(jq '[.[] | select(.status=="SKIP")] | length' "$results_file")
total=$(jq 'length' "$results_file")

summary_color="$C_GREEN"
[[ "$fail" -gt 0 ]] && summary_color="$C_YELLOW"
printf '%bSummary: %s passed, %s failed, %s skipped (of %s total)%b\n\n' \
  "$summary_color" "$pass" "$fail" "$skip" "$total" "$C_RESET"

# ------------------------------------------------------------------------------
# Write reports
# ------------------------------------------------------------------------------

timestamp=$(date +%Y%m%d-%H%M%S)
md_path="$OUTPUT_DIR/verify-models-$timestamp.md"
json_path="$OUTPUT_DIR/verify-models-$timestamp.json"

# --- Markdown ---
{
  echo "# Model verification report"
  echo
  echo "- **Generated:** $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "- **Config:** \`$CONFIG_PATH\`"
  echo "- **Gateway:** \`$CF_GATEWAY_NAME\`"
  echo "- **Result:** $pass passed, $fail failed, $skip skipped (of $total total)"
  echo
  echo "## Results"
  echo
  echo "| Provider | Model | Status | Latency | Response / Error |"
  echo "|---|---|---|---|---|"
  jq -r '
    .[] |
    if .status == "PASS" then
      "| \(.provider) | `\(.model)` | PASS | \(.latency_ms)ms | \((.response // "") | gsub("\\|"; "\\\\|") | gsub("\n"; " ")) |"
    elif .status == "SKIP" then
      "| \(.provider) | `\(.model)` | SKIP | \(.latency_ms)ms | (skipped) |"
    else
      "| \(.provider) | `\(.model)` | FAIL | \(.latency_ms)ms | \((.error // "") | gsub("\\|"; "\\\\|") | gsub("\n"; " ")) |"
    end
  ' "$results_file"

  if [[ "$fail" -gt 0 ]]; then
    echo
    echo "## Failures"
    echo
    echo "Feed the JSON report (\`verify-models-$timestamp.json\`) to an AI assistant for help diagnosing. Common causes:"
    echo
    echo "- **HTTP 400 code 2001** — gateway slug typo OR provider lacks BYOK keys in dashboard"
    echo "- **HTTP 400 code 2019** — model name format issue (compat endpoint needs prefixes; per-provider endpoints want bare names)"
    echo "- **HTTP 401** — auth header issue; verify \`CF_AIG_TOKEN\` is fresh and gateway has Authenticated Gateway enabled"
    echo "- **HTTP 404 / model_not_found** — model name typo or model not accessible from your account"
    echo "- **HTTP 429** — provider rate-limit or billing issue (e.g. depleted prepayment credits)"
    echo "- **Connection refused on local provider** -- start LM Studio's local server, or ignore it if local models are not part of your setup"
    echo
    echo "> URLs and identifiers below have been sanitized for safe sharing."

    while IFS= read -r line; do
      sanitize "$line"
      echo
    done < <(jq -r '
      .[] | select(.status=="FAIL") |
      "\n### `\(.provider)/\(.model)`\n\n- **URL:** `\(.request_url)`\n- **Error:** \(.error)"
    ' "$results_file")
  fi
} > "$md_path"

# --- JSON ---
sanitized=$(jq --arg acct "$CF_ACCOUNT_ID" --arg gw "$CF_GATEWAY_NAME" --arg tok "$CF_AIG_TOKEN" '
  map(. + {
    request_url: (.request_url // "" | gsub($acct; "<account-id>") | gsub($gw; "<gateway>") | gsub($tok; "<aig-token>")),
    error: (if .error then (.error | gsub($acct; "<account-id>") | gsub($gw; "<gateway>") | gsub($tok; "<aig-token>")) else null end)
  })
' "$results_file")

jq -n \
  --arg gen "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg cp  "$CONFIG_PATH" \
  --argjson total "$total" \
  --argjson pass  "$pass" \
  --argjson fail  "$fail" \
  --argjson skip  "$skip" \
  --argjson results "$sanitized" \
  '{
    generated_at: $gen,
    config_path:  $cp,
    gateway_name: "<gateway>",
    account_id:   "<account-id>",
    summary: { total: $total, passed: $pass, failed: $fail, skipped: $skip },
    results: $results
  }' > "$json_path"

echo "Reports written:"
echo "  $md_path"
echo "  $json_path"
echo

if [[ "$fail" -gt 0 ]]; then
  printf '%bSome models failed. Hand the JSON report to your AI assistant:%b\n' "$C_YELLOW" "$C_RESET"
  echo "  @$json_path"
  echo
  exit 1
fi

exit 0
