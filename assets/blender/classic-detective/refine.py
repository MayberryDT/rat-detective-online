# Run after build.py in the same Blender session.
import bpy, math
from mathutils import Vector
for side in ['L','R']:
    o=bpy.data.objects.get('Upper eyelid.'+side)
    if o:bpy.data.objects.remove(o,do_unlink=True)
for s in [-1,1]:
    side='L' if s<0 else 'R';v=[];f=[];n=16;rows=5
    # An actual curved shell over the eye, terminating below the pupil top.
    for k in range(rows+1):
        theta=.001+(1.43-.001)*k/rows
        for j in range(n):
            a=2*math.pi*j/n
            v.append((s*.272+.155*math.sin(theta)*math.cos(a),-.397+.099*math.sin(theta)*math.sin(a),2.53+.145*math.cos(theta)))
    for k in range(rows):
        for j in range(n):f.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    mesh('Upper eyelid.'+side,v,f,fur)
    tube('Eyelid rim.'+side,[(s*.272-.143,-.435,2.55),(s*.272-.095,-.478,2.55),(s*.272,-.497,2.55),(s*.272+.095,-.478,2.55),(s*.272+.143,-.435,2.55)],[.009]*5,dark,5)
# Rebuild the bent arm as overlapping tailored segments with a rounded elbow.
bpy.data.objects.remove(bpy.data.objects['Coat sleeve.R'],do_unlink=True)
tube('Sleeve.R • Upper',[(.49,.015,1.68),(.61,.005,1.52),(.68,-.025,1.35)],[.21,.215,.20],coat,12)
uv('Sleeve.R • Elbow',(.68,-.025,1.35),(.205,.205,.20),coat,12,8)
tube('Sleeve.R • Forearm',[(.68,-.025,1.35),(.63,-.17,1.35),(.57,-.36,1.36)],[.20,.19,.16],coat,12)
# Deeper felt pinch and slight asymmetry in crown rim.
crown=bpy.data.objects['Fedora • Pinched crown and crease']
for vert in crown.data.vertices:
    if vert.co.z>3.28:
        if abs(vert.co.x)<.14:vert.co.z-=.065
        if vert.co.y<-.12:vert.co.x*=.91
# Add subtle low-poly tonal variation across coat faces, preserving editable material slots.
import random
random.seed(22)
for obj in collection.objects:
    if obj.type=='MESH' and obj.data.materials and obj.data.materials[0]==coat:
        for name,h in [('Coat • Panel shade','794b29'),('Coat • Panel highlight','88572f')]:
            m=bpy.data.materials.get(name) or mat(name,h);obj.data.materials.append(m)
        for p in obj.data.polygons:
            r=random.random();p.material_index=1 if r<.10 else 2 if r<.18 else 0
for o in collection.objects:
    if o!=root and o.parent is None:o.parent=root
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.30
scene.cycles.samples=64
# Camera on the same side as the selected reference.
cam.location=(-3.6,-8,3.7);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();a.spaces.active.shading.type='SOLID';a.spaces.active.shading.color_type='MATERIAL'
scene.render.filepath=ROOT+'/preview.png'
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/classic-detective.blend')
print('Refined expression, sleeve, felt crown and studio lighting')
# Keep eyelid shells in front of the protruding pupils.
for o in scene.objects:
    if o.name.startswith('Upper eyelid.'):
        for v in o.data.vertices:v.co.y=-.397+(v.co.y+.397)*1.34
    if o.name.startswith('Eyelid rim.'):
        for v in o.data.vertices:v.co.y-=.029
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/classic-detective.blend')
