"""Generate locally downloadable GPX tracks from the shipped survey samples."""
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

from terrain_grid import to_bng

ROOT = Path(__file__).resolve().parents[1]
CORE_ORIGIN = (1.116, 42.874)
CORE_METRES = (111320 * math.cos(math.radians(CORE_ORIGIN[1])), 111132)
NAMESPACE = 'http://www.topografix.com/GPX/1/1'


def british_latlon(easting, northing):
    # Invert the original survey builder, including its datum transformation.
    # Close to both UK routes these local east/north derivatives converge quickly.
    lat, lon = 52., -1.
    for _ in range(12):
        e, n = to_bng(lat, lon)
        if math.hypot(e-easting, n-northing) < .0005:
            return lat, lon
        lat += (northing-n) / 111132
        lon += (easting-e) / (111320 * math.cos(math.radians(lat)))
    raise ValueError(f'Could not invert survey position {easting}, {northing}')


def write_course_routes(key, data):
    points = []
    for x, height, z in data['road']:
        if key == 'core':
            lat, lon = CORE_ORIGIN[1]-z/CORE_METRES[1], CORE_ORIGIN[0]+x/CORE_METRES[0]
        else:
            east, north = data['origin']
            lat, lon = british_latlon(east+x, north-z)
        points.append((lat, lon, height))

    if key == 'core':
        summit = data['summit']
        routes = [
            ('col-de-la-core-from-seix', 'Col de la Core from Seix', points[:summit+1]),
            ('col-de-la-core-from-bethmale', 'Col de la Core from Les Bordes-sur-Lez via Bethmale', points[summit:][::-1]),
        ]
    else:
        variants = ('clockwise','anticlockwise') if key == 'richmond' else ('forward','reverse')
        name = 'Richmond Park' if key == 'richmond' else 'Leckhampton Hill'
        closed = points + [points[0]]
        routes = [(f'{key}-{label}', f'{name} · {label}', sequence)
                  for label, sequence in zip(variants,(closed,closed[::-1]))]

    folder = ROOT / 'assets' / 'routes'
    folder.mkdir(exist_ok=True)
    for slug, title, sequence in routes:
        root = ET.Element('gpx', version='1.1', creator='Golden Hour Ride', xmlns=NAMESPACE)
        meta = ET.SubElement(root,'metadata')
        ET.SubElement(meta,'name').text = title
        ET.SubElement(meta,'desc').text = data['credit']
        track = ET.SubElement(root,'trk')
        ET.SubElement(track,'name').text = title
        ET.SubElement(track,'type').text = 'cycling'
        segment = ET.SubElement(track,'trkseg')
        segment.text = '\n'
        for lat, lon, height in sequence:
            point = ET.SubElement(segment,'trkpt',lat=f'{lat:.7f}',lon=f'{lon:.7f}')
            ET.SubElement(point,'ele').text = f'{height:.2f}'
            point.tail = '\n'
        ET.ElementTree(root).write(folder/f'{slug}.gpx',encoding='utf-8',xml_declaration=True)


if __name__ == '__main__':
    for course in ['core','richmond','leckhampton']:
        source = (ROOT/'assets'/f'{course}.js').read_text(encoding='utf8')
        prefix = source.split('window.RIDE_COURSES.'+course,1)[1]
        data = json.JSONDecoder().raw_decode(prefix.split('=',1)[1].lstrip())[0]
        write_course_routes(course,data)
