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
cp index.html dist/
cp assets/*.jpg assets/leckhampton.js assets/leckhampton_osm.js dist/assets/
mkdir -p dist/workouts && cp workouts/*.json dist/workouts/
[ -d workouts/audio ] && cp -R workouts/audio dist/workouts/        # the coach's spoken clips
sf publish dist -y -m "${1:-Update}"
