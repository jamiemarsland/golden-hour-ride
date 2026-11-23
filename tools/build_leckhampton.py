"""Builds assets/leckhampton.js: the Leckhampton Hill loop as a road line plus a terrain height grid.

Route: OpenStreetMap routing service (car profile) through the loop's waypoints.
Heights: Environment Agency LiDAR Composite DTM (1 m survey), Open Government Licence.
  Road profile sampled at 2 m; surrounding terrain at 10 m.
Run from the project folder:  python3 tools/build_leckhampton.py
"""
import base64, json, math, os, struct, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

CACHE = sys.argv[1] if len(sys.argv) > 1 else 'tools/.cache'
os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'golden-hour-ride-poc'}
WAYPOINTS = [[51.8826, -2.0790], [51.8595, -2.0823], [51.8592, -2.0613], [51.8527, -2.0477], [51.8749, -2.0524], [51.8818, -2.0555], [51.8826, -2.0790]]
WCS = 'https://environment.data.gov.uk/geoservices/datasets/13787b9a-26a4-4775-8523-806d13af58fc/wcs'
COV = '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m'

def get(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        for attempt in range(8):            # the LiDAR server rate-limits: back off and retry
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read(); break
            except urllib.error.HTTPError as ex:
                if ex.code != 429 or attempt == 7: raise
                time.sleep(4 + attempt * 4)
        open(path, 'wb').write(data)
        time.sleep(0.4)
    return open(path, 'rb').read()

from terrain_grid import to_bng, read_tiff
from build_route_gpx import write_course_routes

def window(e0, n0, size, res):
    url = f'{WCS}?service=WCS&version=2.0.1&request=GetCoverage&coverageId={COV}&subset=E({e0},{e0 + size})&subset=N({n0},{n0 + size})&format=image/tiff&scalefactor={1 / res}'
    try: return read_tiff(get(url, f'lidar_{res}m_{e0}_{n0}_{size}.tif'))
    except Exception as ex: print('  window failed', e0, n0, ex); return None

class Grids:
    """A set of square LiDAR windows with bilinear lookup."""
    def __init__(self, size, res): self.size, self.res, self.g = size, res, {}
    def need(self, keys):
        keys = [k for k in keys if k not in self.g]
        with ThreadPoolExecutor(2) as ex:
            for k, r in zip(keys, ex.map(lambda k: window(k[0] * self.size, k[1] * self.size, self.size, self.res), keys)): self.g[k] = r
    def at(self, E, N):
        i, j = math.floor(E / self.size), math.floor(N / self.size); g = self.g.get((i, j))
        if not g: return None
        w, h, d = g
        x = (E - i * self.size) / self.res - 0.5; y = ((j + 1) * self.size - N) / self.res - 0.5
        x0 = max(0, min(w - 2, math.floor(x))); y0 = max(0, min(h - 2, math.floor(y)))
        u = min(1, max(0, x - x0)); v = min(1, max(0, y - y0))
        q = [d[y0 * w + x0], d[y0 * w + x0 + 1], d[(y0 + 1) * w + x0], d[(y0 + 1) * w + x0 + 1]]
        if any(not (-500 < hh < 2000) for hh in q): return None
        return (q[0] * (1 - u) + q[1] * u) * (1 - v) + (q[2] * (1 - u) + q[3] * u) * v

# ---- route
url = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' + ';'.join(f'{lon},{lat}' for lat, lon in WAYPOINTS) + '?overview=full&geometries=geojson'
data = json.loads(get(url, 'route.json'))
latlon = [(lat, lon) for lon, lat in data['routes'][0]['geometry']['coordinates']]
print('router:', len(latlon), 'points,', round(data['routes'][0]['distance']), 'm')

def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dp = p2 - p1; dl = math.radians(b[1] - a[1])
    return 2 * 6371000 * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))
out, i = [], 0                      # cut out-and-back spurs the router adds at waypoints
while i < len(latlon):
    out.append(latlon[i]); skip, run, j = -1, 0, i + 1
    while j < len(latlon) and run < 600:
        run += hav(latlon[j - 1], latlon[j])
        if run > 20 and hav(latlon[i], latlon[j]) < 8: skip = j
        j += 1
    i = skip + 1 if skip > 0 else i + 1
bng = [to_bng(*p) for p in out]
# resample every 5 m
STEP = 5; line = [bng[0]]; carry = 0
for a, b in zip(bng, bng[1:]):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    if L == 0: continue
    d = STEP - carry
    while d <= L:
        line.append((a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L)); d += STEP
    carry = L - (d - STEP)
print('route:', len(line) * STEP, 'm after cleaning; gap between ends', round(math.hypot(line[0][0] - line[-1][0], line[0][1] - line[-1][1])), 'm')

# ---- road heights from 2 m LiDAR
fine = Grids(250, 2)
fine.need(sorted({(math.floor((E + dE) / 250), math.floor((N + dN) / 250)) for E, N in line for dE in (-12, 12) for dN in (-12, 12)}))
print('fine windows:', len(fine.g), 'missing:', sum(1 for v in fine.g.values() if v is None))
hts = []
for k, (E, N) in enumerate(line):
    a, b = line[max(0, k - 1)], line[min(len(line) - 1, k + 1)]
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1; pe, pn = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
    best = None
    for off in range(-7, 8):              # the road surface: flattest point across the road
        h0, h1, h2 = fine.at(E + pe * (off - 1.5), N + pn * (off - 1.5)), fine.at(E + pe * off, N + pn * off), fine.at(E + pe * (off + 1.5), N + pn * (off + 1.5))
        if None in (h0, h1, h2): continue
        flat = abs(h2 - h0) + abs(off) * 0.02
        if best is None or flat < best[0]: best = (flat, h1)
    hts.append(best[1] if best else None)
miss = sum(h is None for h in hts)
for k in range(len(hts)):
    if hts[k] is None: hts[k] = hts[k - 1] if k and hts[k - 1] is not None else next(h for h in hts if h is not None)
# robust smoothing: median of 5 (25 m) then two passes of a 35 m moving average
med = [sorted(hts[max(0, k - 2): k + 3])[len(hts[max(0, k - 2): k + 3]) // 2] for k in range(len(hts))]
for _ in range(2):
    med = [sum(med[max(0, k - 3): k + 4]) / len(med[max(0, k - 3): k + 4]) for k in range(len(med))]
hts = med
print('road heights: min %.1f max %.1f, missing %d of %d' % (min(hts), max(hts), miss, len(hts)))
grades = [(hts[k + 4] - hts[k]) / 20 * 100 for k in range(len(hts) - 4)]
print('steepest up %.1f%%, steepest down %.1f%%, climb %.0f m' % (max(grades), min(grades), sum(max(0, hts[k + 1] - hts[k]) for k in range(len(hts) - 1))))

# ---- terrain at 10 m
Es, Ns = [p[0] for p in line], [p[1] for p in line]
cE, cN = (min(Es) + max(Es)) / 2, (min(Ns) + max(Ns)) / 2
CELL = 10
size = math.ceil((max(max(Es) - min(Es), max(Ns) - min(Ns)) + 2 * 1300) / 200) * 200
cE, cN = round(cE / CELL) * CELL, round(cN / CELL) * CELL
cells = size // CELL
coarse = Grids(1000, CELL)
coarse.need(sorted({(i, j) for i in range(math.floor((cE - size / 2 - CELL) / 1000), math.floor((cE + size / 2 + CELL) / 1000) + 1)
                    for j in range(math.floor((cN - size / 2 - CELL) / 1000), math.floor((cN + size / 2 + CELL) / 1000) + 1)}))
print('terrain: %d m square, %d cells, windows %d, missing %d' % (size, cells, len(coarse.g), sum(1 for v in coarse.g.values() if v is None)))
grid, holes = [], 0
for iz in range(cells + 1):            # row 0 is the north edge (local z = -N)
    N = cN + size / 2 - iz * CELL
    for ix in range(cells + 1):
        h = coarse.at(cE - size / 2 + ix * CELL, N)
        if h is None: holes += 1
        grid.append(h)
for k in range(len(grid)):             # fill no-data from the left / above
    if grid[k] is None: grid[k] = grid[k - 1] if k % (cells + 1) and grid[k - 1] is not None else (grid[k - cells - 1] if k > cells and grid[k - cells - 1] is not None else None)
fallback = sum(hts) / len(hts)
grid = [fallback if h is None else h for h in grid]
lo, hi = min(grid), max(grid)
print('terrain heights: %.1f to %.1f m, no-data cells %d' % (lo, hi, holes))
q = struct.pack('<%dH' % len(grid), *[round((h - lo) / (hi - lo) * 65535) for h in grid])

# road line in local metres (x east, z south), a control point every 15 m
road = [[round(line[k][0] - cE, 2), round(hts[k], 2), round(-(line[k][1] - cN), 2)] for k in range(0, len(line) - 1, 3)]
course = {'name': 'Leckhampton Hill loop', 'size': size, 'cells': cells, 'origin': [cE, cN], 'quarry': [round(to_bng(51.8642, -2.0787)[0] - cE, 1), round(-(to_bng(51.8642, -2.0787)[1] - cN), 1)], 'demMin': lo, 'demMax': hi, 'road': road,
          'credit': 'Route © OpenStreetMap contributors. Heights: Environment Agency LiDAR, Open Government Licence.',
          'dem': base64.b64encode(q).decode()}
open('assets/leckhampton.js', 'w').write('window.RIDE_COURSES = window.RIDE_COURSES || {};\nwindow.RIDE_COURSES.leckhampton = ' + json.dumps(course) + ';\n')
print('wrote assets/leckhampton.js', os.path.getsize('assets/leckhampton.js') // 1024, 'KB;', len(road), 'road points')

write_course_routes('leckhampton', course)
