"""
Satyr GLB conversion — minimalist version that mirrors RunKittyRun's working
convert_fbx.py as closely as possible, only adding the one essential thing:
push every wanted action to its own NLA track so the exporter sees them.

Everything else is left at Blender defaults — same as what worked for the wolf:
  - automatic_bone_orientation=True
  - pose_position=POSE (default)
  - no frame_set, no extrapolation tweaks, no modifier disabling

If the wolf works with this minimal setup, the satyr should too as long as
the actions are visible to the exporter.

Usage: blender --background --python convert_satyr_v2.py -- <input.fbx> <output.glb>
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
WANTED_PREFIX = "Armature|"

bpy.ops.wm.read_factory_settings(use_empty=True)
# Mirror RunKittyRun's convert_fbx.py exactly.
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)

armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
print(f"Found {len(armatures)} armature(s); {len(bpy.data.actions)} action(s) in file.")

def wanted(action_name):
    if not action_name.startswith(WANTED_PREFIX):
        return False
    parts = action_name.split("|")
    return len(parts) >= 2 and parts[1] in WANTED_ANIMS

kept_actions = [a for a in bpy.data.actions if wanted(a.name)]
print(f"Keeping {len(kept_actions)} actions:")
for a in kept_actions:
    print(f"  {a.name} (frames {int(a.frame_range[0])}-{int(a.frame_range[1])})")

# Shift every kept action's keyframes so they start at frame 1. The satyr FBX
# stores all takes on one shared timeline at offsets like 4391-4451 — if we
# leave them there, NLA strips placed at those frames extrapolate first-frame
# values backwards, polluting frame 1's pose. Shifting f-curves to start at
# frame 1 means each action's data lives in a clean 1..length range, and we
# can place all strips at frame 1 without overlap (each on its own track).
for action in kept_actions:
    offset = 1 - int(action.frame_range[0])
    if offset == 0:
        continue
    for fcurve in action.fcurves:
        for kp in fcurve.keyframe_points:
            kp.co.x += offset
            kp.handle_left.x += offset
            kp.handle_right.x += offset
        fcurve.update()

# Push to NLA — one track per action, all strips at frame 1.
for arm in armatures:
    if arm.animation_data is None:
        arm.animation_data_create()
    ad = arm.animation_data
    ad.action = None
    for action in kept_actions:
        track = ad.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 1, action)

# Export with all defaults — same as convert_fbx.py.
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
)
print(f"Converted {fbx_path} -> {glb_path}")
