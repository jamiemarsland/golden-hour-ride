// The laptop side of the phone remote (prototype). Shows a pairing code as a QR, then asks the relay a few times a
// second for new taps and acts on them through the ride's own controls.
(() => {
  // How often to ask the relay for taps. Up to two asks overlap, so a tap waits roughly half a round trip, not a whole one.
  // Quick while the phone is in use, slower once it has been quiet for two minutes.
  const FAST_MS = 110, IDLE_MS = 600;
  let inflight = 0;
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const url = location.origin + '/remote#' + code;
  const box = document.createElement('div');
  box.innerHTML = `<div id="rm-panel" hidden><button id="rm-close" aria-label="Close">✕</button><div id="rm-title">Change gear from your phone</div><div id="rm-sub">Scan this with your phone's camera, then tap − and + to shift.</div><div id="rm-qr"></div><div id="rm-url"></div><div id="rm-status">Waiting for your phone</div></div>`;
  box.style.cssText = 'position:fixed;right:18px;bottom:44px;z-index:5;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:11px/1.4 -apple-system,Segoe UI,sans-serif;letter-spacing:.06em;color:#fff';
  document.body.appendChild(box);
  // Phone remote is a row in the ride's Devices panel, with its own dot on the Devices chip; the pairing code shows at the bottom right
  const $ = id => document.getElementById(id), panel = $('rm-panel'), btn = document.createElement('button');
  btn.id = 'rm-btn'; btn.textContent = 'Pair phone'; btn.title = 'Use your phone as a gear shifter: scan the code, then tap − and + to change gear';
  const row = document.createElement('div'); row.className = 'dev';
  row.innerHTML = '<div class="t"><b>Gear shifter</b><span id="ds-phone">Change gear from your phone</span></div>';
  row.appendChild(btn); const devs = $('devices');
  if (devs) devs.insertBefore(row, devs.children[1] || null); else box.appendChild(row);   // between Trainer and Voice, matching the dots
  const dot = document.createElement('span'); dot.className = 'dd'; dot.id = 'dd-phone';
  if ($('devbtn')) $('devbtn').insertBefore(dot, $('dd-voice'));
  let seen = 0;                                             // when the phone last sent anything
  const phoneState = () => { const live = Date.now() - seen < 5 * 60000 && seen; dot.className = 'dd' + (live ? ' ok' : ''); $('ds-phone').textContent = live ? 'Your phone is connected' : started ? 'Waiting for your phone' : 'Change gear from your phone'; btn.textContent = panel.hidden ? (started ? 'Show code' : 'Pair phone') : 'Hide code'; };
  // the pairing code sits in the middle of the screen, large enough to scan from the saddle
  panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:7;box-sizing:border-box;width:min(340px,calc(100vw - 36px));background:rgba(20,16,12,.9);border:1px solid rgba(255,255,255,.3);border-radius:18px;padding:18px;text-align:center;backdrop-filter:blur(8px)';
  $('rm-url').style.cssText = 'margin-top:8px;opacity:.6;word-break:break-all;font-size:10px';
  $('rm-status').style.cssText = 'margin-top:10px;color:#ffcf8f;font-size:14px';
  $('rm-url').textContent = url;
  $('rm-title').style.cssText = 'font-size:17px;font-weight:600;letter-spacing:.01em;margin-bottom:4px';
  $('rm-sub').style.cssText = 'font-size:13px;line-height:1.4;opacity:.8;margin:0 6px 14px;letter-spacing:.01em';
  panel.style.paddingTop = '40px';
  $('rm-close').style.cssText = 'position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:none;color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0';
  // three ways to put the code away: the ✕, a click on the scenery, or it closes itself once the phone connects
  const closeCode = () => { if (!panel.hidden) { panel.hidden = true; phoneState(); } };
  $('rm-close').onclick = closeCode;
  if ($('c')) $('c').addEventListener('click', closeCode);
  const show = t => { if (ride().toast) ride().toast(t); };   // each tap is confirmed with the ride's own toast
  const state = () => ({ gear: +(($('gval') || {}).textContent || '').replace(/\D/g, '') || null, trainer: !!(ride().bike && ride().bike.point),
    weather: (document.querySelector('#wx .on') || {}).textContent || '', weathers: [...document.querySelectorAll('#wx button')].map(b => [b.dataset.w, b.textContent]),
    pacer: ride().pacer.on ? ride().pacer.watts : 0, watts: ride().pacer.watts, wait: !!ride().pacer.wait, stopped: !!ride().stopped });
  let sentState = '';
  const report = () => { const st = JSON.stringify(state()); if (st === sentState) return; sentState = st;
    fetch('/api/remote/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, state: JSON.parse(st) }) }).catch(() => { sentState = ''; }); };
  let started = false, after = Date.now() - 1000, skew = 0, taps = 0, sum = 0;
  const status = t => { $('rm-status').textContent = t; };
  const ride = () => window.ride;
  const act = {
    'gear+': () => ride().say('gear up'), 'gear-': () => ride().say('gear down'), stop: () => (ride().say(ride().stopped ? 'carry on' : 'stop'), ride().stopped ? 'Stopped' : 'Riding'),
    pacer: () => { ride().setPacer(!ride().pacer.on); return ride().pacer.on ? 'Pacer on · ' + ride().pacer.watts + ' W' : 'Pacer off'; },
    weather: () => { const all = [...document.querySelectorAll('#wx button')], i = all.findIndex(b => b.classList.contains('on')); const n = all[(i + 1) % all.length]; n.click(); return 'Weather: ' + n.textContent; },
    'pacer+': () => { $('pmore').click(); return 'Pacer ' + ride().pacer.watts + ' W'; }, 'pacer-': () => { $('pless').click(); return 'Pacer ' + ride().pacer.watts + ' W'; },
    'pacer:on': () => { if (!ride().pacer.on) ride().setPacer(true); return 'Pacer on · ' + ride().pacer.watts + ' W'; }, 'pacer:off': () => { ride().setPacer(false); return 'Pacer off'; },
    'pacer:wait': () => { document.querySelector('#pwait [data-wait="1"]').click(); return 'Pacer waits for you'; }, 'pacer:strict': () => { document.querySelector('#pwait [data-wait="0"]').click(); return 'Pacer is strict'; },
    hello: () => { setTimeout(closeCode, 0); return 'Phone connected'; } };
  const poll = async () => {
    inflight++;
    try {
      const r = await fetch('/api/remote/poll?code=' + code + '&after=' + after, { cache: 'no-store' }), j = await r.json();
      skew = j.now - Date.now();                                  // the relay's clock against ours, to time each tap's journey
      for (const t of j.taps) {
        if (t.at <= after) continue;                        // already acted on by the overlapping ask
        after = t.at;
        const named = /^weather:/.test(t.action) && document.querySelector('#wx [data-w="' + t.action.slice(8) + '"]');   // a weather picked by name
        const did = named ? (named.click(), 'Weather: ' + named.textContent) : act[t.action] ? act[t.action]() : null, took = Math.max(0, Date.now() + skew - t.at);
        if (t.action !== 'hello') { taps++; sum += took; }
        if (did) show(did);
        seen = Date.now(); phoneState();
        status((did || t.action) + ' · ' + took + ' ms' + (taps > 1 ? ' · average ' + Math.round(sum / taps) + ' ms' : ''));
      }
      if (j.taps.length) report();
    } catch (err) { status('Lost the relay, retrying…'); }
    inflight--;
  };
  const tick = () => { if (inflight < 2) poll(); setTimeout(tick, !seen || Date.now() - seen < 120000 ? FAST_MS : IDLE_MS); };
  window.rideRemote = { code, url, stats: () => ({ taps, average: taps ? Math.round(sum / taps) : null }) };   // for testing
  btn.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && ride().setDevices) ride().setDevices(false);   // close Devices so the code is in clear view
    if (started) { phoneState(); return; } started = true; phoneState();
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = () => { const q = qrcode(0, 'M'); q.addData(url); q.make(); $('rm-qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); $('rm-qr').firstChild.style.cssText = 'background:#fff;border-radius:10px;display:block;margin:0 auto;width:min(260px,100%);height:auto'; };
    s.onerror = () => { $('rm-qr').textContent = 'Could not draw the code. Type the address below into your phone.'; };
    document.head.appendChild(s);
    tick(); setInterval(report, 3000);                     // and keep the phone up to date with changes made on the laptop
  };
})();
