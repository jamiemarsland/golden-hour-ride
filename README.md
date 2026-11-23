# Golden Hour Ride

A proof-of-concept indoor cycling ride that runs in the browser (Three.js, entry point `index.html`).

[Open the local game](http://127.0.0.1:8791/) · [Original upstream demo](https://golden-hour-ride.space.fast/)

## What's in it

- Four courses in **Worlds** include the Col de la Core in the Ariège Pyrenees, the 10.8 km Richmond Park perimeter lap, an invented mountain valley, and a real 11.9 km Leckhampton loop built from Environment Agency lidar, dressed as the 19th-century hill (sheep, hay stooks, quarry smoke).
- Choose golden light, overcast skies, rain, mist or a starry sky in **Settings**. The Christmas version of Golden Valley adds snowfall.
- Skip forward and back 250 m with the arrow keys.
- Hide everything on screen for a clean view: the Hide info button, the H key, or say "hide". Press H, click, or say "show" to bring it back.
- Power from a slider, or from a Bluetooth trainer (Chrome or Edge). If the trainer supports resistance control (FTMS), the ride also sends it the road gradient, so climbs feel harder; the button shows "Trainer connected" or "Trainer: power only". The trainer feels half the road gradient by default; the − and + buttons beside the trainer button change that in steps of 10 %, from off to the full gradient, and the choice is kept in the browser (`?hills=` sets it for one visit). With voice on, say "easier" or "harder" to move it by 20 %, "flat" for off, or "full" for all of it. The last trainer is remembered: the button reads "Reconnect trainer" and rejoins it without the browser's device list where Chrome allows that, and a dropped connection is retried automatically.
- Descents count half in the speed model and the rider brakes above 54 km/h, so downhill speed stays sensible.

Open **Map** and select **Download route GPX** to take a mapped course onto a cycling computer or mapping app. Richmond and Leckhampton export a complete lap in your current direction. Col de la Core exports your selected approach from the valley floor to the summit. The files include each surveyed road sample and its elevation. Regenerate them offline from the packaged roads with `python tools/build_route_gpx.py`.

## Workouts and Richmond Park

Use **Workouts** to start a free ride, ride a 3 × 8 or 5 × 5 session, or save your own repeats, warm-up, recovery and cool-down. Enter target watts directly or use a percentage of a reference FTP. The preview shows the interval pattern and total duration before saving. The workout card shows the current effort, the next three steps, target and measured watts, and time remaining. Pause, change intensity, skip backwards or forwards, or finish and save from that card. **History** stores sessions in this browser, including time, distance, ascent, per-interval averages and target versus recorded power. Trainer readings and simulated readings are labelled separately. A world change carries the recording across and pauses it until you resume. Browse your last seven days or open an individual ride to repeat its workout or download a TCX file. Longer recordings show best sustained power over 1, 5, 8 and 20 minutes when there are sufficient continuous readings. History also has a file backup and restore option that merges missing rides, including older ride summaries.

**Settings** includes optional ERG control for compatible FTMS trainers, a one-kilometre elevation preview and a ghost from the last complete lap in the same world and direction. Skipping invalidates the lap comparison. The **Map** shows the full course and elevation profile. **Turn around** changes your heading in place. Wind noise and spoken summit results have separate switches. Automatic graphics can reduce rendering load during slow rides. Choose **Smoother motion** or **Full detail** to set it yourself. Rider + bike weight changes virtual climbing speed and defaults to 80 kg.

Richmond uses mapped OpenStreetMap road geometry, terrain from the Environment Agency's 1 m LiDAR composite (sampled at 4 m), and canopy positions estimated from the Agency's Vegetation Object Model. Buildings, paths, car parks, barriers and gates follow mapped locations. Building shapes and materials, individual tree crowns and deer are illustrative. Environment Agency data is available under the Open Government Licence v3.0. Map data © OpenStreetMap contributors, ODbL.

Richmond's visitor cars make occasional trips between the Roehampton Gate and Robin Hood car parks, and between Pembroke Lodge and Broomfield Hill. These roads allow car-park access throughout the week. Sawyer's Hill and the closed Broomfield Hill–Robin Hood section stay quiet in the simulation. Cyclists can ride the full perimeter. The car routes follow mapped driveways, including the one-way entrance and exit at Pembroke Lodge. The historic Leckhampton scene has cyclists only. [Royal Parks vehicle access map](https://www.royalparks.org.uk/sites/default/files/2023-06/Richmond-Map-v2.pdf) · [Royal Parks movement strategy](https://www.royalparks.org.uk/park-management/park-strategies/movement-strategy) · [Pembroke Lodge parking aisle on OpenStreetMap](https://www.openstreetmap.org/way/32864089)

The Col de la Core starts in Seix or Les Bordes-sur-Lez, depending on the approach you choose in **Worlds**. The two climbs meet at the signed 1,395 m pass. **Jump to…** takes you to your chosen valley floor, the D17 turnoff for Lac de Bethmale, or the summit. An uninterrupted ascent earns a timed result, kilometre splits and a personal best for that approach. Shortcuts and U-turns end the attempt. At the pass, continue down the far side or turn around. At the lake junction, **View lakeshore** pauses the ride for a look at the water. Return to the bike to continue from the junction.

The course builder combines OpenStreetMap road and shoreline geometry, IGN BD TOPO 3D road heights and Skadi terrain. Village buildings, parking areas and the lake access road follow OpenStreetMap positions. The lakeshore uses a 15 m grid sampled from IGN RGE ALTI. Woodland follows ESA WorldCover 2021, sampled on a 20 m grid. Tree shapes and building facades are illustrative. [ESA WorldCover](https://esa-worldcover.org/en/data-access) [IGN BD TOPO](https://geoservices.ign.fr/bdtopo)

To regenerate Richmond, run tools/build_richmond.py then tools/build_richmond_scenery.py from the project root with Python and Pillow. The packaged course runs without contacting the mapping services.

To rebuild the Col, run `tools/build_core.py`, `tools/build_core_scenery.py` and `tools/build_core_woodland.py` from the project root. The woodland builder requires Rasterio and NumPy. Run `tools/build_route_gpx.py` after changing either mapped course.

## Run it locally

```bash
python -m http.server 8791 --bind 127.0.0.1
```

Open [Golden Hour Ride](http://127.0.0.1:8791/) in the same browser each time to use your saved history.

## Layout

- `index.html` – the 3D scene and ride controls.
- `assets/` – textures and course data. `textures.js` is an embedded copy of the textures, used only when the page is opened straight from disk.
- `tools/` – scripts that build the geographic course data.
- `deploy.sh` – publishes to Spacefast.

## Credits

- Textures: Poly Haven (CC0).
- Terrain: Environment Agency LiDAR Composite DTM, Open Government Licence v3.0.
- Roads, woodland and field boundaries: © OpenStreetMap contributors, ODbL.
- 3D engine: Three.js 0.160.0 (MIT), bundled locally in vendor/.

## Licence

The code is released under the MIT licence: see `LICENSE`. Use it, change it, build your own ride.

The MIT licence covers the code only. The Richmond Park data and the course data in `assets/leckhampton.js` and `assets/leckhampton_osm.js` is derived from the sources credited above and stays under their terms: the Open Government Licence v3.0 for the terrain and the ODbL for the OpenStreetMap data. If you share or adapt that data, keep those credits.
