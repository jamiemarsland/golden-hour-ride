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
mkdir -p dist
find dist -mindepth 1 -maxdepth 1 ! -name .spacefast ! -name .git -exec rm -rf {} +
mkdir -p dist/assets dist/server
cp assets/*.jpg assets/leckhampton.js assets/leckhampton_osm.js dist/assets/
cp remote/sf.jsonc remote/package.json remote/remote.html remote/remote-laptop.js dist/
cp remote/server/index.ts dist/server/
# the ride, with the gear shifter's laptop script added just before </body>
sed 's|</body>|<script src="remote-laptop.js"></script>\n</body>|' index.html > dist/index.html
grep -q 'remote-laptop.js' dist/index.html
printf 'node_modules/\n.spacefast/\n' > dist/.gitignore
cd dist
[ -d .git ] || git init -q -b main
git add -A
git -c user.name="deploy" -c user.email="deploy@localhost" commit -q -m "${1:-Update}" --allow-empty
sf publish . --remote -y -m "${1:-Update}" --wait
