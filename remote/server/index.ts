import { capsule, endpoint, json, string, table } from "@spacefast/zero/server";

// The phone remote's relay. A phone posts a tap under the pairing code shown on the laptop;
// the laptop asks for taps newer than the last one it saw. Taps are deleted once they are a minute old.
const CODE = /^[a-z0-9]{6,12}$/, ACTION = /^(gear[+-]|weather(:[a-z]{3,12})?|pacer([+-]|:(on|off|wait|strict))?|stop|hello)$/;

export default capsule({
  name: "golden-hour-ride",
  schema: {
    taps: table({ code: string(), action: string(), at: string() }).index("by_code", ["code"]),
    states: table({ code: string(), data: string(), at: string() }).index("by_code", ["code"]),
  },
  endpoints: {
    tap: endpoint({ mode: "write", method: "POST", path: "/api/remote/tap" }, async (ctx, req) => {
      const body = (await req.json()) as { code?: string; action?: string };
      if (!body || !CODE.test(body.code ?? "") || !ACTION.test(body.action ?? "")) return json({ ok: false });
      const now = Date.now();
      if (Math.random() < 0.1) {                          // tidy taps over a minute old about one tap in ten, to keep each tap quick
        const old = await ctx.db.taps.withIndex("by_code", (r) => r.eq("code", body.code!)).collect();
        for (const row of old) if (now - Number(row.at) > 60000) await ctx.db.taps.delete(row.id);
      }
      await ctx.db.taps.insert({ code: body.code!, action: body.action!, at: String(now) });
      return json({ ok: true, at: now });
    }),
    // the laptop posts what the ride is doing (gear, weather, pacer), so the phone can show it
    setState: endpoint({ mode: "write", method: "POST", path: "/api/remote/state" }, async (ctx, req) => {
      const body = (await req.json()) as { code?: string; state?: unknown };
      const data = JSON.stringify(body?.state ?? {});
      if (!body || !CODE.test(body.code ?? "") || data.length > 600) return json({ ok: false });
      const old = await ctx.db.states.withIndex("by_code", (r) => r.eq("code", body.code!)).collect();
      for (const row of old) await ctx.db.states.delete(row.id);
      await ctx.db.states.insert({ code: body.code!, data, at: String(Date.now()) });
      return json({ ok: true });
    }),
    getState: endpoint({ mode: "read", method: "GET", path: "/api/remote/state" }, async (ctx, req) => {
      const q = req.query as any, code = String((q && typeof q.get === "function" ? q.get("code") : q?.code) ?? "");
      if (!CODE.test(code)) return json({ state: null });
      const row = await ctx.db.states.withIndex("by_code", (r) => r.eq("code", code)).first();
      return json({ state: row ? JSON.parse(row.data) : null, at: row ? Number(row.at) : 0 });
    }),
    poll: endpoint({ mode: "read", method: "GET", path: "/api/remote/poll" }, async (ctx, req) => {
      // the query arrives as a plain object or as URLSearchParams, depending on the runtime version
      const q = req.query as any, get = (k: string) => (q && typeof q.get === "function" ? q.get(k) : q?.[k]);
      const code = String(get("code") ?? ""), after = Number(get("after") ?? 0);
      if (get("debug")) return json({ query: typeof q, keys: q ? Object.keys(q) : [], url: req.url, code, after });
      if (!CODE.test(code)) return json({ taps: [], now: Date.now() });
      const rows = await ctx.db.taps.withIndex("by_code", (r) => r.eq("code", code)).collect();
      const taps = rows.map((r) => ({ action: r.action, at: Number(r.at) })).filter((t) => t.at > after).sort((a, b) => a.at - b.at);
      return json({ taps, now: Date.now() });
    }),
  },
});
