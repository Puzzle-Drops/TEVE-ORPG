"""
Blender CLI script to list all animations in a GLB file.
Usage: blender --background --python inspect_glb.py -- <input.glb>
"""
import bpy
import sys

argv = sys.argv
argv = argv[argv.index("--") + 1:]
glb_path = argv[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb_path)

print("\n========== ANIMATIONS ==========")
for action in bpy.data.actions:
    print(f"  {action.name}  (frames: {action.frame_range[0]:.0f} - {action.frame_range[1]:.0f})")
print(f"Total: {len(bpy.data.actions)}")
print("================================")
