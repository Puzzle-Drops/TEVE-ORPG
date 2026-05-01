"""
glb_editor.py — Combine a parent GLB with N child GLBs attached to named bones.
Per-material color/texture adjustments. No external viewer.

Workflow:
  1. Pick parent GLB (e.g. Satyr_Full.glb)
  2. Add as many child GLBs as you want (each gets its own + row)
     - For each: pick file, pick anchor bone, set translation / rotation / scale
  3. Optionally adjust the parent's materials (replace texture, HSV/B/C sliders)
  4. Click Export → final GLB

Single-file Python script. Auto-installs pygltflib and Pillow on first run.

    python glb_editor.py
"""

import sys
import os
import io
import json
import copy
import math
import subprocess
from pathlib import Path

# ---------------------------------------------------------------------------
# Auto-install dependencies. Runs once per system.
# ---------------------------------------------------------------------------
def _ensure(pkg, import_name=None):
    try:
        __import__(import_name or pkg)
    except ImportError:
        print(f"Installing {pkg} (one-time)...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--user", pkg],
            stdout=subprocess.DEVNULL,
        )

_ensure("pygltflib")
_ensure("Pillow", "PIL")
_ensure("numpy")
_ensure("matplotlib")

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from pygltflib import (
    GLTF2, Node, BufferView, Image as GltfImage, Texture, TextureInfo,
    Sampler, PbrMetallicRoughness, Material,
)
from PIL import Image as PILImage, ImageEnhance

import numpy as np
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

# A small alpha override for preview rendering so attachments stay visible
# through the parent mesh.
_PREVIEW_ALPHA = 0.7


# ===========================================================================
# GLB manipulation helpers
# ===========================================================================

def _euler_xyz_to_quat(rx_deg, ry_deg, rz_deg):
    """XYZ Euler angles in degrees → quaternion [x, y, z, w]."""
    rx = math.radians(rx_deg); ry = math.radians(ry_deg); rz = math.radians(rz_deg)
    cx, sx = math.cos(rx/2), math.sin(rx/2)
    cy, sy = math.cos(ry/2), math.sin(ry/2)
    cz, sz = math.cos(rz/2), math.sin(rz/2)
    qw = cx*cy*cz + sx*sy*sz
    qx = sx*cy*cz - cx*sy*sz
    qy = cx*sy*cz + sx*cy*sz
    qz = cx*cy*sz - sx*sy*cz
    return [qx, qy, qz, qw]


def _pad_buffer(bin_data, alignment=4):
    """Pad bytes to a multiple of `alignment` so subsequent typed arrays align."""
    pad = (alignment - (len(bin_data) % alignment)) % alignment
    return bin_data + b'\0' * pad


def _bone_name_list(glb):
    """Return [(node_index, node_name), ...] for plausible anchor points.

    Includes:
      - Every node referenced as a joint by any skin (deforming bones)
      - Every other named node that doesn't carry a mesh (attachment empties
        like Weapon_L / Weapon_R, root nodes, etc.)

    Mesh-bearing named nodes are excluded — attaching a child to a mesh node
    is rarely what you want.

    Sorted alphabetically by name so common slot names (Weapon_*) are easy
    to find by scrolling or by typing the first letter.
    """
    skin_joints = set()
    for skin in (glb.skins or []):
        for j in (skin.joints or []):
            skin_joints.add(j)

    out = []
    for i, n in enumerate(glb.nodes):
        if not n.name:
            continue
        in_skin = i in skin_joints
        is_mesh_node = n.mesh is not None
        if in_skin or not is_mesh_node:
            out.append((i, n.name))
    out.sort(key=lambda x: x[1])
    return out


def _attach_glb_to_node(host, attach, target_node_idx,
                       translation=None, rotation_quat=None, scale=None):
    """Append `attach`'s mesh data into `host` and parent it to host.nodes[target_node_idx].

    Mutates `host` in place. Returns the index of the new node we added.
    """
    # Get binary blobs from both. pygltflib stores GLB binary internally.
    host_bin = host.binary_blob() or b''
    attach_bin = attach.binary_blob() or b''

    # Pad host_bin to 4-byte alignment so attach's accessors stay valid.
    host_bin = _pad_buffer(host_bin)
    bin_offset = len(host_bin)

    # Index offsets — every reference in attach gets shifted by these.
    bv_off   = len(host.bufferViews)
    acc_off  = len(host.accessors)
    mat_off  = len(host.materials)
    mesh_off = len(host.meshes)
    tex_off  = len(host.textures)
    img_off  = len(host.images)
    smp_off  = len(host.samplers)

    # Deep copy attach's mutable lists so we don't disturb the original.
    a_bvs    = copy.deepcopy(attach.bufferViews)
    a_accs   = copy.deepcopy(attach.accessors)
    a_mats   = copy.deepcopy(attach.materials)
    a_meshes = copy.deepcopy(attach.meshes)
    a_texs   = copy.deepcopy(attach.textures)
    a_imgs   = copy.deepcopy(attach.images)
    a_smps   = copy.deepcopy(attach.samplers)

    # Re-base bufferViews into host's combined buffer 0.
    for bv in a_bvs:
        bv.byteOffset = (bv.byteOffset or 0) + bin_offset
        bv.buffer = 0

    for acc in a_accs:
        if acc.bufferView is not None:
            acc.bufferView += bv_off

    for img in a_imgs:
        if img.bufferView is not None:
            img.bufferView += bv_off

    for tex in a_texs:
        if tex.source is not None:  tex.source  += img_off
        if tex.sampler is not None: tex.sampler += smp_off

    for mat in a_mats:
        pbr = mat.pbrMetallicRoughness
        if pbr:
            if pbr.baseColorTexture:         pbr.baseColorTexture.index         += tex_off
            if pbr.metallicRoughnessTexture: pbr.metallicRoughnessTexture.index += tex_off
        if mat.normalTexture:    mat.normalTexture.index    += tex_off
        if mat.occlusionTexture: mat.occlusionTexture.index += tex_off
        if mat.emissiveTexture:  mat.emissiveTexture.index  += tex_off

    attribute_names = ['POSITION', 'NORMAL', 'TANGENT',
                       'TEXCOORD_0', 'TEXCOORD_1',
                       'COLOR_0', 'JOINTS_0', 'WEIGHTS_0']
    for mesh in a_meshes:
        for prim in mesh.primitives:
            attrs = prim.attributes
            for name in attribute_names:
                v = getattr(attrs, name, None)
                if v is not None:
                    setattr(attrs, name, v + acc_off)
            if prim.indices is not None:  prim.indices  += acc_off
            if prim.material is not None: prim.material += mat_off

    # Append everything onto host.
    host.bufferViews.extend(a_bvs)
    host.accessors.extend(a_accs)
    host.materials.extend(a_mats)
    host.meshes.extend(a_meshes)
    host.textures.extend(a_texs)
    host.images.extend(a_imgs)
    host.samplers.extend(a_smps)

    # Find the mesh-bearing node in attach. Skip wrapper nodes like FBX_Root.
    src_node = next((n for n in attach.nodes if n.mesh is not None), None)
    if src_node is None:
        raise RuntimeError("Child GLB has no mesh node.")

    # Apply user-supplied transform on top of the source node's existing TRS.
    final_t = list(src_node.translation) if src_node.translation else [0, 0, 0]
    final_r = list(src_node.rotation)    if src_node.rotation    else [0, 0, 0, 1]
    final_s = list(src_node.scale)       if src_node.scale       else [1, 1, 1]
    if translation is not None:
        final_t = [final_t[0] + translation[0], final_t[1] + translation[1], final_t[2] + translation[2]]
    if rotation_quat is not None:
        # Compose: quaternion multiplication (rotation_quat applied after src_node's rotation).
        x1, y1, z1, w1 = rotation_quat
        x2, y2, z2, w2 = final_r
        final_r = [
            w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2,
            w1*w2 - x1*x2 - y1*y2 - z1*z2,
        ]
    if scale is not None:
        final_s = [final_s[0]*scale[0], final_s[1]*scale[1], final_s[2]*scale[2]]

    new_node = Node(
        name=src_node.name or "Attachment",
        mesh=src_node.mesh + mesh_off,
        translation=final_t,
        rotation=final_r,
        scale=final_s,
    )
    new_node_idx = len(host.nodes)
    host.nodes.append(new_node)

    target = host.nodes[target_node_idx]
    if target.children is None:
        target.children = []
    target.children.append(new_node_idx)

    # Combine binary blobs, update buffer length.
    combined = host_bin + attach_bin
    host.set_binary_blob(combined)
    host.buffers[0].byteLength = len(combined)

    return new_node_idx


# ---------- Image / texture handling ----------

def _read_image_bytes(glb, image_idx):
    """Return raw bytes of glb.images[idx], or None."""
    img = glb.images[image_idx]
    if img.bufferView is not None:
        bv = glb.bufferViews[img.bufferView]
        bin_data = glb.binary_blob() or b''
        offset = bv.byteOffset or 0
        return bin_data[offset:offset + bv.byteLength]
    if img.uri:
        if img.uri.startswith("data:"):
            import base64
            _, b64 = img.uri.split(",", 1)
            return base64.b64decode(b64)
        # External file, relative to GLB location — out of scope for our use.
    return None


def _pil_from_image_bytes(b):
    return PILImage.open(io.BytesIO(b))


def _apply_image_adjustments(pil_img, hue_shift, saturation, brightness, contrast):
    """Apply HSV + brightness/contrast tweaks. Returns a new PIL image."""
    img = pil_img.convert("RGBA")
    has_alpha = "A" in img.getbands()
    if has_alpha:
        rgb = img.convert("RGB")
        alpha = img.split()[-1]
    else:
        rgb = img
        alpha = None

    if hue_shift != 0 or saturation != 1.0:
        hsv = rgb.convert("HSV")
        h, s, v = hsv.split()
        if hue_shift != 0:
            shift = int((hue_shift % 360) * 255 / 360)
            h = h.point(lambda p: (p + shift) % 256)
        if saturation != 1.0:
            s = s.point(lambda p: max(0, min(255, int(p * saturation))))
        rgb = PILImage.merge("HSV", (h, s, v)).convert("RGB")

    if brightness != 1.0:
        rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    if contrast != 1.0:
        rgb = ImageEnhance.Contrast(rgb).enhance(contrast)

    if alpha:
        return PILImage.merge("RGBA", (*rgb.split(), alpha))
    return rgb


# ---------- Math helpers for the 3D preview ----------

def _quat_to_mat3(q):
    """Quaternion [x, y, z, w] -> 3x3 rotation matrix."""
    x, y, z, w = q
    return np.array([
        [1 - 2*(y*y + z*z), 2*(x*y - z*w),     2*(x*z + y*w)],
        [2*(x*y + z*w),     1 - 2*(x*x + z*z), 2*(y*z - x*w)],
        [2*(x*z - y*w),     2*(y*z + x*w),     1 - 2*(x*x + y*y)],
    ], dtype=float)


def _trs_to_mat4(t, r, s):
    """Translation, rotation quaternion, scale -> 4x4 matrix."""
    m = np.eye(4)
    rot = _quat_to_mat3(r)
    scale = np.diag([s[0], s[1], s[2]])
    m[:3, :3] = rot @ scale
    m[:3, 3] = t
    return m


def _compute_world_matrices(glb):
    """Walk every scene's node hierarchy from root and accumulate world
    matrices. Returns dict: node_index -> 4x4 numpy matrix."""
    mats = {}
    seen = set()

    def visit(idx, parent_m):
        if idx in seen:
            return  # cycle guard
        seen.add(idx)
        n = glb.nodes[idx]
        t = list(n.translation) if n.translation else [0, 0, 0]
        r = list(n.rotation)    if n.rotation    else [0, 0, 0, 1]
        s = list(n.scale)       if n.scale       else [1, 1, 1]
        local = _trs_to_mat4(t, r, s)
        world = parent_m @ local
        mats[idx] = world
        for c in (n.children or []):
            visit(c, world)

    identity = np.eye(4)
    scenes = glb.scenes or []
    if scenes:
        for scene in scenes:
            for root in (scene.nodes or []):
                visit(root, identity)
    else:
        # Fallback: visit any node not referenced as a child by anyone else.
        child_set = set()
        for n in glb.nodes:
            for c in (n.children or []):
                child_set.add(c)
        for i in range(len(glb.nodes)):
            if i not in child_set:
                visit(i, identity)
    return mats


def _mesh_bbox(glb, mesh_idx):
    """Compute AABB from accessor min/max for all primitives of a mesh.
    Returns (min_xyz, max_xyz) as numpy arrays, or None if unavailable."""
    if mesh_idx is None or mesh_idx >= len(glb.meshes):
        return None
    mesh = glb.meshes[mesh_idx]
    lo = np.array([np.inf, np.inf, np.inf])
    hi = np.array([-np.inf, -np.inf, -np.inf])
    found = False
    for prim in mesh.primitives:
        pos = getattr(prim.attributes, 'POSITION', None)
        if pos is None:
            continue
        acc = glb.accessors[pos]
        if acc.min and acc.max and len(acc.min) >= 3 and len(acc.max) >= 3:
            lo = np.minimum(lo, np.array(acc.min[:3]))
            hi = np.maximum(hi, np.array(acc.max[:3]))
            found = True
    if not found or not np.isfinite(lo).all():
        return None
    return lo, hi


def _bbox_corners(lo, hi):
    """Return 8 homogeneous corners of an AABB as 8x4 array."""
    return np.array([
        [lo[0], lo[1], lo[2], 1.0],
        [hi[0], lo[1], lo[2], 1.0],
        [lo[0], hi[1], lo[2], 1.0],
        [hi[0], hi[1], lo[2], 1.0],
        [lo[0], lo[1], hi[2], 1.0],
        [hi[0], lo[1], hi[2], 1.0],
        [lo[0], hi[1], hi[2], 1.0],
        [hi[0], hi[1], hi[2], 1.0],
    ])


_BBOX_EDGE_PAIRS = [
    (0,1), (0,2), (1,3), (2,3),  # bottom face
    (4,5), (4,6), (5,7), (6,7),  # top face
    (0,4), (1,5), (2,6), (3,7),  # vertical edges
]


def _apply_parent_scale(glb, scale):
    """Wrap the entire scene in a new root node with the given uniform scale.

    All bones, meshes, and animations inherit from this new root, so the
    whole rig scales uniformly without us having to touch any vertex data
    or inverse bind matrices. Per glTF skinning, the bone world transforms
    cascade through ancestors — wrapping in a scale node scales everything
    correctly during skinning.
    """
    if scale == 1.0 or scale <= 0:
        return
    new_root = Node(name="ParentScale", scale=[scale, scale, scale])
    new_root_idx = len(glb.nodes)
    glb.nodes.append(new_root)
    if glb.scenes:
        scene = glb.scenes[0]
        new_root.children = list(scene.nodes or [])
        scene.nodes = [new_root_idx]


# ---------- Mesh data extraction (for the 3D preview) ----------

_GLTF_DTYPE = {
    5120: np.int8,    5121: np.uint8,
    5122: np.int16,   5123: np.uint16,
    5125: np.uint32,  5126: np.float32,
}
_GLTF_NCOMPS = {
    'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
    'MAT2': 4,  'MAT3': 9, 'MAT4': 16,
}

def _decode_accessor(glb, accessor_idx):
    """Decode a glTF accessor as a numpy array.
    Returns shape (count,) for SCALAR, (count, n) for VEC*/MAT* types.
    Handles both tightly-packed and strided buffer views."""
    acc = glb.accessors[accessor_idx]
    bv  = glb.bufferViews[acc.bufferView]
    bin_data = glb.binary_blob() or b''
    base_off = (bv.byteOffset or 0) + (acc.byteOffset or 0)
    dtype = _GLTF_DTYPE[acc.componentType]
    n_comp = _GLTF_NCOMPS[acc.type]
    count = acc.count
    item_size = np.dtype(dtype).itemsize * n_comp
    stride = bv.byteStride or item_size

    if stride == item_size:
        total = count * item_size
        flat = np.frombuffer(bin_data[base_off:base_off + total], dtype=dtype).copy()
        if n_comp == 1:
            return flat
        return flat.reshape(count, n_comp)

    # Strided: have to copy row by row.
    out = np.zeros((count, n_comp), dtype=dtype)
    for i in range(count):
        ro = base_off + i * stride
        out[i] = np.frombuffer(bin_data[ro:ro + item_size], dtype=dtype)
    return out if n_comp > 1 else out.flatten()


def _sample_pil_at_uvs(pil_img, uvs):
    """Sample a PIL image at UV coordinates. uvs: array shape (N, 2) in [0, 1].
    Returns array shape (N, 3) of RGB floats in [0, 1].

    Y is flipped (UV origin is bottom-left, image origin is top-left).
    Out-of-range UVs are wrapped (modulo).
    """
    arr = np.asarray(pil_img.convert("RGB"))  # shape (H, W, 3), uint8
    h, w = arr.shape[:2]
    xs = (uvs[:, 0] * (w - 1)).astype(int)
    ys = ((1.0 - uvs[:, 1]) * (h - 1)).astype(int)
    xs = np.mod(xs, w)
    ys = np.mod(ys, h)
    return arr[ys, xs].astype(np.float64) / 255.0


def _embedded_material_image(glb, mat_idx):
    """Return PIL.Image for a material's embedded baseColorTexture, or None."""
    if mat_idx is None or mat_idx >= len(glb.materials or []):
        return None
    mat = glb.materials[mat_idx]
    if not (mat.pbrMetallicRoughness and mat.pbrMetallicRoughness.baseColorTexture):
        return None
    tex_idx = mat.pbrMetallicRoughness.baseColorTexture.index
    if tex_idx >= len(glb.textures or []):
        return None
    src_idx = glb.textures[tex_idx].source
    if src_idx is None:
        return None
    raw = _read_image_bytes(glb, src_idx)
    if not raw:
        return None
    try:
        img = _pil_from_image_bytes(raw)
        img.load()
        return img
    except Exception:
        return None


def _get_mesh_geometry(glb, world_matrices, max_tris_per_prim=2500):
    """Decode all meshes in `glb` to geometry data for previewing.

    Returns list of dicts:
      {
        'triangles': numpy array (M, 3, 3) — triangle vertices in world space,
        'uvs':       numpy array (M, 3, 2) or None — per-triangle UVs (one per vert),
        'centroid_uvs': numpy array (M, 2) or None — per-triangle centroid UVs,
        'material':  int material index or None,
      }

    Geometry is cached — textures and tints are looked up fresh at draw time.
    """
    skinned_mesh_idx = set()
    mesh_to_host = {}
    for i, n in enumerate(glb.nodes):
        if n.mesh is not None:
            mesh_to_host.setdefault(n.mesh, i)
            if n.skin is not None:
                skinned_mesh_idx.add(n.mesh)

    out = []
    for mi, mesh in enumerate(glb.meshes or []):
        is_skinned = mi in skinned_mesh_idx
        host_idx = mesh_to_host.get(mi)
        host_world = world_matrices.get(host_idx, np.eye(4)) if host_idx is not None else np.eye(4)

        for prim in mesh.primitives:
            pos_idx = getattr(prim.attributes, 'POSITION', None)
            if pos_idx is None:
                continue
            try:
                pos = _decode_accessor(glb, pos_idx).astype(np.float64)
            except Exception:
                continue
            if pos.ndim != 2 or pos.shape[1] != 3:
                continue
            if not is_skinned:
                hom = np.hstack([pos, np.ones((len(pos), 1))])
                pos = (host_world @ hom.T).T[:, :3]

            if prim.indices is not None:
                try:
                    idxs = _decode_accessor(glb, prim.indices).astype(np.int64)
                except Exception:
                    continue
                if len(idxs) % 3 != 0:
                    continue
                tris = idxs.reshape(-1, 3)
            else:
                if len(pos) % 3 != 0:
                    continue
                tris = np.arange(len(pos)).reshape(-1, 3)

            if len(tris) > max_tris_per_prim:
                step = max(1, len(tris) // max_tris_per_prim)
                tris = tris[::step]

            tri_verts = pos[tris]  # (M, 3, 3)

            uv_idx = getattr(prim.attributes, 'TEXCOORD_0', None)
            tri_uvs = None
            centroid_uvs = None
            if uv_idx is not None:
                try:
                    uvs = _decode_accessor(glb, uv_idx).astype(np.float64)
                    if uvs.ndim == 2 and uvs.shape[1] == 2:
                        tri_uvs = uvs[tris]              # (M, 3, 2)
                        centroid_uvs = tri_uvs.mean(axis=1)  # (M, 2)
                except Exception:
                    pass

            out.append({
                'triangles': tri_verts,
                'uvs': tri_uvs,
                'centroid_uvs': centroid_uvs,
                'material': prim.material,
            })
    return out


def _get_mesh_triangles(glb, world_matrices, max_tris_per_prim=2500):
    """Decode all meshes in `glb` to renderable triangle arrays.

    Returns list of (triangle_verts, rgba_color):
      - triangle_verts: numpy array shape (M, 3, 3) — M triangles, 3 verts, xyz.
      - rgba_color: 4-tuple from material baseColorFactor (with alpha=0.55).

    For skinned meshes, vertices are returned in world space at bind pose
    (per glTF spec, the host node's transform doesn't apply when skinned).
    For static meshes, the host node's world transform is applied.
    Above max_tris_per_prim triangles are subsampled for performance.
    """
    # Find which mesh indices are referenced by skinned nodes.
    skinned_mesh_idx = set()
    mesh_to_host = {}
    for i, n in enumerate(glb.nodes):
        if n.mesh is not None:
            mesh_to_host.setdefault(n.mesh, i)
            if n.skin is not None:
                skinned_mesh_idx.add(n.mesh)

    out = []
    for mi, mesh in enumerate(glb.meshes or []):
        is_skinned = mi in skinned_mesh_idx
        host_idx = mesh_to_host.get(mi)
        host_world = world_matrices.get(host_idx, np.eye(4)) if host_idx is not None else np.eye(4)

        for prim in mesh.primitives:
            pos_idx = getattr(prim.attributes, 'POSITION', None)
            if pos_idx is None:
                continue
            try:
                pos = _decode_accessor(glb, pos_idx).astype(np.float64)
            except Exception:
                continue
            if pos.ndim != 2 or pos.shape[1] != 3:
                continue

            # Apply host transform for unskinned meshes.
            if not is_skinned:
                hom = np.hstack([pos, np.ones((len(pos), 1))])
                pos = (host_world @ hom.T).T[:, :3]

            # Indices -> triangles
            if prim.indices is not None:
                try:
                    idxs = _decode_accessor(glb, prim.indices).astype(np.int64)
                except Exception:
                    continue
                if len(idxs) % 3 != 0:
                    continue
                tris = idxs.reshape(-1, 3)
            else:
                if len(pos) % 3 != 0:
                    continue
                tris = np.arange(len(pos)).reshape(-1, 3)

            # Subsample for perf
            if len(tris) > max_tris_per_prim:
                step = max(1, len(tris) // max_tris_per_prim)
                tris = tris[::step]

            tri_verts = pos[tris]  # (M, 3, 3)

            # Material color: baseColorFactor with our alpha override.
            color = (0.65, 0.65, 0.70, 0.55)
            if prim.material is not None and prim.material < len(glb.materials or []):
                mat = glb.materials[prim.material]
                if mat.pbrMetallicRoughness and mat.pbrMetallicRoughness.baseColorFactor:
                    bcf = mat.pbrMetallicRoughness.baseColorFactor
                    color = (bcf[0], bcf[1], bcf[2], 0.55)

            out.append((tri_verts, color))
    return out


def _set_material_texture_from_pil(glb, mat_idx, pil_img):
    """Replace (or add) baseColorTexture on material `mat_idx` with the given PIL image.

    Re-encodes as PNG, appends bytes to the buffer, creates new bufferView/image/
    texture/sampler as needed, and links it. Old image/texture stays in the file
    but is no longer referenced — that's fine for our purposes.
    """
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    img_bytes = buf.getvalue()

    bin_data = _pad_buffer(glb.binary_blob() or b'')
    offset = len(bin_data)
    bin_data = bin_data + img_bytes
    glb.set_binary_blob(bin_data)
    glb.buffers[0].byteLength = len(bin_data)

    bv = BufferView(buffer=0, byteOffset=offset, byteLength=len(img_bytes))
    bv_idx = len(glb.bufferViews); glb.bufferViews.append(bv)

    img = GltfImage(bufferView=bv_idx, mimeType="image/png")
    img_idx = len(glb.images); glb.images.append(img)

    if not glb.samplers:
        # Sensible defaults: linear filtering, wrap-repeat.
        glb.samplers.append(Sampler(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497))
    sampler_idx = 0  # reuse first sampler

    tex = Texture(source=img_idx, sampler=sampler_idx)
    tex_idx = len(glb.textures); glb.textures.append(tex)

    mat = glb.materials[mat_idx]
    if mat.pbrMetallicRoughness is None:
        mat.pbrMetallicRoughness = PbrMetallicRoughness(baseColorFactor=[1, 1, 1, 1])
    mat.pbrMetallicRoughness.baseColorTexture = TextureInfo(index=tex_idx)


# ===========================================================================
# 3D preview panel (matplotlib in tkinter)
# ===========================================================================

class PreviewPanel:
    """Right-column 3D preview. Shows parent skeleton + attachment markers +
    child mesh bounding boxes at their configured transform.

    The user clicks 'Refresh' to update; auto-refresh on every spinbox change
    would be possible but causes flicker while typing values.
    """

    def __init__(self, parent_widget, app):
        self.app = app
        self.frame = ttk.Frame(parent_widget)
        self.frame.pack(fill="both", expand=True, padx=4, pady=4)

        # State + cache
        self._parent_meshes_cache = None  # invalidated when parent reloads
        self.show_meshes   = tk.BooleanVar(value=True)
        self.show_skeleton = tk.BooleanVar(value=True)

        # Toolbar with controls
        bar = ttk.Frame(self.frame); bar.pack(fill="x", pady=(0, 4))
        ttk.Button(bar, text="Refresh preview", command=self.refresh
                   ).pack(side="left", padx=2)
        ttk.Button(bar, text="Reset view", command=self._reset_view
                   ).pack(side="left", padx=2)
        ttk.Checkbutton(bar, text="Show meshes", variable=self.show_meshes,
                        command=self.refresh).pack(side="left", padx=8)
        ttk.Checkbutton(bar, text="Show skeleton", variable=self.show_skeleton,
                        command=self.refresh).pack(side="left", padx=2)
        self.info_lbl = ttk.Label(bar, text="", foreground="#666")
        self.info_lbl.pack(side="left", padx=8)

        # Matplotlib figure
        self.fig = Figure(figsize=(5, 5), dpi=80)
        self.ax = self.fig.add_subplot(111, projection='3d')
        self.ax.set_box_aspect((1, 1, 1))
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.frame)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)

        # Default camera angles
        self._default_elev = 20
        self._default_azim = -60
        self._reset_view()

    def invalidate_parent_cache(self):
        """Call this when the parent GLB changes so we re-decode meshes."""
        self._parent_meshes_cache = None

    def _reset_view(self):
        self.ax.view_init(elev=self._default_elev, azim=self._default_azim)
        self.canvas.draw_idle()

    def refresh(self):
        ax = self.ax
        ax.clear()
        ax.set_xlabel("X"); ax.set_ylabel("Y"); ax.set_zlabel("Z")

        glb = self.app.parent_glb
        if glb is None:
            ax.text2D(0.5, 0.5, "Load a parent GLB",
                      transform=ax.transAxes, ha="center", va="center",
                      fontsize=12, color="#888")
            self.info_lbl.config(text="")
            self.canvas.draw_idle()
            return

        try:
            world = _compute_world_matrices(glb)
        except Exception as e:
            ax.text2D(0.5, 0.5, f"World matrix error:\n{e}",
                      transform=ax.transAxes, ha="center", va="center",
                      fontsize=10, color="#c00")
            self.canvas.draw_idle()
            return

        # Track all plotted points so we can size the view to fit them.
        all_pts = []
        n_tris_drawn = 0

        # ----- Parent meshes (cached geometry, fresh texture each refresh) -----
        # Resolve effective image per material (replacement+sliders or embedded).
        def _eff_img_for(mat_idx):
            for m in self.app.materials:
                if m.mat_idx == mat_idx:
                    img = m.effective_image()
                    if img is not None:
                        return img
                    break
            return _embedded_material_image(glb, mat_idx)

        scale = max(0.001, float(self.app.parent_scale.get() or 1.0))

        if self.show_meshes.get():
            if self._parent_meshes_cache is None:
                try:
                    self._parent_meshes_cache = _get_mesh_geometry(glb, world)
                except Exception as e:
                    self._parent_meshes_cache = []
                    print(f"[preview] mesh decode failed: {e}")
            for prim in self._parent_meshes_cache:
                tri_verts = prim['triangles']
                if len(tri_verts) == 0:
                    continue
                tri_verts_scaled = tri_verts * scale

                mat_idx = prim['material']
                tex_img = _eff_img_for(mat_idx)
                centroid_uvs = prim['centroid_uvs']

                # Decide on per-face textured colors vs uniform color.
                if tex_img is not None and centroid_uvs is not None:
                    rgb = _sample_pil_at_uvs(tex_img, centroid_uvs)
                    rgba = np.hstack([rgb, np.full((len(rgb), 1), _PREVIEW_ALPHA)])
                    poly = Poly3DCollection(tri_verts_scaled, facecolors=rgba,
                                            edgecolor='none', linewidths=0)
                else:
                    base = (0.7, 0.7, 0.72)
                    if mat_idx is not None and mat_idx < len(glb.materials or []):
                        m = glb.materials[mat_idx]
                        if m.pbrMetallicRoughness and m.pbrMetallicRoughness.baseColorFactor:
                            bcf = m.pbrMetallicRoughness.baseColorFactor
                            base = (bcf[0], bcf[1], bcf[2])
                    poly = Poly3DCollection(tri_verts_scaled, facecolor=base,
                                            edgecolor='none', alpha=_PREVIEW_ALPHA,
                                            linewidths=0)
                ax.add_collection3d(poly)
                all_pts.append(tri_verts_scaled.reshape(-1, 3))
                n_tris_drawn += len(tri_verts_scaled)

        # ----- Skeleton: lines from each node to each of its children -----
        if self.show_skeleton.get():
            seg_xs, seg_ys, seg_zs = [], [], []
            for i, n in enumerate(glb.nodes):
                if i not in world:
                    continue
                p1 = world[i][:3, 3] * scale
                for c in (n.children or []):
                    if c in world:
                        p2 = world[c][:3, 3] * scale
                        seg_xs += [p1[0], p2[0], np.nan]
                        seg_ys += [p1[1], p2[1], np.nan]
                        seg_zs += [p1[2], p2[2], np.nan]
            if seg_xs:
                ax.plot(seg_xs, seg_ys, seg_zs,
                        color="#4477aa", linewidth=1.0, alpha=0.6)

            # Joint dots only if skeleton is shown
            if world:
                joint_pts = np.array([m[:3, 3] for m in world.values()]) * scale
                if len(all_pts) == 0:
                    all_pts.append(joint_pts)
                ax.scatter(joint_pts[:, 0], joint_pts[:, 1], joint_pts[:, 2],
                           c="#4477aa", s=6, alpha=0.5)

        # ----- Children attachments -----
        n_attached = 0
        for ci, ch in enumerate(self.app.children, start=1):
            bone_name = ch.bone.get()
            if not bone_name:
                continue
            bone_idx = next((i for i, n in enumerate(glb.nodes)
                             if n.name == bone_name), None)
            if bone_idx is None or bone_idx not in world:
                continue

            try:
                t = [ch.tx.get(), ch.ty.get(), ch.tz.get()]
                r = _euler_xyz_to_quat(ch.rx.get(), ch.ry.get(), ch.rz.get())
                su = ch.scale.get()
                s = [su, su, su]
            except (tk.TclError, ValueError):
                continue

            offset = _trs_to_mat4(t, r, s)
            # Apply parent scale by scaling the bone's world matrix translation
            # and then attaching the offset on top.
            scaled_bone_m = world[bone_idx].copy()
            scaled_bone_m[:3, 3] = scaled_bone_m[:3, 3] * scale
            # Scale the rotation/scale parts of the bone's matrix too so the
            # attachment inherits parent scale (so a 1.1× satyr's axe is also 1.1×).
            scaled_bone_m[:3, :3] = scaled_bone_m[:3, :3] * scale
            attach_world = scaled_bone_m @ offset
            ap = attach_world[:3, 3]
            all_pts.append(np.array([ap]))

            # Star marker at the attach point
            ax.scatter([ap[0]], [ap[1]], [ap[2]],
                       c="#cc3333", s=120, marker="*",
                       label=(f"Child #{ci} → {bone_name}" if ci <= 6 else None))

            # Render the child mesh — prefer real triangles over bbox.
            child_path = ch.path.get().strip()
            if child_path and os.path.exists(child_path):
                try:
                    cglb = GLTF2.load(child_path)
                    cworld = _compute_world_matrices(cglb)
                    rendered_real_mesh = False
                    if self.show_meshes.get():
                        try:
                            for prim_data in _get_mesh_geometry(
                                    cglb, cworld, max_tris_per_prim=1500):
                                tri_verts_local = prim_data['triangles']
                                if len(tri_verts_local) == 0:
                                    continue
                                # Transform child-local triangles into the parent's
                                # world by attach_world.
                                shape = tri_verts_local.shape
                                flat = tri_verts_local.reshape(-1, 3)
                                hom = np.hstack([flat, np.ones((len(flat), 1))])
                                world_flat = (attach_world @ hom.T).T[:, :3]
                                tri_verts_world = world_flat.reshape(shape)

                                # Try to texture from child's own embedded material.
                                mat_idx = prim_data['material']
                                centroid_uvs = prim_data['centroid_uvs']
                                child_tex = _embedded_material_image(cglb, mat_idx)
                                if child_tex is not None and centroid_uvs is not None:
                                    rgb = _sample_pil_at_uvs(child_tex, centroid_uvs)
                                    rgba = np.hstack([rgb, np.full((len(rgb), 1), 0.95)])
                                    poly = Poly3DCollection(
                                        tri_verts_world, facecolors=rgba,
                                        edgecolor='none', linewidths=0)
                                else:
                                    poly = Poly3DCollection(
                                        tri_verts_world,
                                        facecolor=(0.85, 0.30, 0.30),
                                        edgecolor='none', alpha=0.9, linewidths=0)
                                ax.add_collection3d(poly)
                                all_pts.append(tri_verts_world.reshape(-1, 3))
                                n_tris_drawn += len(tri_verts_world)
                                rendered_real_mesh = True
                        except Exception as e:
                            print(f"[preview] child mesh decode failed: {e}")
                            rendered_real_mesh = False

                    # Bbox fallback if mesh rendering is off or failed.
                    if not rendered_real_mesh:
                        src = next((nd for nd in cglb.nodes
                                    if nd.mesh is not None), None)
                        if src is not None:
                            bbox = _mesh_bbox(cglb, src.mesh)
                            if bbox is not None:
                                corners = _bbox_corners(bbox[0], bbox[1])
                                world_corners = (attach_world @ corners.T).T[:, :3]
                                all_pts.append(world_corners)
                                for a, b in _BBOX_EDGE_PAIRS:
                                    ax.plot(
                                        [world_corners[a, 0], world_corners[b, 0]],
                                        [world_corners[a, 1], world_corners[b, 1]],
                                        [world_corners[a, 2], world_corners[b, 2]],
                                        color="#cc3333", linewidth=1.5, alpha=0.9,
                                    )
                except Exception as e:
                    print(f"[preview] couldn't load child {child_path}: {e}")
            n_attached += 1

        # Equal aspect ratio: compute the combined extents and set them
        if all_pts:
            pts = np.vstack(all_pts)
            lo = pts.min(axis=0)
            hi = pts.max(axis=0)
            ctr = (lo + hi) * 0.5
            half = max((hi - lo).max() * 0.55, 1.0)
            ax.set_xlim(ctr[0] - half, ctr[0] + half)
            ax.set_ylim(ctr[1] - half, ctr[1] + half)
            ax.set_zlim(ctr[2] - half, ctr[2] + half)

        if n_attached > 0:
            ax.legend(loc="upper left", fontsize=8)

        self.info_lbl.config(
            text=(f"{len(world)} nodes  |  {n_attached} attached children  |  "
                  f"~{n_tris_drawn} triangles drawn"))
        self.canvas.draw_idle()


# ===========================================================================
# Editor state
# ===========================================================================

class ChildEntry:
    """Per-row UI bundle + its tk variables."""
    def __init__(self, app, row_index):
        self.app = app
        self.path     = tk.StringVar()
        self.bone     = tk.StringVar()
        self.tx       = tk.DoubleVar(value=0.0)
        self.ty       = tk.DoubleVar(value=0.0)
        self.tz       = tk.DoubleVar(value=0.0)
        self.rx       = tk.DoubleVar(value=0.0)
        self.ry       = tk.DoubleVar(value=0.0)
        self.rz       = tk.DoubleVar(value=0.0)
        self.scale    = tk.DoubleVar(value=1.0)

        self.frame = ttk.LabelFrame(app.children_inner, text=f"Child #{row_index}")
        self.frame.pack(fill="x", padx=4, pady=4)

        # File picker row
        ttk.Label(self.frame, text="GLB file:").grid(row=0, column=0, sticky="w", padx=4, pady=2)
        e = ttk.Entry(self.frame, textvariable=self.path)
        e.grid(row=0, column=1, columnspan=4, sticky="ew", padx=4, pady=2)
        ttk.Button(self.frame, text="Browse...",
                   command=self._pick_file).grid(row=0, column=5, padx=4, pady=2)
        ttk.Button(self.frame, text="Remove",
                   command=lambda: app._remove_child(self)).grid(row=0, column=6, padx=4, pady=2)

        # Bone dropdown
        ttk.Label(self.frame, text="Anchor bone:").grid(row=1, column=0, sticky="w", padx=4, pady=2)
        self.bone_combo = ttk.Combobox(self.frame, textvariable=self.bone, state="readonly", width=30)
        self.bone_combo.grid(row=1, column=1, columnspan=3, sticky="w", padx=4, pady=2)
        self.update_bones(app.current_bone_names())

        # Translation
        ttk.Label(self.frame, text="Translate:").grid(row=2, column=0, sticky="w", padx=4, pady=2)
        for i, (lbl, var) in enumerate([("X", self.tx), ("Y", self.ty), ("Z", self.tz)]):
            ttk.Label(self.frame, text=lbl).grid(row=2, column=1+2*i, sticky="e", padx=2)
            ttk.Spinbox(self.frame, from_=-1000, to=1000, increment=0.1, width=8,
                        textvariable=var).grid(row=2, column=2+2*i, sticky="w", padx=2)

        # Rotation
        ttk.Label(self.frame, text="Rotate (°):").grid(row=3, column=0, sticky="w", padx=4, pady=2)
        for i, (lbl, var) in enumerate([("X", self.rx), ("Y", self.ry), ("Z", self.rz)]):
            ttk.Label(self.frame, text=lbl).grid(row=3, column=1+2*i, sticky="e", padx=2)
            ttk.Spinbox(self.frame, from_=-360, to=360, increment=5.0, width=8,
                        textvariable=var).grid(row=3, column=2+2*i, sticky="w", padx=2)

        # Scale
        ttk.Label(self.frame, text="Scale:").grid(row=4, column=0, sticky="w", padx=4, pady=2)
        ttk.Spinbox(self.frame, from_=0.001, to=100.0, increment=0.1, width=8,
                    textvariable=self.scale).grid(row=4, column=2, sticky="w", padx=2)
        ttk.Label(self.frame, text="(uniform)", foreground="#888").grid(
            row=4, column=3, sticky="w", padx=2)

        for col in range(7):
            self.frame.columnconfigure(col, weight=1 if col == 1 else 0)

    def _pick_file(self):
        p = filedialog.askopenfilename(
            title="Select child GLB",
            filetypes=[("GLB", "*.glb"), ("glTF", "*.gltf"), ("All", "*.*")])
        if p:
            self.path.set(p)

    def update_bones(self, names):
        self.bone_combo["values"] = names
        if names and not self.bone.get():
            self.bone.set(names[0])

    def destroy(self):
        self.frame.destroy()


class MaterialEntry:
    """Per-material UI bundle. Stores the original image so adjustments are
    always applied to the pristine version (sliders don't compound)."""

    def __init__(self, app, mat_idx, mat_name, original_pil):
        self.app = app
        self.mat_idx = mat_idx
        self.original_pil = original_pil  # PIL.Image or None — never mutated
        self.replacement_pil = None       # set when user picks "Replace"

        self.hue   = tk.DoubleVar(value=0.0)
        self.sat   = tk.DoubleVar(value=1.0)
        self.bri   = tk.DoubleVar(value=1.0)
        self.con   = tk.DoubleVar(value=1.0)

        self.frame = ttk.LabelFrame(
            app.materials_inner,
            text=f"Material #{mat_idx}  ({mat_name or '<unnamed>'})")
        self.frame.pack(fill="x", padx=4, pady=4)

        # Status row
        self.status_label = ttk.Label(self.frame, text="", foreground="#444")
        self.status_label.grid(row=0, column=0, columnspan=4, sticky="w", padx=4, pady=2)

        # Buttons row
        ttk.Button(self.frame, text="Replace texture from file...",
                   command=self._on_replace).grid(row=1, column=0, sticky="w", padx=4, pady=2)
        ttk.Button(self.frame, text="Remove replacement",
                   command=self._on_remove_replacement).grid(row=1, column=1, sticky="w", padx=4, pady=2)
        ttk.Button(self.frame, text="Reset adjustments",
                   command=self._on_reset).grid(row=1, column=2, sticky="w", padx=4, pady=2)

        # Sliders
        slider_specs = [
            ("Hue shift  (-180 .. +180°)", self.hue, -180, 180, 0.0),
            ("Saturation (0 .. 2)",         self.sat,  0.0, 2.0, 1.0),
            ("Brightness (0 .. 2)",         self.bri,  0.0, 2.0, 1.0),
            ("Contrast   (0 .. 2)",         self.con,  0.0, 2.0, 1.0),
        ]
        for i, (lbl, var, lo, hi, default) in enumerate(slider_specs):
            ttk.Label(self.frame, text=lbl).grid(row=2+i, column=0, sticky="w", padx=4)
            scale = ttk.Scale(self.frame, from_=lo, to=hi, variable=var, orient="horizontal")
            scale.grid(row=2+i, column=1, columnspan=2, sticky="ew", padx=4)
            value_lbl = ttk.Label(self.frame, width=8)
            value_lbl.grid(row=2+i, column=3, sticky="w", padx=4)
            # Update label live
            def update_label(*a, lbl=value_lbl, var=var):
                lbl.config(text=f"{var.get():.2f}")
            var.trace_add("write", update_label)
            update_label()

        self.frame.columnconfigure(1, weight=1)
        self.frame.columnconfigure(2, weight=1)

        self._refresh_status()

    def _on_replace(self):
        p = filedialog.askopenfilename(
            title="Pick image",
            filetypes=[("Images", "*.png *.jpg *.jpeg *.tga *.bmp *.tiff *.webp"),
                       ("All", "*.*")])
        if not p:
            return
        try:
            img = PILImage.open(p)
            img.load()  # force decode now to catch errors here
        except Exception as e:
            messagebox.showerror("Could not load image", f"{p}\n\n{e}")
            return
        self.replacement_pil = img
        self._refresh_status()

    def _on_remove_replacement(self):
        self.replacement_pil = None
        self._refresh_status()

    def _on_reset(self):
        self.hue.set(0.0); self.sat.set(1.0); self.bri.set(1.0); self.con.set(1.0)

    def _refresh_status(self):
        if self.replacement_pil is not None:
            w, h = self.replacement_pil.size
            self.status_label.config(text=f"Replacement texture loaded: {w}x{h}")
        elif self.original_pil is not None:
            w, h = self.original_pil.size
            self.status_label.config(text=f"Original texture: {w}x{h}")
        else:
            self.status_label.config(
                text="(material has no embedded texture — load one above to enable adjustments)")

    def base_image(self):
        """The PIL image to apply adjustments to, or None if no texture available."""
        return self.replacement_pil if self.replacement_pil is not None else self.original_pil

    def effective_image(self):
        """PIL image with all current adjustments applied.
        Used by the 3D preview to show what the texture will look like.
        Returns None if no source image."""
        base = self.base_image()
        if base is None:
            return None
        try:
            return _apply_image_adjustments(
                base, hue_shift=self.hue.get(), saturation=self.sat.get(),
                brightness=self.bri.get(), contrast=self.con.get())
        except Exception:
            return base

    def has_changes(self):
        if self.replacement_pil is not None:
            return True
        if self.hue.get() != 0.0 or self.sat.get() != 1.0:
            return True
        if self.bri.get() != 1.0 or self.con.get() != 1.0:
            return True
        return False

    def destroy(self):
        self.frame.destroy()


# ===========================================================================
# Main app
# ===========================================================================

class GLBEditor:
    def __init__(self):
        # Tk root must be created before any tk.*Var (Python 3.14+ enforces this).
        self.root = tk.Tk()
        self.root.title("GLB Editor — attach children, edit materials")
        self.root.geometry("1500x950")

        self.parent_path  = tk.StringVar()
        self.parent_scale = tk.DoubleVar(value=1.0)
        self.parent_glb = None      # loaded GLTF2; pristine — never mutated directly
        self.bones = []             # list of (idx, name)
        self.children = []          # list of ChildEntry
        self.materials = []         # list of MaterialEntry

        self._build_ui()

    # ---------- UI ----------

    def _build_ui(self):
        pad = {"padx": 6, "pady": 4}

        # Top: parent file picker (full width) + parent scale
        top = ttk.LabelFrame(self.root, text="Parent GLB")
        top.pack(fill="x", padx=10, pady=8)
        ttk.Label(top, text="File:").grid(row=0, column=0, sticky="w", **pad)
        ttk.Entry(top, textvariable=self.parent_path).grid(row=0, column=1, sticky="ew", **pad)
        ttk.Button(top, text="Browse...", command=self._on_pick_parent).grid(row=0, column=2, **pad)
        ttk.Button(top, text="Reload", command=self._on_load_parent).grid(row=0, column=3, **pad)

        ttk.Label(top, text="Overall scale:").grid(row=1, column=0, sticky="w", **pad)
        scale_box = ttk.Spinbox(top, from_=0.05, to=20.0, increment=0.05, width=8,
                                textvariable=self.parent_scale)
        scale_box.grid(row=1, column=1, sticky="w", **pad)
        ttk.Label(top, text="(applied at export and in preview — e.g. 1.0 / 1.1 / 1.2 for tier 1/2/3)",
                  foreground="#666").grid(row=1, column=2, columnspan=2, sticky="w", **pad)
        top.columnconfigure(1, weight=1)

        # Refresh preview when scale changes (debounced).
        def _on_scale_change(*_):
            if hasattr(self, "preview"):
                self.preview.invalidate_parent_cache()
                # Don't auto-refresh on every keystroke; user clicks Refresh.
        self.parent_scale.trace_add("write", _on_scale_change)

        # Two-column main layout: controls on the left, 3D preview on the right.
        # PanedWindow lets the user drag the divider.
        main_paned = ttk.PanedWindow(self.root, orient="horizontal")
        main_paned.pack(fill="both", expand=True, padx=10, pady=4)

        left  = ttk.Frame(main_paned)
        right = ttk.LabelFrame(main_paned, text="3D Preview")
        main_paned.add(left,  weight=2)
        main_paned.add(right, weight=1)

        # Tabs in the left column
        nb = ttk.Notebook(left)
        nb.pack(fill="both", expand=True)

        tab_children = ttk.Frame(nb)
        tab_materials = ttk.Frame(nb)
        nb.add(tab_children,  text="  Children  ")
        nb.add(tab_materials, text="  Materials & Textures  ")

        # ----- Children tab -----
        cf_top = ttk.Frame(tab_children); cf_top.pack(fill="x", padx=4, pady=4)
        ttk.Button(cf_top, text="+  Add child", command=self._on_add_child
                   ).pack(side="left", padx=2)
        ttk.Button(cf_top, text="Clear all", command=self._on_clear_children
                   ).pack(side="left", padx=2)
        self.children_count_lbl = ttk.Label(cf_top, text="0 children")
        self.children_count_lbl.pack(side="left", padx=10)

        self.children_inner = self._make_scrollable(tab_children)

        # ----- Materials tab -----
        ttk.Label(tab_materials,
                  text=("Adjustments are applied to a fresh copy of the original image at export time, "
                        "so sliders never compound. Replace texture loads PNG/JPG/TGA/etc."),
                  foreground="#666", justify="left").pack(fill="x", padx=8, pady=(8, 0))
        self.materials_inner = self._make_scrollable(tab_materials)

        # Right column: 3D preview
        self.preview = PreviewPanel(right, self)

        # Bottom: export + status
        bottom = ttk.Frame(self.root); bottom.pack(fill="x", padx=10, pady=8)
        self.status = ttk.Label(bottom, text="No parent loaded.", foreground="#666")
        self.status.pack(side="left", padx=4)
        ttk.Button(bottom, text="Export GLB...", command=self._on_export
                   ).pack(side="right", padx=4)

    def _make_scrollable(self, parent):
        """Create a vertical-scrollable Frame inside `parent`. Returns the inner frame
        you should pack widgets into."""
        outer = ttk.Frame(parent); outer.pack(fill="both", expand=True, padx=4, pady=4)
        canvas = tk.Canvas(outer, highlightthickness=0)
        sb = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        inner = ttk.Frame(canvas)
        inner.bind("<Configure>",
                   lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        # Also stretch the inner frame to the canvas width
        win_id = canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.bind("<Configure>",
                    lambda e: canvas.itemconfig(win_id, width=e.width))
        canvas.configure(yscrollcommand=sb.set)
        canvas.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        # Mouse wheel binds when pointer is over this canvas
        def _scroll(e):
            canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")
        canvas.bind("<Enter>", lambda e: canvas.bind_all("<MouseWheel>", _scroll))
        canvas.bind("<Leave>", lambda e: canvas.unbind_all("<MouseWheel>"))
        return inner

    # ---------- Parent loading ----------

    def _on_pick_parent(self):
        p = filedialog.askopenfilename(
            title="Select parent GLB",
            filetypes=[("GLB", "*.glb"), ("glTF", "*.gltf"), ("All", "*.*")])
        if p:
            self.parent_path.set(p)
            self._on_load_parent()

    def _on_load_parent(self):
        path = self.parent_path.get().strip()
        if not path:
            messagebox.showerror("No file", "Pick a parent GLB first.")
            return
        if not os.path.exists(path):
            messagebox.showerror("Not found", f"File doesn't exist:\n{path}")
            return

        try:
            glb = GLTF2.load(path)
        except Exception as e:
            messagebox.showerror("Load failed", f"Couldn't load {path}\n\n{e}")
            return

        self.parent_glb = glb
        self.bones = _bone_name_list(glb)

        # Refresh existing children's bone dropdowns to the new rig.
        for ch in self.children:
            ch.update_bones(self.current_bone_names())

        # Rebuild materials list.
        for m in self.materials:
            m.destroy()
        self.materials.clear()
        for i, mat in enumerate(glb.materials or []):
            original_pil = None
            if mat.pbrMetallicRoughness and mat.pbrMetallicRoughness.baseColorTexture:
                tex_idx = mat.pbrMetallicRoughness.baseColorTexture.index
                tex = glb.textures[tex_idx]
                if tex.source is not None:
                    raw = _read_image_bytes(glb, tex.source)
                    if raw:
                        try:
                            original_pil = _pil_from_image_bytes(raw)
                            original_pil.load()  # force decode now
                        except Exception:
                            original_pil = None
            self.materials.append(MaterialEntry(self, i, mat.name, original_pil))

        # Status
        n_anim = len(glb.animations or [])
        n_skin = len(glb.skins or [])
        n_bones = len(self.bones)
        n_mat = len(glb.materials or [])
        self.status.config(
            text=(f"Loaded: {os.path.basename(path)}  —  "
                  f"{n_bones} bones, {n_mat} materials, {n_anim} animations, {n_skin} skins"),
            foreground="#0a0")

        # Update the 3D preview if it exists yet (it does, always, after init)
        if hasattr(self, "preview"):
            self.preview.invalidate_parent_cache()
            self.preview.refresh()

    def current_bone_names(self):
        return [name for _, name in self.bones]

    # ---------- Children ----------

    def _on_add_child(self):
        if not self.parent_glb:
            messagebox.showinfo("Load parent first",
                                "Load a parent GLB before adding children — the bone "
                                "dropdown is populated from the parent's rig.")
            return
        idx = len(self.children) + 1
        ch = ChildEntry(self, idx)
        self.children.append(ch)
        self._refresh_children_count()
        if hasattr(self, "preview"):
            self.preview.refresh()

    def _remove_child(self, child):
        if child in self.children:
            self.children.remove(child)
        child.destroy()
        # Renumber remaining children labels.
        for i, ch in enumerate(self.children, start=1):
            ch.frame.config(text=f"Child #{i}")
        self._refresh_children_count()
        if hasattr(self, "preview"):
            self.preview.refresh()

    def _on_clear_children(self):
        for ch in list(self.children):
            ch.destroy()
        self.children.clear()
        self._refresh_children_count()

    def _refresh_children_count(self):
        n = len(self.children)
        self.children_count_lbl.config(text=f"{n} child{'ren' if n != 1 else ''}")

    # ---------- Export ----------

    def _on_export(self):
        if not self.parent_glb:
            messagebox.showerror("No parent", "Load a parent GLB first.")
            return

        # Validate children before doing any work.
        for i, ch in enumerate(self.children, start=1):
            if not ch.path.get().strip():
                messagebox.showerror("Missing file",
                                     f"Child #{i}: pick a GLB file or remove the row.")
                return
            if not os.path.exists(ch.path.get()):
                messagebox.showerror("Not found",
                                     f"Child #{i}: file not found:\n{ch.path.get()}")
                return
            if not ch.bone.get():
                messagebox.showerror("No anchor",
                                     f"Child #{i}: pick an anchor bone.")
                return

        out_path = filedialog.asksaveasfilename(
            title="Save merged GLB as",
            defaultextension=".glb",
            filetypes=[("GLB", "*.glb")])
        if not out_path:
            return

        self.status.config(text="Building…", foreground="#06c")
        self.root.update_idletasks()
        try:
            self._build_and_save(out_path)
        except Exception as e:
            messagebox.showerror("Export failed", f"{e}")
            self.status.config(text=f"Failed: {e}", foreground="#c00")
            return

        self.status.config(text=f"Saved {out_path}", foreground="#0a0")
        messagebox.showinfo("Done", f"Saved:\n{out_path}")

    def _build_and_save(self, out_path):
        # Start from a fresh deep copy of the parent so re-exporting doesn't
        # accumulate changes.
        out = copy.deepcopy(self.parent_glb)
        # The deepcopy doesn't preserve binary_blob; re-set it manually.
        out.set_binary_blob(self.parent_glb.binary_blob() or b'')

        # Apply parent overall scale (wraps scene roots in a scale node).
        try:
            ps = float(self.parent_scale.get() or 1.0)
        except (tk.TclError, ValueError):
            ps = 1.0
        _apply_parent_scale(out, ps)

        # Apply material adjustments first (modifies the binary blob, so do it
        # before children which append to the blob).
        for m in self.materials:
            if not m.has_changes():
                continue
            base = m.base_image()
            if base is None:
                # No source image and no replacement — nothing to do.
                continue
            adjusted = _apply_image_adjustments(
                base,
                hue_shift=m.hue.get(),
                saturation=m.sat.get(),
                brightness=m.bri.get(),
                contrast=m.con.get(),
            )
            _set_material_texture_from_pil(out, m.mat_idx, adjusted)

        # Build a name → index map for bones in the output GLB.
        name_to_idx = {}
        for i, n in enumerate(out.nodes):
            if n.name:
                name_to_idx[n.name] = i

        # Attach each child.
        for i, ch in enumerate(self.children, start=1):
            try:
                child_glb = GLTF2.load(ch.path.get())
            except Exception as e:
                raise RuntimeError(f"Child #{i}: couldn't load {ch.path.get()}: {e}")

            target_name = ch.bone.get()
            target_idx = name_to_idx.get(target_name)
            if target_idx is None:
                raise RuntimeError(f"Child #{i}: bone {target_name!r} not found in output.")

            t = [ch.tx.get(), ch.ty.get(), ch.tz.get()]
            r = _euler_xyz_to_quat(ch.rx.get(), ch.ry.get(), ch.rz.get())
            s_uniform = ch.scale.get()
            s = [s_uniform, s_uniform, s_uniform]

            _attach_glb_to_node(out, child_glb, target_idx,
                                translation=t, rotation_quat=r, scale=s)

        out.save_binary(out_path)

    # ---------- Run ----------

    def run(self):
        self.root.mainloop()


# ===========================================================================

def main():
    GLBEditor().run()


if __name__ == "__main__":
    main()
