#!/usr/bin/env bash
#
# check-setup.sh
#
# Diagnoses whether this machine is correctly set up to use
# opencode-cloudflare-ai-gateway. Runs 12 checks (9 required, 3 optional)
# and prints a per-check result line plus a summary.
#
# Pure diagnostic by default -- no side effects. Pass --install-config to
# copy opencode.example.json into place when check 7 (opencode.json exists) fails.
#
# Equivalent to scripts/check-setup.ps1 for Windows hosts.
#
# Requires: bash 4+, jq (for check 9 JSON parsing).

set -uo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

INSTALL_CONFIG=false

usage() {
  cat <<EOF
check-setup.sh -- diagnose opencode-cloudflare-ai-gateway prerequisites

Usage: $0 [--install-config] [-h|--help]

  --install-config   If opencode.json is missing, copy opencode.example.json
                     into ~/.config/opencode/opencode.json. The only side
                     effect this script can produce.
  -h, --help         Show this help and exit.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-config) INSTALL_CONFIG=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Color helpers -- only emit ANSI codes when stdout is a terminal
# ---------------------------------------------------------------------------

if [[ -t 1 ]]; then
  C_GREEN='\033[32m'
  C_RED='\033[31m'
  C_YELLOW='\033[33m'
  C_RESET='\033[0m'
else
  C_GREEN=''
  C_RED=''
  C_YELLOW=''
  C_RESET=''
fi

pass_line()  { printf "${C_GREEN}%s${C_RESET}\n" "$1"; }
fail_line()  { printf "${C_RED}%s${C_RESET}\n"   "$1"; }
warn_line()  { printf "${C_YELLOW}%s${C_RESET}\n" "$1"; }
info_line()  { printf '%s\n' "$1"; }
pass_msg()   { printf "${C_GREEN}%s${C_RESET}\n" "$1"; }
fail_msg()   { printf "${C_RED}%s${C_RESET}\n"   "$1"; }
warn_msg()   { printf "${C_YELLOW}%s${C_RESET}\n" "$1"; }

# ---------------------------------------------------------------------------
# Path constants
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOME_DIR="$HOME"
CONFIG_DIR="$HOME_DIR/.config/opencode"
CONFIG_FILE="$CONFIG_DIR/opencode.json"
EXAMPLE_CFG="$REPO_ROOT/opencode.example.json"

TOTAL_CHECKS=12

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------
# Parallel arrays: indexes, labels, passed (0/1), optional (0/1), details, fix hints

declare -a RES_INDEX=()
declare -a RES_LABEL=()
declare -a RES_PASSED=()
declare -a RES_OPTIONAL=()
declare -a RES_DETAIL=()

add_result() {
  local idx="$1" label="$2" passed="$3" optional="$4" detail="$5"
  RES_INDEX+=("$idx")
  RES_LABEL+=("$label")
  RES_PASSED+=("$passed")
  RES_OPTIONAL+=("$optional")
  RES_DETAIL+=("$detail")
}

# ---------------------------------------------------------------------------
# Formatting helper
# ---------------------------------------------------------------------------

format_check_line() {
  # $1=idx, $2=label, $3=status, $4=opt_tag (optional, or "")
  local idx="$1" label="$2" status="$3" opt_tag="${4:-}"
  local prefix
  printf -v prefix "[%2d/%d]" "$idx" "$TOTAL_CHECKS"
  local combined="$label "
  local combined_len=${#combined}
  local dot_count=$(( 52 - combined_len ))
  [[ $dot_count -lt 1 ]] && dot_count=1
  local dots
  printf -v dots '%*s' "$dot_count" ''
  dots="${dots// /.}"
  local opt_suffix=""
  [[ -n "$opt_tag" ]] && opt_suffix="  (optional)"
  printf '%s %s%s %s%s' "$prefix" "$combined" "$dots" "$status" "$opt_suffix"
}

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

info_line ""
info_line "opencode-cloudflare-ai-gateway :: check-setup"
info_line "Repo:   $REPO_ROOT"
info_line "Config: $CONFIG_FILE"
info_line ""

# ---------------------------------------------------------------------------
# Check 1 -- OpenCode CLI on PATH
# ---------------------------------------------------------------------------

idx=1
label="OpenCode CLI on PATH"
if oc_ver=$(opencode --version 2>&1); then
  oc_ver="$(printf '%s' "$oc_ver" | tr -d '\r\n')"
  line="$(format_check_line "$idx" "$label" "PASS ($oc_ver)")"
  pass_line "$line"
  add_result "$idx" "$label" 1 0 "$oc_ver"
else
  line="$(format_check_line "$idx" "$label" "FAIL")"
  fail_line "$line"
  info_line "        Fix: install OpenCode -- see https://opencode.ai"
  info_line "        See docs/SETUP.md section 1."
  add_result "$idx" "$label" 0 0 "not found on PATH"
fi

# ---------------------------------------------------------------------------
# Check 2 -- Node.js >= 18
# ---------------------------------------------------------------------------

idx=2
label="Node.js >= 18"
if node_ver=$(node --version 2>&1); then
  node_ver="$(printf '%s' "$node_ver" | tr -d '\r\n')"
  major="${node_ver#v}"
  major="${major%%.*}"
  if [[ "$major" =~ ^[0-9]+$ ]] && [[ "$major" -ge 18 ]]; then
    line="$(format_check_line "$idx" "$label" "PASS ($node_ver)")"
    pass_line "$line"
    add_result "$idx" "$label" 1 0 "$node_ver"
  else
    line="$(format_check_line "$idx" "$label" "FAIL (found $node_ver, need >= 18)")"
    fail_line "$line"
    info_line "        Fix: upgrade Node.js to >= 18 -- https://nodejs.org"
    add_result "$idx" "$label" 0 0 "found $node_ver, need >= 18"
  fi
else
  line="$(format_check_line "$idx" "$label" "FAIL (not found)")"
  fail_line "$line"
  info_line "        Fix: install Node.js >= 18 -- https://nodejs.org"
  add_result "$idx" "$label" 0 0 "not found on PATH"
fi

# ---------------------------------------------------------------------------
# Check 3 -- CF_ACCOUNT_ID
# ---------------------------------------------------------------------------

idx=3
label="CF_ACCOUNT_ID env var"
val="${CF_ACCOUNT_ID:-}"
if [[ -n "$val" ]]; then
  len=${#val}
  line="$(format_check_line "$idx" "$label" "PASS ($len chars)")"
  pass_line "$line"
  add_result "$idx" "$label" 1 0 "$len chars"
else
  line="$(format_check_line "$idx" "$label" "FAIL (unset)")"
  fail_line "$line"
  info_line "        Fix: set CF_ACCOUNT_ID to your Cloudflare account ID."
  info_line "          add to your shell rc: export CF_ACCOUNT_ID=<value>"
  info_line "        See docs/SETUP.md section 2."
  add_result "$idx" "$label" 0 0 "unset"
fi

# ---------------------------------------------------------------------------
# Check 4 -- CF_GATEWAY_NAME
# ---------------------------------------------------------------------------

idx=4
label="CF_GATEWAY_NAME env var"
val="${CF_GATEWAY_NAME:-}"
if [[ -n "$val" ]]; then
  len=${#val}
  line="$(format_check_line "$idx" "$label" "PASS ($len chars)")"
  pass_line "$line"
  add_result "$idx" "$label" 1 0 "$len chars"
else
  line="$(format_check_line "$idx" "$label" "FAIL (unset)")"
  fail_line "$line"
  info_line "        Fix: set CF_GATEWAY_NAME to your AI Gateway slug."
  info_line "          add to your shell rc: export CF_GATEWAY_NAME=<value>"
  info_line "        See docs/SETUP.md section 2."
  add_result "$idx" "$label" 0 0 "unset"
fi

# ---------------------------------------------------------------------------
# Check 5 -- CF_AIG_TOKEN (length only, never the value)
# ---------------------------------------------------------------------------

idx=5
label="CF_AIG_TOKEN env var"
val="${CF_AIG_TOKEN:-}"
if [[ -n "$val" ]]; then
  len=${#val}
  line="$(format_check_line "$idx" "$label" "PASS ($len chars)")"
  pass_line "$line"
  add_result "$idx" "$label" 1 0 "$len chars"
else
  line="$(format_check_line "$idx" "$label" "FAIL (unset)")"
  fail_line "$line"
  info_line "        Fix: set CF_AIG_TOKEN to your Authenticated Gateway token."
  info_line "          add to your shell rc: export CF_AIG_TOKEN=<value>"
  info_line "        See docs/SETUP.md section 2."
  add_result "$idx" "$label" 0 0 "unset"
fi

# ---------------------------------------------------------------------------
# Check 6 -- OPENCODE_EXPERIMENTAL_LSP_TOOL=true
# ---------------------------------------------------------------------------

idx=6
label="OPENCODE_EXPERIMENTAL_LSP_TOOL=true"
val="${OPENCODE_EXPERIMENTAL_LSP_TOOL:-}"
if [[ "$val" == "true" ]]; then
  line="$(format_check_line "$idx" "$label" "PASS")"
  pass_line "$line"
  add_result "$idx" "$label" 1 0 "true"
else
  if [[ -n "$val" ]]; then
    current="currently: '$val'"
  else
    current="currently: unset"
  fi
  line="$(format_check_line "$idx" "$label" "FAIL ($current)")"
  fail_line "$line"
  info_line "        Fix: set OPENCODE_EXPERIMENTAL_LSP_TOOL=true at user scope."
  info_line "          Windows:  [Environment]::SetEnvironmentVariable(\"OPENCODE_EXPERIMENTAL_LSP_TOOL\", \"true\", \"User\")"
  info_line "          Unix:     add to your shell rc: export OPENCODE_EXPERIMENTAL_LSP_TOOL=true"
  info_line "        See docs/SETUP.md section 3."
  add_result "$idx" "$label" 0 0 "$current"
fi

# ---------------------------------------------------------------------------
# Check 7 -- opencode.json exists
# ---------------------------------------------------------------------------

idx=7
label="opencode.json exists"
if [[ -f "$CONFIG_FILE" ]]; then
  config_exists=1
  line="$(format_check_line "$idx" "$label" "PASS ($CONFIG_FILE)")"
  pass_line "$line"
  add_result "$idx" "$label" 1 0 "$CONFIG_FILE"
else
  config_exists=0
  line="$(format_check_line "$idx" "$label" "FAIL (not found)")"
  fail_line "$line"
  info_line "        Fix: copy opencode.example.json from the repo root to $CONFIG_FILE"
  info_line "          or re-run with --install-config to do it automatically."
  info_line "        See docs/SETUP.md section 4."
  add_result "$idx" "$label" 0 0 "not found at $CONFIG_FILE"
fi

# ---------------------------------------------------------------------------
# Check 8 -- Superpowers plugin installed and wired up
# ---------------------------------------------------------------------------

idx=8
label="Superpowers plugin installed and wired up"
superpowers_dir="$CONFIG_DIR/node_modules/superpowers"

if [[ -d "$superpowers_dir" ]]; then
  dir_exists=1
else
  dir_exists=0
fi

plugin_wired=0
if [[ $config_exists -eq 1 ]] && command -v jq >/dev/null 2>&1; then
  # Check if any entry in the plugin array contains "superpowers"
  match=$(jq -r '(.plugin // [])[] | select(. | contains("superpowers"))' "$CONFIG_FILE" 2>/dev/null | head -1)
  [[ -n "$match" ]] && plugin_wired=1
fi

if [[ $dir_exists -eq 1 && $plugin_wired -eq 1 ]]; then
  line="$(format_check_line "$idx" "$label" "PASS")"
  pass_line "$line"
  add_result "$idx" "$label" 1 0 "dir present, wired in plugin array"
elif [[ $dir_exists -eq 1 && $plugin_wired -eq 0 ]]; then
  line="$(format_check_line "$idx" "$label" "FAIL (dir present, but not in plugin array)")"
  fail_line "$line"
  info_line "        Both the directory and the config wire-up are required."
  info_line '        Add this entry to the top-level "plugin" array in opencode.json:'
  info_line '          "plugin": ["~/.config/opencode/node_modules/superpowers"]'
  info_line "        See docs/SETUP.md section 5."
  add_result "$idx" "$label" 0 0 "dir present, not in plugin array"
elif [[ $dir_exists -eq 0 && $plugin_wired -eq 1 ]]; then
  line="$(format_check_line "$idx" "$label" "FAIL (in plugin array, but dir missing)")"
  fail_line "$line"
  info_line "        Both the directory and the config wire-up are required."
  info_line "        Install superpowers:"
  info_line "          cd ~/.config/opencode && npm install superpowers"
  info_line "        See docs/SETUP.md section 5."
  add_result "$idx" "$label" 0 0 "wired in config but dir missing"
else
  line="$(format_check_line "$idx" "$label" "FAIL (dir missing, not in plugin array)")"
  fail_line "$line"
  info_line "        Both the directory and the config wire-up are required."
  info_line "        1. Install: cd ~/.config/opencode && npm install superpowers"
  info_line '        2. Add to the top-level "plugin" array in opencode.json:'
  info_line '             "plugin": ["~/.config/opencode/node_modules/superpowers"]'
  info_line "        See docs/SETUP.md section 5."
  add_result "$idx" "$label" 0 0 "dir missing, not in plugin array"
fi

# ---------------------------------------------------------------------------
# Check 9 -- MCP servers in opencode.json
# ---------------------------------------------------------------------------

idx=9
label="MCP servers in opencode.json"
if [[ $config_exists -eq 0 ]]; then
  line="$(format_check_line "$idx" "$label" "SKIP (opencode.json missing)")"
  warn_line "$line"
  add_result "$idx" "$label" 0 0 "skipped -- opencode.json missing"
elif ! command -v jq >/dev/null 2>&1; then
  line="$(format_check_line "$idx" "$label" "SKIP (jq not installed)")"
  warn_line "$line"
  info_line "        Install jq to enable MCP config checks: https://jqlang.github.io/jq/"
  add_result "$idx" "$label" 0 0 "skipped -- jq not installed"
else
  wanted_mcps=("context7" "cloudflare-docs" "snyk" "playwright")
  present_mcps=()
  missing_mcps=()

  for mcp_name in "${wanted_mcps[@]}"; do
    # Match by property key; check enabled (absent = true, false = disabled)
    found=$(jq -r --arg name "$mcp_name" '
      .mcp // {} |
      to_entries[] |
      select(.key == $name) |
      if (.value.enabled == false) then "disabled" else "present" end
    ' "$CONFIG_FILE" 2>/dev/null | head -1)

    if [[ "$found" == "present" ]]; then
      present_mcps+=("$mcp_name")
    elif [[ "$found" == "disabled" ]]; then
      missing_mcps+=("$mcp_name (disabled)")
    else
      missing_mcps+=("$mcp_name")
    fi
  done

  has_context7=0
  for p in "${present_mcps[@]}"; do
    [[ "$p" == "context7" ]] && has_context7=1
  done

  if [[ $has_context7 -eq 1 ]]; then
    detail_str="${present_mcps[*]}"
    detail_str="${detail_str// /, }"
    if [[ ${#missing_mcps[@]} -gt 0 ]]; then
      miss_str="${missing_mcps[*]}"
      miss_str="${miss_str// /, }"
      status_str="PASS ($detail_str -- missing: $miss_str)"
    else
      status_str="PASS ($detail_str)"
    fi
    line="$(format_check_line "$idx" "$label" "$status_str")"
    pass_line "$line"
    if [[ ${#missing_mcps[@]} -gt 0 ]]; then
      miss_str="${missing_mcps[*]}"
      warn_line "        Warning: ${miss_str} not configured or disabled (optional but useful)."
      info_line "        See docs/SETUP.md section 6 to add MCPs."
    fi
    add_result "$idx" "$label" 1 0 "$detail_str"
  else
    line="$(format_check_line "$idx" "$label" "FAIL (context7 missing or disabled)")"
    fail_line "$line"
    info_line "        context7 is required. Add it to the mcp block in opencode.json."
    info_line "        See docs/SETUP.md section 6."
    add_result "$idx" "$label" 0 0 "context7 missing"
  fi
fi

# ---------------------------------------------------------------------------
# Check 10 -- LM Studio local server (optional)
# ---------------------------------------------------------------------------

idx=10
label="LM Studio local server"
lmstudio_ok=0
if models_json=$(curl -fsS --max-time 3 "http://127.0.0.1:1234/v1/models" 2>/dev/null); then
  lmstudio_ok=1
  model_count="$(printf '%s' "$models_json" | jq '.data | length' 2>/dev/null || printf 'unknown')"
  line="$(format_check_line "$idx" "$label" "PASS (${model_count} models)" "optional")"
  pass_line "$line"
  add_result "$idx" "$label" 1 1 "${model_count} models"
else
  line="$(format_check_line "$idx" "$label" "SKIP (not running)" "optional")"
  warn_line "$line"
  info_line "        Local models are optional. Start LM Studio only if you want to test the local agent."
  add_result "$idx" "$label" 0 1 "not running"
fi

# ---------------------------------------------------------------------------
# Check 11 -- Qwen3 Coder loaded in LM Studio (optional, skipped if check 10 failed)
# ---------------------------------------------------------------------------

idx=11
label="Qwen3 Coder loaded"
if [[ $lmstudio_ok -eq 0 ]]; then
  line="$(format_check_line "$idx" "$label" "SKIP (LM Studio not running)" "optional")"
  warn_line "$line"
  add_result "$idx" "$label" 0 1 "skipped -- LM Studio not running"
else
  if printf '%s' "$models_json" | jq -r '.data[].id' 2>/dev/null | grep -qi "qwen3-coder"; then
    line="$(format_check_line "$idx" "$label" "PASS" "optional")"
    pass_line "$line"
    add_result "$idx" "$label" 1 1 "found in LM Studio models"
  else
    line="$(format_check_line "$idx" "$label" "SKIP (not loaded)" "optional")"
    warn_line "$line"
    info_line "        Optional: load qwen3-coder-30b-a3b-instruct in LM Studio with n_ctx=16384+."
    add_result "$idx" "$label" 0 1 "not loaded"
  fi
fi

# ---------------------------------------------------------------------------
# Check 12 -- Bash version (optional, defensive)
# ---------------------------------------------------------------------------

idx=12
label="Bash >= 4"
bash_major="${BASH_VERSION%%.*}"
if [[ "$bash_major" =~ ^[0-9]+$ ]] && [[ "$bash_major" -ge 4 ]]; then
  line="$(format_check_line "$idx" "$label" "PASS ($BASH_VERSION)" "optional")"
  pass_line "$line"
  add_result "$idx" "$label" 1 1 "$BASH_VERSION"
else
  line="$(format_check_line "$idx" "$label" "FAIL ($BASH_VERSION)" "optional")"
  warn_line "$line"
  info_line "        macOS ships Bash 3; install a newer version via Homebrew: brew install bash"
  add_result "$idx" "$label" 0 1 "$BASH_VERSION"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

req_pass=0; req_total=0
opt_pass=0; opt_total=0
declare -a req_fail_idxs=()
declare -a req_fail_labels=()
declare -a opt_fail_idxs=()
declare -a opt_fail_labels=()
declare -a opt_fail_details=()

for i in "${!RES_INDEX[@]}"; do
  is_opt="${RES_OPTIONAL[$i]}"
  passed="${RES_PASSED[$i]}"
  if [[ "$is_opt" -eq 0 ]]; then
    (( req_total++ )) || true
    if [[ "$passed" -eq 1 ]]; then
      (( req_pass++ )) || true
    else
      req_fail_idxs+=("${RES_INDEX[$i]}")
      req_fail_labels+=("${RES_LABEL[$i]}")
    fi
  else
    (( opt_total++ )) || true
    if [[ "$passed" -eq 1 ]]; then
      (( opt_pass++ )) || true
    else
      opt_fail_idxs+=("${RES_INDEX[$i]}")
      opt_fail_labels+=("${RES_LABEL[$i]}")
      opt_fail_details+=("${RES_DETAIL[$i]}")
    fi
  fi
done

info_line ""
info_line "========================================================="
info_line "Summary"
info_line "========================================================="
info_line "Required: $req_pass / $req_total PASS"
info_line "Optional: $opt_pass / $opt_total PASS"

if [[ ${#req_fail_idxs[@]} -gt 0 ]]; then
  info_line ""
  fail_msg "Required failures (must fix before using the repo):"
  for i in "${!req_fail_idxs[@]}"; do
    printf '  - [%2d/%d] %s\n' "${req_fail_idxs[$i]}" "$TOTAL_CHECKS" "${req_fail_labels[$i]}"
  done
fi

if [[ ${#opt_fail_idxs[@]} -gt 0 ]]; then
  info_line ""
  warn_msg "Optional warnings (some features won't work):"
  for i in "${!opt_fail_idxs[@]}"; do
    detail="${opt_fail_details[$i]}"
    if [[ -n "$detail" ]]; then
      printf '  - [%2d/%d] %s -- %s\n' "${opt_fail_idxs[$i]}" "$TOTAL_CHECKS" "${opt_fail_labels[$i]}" "$detail"
    else
      printf '  - [%2d/%d] %s\n' "${opt_fail_idxs[$i]}" "$TOTAL_CHECKS" "${opt_fail_labels[$i]}"
    fi
  done
fi

if [[ ${#req_fail_idxs[@]} -gt 0 ]]; then
  info_line ""
  info_line "Next step: address the required failures above, then re-run this script."
  info_line "For the full walkthrough see docs/SETUP.md."
else
  info_line ""
  pass_msg "All required checks passed. You can verify model reachability with:"
  info_line "  Windows:  .\\scripts\\verify-models.ps1"
  info_line "  Unix:     ./scripts/verify-models.sh"
fi

# ---------------------------------------------------------------------------
# --install-config behavior
# ---------------------------------------------------------------------------

if [[ "$INSTALL_CONFIG" == "true" ]]; then
  info_line ""
  info_line "========================================================="
  info_line "--install-config"
  info_line "========================================================="

  if [[ $config_exists -eq 1 ]]; then
    info_line "opencode.json already exists at $CONFIG_FILE; nothing to copy."
    info_line "Pass --install-config only when check 7 has failed."
  else
    # Ensure config dir exists
    mkdir -p "$CONFIG_DIR"

    # Verify example file is present
    if [[ ! -f "$EXAMPLE_CFG" ]]; then
      fail_msg "Cannot install: opencode.example.json not found at $EXAMPLE_CFG"
      info_line "Ensure you are running this script from inside the repo."
      exit 2
    fi

    # Defensive backup (shouldn't occur since check 7 failed, but be safe)
    if [[ -f "$CONFIG_FILE" ]]; then
      ts="$(date +%Y-%m-%d-%H%M)"
      bak="${CONFIG_FILE}.bak.${ts}"
      cp "$CONFIG_FILE" "$bak"
      info_line "Existing file backed up to: $bak"
    fi

    cp "$EXAMPLE_CFG" "$CONFIG_FILE"
    info_line "Copied: $EXAMPLE_CFG"
    info_line "    to: $CONFIG_FILE"
    info_line ""
    info_line "Review the file, fill in your env var references, then re-run check-setup.sh."
  fi
fi

# ---------------------------------------------------------------------------
# Exit code
# ---------------------------------------------------------------------------

[[ ${#req_fail_idxs[@]} -gt 0 ]] && exit 1
exit 0
