import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/home/tyler/Projects/rat-detective/.design/social-share/real-assets.glb',loglevel=50)
for o in bpy.data.objects:
 if o.type=='MESH' and abs(o.matrix_world.translation.x-30)<1 and abs(o.matrix_world.translation.y+6)<1 and o.matrix_world.translation.z>10:
  print(o.name,tuple(round(v,2) for v in o.matrix_world.translation))
  break
for name in ['game-rat-0','game-briefcase']:
 o=bpy.data.objects[name];print(name,'parent',o.parent.name,'rotmode',o.rotation_mode)
