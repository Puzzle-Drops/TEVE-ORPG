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
        track.strips.new(action.name, int(action.frame_range[0]), action)
        track.mute = False
    # Force armature evaluation in REST pose during export. Without this,
    # whichever NLA strip the playhead lands on becomes the bind pose used
    # for the skinned-mesh's inverseBindMatrices in the GLB — and the mesh
    # ends up bound to a walk/idle frame instead of T-pose.
    arm.data.pose_position = 'REST'

bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_skins=True,
)

print(f"Converted {fbx_path} -> {glb_path}")
