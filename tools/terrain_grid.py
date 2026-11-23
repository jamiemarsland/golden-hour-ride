"""British National Grid conversion and Environment Agency coverage decoding."""
import math
import struct

def to_bng(lat, lon):
    a, b = 6378137.0, 6356752.3142; e2 = 1 - b * b / (a * a)
    p, l = math.radians(lat), math.radians(lon)
    nu = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    x, y, z = nu * math.cos(p) * math.cos(l), nu * math.cos(p) * math.sin(l), (1 - e2) * nu * math.sin(p)
    s, sec = 20.4894e-6, math.pi / 648000
    rx, ry, rz = -0.1502 * sec, -0.247 * sec, -0.8421 * sec
    x2 = -446.448 + (1 + s) * x - rz * y + ry * z
    y2 = 125.157 + rz * x + (1 + s) * y - rx * z
    z2 = -542.06 - ry * x + rx * y + (1 + s) * z
    a, b = 6377563.396, 6356256.909; e2 = 1 - b * b / (a * a)
    pr = math.hypot(x2, y2); phi = math.atan2(z2, pr * (1 - e2))
    for _ in range(10):
        nu = a / math.sqrt(1 - e2 * math.sin(phi) ** 2); phi = math.atan2(z2 + e2 * nu * math.sin(phi), pr)
    lam = math.atan2(y2, x2)
    F0, phi0, lam0, n = 0.9996012717, math.radians(49), math.radians(-2), (a - b) / (a + b)
    sn, c, t = math.sin(phi), math.cos(phi), math.tan(phi)
    nu = a * F0 / math.sqrt(1 - e2 * sn * sn)
    rho = a * F0 * (1 - e2) / (1 - e2 * sn * sn) ** 1.5; eta2 = nu / rho - 1
    dp, sp = phi - phi0, phi + phi0
    M = b * F0 * ((1 + n + 1.25 * n * n + 1.25 * n ** 3) * dp - (3 * n + 3 * n * n + 2.625 * n ** 3) * math.sin(dp) * math.cos(sp)
                  + (1.875 * n * n + 1.875 * n ** 3) * math.sin(2 * dp) * math.cos(2 * sp) - (35 / 24) * n ** 3 * math.sin(3 * dp) * math.cos(3 * sp))
    d = lam - lam0
    N = M - 100000 + nu / 2 * sn * c * d * d + nu / 24 * sn * c ** 3 * (5 - t * t + 9 * eta2) * d ** 4 + nu / 720 * sn * c ** 5 * (61 - 58 * t * t + t ** 4) * d ** 6
    E = 400000 + nu * c * d + nu / 6 * c ** 3 * (nu / rho - t * t) * d ** 3 + nu / 120 * c ** 5 * (5 - 18 * t * t + t ** 4 + 14 * eta2 - 58 * t * t * eta2) * d ** 5
    return E, N

def read_tiff(buf):
    le = buf[:2] == b'II'; f = '<' if le else '>'
    u16 = lambda o: struct.unpack_from(f + 'H', buf, o)[0]
    u32 = lambda o: struct.unpack_from(f + 'I', buf, o)[0]
    ifd = u32(4); n = u16(ifd); tags = {}
    for i in range(n):
        o = ifd + 2 + i * 12; tag, typ, count = u16(o), u16(o + 2), u32(o + 4)
        size = 2 if typ == 3 else 4
        at = o + 8 if count * size <= 4 else u32(o + 8)
        tags[tag] = [u16(at + k * 2) if size == 2 else u32(at + k * 4) for k in range(min(count, 8192))]
    w, h = tags[256][0], tags[257][0]
    if tags.get(259, [1])[0] != 1 or tags.get(258, [0])[0] != 32: raise ValueError('unexpected LiDAR tile format (compression %s, bits %s)' % (tags.get(259), tags.get(258)))
    tw = tags.get(322, [w])[0]; th = tags.get(323, tags.get(278, [h]))[0]
    offs = tags.get(324) or tags[273]; across = math.ceil(w / tw)
    out = [0.0] * (w * h)
    for y in range(h):
        base = y * w
        for x0 in range(0, w, tw):
            t = (y // th) * across + x0 // tw
            cnt = min(tw, w - x0)
            out[base + x0: base + x0 + cnt] = struct.unpack_from(f + '%df' % cnt, buf, offs[t] + ((y % th) * tw) * 4)
    return w, h, out

