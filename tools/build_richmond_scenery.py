"""Prepare scenery for Richmond from official OSM map extracts and EA canopy heights.
Run after build_richmond.py, from the project root (Python and Pillow).
"""
import base64, collections, concurrent.futures, heapq, io, json, math, pathlib, tempfile, time, urllib.request
from PIL import Image
from terrain_grid import to_bng

root=pathlib.Path(tempfile.gettempdir())/'golden-hour-richmond-source'
root.mkdir(parents=True,exist_ok=True)
def download(name,url):
    path=root/name
    if not path.exists():
        for attempt in range(4):
            try:
                data=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GoldenHourRide local course builder/1.0'}),timeout=50).read()
                path.write_bytes(data);break
            except OSError:
                if attempt==3:raise
                time.sleep(3*(attempt+1))
    return path.read_bytes()
def map_tile(pair):
    i,j=pair
    west=-.303+i*.0125;south=51.418+j*.0105
    bbox=','.join(f'{v:.5f}' for v in (west,south,west+.0125,south+.0105))
    return json.loads(download('osm-'+bbox+'.json','https://api.openstreetmap.org/api/0.6/map.json?bbox='+bbox))['elements']
els={}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for group in pool.map(map_tile,[(i,j) for i in range(4) for j in range(4)]):
        for item in group:els[item['type'],item['id']]=item
print('OSM objects',len(els),flush=True)
from PIL import ImageDraw, ImageFilter
import random, struct
course=json.loads(pathlib.Path('assets/richmond.js').read_text(encoding='utf8').split(' = ',1)[1].rstrip(';\n'))
ce,cn=course['origin'];size=course['size'];half=size/2
points={k[1]:to_bng(v['lat'],v['lon']) for k,v in els.items() if k[0]=='node'}
points={i:(round(x-ce,1),round(cn-y,1)) for i,(x,y) in points.items()}
def waypoints(e):return [points[n] for n in e['nodes'] if n in points]
boundary=next(e for e in els.values() if e.get('tags',{}).get('leisure')=='park' and e['tags'].get('name')=='Richmond Park')
def pix(p,w):return tuple(round((v+half)*w/size) for v in p)
park=Image.new('L',(1250,1250));ImageDraw.Draw(park).polygon([pix(p,1250) for p in waypoints(boundary)],fill=255)
margin=park.filter(ImageFilter.MaxFilter(15))
gate_surrounds=margin.copy()
surround_draw=ImageDraw.Draw(gate_surrounds)
for _,x,z in course['gates']:
    i,j=pix((x,z),1250);radius=round(150*1250/size)
    surround_draw.ellipse((i-radius,j-radius,i+radius,j+radius),fill=255)
def inside(p,mask=margin):
    x,y=pix(p,1250)
    return 0<=x<1250 and 0<=y<1250 and mask.getpixel((x,y))>0
W=4096;land=Image.new('P',(W,W))
palette=[0,0,0, 67,67,60, 132,110,80, 92,93,83, 76,108,110, 189,179,148]
land.putpalette(palette+[0]*(768-len(palette)))
draw=ImageDraw.Draw(land)
areas=[];roads=[];fences=[];gates=[];buildings=[];circles=[];aisles=[];parking_lots={}
gate_nodes={}
boundary_edges={frozenset((a,b)) for a,b in zip(boundary['nodes'],boundary['nodes'][1:])}
def building(pts,t):
    best=None
    for (x,z),(xx,zz) in zip(pts,pts[1:]):
        angle=math.atan2(zz-z,xx-x);c=math.cos(angle);s=math.sin(angle)
        us=[a*c+b*s for a,b in pts];vs=[-a*s+b*c for a,b in pts]
        u,v=(max(us)+min(us))/2,(max(vs)+min(vs))/2
        w,d=max(us)-min(us),max(vs)-min(vs)
        if min(w,d)<1:continue
        rec=(w*d,round(u*c-v*s,1),round(u*s+v*c,1),round(w,1),round(d,1),round(angle,3))
        if best is None or rec[0]<best[0]:best=rec
    if best:
        try:h=float(t.get('height',float(t.get('building:levels',1))*3.1))
        except ValueError:h=4
        buildings.append([*best[1:],max(2,min(20,h)),int(t.get('roof:shape')!='flat' and best[3]<45)])
for (kind,i),e in els.items():
    t=e.get('tags',{})
    if kind=='node':
        pt=points[i]
        if not inside(pt):continue
        if t.get('barrier') in ('gate','lift_gate','swing_gate','kissing_gate','cattle_grid'):
            gates.append([*pt,t['barrier']])
            gate_nodes[i]=gates[-1]
        if t.get('highway')=='mini_roundabout':circles.append(pt)
        continue
    if kind!='way' or not t:continue
    pts=waypoints(e)
    if len(pts)<2:continue
    if not any(inside(p) for p in pts):
        # Buildings and approaches across the wall remain visible from the gate.
        if not ('building' in t or 'highway' in t) or not any(inside(p,gate_surrounds) for p in pts):continue
    if 'building' in t:building(pts,t)
    if t.get('barrier')=='wall':
        # Historic England lists the park's boundary as mixed red/brown brick
        # about eight feet high. Preserve explicit OSM heights and apply the
        # listed dimensions only to segments on the actual boundary polygon.
        current=None
        for a,b in zip(e['nodes'],e['nodes'][1:]):
            if a not in points or b not in points:continue
            mapped_brick=t.get('wall')=='brick' or t.get('material')=='brick'
            at_boundary=frozenset((a,b)) in boundary_edges
            kind='brick_wall' if mapped_brick or at_boundary else 'wall'
            height=float(t.get('height',2.44 if at_boundary else 1.35))
            if current is None or (kind,height)!=(current[0],current[2]):
                current=[kind,[points[a]],height];fences.append(current)
            current[1].append(points[b])
    elif t.get('barrier') in ('fence','wood_fence','hedge','retaining_wall'):
        fences.append([t['barrier'],pts])
    if t.get('amenity')=='parking' or t.get('natural')=='water':
        areas.append((3 if t.get('amenity')=='parking' else 4,pts))
        if t.get('amenity')=='parking':parking_lots[i]=pts
    h=t.get('highway')
    if h:
        width={'unclassified':6,'tertiary':6,'residential':5.2,'service':3.8,'track':2.8,'cycleway':2.4,'footway':1.4,'bridleway':2.4,'path':1.3,'pedestrian':6 if t.get('lanes')=='2' else 2.4}.get(h)
        if not width:continue
        try:width=min(12,max(1,float(t.get('width',width))))
        except ValueError:pass
        paved=h in ('unclassified','tertiary','residential','service') or t.get('surface') in ('asphalt','paved','concrete')
        roads.append((1 if paved else 2,width,pts))
        if t.get('service')=='parking_aisle':aisles.append(pts)

# Swing gates and cattle grids span the road or path to which their OSM node
# belongs. A nearby fence may run alongside that path at the entrance.
directions=collections.defaultdict(list)
gate_roads=collections.defaultdict(list)
priority={'secondary':4,'tertiary':4,'unclassified':4,'residential':4,'service':3,'track':2}
for e in els.values():
    if e['type']!='way' or not (highway:=e.get('tags',{}).get('highway')):continue
    ids=e['nodes']
    if highway in ('secondary','tertiary','unclassified','residential','service','pedestrian'):
        for a,b in zip(ids,ids[1:]):
            if a in points and b in points:
                distance=math.dist(points[a],points[b])
                gate_roads[a].append((b,distance));gate_roads[b].append((a,distance))
    for i,node in enumerate(ids):
        if node not in gate_nodes:continue
        x,z=points[node]
        for j in (i-1,i+1):
            if 0<=j<len(ids) and ids[j] in points:
                xx,zz=points[ids[j]];distance=math.hypot(xx-x,zz-z)
                if distance>.05:directions[node].append((priority.get(highway,1),(xx-x)/distance,(zz-z)/distance))
for node,rays in directions.items():
    highest=max(r[0] for r in rays)
    vectors=[(dx,dz) for p,dx,dz in rays if p==highest]
    dx,dz=vectors[0]
    if len(vectors)>1:
        # Bisect the two most nearly opposite approaches, including split OSM ways.
        a,b=min(((a,b) for i,a in enumerate(vectors) for b in vectors[i+1:]),
                key=lambda pair:sum(i*j for i,j in zip(*pair)))
        if math.dist(a,b)>.01:dx,dz=a[0]-b[0],a[1]-b[1]
    gate_nodes[node].append(round((math.atan2(dz,dx)+math.pi/2)%math.pi,5))

# First perimeter junction reached along the gate access road. These OSM node
# pairs are the physical gate and its turn-off; Ham Cross and Sheen Cross in
# particular are several hundred metres from their gates.
gate_links=[
    ('Richmond Gate',8111048189,3373607519),('Roehampton Gate',21090062,1687103657),
    ('Robin Hood Gate',30478533,21090177),('Kingston Gate',653846856,21090171),
    ('Ham Gate',8752652567,1692205837),('Sheen Gate',30427042,21090182)]
def access_distance(gate,junction):
    seen=set();queue=[(0,gate)]
    while queue:
        length,node=heapq.heappop(queue)
        if node==junction:return length
        if node in seen:continue
        seen.add(node)
        for other,d in gate_roads[node]:
            if other not in seen:heapq.heappush(queue,(length+d,other))
    raise ValueError(f'Disconnected gate access: OSM nodes {gate} and {junction}')
gate_approaches=[[name,*points[junction],round(access_distance(gate,junction))]
                 for name,gate,junction in gate_links]
# Each parking footprint, first mapped node inside the lot and actual perimeter
# junction. Some car parks have two driveways. The outlying lots share the gate
# approaches; projecting their polygon onto the loop would place signs elsewhere.
parking_links=[
    (25553648,370192474,30182267,'entrance'),(25553648,370192503,370192568,'exit'),
    (25553616,278523534,278523543,''),(25553616,7803555476,278523487,''),
    (561771859,5416424304,1692205837,''),(4734010,2137520081,21090233,''),
    (180996607,2115824641,21090177,''),(44533040,8156581946,21090182,''),
    (4734008,4131242286,4131242288,'entrance'),(4734008,1569106711,21090177,''),
    (29273985,1971369285,1971369290,'')]
signs=[[ *points[junction],els['way',area]['tags']['name'],round(access_distance(aisle,junction)),role]
       for area,aisle,junction,role in parking_links]
for k,pts in areas:draw.polygon([pix(p,W) for p in pts],fill=k)
for k,width,pts in sorted(roads,key=lambda item:item[0],reverse=True):
    draw.line([pix(p,W) for p in pts],fill=k,width=max(1,round(width*W/size)),joint='curve')
ground_path=pathlib.Path('assets/richmond-ground.png')
land.save(ground_path,transparency=0,optimize=True)
# Browsers allow canvas pixel reads from this data URL when launching from disk.
ground_path.with_suffix('.js').write_text(
    'window.RIDE_COURSES.richmond.groundImage="data:image/png;base64,'
    +base64.b64encode(ground_path.read_bytes()).decode('ascii')+'";\n',encoding='ascii')
ident='ecae3bef-1e1d-4051-887b-9dc613c928ec'
url=f'https://environment.data.gov.uk/geoservices/datasets/{ident}/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId={ident}__Vegetation_Object_Model_Elevation_2022&subset=E({int(ce-half)},{int(ce+half)})&subset=N({int(cn-half)},{int(cn+half)})&format=image/tiff&scalefactor=0.25'
canopy=Image.open(io.BytesIO(download('canopy.tif',url)));assert canopy.size==(1250,1250)
# Select high points and suppress neighbours within the same crown, including across woodland boundaries.
candidates=[]
for j in range(1250):
    for i in range(1250):
        h=canopy.getpixel((i,j))
        if 4<=h<=55 and gate_surrounds.getpixel((i,j)):candidates.append((h,i,j))
taken=Image.new('1',(1250,1250));brush=ImageDraw.Draw(taken);trees=[]
for h,i,j in sorted(candidates,reverse=True):
    if taken.getpixel((i,j)):continue
    x,z=(i+.5)*4-half,(j+.5)*4-half
    r=max(1,min(4,round(h*.46/4)));brush.ellipse((i-r,j-r,i+r,j+r),fill=1)
    if land.getpixel(pix((x,z),W)):continue
    trees.append([round(x),round(z),round(h,1)])
# Herds get short, pre-checked routes in clearings near the perimeter road.
obstacles=Image.new('1',(1250,1250));obstacle_draw=ImageDraw.Draw(obstacles)
for _,pts,*_ in fences:obstacle_draw.line([pix(p,1250) for p in pts],fill=1,width=2)
for e in els.values():
    if e.get('type')=='way' and 'building' in e.get('tags',{}):
        footprint=[pix(p,1250) for p in waypoints(e)]
        if len(footprint)>=3:obstacle_draw.polygon(footprint,fill=1)
rng=random.Random(612);deer=[];road=course['road']
for base in range(0,len(road),65):
    for _ in range(35):
        x,_,z=road[base];angle=rng.random()*math.tau;distance=rng.uniform(28,85)
        x+=math.cos(angle)*distance;z+=math.sin(angle)*distance
        if any(math.hypot(x-a,z-b)<70 for a,b,*_ in deer):continue
        group=[]
        for _ in range(6):
            a=x+rng.uniform(-9,9);b=z+rng.uniform(-9,9);dx,dz=rng.uniform(-12,12),rng.uniform(-12,12)
            path=[(a+dx*t/8,b+dz*t/8) for t in range(9)]
            if all(inside(p) and park.getpixel(pix(p,1250)) and not obstacles.getpixel(pix(p,1250)) and not land.getpixel(pix(p,W)) and canopy.getpixel(pix(p,1250))<3 for p in path):
                group.append([round(a,1),round(b,1),round(dx,1),round(dz,1)])
        if len(group)>=3:deer+=group;break
# Recover branch mouths from mapped lines which meet the circuit. A short 3-D
# apron bridges the game's raised carriageway and its lower terrain shoulder.
route_grid=collections.defaultdict(list)
for x,_,z in road:route_grid[int(x//25),int(z//25)].append((x,z))
def road_distance(p):
    gx,gz=(int(v//25) for v in p)
    return min((math.dist(p,a) for dx in (-1,0,1) for dz in (-1,0,1)
                for a in route_grid.get((gx+dx,gz+dz),[])),default=100)
junctions=[]
for kind,width,pts in roads:
    for ordered in (pts,list(reversed(pts))):
        if road_distance(ordered[0])>5.6:continue
        branch=[ordered[0]];length=0
        for a,b in zip(ordered,ordered[1:]):
            d=math.dist(a,b)
            if d<.05:continue
            length+=d
            if length>=20:
                t=(20-(length-d))/d
                branch.append(tuple(round(v+(w-v)*t,2) for v,w in zip(a,b)));break
            branch.append(b)
        if road_distance(branch[-1])>8:junctions.append([kind,width,branch])
assert len(trees)>1000 and len(buildings)>20 and len(deer)>=6
# Use only parking surface left after painting every mapped drive and footpath.
# Erode it by one additional source pixel (1.22 m) and check the entire 2 x 4 m
# vehicle footprint, including its centre. Real cars do not have fixed positions.
parking_clear=land.point(lambda value:255 if value==3 else 0,'L').filter(ImageFilter.MinFilter(3))
parked=[];car_rng=random.Random(734)
for lot in sorted(set(row[0] for row in parking_links)):
    footprint=Image.new('1',(W,W));ImageDraw.Draw(footprint).polygon([pix(p,W) for p in parking_lots[lot]],fill=1)
    candidates=[]
    for aisle in aisles:
        for (x,z),(xx,zz) in zip(aisle,aisle[1:]):
            length=math.hypot(xx-x,zz-z)
            if length<3:continue
            dx,dz=(xx-x)/length,(zz-z)/length
            for j in range(max(1,int(length/6))):
                along=(j+.5)*length/max(1,int(length/6))
                for side in [-1,1]:
                    cx=x+dx*along-dz*side*5.7;cz=z+dz*along+dx*side*5.7
                    yaw=math.atan2(-dz*side,dx*side)
                    hull=[(cx+dx*w-dz*d,cz+dz*w+dx*d) for w in (-1,0,1) for d in (-2,0,2)]
                    if all(not inside(p,obstacles) and
                           footprint.getpixel(pix(p,W)) and parking_clear.getpixel(pix(p,W)) and
                           canopy.getpixel(pix(p,1250))<4 for p in hull):
                        candidates.append([round(cx,2),round(cz,2),round(yaw,5),lot])
    car_rng.shuffle(candidates)
    count=0
    for candidate in candidates:
        if any(math.dist(candidate[:2],p[:2])<7 for p in parked):continue
        parked.append(candidate);count+=1
        if count==5:break
data=dict(trees=trees,buildings=buildings,fences=fences,gates=gates,gateApproaches=gate_approaches,
          roundabouts=circles,junctions=junctions,parkingSigns=signs,parkedCars=parked,deer=deer)
pathlib.Path('assets/richmond-scenery.js').write_text('window.RIDE_COURSES.richmond.details='+json.dumps(data,separators=(',',':'))+';',encoding='utf8')
print({k:len(v) for k,v in data.items()},'parking/water polygons',collections.Counter(k for k,_ in areas),'road/path ways',len(roads),flush=True)
