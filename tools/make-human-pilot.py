"""Create an original stylised male human pilot and three GLB levels of detail."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "pilots"
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, metallic=0.0, roughness=0.65):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m

SKIN = material('Skin warm', (0.50, 0.235, 0.11), 0, .72)
SKIN_LIGHT = material('Skin highlights', (0.72, 0.38, 0.19), 0, .68)
HAIR = material('Hair chestnut', (0.055, 0.022, 0.011), 0, .9)
WHITE = material('Eye white', (.72, .76, .68), 0, .35)
IRIS = material('Iris green', (.08, .24, .13), 0, .22)
BLACK = material('Pupil', (.006, .008, .006), 0, .28)
SHIRT = material('Woven ivory', (.38, .31, .22), 0, .86)
LEATHER = material('Oiled leather', (.16, .055, .018), 0, .66)
LEATHER2 = material('Leather edge', (.31, .12, .035), 0, .6)
TROUSERS = material('Indigo wool', (.035, .055, .105), 0, .88)
METAL = material('Hammered steel', (.33, .37, .39), .72, .3)
BRASS = material('Aged brass', (.36, .20, .045), .75, .31)

objects=[]
def finish(obj, name, mat, bone=None):
    obj.name=name
    obj.data.materials.append(mat)
    for p in obj.data.polygons: p.use_smooth=True
    objects.append((obj,bone))
    return obj

def uv(name, loc, scale, mat, bone=None, seg=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bone)

def cube(name, loc, scale, mat, bone=None, bevel=.08):
    bpy.ops.mesh.primitive_cube_add(location=loc);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=o.modifiers.new('Soft tailored edges','BEVEL');mod.width=bevel;mod.segments=3
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,mat,bone)

def cone(name, loc, radius1, radius2, depth, mat, bone=None, vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc)
    return finish(bpy.context.object,name,mat,bone)

def capsule(name, a, b, radius, mat, bone=None, seg=20):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=radius, depth=d.length, location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    finish(o,name,mat,bone)
    uv(name+' cap A',a,(radius,radius,radius),mat,bone,seg,12)
    uv(name+' cap B',b,(radius,radius,radius),mat,bone,seg,12)
    return o

def torus(name, loc, major, minor, mat, bone=None, rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=32,minor_segments=8,location=loc,rotation=rotation)
    return finish(bpy.context.object,name,mat,bone)

# Heroic proportions: broad shoulder line, readable head and hands, grounded boots.
uv('Pelvis',(0,0,1.13),(.39,.25,.30),TROUSERS,'hips')
uv('Rib cage',(0,0,1.78),(.61,.31,.62),SHIRT,'spine')
uv('Waist',(0,0,1.39),(.37,.23,.28),SHIRT,'spine')
uv('Neck',(0,0,2.28),(.17,.16,.22),SKIN,'neck',24,16)
uv('Head',(0,-.005,2.62),(.31,.285,.39),SKIN,'head')
uv('Jaw',(0,.075,2.45),(.28,.245,.22),SKIN,'head')
uv('Chin',(0,.235,2.34),(.13,.10,.10),SKIN_LIGHT,'head',24,14)
uv('Nose',(0,.286,2.62),(.075,.12,.13),SKIN_LIGHT,'head',24,14)
for side in (-1,1):
    uv('Ear', (side*.31,0,2.62),(.075,.045,.12),SKIN,'head',20,12)
    uv('Cheek',(side*.16,.235,2.54),(.13,.08,.105),SKIN_LIGHT,'head',20,12)
    uv('Eye white',(side*.105,.267,2.69),(.073,.035,.045),WHITE,'head',24,12)
    uv('Iris',(side*.105,.298,2.69),(.030,.014,.030),IRIS,'head',20,10)
    uv('Pupil',(side*.105,.310,2.69),(.012,.008,.014),BLACK,'head',16,8)
    capsule('Brow',(side*.18,.292,2.79),(side*.035,.302,2.77),.025,HAIR,'head',12)
uv('Lower lip',(0,.301,2.46),(.105,.027,.025),SKIN_LIGHT,'head',20,10)
capsule('Mouth',(-.095,.313,2.49),(.095,.313,2.49),.012,HAIR,'head',12)

# Hair is layered in locks instead of a single helmet-shaped cap.
for x,z,s in [(-.20,2.84,.16),(-.08,2.94,.19),(.07,2.96,.20),(.20,2.87,.17),(-.25,2.72,.13),(.26,2.73,.13)]:
    uv('Hair lock',(x,-.045,z),(s,.19,s*.85),HAIR,'head',20,12)
for side in (-1,1):
    for i in range(3):
        capsule('Beard lock',(side*(.04+i*.055),.285,2.47-i*.015),(side*(.05+i*.065),.27,2.24-i*.045),.035,HAIR,'head',12)
capsule('Beard centre',(0,.295,2.46),(0,.275,2.17),.055,HAIR,'head',14)

# Arms and hands, with readable fingers.
for side,label in ((-1,'L'),(1,'R')):
    capsule('Upper arm '+label,(side*.57,0,2.03),(side*.79,.015,1.67),.165,SKIN,'upper_arm.'+label)
    capsule('Forearm '+label,(side*.79,.015,1.67),(side*.84,.10,1.30),.145,SKIN,'forearm.'+label)
    uv('Palm '+label,(side*.84,.12,1.22),(.14,.09,.16),SKIN,'hand.'+label,24,14)
    for i in range(4):
        x=side*(.77+i*.045)
        capsule('Finger '+label,(x,.18,1.18),(x,.22,1.05),.026,SKIN,'hand.'+label,10)
    capsule('Thumb '+label,(side*.72,.17,1.25),(side*.67,.24,1.14),.03,SKIN,'hand.'+label,10)
    torus('Leather bracer '+label,(side*.82,.07,1.43),.145,.035,LEATHER2,'forearm.'+label,rotation=(0,math.pi/2,0))
    uv('Shoulder leather '+label,(side*.56,-.01,2.04),(.21,.25,.18),LEATHER,'upper_arm.'+label)

# Legs and boots.
for side,label in ((-1,'L'),(1,'R')):
    capsule('Thigh '+label,(side*.22,0,1.17),(side*.24,0,.68),.20,TROUSERS,'thigh.'+label)
    capsule('Shin '+label,(side*.24,0,.66),(side*.23,.045,.25),.16,LEATHER,'shin.'+label)
    cube('Boot '+label,(side*.23,.10,.13),(.18,.31,.13),LEATHER,'foot.'+label,.06)
    torus('Knee guard '+label,(side*.24,.13,.71),.16,.035,LEATHER2,'shin.'+label,rotation=(math.pi/2,0,0))

# Tailored layers and hardware.
uv('Chest vest',(0,-.02,1.80),(.52,.32,.51),LEATHER,'spine',32,20)
uv('Open shirt panel',(0,.285,1.79),(.235,.052,.42),SHIRT,'spine',28,18)
cube('Belt',(0,.285,1.36),(.42,.075,.09),LEATHER2,'hips',.025)
cube('Buckle',(0,.365,1.36),(.10,.025,.085),BRASS,'hips',.018)
for side in (-1,1):
    capsule('Vest strap',(side*.30,.34,2.12),(side*.22,.35,1.50),.037,LEATHER2,'spine',12)
    uv('Strap stud',(side*.28,.385,2.00),(.035,.018,.035),BRASS,'spine',12,8)

# Sword and scabbard establish the in-game scale.
cube('Sword blade',(.92,.14,.78),(.035,.045,.56),METAL,'hand.R',.015).rotation_euler[1]=-.20
cube('Sword grip',(.82,.13,1.31),(.055,.06,.19),LEATHER2,'hand.R',.025).rotation_euler[1]=-.20
cube('Sword guard',(.83,.13,1.16),(.22,.055,.045),BRASS,'hand.R',.025).rotation_euler[1]=-.20
uv('Sword pommel',(.78,.13,1.49),(.075,.065,.075),BRASS,'hand.R',16,10)

# The face is deliberately smaller than the first blockout: roughly six heads tall,
# closer to the heroic human reference while keeping readable MMO proportions.
head_pivot=Vector((0,0,2.42))
for obj,bone_name in objects:
    if bone_name=='head':
        obj.location=head_pivot+(obj.location-head_pivot)*.78
        obj.scale*=.78

# Armature with deformation-friendly hierarchy and extra hand/face bones.
bpy.ops.object.armature_add(enter_editmode=True, location=(0,0,0))
arm=bpy.context.object;arm.name='Orvalis_Human_Male_Rig';data=arm.data;root=data.edit_bones[0];root.name='root';root.head=(0,0,0);root.tail=(0,0,.35)
def bone(name,head,tail,parent):
    b=data.edit_bones.new(name);b.head=head;b.tail=tail;b.parent=data.edit_bones.get(parent);return b
bone('hips',(0,0,.85),(0,0,1.25),'root');bone('spine',(0,0,1.25),(0,0,2.20),'hips');bone('neck',(0,0,2.18),(0,0,2.42),'spine');bone('head',(0,0,2.40),(0,0,2.90),'neck')
for side,label in ((-1,'L'),(1,'R')):
    bone('upper_arm.'+label,(side*.43,0,2.08),(side*.76,0,1.70),'spine');bone('forearm.'+label,(side*.76,0,1.70),(side*.84,.08,1.31),'upper_arm.'+label);bone('hand.'+label,(side*.84,.08,1.31),(side*.84,.15,1.06),'forearm.'+label)
    bone('thigh.'+label,(side*.21,0,1.20),(side*.24,0,.70),'hips');bone('shin.'+label,(side*.24,0,.70),(side*.23,.03,.25),'thigh.'+label);bone('foot.'+label,(side*.23,.03,.25),(side*.23,.35,.10),'shin.'+label)
bpy.ops.object.mode_set(mode='OBJECT')

# Rigid bone weights keep the authored silhouette stable and make every piece animation-ready.
for obj,bone_name in objects:
    if bone_name:
        world=obj.matrix_world.copy();obj.parent=arm;obj.parent_type='BONE';obj.parent_bone=bone_name;obj.matrix_world=world

def make_action(name,frames,poses):
    act=bpy.data.actions.new(name);act.frame_start=0;act.frame_end=frames
    arm.animation_data_create();arm.animation_data.action=act
    for frame,values in poses.items():
        for bn,rot in values.items():
            pb=arm.pose.bones.get(bn)
            if not pb: continue
            pb.rotation_mode='XYZ';pb.rotation_euler=rot;pb.keyframe_insert('rotation_euler',frame=frame,group=bn)
    for pb in arm.pose.bones:
        pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.keyframe_insert('rotation_euler',frame=0,group=pb.name)
    track=arm.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,act);track.mute=True
    arm.animation_data.action=None

make_action('Idle',80,{20:{'spine':(.025,0,.01),'upper_arm.L':(0,0,-.04),'upper_arm.R':(0,0,.04)},60:{'spine':(-.012,0,-.008)}})
make_action('Walk',32,{8:{'thigh.L':(.55,0,0),'thigh.R':(-.48,0,0),'upper_arm.L':(-.35,0,0),'upper_arm.R':(.35,0,0)},24:{'thigh.L':(-.48,0,0),'thigh.R':(.55,0,0),'upper_arm.L':(.35,0,0),'upper_arm.R':(-.35,0,0)}})
make_action('Run',24,{6:{'thigh.L':(.78,0,0),'thigh.R':(-.65,0,0),'upper_arm.L':(-.60,0,0),'upper_arm.R':(.60,0,0)},18:{'thigh.L':(-.65,0,0),'thigh.R':(.78,0,0),'upper_arm.L':(.60,0,0),'upper_arm.R':(-.60,0,0)}})
make_action('Attack',30,{8:{'spine':(0,-.25,-.35),'upper_arm.R':(-.4,-.2,-1.25),'forearm.R':(-.6,0,0)},18:{'spine':(0,.25,.42),'upper_arm.R':(.25,.15,.8),'forearm.R':(-.15,0,0)}})
make_action('Hit',20,{6:{'spine':(-.22,0,.16),'head':(.15,0,-.12),'upper_arm.L':(.12,0,-.24)}})
make_action('Death',50,{20:{'spine':(0,0,.55),'thigh.L':(-.3,0,0),'thigh.R':(-.3,0,0)},50:{'root':(0,1.48,0),'spine':(0,0,.2),'head':(.4,0,0)}})

def export(path):
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', export_animations=True, export_nla_strips=True, export_apply=True, export_cameras=False, export_lights=False)

export(OUT/'human-male-hero-lod0.glb')

def decimate(ratio):
    for obj,_ in objects:
        if obj.type!='MESH' or len(obj.data.polygons)<80: continue
        mod=obj.modifiers.new('LOD reduction','DECIMATE');mod.ratio=ratio
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        try: bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError: pass
        obj.select_set(False)

decimate(.58);export(OUT/'human-male-hero-lod1.glb')
decimate(.42);export(OUT/'human-male-hero-lod2.glb')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'human-male-hero.blend'))
print('PILOT_OK',len(objects))
