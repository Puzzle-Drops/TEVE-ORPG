extends Node3D

# Applies textures to a Stylized Character FBX's mesh parts based on mesh
# name patterns. The fullbody FBX has 9 meshes (Torso_Naked, Hands, Head2,
# Eyes, etc.) — body parts share one texture set, the head shares another,
# and eyes get their own. This script handles the mapping on _ready.
#
# Future modular setup (when we swap "Naked" parts for equipment meshes)
# will plug in per-part material assignment from EquipmentSlots; this
# script provides the baseline naked-body look.

@export_group("Body")
@export var body_diffuse: Texture2D
@export var body_normal: Texture2D

@export_group("Head")
@export var head_diffuse: Texture2D
@export var head_normal: Texture2D

@export_group("Eyes")
@export var eyes_diffuse: Texture2D
@export var eyes_normal: Texture2D

# Mesh name keywords that route to head/eyes materials. Anything else
# in the tree gets the body material.
const HEAD_KEYWORDS: PackedStringArray = ["Head", "Ears"]
const EYES_KEYWORDS: PackedStringArray = ["Eyes"]

func _ready() -> void:
	var body_mat := _make_material(body_diffuse, body_normal)
	var head_mat := _make_material(head_diffuse, head_normal)
	var eyes_mat := _make_material(eyes_diffuse, eyes_normal)
	_apply_materials(self, body_mat, head_mat, eyes_mat)

func _make_material(diffuse: Texture2D, normal: Texture2D) -> StandardMaterial3D:
	if diffuse == null:
		return null
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = diffuse
	if normal:
		mat.normal_enabled = true
		mat.normal_texture = normal
	return mat

func _apply_materials(node: Node, body_mat: Material, head_mat: Material, eyes_mat: Material) -> void:
	if node is MeshInstance3D:
		var mat: Material = body_mat
		for kw in HEAD_KEYWORDS:
			if kw in node.name:
				mat = head_mat
				break
		for kw in EYES_KEYWORDS:
			if kw in node.name:
				mat = eyes_mat
				break
		if mat != null:
			node.material_override = mat
	for child in node.get_children():
		_apply_materials(child, body_mat, head_mat, eyes_mat)
