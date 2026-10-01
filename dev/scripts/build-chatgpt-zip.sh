#!/usr/bin/env bash
# Build the ZIP submitted to the ChatGPT plugin directory (platform.openai.com/plugins).
# Use the self-contained ChatGPT skills, README, and OAuth MCP configuration.
# Local host skills, hooks, commands, agents, and scripts are not packaged.
# Usage: dev/scripts/build-chatgpt-zip.sh [out-dir]   (default: ./.tmp-chatgpt-build)
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="${1:-$root/.tmp-chatgpt-build}"
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$root/.codex-plugin/plugin.json")"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/bland-chatgpt.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT
stage="$scratch/bland"
mkdir -p "$stage/.codex-plugin"
cp "$root/.codex-plugin/plugin.json" "$stage/.codex-plugin/plugin.json"
cp "$root/dev/chatgpt/mcp.json" "$stage/.codex-plugin/mcp.json"
cp -R "$root/dev/chatgpt/skills" "$root/assets" "$stage/"
cp "$root/dev/chatgpt/README.md" "$root/LICENSE" "$stage/"
find "$stage" -name .DS_Store -delete
(cd "$scratch" && zip -qr "bland-plugin-$version.zip" bland)
mv "$scratch/bland-plugin-$version.zip" "$out/"
echo "$out/bland-plugin-$version.zip"
