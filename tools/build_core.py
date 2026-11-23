"""Build Col de la Core from OSM road geometry, IGN BD TOPO 3D road heights and Skadi terrain."""
import array,base64,bisect,gzip,json,math,pathlib,struct,sys,tempfile,time,urllib.parse,urllib.request

cache=pathlib.Path(tempfile.gettempdir())/'core-ride'
cache.mkdir(exist_ok=True)
def fetch(name,url):
    p=cache/name
    if not p.exists():
        for attempt in range(4):
            try:
                b=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GoldenHourRide/1.0'}),timeout=45).read()
                p.write_bytes(b);break
            except OSError:
                if attempt==3:raise
                time.sleep(attempt+1)
    return p.read_bytes()

route=json.loads(fetch('d17.json','https://routing.openstreetmap.de/routed-car/route/v1/driving/1.201317,42.864251;1.104994,42.858903;1.029408,42.903090?overview=full&geometries=geojson&steps=true'))['routes'][0]
from build_route_gpx import CORE_ORIGIN, CORE_METRES, write_course_routes
cx,cy=CORE_ORIGIN
mx,my=CORE_METRES
def xy(lon,lat):return ((lon-cx)*mx,(cy-lat)*my)
def resample(coords):
    pts=[xy(*p) for p in coords];out=[pts[0]];distance=0;next_point=15
    for a,b in zip(pts,pts[1:]):
        d=math.dist(a,b)
        while next_point<distance+d:
            k=(next_point-distance)/d;out.append(tuple(v+(w-v)*k for v,w in zip(a,b)));next_point+=15
        distance+=d
    if math.dist(out[-1],pts[-1])<4:out.pop()
    return out+[pts[-1]]
sides=[]
for leg in route['legs']:
    coords=[]
    for step in leg['steps']:coords+=step['geometry']['coordinates']
    sides.append(resample(coords))
road=sides[0]+sides[1][1:];summit=len(sides[0])-1
assert 13000<route['legs'][0]['distance']<14500 and 13500<route['legs'][1]['distance']<14600
lake_data=json.loads(fetch('lac-bethmale.json','https://api.openstreetmap.org/api/0.6/map.json?bbox=1.08000,42.85850,1.08800,42.86400'))
nodes={e['id']:(e['lon'],e['lat']) for e in lake_data['elements'] if e['type']=='node'}
ways={e['id']:e for e in lake_data['elements'] if e['type']=='way'}
water=ways[104214072]
assert water['tags']['wikidata']=='Q3215365' and 'Bethmale' in water['tags']['name']
assert water['tags']['natural']=='water' and water['nodes'][0]==water['nodes'][-1]
lake=[xy(*nodes[n]) for n in water['nodes']]
# The D17 stays above the lake. Use the actual junction with the surfaced
# parking access road rather than the closest point to a shoreline vertex.
access_way=ways[104214063]
d17_nodes={n for way in ways.values() if way.get('tags',{}).get('ref','').replace(' ','')=='D17' for n in way['nodes']}
junction,=set(access_way['nodes']) & d17_nodes
access=xy(*nodes[junction])
lake_i=min(range(summit,len(road)),key=lambda i:math.dist(road[i],access))
assert math.dist(road[lake_i],access)<10 and min(math.dist(p,access) for p in lake)<350
assert access_way['tags']['surface']=='asphalt'
lake_height=json.loads(fetch('lac-bethmale-ign.json','https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=1.08412&lat=42.86062&resource=ign_rge_alti_wld'))['elevations'][0]['z']
assert 1040<lake_height<1070
# The DEM includes cuttings and banks beside the carriageway. Match OSM samples
# to IGN's 3D D17 centreline instead. On this route the old 3-point DEM mean
# produced 32% at the lake junction and 36% on the Seix side.
def road_elevations():
    crs = 'urn:ogc:def:crs:OGC::CRS84'
    query = dict(service='WFS', version='2.0.0', request='GetFeature',
                 typeNames='BDTOPO_V3:troncon_de_route', srsName=crs,
                 bbox='1.026,42.846,1.205,42.906,' + crs, count=5000,
                 propertyName='geometrie,cpx_numero,methode_d_acquisition_altimetrique,precision_altimetrique',
                 outputFormat='application/json')
    data = json.loads(fetch('ign-bdtopo-area.json',
                            'https://data.geopf.fr/wfs/ows?' + urllib.parse.urlencode(query)))
    assert data['numberMatched'] == len(data['features']), 'Incomplete IGN road coverage'
    segments = []
    for feature in data['features']:
        if feature['properties']['cpx_numero'] != 'D17':
            continue
        coordinates = feature['geometry']['coordinates']
        for start, end in zip(coordinates, coordinates[1:]):
            if min(start[2], end[2]) < 450:  # Ignore missing road Z values.
                continue
            ax, az = xy(*start[:2])
            bx, bz = xy(*end[:2])
            dx, dz = bx - ax, bz - az
            length2 = dx * dx + dz * dz
            if length2:
                segments.append((min(ax,bx)-10, max(ax,bx)+10, min(az,bz)-10, max(az,bz)+10,
                                 ax, az, dx, dz, length2, start[2], end[2]-start[2]))

    result = []
    for x, z in road:
        candidates = []
        for left, right, top, bottom, ax, az, dx, dz, length2, height, rise in segments:
            if left <= x <= right and top <= z <= bottom:
                position = max(0, min(1, ((x-ax)*dx + (z-az)*dz) / length2))
                offset = math.hypot(x-ax-position*dx, z-az-position*dz)
                candidates.append((offset, height + position*rise))
        nearest, elevation = min(candidates, default=(math.inf, None))
        assert nearest < 10, f'No matching IGN D17 segment at {x}, {z}'
        result.append(elevation)
    return result


def smooth_road(heights, anchors):
    # A triangular 45 m radius suppresses short measurement spikes. At the
    # two starts, summit and lake access the radius tapers to zero, retaining
    # each sampled landmark elevation and avoiding blurring across the crest.
    stations = [0]
    for a, b in zip(road, road[1:]):
        stations.append(stations[-1] + math.dist(a, b))
    result = heights.copy()
    for first, last in zip(anchors, anchors[1:]):
        for i in range(first + 1, last):
            centre = stations[i]
            radius = min(45, centre-stations[first], stations[last]-centre)
            left = bisect.bisect_right(stations, centre-radius)
            right = bisect.bisect_left(stations, centre+radius)
            weighted_height = total_weight = 0
            for j in range(left, right):
                weight = 1 - abs(stations[j]-centre) / radius
                weighted_height += heights[j] * weight
                total_weight += weight
            result[i] = weighted_height / total_weight
    return result


h = smooth_road(road_elevations(), [0, summit, lake_i, len(road)-1])
assert 505 < h[0] < 520 and 550 < h[-1] < 570 and abs(h[summit]-1395) < 3
assert 1040 < h[lake_i] < 1080
tiles={}
def terrain(x,z):
    lon,lat=cx+x/mx,cy-z/my
    east,north=math.floor(lon),math.floor(lat);tile=f'N{north:02d}E{east:03d}'
    if tile not in tiles:
        raw=gzip.decompress(fetch(tile+'.gz',f'https://s3.amazonaws.com/elevation-tiles-prod/skadi/N{north}/{tile}.hgt.gz'))
        vals=array.array('h');vals.frombytes(raw)
        if sys.byteorder=='little':vals.byteswap()
        tiles[tile]=vals
    vals=tiles[tile];w=math.isqrt(len(vals));px=(lon-east)*(w-1);py=(north+1-lat)*(w-1);i=min(w-2,int(px));j=min(w-2,int(py));u=px-i;v=py-j
    return (vals[j*w+i]*(1-u)+vals[j*w+i+1]*u)*(1-v)+(vals[(j+1)*w+i]*(1-u)+vals[(j+1)*w+i+1]*u)*v
size=19000;cells=475
grid=[terrain(i*size/cells-size/2,j*size/cells-size/2) for j in range(cells+1) for i in range(cells+1)]
lo,hi=min(grid),max(grid);assert 0<lo<600 and hi>1800
course=dict(name='Col de la Core',size=size,cells=cells,demMin=lo,demMax=hi,dem=base64.b64encode(struct.pack('<%dH'%len(grid),*[round(65535*(v-lo)/(hi-lo)) for v in grid])).decode(),road=[[round(x,2),round(y,2),round(z,2)] for (x,z),y in zip(road,h)],summit=summit,lakeIndex=lake_i,lake=[[round(x,1),round(z,1)] for x,z in lake],lakeHeight=lake_height,credit='Road and lake © OpenStreetMap contributors (ODbL). Road elevations IGN BD TOPO 3D; lake elevation IGN RGE ALTI (Licence Ouverte). Terrain from AWS Terrain Tiles / SRTM.')
# Coarser heights beyond the main 19 km square supply the visible Pyrenean
# skyline. Whole metres retain more detail than the source resolution needs.
horizon_size=57000
horizon_cells=228
horizon=[round(terrain(i*250-horizon_size/2,j*250-horizon_size/2))
         for j in range(horizon_cells+1) for i in range(horizon_cells+1)]
assert min(horizon)>0 and max(horizon)>2500
course['horizon']=dict(size=horizon_size,cells=horizon_cells,
    heights=base64.b64encode(struct.pack('<%dH'%len(horizon),*horizon)).decode())
pathlib.Path('assets/core.js').write_text('window.RIDE_COURSES ||= {};\nwindow.RIDE_COURSES.core='+json.dumps(course,separators=(',',':'))+';',encoding='utf8')
print('Seix and Bethmale distances', [l['distance'] for l in route['legs']], 'summit height',h[summit],'lake index',lake_i)

write_course_routes('core', course)
