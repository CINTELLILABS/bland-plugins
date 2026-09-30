#!/usr/bin/env bash
# Build the ZIP submitted to the ChatGPT plugin directory (platform.openai.com/plugins).
# The directory build differs from the Codex-local layout in two ways:
#   - hooks, commands, agents, bin, dev, and the other host manifests are left out
#     (plugins with lifecycle hooks cannot be submitted);
#   - .codex-plugin/mcp.json is the OAuth variant from dev/chatgpt/mcp.json,
#     because ChatGPT cannot present an API key.
# Usage: dev/scripts/build-chatgpt-zip.sh [out-dir]   (default: ./.tmp-chatgpt-build)
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="${1:-$root/.tmp-chatgpt-build}"
version="$(python3 -c "import json;print(json.load(open('$root/.codex-plugin/plugin.json'))['version'])")"
stage="$out/bland"
rm -rf "$out"; mkdir -p "$stage/.codex-plugin"
cp "$root/.codex-plugin/plugin.json" "$stage/.codex-plugin/plugin.json"
cp "$root/dev/chatgpt/mcp.json" "$stage/.codex-plugin/mcp.json"
cp -R "$root/skills" "$root/assets" "$stage/"
cp "$root/README.md" "$root/LICENSE" "$stage/"
find "$stage" -name .DS_Store -delete
(cd "$out" && zip -qr "bland-plugin-$version.zip" bland)
echo "$out/bland-plugin-$version.zip"
