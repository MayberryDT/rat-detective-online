import bpy, math, random, os
from mathutils import Vector
random.seed(12)
ROOT='/home/tyler/Projects/rat-detective/assets/blender/classic-detective'
scene=bpy.data.scenes.new('Classic Detective • Concept Model')
bpy.context.window.scene=scene
collection=bpy.data.collections.new('CHARACTER • Editable Parts')
scene.collection.children.link(collection)
studio=bpy.data.collections.new('STUDIO • Lights & Camera')
scene.collection.children.link(studio)
def move(o,col=collection):
    for c in list(o.users_collection): c.objects.unlink(o)
    col.objects.link(o)
    return o
def mat(name,h,rough=.8,metal=0):
    rgb=tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
    rgb=tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
coat=mat('Coat • Tobacco wool','80502b'); lapel=mat('Lapels • Warm ochre','976137'); fur=mat('Fur • Warm taupe','827464'); muzzle=mat('Muzzle • Light taupe','9c8973');pink=mat('Skin • Dusty rose','c77e68');inner=mat('Ears • Warm pink','de9480');nosemat=mat('Nose • Salmon','df8a74',.48);dark=mat('Brows and tie • Espresso','29261e');white=mat('Eyes • Ivory','f2e4c3',.35);black=mat('Pupils • Near black','10140f',.22);shirt=mat('Shirt • Parchment','e0cfaa');belt=mat('Belt • Chestnut leather','593424');gold=mat('Buckle • Aged brass','c2944c',.36,.65);whisk=mat('Whiskers • Cream','c8bda3');hatmat=mat('Fedora • Caramel felt','8b542a');band=mat('Hatband • Dark chocolate','422c20');sole=mat('Trousers • Deep brown','494435')
def mesh(name,v,f,m):
    me=bpy.data.meshes.new(name); me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);collection.objects.link(o);o.data.materials.append(m);return o
def uv(name,loc,scale,m,segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc);o=move(bpy.context.object);o.name=name;o.scale=scale;o.data.materials.append(m);return o
def ico(name,loc,scale,m,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc);o=move(bpy.context.object);o.name=name;o.scale=scale;o.data.materials.append(m);return o
def cube(name,loc,scale,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=move(bpy.context.object);o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('Small tailored edge','BEVEL');mod.width=bevel;mod.segments=1
    return o
def tube(name,points,radii,m,n=8):
    v=[]
    for i,p in enumerate(points):
        p=Vector(p);a=Vector(points[max(0,i-1)]);b=Vector(points[min(len(points)-1,i+1)]);t=(b-a).normalized();q=t.to_track_quat('Z','Y')
        for j in range(n):
            u=q@Vector((math.cos(2*math.pi*j/n)*radii[i],math.sin(2*math.pi*j/n)*radii[i],0));v.append(tuple(p+u))
    f=[tuple(range(n-1,-1,-1))]
    for i in range(len(points)-1):
        for j in range(n):f.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    f.append(tuple((len(points)-1)*n+j for j in range(n)));return mesh(name,v,f,m)
def panel(name,points,m,thick=.045):
    o=mesh(name,points,[tuple(range(len(points)))],m);mod=o.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=thick;mod=o.modifiers.new('Soft cut edges','BEVEL');mod.width=.012;mod.segments=1;return o
# Trenchcoat: elliptical rings with a front opening and slightly irregular tailored panels.
N=24; vs=[]
for k,(z,rx,ry) in enumerate([(.28,.67,.4),(.64,.62,.38),(1.05,.51,.32),(1.45,.57,.35),(1.77,.47,.31),(1.89,.29,.24)]):
    for j in range(N+1):
        a=.065+(2*math.pi-.13)*j/N
        x=rx*math.sin(a);y=-ry*math.cos(a)
        if k in (1,3) and j%3==1: x*=1.028;y*=1.025
        vs.append((x,y,z+(0.025*math.sin(j*2.8) if k==0 else 0)))
fs=[]
for k in range(5):
    for j in range(N):
        a=k*(N+1)+j;b=a+1;c=b+N+1;d=a+N+1
        if (j+k)%3==0:fs.extend([(a,b,c),(a,c,d)])
        else:fs.append((a,b,c,d))
o=mesh('Coat • Open tailored body',vs,fs,coat);o.modifiers.new('Wool thickness','SOLIDIFY').thickness=.035
# Visible trouser legs and broad rat feet.
for s in [-1,1]:
    side='L' if s<0 else 'R'
    uv('Trouser leg.'+side,(s*.31,.015,.27),(.22,.23,.28),sole)
    uv('Foot.'+side,(s*.34,-.19,.105),(.235,.34,.11),pink)
    for j in range(3):uv('Toe.%s.%s'%(side,j),(s*.34+(j-1)*.105,-.415- (.025 if j==1 else 0),.075),(.066,.145,.072),pink,8,6)
# Shirt bib and necktie.
uv('Neck',(0,.005,1.99),(.27,.25,.29),fur)
panel('Shirt front',[(-.25,-.291,1.91),(.25,-.291,1.91),(.15,-.374,1.39),(0,-.406,1.26),(-.15,-.374,1.39)],shirt)
panel('Shirt collar.L',[(-.235,-.335,1.94),(-.02,-.373,1.82),(-.16,-.437,1.64),(-.3,-.358,1.81)],shirt)
panel('Shirt collar.R',[(.235,-.335,1.94),(.3,-.358,1.81),(.16,-.437,1.64),(.02,-.373,1.82)],shirt)
ico('Tie knot',(0,-.423,1.78),(.093,.045,.11),dark,1)
panel('Tie blade',[(-.043,-.42,1.72),(.045,-.42,1.72),(.085,-.436,1.41),(0,-.453,1.31),(-.08,-.436,1.41)],dark)
# Raised collar and broad crossing lapels, separate editable clothing pieces.
for s in [-1,1]:
    side='L' if s<0 else 'R'
    panel('Raised collar.'+side,[(s*.22,.08,2.0),(s*.59,-.02,2.035),(s*.66,-.25,1.87),(s*.31,-.365,1.72)],lapel,.07)
    panel('Lapel.'+side,[(s*.29,-.355,1.94),(s*.56,-.31,1.70),(s*.38,-.432,1.61),(s*.45,-.421,1.51),(-s*.045,-.449,1.24),(s*.17,-.415,1.68)],lapel,.045)
# Sleeves: one hand raised to the lapel and one at hip.
for side,pts in [('L',[(-.49,.015,1.66),(-.65,-.05,1.38),(-.69,-.2,1.02)]),('R',[(.49,.015,1.68),(.7,-.015,1.35),(.57,-.36,1.36)])]:
    tube('Coat sleeve.'+side,pts,[.215,.21,.16],coat,10)
    end=Vector(pts[-1]);direction=(end-Vector(pts[-2])).normalized();tube('Turned cuff.'+side,[end-direction*.095,end+direction*.04],[.18,.18],lapel,10)
    hand=end+direction*.12;ico('Paw.'+side,hand,(.13,.115,.15),pink,2)
    for j in range(3):
        p=hand+Vector((-.06+j*.056,-.079,.055-j*.033));uv('Finger.%s.%d'%(side,j),p,(.043,.059,.055),nosemat,8,6)
    uv('Thumb.'+side,hand+Vector((-.095 if side=='R' else .08,-.015,.03)),(.06,.065,.085),pink,8,6)
# Belt is a ring, leaving the coat volume intact.
v=[]
for z in [1.035,1.195]:
    for j in range(40):
        a=2*math.pi*j/40;v.append((.543*math.sin(a),-.358*math.cos(a),z))
f=[(j,(j+1)%40,(j+1)%40+40,j+40) for j in range(40)]
o=mesh('Belt • Leather wrap',v,f,belt);o.modifiers.new('Leather thickness','SOLIDIFY').thickness=.025
for name,loc,scale in [('top',(0,-.401,1.215),(.27,.055,.035)),('bottom',(0,-.401,1.015),(.27,.055,.035)),('left',(-.132,-.401,1.115),(.035,.055,.2)),('right',(.132,-.401,1.115),(.035,.055,.2)),('pin',(.065,-.44,1.115),(.16,.025,.025))]:cube('Buckle • '+name,loc,scale,gold,.008)
for x in [-.4,.37]:
    o=cube('Belt keeper',(x,-.283,1.115),(.06,.075,.225),lapel,.015);o.rotation_euler.z=-x*.75
for s in [-1,1]:
    o=cube('Pocket flap.'+str(s),(s*.43,-.321,.795),(.28,.053,.14),lapel,.015);o.rotation_euler.z=s*.32;o.rotation_euler.y=s*-.1
# Head and muzzle: strong oversized rat anatomy, front is -Y.
uv('Head • Faceted cranium',(0,0,2.40),(.565,.435,.59),fur,14,10)
for s in [-1,1]:ico('Cheek.'+str(s),(s*.31,-.205,2.265),(.28,.285,.29),fur,2)
# Tapered wedge snout with elliptical cross sections along its length.
v=[];nr=12
for y,z,rx,rz in [(-.29,2.30,.36,.29),(-.48,2.25,.285,.235),(-.69,2.19,.205,.17),(-.84,2.195,.125,.112)]:
    for j in range(nr):
        a=2*math.pi*j/nr;v.append((math.cos(a)*rx,y,z+math.sin(a)*rz))
f=[]
for k in range(3):
    for j in range(nr):f.append((k*nr+j,k*nr+(j+1)%nr,(k+1)*nr+(j+1)%nr,(k+1)*nr+j))
f.append(tuple(range(36,48)));mesh('Muzzle • Long tapered snout',v,f,muzzle)
ico('Nose • Pink faceted tip',(0,-.87,2.215),(.135,.092,.105),nosemat,1)
for s in [-1,1]:uv('Nostril.'+str(s),(s*.063,-.946,2.202),(.021,.009,.013),pink,8,6)
# Curved smile line on either cheek.
for s in [-1,1]:tube('Mouth crease.'+str(s),[(s*.06,-.822,2.105),(s*.18,-.676,2.06),(s*.29,-.48,2.10)],[.008,.012,.009],dark,5)
# Eye whites, dark pupils, eyelids and expressive sloped brows.
for s in [-1,1]:
    side='L' if s<0 else 'R'
    uv('Eye socket.'+side,(s*.272,-.323,2.52),(.186,.108,.188),muzzle)
    uv('Eye white.'+side,(s*.272,-.397,2.53),(.151,.091,.138),white,12,8)
    uv('Pupil.'+side,(s*.272+.045,-.478,2.544),(.061,.029,.085),black,12,8)
    uv('Eye glint.'+side,(s*.272+.029,-.505,2.583),(.019,.008,.019),white,8,6)
    panel('Upper eyelid.'+side,[(s*.272-.15,-.453,2.573),(s*.272+.15,-.453,2.573),(s*.272+.115,-.414,2.666),(s*.272-.08,-.414,2.68)],fur,.015)
    # Inner end lower, outer end high: suspicious expression.
    panel('Eyebrow.'+side,[(s*.12,-.405,2.685),(s*.44,-.34,2.765),(s*.445,-.345,2.833),(s*.125,-.418,2.755)],dark,.045)
# Ears: concave polygon dishes with thickness and contrasting inner bowl.
for s in [-1,1]:
    center=Vector((s*.64,.01,2.96)); outline=[(-.25,-.28),(-.29,.02),(-.2,.35),(-.06,.48),(.15,.41),(.28,.19),(.26,-.09),(.11,-.31)]
    verts=[]
    for scale,depth in [(1,0),(.79,-.035),(.42,.058)]:
        for x,z in outline:verts.append(tuple(center+Vector((s*x*scale,depth,z*scale))))
    verts.append(tuple(center+Vector((0,.098,.055))));faces=[]
    for k in range(2):
        for j in range(8):faces.append((k*8+j,k*8+(j+1)%8,(k+1)*8+(j+1)%8,(k+1)*8+j))
    for j in range(8):faces.append((16+j,16+(j+1)%8,24))
    o=mesh('Ear • Concave bowl.'+str(s),verts,faces,pink);o.data.materials.append(inner)
    for p in o.data.polygons:p.material_index=1 if p.index>=8 else 0
    o.modifiers.new('Ear thickness','SOLIDIFY').thickness=.04
# Fedora uses a shaped brim and pinched, indented crown, rather than cylinders.
H=16;v=[]
for rx,ry,z in [(.36,.31,2.87),(.81,.59,2.86),(.825,.6,2.895),(.4,.335,2.92)]:
    for j in range(H):
        a=2*math.pi*j/H;x=rx*math.cos(a);y=ry*math.sin(a);v.append((x,y,z+.085*x+.065*y))
f=[]
for k in range(3):
    for j in range(H):f.append((k*H+j,k*H+(j+1)%H,(k+1)*H+(j+1)%H,(k+1)*H+j))
mesh('Fedora • Swept brim',v,f,hatmat)
v=[]
for k,(rx,ry,z) in enumerate([(.405,.34,2.90),(.365,.295,3.10),(.325,.275,3.34)]):
    for j in range(H):
        a=2*math.pi*j/H;x=rx*math.cos(a);y=ry*math.sin(a)
        if k==2 and y<-.1:x*=.83
        v.append((x,y,z+.085*x+.045*y+(.024*math.cos(2*a) if k==2 else 0)))
f=[]
for k in range(2):
    for j in range(H):f.append((k*H+j,k*H+(j+1)%H,(k+1)*H+(j+1)%H,(k+1)*H+j))
v.append((0,0,3.265))
for j in range(H):f.append((32+j,32+(j+1)%H,48))
mesh('Fedora • Pinched crown and crease',v,f,hatmat)
v=[]
for rx,ry,z in [(.409,.344,2.94),(.387,.322,3.065)]:
    for j in range(H):
        a=2*math.pi*j/H;x=rx*math.cos(a);y=ry*math.sin(a);v.append((x,y,z+.085*x+.045*y))
mesh('Fedora • Chocolate ribbon',v,[(j,(j+1)%H,(j+1)%H+H,j+H) for j in range(H)],band)
# Tail, tapering across ground and rising at tip.
tube('Tail • Curved pink taper',[(0,.31,.37),(.21,.60,.22),(.56,.78,.14),(.94,.8,.13),(1.23,.73,.17),(1.44,.60,.28),(1.52,.54,.42)],[.105,.09,.073,.055,.041,.026,.003],pink,8)
# Fine tapered cream whiskers.
for s in [-1,1]:
    for j in range(3):
        z=2.14+j*.055
        tube('Whisker.%s.%s'%(s,j),[(s*.15,-.77,z),(s*.4,-.78,z+.04*(j-1)),(s*.63,-.71,z+.085*(j-1)),(s*.80,-.62,z+.11*(j-1))],[.0065,.005,.003,.0006],whisk,5)
# Character root makes moving/exporting the model easy.
root=bpy.data.objects.new('Classic Detective • ROOT',None);collection.objects.link(root)
for o in list(collection.objects):
    if o!=root:o.parent=root
root['reference']='reference.png';root['status']='Editable concept reconstruction from single image; unrigged'
# Studio setup.
floormat=mat('Studio • Warm gray','827c74')
bpy.ops.mesh.primitive_plane_add(size=200);floor=move(bpy.context.object,studio);floor.name='Studio floor';floor.data.materials.append(floormat);floor.location.z=-.025
world=bpy.data.worlds.new('Classic Detective studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.3,.28,.25,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.world=world
def area(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.7))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key • Large softbox',(-3,-4,7),650,4);area('Fill • Softbox',(4,-2,4),400,3);area('Rim • Overhead',(1,3,6),750,3)
data=bpy.data.cameras.new('Portrait Camera');cam=bpy.data.objects.new('Portrait Camera',data);studio.objects.link(cam);cam.location=(4,-8,4.0);target=Vector((.06,0,1.72));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=4.4;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
# Store the source image inside the blend, in a hidden reference collection.
refs=bpy.data.collections.new('REFERENCE • Selected Concept');scene.collection.children.link(refs)
image=bpy.data.images.load(ROOT+'/reference.png',check_existing=True);image.pack();ref=bpy.data.objects.new('Selected concept • front three-quarter',None);refs.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=image;ref.empty_display_size=3.5;ref.location=(-3,1,1.8);ref.rotation_euler=(math.pi/2,0,0);ref.hide_render=True;refs.hide_viewport=True
for o in bpy.context.selected_objects:o.select_set(False)
root.select_set(True);bpy.context.view_layer.objects.active=root
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();a.spaces.active.region_3d.view_location=target;a.spaces.active.region_3d.view_distance=6
        a.spaces.active.shading.type='MATERIAL'
scene['note']='Concept reconstruction with separate editable meshes. Existing model preserved in its original scene. Not rigged or integrated with game.'
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/classic-detective.blend')
scene.render.filepath=ROOT+'/preview.png'
print('BUILT',len(collection.objects),'character objects')
