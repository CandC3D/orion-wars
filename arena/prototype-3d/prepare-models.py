"""Prototype-only preparation. Run with Blender --background --python this-file.

Never overwrites supplied sources or the shared asset library. Per-hull
authored regions live in COLOR_0, not in the single material. Preserve them.
"""
import bpy, bmesh, json, hashlib, math, struct, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
faction = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'KRE'
config = json.loads((HERE/'hull-sources.json').read_text(encoding='utf-8'))[faction]
if '--comparison' in sys.argv:
    config = json.loads((HERE/'comparison-source.json').read_text(encoding='utf-8'))
    faction = config['faction']
SOURCE = HERE / 'source' / config['source']
output_name = config['output']
OUT = HERE / 'prepared'
OUT.mkdir(exist_ok=True)
raw = SOURCE.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20+json_length])
assert len(gltf['meshes']) == 1 and len(gltf['meshes'][0]['primitives']) == 1, 'Preparation expects one primitive: inspect the complete changed export'
primitive = gltf['meshes'][0]['primitives'][0]
accessor = gltf['accessors'][primitive['attributes']['COLOR_0']]
view = gltf['bufferViews'][accessor['bufferView']]
assert accessor['componentType'] == 5126 and accessor['type'] == 'VEC3'
offset = 28 + json_length + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
palette = {}
for i in range(accessor['count']):
    rgb = struct.unpack_from('<3f', raw, offset+i*view.get('byteStride', 12))
    key = ''.join(f'{round(v*255):02x}' for v in rgb)
    entry = palette.setdefault(key, {'linearRGB':rgb, 'sourceVertices':0})
    entry['sourceVertices'] += 1
faction_contract = json.loads((HERE/'faction-palettes.json').read_text(encoding='utf-8'))['factions'][faction]['regions']
unknown = sorted(set(palette)-set(faction_contract))
assert not unknown, f'Faction palette export fault for {faction}: {unknown}'
assert {k:v['sourceVertices'] for k,v in palette.items()} == config['colours'], 'Changed source palette/counts: re-inspect art before preparing'
if faction == 'EAR' and 'e1ad34' in palette:
    assert 'e1ad34' in config.get('materialBounds', {}), 'Earth gold needs an authored sensor-dish location check before preparation'
for colour, bounds in config.get('materialBounds', {}).items():
    pa = gltf['accessors'][primitive['attributes']['POSITION']]
    pv = gltf['bufferViews'][pa['bufferView']]
    assert pa['componentType'] == 5126 and pa['type'] == 'VEC3' and pa['count'] == accessor['count']
    po = 28 + json_length + pv.get('byteOffset', 0) + pa.get('byteOffset', 0)
    for i in range(accessor['count']):
        rgb = struct.unpack_from('<3f', raw, offset+i*view.get('byteStride', 12))
        if ''.join(f'{round(v*255):02x}' for v in rgb) != colour: continue
        point = struct.unpack_from('<3f', raw, po+i*pv.get('byteStride', 12))
        assert all(bounds['sourceMin'][k] <= point[k] <= bounds['sourceMax'][k] for k in range(3)), f'{colour} outside authored {bounds["role"]}: report source disagreement'
if '--validate-only' in sys.argv:
    print('PALETTE_VALIDATED', faction, sorted(palette))
    sys.exit(0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(objects) == 1, 'Re-inspect changed source: expected one mesh'
obj = objects[0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh = obj.data
original_triangles = len(mesh.polygons)
bm = bmesh.new(); bm.from_mesh(mesh)
extent = max(obj.dimensions)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=extent*1e-7)
bm.to_mesh(mesh); bm.free(); mesh.update()
original = mesh.copy()
source_vertices = [v.co.copy() for v in original.vertices]
source_faces = [tuple(p.vertices) for p in original.polygons]
source_bvh = BVHTree.FromPolygons(source_vertices, source_faces)
modifier = obj.modifiers.new('Prototype reduction; source untouched', 'DECIMATE')
modifier.ratio = config['ratio']
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
mesh.update()
validation_before = [len(mesh.vertices),len(mesh.edges),len(mesh.polygons)]
validation_corrected = mesh.validate(verbose=True)
mesh.update()
validation_after = [len(mesh.vertices),len(mesh.edges),len(mesh.polygons)]
# Axis conventions are declared per source: Krelath -Y, Earth/Shard +X; Z up.
# Export a centred, bow +X, Y-up GLB for runtime with no inferred orientation.
mins = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
maxs = [max(v.co[i] for v in mesh.vertices) for i in range(3)]
long_axis = 1 if config['nativeBow']=='-Y' else 0
length = maxs[long_axis]-mins[long_axis]
centre = Vector([(a+b)/2 for a,b in zip(mins,maxs)])
scale = config['lengthMm'] / 10 / length  # 1 scene unit = 10 mm
derived_bvh = BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
forward = [derived_bvh.find_nearest(v)[3] for v in source_vertices]
backward = [source_bvh.find_nearest(v.co)[3] for v in mesh.vertices]
max_error_mm = max(forward+backward)*scale*10
assert max_error_mm < 0.35, f'Reduction moved a surface too far: {max_error_mm} mm'
# Count connected components, retaining every original component; do not delete small features.
def components(m):
    links = [[] for _ in m.vertices]
    for e in m.edges:
        a,b=e.vertices; links[a].append(b); links[b].append(a)
    seen=set(); parts=[]
    for start in range(len(links)):
        if start in seen: continue
        todo=[start]; seen.add(start); ids=[]
        while todo:
            i=todo.pop(); ids.append(i)
            for n in links[i]:
                if n not in seen: seen.add(n); todo.append(n)
        coords=[m.vertices[i].co for i in ids]
        parts.append({'vertices':len(ids),'min':[min(p[a] for p in coords) for a in range(3)],'max':[max(p[a] for p in coords) for a in range(3)]})
    return sorted(parts,key=lambda p:-p['vertices'])
source_parts=components(original); output_parts=components(mesh)
assert len(source_parts)==len(output_parts), 'A connected feature disappeared during reduction'
for v in mesh.vertices:
    p=(v.co-centre)*scale
    v.co=(-p.y,p.x,p.z) if config['nativeBow']=='-Y' else p # Blender Z up; exporter turns into X, Z, -Y (runtime Y up)
for p in mesh.polygons: p.use_smooth=True
mesh.update()
obj.name=config['name']+' current hull - authored COLOR_0 regions'
# Keep COLOR_0 and the source material. Runtime paint uses those region colours;
# any energetic overlay remains a separate classified drawable.
bpy.ops.export_scene.gltf(filepath=str(OUT/(output_name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_materials='EXPORT')
report={'source':config['source'],'faction':faction,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'sourceBytes':SOURCE.stat().st_size,'output':output_name+'.glb','outputBytes':(OUT/(output_name+'.glb')).stat().st_size,
    'outputSha256':hashlib.sha256((OUT/(output_name+'.glb')).read_bytes()).hexdigest(),
    'validation':{'corrected':validation_corrected,'beforeVerticesEdgesFaces':validation_before,'afterVerticesEdgesFaces':validation_after},
    'sourceTriangles':original_triangles,'outputTriangles':len(mesh.polygons),'ratio':config['ratio'],
    'miniatureLengthMm':config['lengthMm'],'mmPerUnit':10,'maximumVertexToSurfaceErrorMm':max_error_mm,
    'errorMethod':'Both directions, all vertices to closest triangle; not a certified surface Hausdorff bound',
    'sourceComponentCount':len(source_parts),'outputComponentCount':len(output_parts),
    'sourceMaterials':[m.name for m in original.materials], 'authoredColourRegions':True,
    'sourceColourAttribute':'COLOR_0','sourcePalette':palette,'physicalEmission':False,
    'orientation':config.get('orientationNote', 'Centred runtime +X longitudinal forward, +Y up; native '+config['nativeBow']+'. Earth/Krelath schematic reference; Shard long pointed end, no inferred systems.'),
    'sourceComponents':source_parts,'outputComponents':output_parts}
(OUT/(output_name+'-preparation.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PROTOTYPE_PREPARATION',json.dumps({k:v for k,v in report.items() if not k.endswith('Components')}))
