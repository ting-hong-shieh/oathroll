"""Original Oathroll cold open. Blender 5.2: check | preview | frames --start N --end M.
CPU-only previews; final GPU renders must be launched by skit-queue.py.
"""
import argparse, ast, ctypes, json, math, os, random, resource, sys, threading, time
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Quaternion
from bpy_extras.object_utils import world_to_camera_view

P=argparse.ArgumentParser()
P.add_argument('mode',choices=['check','preview','frames'])
P.add_argument('--start',type=int,default=1)
P.add_argument('--end',type=int,default=318)
P.add_argument('--engine',choices=['eevee','cycles'],default='cycles')
P.add_argument('--preview-frames',default='1,45,96,159,220,280,318')
A=P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['check'])
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'renders'/'skit'; OUT.mkdir(parents=True,exist_ok=True)
# Reuse the project's palette conversion, rounded primitives, grain and wax geometry.
source=ast.parse((ROOT/'oathroll.py').read_text())
keep={'rgba','mat','noise_finish','mesh','bevel','box','uv','cyl','line','ring','parent','empty','aim','area','camera','materials','wood','seal','candle','die'}
exec(compile(ast.Module(body=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name in keep],type_ignores=[]),'oathroll.py','exec'))
random.seed(43)
N=318; FPS=30; IMPACT=220

def smooth(a,b,f):
    t=max(0,min(1,(f-a)/(b-a)));return t*t*(3-2*t)
def pulse(a,b,f):return math.sin(math.pi*max(0,min(1,(f-a)/(b-a))))
def mix(a,b,t):return a+(b-a)*t

def emission(name,h,strength):
    m=mat(name,h,0,.35);p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Emission Color'].default_value=rgba(h);p.inputs['Emission Strength'].default_value=strength
    return m

def torus(name,loc,major,minor,m,rotation=(0,0,0),scale=(1,1,1)):
    bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,location=loc,rotation=rotation,major_radius=major,minor_radius=minor)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=True
    return o

def child_uv(root,name,loc,scale,m):return parent(uv(name,loc,scale,m),root)
def arc(root,name,x,z,width,m):
    # In the face plane, a friendly closed-eye rainbow.
    return parent(line(name,[(x+width*t,-.731,z+.09*(1-t*t)) for t in [-1+i/8 for i in range(17)]],.035,m),root)

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene;sc.render.resolution_x=1920;sc.render.resolution_y=1080;sc.render.resolution_percentage=100
sc.render.fps=FPS;sc.frame_start=1;sc.frame_end=N
sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB';sc.render.image_settings.compression=25
sc.render.threads_mode='FIXED';sc.render.threads=1 if A.mode!='frames' else 2
sc.render.engine='CYCLES'
# EEVEE is selected explicitly for the remote first measurement. No local GL context.
if A.mode=='frames' and A.engine=='eevee':sc.render.engine='BLENDER_EEVEE'
sc.cycles.samples=8 if A.mode=='preview' else 32
sc.render.use_persistent_data=True
sc.cycles.use_adaptive_sampling=True;sc.cycles.adaptive_threshold=.10;sc.cycles.adaptive_min_samples=8
sc.cycles.use_denoising=True;sc.cycles.denoising_use_gpu=(A.mode=='frames');sc.cycles.max_bounces=4;sc.cycles.diffuse_bounces=1;sc.cycles.glossy_bounces=2
sc.cycles.device='CPU'
if A.mode=='frames' and A.engine=='cycles':
    pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='CUDA';pref.get_devices()
    gpu=[d for d in pref.devices if d.type=='CUDA']
    if not gpu:raise RuntimeError('No CUDA device; CPU fallback is forbidden')
    for d in pref.devices:d.use=d.type=='CUDA'
    sc.cycles.device='GPU'
if A.mode!='frames':
    # Never initialize a CUDA/OptiX backend for local work.
    os.environ['CUDA_VISIBLE_DEVICES']=''
sc.world.use_nodes=True;bg=sc.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=rgba('51667A');bg.inputs[1].default_value=.23
sc.view_settings.view_transform='AgX'
try:sc.view_settings.look='AgX - Medium High Contrast'
except:pass
materials()
TEAL=mat('Wren soft verdigris cloth','3E8E7E',0,.6)
TEAL_DARK=mat('Deep teal folds','255F5B',0,.7)
CLOAK=mat('Keeper plum cocoa velvet','594A56',0,.65)
TRIM=mat('Keeper warm piping','B28A65',.05,.5)
FACE=mat('Wren warm biscuit face','D4AC83',0,.6)
MASK=mat('Soft ink mask','27232A',0,.65)
EYE=mat('Cream eye whites','FFF2CC',0,.22)
PUPIL=mat('Big polished pupils','14110F',0,.16)
SHINE=emission('Eye pinlights','FFF3CD',.7)
GLOW=emission('Keeper honey eyes','FFD489',1.7)
IRON=mat('Heavy satin iron','44424C',.76,.29)

# Oak tabletop and toy-like turned feet. No image textures.
wm=wood()
for j in range(6):box('Oak tabletop plank',(0,-1.9+j*.73,-.15),(8.3,.715,.3),wm,.045)
box('Round desk apron',(0,-.15,-.49),(8.0,4.15,.4),wm,.12)
for x in [-3.45,3.45]:
    for y in [-1.6,1.5]:cyl('Turned desk leg',(x,y,-1.35),.18,1.7,wm)

# Soft stone surround, actual water and drowned rooftops through a moonlit window.
STONE=mat('Tower blue slate','34454E',0,.85);MORTAR=mat('Tower mortar','24323D',0,.9)
box('Back tower wall',(0,5.4,3.4),(19,.45,10),MORTAR,.08)
for side in [-1,1]:
    for row in range(7):
        for col in range(3):box('Rounded old masonry',(side*(4.4+col*1.55)+(row%2)*.25,5.0,row*.92),(1.48,.35,.83),STONE,.1)
SKY=emission('Night beyond window','183747',.45)
box('Deep night window',(0,4.98,3.25),(7.7,.05,6.4),SKY,.1)
FRAME=mat('Window weathered frame','665549',0,.6)
for x in [-3.9,3.9]:box('Window jamb',(x,4.78,3.2),(.22,.3,6.6),FRAME,.07)
box('Window sill',(0,4.7,.22),(8.1,.65,.23),FRAME,.07)
box('Window lintel',(0,4.7,6.4),(8.1,.42,.25),FRAME,.1)
SEA=mat('Flooded town water','356377',.3,.22)
box('Drowned water visible through window',(0,4.85,.7),(7.6,.03,1.1),SEA)
RIPPLE=emission('Stylized moonlit ripples','658C99',.2)
for i in range(15):
    x=random.uniform(-3.7,3.7);z=random.uniform(.25,1.15)
    line('Water reflection',[(x,4.81,z),(x+random.uniform(.1,.55),4.81,z)],.012,RIPPLE)
MOON=emission('Cream moon','D7E4DF',1.4)
uv('Moon disk',(-2.5,4.76,2.63),(.53,.07,.53),MOON)
SILH=mat('Drowned belfry silhouette','132730',0,1)
bx=2.6;by=4.7
box('Distant bell tower',(bx,by,1.23),(.64,.12,1.5),SILH,.015)
for dx in [-.28,.28]:box('Belfry pillars',(bx+dx,by,2.10),(.11,.14,.55),SILH,.01)
box('Belfry cornice',(bx,by,2.40),(.87,.15,.13),SILH,.02)
mesh('Belfry pointed roof',[(bx-.52,by,2.45),(bx+.52,by,2.45),(bx,by,2.98)],[(0,1,2)],SILH)
uv('Bell in silhouette',(bx,by-.02,2.07),(.16,.08,.20),TRIM)
for x in [-3.4,-1.5,.0,1.0,3.5]:
    mesh('Submerged roof',[(x-.4,4.73,.85),(x+.4,4.73,.85),(x,4.73,1.35)],[(0,1,2)],SILH)
# Hanging interior bell near the window, very soft and out of the action.
# Window silhouette provides the bell; the action needs no additional hanging prop.

# Keeper. Head and hands are independently animated; eyes stay attached to hood.
keeper=empty('Keeper actor',(1.15,1.22,0))
child_uv(keeper,'Keeper plump cloak',(0,0,.83),(1.04,.7,.95),CLOAK)
child_uv(keeper,'Keeper lower cloak',(0,0,.24),(1.10,.76,.37),CLOAK)
for side in [-1,1]:
    parent(line('Cloak rounded front seam',[(side*.1,-.68,1.25),(side*.37,-.72,.75),(side*.7,-.6,.18)],.018,TRIM),keeper)
head=parent(empty('Keeper expressive hood',(0,-.02,1.98)),keeper)
child_uv(head,'Soft deep hood',(0,0,0),(.94,.72,.92),CLOAK)
child_uv(head,'Velvet hood recess',(0,-.615,-.04),(.69,.155,.66),MASK)
parent(line('Hood opening warm trim',[(.73*math.sin(t*math.tau/96),-.69,.76*math.cos(t*math.tau/96)-.025) for t in range(97)],.035,TRIM),head)
child_uv(head,'Rounded hood curl',(.44,.09,.65),(.4,.35,.3),CLOAK)
keeper_open=[];keeper_arcs=[]
for x in [-.26,.26]:
    keeper_open.append(child_uv(head,'Keeper warm oval eye',(x,-.765,.02),(.092,.04,.14),GLOW))
    keeper_arcs.append(arc(head,'Keeper happy eye arc',x,.0,.125,GLOW))
hands=[]
sleeves=[]
for side in [-1,1]:
    hand=parent(empty('Keeper left mitten' if side<0 else 'Keeper right mitten',(side*1.0,-.58,.46)),keeper)
    child_uv(hand,'Rounded sleeve cuff',(0,.06,.05),(.27,.30,.25),CLOAK)
    child_uv(hand,'Biscuit mitten',(0,-.13,.07),(.22,.21,.23),FACE)
    child_uv(hand,'Mitten thumb',(-side*.16,-.13,.12),(.10,.12,.12),FACE)
    hands.append(hand)
    sleeves.append(child_uv(keeper,'Keeper soft connecting sleeve',(side*.8,-.3,.7),(.25,.25,.5),CLOAK))
# Brooch, with no symbol.
child_uv(keeper,'Gold cloak button',(0,-.717,1.05),(.09,.04,.09),GOLD)

# Wren: big teal hood, eye mask, shiny eyes and a jaunty scarf.
wren=empty('Wren actor',(-3.15,-2.95,-.15))
child_uv(wren,'Wren tiny round coat',(0,0,.48),(.57,.45,.56),TEAL)
for x in [-.23,.23]:child_uv(wren,'Wren little boot',(x,-.10,.10),(.22,.29,.16),TEAL_DARK)
whead=parent(empty('Wren head',(0,-.02,1.25)),wren)
child_uv(whead,'Wren oversized round hood',(0,0,0),(.76,.57,.72),TEAL)
child_uv(whead,'Wren warm face',(0,-.465,-.04),(.58,.17,.51),FACE)
child_uv(whead,'Wren little bandit mask',(0,-.6,.03),(.55,.075,.27),MASK)
for x in [-.24,.24]:
    child_uv(whead,'Wren ivory eye',(x,-.66,.05),(.19,.06,.205),EYE)
    child_uv(whead,'Wren glossy pupil',(x+.045,-.713,.055),(.111,.045,.14),PUPIL)
    child_uv(whead,'Wren big catchlight',(x+.012,-.754,.116),(.040,.016,.045),SHINE)
    child_uv(whead,'Wren tiny catchlight',(x+.082,-.756,.016),(.017,.013,.019),SHINE)
child_uv(whead,'Wren button nose',(0,-.69,-.14),(.075,.065,.055),FACE)
parent(line('Wren small smile',[(-.11,-.622,-.285),(0,-.65,-.31),(.11,-.622,-.285)],.018,MASK),whead)
# Squashy hood point, broad and floppy.
child_uv(whead,'Wren floppy hood nub',(-.39,.05,.55),(.38,.33,.23),TEAL)
parent(torus('Wren scarf collar',(0,0,.79),.42,.115,TEAL_DARK,scale=(1,.87,1)),wren)
scarf=parent(empty('Wren scarf tail',(.44,.04,.8)),wren)
parent(box('Wren scarf ribbon',(.17,.07,-.22),(.30,.13,.55),TEAL_DARK,.10),scarf)
warms=[]
for side in [-1,1]:
    arm=parent(empty('Wren mitten arm',(side*.55,-.06,.57)),wren)
    child_uv(arm,'Wren stubby sleeve',(0,0,0),(.19,.23,.27),TEAL)
    child_uv(arm,'Wren mitten',(0,-.12,-.15),(.17,.18,.17),FACE)
    warms.append(arm)

# Large flat ruling card with clear centre for editorial text.
card=empty('Ruling card',(0,-.91,.045))
parent(box('Vellum ruling card',(0,0,.045),(3.10,1.79,.09),PAPER,.075),card)
# Fine inset border deliberately leaves centre blank.
parent(line('Card fine border',[(-1.39,-.73,.098),(1.39,-.73,.098),(1.39,.73,.098),(-1.39,.73,.098),(-1.39,-.73,.098)],.012,TRIM),card)
s=seal((1.11,-.50,.16),.28);s.parent=card
# Purely abstract check strokes confined to upper-left corner, away from centre.
stroke=parent(line('Ink strike through',[(-1.12,.51,.105),(-.53,.48,.106)],.019,INK),card)
mark=parent(line('New abstract ruling mark',[(-1.22,.28,.107),(-1.10,.19,.107),(-.95,.37,.107)],.024,INK),card)
# Quill is held by the Keeper's nearer hand, then guided to the card.
cyl('Small ink pot',(-.65,.62,.11),.17,.18,IRON)
cyl('Ink pot opening',(-.65,.62,.208),.12,.012,INK)
quill=empty('Animated quill nib',(.0,.0,0))
parent(line('Quill gilt shaft',[(0,0,0),(.37,.23,1.0)],.016,GOLD),quill)
for side in [-1,1]:
    verts=[]
    for i in range(16):
        t=i/15;z=.26+t*.78;width=.14*math.sin(t*math.pi)**.7
        verts.extend([(.37*z,.23*z,z),(.37*z+side*width,.23*z,z+.07)])
    o=parent(mesh('Rounded teal feather vane',verts,[(i,i+1,i+3,i+2) for i in range(0,28,2)],TEAL_DARK),quill)
    so=o.modifiers.new('Feather thickness','SOLIDIFY');so.thickness=.015

coin=empty('Big persuasive gold coin')
parent(cyl('Fat gold coin',(0,0,0),.39,.10,GOLD),coin)
parent(ring('Coin raised rim',.315,.061,GOLD,tube=.024),coin)
parent(uv('Coin blank raised boss',(0,0,.067),(.18,.18,.018),GOLD),coin)
spark=empty('Coin glint')
for angle in [0,math.pi/2]:
    parent(line('Four point glint',[(-.18*math.cos(angle),0,-.18*math.sin(angle)),(0,0,0),(.18*math.cos(angle),0,.18*math.sin(angle))],.015,SHINE),spark)

# Heavy chain follows a rectangular loop around the CARD EDGES: centre remains visible.
chain=empty('Chain binding drop')
# Two parallel chains along long edges and short closing sides.
points=[]
for i in range(17):points.append((-1.60+3.2*i/16,-.82,.16))
for i in range(1,9):points.append((1.60,-.82+1.64*i/8,.16))
for i in range(1,17):points.append((1.60-3.2*i/16,.82,.16))
for i in range(1,8):points.append((-1.60,.82-1.64*i/8,.16))
for i,p in enumerate(points):
    # Alternating interlocking oval links, one flat and the next tipped upright.
    tangent=(Vector(points[(i+1)%len(points)])-Vector(points[i-1])).normalized()
    theta=math.atan2(tangent.y,tangent.x)
    o=parent(torus('Interlocked iron link %02d'%i,p,.105,.034,IRON,scale=(1.36,.88,1)),chain)
    o.rotation_euler=(math.radians(64) if i%2 else .12,0,theta)
# Corner claws wrap over the actual paper thickness onto its sides.
for x in [-1.52,1.52]:
    for y in [-.73,.73]:parent(line('Chain folded around card',[(x,y,.20),(x*1.07,y*1.08,.08),(x*1.04,y*1.04,-.02)],.045,IRON),chain)
# Lock at front edge, with no glyph or logo. Gradient is procedural, purple to teal.
LOCK=mat('Quiet purple to teal lock','7B6099',.45,.25)
n=LOCK.node_tree.nodes;l=LOCK.node_tree.links
tc=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');ramp=n.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color=rgba('8166A1');ramp.color_ramp.elements[1].color=rgba('4EAA97')
l.new(tc.outputs['Generated'],sep.inputs[0]);l.new(sep.outputs['X'],ramp.inputs[0]);p=n.get('Principled BSDF');l.new(ramp.outputs[0],p.inputs['Base Color']);l.new(ramp.outputs[0],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.35
lock=parent(empty('Padlock at front edge',(-1.18,-.92,.20)),chain)
parent(box('Rounded padlock body',(0,0,0),(.61,.28,.48),LOCK,.10),lock)
parent(line('Heavy rounded lock shackle',[(-.18,0,.17),(-.18,0,.37),(-.13,0,.46),(0,0,.49),(.13,0,.46),(.18,0,.37),(.18,0,.17)],.052,IRON),lock)
child_uv(lock,'Plain lock inset',(0,-.151,.01),(.055,.017,.07),INK)
# Small deterministic impact cloud: solid stylized puffs, no particle flicker.
DUST=mat('Vellum impact dust','C5AE8C',0,.9)
dust=[]
for i in range(12):
    a=math.tau*i/12;o=uv('Soft impact puff',(0,0,-10),(.15,.15,.12),DUST);dust.append((o,a))

# Practical light and foreground props kept clear of characters and card.
candle(3.05,1.1)
# A small original blank die grounds the scene in the existing game world.
d=die((2.8,-1.12,.38),.37)
area('Warm candle key',(-3.5,-3.8,6.3),690,(1,.68,.41),5,(0,0,1))
area('Cool moon rim',(.4,3.8,5.8),850,(.38,.65,1),4,(0,0,1))
area('Soft card light',(0,-.8,6.8),300,(1,.86,.63),4,(0,-1,0))
area('Front eye bounce',(0,-6,3),130,(.73,.85,1),4,(0,0,1.4))
cam=camera((0,-13.6,8.6),(0,.3,1.2),45)
cam.data.dof.use_dof=False

# All transforms are baked as ordinary Blender keyframes for reliable seeking/batches.
def key(o,path,f):o.keyframe_insert(data_path=path,frame=f)
def move(o,loc,f):o.location=loc;key(o,'location',f)
def scale(o,s,f):o.scale=(s,s,s) if isinstance(s,(int,float)) else s;key(o,'scale',f)
def rotate(o,rot,f):o.rotation_euler=rot;key(o,'rotation_euler',f)
for f in range(1,N+1):
    # Wren pop, anticipation, hop, facepalm, slump.
    pop=smooth(19,38,f);bounce=.14*pulse(33,48,f)
    slump=smooth(284,300,f)
    hop=.28*pulse(70,89,f)
    move(wren,(-3.15+.12*slump,-2.95,-4+3.85*pop+bounce+hop-.19*slump),f)
    squash=pulse(65,75,f)*.12-pulse(75,85,f)*.1
    scale(wren,(1+squash,1+squash,1-squash),f)
    rotate(wren,(.13*slump,.12*slump,-.06*pulse(38,57,f)-.06*slump),f)
    rotate(whead,(.13*slump,-.12*pulse(90,125,f),-.10*pulse(247,275,f)),f)
    rotate(scarf,(0,.18*math.sin(f*.12)*(pop)*(1-slump),-.1),f)
    palm=smooth(260,273,f)*(1-smooth(287,299,f))
    move(warms[0],(-.55+.47*palm,-.06-.68*palm,.57+.87*palm),f)
    rotate(warms[0],(-.45*palm,-.5*palm,.5*palm),f)
    offer=pulse(66,105,f)
    move(warms[1],(.55+.22*offer,-.06+.65*offer,.57+.14*offer),f)
    # Keeper happy wiggle followed by hurried scribble and a sheepish double shrug.
    happy=smooth(91,99,f)*(1-smooth(194,201,f));shrug=smooth(259,274,f)
    wiggle=math.sin(f*.57)*.045*happy*(1-smooth(123,136,f))
    move(keeper,(1.15,1.22,.035*math.sin(f*.10)+.08*shrug),f)
    rotate(keeper,(0,wiggle,wiggle*.65),f)
    rotate(head,(.07*shrug,0,.13*shrug),f)
    for o in keeper_open:scale(o,(.0001,.0001,.0001) if happy>.2 or shrug>.15 else (.092,.04,.14),f)
    for o in keeper_arcs:scale(o,1 if happy>.2 or shrug>.15 else .001,f)
    writing=smooth(138,147,f)*(1-smooth(188,199,f))
    for i,side in enumerate([-1,1]):
        if i==0:
            move(hands[i],(mix(-1,-1.95,writing),mix(-.58,-1.54,writing),mix(.46,.38,writing)+.025*math.sin(f*1.3)*writing),f)
        else:move(hands[i],(side*1.0,-.58,.46),f)
        base=hands[i].location.copy()
        move(hands[i],(base.x+side*.12*shrug,base.y-.04*shrug,base.z+.74*shrug),f)
        rotate(hands[i],(0,-side*.65*shrug,side*.22*shrug),f)
    # Coin travels from Wren to Keeper in one readable slide with a short bounce.
    slide=smooth(67,101,f)
    move(coin,(mix(-2.65,.1,slide),mix(-2.0,.80,slide),.14+.11*pulse(70,88,f)),f)
    rotate(coin,(0,0,slide*2.2),f)
    scale(coin,.001 if f<58 else smooth(58,65,f),f)
    move(spark,(-.25,.45,.28),f);scale(spark,.001+.85*pulse(105,119,f),f)
    # Nib stays on paper while scribbling; feather and hand move together.
    if f<138:qloc=(-.65,.62,.22)
    elif f<148:
        t=smooth(138,148,f);qloc=(mix(-.65,-1.12,t),mix(.62,-.40,t),mix(.22,.16,t))
    elif f<=164:
        t=smooth(148,164,f);qloc=(mix(-1.12,-.53,t),mix(-.40,-.43,t),.16)
    elif f<171:
        t=smooth(164,171,f);qloc=(mix(-.53,-1.22,t),mix(-.43,-.63,t),.16+.10*pulse(164,171,f))
    elif f<=184:
        t=smooth(171,184,f)
        if t<.4:qloc=(mix(-1.22,-1.10,t/.4),mix(-.63,-.72,t/.4),.16)
        else:qloc=(mix(-1.10,-.95,(t-.4)/.6),mix(-.72,-.54,(t-.4)/.6),.16)
    else:
        t=smooth(184,199,f);qloc=(mix(-.95,-.65,t),mix(-.54,.62,t),mix(.16,.22,t))
    move(quill,qloc,f);rotate(quill,(0,.12*math.sin(f*1.2)*writing,-.14),f)
    scale(quill,1,f)
    if 138<=f<=198:
        grip=Vector(qloc)+Vector((.16,.23,.36))-keeper.location
        move(hands[0],grip,f)
    for i,side in enumerate([-1,1]):
        shoulder=Vector((side*.70,-.18,1.00))
        endpoint=hands[i].location+Vector((0,.08,0))
        axis=endpoint-shoulder
        move(sleeves[i],(shoulder+endpoint)*.5,f)
        sleeves[i].rotation_euler=axis.to_track_quat('Z','Y').to_euler();key(sleeves[i],'rotation_euler',f)
        scale(sleeves[i],(.24,.24,axis.length*.5+.12),f)
    stroke.hide_render=f<149;stroke.keyframe_insert(data_path='hide_render',frame=f)
    mark.hide_render=f<171;mark.keyframe_insert(data_path='hide_render',frame=f)
    stroke.data.bevel_factor_end=max(.00001,smooth(149,164,f));stroke.data.keyframe_insert(data_path='bevel_factor_end',frame=f)
    mark.data.bevel_factor_end=max(.00001,smooth(171,184,f));mark.data.keyframe_insert(data_path='bevel_factor_end',frame=f)
    # Binding descends from outside view, compresses and settles without simulation.
    drop=max(0,min(1,(f-199)/21))**2
    settle=.10*math.sin((f-220)*.65)*math.exp(-(f-220)/7) if f>=220 else 0
    move(chain,(0,-.91,.045+(1-drop)*7+max(0,settle)),f)
    scale(chain,(1+.13*(1-drop),1+.13*(1-drop),1),f)
    squashcard=.42*pulse(220,227,f)
    scale(card,(1+.025*pulse(220,230,f),1+.025*pulse(220,230,f),1-squashcard),f)
    for o,a in dust:
        t=(f-220)/21
        if 0<=t<=1:
            move(o,(math.cos(a)*(1.4+t*.7),-.91+math.sin(a)*(.75+t*.5),.10+.22*math.sin(t*math.pi)),f)
            scale(o,tuple(v*(.9+1.2*t)*math.sin(math.pi*t) for v in (.15,.15,.12)),f)
        else:scale(o,.001,f)
    # Gentle push with a brief decaying impact shake, then a still reaction hold.
    push=min(f,300)/300
    shake=(math.exp(-(f-220)/4)*math.sin((f-220)*2.0) if 220<=f<238 else 0)
    cam.location=(.075*shake,mix(-13.6,-12.95,push),mix(8.6,8.25,push)+.055*shake)
    aim(cam,(0,.3,1.2));key(cam,'location',f);key(cam,'rotation_euler',f)
# Freeze the final 0.6 seconds for an editorial cut.
sc.frame_set(300)
for o in sc.objects:
    if o.animation_data:
        for frame in range(301,N+1):
            for path in ('location','rotation_euler','scale'):o.keyframe_insert(data_path=path,frame=frame)
# Linear baked poses prevent interpolation overshoot and preserve deterministic frames.
for o in sc.objects:
    if o.animation_data and o.animation_data.action:
        try:
            for layer in o.animation_data.action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for fc in bag.fcurves:
                            for k in fc.keyframe_points:k.interpolation='LINEAR'
        except AttributeError:pass
sc.frame_set(IMPACT);bpy.context.view_layer.update()
# Conservative blank rectangle on vellum centre, clear of all chain and ink geometry.
localcorners=[(-.78,-.34,.12),(.85,-.34,.12),(.85,.27,.12),(-.78,.27,.12)]
projected=[]
for p in localcorners:
    c=world_to_camera_view(sc,cam,card.matrix_world@Vector(p));projected.append([round(c.x*1920),round((1-c.y)*1080)])
metadata={'frames':N,'fps':FPS,'size':[1920,1080],'beats':{'coin_slide_start':67,'scribble_start':149,'chain_drop_start':199,'chain_impact':220,'shrug':259,'reaction_hold_start':301},'card_blank_quad_impact_px':projected,'card_blank_rect_impact_px':[max(projected[0][0],projected[3][0]),max(projected[2][1],projected[3][1]),min(projected[1][0],projected[2][0]),min(projected[0][1],projected[1][1])],'rectangle_convention':'x_left,y_top,x_right,y_bottom; origin top-left','engine':sc.render.engine}
(ROOT/'skit-edit.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('SKIT_EDIT',json.dumps(metadata),flush=True)
sc.frame_set(1)
if A.mode=='check':
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'skit.blend'),compress=True)
    print('SKIT_CHECK_OK',bpy.app.version_string,len(sc.objects),flush=True)
    sys.exit(0)

def render_frame(f,preview=False):
    sc.frame_set(f);sc.render.resolution_percentage=33 if preview else 100
    dest=(ROOT/'renders'/'skit-preview') if preview else OUT;dest.mkdir(exist_ok=True)
    sc.render.filepath=str(dest/f'{f:04d}.png')
    peak=[0.0];stop=threading.Event()
    def monitor():
        if preview:return
        try:
            lib=ctypes.CDLL('libnvidia-ml.so.1');lib.nvmlInit_v2();h=ctypes.c_void_p();lib.nvmlDeviceGetHandleByIndex_v2(0,ctypes.byref(h))
            class Mem(ctypes.Structure):_fields_=[('total',ctypes.c_ulonglong),('free',ctypes.c_ulonglong),('used',ctypes.c_ulonglong)]
            while not stop.is_set():
                m=Mem();lib.nvmlDeviceGetMemoryInfo(h,ctypes.byref(m));peak[0]=max(peak[0],m.used/1048576)
                if peak[0]>7168:os._exit(86)
                stop.wait(.25)
        except Exception as e:print('MEMORY_MONITOR',str(e),flush=True)
    t=threading.Thread(target=monitor,daemon=True);t.start();start=time.monotonic()
    try:bpy.ops.render.render(write_still=True)
    finally:stop.set();t.join(timeout=1)
    stats={'frame':f,'seconds':round(time.monotonic()-start,3),'preview':preview,'engine':sc.render.engine,'peak_gpu_total_mib':peak[0],'ram_mib':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024)}
    with (ROOT/'renders'/'skit-times.jsonl').open('a') as handle:handle.write(json.dumps(stats)+'\n')
    print('SKIT_RENDER',json.dumps(stats),flush=True)
if A.mode=='preview':
    for f in map(int,A.preview_frames.split(',')):render_frame(f,True)
else:
    assert 1<=A.start<=A.end<=N
    for f in range(A.start,A.end+1):render_frame(f)
