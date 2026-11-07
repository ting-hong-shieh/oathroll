"""Original procedural Oathroll art. Run in Blender 5.x, see README.md."""
import argparse
import ctypes
import json
import math
import os
import random
import resource
import sys
import threading
import time

import bpy
import bmesh
from mathutils import Vector, Quaternion

P = argparse.ArgumentParser()
P.add_argument('mode', choices=['check', 'preview', 'hero', 'cover', 'seal', 'rest', 'spin'])
P.add_argument('--start', type=int, default=1)
P.add_argument('--end', type=int, default=48)
A = P.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['check'])
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'renders')
os.makedirs(OUT, exist_ok=True)
random.seed(29)

def rgba(h):
    rgb = [int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)

def mat(name, color, metal=0, rough=.4):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=rgba(color)
    p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough
    return m

def noise_finish(m, scale=80, strength=.1, distance=.025):
    n=m.node_tree.nodes; l=m.node_tree.links
    tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=scale
    tex.inputs['Detail'].default_value=3
    bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=strength
    bump.inputs['Distance'].default_value=distance
    l.new(tex.outputs['Fac'],bump.inputs['Height'])
    l.new(bump.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
    return m

def mesh(name, verts, faces, m):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    if m: me.materials.append(m)
    return o

def bevel(o, width=.04, segments=3):
    b=o.modifiers.new('Soft worn edges','BEVEL'); b.width=width; b.segments=segments
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def box(name, loc, scale, m, edge=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o=bpy.context.object; o.name=name
    o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(m)
    if edge: bevel(o,edge)
    return o

def uv(name,loc,scale,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=True
    return o

def cyl(name,loc,r,depth,m,vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(m); bevel(o,.018,3)
    return o

def line(name, pts, radius, m):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.resolution_u=16
    c.bevel_depth=radius; c.bevel_resolution=3
    s=c.splines.new('POLY'); s.points.add(len(pts)-1)
    for p,co in zip(s.points,pts):p.co=(*co,1)
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o); o.data.materials.append(m)
    return o

def ring(name,r,z,m,center=(0,0),tube=.02):
    return line(name,[(center[0]+r*math.cos(t*math.tau/128),center[1]+r*math.sin(t*math.tau/128),z) for t in range(129)],tube,m)

def parent(o,p): o.parent=p; return o

def empty(name,loc=(0,0,0)):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=loc; return o

def aim(o,point): o.rotation_euler=(Vector(point)-o.location).to_track_quat('-Z','Y').to_euler()

def area(name,loc,power,color,size,target,size_y=None):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.color=color
    d.shape='DISK' if size_y is None else 'RECTANGLE'; d.size=size
    if size_y is not None:d.size_y=size_y
    o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); o.location=loc; aim(o,target)
    return o

def camera(loc,target,lens=50,ortho=None):
    d=bpy.data.cameras.new('Camera'); o=bpy.data.objects.new('Camera',d); bpy.context.collection.objects.link(o)
    o.location=loc; aim(o,target); d.lens=lens
    if ortho:d.type='ORTHO'; d.ortho_scale=ortho
    bpy.context.scene.camera=o; return o

def setup(transparent=False,samples=96):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    sc=bpy.context.scene; sc.render.engine='CYCLES'
    pref=bpy.context.preferences.addons['cycles'].preferences
    found=False
    for backend in ['OPTIX','CUDA']:
        try:
            pref.compute_device_type=backend; pref.get_devices()
            devices=[d for d in pref.devices if d.type==backend]
            if devices:
                for d in pref.devices:d.use=(d.type==backend)
                print('OATHROLL_GPU',backend,[(d.name,d.type,d.use) for d in pref.devices],flush=True)
                found=True; break
        except Exception as e: print('GPU_BACKEND',backend,str(e),flush=True)
    if not found: raise RuntimeError('No OptiX or CUDA GPU found; refusing CPU render')
    sc.cycles.device='GPU'; sc.cycles.samples=samples; sc.cycles.use_denoising=True
    sc.cycles.adaptive_threshold=.035; sc.cycles.max_bounces=6
    sc.cycles.diffuse_bounces=3; sc.cycles.glossy_bounces=4
    sc.cycles.transmission_bounces=4; sc.render.threads_mode='FIXED'; sc.render.threads=2
    sc.render.film_transparent=transparent
    sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'
    sc.render.image_settings.color_depth='8'; sc.render.image_settings.compression=35
    sc.render.resolution_percentage=100
    sc.world.color=(.025,.025,.025)
    sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.035,.06,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=.22
    sc.view_settings.view_transform='AgX'
    try:sc.view_settings.look='AgX - Medium High Contrast'
    except:pass
    return sc

def materials():
    global GOLD, OBSIDIAN, WAX, WAX_RAISED, PAPER, LEATHER, BRASS, INK
    GOLD=noise_finish(mat('Gilt • brushed antique gold','C9A24A',.82,.24),125,.12,.006)
    BRASS=noise_finish(mat('Aged brass','A48242',.8,.28),70,.17,.015)
    OBSIDIAN=noise_finish(mat('Obsidian • polished volcanic glass','101B1C',.38,.16),140,.075,.008)
    OBSIDIAN.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.65
    WAX=noise_finish(mat('Vermilion sealing wax','B8322A',.05,.29),95,.18,.012)
    WAX.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value=.055
    WAX_RAISED=noise_finish(mat('Raised wax impression','A02B24',.06,.27),95,.12,.009)
    PAPER=noise_finish(mat('Warm vellum','EDE3CF',0,.72),155,.25,.018)
    LEATHER=noise_finish(mat('Ink leather binding','221C18',.08,.43),75,.32,.025)
    INK=mat('Deep ink','14110F',0,.65)

def die(loc=(0,0,0),radius=1):
    root=empty('Obsidian and gilt d20',loc)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=radius)
    base=bpy.context.object; base.name='Twenty golden seams'; base.data.materials.append(GOLD)
    verts=[v.co.copy() for v in base.data.vertices]; faces=[tuple(p.vertices) for p in base.data.polygons]
    bevel(base,.016*radius,3); parent(base,root)
    for i,f in enumerate(faces):
        center=sum((verts[j] for j in f),Vector())/3
        normal=center.normalized()
        tri=[tuple(center+(verts[j]-center)*.944+normal*.009*radius) for j in f]
        o=mesh('Blank obsidian facet %02d'%i,tri,[(0,1,2)],OBSIDIAN)
        s=o.modifiers.new('Obsidian thickness','SOLIDIFY'); s.thickness=.018*radius
        bevel(o,.007*radius,3); parent(o,root)
    # Rotate a face normal to the camera-facing resting direction.
    normal=(sum((verts[j] for j in faces[0]),Vector())/3).normalized()
    root.rotation_mode='QUATERNION'; root.rotation_quaternion=normal.rotation_difference(Vector((0,-.45,1)).normalized())
    return root

def seal(loc=(0,0,0),scale=1):
    root=empty('Radial oath seal',loc); root.scale=(scale,scale,scale)
    N=128; verts=[]; levels=[(.0,.055),(.38,.055),(.70,.055),(.83,.105),(.96,.09),(1.0,.035),(1.0,-.06)]
    # A softly pooled edge, and a shallow pressed center.
    for r,z in levels:
        for i in range(N):
            a=i*math.tau/N; organic=1+.026*math.sin(7*a)+.019*math.cos(11*a)+.012*math.sin(19*a)
            verts.append((r*organic*math.cos(a),r*organic*math.sin(a),z+(.007*math.sin(9*a) if r>.75 else 0)))
    faces=[]
    for j in range(len(levels)-1):
        for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    faces.append(tuple(reversed(range((len(levels)-1)*N,len(levels)*N))))
    o=parent(mesh('Pooled sealing wax',verts,faces,WAX),root)
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data);bm.free()
    for p in o.data.polygons:p.use_smooth=True
    parent(ring('Pressed circular rim',.705,.069,WAX_RAISED,tube=.026),root)
    parent(ring('Sigil heart',.145,.078,WAX_RAISED,tube=.027),root)
    for i in range(8):
        a=i*math.tau/8
        def pt(r,t,z=.079):return (r*math.cos(t),r*math.sin(t),z)
        parent(line('Radial spoke with notch', [pt(.19,a),pt(.44,a),pt(.44,a+.15),pt(.55,a+.12),pt(.59,a)],.025,WAX_RAISED),root)
    return root

def crack(root):
    # Bisect all solids at the same plane after a reversible jagged-space warp.
    halves=[empty('Left wax fragment'),empty('Right wax fragment')]
    def jitter(y):return .045*math.sin(y*14)+.024*math.sin(y*31)
    for child in list(root.children):
        bpy.context.view_layer.objects.active=child; child.select_set(True)
        if child.type=='CURVE':bpy.ops.object.convert(target='MESH')
        child.select_set(False)
        for side in [0,1]:
            o=child.copy(); o.data=child.data.copy(); bpy.context.collection.objects.link(o)
            bm=bmesh.new(); bm.from_mesh(o.data)
            for v in bm.verts:v.co.x-=jitter(v.co.y)
            geo=list(bm.verts)+list(bm.edges)+list(bm.faces)
            result=bmesh.ops.bisect_plane(bm,geom=geo,dist=.0001,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=side==0,clear_outer=side==1)
            boundary=[e for e in bm.edges if e.is_boundary]
            try:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
            except:pass
            for v in bm.verts:v.co.x+=jitter(v.co.y)
            bm.to_mesh(o.data); bm.free(); o.parent=halves[side]
        bpy.data.objects.remove(child,do_unlink=True)
    halves[0].location.x=.075; halves[1].location.x=-.075
    halves[0].rotation_euler.z=-.018; halves[1].rotation_euler.z=.018

def wood():
    m=mat('Dark oak • long open grain','39271E',.05,.34); n=m.node_tree.nodes;l=m.node_tree.links
    tc=n.new('ShaderNodeTexCoord'); scale=n.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(.6,13,7)
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3;tex.inputs['Detail'].default_value=4;tex.inputs['Roughness'].default_value=.75
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.19;ramp.color_ramp.elements[0].color=rgba('100C0B')
    ramp.color_ramp.elements[1].position=.83;ramp.color_ramp.elements[1].color=rgba('5A3927')
    l.new(tc.outputs['Generated'],scale.inputs[0]);l.new(scale.outputs[0],tex.inputs[0]);l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.035
    l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],n.get('Principled BSDF').inputs['Normal'])
    return m

def ledger(loc):
    root=empty('Open blank vellum ledger',loc);root.rotation_euler.z=-.13
    parent(box('Heavy leather cover',(0,0,.10),(4.1,2.75,.17),LEATHER,.075),root)
    for side in [-1,1]:
        for layer in range(13):
            z=.20+layer*.011
            parent(box('Deckled page edge',(side*1.015,0,z),(1.97,2.58,.014),PAPER,.006),root)
        # Curved top sheets, defined across the spine.
        verts=[];nx=48;ny=10
        for y in range(ny+1):
            yy=-1.29+2.58*y/ny
            for x in range(nx+1):
                t=x/nx;xx=side*(.018+1.97*t)
                z=.34+.19*math.sin(math.pi*t)*math.exp(-1.7*t)+.035*t+.012*math.sin(yy*2+t*4)
                verts.append((xx,yy,z))
        faces=[]
        for j in range(ny):
            for i in range(nx):
                v=j*(nx+1)+i;faces.append((v,v+1,v+nx+2,v+nx+1))
        o=parent(mesh('Blank flowing vellum page',verts,faces,PAPER),root)
        for f in o.data.polygons:f.use_smooth=True
        s=o.modifiers.new('Paper thickness','SOLIDIFY');s.thickness=.008
    parent(line('Exposed gold spine cord',[(0,-1.28,.34),(0,0,.35),(0,1.28,.34)],.014,GOLD),root)
    for x in [-1.92,1.92]:
        for y in [-1.22,1.22]:parent(box('Brass binding corner',(x,y,.204),(.23,.19,.018),GOLD,.015),root)
    ribbon=mat('Verdigris ribbon','3E8E7E',.05,.55)
    parent(line('Bookmark ribbon',[(.6,.8,.46),(.7,-.7,.43),(.74,-1.5,.12),(.85,-1.8,.025)],.035,ribbon),root)
    return root

def candle(x,y):
    wax=noise_finish(mat('Warm beeswax','E5CCA0',0,.35),60,.08,.015)
    wax.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value=.10
    cyl('Brass candle dish',(x,y,.06),.53,.1,BRASS)
    cyl('Turned candlestick foot',(x,y,.19),.30,.20,BRASS)
    cyl('Candlestick stem',(x,y,.43),.11,.44,BRASS)
    cyl('Wax drip cup',(x,y,.68),.33,.09,BRASS)
    cyl('Beeswax candle',(x,y,1.38),.23,1.37,wax)
    for i in range(9):
        a=i*math.tau/9;length=random.uniform(.12,.58)
        uv('Cooled wax rivulet',(x+.214*math.cos(a),y+.214*math.sin(a),1.98-length/2),(.036,.036,length/2),wax)
    cyl('Dark wick',(x,y,2.12),.013,.14,INK,16)
    flame=mat('Amber flame','FF9C26',0,.4);p=flame.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(1,.30,.035,1);p.inputs['Emission Strength'].default_value=6
    core=mat('Ivory flame heart','FFF0C2',0,.4);p=core.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(1,.72,.33,1);p.inputs['Emission Strength'].default_value=10
    # Teardrop flame with a softly curling tip.
    vs=[];fs=[]
    for j in range(17):
        t=j/16;r=.10*math.sin(math.pi*t)**.8*(1-.5*t)
        for i in range(32):
            a=i*math.tau/32;vs.append((x+r*math.cos(a)+.065*t*t,y+r*math.sin(a),2.13+t*.43))
    for j in range(16):
        for i in range(32):v=j*32+i;fs.append((v,j*32+(i+1)%32,(j+1)*32+(i+1)%32,v+32))
    o=mesh('Living teardrop flame',vs,fs,flame)
    for p in o.data.polygons:p.use_smooth=True
    uv('Flame heart',(x,y-.018,2.24),(.037,.037,.105),core)
    d=bpy.data.lights.new('Candle practical','POINT');d.energy=48;d.color=(1,.42,.12);d.shadow_soft_size=.25
    o=bpy.data.objects.new('Candle practical',d);bpy.context.collection.objects.link(o);o.location=(x,y,2.3)

def quill_holder(x,y):
    cyl('Brass quill holder',(x,y,.23),.26,.44,BRASS)
    cyl('Dark opening',(x,y,.459),.20,.008,INK)
    ring('Rolled brass lip',.24,.46,GOLD,(x,y),.025)
    feather=mat('Raven feather','344140',.32,.33)
    start=Vector((x,y,.4));end=Vector((x+.30,y+.2,2.65))
    line('Gilt quill shaft',[start,end],.015,GOLD)
    # Narrow tapered feather vanes, gently curved and individually cut.
    axis=end-start;across=Vector((.8,-.6,-.15))
    for side in [-1,1]:
        for i in range(36):
            t=.27+i*.019;w=.24*math.sin((t-.22)/.75*math.pi)**.7
            p=start+axis*t;q=start+axis*(t+.07)+across*w*side
            mesh('Raven quill vane',[tuple(p),tuple(q),tuple(start+axis*(t+.014))],[(0,1,2)],feather)

def window_scene():
    frame=mat('Blackened window oak','19191A',.15,.46)
    wall=mat('Night plaster','171C23',0,.85)
    # Back wall frames a broad opening, with the left kept almost black.
    box('Left shadow wall',(-6.2,5.5,4),(7,.3,8),wall)
    box('Right shadow wall',(8.5,5.5,4),(3,.3,8),wall)
    for x in [-2.7,6.8]:box('Window jamb',(x,5.3,3.3),(.20,.42,6.6),frame,.03)
    box('Window sill',(2.05,5.18,.38),(9.8,.72,.22),frame,.045)
    box('Window mullion',(1.8,5.32,4.2),(.12,.24,8),frame,.02)
    box('Window transom',(2.0,5.32,5.8),(9.5,.24,.10),frame,.02)
    sky=mat('Midnight marine sky','18303F',0,1)
    p=sky.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=rgba('18303F');p.inputs['Emission Strength'].default_value=.42
    box('Distant night',(2,24,7),(65,.2,22),sky)
    sea=mat('Moonlit drowned harbor','25404A',.6,.26)
    n=sea.node_tree.nodes;l=sea.node_tree.links
    tc=n.new('ShaderNodeTexCoord');stretch=n.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(8,60,1)
    ripples=n.new('ShaderNodeTexNoise');ripples.inputs['Scale'].default_value=3;ripples.inputs['Detail'].default_value=3
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.5;bump.inputs['Distance'].default_value=.08
    l.new(tc.outputs['Generated'],stretch.inputs[0]);l.new(stretch.outputs[0],ripples.inputs[0]);l.new(ripples.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],n.get('Principled BSDF').inputs['Normal'])
    box('Drowned harbor water',(2,14,-.28),(45,28,.1),sea)
    moon=mat('Pale moon','BAD4DD',0,1);p=moon.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=rgba('BAD4DD');p.inputs['Emission Strength'].default_value=1.8
    uv('Low moon',(7.0,22,3.9),(.67,.08,.67),moon)
    town_before=set(bpy.context.scene.objects)
    stone=mat('Drowned tower silhouette','101C25',0,.9)
    bx=3.7;by=13
    box('Bell tower',(bx,by,1.38),(.87,.78,3.05),stone,.025)
    box('Belfry cornice',(bx,by,2.95),(1.12,1,.16),stone,.02)
    for dx in [-.38,.38]:
        for dy in [-.34,.34]:box('Open belfry pillar',(bx+dx,by+dy,3.43),(.13,.13,.85),stone,.015)
    box('Belfry roof ledge',(bx,by,3.91),(1.06,.96,.12),stone,.02)
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.83,radius2=0,depth=1.04,location=(bx,by,4.48),rotation=(0,0,math.pi/4))
    bpy.context.object.data.materials.append(stone);bpy.context.object.name='Pointed bell tower roof'
    line('Tower finial',[(bx,by,4.97),(bx,by,5.36)],.02,stone)
    # Bell visible in the open belfry, plus partially submerged rooftops.
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.21,radius2=.10,depth=.3,location=(bx,by,3.39));bpy.context.object.data.materials.append(BRASS)
    for x,y,w in [(-.2,15,1.8),(1.4,16,1.5),(6,15,2.1),(8,17,1.8)]:
        mesh('Submerged rooftop',[(x-w/2,y-.7,-.15),(x+w/2,y-.7,-.15),(x,y-.7,.5),(x-w/2,y+.7,-.15),(x+w/2,y+.7,-.15),(x,y+.7,.5)],[(0,1,2),(3,5,4),(0,2,5,3),(2,1,4,5)],stone)
    town=empty('Drowned town scale')
    for o in set(bpy.context.scene.objects)-town_before-{town}:o.parent=town
    town.scale.z=.78

def hero():
    sc=setup(False,48 if A.mode=='preview' else 128);materials()
    wm=wood()
    for j in range(8):box('Solid dark oak desk plank',(0,-4+j*1.37,-.18),(22,1.355,.34),wm,.025)
    ledger((1.20,.9,.015))
    # Sealed folded card, with fine edge tooling but no glyphs.
    card=empty('Sealed blank card',(1.55,-1.40,.04));card.rotation_euler.z=.12
    parent(box('Folded vellum card',(0,0,.035),(2.3,1.38,.07),PAPER,.024),card)
    parent(line('Folded envelope flap',[(-1.10,.62,.082),(0,-.15,.082),(1.10,.62,.082)],.009,mat('Vellum fold shadow','9D8A6D',0,.9)),card)
    s=seal((0,-.13,.13),.48);s.parent=card
    d=die((3.73,-1.22,.88),.83)
    d.rotation_quaternion=Quaternion(Vector((.3,.6,1)).normalized(),.22)@d.rotation_quaternion
    candle(3.62,2.1);quill_holder(5.7,.6)
    # A closed docket grounds the composition beside the quill.
    box('Closed leather docket',(4.95,1.7,.13),(1.3,1.7,.25),LEATHER,.07)
    for y in [1.02,2.38]:box('Docket brass band',(4.95,y,.265),(1.23,.045,.025),GOLD,.012)
    window_scene()
    area('Warm candle key',(1.8,.4,4.5),265,(1,.49,.20),3.0,(2,0,0))
    area('Cold moon through window',(1.8,4.6,6.2),350,(.27,.55,1),4.5,(1.8,0,.3),3)
    area('Long gold reflection',(5,-2.0,3.2),130,(1,.72,.42),.8,(3.7,-1.2,.9),3)
    area('Faint front vellum lift',(-1,-4,4),45,(.62,.72,1),5,(1,.5,0))
    area('Sea silver path',(4,14,6),900,(.36,.58,1),5,(4,13,0),2)
    cam=camera((0,-12,5.6),(.25,1,1.85),36)
    focus=empty('Focus on the sealed ruling',(2,-.9,.35));cam.data.dof.use_dof=True;cam.data.dof.focus_object=focus;cam.data.dof.aperture_fstop=.85
    # Compositor API changed in 5.2; keep the physically lit render independent
    # of compositor version and preserve clean alpha for the UI assets.
    if A.mode=='preview':render('hero-preview.png',960,540)
    elif A.mode=='cover':
        cam.data.lens=34
        render('cover_1120x560.png',1120,560)
    else:
        sc.render.resolution_x=1920;sc.render.resolution_y=1080;sc.render.filepath='//renders/hero_desk.png'
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'oathroll-hero.blend'),compress=True)
        render('hero_desk.png',1920,1080)
        cam.data.lens=34
        render('cover_1120x560.png',1120,560)

def studio():
    area('Warm candle softbox',(-3,-4,5),550,(1,.66,.35),3,(0,0,0),4)
    area('Moonlit blue edge',(3,1,4),700,(.32,.63,1),2.5,(0,0,0),4)
    area('Long ivory strip',(1,-4,1.5),160,(1,.9,.73),.6,(0,0,0),3)
    area('Soft overhead gold',(-1,2,5),220,(1,.78,.47),2,(0,0,0))

def render(name,w,h):
    sc=bpy.context.scene;sc.render.resolution_x=w;sc.render.resolution_y=h
    sc.render.filepath=os.path.join(OUT,name);os.makedirs(os.path.dirname(sc.render.filepath),exist_ok=True)
    peak_gpu=[None];stop=threading.Event()
    def monitor():
        try:
            lib=ctypes.CDLL('libnvidia-ml.so.1');lib.nvmlInit_v2()
            handle=ctypes.c_void_p();lib.nvmlDeviceGetHandleByIndex_v2(0,ctypes.byref(handle))
            class Memory(ctypes.Structure):
                _fields_=[('total',ctypes.c_ulonglong),('free',ctypes.c_ulonglong),('used',ctypes.c_ulonglong)]
            while not stop.is_set():
                mem=Memory()
                if lib.nvmlDeviceGetMemoryInfo(handle,ctypes.byref(mem))==0:peak_gpu[0]=max(peak_gpu[0] or 0,mem.used/1048576)
                stop.wait(.25)
        except Exception as e:print('GPU_MEMORY_MONITOR_UNAVAILABLE',str(e),flush=True)
    thread=threading.Thread(target=monitor,daemon=True);thread.start()
    t=time.monotonic()
    try:bpy.ops.render.render(write_still=True)
    finally:stop.set();thread.join(timeout=1)
    elapsed=time.monotonic()-t
    stats={'file':name,'seconds':round(elapsed,2),'samples':sc.cycles.samples,'size':[w,h],
           'peak_process_ram_mib':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1),
           'peak_gpu_total_used_mib':peak_gpu[0]}
    with open(os.path.join(OUT,'render-times.jsonl'),'a') as f:f.write(json.dumps(stats)+'\n')
    print('OATHROLL_RENDER',name,round(elapsed,2),flush=True)

if A.mode=='check':
    setup();print('OATHROLL_READY',bpy.app.version_string,flush=True)
elif A.mode in ['hero','cover','preview']:hero()
elif A.mode=='seal':
    sc=setup(True,128);materials();studio();s=seal()
    sc.view_settings.exposure=-.8
    camera((0,-3.5,7.3),(0,0,0),58,2.65)
    sc.render.resolution_x=1024;sc.render.resolution_y=1024;sc.render.filepath='//renders/seal_intact.png'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'oathroll-seal.blend'),compress=True)
    render('seal_intact.png',1024,1024)
    crack(s);render('seal_cracked.png',1024,1024)
elif A.mode=='rest':
    sc=setup(True,128);materials();studio();d=die()
    camera((0,-4.3,3.3),(0,0,0),60,2.65)
    sc.render.resolution_x=1024;sc.render.resolution_y=1024;sc.render.filepath='//renders/d20_rest.png'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'oathroll-d20.blend'),compress=True)
    render('d20_rest.png',1024,1024)
elif A.mode=='spin':
    sc=setup(True,64);materials();studio();d=die(radius=.9)
    camera((0,-4.5,3.1),(0,0,0),60,2.65)
    initial=d.rotation_quaternion.copy();axis=Vector((.38,.78,.49)).normalized()
    sc.render.fps=24;sc.frame_start=1;sc.frame_end=48
    sc.render.resolution_x=512;sc.render.resolution_y=512;sc.render.filepath='//renders/d20_spin/'
    for frame in range(1,50):
        d.rotation_quaternion=Quaternion(axis,math.tau*(frame-1)/48)@initial
        d.keyframe_insert(data_path='rotation_quaternion',frame=frame)
    sc.frame_set(A.start)
    if A.start==1:bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'oathroll-d20-spin.blend'),compress=True)
    for frame in range(A.start,A.end+1):
        sc.frame_set(frame)
        render('d20_spin/%04d.png'%frame,512,512)
