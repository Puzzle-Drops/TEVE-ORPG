"""
fbx_to_glb.py — FBX/GLB inspector and converter.

Single file, three modes:
  1. GUI            : python fbx_to_glb.py
  2. CLI            : python fbx_to_glb.py --input model.fbx --output model.glb
  3. Blender worker : invoked internally — never run this directly in Blender.

CLI examples:
  python fbx_to_glb.py --input Satyr_Full.fbx --output Satyr.glb
  python fbx_to_glb.py --input Satyr_Full.fbx --inspect
  python fbx_to_glb.py --input Satyr.glb --inspect
  python fbx_to_glb.py --input Satyr_Full.fbx --output Satyr.glb --pipeline naive
  python fbx_to_glb.py --input Satyr_Full.fbx --output Satyr.glb --pipeline filtered \
      --wanted "Idle_2H,Walk_2H,Attack_2H,Death_2H"
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

# ---------------------------------------------------------------------------
# Detect runtime — Blender ships its own python with bpy importable.
# ---------------------------------------------------------------------------
try:
    import bpy
    INSIDE_BLENDER = True
except ImportError:
    INSIDE_BLENDER = False

DEFAULT_WANTED_ANIMS = [
    "Idle_1H_WepR", "Walk_1H_WepR", "Attack_1H_WepR", "Death_1H_WepR",
    "Idle_2H",      "Walk_2H",      "Attack_2H",      "Death_2H",
]

# Pipeline strategies:
#   "naive"       — import + export, no action manipulation. Exports every animation
#                   in the FBX. File size will be large for FBXs with many takes.
#   "filtered"    — naive, but delete unwanted actions from bpy.data.actions before
#                   export. Same per-action keyframe density as naive.
#   "rebased_nla" — old approach (shift f-curves to frame 1 + push to NLA tracks).
#                   COLLAPSES animations to 2 keyframes — broken, kept only for
#                   reference / regression testing.
PIPELINES = ("naive", "filtered", "rebased_nla")
DEFAULT_PIPELINE = "filtered"


# ===========================================================================
# Blender-side code
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

    def _action_summary(a):
        # Count total keyframes across all f-curves so we can spot the
        # "only 2 keyframes" bug without leaving Blender.
        kf = sum(len(fc.keyframe_points) for fc in a.fcurves)
        return {
            "name": a.name,
            "short": _short_name(a.name),
            "frame_start": int(a.frame_range[0]),
            "frame_end":   int(a.frame_range[1]),
            "length":      int(a.frame_range[1] - a.frame_range[0]),
            "fcurves":     len(a.fcurves),
            "keyframes":   kf,
        }

    def _import(cfg):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(
            filepath=cfg["input"],
            automatic_bone_orientation=cfg.get("orient_auto", False),
            use_anim=True,
        )

    # ----- Mode: inspect FBX -----
    def cmd_inspect_fbx(cfg):
        _import(cfg)
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

    # ----- Mode: convert FBX -> GLB -----
    def cmd_convert(cfg):
        wanted_set        = set(cfg.get("wanted_anims") or [])
        keep_all          = cfg.get("keep_all_anims", False)
        drop_weapon_anims = cfg.get("drop_weapon_anims", True)
        disable_arm_mod   = cfg.get("disable_armature_mod", True)
        pipeline          = cfg.get("pipeline", DEFAULT_PIPELINE)

        _import(cfg)

        all_actions = _gather_actions()
        kept_names = {a.name for a in all_actions}
        if not keep_all:
            kept_names = {n for n in kept_names if _is_wanted(n, wanted_set)}
        if drop_weapon_anims and not keep_all:
            kept_names = {n for n in kept_names if not n.startswith(("Weapon_L|", "Weapon_R|"))}

        kept    = [a for a in all_actions if a.name in kept_names]
        skipped = [a for a in all_actions if a.name not in kept_names]

        # ----- Belt-and-suspenders bind pose snapshot -----
        if disable_arm_mod:
            for obj in bpy.data.objects:
                if obj.type != 'MESH':
                    continue
                for mod in obj.modifiers:
                    if mod.type == 'ARMATURE':
                        mod.show_viewport = False
                        mod.show_render = False

        # ----- Apply pipeline strategy -----
        if pipeline == "naive":
            # Don't touch actions at all. Export everything that's in the file.
            # `kept` and `skipped` were computed for reporting only here.
            export_mode = 'ACTIONS'

        elif pipeline == "filtered":
            # Remove unwanted actions from bpy.data.actions. ACTIONS export mode
            # walks bpy.data.actions, so removed ones won't appear in the GLB.
            # Each kept action keeps its original f-curve data — full keyframe
            # density, no manipulation, no 2-keyframe collapse.
            for a in list(bpy.data.actions):
                if a.name not in kept_names:
                    bpy.data.actions.remove(a, do_unlink=True)
            # Make sure nothing in the scene still references a deleted action
            # via NLA strips / active actions (cleanup is automatic via
            # do_unlink, but we also wipe NLA tracks just to be tidy).
            for obj in bpy.data.objects:
                ad = obj.animation_data
                if not ad:
                    continue
                # Don't touch the active action — Blender's gltf exporter uses
                # it to pick which action's range to sample for ACTIONS mode.
                while len(ad.nla_tracks) > 0:
                    ad.nla_tracks.remove(ad.nla_tracks[0])
            # Pin every kept action so they're not garbage-collected on export.
            for a in bpy.data.actions:
                a.use_fake_user = True
            export_mode = 'ACTIONS'

        elif pipeline == "rebased_nla":
            # Old approach. Known to collapse animations to 2 keyframes — kept
            # for diagnostic comparison only.
            shift_to_frame_one = cfg.get("shift_to_frame_one", True)
            if shift_to_frame_one:
                for action in kept:
                    offset = 1 - int(action.frame_range[0])
                    if offset == 0:
                        continue
                    for fc in action.fcurves:
                        for kp in fc.keyframe_points:
                            kp.co.x += offset
                            kp.handle_left.x += offset
                            kp.handle_right.x += offset
                        fc.update()
            for obj in bpy.data.objects:
                ad = obj.animation_data
                if not ad: continue
                ad.action = None
                while len(ad.nla_tracks) > 0:
                    ad.nla_tracks.remove(ad.nla_tracks[0])
            armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
            for arm in armatures:
                if arm.animation_data is None:
                    arm.animation_data_create()
                ad = arm.animation_data
                for action in kept:
                    track = ad.nla_tracks.new()
                    track.name = action.name
                    track.strips.new(action.name, 1, action)
            export_mode = 'NLA_TRACKS'
        else:
            raise RuntimeError(f"unknown pipeline: {pipeline}")

        # Set scene frame range generously so per-action sampling has room.
        bpy.context.scene.frame_start = 1
        bpy.context.scene.frame_end = 10000

        bpy.ops.export_scene.gltf(
            filepath=cfg["output"],
            export_format='GLB',
            export_animations=True,
            export_animation_mode=export_mode,
            export_skins=True,
            export_force_sampling=True,
            export_optimize_animation_size=False,
        )

        # Report what's actually in bpy.data.actions after pipeline ran — this
        # is the ground truth for what should have been exported.
        final_actions = sorted(bpy.data.actions, key=lambda a: a.name)
        armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
        _write_result(cfg, {
            "ok": True,
            "kind": "convert",
            "output": cfg["output"],
            "pipeline": pipeline,
            "armatures": [a.name for a in armatures],
            "actions_total": len(all_actions),
            "actions_exported": len(final_actions),
            "actions_skipped":  len(all_actions) - len(final_actions),
            "exported_actions": [_action_summary(a) for a in final_actions],
            "skipped_actions":  [_action_summary(a) for a in skipped if a.name not in
                                 {x.name for x in final_actions}],
        })

    def main_blender():
        cfg = None
        try:
            cfg = _read_config()
            mode = cfg.get("mode")
            if   mode == "inspect_fbx": cmd_inspect_fbx(cfg)
            elif mode == "inspect_glb": cmd_inspect_glb(cfg)
            elif mode == "convert":     cmd_convert(cfg)
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
# Launcher-side code
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
                "error": "Blender exited without writing a result file. "
                         "Check the log above for an error.",
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
        description="FBX/GLB inspector and converter (single file, GUI + CLI).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--input",   help="Input .fbx or .glb file. Omit to launch GUI.")
    p.add_argument("--output",  help="Output .glb path. Default: <input>.glb beside the input.")
    p.add_argument("--blender", help="Path to blender.exe. Default: autodetected.")
    p.add_argument("--inspect", action="store_true",
                   help="List animations from the input file. Auto-detects .fbx vs .glb.")
    p.add_argument("--pipeline", choices=PIPELINES, default=DEFAULT_PIPELINE,
                   help=f"Conversion strategy. Default: {DEFAULT_PIPELINE}")
    p.add_argument("--keep-all", action="store_true",
                   help="Export every animation in the file (no filter).")
    p.add_argument("--wanted", default=",".join(DEFAULT_WANTED_ANIMS),
                   help="Comma-separated wanted clip names. Match is exact on the short name.")
    p.add_argument("--keep-weapon-anims", action="store_true",
                   help="Keep Weapon_L|... / Weapon_R|... clips. Default drops them as duplicates.")
    p.add_argument("--orient-auto", action="store_true",
                   help="Use automatic_bone_orientation=True.")
    p.add_argument("--no-disable-modifier", action="store_true",
                   help="Don't disable the armature modifier during export.")
    args = p.parse_args()

    if not args.input:
        return launch_gui()

    blender = args.blender or find_blender_executable()
    if not blender:
        sys.exit("ERROR: Could not find blender.exe. Pass --blender PATH.")
    if not os.path.exists(args.input):
        sys.exit(f"ERROR: Input not found: {args.input}")

    abs_input = os.path.abspath(args.input)

    if args.inspect:
        is_glb = abs_input.lower().endswith(".glb")
        mode = "inspect_glb" if is_glb else "inspect_fbx"
        print(f"Inspecting {abs_input} ...")
        result, _ = run_blender(blender, mode, on_log=lambda l: None,
                                input=abs_input, orient_auto=args.orient_auto)
        _print_result(result)
        return

    output = args.output or str(Path(args.input).with_suffix(".glb"))
    abs_output = os.path.abspath(output)
    wanted = [w.strip() for w in args.wanted.split(",") if w.strip()]

    print(f"Input:    {abs_input}")
    print(f"Output:   {abs_output}")
    print(f"Pipeline: {args.pipeline}")
    print(f"Anims:    {'<keep all>' if args.keep_all else wanted}")
    print()

    result, full_log = run_blender(
        blender, "convert",
        on_log=lambda line: print(line),
        input=abs_input,
        output=abs_output,
        pipeline=args.pipeline,
        wanted_anims=wanted,
        keep_all_anims=args.keep_all,
        drop_weapon_anims=not args.keep_weapon_anims,
        orient_auto=args.orient_auto,
        disable_armature_mod=not args.no_disable_modifier,
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
            print(f"  {a['short']:<24}  frames {a['frame_start']:>5}-{a['frame_end']:<5}  "
                  f"keyframes={a['keyframes']:<5}  [{a['name']}]")
        return

    if r.get("kind") == "convert":
        print(f"DONE: {r['output']}")
        print(f"  Pipeline:               {r.get('pipeline')}")
        print(f"  Total actions in FBX:   {r['actions_total']}")
        print(f"  Actions exported:       {r['actions_exported']}")
        for a in r["exported_actions"]:
            print(f"    {a['short']:<24}  kf={a['keyframes']:<5}  frames {a['frame_start']}-{a['frame_end']}  [{a['name']}]")


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

def launch_gui():
    import tkinter as tk
    from tkinter import ttk, filedialog, scrolledtext, messagebox

    blender_default = find_blender_executable() or ""

    root = tk.Tk()
    root.title("FBX / GLB Tool")
    root.geometry("950x800")

    state = {
        "input":        tk.StringVar(value=""),
        "output":       tk.StringVar(value=""),
        "blender":      tk.StringVar(value=blender_default),
        "wanted":       tk.StringVar(value=", ".join(DEFAULT_WANTED_ANIMS)),
        "keep_all":     tk.BooleanVar(value=False),
        "drop_weapon":  tk.BooleanVar(value=True),
        "orient_auto":  tk.BooleanVar(value=False),
        "disable_mod":  tk.BooleanVar(value=True),
        "pipeline":     tk.StringVar(value=DEFAULT_PIPELINE),
    }

    pad = {"padx": 6, "pady": 4}

    # ---- Files ----
    frm_files = ttk.LabelFrame(root, text="Files")
    frm_files.pack(fill="x", padx=10, pady=8)

    def pick_input():
        path = filedialog.askopenfilename(
            title="Select FBX or GLB file",
            filetypes=[("FBX/GLB", "*.fbx *.glb"), ("FBX", "*.fbx"), ("GLB", "*.glb"), ("All", "*.*")],
        )
        if path:
            state["input"].set(path)
            if not state["output"].get() and path.lower().endswith(".fbx"):
                state["output"].set(str(Path(path).with_suffix(".glb")))

    def pick_output():
        path = filedialog.asksaveasfilename(
            title="Save GLB as", defaultextension=".glb",
            filetypes=[("GLB files", "*.glb")],
        )
        if path:
            state["output"].set(path)

    def pick_blender():
        path = filedialog.askopenfilename(
            title="Select blender.exe",
            filetypes=[("blender.exe", "blender.exe"), ("All", "*.*")],
        )
        if path:
            state["blender"].set(path)

    ttk.Label(frm_files, text="Input:").grid(row=0, column=0, sticky="w", **pad)
    ttk.Entry(frm_files, textvariable=state["input"]).grid(row=0, column=1, sticky="ew", **pad)
    ttk.Button(frm_files, text="Browse...", command=pick_input).grid(row=0, column=2, **pad)

    ttk.Label(frm_files, text="Output GLB:").grid(row=1, column=0, sticky="w", **pad)
    ttk.Entry(frm_files, textvariable=state["output"]).grid(row=1, column=1, sticky="ew", **pad)
    ttk.Button(frm_files, text="Browse...", command=pick_output).grid(row=1, column=2, **pad)

    ttk.Label(frm_files, text="blender.exe:").grid(row=2, column=0, sticky="w", **pad)
    ttk.Entry(frm_files, textvariable=state["blender"]).grid(row=2, column=1, sticky="ew", **pad)
    ttk.Button(frm_files, text="Browse...", command=pick_blender).grid(row=2, column=2, **pad)
    frm_files.columnconfigure(1, weight=1)

    # ---- Pipeline ----
    frm_pipe = ttk.LabelFrame(root, text="Conversion pipeline")
    frm_pipe.pack(fill="x", padx=10, pady=8)
    ttk.Label(frm_pipe, text="Strategy:").grid(row=0, column=0, sticky="w", **pad)
    pipe_combo = ttk.Combobox(frm_pipe, textvariable=state["pipeline"],
                              values=PIPELINES, state="readonly", width=20)
    pipe_combo.grid(row=0, column=1, sticky="w", **pad)
    ttk.Label(frm_pipe,
        text=("filtered (recommended): delete unwanted actions, export rest with full keyframes.\n"
              "naive: export every animation in the FBX. Largest file but maximum compatibility.\n"
              "rebased_nla: old broken approach — kept for comparison only."),
        foreground="gray", justify="left").grid(row=1, column=0, columnspan=2, sticky="w", **pad)
    frm_pipe.columnconfigure(1, weight=1)

    # ---- Animation filter ----
    frm_anims = ttk.LabelFrame(root, text="Animation filter (used by 'filtered' and 'rebased_nla')")
    frm_anims.pack(fill="x", padx=10, pady=8)
    ttk.Checkbutton(frm_anims, text="Keep ALL animations (no filter — same as 'naive')",
                    variable=state["keep_all"]).grid(row=0, column=0, columnspan=2, sticky="w", **pad)
    ttk.Checkbutton(frm_anims, text="Drop Weapon_L|... and Weapon_R|... duplicates (recommended)",
                    variable=state["drop_weapon"]).grid(row=1, column=0, columnspan=2, sticky="w", **pad)
    ttk.Label(frm_anims, text="Wanted (comma-separated):").grid(row=2, column=0, sticky="w", **pad)
    ttk.Entry(frm_anims, textvariable=state["wanted"]).grid(row=2, column=1, sticky="ew", **pad)
    ttk.Label(frm_anims,
              text="Default = the satyr 8. Match is exact on short names like Idle_2H, Walk_1H_WepR.",
              foreground="gray").grid(row=3, column=0, columnspan=2, sticky="w", **pad)
    frm_anims.columnconfigure(1, weight=1)

    # ---- Advanced ----
    frm_adv = ttk.LabelFrame(root, text="Advanced (defaults are correct for Stylized Creatures rigs)")
    frm_adv.pack(fill="x", padx=10, pady=8)
    ttk.Checkbutton(frm_adv,
        text="automatic_bone_orientation = True  (only enable if mesh imports broken with default)",
        variable=state["orient_auto"]).grid(row=0, column=0, sticky="w", **pad)
    ttk.Checkbutton(frm_adv,
        text="Disable armature modifier during export  (clean bind pose)",
        variable=state["disable_mod"]).grid(row=1, column=0, sticky="w", **pad)

    # ---- Actions ----
    frm_act = ttk.Frame(root)
    frm_act.pack(fill="x", padx=10, pady=4)

    log = scrolledtext.ScrolledText(root, height=20, font=("Consolas", 9))
    log.pack(fill="both", expand=True, padx=10, pady=8)
    log.tag_configure("ok",   foreground="#0a0")
    log.tag_configure("err",  foreground="#c00")
    log.tag_configure("info", foreground="#06c")
    log.tag_configure("dim",  foreground="#888")
    log.tag_configure("warn", foreground="#a60")

    def log_write(text, tag=None):
        log.insert("end", text + "\n", tag)
        log.see("end")

    def stream_log(line):
        root.after(0, lambda: log_write(line, "dim"))

    busy = {"v": False}
    def set_busy(b):
        busy["v"] = b
        for btn in (btn_inspect, btn_convert):
            btn.config(state=("disabled" if b else "normal"))

    def validate(need_output):
        if not state["input"].get():
            messagebox.showerror("Missing", "Pick an input file.")
            return False
        if need_output and not state["output"].get():
            messagebox.showerror("Missing", "Pick an output GLB path.")
            return False
        if not state["blender"].get() or not os.path.exists(state["blender"].get()):
            messagebox.showerror("Missing", f"blender.exe not found at:\n{state['blender'].get()}")
            return False
        return True

    def do_inspect():
        if not validate(need_output=False):
            return
        path = state["input"].get()
        is_glb = path.lower().endswith(".glb")
        mode = "inspect_glb" if is_glb else "inspect_fbx"
        log.delete("1.0", "end")
        log_write(f"Inspecting {'GLB' if is_glb else 'FBX'}: {path}", "info")
        log_write("(Blender startup + import can take 30+ seconds for large files...)\n", "dim")
        set_busy(True)
        def work():
            try:
                result, _ = run_blender(
                    state["blender"].get(),
                    mode,
                    on_log=stream_log,
                    input=path,
                    orient_auto=state["orient_auto"].get(),
                )
                root.after(0, lambda: gui_show_result(result))
            finally:
                root.after(0, lambda: set_busy(False))
        threading.Thread(target=work, daemon=True).start()

    def do_convert():
        if not validate(need_output=True):
            return
        if not state["input"].get().lower().endswith(".fbx"):
            if not messagebox.askyesno("Not an FBX", "Input doesn't end in .fbx. Convert anyway?"):
                return
        log.delete("1.0", "end")
        log_write(f"Converting: {state['input'].get()}", "info")
        log_write(f"  -> {state['output'].get()}", "info")
        log_write(f"  pipeline: {state['pipeline'].get()}", "info")
        log_write("(this can take a minute for large files)\n", "dim")
        set_busy(True)
        wanted = [w.strip() for w in state["wanted"].get().split(",") if w.strip()]
        def work():
            try:
                result, _ = run_blender(
                    state["blender"].get(),
                    "convert",
                    on_log=stream_log,
                    input=state["input"].get(),
                    output=state["output"].get(),
                    pipeline=state["pipeline"].get(),
                    wanted_anims=wanted,
                    keep_all_anims=state["keep_all"].get(),
                    drop_weapon_anims=state["drop_weapon"].get(),
                    orient_auto=state["orient_auto"].get(),
                    disable_armature_mod=state["disable_mod"].get(),
                )
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
                log_write(
                    f"  {a['short']:<24}  frames {a['frame_start']:>5}-{a['frame_end']:<5}  "
                    f"keyframes={a['keyframes']:<6}  [{a['name']}]", tag)
            return

        if r.get("kind") == "convert":
            log_write(f"DONE: {r['output']}", "ok")
            log_write(f"  Pipeline:              {r.get('pipeline')}")
            log_write(f"  Total actions in FBX:  {r['actions_total']}")
            log_write(f"  Actions exported:      {r['actions_exported']}", "ok")
            had_low = False
            for a in r["exported_actions"]:
                tag = "warn" if a["keyframes"] <= 2 else None
                if tag: had_low = True
                log_write(
                    f"    {a['short']:<24}  kf={a['keyframes']:<5}  "
                    f"frames {a['frame_start']}-{a['frame_end']}  [{a['name']}]", tag)
            if had_low:
                log_write("\n  WARNING: some clips have ≤2 keyframes — animations will look wrong "
                          "in 3D viewer. Try a different pipeline.", "warn")
            if r.get("skipped_actions"):
                log_write(f"  Filtered out:          {len(r['skipped_actions'])}", "dim")
                MAX_SHOW = 20
                shown = r["skipped_actions"][:MAX_SHOW]
                for a in shown:
                    log_write(f"    {a['short']:<24}  [{a['name']}]", "dim")
                if len(r["skipped_actions"]) > MAX_SHOW:
                    log_write(f"    ...and {len(r['skipped_actions']) - MAX_SHOW} more", "dim")

    btn_inspect = ttk.Button(frm_act, text="Inspect (auto FBX/GLB)", command=do_inspect)
    btn_inspect.pack(side="left", padx=4)
    btn_convert = ttk.Button(frm_act, text="Convert FBX → GLB", command=do_convert)
    btn_convert.pack(side="right", padx=4)

    status = ttk.Label(
        root,
        text=f"Blender autodetected: {blender_default or '(not found — pick it manually)'}",
        foreground="gray",
    )
    status.pack(fill="x", padx=10, pady=2)

    root.mainloop()


if __name__ == "__main__":
    cli_main()
