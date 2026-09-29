#!/bin/sh
# Downloads the CC0 ambientCG maps the title scene uses into ./textures (git-ignored).
set -eu
cd "$(dirname "$0")"
mkdir -p textures
tmp=$(mktemp -d)
for asset in Cork003 Paper001 Paper005 PaintedPlaster017 Wood066 Wood026 Leather037; do
    curl -sfL -o "$tmp/$asset.zip" "https://ambientcg.com/get?file=${asset}_1K-JPG.zip"
    for map in Color NormalGL Roughness; do
        unzip -oqj "$tmp/$asset.zip" "${asset}_1K-JPG_$map.jpg" -d textures
    done
done
rm -rf "$tmp"
