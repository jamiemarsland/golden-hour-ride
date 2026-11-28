#!/bin/sh
# Publish the ride to Spacefast.
# Builds dist/ from the ride and its data, plus the phone gear shifter in remote/ (a small relay on Spacefast's
# Zero runtime, the phone page, and the laptop script added to the ride). Spacefast builds it on its own servers,
# which needs dist/ to be a git repository, so dist/.git is kept between publishes, as is dist/.spacefast,
# which links dist/ to the live space.
# Left out on purpose: the old index.v*.html backups, the tools/ scripts, and assets/textures.js
# (a 21 MB embedded copy of the textures, only needed when the page is opened straight from disk).
#   ./deploy.sh "message"     publish and make it live
# Every publish goes live straight away. (Asking for a preview did not stop a build from the main branch going live.)
# To undo a bad publish, from dist/:  sf rollback v26   (or whichever version number was live before)
set -e
cd "$(dirname "$0")"
mkdir -p dist/assets
find dist -mindepth 1 -maxdepth 1 ! -name .spacefast -exec rm -rf {} +
mkdir -p dist/assets
cp index.html coach-figure.js dist/
cp assets/*.jpg assets/leckhampton.js assets/leckhampton_osm.js dist/assets/
# Each workout is a folder in workouts/ (workout.json, and coach.json and audio/ if it has a coach); _shared holds the
# spoken numbers. A web server can't list a folder, so index.json names the workouts for the page.
mkdir -p dist/workouts && cp -R workouts/ dist/workouts/
find dist/workouts -name '___*' -exec rm -rf {} +                   # set-aside copies
( cd workouts && for d in */; do d=${d%/}; case $d in _*) continue;; esac; [ -f "$d/workout.json" ] && printf '%s\n' "$d"; done ) |
  python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()], indent=2))' > dist/workouts/index.json
sf publish dist -y -m "${1:-Update}"
