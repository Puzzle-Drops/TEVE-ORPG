"""
fbx_to_glb.py — FBX/GLB inspector, converter, and merger.

Single file, four modes:
  1. GUI                : python fbx_to_glb.py
  2. Inspect            : python fbx_to_glb.py --input file.fbx --inspect
  3. Single-file convert: python fbx_to_glb.py --input file.fbx --output file.glb
  4. Merge              : python fbx_to_glb.py --model body.fbx --animations anims.fbx --output out.glb

Merge mode is the workhorse for the workflow:
    Unity (model-only export with weapon attached, recolored, resized)
    + the original bundle FBX (which has clean animations)
    = one GLB with everything.

Requires Blender 4.x installed. The script auto-detects blender.exe in Program Files.
"""

import sys
import os
import json
import argparse
import subprocess
import threading
import tempfile
import glob
from pathlib import Path

try:
    import bpy
    INSIDE_BLENDER = True
except ImportError:
    INSIDE_BLENDER = False

DEFAULT_WANTED_ANIMS = [
    "Idle_1H_WepR", "Walk_1H_WepR", "Attack_1H_WepR", "Death_1H_WepR",
    "Idle_2H",      "Walk_2H",      "Attack_2H",      "Death_2H",
]


# ===========================================================================
# Blender-side
# ===========================================================================
if INSIDE_BLENDER:

    def _read_config():
        argv = sys.argv
        if "--" not in argv:
            raise RuntimeError("Missing '--' separator before JSON config.")
        return json.loads(argv[argv.index("--") + 1])

    def _write_result(cfg, d):
        result_path = cfg.get("result_path")
        if result_path:
            with open(result_path, "w", encoding="utf-8") as f:
                json.dump(d, f, indent=2)
        print(f"[fbx_to_glb] result written: ok={d.get('ok')}")

    def _short_name(action_name):
        if "|" not in action_name:
            return action_name
        for p in action_name.split("|")[1:]:
            if p and p not in ("BaseLayer", "BaseLayer_Armature"):
                return p
        return action_name

    def _gather_actions():
        """Every action reachable in the file — bpy.data.actions OR via NLA strips."""
        seen = set(bpy.data.actions)
        for obj in bpy.data.objects:
            ad = obj.animation_data
            if not ad:
                continue
            if ad.action:
                seen.add(ad.action)
            for tr in ad.nla_tracks:
                for st in tr.strips:
                    if st.action:
                        seen.add(st.action)
        return sorted(seen, key=lambda a: a.name)

    def _is_wanted(action_name, wanted_set):
        if not wanted_set:
            return True
        if "|" in action_name:
            for part in action_name.split("|"):
                if part in wanted_set:
                    return True
        return action_name in wanted_set

    def _iter_fcurves(action):
        """Yield every FCurve in an action, working across Blender versions.

        Blender 4.4+ introduced "slotted actions" where f-curves live inside
        ActionLayer > ActionStrip > Channelbag instead of being directly on
        the action. Pre-4.4 actions still expose `action.fcurves`. In Blender
        5.x the legacy attribute disappears for slotted actions, raising
        AttributeError. This helper handles both.
        """
        # Pre-4.4 / single-slot legacy actions still expose fcurves directly.
        fc_attr = getattr(action, "fcurves", None)
        if fc_attr is not None:
            for fc in fc_attr:
                yield fc
            return

        # 4.4+ slotted actions: walk layers > strips > channelbags.
        layers = getattr(action, "layers", None)
        if not layers:
            return
        slots = list(getattr(action, "slots", []) or [])
        for layer in layers:
            strips = getattr(layer, "strips", None) or []
            for strip in strips:
                # Newer API: strip.channelbags is iterable.
                cbs = getattr(strip, "channelbags", None)
                if cbs is not None:
                    for cb in cbs:
                        for fc in getattr(cb, "fcurves", []) or []:
                            yield fc
                    continue
                # Alternative API: strip.channelbag(slot) lookup.
                cb_lookup = getattr(strip, "channelbag", None)
                if callable(cb_lookup):
                    for slot in slots:
                        cb = cb_lookup(slot)
                        if cb is None:
                            continue
                        for fc in getattr(cb, "fcurves", []) or []:
                            yield fc

    def _action_summary(a):
        # Total keyframe count across all f-curves. Lets us spot the
        # "only 2 keyframes" smoking gun without leaving Blender.
        fcurves = list(_iter_fcurves(a))
        kf = sum(len(fc.keyframe_points) for fc in fcurves)
        return {
            "name": a.name,
            "short": _short_name(a.name),
            "frame_start": int(a.frame_range[0]),
            "frame_end":   int(a.frame_range[1]),
            "length":      int(a.frame_range[1] - a.frame_range[0]),
            "fcurves":     len(fcurves),
            "keyframes":   kf,
        }

    # ----- Mode: inspect FBX -----
    def cmd_inspect_fbx(cfg):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(
            filepath=cfg["input"],
            automatic_bone_orientation=cfg.get("orient_auto", False),
            use_anim=True,
            ignore_leaf_bones=True,  # safety net for Unity-exported FBXs
        )
        actions = _gather_actions()
        _write_result(cfg, {
            "ok": True,
            "kind": "fbx",
            "armatures": [o.name for o in bpy.data.objects if o.type == 'ARMATURE'],
            "mesh_count": sum(1 for o in bpy.data.objects if o.type == 'MESH'),
            "actions": [_action_summary(a) for a in actions],
        })

    # ----- Mode: inspect GLB -----
    def cmd_inspect_glb(cfg):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=cfg["input"])
        actions = sorted(bpy.data.actions, key=lambda a: a.name)
        _write_result(cfg, {
            "ok": True,
            "kind": "glb",
            "armatures": [o.name for o in bpy.data.objects if o.type == 'ARMATURE'],
            "mesh_count": sum(1 for o in bpy.data.objects if o.type == 'MESH'),
            "actions": [_action_summary(a) for a in actions],
        })

    # ----- Mode: convert single FBX -> GLB -----
    def cmd_convert(cfg):
        wanted_set        = set(cfg.get("wanted_anims") or [])
        keep_all          = cfg.get("keep_all_anims", False)
        drop_weapon_anims = cfg.get("drop_weapon_anims", True)
        disable_arm_mod   = cfg.get("disable_armature_mod", True)

        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(
            filepath=cfg["input"],
            automatic_bone_orientation=cfg.get("orient_auto", False),
            use_anim=True,
        )

        all_actions = _gather_actions()
        # Filter strategy: REMOVE unwanted actions from bpy.data.actions. The
        # gltf exporter in ACTIONS mode walks bpy.data.actions, so anything
        # we remove is silently excluded. No f-curve manipulation, no NLA
        # manipulation — kept actions retain their full keyframe data.
        if not keep_all:
            for a in list(bpy.data.actions):
                short = _short_name(a.name)
                if not _is_wanted(a.name, wanted_set):
                    bpy.data.actions.remove(a, do_unlink=True)
                elif drop_weapon_anims and a.name.startswith(("Weapon_L|", "Weapon_R|")):
                    bpy.data.actions.remove(a, do_unlink=True)

        if disable_arm_mod:
            for obj in bpy.data.objects:
                if obj.type != 'MESH':
                    continue
                for mod in obj.modifiers:
                    if mod.type == 'ARMATURE':
                        mod.show_viewport = False
                        mod.show_render = False

        # Pin remaining actions so nothing GCs them on export.
        for a in bpy.data.actions:
            a.use_fake_user = True

        bpy.ops.export_scene.gltf(
            filepath=cfg["output"],
            export_format='GLB',
            export_animations=True,
            export_animation_mode='ACTIONS',
            export_skins=True,
            export_force_sampling=True,
            export_optimize_animation_size=False,
        )

        final_actions = sorted(bpy.data.actions, key=lambda a: a.name)
        armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
        skipped = [a for a in all_actions if a.name not in {x.name for x in final_actions}]
        _write_result(cfg, {
            "ok": True,
            "kind": "convert",
            "output": cfg["output"],
            "armatures": [a.name for a in armatures],
            "actions_total": len(all_actions),
            "actions_exported": len(final_actions),
            "actions_skipped":  len(skipped),
            "exported_actions": [_action_summary(a) for a in final_actions],
            "skipped_actions":  [_action_summary(a) for a in skipped],
        })

    # ----- Mode: MERGE model + animations -----
    def cmd_merge(cfg):
        wanted_set        = set(cfg.get("wanted_anims") or [])
        keep_all          = cfg.get("keep_all_anims", False)
        drop_weapon_anims = cfg.get("drop_weapon_anims", True)
        disable_arm_mod   = cfg.get("disable_armature_mod", True)
        orient_auto_anims = cfg.get("orient_auto", False)
        # Use orient=True for the model-side import as a safety net for
        # Unity-exported FBXs that hit the Blender 4.1 KeyError bug. If your
        # model imports broken, set this False via --no-model-orient-auto.
        orient_auto_model = cfg.get("model_orient_auto", True)

        model_path = cfg["model"]
        model_is_glb = model_path.lower().endswith((".glb", ".gltf"))

        # ===== Step 1: import animations FBX (source of actions) =====
        bpy.ops.wm.read_factory_settings(use_empty=True)
        print(f"[merge] importing animations from: {cfg['animations']}")
        bpy.ops.import_scene.fbx(
            filepath=cfg["animations"],
            automatic_bone_orientation=orient_auto_anims,
            use_anim=True,
        )

        # Capture the source rig's bone names BEFORE we delete anything,
        # so we can validate the model rig has compatible bones later.
        source_armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
        source_bone_names = set()
        for arm in source_armatures:
            for b in arm.data.bones:
                source_bone_names.add(b.name)

        all_source_actions = _gather_actions()
        print(f"[merge] source animations imported: "
              f"{len(source_armatures)} armature(s), {len(all_source_actions)} action(s), "
              f"{len(source_bone_names)} bones")

        # ===== Step 2: filter actions BEFORE deleting things =====
        # (so any stale bpy.data.actions cleanup doesn't fight us later)
        if not keep_all:
            for a in list(bpy.data.actions):
                if not _is_wanted(a.name, wanted_set):
                    bpy.data.actions.remove(a, do_unlink=True)
                elif drop_weapon_anims and a.name.startswith(("Weapon_L|", "Weapon_R|")):
                    bpy.data.actions.remove(a, do_unlink=True)

        kept_actions = list(bpy.data.actions)
        for a in kept_actions:
            a.use_fake_user = True  # survive armature deletion
        kept_action_names = {a.name for a in kept_actions}
        print(f"[merge] kept {len(kept_actions)} action(s) after filter")

        # ===== Step 3: delete source rig+mesh, keep actions =====
        # Actions are stored in bpy.data.actions independently of objects.
        # Deleting the source armature does NOT delete its actions, as long
        # as use_fake_user=True (set above).
        bpy.ops.object.select_all(action='DESELECT')
        for o in list(bpy.data.objects):
            o.select_set(True)
        bpy.ops.object.delete()
        print(f"[merge] deleted source mesh + armature, "
              f"actions still in bpy.data.actions: {len(bpy.data.actions)}")

        # ===== Step 4: import the model file (FBX or GLB) =====
        # GLB path is the workaround for the Blender 4.1 FBX importer bug on
        # Unity-exported FBXs (KeyError on mesh.armature_setup). User runs the
        # Unity FBX through convert3d.org once, gets a GLB, and feeds that here.
        print(f"[merge] importing model from: {model_path}")
        if model_is_glb:
            print(f"[merge] (using GLB importer — bypasses the Blender 4.1 FBX bug)")
            bpy.ops.import_scene.gltf(filepath=model_path)
            # GLB import may add stray actions (T_Pose, etc) — wipe anything
            # that wasn't already present from the animations FBX.
            stray = [a for a in bpy.data.actions if a.name not in kept_action_names]
            for a in stray:
                bpy.data.actions.remove(a, do_unlink=True)
            if stray:
                print(f"[merge] removed {len(stray)} stray action(s) from GLB import")
        else:
            bpy.ops.import_scene.fbx(
                filepath=model_path,
                automatic_bone_orientation=orient_auto_model,
                use_anim=False,         # we already have the anims from step 1
                ignore_leaf_bones=True, # extra safety against the KeyError bug
            )

        new_armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
        if not new_armatures:
            raise RuntimeError("Model FBX has no armature.")
        new_armature = new_armatures[0]
        new_bone_names = set(b.name for b in new_armature.data.bones)
        print(f"[merge] model armature: {new_armature.name}  "
              f"({len(new_bone_names)} bones)")

        # ===== Step 5: bone-compatibility check =====
        # Actions reference bones by name like pose.bones["Hand_R"]...
        # We need every bone the actions reference to exist on the new rig.
        bones_used_by_actions = set()
        for a in kept_actions:
            for fc in _iter_fcurves(a):
                # data_path looks like 'pose.bones["BoneName"].rotation_quaternion'
                dp = fc.data_path
                if dp.startswith('pose.bones["'):
                    end = dp.find('"', 12)
                    if end > 12:
                        bones_used_by_actions.add(dp[12:end])
        missing_bones = bones_used_by_actions - new_bone_names
        unused_new_bones = new_bone_names - bones_used_by_actions

        # ===== Step 6: assign one action to the new armature so the
        # exporter knows the armature has animation data =====
        if new_armature.animation_data is None:
            new_armature.animation_data_create()
        if kept_actions:
            new_armature.animation_data.action = kept_actions[0]

        if disable_arm_mod:
            for obj in bpy.data.objects:
                if obj.type != 'MESH':
                    continue
                for mod in obj.modifiers:
                    if mod.type == 'ARMATURE':
                        mod.show_viewport = False
                        mod.show_render = False

        # ===== Step 7: export =====
        # ACTIONS mode: each action in bpy.data.actions becomes a glTF clip,
        # automatically associated with the (sole) armature.
        bpy.ops.export_scene.gltf(
            filepath=cfg["output"],
            export_format='GLB',
            export_animations=True,
            export_animation_mode='ACTIONS',
            export_skins=True,
            export_force_sampling=True,
            export_optimize_animation_size=False,
        )

        final_actions = sorted(bpy.data.actions, key=lambda a: a.name)
        _write_result(cfg, {
            "ok": True,
            "kind": "merge",
            "output": cfg["output"],
            "model_armature": new_armature.name,
            "model_bones":    len(new_bone_names),
            "source_bones":   len(source_bone_names),
            "actions_kept":   len(final_actions),
            "exported_actions": [_action_summary(a) for a in final_actions],
            "missing_bones":  sorted(missing_bones),
            "unused_new_bones": sorted(unused_new_bones),
        })

    def main_blender():
        cfg = None
        try:
            cfg = _read_config()
            mode = cfg.get("mode")
            if   mode == "inspect_fbx": cmd_inspect_fbx(cfg)
            elif mode == "inspect_glb": cmd_inspect_glb(cfg)
            elif mode == "convert":     cmd_convert(cfg)
            elif mode == "merge":       cmd_merge(cfg)
            else:
                _write_result(cfg, {"ok": False, "error": f"unknown mode: {mode}"})
        except Exception as e:
            import traceback
            err_payload = {
                "ok": False,
                "error": str(e),
                "trace": traceback.format_exc(),
            }
            try:
                if cfg is not None:
                    _write_result(cfg, err_payload)
                else:
                    print(f"[fbx_to_glb] FATAL (no config to write to): {e}")
            except Exception:
                pass

    main_blender()
    sys.exit(0)


# ===========================================================================
# Launcher-side
# ===========================================================================

_NOISY_PREFIXES = ("WARN (bpy.rna):",)
def _is_noisy(line):
    return any(line.startswith(p) for p in _NOISY_PREFIXES)


def find_blender_executable():
    candidates = []
    pf   = os.environ.get("ProgramFiles",      r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    candidates += glob.glob(rf"{pf}\Blender Foundation\Blender *\blender.exe")
    candidates += glob.glob(rf"{pf86}\Blender Foundation\Blender *\blender.exe")
    from shutil import which
    on_path = which("blender")
    if on_path:
        candidates.append(on_path)
    return sorted(set(candidates), reverse=True)[0] if candidates else None


def run_blender(blender_path, mode, on_log=None, **cfg_extra):
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", prefix="fbx2glb_", delete=False, encoding="utf-8")
    tmp.close()
    result_path = tmp.name

    cfg = {"mode": mode, "result_path": result_path, **cfg_extra}
    cmd = [
        blender_path,
        "--background",
        "--python", os.path.abspath(__file__),
        "--",
        json.dumps(cfg),
    ]

    log_lines = []
    suppressed = 0
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        for line in proc.stdout:
            line = line.rstrip("\r\n")
            log_lines.append(line)
            if _is_noisy(line):
                suppressed += 1
                if on_log and suppressed % 50 == 1:
                    try: on_log(f"  ...({suppressed} bpy.rna warnings — harmless, suppressed)")
                    except Exception: pass
                continue
            if on_log:
                try: on_log(line)
                except Exception: pass
        proc.wait()

        result = None
        try:
            if os.path.getsize(result_path) > 0:
                with open(result_path, "r", encoding="utf-8") as f:
                    result = json.load(f)
        except Exception as e:
            result = {"ok": False, "error": f"couldn't read result file: {e}"}
        if result is None:
            result = {
                "ok": False,
                "error": "Blender exited without writing a result file. Check log above.",
            }
    finally:
        try: os.unlink(result_path)
        except OSError: pass

    return result, "\n".join(log_lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cli_main():
    p = argparse.ArgumentParser(
        description="FBX/GLB inspector, converter, and merger.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
Examples:
  Inspect a file (auto-detects .fbx vs .glb):
    %(prog)s --input Satyr_Full.fbx --inspect

  Single-file convert (FBX -> GLB):
    %(prog)s --input Satyr_Full.fbx --output Satyr.glb

  MERGE: model from one file + animations from another:
    %(prog)s --model Satyr1.fbx --animations Satyr_Full.fbx --output Satyr1.glb

  Merge keeping ALL animations (useful if your loader uses non-default clip names):
    %(prog)s --model Satyr1.fbx --animations Satyr_Full.fbx --output Satyr1.glb --keep-all
""",
    )
    p.add_argument("--input",      help="Input file. Use with --inspect or --output for single-file mode.")
    p.add_argument("--model",      help="MERGE: FBX with the model/mesh you want (Unity export).")
    p.add_argument("--animations", help="MERGE: FBX with the animation clips you want.")
    p.add_argument("--output",     help="Output .glb path.")
    p.add_argument("--blender",    help="Path to blender.exe. Default: autodetected.")
    p.add_argument("--inspect", action="store_true",
                   help="List animations from --input. Auto-detects .fbx vs .glb.")
    p.add_argument("--keep-all", action="store_true",
                   help="Export every animation in the file.")
    p.add_argument("--wanted", default=",".join(DEFAULT_WANTED_ANIMS),
                   help="Comma-separated wanted clip names. Match is exact on the short name.")
    p.add_argument("--keep-weapon-anims", action="store_true",
                   help="Keep Weapon_L|... / Weapon_R|... clips. Default drops them as duplicates.")
    p.add_argument("--orient-auto", action="store_true",
                   help="automatic_bone_orientation=True for the (single) input or the animations FBX.")
    p.add_argument("--no-model-orient-auto", action="store_true",
                   help="Use orient=False for the merge --model FBX. Default is True (works around "
                        "the Blender 4.1 KeyError bug on Unity-exported FBXs).")
    p.add_argument("--no-disable-modifier", action="store_true",
                   help="Don't disable the armature modifier during export.")
    args = p.parse_args()

    # ----- routing -----
    has_merge = bool(args.model and args.animations)
    has_single = bool(args.input)

    if not has_merge and not has_single:
        return launch_gui()  # no input args → GUI

    blender = args.blender or find_blender_executable()
    if not blender:
        sys.exit("ERROR: Could not find blender.exe. Pass --blender PATH.")

    common = {
        "wanted_anims": [w.strip() for w in args.wanted.split(",") if w.strip()],
        "keep_all_anims": args.keep_all,
        "drop_weapon_anims": not args.keep_weapon_anims,
        "orient_auto": args.orient_auto,
        "model_orient_auto": not args.no_model_orient_auto,
        "disable_armature_mod": not args.no_disable_modifier,
    }

    # ----- merge -----
    if has_merge:
        if not args.output:
            sys.exit("ERROR: --output is required for merge.")
        for label, path in (("--model", args.model), ("--animations", args.animations)):
            if not os.path.exists(path):
                sys.exit(f"ERROR: {label} not found: {path}")

        print(f"Model:      {os.path.abspath(args.model)}")
        print(f"Animations: {os.path.abspath(args.animations)}")
        print(f"Output:     {os.path.abspath(args.output)}")
        print(f"Anims:      {'<keep all>' if args.keep_all else common['wanted_anims']}\n")

        result, _ = run_blender(
            blender, "merge",
            on_log=lambda l: print(l),
            model=os.path.abspath(args.model),
            animations=os.path.abspath(args.animations),
            output=os.path.abspath(args.output),
            **common,
        )
        print()
        _print_result(result)
        if not result.get("ok"):
            sys.exit(1)
        return

    # ----- single-file inspect -----
    abs_input = os.path.abspath(args.input)
    if not os.path.exists(abs_input):
        sys.exit(f"ERROR: --input not found: {abs_input}")

    if args.inspect:
        is_glb = abs_input.lower().endswith(".glb")
        mode = "inspect_glb" if is_glb else "inspect_fbx"
        print(f"Inspecting {abs_input} ...")
        result, _ = run_blender(blender, mode, on_log=lambda l: None,
                                input=abs_input, orient_auto=args.orient_auto)
        _print_result(result)
        return

    # ----- single-file convert -----
    if not args.output:
        sys.exit("ERROR: --output is required for convert.")
    abs_output = os.path.abspath(args.output)
    print(f"Input:    {abs_input}")
    print(f"Output:   {abs_output}\n")
    result, _ = run_blender(
        blender, "convert",
        on_log=lambda l: print(l),
        input=abs_input,
        output=abs_output,
        **common,
    )
    print()
    _print_result(result)
    if not result.get("ok"):
        sys.exit(1)


def _print_result(r):
    if not r.get("ok"):
        print("FAILED:", r.get("error", "<no error>"))
        if "trace" in r:
            print(r["trace"])
        return

    if r.get("kind") in ("fbx", "glb"):
        print(f"Armatures: {r['armatures']}")
        print(f"Meshes:    {r['mesh_count']}")
        print(f"Actions:   {len(r['actions'])}")
        for a in r["actions"]:
            warn = "  ⚠️ LOW KF" if a["keyframes"] <= 2 else ""
            print(f"  {a['short']:<24}  frames {a['frame_start']:>5}-{a['frame_end']:<5}  "
                  f"keyframes={a['keyframes']:<5}  [{a['name']}]{warn}")
        return

    if r.get("kind") == "convert":
        print(f"DONE: {r['output']}")
        print(f"  Total actions in FBX:   {r['actions_total']}")
        print(f"  Actions exported:       {r['actions_exported']}")
        for a in r["exported_actions"]:
            warn = "  ⚠️ LOW KF" if a["keyframes"] <= 2 else ""
            print(f"    {a['short']:<24}  kf={a['keyframes']:<5}  "
                  f"frames {a['frame_start']}-{a['frame_end']}  [{a['name']}]{warn}")
        return

    if r.get("kind") == "merge":
        print(f"DONE: {r['output']}")
        print(f"  Model armature:    {r['model_armature']}")
        print(f"  Model bones:       {r['model_bones']}")
        print(f"  Source bones:      {r['source_bones']}")
        print(f"  Actions exported:  {r['actions_kept']}")
        for a in r["exported_actions"]:
            warn = "  ⚠️ LOW KF" if a["keyframes"] <= 2 else ""
            print(f"    {a['short']:<24}  kf={a['keyframes']:<5}  "
                  f"frames {a['frame_start']}-{a['frame_end']}{warn}")
        if r.get("missing_bones"):
            print(f"\n  ⚠️ {len(r['missing_bones'])} bone(s) referenced by animations are NOT")
            print(f"     in the model armature. These joints won't animate:")
            for b in r["missing_bones"][:20]:
                print(f"       - {b}")
            if len(r["missing_bones"]) > 20:
                print(f"       ...and {len(r['missing_bones'])-20} more")
        if r.get("unused_new_bones"):
            print(f"  Note: {len(r['unused_new_bones'])} bone(s) on the model armature aren't")
            print(f"        animated by any clip (probably weapon mounts / extras — usually fine).")


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

def launch_gui():
    import tkinter as tk
    from tkinter import ttk, filedialog, scrolledtext, messagebox

    blender_default = find_blender_executable() or ""
    root = tk.Tk()
    root.title("FBX / GLB Tool")
    root.geometry("960x820")

    state = {
        "input":         tk.StringVar(value=""),
        "model":         tk.StringVar(value=""),
        "animations":    tk.StringVar(value=""),
        "output":        tk.StringVar(value=""),
        "blender":       tk.StringVar(value=blender_default),
        "wanted":        tk.StringVar(value=", ".join(DEFAULT_WANTED_ANIMS)),
        "keep_all":      tk.BooleanVar(value=False),
        "drop_weapon":   tk.BooleanVar(value=True),
        "orient_auto":   tk.BooleanVar(value=False),
        "model_orient":  tk.BooleanVar(value=True),
        "disable_mod":   tk.BooleanVar(value=True),
    }
    pad = {"padx": 6, "pady": 4}

    nb = ttk.Notebook(root)
    nb.pack(fill="both", expand=True, padx=10, pady=8)
    tab_single = ttk.Frame(nb)
    tab_merge  = ttk.Frame(nb)
    nb.add(tab_single, text="  Inspect / Convert  ")
    nb.add(tab_merge,  text="  Merge (model + animations)  ")

    # ===== shared file pickers =====
    def _pick_fbx_or_glb(var, default_glb=None):
        path = filedialog.askopenfilename(
            title="Select FBX or GLB file",
            filetypes=[("FBX/GLB", "*.fbx *.glb"), ("FBX", "*.fbx"), ("GLB", "*.glb"), ("All", "*.*")],
        )
        if path:
            var.set(path)
            if default_glb is not None and not state["output"].get() and path.lower().endswith(".fbx"):
                state["output"].set(str(Path(path).with_suffix(".glb")))

    def _pick_save_glb(var):
        path = filedialog.asksaveasfilename(
            title="Save GLB as", defaultextension=".glb",
            filetypes=[("GLB files", "*.glb")])
        if path: var.set(path)

    def _pick_blender():
        path = filedialog.askopenfilename(
            title="Select blender.exe",
            filetypes=[("blender.exe", "blender.exe"), ("All", "*.*")])
        if path: state["blender"].set(path)

    # ===== Single-file tab =====
    frm_files1 = ttk.LabelFrame(tab_single, text="File")
    frm_files1.pack(fill="x", padx=6, pady=6)
    ttk.Label(frm_files1, text="Input:").grid(row=0, column=0, sticky="w", **pad)
    ttk.Entry(frm_files1, textvariable=state["input"]).grid(row=0, column=1, sticky="ew", **pad)
    ttk.Button(frm_files1, text="Browse...",
               command=lambda: _pick_fbx_or_glb(state["input"], default_glb=True)).grid(row=0, column=2, **pad)
    ttk.Label(frm_files1, text="Output GLB:").grid(row=1, column=0, sticky="w", **pad)
    ttk.Entry(frm_files1, textvariable=state["output"]).grid(row=1, column=1, sticky="ew", **pad)
    ttk.Button(frm_files1, text="Browse...",
               command=lambda: _pick_save_glb(state["output"])).grid(row=1, column=2, **pad)
    frm_files1.columnconfigure(1, weight=1)

    # ===== Merge tab =====
    frm_filesM = ttk.LabelFrame(tab_merge, text="Files")
    frm_filesM.pack(fill="x", padx=6, pady=6)
    ttk.Label(frm_filesM, text="Model FBX:").grid(row=0, column=0, sticky="w", **pad)
    ttk.Entry(frm_filesM, textvariable=state["model"]).grid(row=0, column=1, sticky="ew", **pad)
    ttk.Button(frm_filesM, text="Browse...",
               command=lambda: _pick_fbx_or_glb(state["model"])).grid(row=0, column=2, **pad)
    ttk.Label(frm_filesM, text="Animations FBX:").grid(row=1, column=0, sticky="w", **pad)
    ttk.Entry(frm_filesM, textvariable=state["animations"]).grid(row=1, column=1, sticky="ew", **pad)
    ttk.Button(frm_filesM, text="Browse...",
               command=lambda: _pick_fbx_or_glb(state["animations"])).grid(row=1, column=2, **pad)
    ttk.Label(frm_filesM, text="Output GLB:").grid(row=2, column=0, sticky="w", **pad)
    ttk.Entry(frm_filesM, textvariable=state["output"]).grid(row=2, column=1, sticky="ew", **pad)
    ttk.Button(frm_filesM, text="Browse...",
               command=lambda: _pick_save_glb(state["output"])).grid(row=2, column=2, **pad)
    frm_filesM.columnconfigure(1, weight=1)
    ttk.Label(tab_merge,
        text=("Use the model FBX for mesh, textures, weapon attachments, and overall scale (Unity export).\n"
              "Use the animations FBX as the clean source of animation clips (the original bundle FBX).\n"
              "Bone names must match between the two — they will if both come from the same source rig."),
        foreground="gray", justify="left").pack(fill="x", padx=10, pady=(0, 8))

    # ===== shared blender + filter sections =====
    frm_blender = ttk.LabelFrame(root, text="Blender")
    frm_blender.pack(fill="x", padx=10, pady=6)
    ttk.Label(frm_blender, text="blender.exe:").grid(row=0, column=0, sticky="w", **pad)
    ttk.Entry(frm_blender, textvariable=state["blender"]).grid(row=0, column=1, sticky="ew", **pad)
    ttk.Button(frm_blender, text="Browse...", command=_pick_blender).grid(row=0, column=2, **pad)
    frm_blender.columnconfigure(1, weight=1)

    frm_anims = ttk.LabelFrame(root, text="Animation filter (used by Convert and Merge)")
    frm_anims.pack(fill="x", padx=10, pady=6)
    ttk.Checkbutton(frm_anims, text="Keep ALL animations (no filter)",
                    variable=state["keep_all"]).grid(row=0, column=0, columnspan=2, sticky="w", **pad)
    ttk.Checkbutton(frm_anims, text="Drop Weapon_L|... and Weapon_R|... duplicates (recommended)",
                    variable=state["drop_weapon"]).grid(row=1, column=0, columnspan=2, sticky="w", **pad)
    ttk.Label(frm_anims, text="Wanted (comma-separated short names):").grid(row=2, column=0, sticky="w", **pad)
    ttk.Entry(frm_anims, textvariable=state["wanted"]).grid(row=2, column=1, sticky="ew", **pad)
    frm_anims.columnconfigure(1, weight=1)

    frm_adv = ttk.LabelFrame(root, text="Advanced")
    frm_adv.pack(fill="x", padx=10, pady=6)
    ttk.Checkbutton(frm_adv,
        text="automatic_bone_orientation = True for animations / single FBX",
        variable=state["orient_auto"]).grid(row=0, column=0, sticky="w", **pad)
    ttk.Checkbutton(frm_adv,
        text="automatic_bone_orientation = True for the merge MODEL FBX  (recommended for Unity exports)",
        variable=state["model_orient"]).grid(row=1, column=0, sticky="w", **pad)
    ttk.Checkbutton(frm_adv,
        text="Disable armature modifier during export (clean bind pose)",
        variable=state["disable_mod"]).grid(row=2, column=0, sticky="w", **pad)

    # ===== buttons + log =====
    frm_act = ttk.Frame(root); frm_act.pack(fill="x", padx=10, pady=4)

    log = scrolledtext.ScrolledText(root, height=18, font=("Consolas", 9))
    log.pack(fill="both", expand=True, padx=10, pady=8)
    log.tag_configure("ok",   foreground="#0a0")
    log.tag_configure("err",  foreground="#c00")
    log.tag_configure("info", foreground="#06c")
    log.tag_configure("dim",  foreground="#888")
    log.tag_configure("warn", foreground="#a60")

    def log_write(text, tag=None):
        log.insert("end", text + "\n", tag); log.see("end")
    def stream_log(line):
        root.after(0, lambda: log_write(line, "dim"))

    busy = {"v": False}
    def set_busy(b):
        busy["v"] = b
        for btn in (btn_inspect, btn_convert, btn_merge):
            btn.config(state=("disabled" if b else "normal"))

    def _common_cfg():
        return dict(
            wanted_anims=[w.strip() for w in state["wanted"].get().split(",") if w.strip()],
            keep_all_anims=state["keep_all"].get(),
            drop_weapon_anims=state["drop_weapon"].get(),
            orient_auto=state["orient_auto"].get(),
            model_orient_auto=state["model_orient"].get(),
            disable_armature_mod=state["disable_mod"].get(),
        )

    def _need(value, name):
        if not value:
            messagebox.showerror("Missing", f"Pick {name}.")
            return False
        return True

    def _need_blender():
        b = state["blender"].get()
        if not b or not os.path.exists(b):
            messagebox.showerror("Missing", f"blender.exe not found at:\n{b}")
            return False
        return True

    def do_inspect():
        path = state["input"].get()
        if not _need(path, "an input file") or not _need_blender(): return
        is_glb = path.lower().endswith(".glb")
        mode = "inspect_glb" if is_glb else "inspect_fbx"
        log.delete("1.0", "end")
        log_write(f"Inspecting {'GLB' if is_glb else 'FBX'}: {path}", "info")
        log_write("(Blender startup + import can take 30+ seconds for large files...)\n", "dim")
        set_busy(True)
        def work():
            try:
                result, _ = run_blender(
                    state["blender"].get(), mode, on_log=stream_log,
                    input=path, orient_auto=state["orient_auto"].get())
                root.after(0, lambda: gui_show_result(result))
            finally:
                root.after(0, lambda: set_busy(False))
        threading.Thread(target=work, daemon=True).start()

    def do_convert():
        if not _need(state["input"].get(), "an input file"): return
        if not _need(state["output"].get(), "an output GLB path"): return
        if not _need_blender(): return
        log.delete("1.0", "end")
        log_write(f"Converting: {state['input'].get()}", "info")
        log_write(f"  -> {state['output'].get()}\n", "info")
        set_busy(True)
        def work():
            try:
                result, _ = run_blender(
                    state["blender"].get(), "convert", on_log=stream_log,
                    input=state["input"].get(), output=state["output"].get(),
                    **_common_cfg())
                root.after(0, lambda: gui_show_result(result))
            finally:
                root.after(0, lambda: set_busy(False))
        threading.Thread(target=work, daemon=True).start()

    def do_merge():
        if not _need(state["model"].get(),      "the model FBX"):      return
        if not _need(state["animations"].get(), "the animations FBX"): return
        if not _need(state["output"].get(),     "an output GLB path"): return
        if not _need_blender(): return
        log.delete("1.0", "end")
        log_write(f"Merging:", "info")
        log_write(f"  model:      {state['model'].get()}", "info")
        log_write(f"  animations: {state['animations'].get()}", "info")
        log_write(f"  -> output:  {state['output'].get()}\n", "info")
        set_busy(True)
        def work():
            try:
                result, _ = run_blender(
                    state["blender"].get(), "merge", on_log=stream_log,
                    model=state["model"].get(),
                    animations=state["animations"].get(),
                    output=state["output"].get(),
                    **_common_cfg())
                root.after(0, lambda: gui_show_result(result))
            finally:
                root.after(0, lambda: set_busy(False))
        threading.Thread(target=work, daemon=True).start()

    def gui_show_result(r):
        log_write("")
        if not r.get("ok"):
            log_write("FAILED: " + r.get("error", "<no error>"), "err")
            if "trace" in r:
                log_write(r["trace"], "err")
            return

        if r.get("kind") in ("fbx", "glb"):
            log_write(f"Armatures: {r['armatures']}", "ok")
            log_write(f"Meshes:    {r['mesh_count']}")
            log_write(f"Actions:   {len(r['actions'])}", "ok")
            for a in r["actions"]:
                tag = "warn" if a["keyframes"] <= 2 else None
                log_write(f"  {a['short']:<24}  frames {a['frame_start']:>5}-{a['frame_end']:<5}  "
                          f"keyframes={a['keyframes']:<6}  [{a['name']}]", tag)
            return

        if r.get("kind") == "convert":
            log_write(f"DONE: {r['output']}", "ok")
            log_write(f"  Total actions in FBX:  {r['actions_total']}")
            log_write(f"  Actions exported:      {r['actions_exported']}", "ok")
            had_low = False
            for a in r["exported_actions"]:
                tag = "warn" if a["keyframes"] <= 2 else None
                if tag: had_low = True
                log_write(f"    {a['short']:<24}  kf={a['keyframes']:<5}  "
                          f"frames {a['frame_start']}-{a['frame_end']}", tag)
            if had_low:
                log_write("\n  ⚠️ Some clips have ≤2 keyframes — animations will look wrong.", "warn")
            return

        if r.get("kind") == "merge":
            log_write(f"DONE: {r['output']}", "ok")
            log_write(f"  Model armature:   {r['model_armature']}  ({r['model_bones']} bones)")
            log_write(f"  Source rig had:   {r['source_bones']} bones")
            log_write(f"  Actions exported: {r['actions_kept']}", "ok")
            had_low = False
            for a in r["exported_actions"]:
                tag = "warn" if a["keyframes"] <= 2 else None
                if tag: had_low = True
                log_write(f"    {a['short']:<24}  kf={a['keyframes']:<5}  "
                          f"frames {a['frame_start']}-{a['frame_end']}", tag)
            if had_low:
                log_write("\n  ⚠️ Some clips have ≤2 keyframes — animations will look wrong.", "warn")
            if r.get("missing_bones"):
                log_write(f"\n  ⚠️ {len(r['missing_bones'])} bone(s) used by animations are NOT in "
                          f"the model armature:", "warn")
                for b in r["missing_bones"][:15]:
                    log_write(f"      - {b}", "warn")
                if len(r["missing_bones"]) > 15:
                    log_write(f"      ...and {len(r['missing_bones'])-15} more", "warn")
                log_write("  Those joints won't animate. Make sure your Unity export keeps the "
                          "original bone names.", "warn")
            elif r.get("unused_new_bones"):
                log_write(f"\n  Note: {len(r['unused_new_bones'])} bone(s) on the model "
                          f"aren't animated (probably weapon mounts — fine).", "dim")

    btn_inspect = ttk.Button(frm_act, text="Inspect (single tab)",  command=do_inspect)
    btn_inspect.pack(side="left", padx=4)
    btn_convert = ttk.Button(frm_act, text="Convert FBX → GLB (single tab)", command=do_convert)
    btn_convert.pack(side="left", padx=4)
    btn_merge   = ttk.Button(frm_act, text="MERGE (merge tab)", command=do_merge)
    btn_merge.pack(side="right", padx=4)

    status = ttk.Label(
        root,
        text=f"Blender autodetected: {blender_default or '(not found — pick it manually)'}",
        foreground="gray")
    status.pack(fill="x", padx=10, pady=2)

    root.mainloop()


if __name__ == "__main__":
    cli_main()
