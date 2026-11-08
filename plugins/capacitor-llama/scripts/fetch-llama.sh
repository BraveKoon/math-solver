#!/usr/bin/env bash
# ggml-org/llama.cpp 공식 릴리스의 llama.xcframework(텍스트 + mtmd 비전 포함)를 내려받습니다.
# 사용: LLAMA_TAG=<릴리스 태그> ./fetch-llama.sh   (태그를 비우면 최신 릴리스, scripts/LLAMA_TAG 파일로 고정 가능)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="ios/Frameworks"
TAG="${LLAMA_TAG:-$(cat scripts/LLAMA_TAG 2>/dev/null || true)}"
API=https://api.github.com/repos/ggml-org/llama.cpp/releases
REL_URL="$API/latest"; [ -n "$TAG" ] && REL_URL="$API/tags/$TAG"
AUTH=(); [ -n "${GITHUB_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN")
REL=$(curl -fsSL "${AUTH[@]}" "$REL_URL")
TAG=$(printf '%s' "$REL" | python3 -c 'import sys,json;print(json.load(sys.stdin)["tag_name"])')
# 릴리스 이름 규칙이 바뀌어도 되도록 파일명을 추정하지 않고 xcframework 자산을 찾는다
ASSET=$(printf '%s' "$REL" | python3 -c 'import sys,json
a=[x["browser_download_url"] for x in json.load(sys.stdin)["assets"] if "xcframework" in x["name"] and x["name"].endswith(".zip")]
print(a[0] if a else "")')
if [ -z "$ASSET" ]; then
  echo "No xcframework asset in llama.cpp release $TAG. Assets:" >&2
  printf '%s' "$REL" | python3 -c 'import sys,json;[print("  ",x["name"]) for x in json.load(sys.stdin)["assets"]]' >&2
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
