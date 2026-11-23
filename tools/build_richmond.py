"""Build the clockwise Richmond Park road circuit from OSM and EA LiDAR.
Run from the project root with Python and Pillow. Supply the cached Overpass JSON
as the first argument, or omit it to fetch the roads, woodland and named gates.
"""
import time, tempfile
import base64, collections, heapq, json, math, pathlib, struct, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw
from terrain_grid import to_bng, read_tiff
from build_route_gpx import write_course_routes

cache = pathlib.Path(tempfile.gettempdir())/'golden-hour-richmond-source'
cache.mkdir(parents=True, exist_ok=True)
def fetch(url, path):
    if not path.exists():
        for attempt in range(4):
            try:
                request = urllib.request.Request(url,headers={'User-Agent':'GoldenHourRide/1.0'})
                data=urllib.request.urlopen(request,timeout=35).read()
                break
            except OSError:
                if attempt==3: raise
                time.sleep(2**attempt)
        path.write_bytes(data)
    return path.read_bytes()

box = '(51.419,-0.311,51.46,-0.245)'
query = '[out:json][timeout:60];(' + ''.join(s + box + ';' for s in (
    'way["highway"~"^(primary|secondary|tertiary|unclassified|residential|service)$"]',
    'way["natural"="wood"]','way["landuse"="forest"]','node["barrier"="gate"]')) + ');out geom;'
raw = pathlib.Path(sys.argv[1]).read_bytes() if len(sys.argv)>1 else fetch(
    'https://overpass-api.de/api/interpreter?'+urllib.parse.urlencode({'data':query}), cache/'map.json')
elements = json.loads(raw)['elements']
# This two-lane carriageway is tagged pedestrian after its closure to motors.
# The adjacent Tamsin Trail is a different, unpaved route.
broomfield_way = 838833357
if not any(el['type']=='way' and el['id']==broomfield_way for el in elements):
    detail=json.loads(fetch(f'https://api.openstreetmap.org/api/0.6/way/{broomfield_way}/full.json',
                            cache/'broomfield-carriageway.json'))['elements']
    positions={el['id']:el for el in detail if el['type']=='node'}
    way=next(el for el in detail if el['type']=='way' and el['id']==broomfield_way)
    way['geometry']=[positions[node] for node in way['nodes']]
    elements.append(way)
carriageway=next(el for el in elements if el['type']=='way' and el['id']==broomfield_way)
assert carriageway['tags'].get('name')=='Broomfield Hill' and carriageway['tags'].get('surface')=='asphalt'
nodes, edges, woods, gates = {}, collections.defaultdict(list), [], {}
for el in elements:
    t = el.get('tags',{})
    if el['type']=='node':
        if t.get('name') in ['Richmond Gate','Kingston Gate','Roehampton Gate','Robin Hood Gate','Ham Gate','Sheen Gate']:
            gates[t['name']] = to_bng(el['lat'],el['lon'])
        continue
    pts = [to_bng(p['lat'],p['lon']) for p in el['geometry']]
    if t.get('natural')=='wood' or t.get('landuse')=='forest':
        if el['nodes'][0]==el['nodes'][-1]: woods.append(pts)
    elif t.get('highway') and t.get('bicycle')!='no':
        nodes.update(zip(el['nodes'],pts))
        for a,b in zip(el['nodes'],el['nodes'][1:]):
            d=math.dist(nodes[a],nodes[b])
            edges[a].append((b,d));edges[b].append((a,d))

def nearest(lat,lon):
    xy=to_bng(lat,lon)
    return min(nodes,key=lambda n:math.dist(xy,nodes[n]))
def path(a,b):
    queue=[(0,a)];prev={a:None};dist={a:0}
    while queue:
        cost,n=heapq.heappop(queue)
        if n==b: break
        if cost>dist[n]: continue
        for nxt,d in edges[n]:
            if cost+d<dist.get(nxt,math.inf):
                dist[nxt]=cost+d;prev[nxt]=n;heapq.heappush(queue,(cost+d,nxt))
    route=[]
    while b!=a: route.append(nodes[b]);b=prev[b]
    return [nodes[a]]+route[::-1]

anchors=[nearest(*p) for p in [(51.4537357,-.2573296),(51.436682,-.2576242),(51.4329686,-.2686085),(51.4218,-.28618),(51.4330,-.28706),(51.44976,-.29538),(51.45190,-.26734)]]
line=[]
for i,(a,b) in enumerate(zip(anchors,anchors[1:]+anchors[:1])):
    if i==1:
        ids=carriageway['nodes']
        if ids[0]==b:ids=ids[::-1]
        assert (ids[0],ids[-1])==(a,b),'Check the Robin Hood Gate and Broomfield car park junctions'
        segment=[nodes[n] for n in ids]
    else: segment=path(a,b)
    line.extend(segment[:-1])
line.append(line[0])
length=sum(map(math.dist,line,line[1:]))
assert 10000<length<12000,(length,'unexpected circuit')
# Spread the samples evenly around the complete loop, including its closing
# interval. A short final interval would turn centimetres of noise into a spike.
sample_count=round(length/10)
spacing=length/sample_count
road=[]; pos=0
for a,b in zip(line,line[1:]):
    d=math.dist(a,b)
    while len(road)<sample_count and len(road)*spacing<pos+d:
        f=(len(road)*spacing-pos)/d
        road.append(tuple(x+(y-x)*f for x,y in zip(a,b)))
    pos+=d
ce=round((min(x for x,y in road)+max(x for x,y in road))/20)*10
cn=round((min(y for x,y in road)+max(y for x,y in road))/20)*10
cells=500;size=5000
left,top=ce-size//2,cn+size//2
ident='13787b9a-26a4-4775-8523-806d13af58fc'
def tile(key):
    i,j=key;e=left+i*1000;n=top-j*1000
    url=f'https://environment.data.gov.uk/geoservices/datasets/{ident}/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId={ident}__Lidar_Composite_Elevation_DTM_1m&subset=E({e},{e+1000})&subset=N({n-1000},{n})&format=image/tiff&scalefactor=0.25'
    w,h,z=read_tiff(fetch(url,cache/f'{e}-{n}.tif'));assert w==h==250
    return key,z
with ThreadPoolExecutor(max_workers=3) as pool:
    tiles=dict(pool.map(tile,[(i,j) for i in range(5) for j in range(5)]))
def sample(x,y):
    fx=max(0,min(1249,(x-left)/4-.5));fy=max(0,min(1249,(top-y)/4-.5))
    ix,iy=int(fx),int(fy)
    def cell(i,j):
        i=min(i,1249);j=min(j,1249)
        return tiles[i//250,j//250][(j%250)*250+i%250]
    vals=[cell(ix,iy),cell(ix+1,iy),cell(ix,iy+1),cell(ix+1,iy+1)]
    assert all(-10<v<200 for v in vals), (x,y,vals)
    a,b,c,d=vals;u,v=fx-ix,fy-iy
    return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v
grid=[sample(left+i*10,top-j*10) for j in range(501) for i in range(501)]
lo,hi=min(grid),max(grid)
z=[sample(x,y) for x,y in road]
heights=[sum(z[(i+k)%len(z)]*w for k,w in zip(range(-2,3),[1,2,3,2,1]))/9 for i in range(len(z))]
mask=Image.new('1',(501,501));draw=ImageDraw.Draw(mask)
for pts in woods:draw.polygon([((x-left)/10,(top-y)/10) for x,y in pts],fill=1)
bits=bytearray((501**2+7)//8)
for idx,v in enumerate(mask.getdata()):
    if v:bits[idx//8]|=1<<(idx%8)
enc=lambda b:base64.b64encode(b).decode()
course=dict(name='Richmond Park',size=size,cells=cells,origin=[ce,cn],demMin=lo,demMax=hi,
    road=[[round(x-ce,2),round(h,2),round(cn-y,2)] for (x,y),h in zip(road,heights)],
    gates=[[name,round(x-ce),round(cn-y)] for name,(x,y) in gates.items()],
    dem=enc(struct.pack('<%dH'%len(grid),*[round((h-lo)*65535/(hi-lo)) for h in grid])),
    osm=dict(woods=enc(bits),trees=[],buildings=[],lines=[],credit=''),
    credit='Roads, gates and woodland © OpenStreetMap contributors (ODbL). Elevations © Environment Agency, Open Government Licence v3.0.')
pathlib.Path('assets/richmond.js').write_text('window.RIDE_COURSES ||= {};\nwindow.RIDE_COURSES.richmond = '+json.dumps(course,separators=(',',':'))+';\n',encoding='utf8')
print('Circuit',round(length),'metres; ascent',round(sum(max(0,b-a) for a,b in zip(heights,heights[1:]+heights[:1]))),'metres;',len(woods),'woodland polygons;',len(gates),'gates')


write_course_routes('richmond', course)
