import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
sc.compositing_node_group = ng
gl = ng.nodes.new("CompositorNodeGlare")
t = gl.inputs["Type"]
print("type socket:", t.bl_idname, "default:", repr(t.default_value))
for cand in ("Fog Glow", "FOG_GLOW", "Bloom", "BLOOM"):
    try:
        t.default_value = cand
        print("accepted:", cand)
        break
    except Exception as e:
        print("rejected:", cand)
print("threshold:", gl.inputs["Threshold"].default_value,
      "strength:", gl.inputs["Strength"].default_value)
print("PROBE_OK")
