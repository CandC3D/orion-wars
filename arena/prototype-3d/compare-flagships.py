"""Read-only comparison in a common source-unit frame; no model is saved."""
import bpy, json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent
inventory=json.loads((ROOT/'prepared/fleet/inventory.json').read_text())['hulls']
parts=[]
for name in ['kre-intrallus','kre-boss']:
    h=next(h for h in inventory if h['id']==name)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'source'/h['source']))
    o=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    v=[p.co.copy() for p in o.data.vertices]
    centre=Vector([(min(p[k] for p in v)+max(p[k] for p in v))/2 for k in range(3)])
    points=[p-centre for p in v]
    if h['config']['nativeBow']=='-Y':points=[Vector((-p.y,p.x,p.z)) for p in points]
    faces=[tuple(p.vertices) for p in o.data.polygons]
    parts.append((h,points,BVHTree.FromPolygons(points,faces)))
result={'method':'All source vertices to closest triangle after centering and declared source-axis rotation, in both directions; not a continuous Hausdorff guarantee','directions':[]}
for i,j in [(0,1),(1,0)]:
    h,p,bvh=parts[i];target=parts[j][2];distances=[(target.find_nearest(v)[3],v) for v in p];distances.sort(key=lambda d:d[0]);scale=h['miniatureLengthMm']/h['sourceLongitudinalLength']
    result['directions'].append({'from':h['id'],'to':parts[j][0]['id'],'vertices':len(p),'maximumSourceUnits':distances[-1][0],'maximumMiniatureMm':distances[-1][0]*scale,'p99SourceUnits':distances[int(len(p)*.99)][0],'verticesOver001Unit':sum(d>.01 for d,v in distances),'largestDifferences':[{'distanceSourceUnits':d,'position':list(v)} for d,v in distances[-12:]]})
(ROOT/'evidence/fleet/flagship-comparison.json').write_text(json.dumps(result,indent=2)+'\n')
print('FLAGSHIP_COMPARISON',json.dumps(result))
