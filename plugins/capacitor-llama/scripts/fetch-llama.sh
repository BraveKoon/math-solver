#!/usr/bin/env bash
# ggml-org/llama.cpp 공식 릴리스의 llama.xcframework(텍스트 + mtmd 비전 포함)를 내려받습니다.
# 사용: LLAMA_TAG=b1234 ./fetch-llama.sh   (태그를 비우면 최신 릴리스)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="ios/Frameworks"
TAG="${LLAMA_TAG:-$(cat scripts/LLAMA_TAG 2>/dev/null || true)}"
if [ -z "$TAG" ]; then
  TAG=$(curl -fsSL https://api.github.com/repos/ggml-org/llama.cpp/releases/latest | python3 -c 'import sys,json;print(json.load(sys.stdin)["tag_name"])')
fi
if [ -f "$DEST/llama.xcframework/.tag" ] && [ "$(cat "$DEST/llama.xcframework/.tag")" = "$TAG" ]; then
  echo "llama.xcframework $TAG already present"; exit 0
fi
echo "Fetching llama.cpp $TAG xcframework"
rm -rf "$DEST/llama.xcframework" "$DEST/tmp"; mkdir -p "$DEST/tmp"
curl -fsSL -o "$DEST/tmp/xcf.zip" "https://github.com/ggml-org/llama.cpp/releases/download/$TAG/llama-$TAG-xcframework.zip"
unzip -q "$DEST/tmp/xcf.zip" -d "$DEST/tmp"
XCF=$(find "$DEST/tmp" -maxdepth 4 -type d -name 'llama.xcframework' | head -n1)
[ -n "$XCF" ] || { echo "llama.xcframework not found in archive" >&2; exit 1; }
mv "$XCF" "$DEST/llama.xcframework"
echo "$TAG" > "$DEST/llama.xcframework/.tag"
rm -rf "$DEST/tmp"
echo "OK: $DEST/llama.xcframework ($TAG)"
