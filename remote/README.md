# Phone gear shifter

Lets a rider use their phone as a gear shifter while the ride runs on a laptop.

- `remote.html` is the phone page, opened from the QR code.
- `remote-laptop.js` is added to the ride when it is published. It shows the pairing code and acts on taps.
- `server/index.ts` is a small relay on Spacefast's Zero runtime. The phone posts taps under a one-off pairing code; the laptop asks for new ones. Taps are kept for a minute.

It needs that relay, so it only works on a host that runs it. `deploy.sh` builds the published site from the ride plus these files. The ride itself still runs without them, for example straight from a local folder.
