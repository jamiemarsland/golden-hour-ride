#!/bin/sh
# Publish the ride to Spacefast. Rebuilds dist/ from the live page and its data,
# keeping dist/.spacefast so each publish updates the same space.
# Left out on purpose: the old index.v*.html backups, the tools/ scripts, and assets/textures.js
# (a 21 MB embedded copy of the textures, only needed when the page is opened straight from disk).
set -e
cd "$(dirname "$0")"
mkdir -p dist/assets
find dist -mindepth 1 -maxdepth 1 ! -name .spacefast -exec rm -rf {} +
mkdir -p dist/assets
cp -R vendor dist/
cp -R assets/routes dist/assets/
cp index.html trainer-telemetry.js elevation-preview.js history-files.js training.js ride-motion.js mountain-terrain.js core-villages.js lake-access.js lake-view.js ride-power-bests.js ride-export.js woodland-crowns.js richmond-park.js richmond-segments.js road-models.js traffic.js route-map.js ride.css dist/
cp assets/*.jpg assets/leckhampton.js assets/leckhampton_osm.js assets/richmond.js assets/richmond-scenery.js assets/richmond-ground.png assets/core.js assets/core-scenery.js assets/core-woodland.js dist/assets/
sf publish dist -y -m "${1:-Update}"
