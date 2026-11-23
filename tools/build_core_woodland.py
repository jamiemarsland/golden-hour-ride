"""Sample ESA WorldCover 2021 tree cover for the Col de la Core (requires rasterio)."""
import base64
import json
import math
import tempfile
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from pathlib import Path

import certifi
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import rasterize
from rasterio.transform import from_bounds as grid_transform

URL = ('https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/'
       'ESA_WorldCover_10m_2021_v200_N42E000_Map.tif')
ROOT = Path(__file__).resolve().parents[1]
SIZE = 19000
SIDE = 950
CX, CY = 1.116, 42.874
MX, MY = 111320*math.cos(math.radians(CY)), 111132
bounds = (CX-SIZE/(2*MX), CY-SIZE/(2*MY), CX+SIZE/(2*MX), CY+SIZE/(2*MY))
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_MAX_RETRY='3',
                  GDAL_HTTP_RETRY_DELAY='2', CURL_CA_BUNDLE=certifi.where()):
    with rasterio.open(URL) as src:
        values = src.read(1, window=from_bounds(*bounds,transform=src.transform),
                          out_shape=(SIDE,SIDE), resampling=rasterio.enums.Resampling.nearest)
assert .25 < (values==10).mean() < .95
mask = np.packbits(values==10,bitorder='little').tobytes()
data = dict(side=SIDE,size=SIZE,trees=base64.b64encode(mask).decode('ascii'))
# IGN classifies dominant forest types within stands, not individual trees.
crs = 'urn:ogc:def:crs:OGC::CRS84'
kinds = {'Forêt fermée mixte':1, 'Forêt fermée de conifères':2}
query = dict(service='WFS',version='2.0.0',request='GetFeature',typeNames='BDTOPO_V3:zone_de_vegetation',
             srsName=crs, outputFormat='application/json',count=5000,propertyName='geometrie,nature',
             CQL_FILTER="BBOX(geometrie,%s,'%s') AND nature IN ('Forêt fermée de conifères','Forêt fermée mixte')"%
                        (','.join(map(str,bounds)),crs))
cache = Path(tempfile.gettempdir())/'core-ride'/'ign-forest-types.json'
if not cache.exists():
    request = Request('https://data.geopf.fr/wfs/ows?'+urlencode(query),headers={'User-Agent':'GoldenHourRide/1.0'})
    with urlopen(request,timeout=100) as response:
        response_data = response.read()
    json.loads(response_data)
    cache.parent.mkdir(exist_ok=True)
    cache.write_bytes(response_data)
stands=json.loads(cache.read_bytes())
assert 0 < len(stands['features']) == stands['numberMatched']
stand_side = SIDE//2
grid=rasterize([(f['geometry'],kinds[f['properties']['nature']]) for f in stands['features']],
               out_shape=(stand_side,stand_side),transform=grid_transform(*bounds,stand_side,stand_side),dtype='uint8')
cells=np.pad(grid.ravel(),(0,(-grid.size)%4)).reshape(-1,4)
packed=cells[:,0] | cells[:,1]<<2 | cells[:,2]<<4 | cells[:,3]<<6
data.update(standSide=stand_side,stands=base64.b64encode(packed.tobytes()).decode('ascii'))
(ROOT/'assets/core-woodland.js').write_text('window.RIDE_COURSES.core.woodland='+
    json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
print(f'{(values==10).mean():.1%} tree cover in {SIZE/1000:.0f} km square')
