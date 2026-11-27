# Golden Hour Ride

A proof-of-concept indoor cycling ride that runs in the browser (Three.js, one `index.html`).

Live: https://golden-hour-ride.space.fast/ · Leckhampton loop: https://golden-hour-ride.space.fast/?course=leckhampton

## What's in it

- Two courses: an invented mountain valley, and a real 11.9 km Leckhampton loop built from Environment Agency lidar, dressed as the 19th-century hill (sheep, hay stooks, quarry smoke).
- Four looks: Golden, Overcast, Rain and Mist. Buttons at the top, keys 1–4, or by voice. (A fifth, Starry, is still being worked on: it only appears on a local copy, on key 5.)
- A Christmas ride: add `?theme=christmas` to the valley course for a snowy evening, with falling snow, fairy lights in the pines and lit chalets. It adds a Snow look; say "snow" to bring it back.
- Scenery mode: add `?scenery` and the ride drifts along on its own at a steady pace with nothing on screen, the weather slowly changing, for leaving on in the background. `?scenery=nobars` also hides the handlebars, for filming.
- Skip forward and back 250 m with the arrow keys.
- Hide everything on screen for a clean view: the Hide info button, the H key, or say "hide". Press H, click, or say "show" to bring it back.
- Power from a slider, or from a Bluetooth trainer (Chrome or Edge). If the trainer supports resistance control (FTMS, or Bkool's own Bluetooth control on a Bkool Smart Pro 3 / Zycle Smart ZPro), the ride also sends it the road gradient, so climbs feel harder; the button shows "Trainer: power and gradient" or "Trainer: power only". The trainer feels half the road gradient by default; the − and + buttons beside the trainer button change that in steps of 10 %, from off to the full gradient, and the choice is kept in the browser (`?hills=` sets it for one visit). With voice on, say "easier" or "harder" to move it by 20 %, "flat" for off, or "full" for all of it. The last trainer is remembered: the button reads "Reconnect trainer" and rejoins it without the browser's device list where Chrome allows that, and a dropped connection is retried automatically.
- A coach on screen during workouts: a small 3D window with a rider on a spin bike, seen from the front, who pedals at your cadence, leans in harder in the efforts, looks at you and talks along with the coach's voice, blinks, and smiles and raises a fist on the lively lines. He is drawn like a film cartoon, under a blue sky: a big round head with large amber eyes that glance about, thick brows, rosy cheeks and a wide smile; smooth one-piece arms, legs and body; soft skin, and light reflected in the eyes, the helmet and the steel. Turn it off with "Coach on screen" in the Workout panel.
- Heart rate from any Bluetooth heart-rate monitor (chest strap or armband, Chrome or Edge): the Heart rate button connects it, the bpm appears with the other numbers and in the workout panel, and a second click disconnects it. The last monitor is remembered and rejoined without the browser's device list where Chrome allows that, and a dropped connection is retried.
- Workouts: the Workout button lists them; add MyWhoosh workout files (.json) with "Add MyWhoosh workout…" or by dropping them on the page. Set your FTP there. While you ride one, a panel shows the target power, your 3-second average in green (within 5 % or 10 W) or red, the time left in the step and the workout, the target cadence (and your own, in green or red within 5 rpm, when the trainer or power meter reports it) and the workout's shape. With "Trainer holds the target power (ERG)" on, a controllable trainer holds each target; otherwise it keeps following the road. The clock waits while you are not pedalling.
- Descents count half in the speed model and the rider brakes above 54 km/h, so downhill speed stays sensible.

## Run it locally

```bash
python3 -m http.server 8791
```

Then open http://localhost:8791/.

## Layout

- `index.html` – the ride.
- `coach-figure.js` – the coach on screen: how the figure looks and moves. The ride loads it, and tells it each frame the cadence, the effort and whether the coach is speaking.
- `assets/` – textures and course data. `textures.js` is an embedded copy of the textures, used only when the page is opened straight from disk.
- `workouts/` – the workouts that come with the ride, one folder each, so adding or removing a workout means adding or removing its folder and nothing else:

  ```
  workouts/
    sweet-spot-3x10/
      workout.json      the MyWhoosh workout file
      coach.json        optional: the spoken coach
      audio/            the coach's clips, written by tools/build_coach_audio.py
    _shared/            spoken numbers used by every workout with the same voice
  ```

  Folders starting with `_` are not workouts. The page finds the workouts from the folder listing that `python3 -m http.server` shows; `deploy.sh` writes a `workouts/index.json` for the published site, where there is no listing.
  A workout can have a spoken coach in `coach.json`: lines timed within each step (`at` seconds from its start, or `before_end`), a `finish` line, and `feedback` pools of short remarks for power too high or low, cadence too high or low, and praise. `rules` set how long you must be off target before a remark (8 s), the least time between remarks (30 s) and the quiet at the start of each step. Speak the lines with Kyutai Pocket TTS (CPU only; the first run downloads the model):

  ```bash
  uv run tools/build_coach_audio.py workouts/sweet-spot-3x10
  ```

  `checkins` make the coach read out live numbers every few minutes (`every`, from `first_after` seconds in), taking turns between heart rate ("Let's look at your heart rate. 142 beats per minute. That is very solid.") and power with cadence. Each is put together from short clips: a phrase, a number, a unit and a verdict. Heart rate is judged against Max HR in the Workout panel and the step's intensity; power against the target. The numbers (30–220, then watts in fives to 600) are spoken once per voice into a shared `workouts/_shared/numbers-…/` folder.
  `voice` is a built-in pocket-tts voice (alba, eve, marius, …) or a voice file in the project, such as `voices/announcer.safetensors` made with `uvx pocket-tts export-voice <audio> voices/announcer.safetensors` (exporting needs Kyutai's gated voice-cloning weights; using the file does not). Export it with the same `--language` as the coach file.
  It writes small .m4a clips and a `manifest.json` to the workout's `audio/` folder, and only re-speaks lines that changed. A line with no clip is read by the browser's own voice. The Coach voice checkbox in the Workout panel turns it off.
- `tools/` – scripts that build the Leckhampton course data, and `trainer-probe.html` for finding out how a trainer talks over Bluetooth.
- `deploy.sh` – publishes to Spacefast.

## Credits

- Textures: Poly Haven (CC0).
- Terrain: Environment Agency LiDAR Composite DTM, Open Government Licence v3.0.
- Roads, woodland and field boundaries: © OpenStreetMap contributors, ODbL.
- 3D engine: Three.js (MIT), loaded from jsDelivr.

## Licence

The code is released under the MIT licence: see `LICENSE`. Use it, change it, build your own ride.

The MIT licence covers the code only. The course data in `assets/leckhampton.js` and `assets/leckhampton_osm.js` is derived from the sources credited above and stays under their terms: the Open Government Licence v3.0 for the terrain and the ODbL for the OpenStreetMap data. If you share or adapt that data, keep those credits.
