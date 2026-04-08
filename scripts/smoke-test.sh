#!/usr/bin/env bash
# Smoke test — runs kib end-to-end with real API calls
# Usage: ./scripts/smoke-test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
VAULT="/tmp/kib-smoke-test-$$"
PASS=0
FAIL=0

kib() { cd "$VAULT" && bun run "$ROOT/packages/cli/bin/kib.ts" "$@" 2>&1; cd "$ROOT"; }

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; }
red()   { printf "\033[31m✗ %s\033[0m\n" "$1"; }

cleanup() { rm -rf "$VAULT"; }
trap cleanup EXIT

echo ""
echo "=== kib smoke test ==="
echo "vault: $VAULT"
echo ""

# -- init --
bun run "$ROOT/packages/cli/bin/kib.ts" init "$VAULT" > /dev/null 2>&1
if [ -f "$VAULT/.kb/manifest.json" ]; then green "init"; ((PASS++)); else red "init"; ((FAIL++)); fi

# -- ingest local file --
cat > "$VAULT/test.md" << 'EOF'
# Neural Networks

A neural network is a computational model inspired by biological neurons. It consists of layers of interconnected nodes that process information. Key types include CNNs for images, RNNs for sequences, and Transformers for attention-based processing.
EOF
OUTPUT=$(kib ingest "$VAULT/test.md")
if echo "$OUTPUT" | grep -q "Ingested 1 source"; then green "ingest (local file)"; ((PASS++)); else red "ingest (local file)"; ((FAIL++)); echo "  $OUTPUT"; fi

# -- ingest web --
OUTPUT=$(kib ingest "https://en.wikipedia.org/wiki/Gradient_descent")
if echo "$OUTPUT" | grep -q "Ingested 1 source"; then green "ingest (web)"; ((PASS++)); else red "ingest (web)"; ((FAIL++)); echo "  $OUTPUT"; fi

# -- status --
OUTPUT=$(kib status --json)
if echo "$OUTPUT" | grep -q '"sources": 2'; then green "status"; ((PASS++)); else red "status"; ((FAIL++)); echo "  $OUTPUT"; fi

# -- compile (calls LLM) --
echo ""
echo "Compiling (calling LLM)..."
OUTPUT=$(kib compile)
if echo "$OUTPUT" | grep -q "article"; then green "compile"; ((PASS++)); else red "compile"; ((FAIL++)); echo "  $OUTPUT"; fi
echo "  $(echo "$OUTPUT" | grep 'tokens used' || echo 'no token info')"

# -- search --
OUTPUT=$(kib search "neural network")
if echo "$OUTPUT" | grep -qi "neural"; then green "search"; ((PASS++)); else red "search"; ((FAIL++)); fi

# -- query (calls LLM) --
echo ""
echo "Querying (calling LLM)..."
OUTPUT=$(kib query "what is a neural network?")
if echo "$OUTPUT" | grep -qi "neural"; then green "query"; ((PASS++)); else red "query"; ((FAIL++)); fi

# -- lint --
OUTPUT=$(kib lint)
if echo "$OUTPUT" | grep -q "Checking articles"; then green "lint (ran)"; ((PASS++)); else red "lint"; ((FAIL++)); echo "  $OUTPUT"; fi

# -- export markdown --
OUTPUT=$(kib export --format markdown)
if [ -f "$VAULT/export/INDEX.md" ]; then green "export (markdown)"; ((PASS++)); else red "export (markdown)"; ((FAIL++)); fi

# -- export html --
OUTPUT=$(kib export --format html --output "$VAULT/html-export")
if [ -f "$VAULT/html-export/INDEX.html" ]; then green "export (html)"; ((PASS++)); else red "export (html)"; ((FAIL++)); fi

# -- skill list --
OUTPUT=$(kib skill list)
if echo "$OUTPUT" | grep -q "summarize"; then green "skill list"; ((PASS++)); else red "skill list"; ((FAIL++)); fi

# -- config --
OUTPUT=$(kib config provider.model)
if echo "$OUTPUT" | grep -q "claude-sonnet-4-6"; then green "config"; ((PASS++)); else red "config"; ((FAIL++)); echo "  $OUTPUT"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "All good." || exit 1
