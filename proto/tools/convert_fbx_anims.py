"""
Blender CLI script to convert FBX to GLB, preserving a filtered set of animations.

The default convert_fbx.py loses animations that aren't actively assigned to
an armature's animation_data slot. Stylized Creatures Bundle FBXs ship many
takes per file (Idle_1H_WepR, Walk_2H, Attack_1H_WepR, Death_2H, etc.),
duplicated across three NLA layers (Armature, Weapon_L, Weapon_R) — a naive
re-export ends up at 14 MB with 240 clips, mostly bloat.

This script:
  1. Imports the FBX (use_anim=True)
  2. For the Armature object, pushes only the actions we care about onto NLA
     tracks. The filter is hardcoded for now to the Idle/Walk/Attack/Death
     × 1H_WepR/2H subset our prototype uses.
  3. Exports GLB with export_animation_mode='NLA_TRACKS'.

Usage: blender --background --python convert_fbx_anims.py -- <input.fbx> <output.glb>
"""
import bpy
import sys

argv = sys.argv
argv = argv[argv.index("--") + 1:]
fbx_path = argv[0]
glb_path = argv[1]

# Only export these specific animations. Match the second segment of the
# action name after the leading "Armature|" prefix (e.g. "Idle_1H_WepR").
WANTED_ANIMS = {
    "Idle_1H_WepR", "Walk_1H_WepR", "Attack_1H_WepR", "Death_1H_WepR",
    "Idle_2H",      "Walk_2H",      "Attack_2H",      "Death_2H",
}
# Only keep actions from this layer (drops Weapon_L|... and Weapon_R|... duplicates).
WANTED_PREFIX = "Armature|"

bpy.ops.wm.read_factory_settings(use_empty=True)
# automatic_bone_orientation=False keeps the FBX's authored bone roll/axes
# intact. Setting it True (Blender's "make bones nice" guess) breaks rigs
# whose bones were authored off the +Y axis — e.g. UE-style weapon-socket
# bones — producing a mesh that's twisted because the bind pose no longer
# matches the skin weights.
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=False, use_anim=True)

armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
print(f"Found {len(armatures)} armature(s); {len(bpy.data.actions)} action(s) in file.")

def wanted(action_name):
    if not action_name.startswith(WANTED_PREFIX):
        return False
    parts = action_name.split("|")
    if len(parts) < 2:
        return False
    return parts[1] in WANTED_ANIMS

kept_actions = [a for a in bpy.data.actions if wanted(a.name)]
print(f"Keeping {len(kept_actions)} actions:")
for a in kept_actions:
    print(f"  {a.name}")

for arm in armatures:
    if arm.animation_data is None:
        arm.animation_data_create()
    ad = arm.animation_data
    ad.action = None  # Clear the active action; NLA strips will drive playback
    for action in kept_actions:
        track = ad.nla_tracks.new()
        track.name = action.name
        # IMPORTANT: place each strip at frame 1 (not at the action's original
        # frame range). The FBX import preserves the action's source frames
        # — e.g. Idle_2H lives at frames 4391-4451 — and if we leave the
        # strip there, the glTF exporter bakes a clip running from time 0 to
        # ~185 seconds with actual animation data only in the last ~2.5s.
        # Three.js then "plays" 183 seconds of empty timeline (holding the
        # first keyframe) before reaching the actual motion, making the rig
        # appear to stand still. Strip at frame 1 = clip duration matches
        # the action's actual length.
        strip = track.strips.new(action.name, 1, action)
        strip.frame_start_ui = 1
        strip.frame_end_ui = 1 + int(action.frame_range[1] - action.frame_range[0])
        track.mute = False

# Disable the Armature modifier on every mesh during export. The depsgraph
# applies the modifier when evaluating mesh data for export, baking the
# current pose into the vertex positions — so even at scene frame 0, if any
# pose drives the rig, the mesh comes out deformed and three.js sees a
# "twisted" bind pose.
#
# Disabling the modifier (show_viewport/show_render = False) makes depsgraph
# skip the deformation, and the mesh evaluates to its raw vertex data, which
# IS the bind pose. The modifier metadata remains on the object, and the
# vertex groups carry the skin weights — so the glTF exporter still finds
# the armature relationship and writes a valid skin/inverseBindMatrices set.
# Animations sample bone keyframes from the NLA strips per-bone, never going
# through the mesh modifier, so they export with full motion data.
saved_mod_visibility = []  # [(modifier, show_viewport, show_render), ...]
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    for mod in obj.modifiers:
        if mod.type == 'ARMATURE':
            saved_mod_visibility.append((mod, mod.show_viewport, mod.show_render))
            mod.show_viewport = False
            mod.show_render = False
print(f"Disabled {len(saved_mod_visibility)} Armature modifier(s) for mesh-bind-pose snapshot.")

bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_skins=True,
)

print(f"Converted {fbx_path} -> {glb_path}")
