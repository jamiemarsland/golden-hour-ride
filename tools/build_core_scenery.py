"""Package roadside buildings and the mapped Lac de Bethmale car-park access.

Run from the project root after build_core.py. Small OSM extracts are cached
locally. The game uses the resulting file and does not query map services.
"""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
import base64
import struct
import json
import math
from pathlib import Path
from tempfile import gettempdir
from time import sleep
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(gettempdir()) / 'core-ride'
CACHE.mkdir(exist_ok=True)
SOURCE = 'https://api.openstreetmap.org/api/0.6/map.json?bbox='
CX, CY = 1.116, 42.874
MX, MY = 111320 * math.cos(math.radians(CY)), 111132


def extract(bounds):
    bbox = ','.join(f'{v:.5f}' for v in bounds)
    path = CACHE / f'scenery-{bbox}.json'
    if not path.exists():
        request = Request(SOURCE+bbox, headers={'User-Agent': 'GoldenHourRide local course builder/1.0'})
        for attempt in range(4):
            try:
                with urlopen(request, timeout=45) as response:
                    data = response.read()
                json.loads(data)
                path.write_bytes(data)
                break
            except OSError:
                if attempt == 3:
                    raise
                sleep(2**attempt)
    return json.loads(path.read_bytes())['elements']


def footprint(points, tags):
    # Orient an approximate footprint along its narrowest bounding rectangle.
    best = None
    for (x,z), (xx,zz) in zip(points, points[1:]):
        if x==xx and z==zz:
            continue
        angle = math.atan2(zz-z,xx-x)
        c, s = math.cos(angle), math.sin(angle)
        us = [a*c+b*s for a,b in points]
        vs = [-a*s+b*c for a,b in points]
        w, d = max(us)-min(us), max(vs)-min(vs)
        if min(w,d)<1:
            continue
        u, v = (max(us)+min(us))/2, (max(vs)+min(vs))/2
        candidate = (w*d,round(u*c-v*s,1),round(u*s+v*c,1),round(w,1),round(d,1),round(angle,3))
        if best is None or candidate[0]<best[0]:
            best = candidate
    if best is None:
        return None
    default = 2.7 if tags['building'] in ('shed','garage','roof') else 5.2
    try:
        height = float(tags.get('height',float(tags.get('building:levels',default/3))*3))
    except ValueError:
        height = default
    return [*best[1:],round(min(25,max(2,height)),1),int(tags.get('roof:shape')!='flat')]


def lake_ground(centre_x,centre_z):
    # The forested lake basin sits below the surrounding canopy. Sample the
    # IGN ground survey locally to retain the real shore and access-road grade.
    spacing,cells=15,64
    left=round(centre_x-spacing*cells/2)
    top=round(centre_z-spacing*cells/2)
    def row(j):
        xs=[left+i*spacing for i in range(cells+1)]
        lons='|'.join(f'{CX+x/MX:.6f}' for x in xs)
        lats='|'.join([f'{CY-(top+j*spacing)/MY:.6f}']*len(xs))
        path=CACHE/f'lake-ground-{left}-{top}-{spacing}-{j}.json'
        if not path.exists():
            query=urlencode(dict(lon=lons,lat=lats,resource='ign_rge_alti_wld'))
            request=Request('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?'+query,
                            headers={'User-Agent':'GoldenHourRide local course builder/1.0'})
            for attempt in range(4):
                try:
                    with urlopen(request,timeout=45) as res:
                        data=res.read()
                    assert len(json.loads(data)['elevations'])==len(xs)
                    path.write_bytes(data)
                    break
                except OSError:
                    if attempt==3:raise
                    sleep(2**attempt)
        return [round(v['z']*10) for v in json.loads(path.read_bytes())['elevations']]
    with ThreadPoolExecutor(max_workers=2) as pool:
        heights=[v for r in pool.map(row,range(cells+1)) for v in r]
    assert min(heights)>8000 and max(heights)<18000
    packed=base64.b64encode(struct.pack('<%dH'%len(heights),*heights)).decode()
    return dict(x=left,z=top,spacing=spacing,cells=cells,decimetres=packed)


def surveyed_lanes(lanes):
    # The same IGN road network extract used by build_core.py includes the
    # car-park lane and forest access. Its centreline avoids ground-model
    # artefacts next to steep banks and trees.
    data=json.loads((CACHE/'ign-bdtopo-area.json').read_bytes())
    local=[]
    lane_points=[p for _,width,line in lanes if width>2 for p in line]
    x0=min(p[0] for p in lane_points)-20
    x1=max(p[0] for p in lane_points)+20
    z0=min(p[1] for p in lane_points)-20
    z1=max(p[1] for p in lane_points)+20
    for feature in data['features']:
        if feature['properties']['cpx_numero']=='D17':
            continue
        pts=[((lon-CX)*MX,(CY-lat)*MY,h) for lon,lat,h in feature['geometry']['coordinates']]
        if not any(x0<x<x1 and z0<z<z1 for x,z,_ in pts):
            continue
        for (x,z,y),(xx,zz,yy) in zip(pts,pts[1:]):
            dx,dz=xx-x,zz-z
            l2=dx*dx+dz*dz
            if l2 and min(y,yy)>500:
                local.append((x,z,y,dx,dz,yy-y,l2))
    profiles={}
    for way,width,line in lanes:
        if width<2:continue
        heights=[]
        for x,z in line:
            best=10
            height=None
            for ax,az,base,dx,dz,dy,l2 in local:
                t=max(0,min(1,((x-ax)*dx+(z-az)*dz)/l2))
                d=math.hypot(ax+dx*t-x,az+dz*t-z)
                if d<best:
                    best=d;height=round(base+t*dy,2)
            heights.append(height)
        if any(a is not None and b is not None for a,b in zip(heights,heights[1:])):
            profiles[way]=heights
    assert profiles[104214063][1] and profiles[1125735323][2]
    return profiles


def main():
    core = json.loads((ROOT/'assets/core.js').read_text(encoding='utf8').split('core=',1)[1].rstrip(';\n'))
    road = [(x,z) for x,_,z in core['road']]
    tiles = {(math.floor((CX+x/MX)/.02),math.floor((CY-z/MY)/.014)) for x,z in road}
    items = {}
    for i,j in sorted(tiles):
        for item in extract((i*.02-.002,j*.014-.002,(i+1)*.02+.002,(j+1)*.014+.002)):
            items[item['type'],item['id']] = item
    points = {i:(round((e['lon']-CX)*MX,1),round((CY-e['lat'])*MY,1))
              for (kind,i),e in items.items() if kind=='node'}
    grid = defaultdict(list)
    for x,z in road:
        grid[math.floor(x/350),math.floor(z/350)].append((x,z))
    def nearby(x,z):
        gx,gz = math.floor(x/350),math.floor(z/350)
        return any((x-a)**2+(z-b)**2 < 350**2 for i in range(gx-1,gx+2)
                   for j in range(gz-1,gz+2) for a,b in grid.get((i,j),[]))
    lake_x = sum(x for x,z in core['lake'])/len(core['lake'])
    lake_z = sum(z for x,z in core['lake'])/len(core['lake'])
    buildings, footprints, lanes, parking = [], [], [], []
    for (kind,i),e in sorted(items.items()):
        t=e.get('tags',{})
        if kind!='way' or not any(k in t for k in ('building','highway','amenity')):
            continue
        line=[points[n] for n in e['nodes'] if n in points]
        if len(line)<2:
            continue
        x,z=line[0]
        at_lake = math.hypot(x-lake_x,z-lake_z)<650
        if 'building' in t and len(line)>=4 and (at_lake or nearby(x,z)):
            building=footprint(line,t)
            if building:
                buildings.append(building)
                footprints.append(line[:-1] if line[-1]==line[0] else line)
        if at_lake and t.get('amenity')=='parking' and line[0]==line[-1]:
            parking.append(line[:-1])
        if at_lake and t.get('highway') in ('unclassified','service','footway','path'):
            if not any(math.hypot(a-lake_x,b-lake_z)>1000 for a,b in line):
                paved=t['highway'] in ('unclassified','service')
                width=4.5 if t.get('surface')=='asphalt' else 2.8 if paved else 1.5
                lanes.append([i,width,line])
    assert len(buildings)>200 and any(i==104214063 for i,_,_ in lanes) and len(parking)>=2
    data=dict(buildings=buildings,footprints=footprints,lanes=lanes,parking=parking,profiles=surveyed_lanes(lanes),ground=lake_ground(lake_x,lake_z))
    (ROOT/'assets/core-scenery.js').write_text('window.RIDE_COURSES.core.scenery='+
        json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
    print(f'{len(buildings)} mapped buildings, {len(lanes)} lanes/paths and {len(parking)} parking areas')


if __name__=='__main__':
    main()
