#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p BinnenApp/Assets.xcassets/AppIcon.appiconset
# Buildasset uit het bestaande BinnenApp-icoon, geen nieuw logo.
sips -z 1024 1024 ../mobiel/binnenapp-icoon-blauw-512.png --out BinnenApp/Assets.xcassets/AppIcon.appiconset/icon.png >/dev/null
cat > BinnenApp/Assets.xcassets/AppIcon.appiconset/Contents.json <<'JSON'
{"images":[{"filename":"icon.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}
JSON
