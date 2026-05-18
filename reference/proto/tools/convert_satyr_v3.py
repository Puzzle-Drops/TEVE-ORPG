"""
Satyr GLB conversion — v3, the one that actually works.

Combines the best of v1 (convert_fbx_anims.py) and v2 (convert_satyr_v2.py):

  1. automatic_bone_orientation=False
       Preserves the FBX's authored bone roll/axes. The Stylized Creatures
       Bundle is a UE-style rig (bones authored off +Y), so Blender's
       "make bones nice" guess (orient=True) breaks the rest pose and
       produces a twisted mesh. orient=False = mesh matches skin weights.

  2. Defensive action gathering
       With orient=False, the FBX importer sometimes leaves per-take animations
       reachable only via NLA strips, not via bpy.data.actions. We gather
       actions from BOTH sources so nothing slips through.

  3. Wipe importer-created NLA tracks, then push our own
       Importer-created NLA strips reference the original FBX frame ranges
       (e.g. 4391-4451). If we leave them and add our own at frame 1, the
       exporter sees overlapping/duplicate clips and the timeline gets weird.
       Wipe first, then push only the actions we want.

  4. Shift each kept action's f-curves to start at frame 1
       The FBX stores all takes on one shared timeline at offsets like
       4391-4451. Shifting f-curves so each action lives in 1..length means
       NLA strips placed at frame 1 contain real animation data from t=0.

  5. export_animation_mode='ACTIONS'
       Exports each action as its own glTF animation clip, named after the
       action. Predictable, and the JS loader already does substring match
       on "Idle_2H" / "Walk_1H_WepR" etc.

Usage:
  blender --background --python convert_satyr_v3.py -- <input.fbx> <output.glb>
"""
import bpy
import sys

argv = sys.argv
argv = argv[argv.index("--") + 1:]
fbx_path = argv[0]
glb_path = argv[1]

WANTED_ANIMS = {
    "Idle_1H_WepR", "Walk_1H_WepR", "Attack_1H_WepR", "Death_1H_WepR",
    "Idle_2H",      "Walk_2H",      "Attack_2H",      "Death_2H",
}

# ---------------------------------------------------------------------------
# 1. Clean import with orient=False (preserves bind pose).
# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(
    filepath=fbx_path,
    automatic_bone_orientation=False,
    use_anim=True,
)

armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
print(f"\n[v3] Armatures: {[a.name for a in armatures]}")
print(f"[v3] bpy.data.actions count at import: {len(bpy.data.actions)}")

# ---------------------------------------------------------------------------
# 2. Gather actions from BOTH bpy.data.actions AND from NLA strips.
#    With orient=False the importer can hide actions inside NLA strips
#    without exposing them at the top level.
# ---------------------------------------------------------------------------
all_actions = set(bpy.data.actions)
for obj in bpy.data.objects:
    ad = obj.animation_data
    if not ad:
        continue
    if ad.action:
        all_actions.add(ad.action)
    for track in ad.nla_tracks:
        for strip in track.strips:
            if strip.action:
                all_actions.add(strip.action)

print(f"[v3] Total unique actions discovered: {len(all_actions)}")
for a in sorted(all_actions, key=lambda x: x.name):
    print(f"   - {a.name}  frames {int(a.frame_range[0])}-{int(a.frame_range[1])}")

# ---------------------------------------------------------------------------
# 3. Filter to wanted clips. Match by checking if any segment of the action
#    name (split on "|") is in WANTED_ANIMS — robust against name format
#    variations like "Armature|Idle_2H|BaseLayer", "Idle_2H", or "Take|Idle_2H".
# ---------------------------------------------------------------------------
def is_wanted(action_name):
    if "|" in action_name:
        for part in action_name.split("|"):
            if part in WANTED_ANIMS:
                return True
    return action_name in WANTED_ANIMS

kept_actions = sorted([a for a in all_actions if is_wanted(a.name)], key=lambda a: a.name)
print(f"\n[v3] Keeping {len(kept_actions)} actions:")
for a in kept_actions:
    print(f"   * {a.name}  frames {int(a.frame_range[0])}-{int(a.frame_range[1])}")

if len(kept_actions) == 0:
    print("[v3] WARNING: no actions matched WANTED_ANIMS. Check the names above.")

# ---------------------------------------------------------------------------
# 4. Shift kept actions so their f-curves start at frame 1. (Otherwise NLA
#    strips placed at frame 1 would extrapolate first-frame values backwards
#    from the original 4391+ range, polluting frame 1 and giving us 100+
#    seconds of "still pose" before the real animation starts.)
# ---------------------------------------------------------------------------
for action in kept_actions:
    offset = 1 - int(action.frame_range[0])
    if offset == 0:
        continue
    for fc in action.fcurves:
        for kp in fc.keyframe_points:
            kp.co.x += offset
            kp.handle_left.x += offset
            kp.handle_right.x += offset
        fc.update()

# ---------------------------------------------------------------------------
# 5. Wipe importer-created NLA tracks on every armature, then push our kept
#    actions back as one strip per track. Strips at frame 1.
# ---------------------------------------------------------------------------
for arm in armatures:
    if arm.animation_data is None:
        arm.animation_data_create()
    ad = arm.animation_data
    ad.action = None
    while len(ad.nla_tracks) > 0:
        ad.nla_tracks.remove(ad.nla_tracks[0])
    for action in kept_actions:
        track = ad.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 1, action)

# Also wipe NLA on non-armature objects (Weapon_R / Weapon_L mount points).
# Their imported T_Pose strips would otherwise leak into the export and
# duplicate as separate animations.
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        continue
    ad = obj.animation_data
    if not ad:
        continue
    ad.action = None
    while len(ad.nla_tracks) > 0:
        ad.nla_tracks.remove(ad.nla_tracks[0])

# ---------------------------------------------------------------------------
# 6. Belt-and-suspenders: disable Armature modifier on each mesh during
#    export. Even with orient=False, this guarantees the depsgraph emits
#    the raw bind-pose mesh (no current-pose deformation baked in).
# ---------------------------------------------------------------------------
disabled_mods = []
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    for mod in obj.modifiers:
        if mod.type == 'ARMATURE':
            disabled_mods.append((mod, mod.show_viewport, mod.show_render))
            mod.show_viewport = False
            mod.show_render = False
print(f"[v3] Disabled {len(disabled_mods)} Armature modifier(s) for clean bind-pose export.")

# ---------------------------------------------------------------------------
# 7. Export. ACTIONS mode emits each action as its own clip named after the
#    action. JS loader uses substring match on "Idle_1H_WepR" etc, which
#    matches names like "Armature|Idle_1H_WepR|BaseLayer".
# ---------------------------------------------------------------------------
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_skins=True,
)
print(f"\n[v3] Converted {fbx_path} -> {glb_path}")
