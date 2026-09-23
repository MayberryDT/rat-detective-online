import bpy, math, sys
from mathutils import Vector
from pathlib import Path
ROOT=Path('/home/tyler/Projects/rat-detective/.design/social-share')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'real-assets.glb'),loglevel=50)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1200;scene.render.resolution_y=630;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('game-night');scene.world.color=(0.018,0.012,0.03)
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.3
# The same dark ground material as createStage, for the authored-road gaps.
bpy.ops.mesh.primitive_plane_add(size=2,location=(9,-15,-.045))
ground=bpy.context.object;ground.name='game-stage-ground';ground.scale=(82,74,1)
mat=bpy.data.materials.new('game-stage-ground-material');mat.diffuse_color=(.018,.016,.025,1)
mat.use_nodes=True; bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.018,.016,.025,1);bs.inputs['Roughness'].default_value=.92
ground.data.materials.append(mat)

def loc(o,p):o.location=Vector(p)
def pose(name,p,rot=(0,0,0)):
 o=bpy.data.objects[name];loc(o,p);o.rotation_mode='XYZ';o.rotation_euler=rot

def point_camera(at,eye,lens=36):
 bpy.ops.object.camera_add(location=eye)
 cam=bpy.context.object;cam.rotation_euler=(Vector(at)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;scene.camera=cam

def area(name,p,color,power,size,target):
 bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
 o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

area('streetlamp key',(12,-13,12),(1,.68,.38),1150,10,(11,-15,0))
area('cool city rim',(19,-4,14),(.42,.55,1),1000,13,(12,-15,0))
area('camera fill',(10,-27,8),(.72,.78,1),420,12,(12,-15,0))

def render(name,rat0,rat1,rat2,case,ball,eye,target,lens):
 pose('game-rat-0',*rat0);pose('game-rat-1',*rat1);pose('game-rat-2',*rat2)
 pose('game-briefcase',case);pose('game-cheese-ball',ball)
 point_camera(target,eye,lens)
 scene.render.filepath=str(ROOT/f'real-{name}.png')
 bpy.ops.render.render(write_still=True)
 print('OUTPUT',scene.render.filepath)

render('street-chase',((12,-14,0),(0,0,.25)),((15,-11,1.3),(0,.85,.2)),((6,-19,0),(0,0,-.45)),(11.5,-13.7,1.05),(13.6,-12.3,1.5),(17,-23,4.0),(12,-13,1.6),39)
render('rooftop-launch',((10,-12,8.0),(.25,0,-.25)),((16,-16,0),(0,0,.2)),((5,-18,0),(0,0,-.3)),(9.4,-11.6,8.8),(12,-13,7.5),(18,-25,11),(11,-13,7),41)
render('alley-crossfire',((12,-14,0),(0,0,-.25)),((5,-16,0),(0,0,.1)),((15,-8,1.0),(.1,0,.6)),(11.4,-13.8,1.0),(9,-13,1.3),(17,-24,3.1),(11,-13,1.3),42)
