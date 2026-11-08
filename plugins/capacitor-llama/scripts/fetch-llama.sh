#!/usr/bin/env bash
# ggml-org/llama.cpp 공식 릴리스의 llama.xcframework(텍스트 + mtmd 비전 포함)를 내려받습니다.
# 사용: LLAMA_TAG=<릴리스 태그> ./fetch-llama.sh   (태그를 비우면 최신 릴리스, scripts/LLAMA_TAG 파일로 고정 가능)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="ios/Frameworks"
TAG="${LLAMA_TAG:-$(cat scripts/LLAMA_TAG 2>/dev/null || true)}"
API=https://api.github.com/repos/ggml-org/llama.cpp/releases
AUTH=(); [ -n "${GITHUB_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN")
if [ -n "$TAG" ]; then
  RELS="[$(curl -fsSL "${AUTH[@]}" "$API/tags/$TAG")]"
else
  # "latest" 릴리스에 바이너리가 없을 수 있어(예: nightly 표시용) 최근 릴리스 중 xcframework가 있는 가장 새 것을 고른다
  RELS=$(curl -fsSL "${AUTH[@]}" "$API?per_page=30")
fi
read -r TAG ASSET < <(printf '%s' "$RELS" | python3 -c 'import sys,json
for r in json.load(sys.stdin):
    a=[x["browser_download_url"] for x in r.get("assets",[]) if "xcframework" in x["name"] and x["name"].endswith(".zip")]
    if a: print(r["tag_name"], a[0]); break
else: print("", "")')
if [ -z "${ASSET:-}" ]; then
  echo "No llama.cpp release with an xcframework asset found${LLAMA_TAG:+ for $LLAMA_TAG}. Recent releases:" >&2
  printf '%s' "$RELS" | python3 -c 'import sys,json
for r in json.load(sys.stdin)[:5]: print("  ", r["tag_name"], [x["name"] for x in r.get("assets",[])][:12])' >&2
  exit 1
fi
if [ -f "$DEST/llama.xcframework/.tag" ] && [ "$(cat "$DEST/llama.xcframework/.tag")" = "$TAG" ]; then
  echo "llama.xcframework $TAG already present"; exit 0
fi
echo "Fetching llama.cpp $TAG: $ASSET"
rm -rf "$DEST/llama.xcframework" "$DEST/tmp"; mkdir -p "$DEST/tmp"
curl -fsSL -o "$DEST/tmp/xcf.zip" "$ASSET"
unzip -q "$DEST/tmp/xcf.zip" -d "$DEST/tmp"
XCF=$(find "$DEST/tmp" -maxdepth 4 -type d -name 'llama.xcframework' | head -n1)
[ -n "$XCF" ] || { echo "llama.xcframework not found in archive" >&2; exit 1; }
mv "$XCF" "$DEST/llama.xcframework"
echo "$TAG" > "$DEST/llama.xcframework/.tag"
rm -rf "$DEST/tmp"
echo "OK: $DEST/llama.xcframework ($TAG)"
