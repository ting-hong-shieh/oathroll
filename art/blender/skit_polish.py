"""Polish pass for the cold open: opens skit.blend (built by skit.py), adds a slow push-in, depth of field,
motion blur, character rim lights, bloom and more samples, then saves skit_v2.blend and re-exports the
card's per-frame text quad so video/skit_dc.py can still write "DC 16 -> 14" on the vellum.

  blender -b skit.blend -P skit_polish.py -- build <old_quads.json> <new_quads.json>   (CPU is fine)
  blender -b skit_v2.blend -P skit_polish.py -- preview <outDir> <f1,f2,...> [pct]    (CPU, low samples)
  blender -b skit_v2.blend -P skit_polish.py -- frames <outDir> <start> <end>         (CUDA, resumes)
"""
import bpy, json, math, os, sys, time, pathlib
from mathutils import Vector, geometry
from bpy_extras.object_utils import world_to_camera_view

A = sys.argv[sys.argv.index("--") + 1:]
mode = A[0]
ROOT = pathlib.Path(__file__).resolve().parent
sc = bpy.context.scene
cam = sc.camera
W, H = sc.render.resolution_x, sc.render.resolution_y
card = bpy.data.objects["Ruling card"]
PUSH_END = 300


def pix_ray(px, py):
    fr = [cam.matrix_world @ v for v in cam.data.view_frame(scene=sc)]  # TR, BR, BL, TL
    tr, br, bl, tl = fr
    u, v = px / W, py / H
    p = tl.lerp(tr, u).lerp(bl.lerp(br, u), v)
    o = cam.matrix_world.translation.copy()
    return o, p


def project(local):
    c = world_to_camera_view(sc, cam, card.matrix_world @ Vector(local))
    return [c.x * W, (1 - c.y) * H]


def smoothstep(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


if mode == "build":
    old_quads = json.load(open(A[1]))
    # 1. Recover the quad's corners in the card's local frame from frame 1 of the original camera.
    sc.frame_set(1); bpy.context.view_layer.update()
    mw = card.matrix_world
    n = (mw.to_3x3() @ Vector((0, 0, 1))).normalized()
    locals_ = []
    for px, py in old_quads["quads"]["1"]:
        best = None
        for z in (0.12, 0.10, 0.14, 0.0):
            o, p = pix_ray(px, py)
            hit = geometry.intersect_line_plane(o, p, mw @ Vector((0, 0, z)), n)
            if hit is not None:
                best = (mw.inverted() @ hit); break
        locals_.append(tuple(best))
    errs = []
    for f in (1, 150, 220, 300):
        sc.frame_set(f); bpy.context.view_layer.update()
        errs.append(max(abs(a - b) for q, ref in zip([project(l) for l in locals_], old_quads["quads"][str(f)]) for a, b in zip(q, ref)))
    print("QUAD_FIT_MAX_PX", [round(e, 2) for e in errs], "locals", [tuple(round(c, 3) for c in l) for l in locals_], flush=True)
    assert max(errs) < 2.0, "card quad corners do not reproduce the original quads"

    # 2. Slow push-in: a rig empty carries the camera ~7% closer along its view axis, eased, frames 1..300.
    sc.frame_set(1); bpy.context.view_layer.update()
    rig = bpy.data.objects.new("Dolly rig", None); sc.collection.objects.link(rig)
    cam.parent = rig
    fwd = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
    dist = 15.8
    for f in range(1, PUSH_END + 1, 3):
        rig.location = fwd * (float(os.environ.get("PUSH", "0.07")) * dist * smoothstep((f - 1) / (PUSH_END - 1)))
        rig.keyframe_insert("location", frame=f)
    # 3. Depth of field focused on the ruling card.
    d = cam.data.dof; d.use_dof = True; d.focus_object = card; d.aperture_fstop = float(os.environ.get("FSTOP", "1.4")); d.aperture_blades = 7; d.aperture_ratio = 1.0
    # 4. Motion blur, more samples, GPU denoise friendly settings.
    sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.45
    cy = sc.cycles
    cy.samples = 64; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.05; cy.adaptive_min_samples = 16
    cy.use_denoising = True
    try: cy.denoising_use_gpu = True
    except Exception as e: print("NO_GPU_DENOISE", e)
    try: cy.denoiser = "OPENIMAGEDENOISE"
    except Exception: pass
    cy.max_bounces = 8; cy.glossy_bounces = 4; cy.transmission_bounces = 6; cy.caustics_reflective = False; cy.caustics_refractive = False
    # 5. Rim lights that separate both characters from the dark wall, and a touch more moon.
    bpy.data.objects["Cool moon rim"].data.energy *= 1.25
    for name, target, offset, color, energy, size in (
            ("Wren rim", "Wren head", (-1.8, 2.6, 2.4), (0.55, 0.75, 1.0), 260.0, 1.2),
            ("Keeper rim", "Keeper expressive hood", (2.4, 2.2, 2.0), (1.0, 0.72, 0.45), 220.0, 1.0)):
        tgt = bpy.data.objects[target]
        ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.color = color; ld.size = size
        lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo)
        lo.location = tgt.matrix_world.translation + Vector(offset)
        c = lo.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
    # 6. Bloom on the candle, moon and seal highlights (compositor).
    try:
        ng = bpy.data.node_groups.new("Polish bloom", "CompositorNodeTree")
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        out = ng.nodes.new("NodeGroupOutput")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        def setin(node, key, val):
            if key in node.inputs: node.inputs[key].default_value = val; return True
            return False
        if hasattr(gl, "glare_type"):
            gl.glare_type = "BLOOM"; gl.quality = "HIGH"; gl.threshold = 1.0; gl.mix = -0.55; gl.size = 7
        else:
            setin(gl, "Type", "Bloom"); setin(gl, "Quality", "High"); setin(gl, "Threshold", 1.0); setin(gl, "Strength", 0.45); setin(gl, "Size", 0.6)
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
        ng.links.new(gl.outputs["Image"], out.inputs[0])
        sc.compositing_node_group = ng
        print("BLOOM_OK", [i.name for i in gl.inputs], flush=True)
    except Exception as e:
        print("BLOOM_SKIPPED", repr(e), flush=True)
    # 7. Re-export the per-frame text quad with the new camera.
    quads = {}
    for f in range(1, sc.frame_end + 1):
        sc.frame_set(f); bpy.context.view_layer.update()
        quads[str(f)] = [project(l) for l in locals_]
    json.dump({"card": old_quads.get("card"), "quads": quads, "locals": locals_}, open(A[2], "w"))
    sc.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "skit_v2.blend"), compress=True)
    print("POLISH_SAVED", quads["220"], flush=True)
    sys.exit(0)

out = pathlib.Path(A[1]); out.mkdir(parents=True, exist_ok=True)
if mode == "preview":
    sc.cycles.device = "CPU"; sc.cycles.samples = 16; sc.cycles.adaptive_min_samples = 8
    sc.render.resolution_percentage = int(A[3]) if len(A) > 3 else 33
    frames = [int(x) for x in A[2].split(",")]
else:
    pref = bpy.context.preferences.addons["cycles"].preferences; pref.compute_device_type = "CUDA"; pref.get_devices()
    gpu = [d for d in pref.devices if d.type == "CUDA"]
    if not gpu: raise RuntimeError("No CUDA device; CPU fallback is forbidden")
    for d in pref.devices: d.use = d.type == "CUDA"
    sc.cycles.device = "GPU"; sc.render.use_persistent_data = True; sc.render.resolution_percentage = 100
    if os.environ.get("SAMPLES"): sc.cycles.samples = int(os.environ["SAMPLES"]); sc.cycles.adaptive_threshold = float(os.environ.get("ADAPT", "0.03")); sc.cycles.adaptive_min_samples = 32
    frames = range(int(A[2]), int(A[3]) + 1)
    import ctypes, threading
    PEAK = [0.0]
    def monitor():
        try:
            lib = ctypes.CDLL("libnvidia-ml.so.1"); lib.nvmlInit_v2(); h = ctypes.c_void_p(); lib.nvmlDeviceGetHandleByIndex_v2(0, ctypes.byref(h))
            class Mem(ctypes.Structure): _fields_ = [("total", ctypes.c_ulonglong), ("free", ctypes.c_ulonglong), ("used", ctypes.c_ulonglong)]
            while True:
                m = Mem(); lib.nvmlDeviceGetMemoryInfo(h, ctypes.byref(m)); PEAK[0] = max(PEAK[0], m.used / 1048576)
                if PEAK[0] > 7168: print("VRAM_ABORT", PEAK[0], flush=True); os._exit(86)
                time.sleep(0.25)
        except Exception as e: print("MEMORY_MONITOR", repr(e), flush=True)
    threading.Thread(target=monitor, daemon=True).start()
for f in frames:
    dest = out / f"{f:04d}.png"
    if mode == "frames" and dest.exists() and dest.stat().st_size > 0: continue
    sc.frame_set(f); sc.render.filepath = str(dest.with_suffix(".tmp.png"))
    t = time.monotonic(); bpy.ops.render.render(write_still=True)
    os.replace(str(dest.with_suffix(".tmp.png")), str(dest))
    print("FRAME", f, round(time.monotonic() - t, 2), "peak_mib", round(PEAK[0]) if mode == "frames" else "-", flush=True)
