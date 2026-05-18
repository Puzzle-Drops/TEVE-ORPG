extends Node3D

# Generic base material applier for inherited FBX creature scenes.
# Attach this script to the root of an inherited FBX scene, set
# diffuse_texture (and optionally normal_texture) in the inspector,
# and on _ready every child MeshInstance3D gets a StandardMaterial3D
# with the given textures applied as material_override.
#
# For creatures with hand-authored per-mesh material setups (e.g.
# cyclops.tscn which has 7 explicit surface_material_overrides), this
# script isn't needed — keep using the explicit overrides there. This
# is the lightweight path for creatures whose FBXs have many meshes
# you don't want to enumerate manually in the .tscn.

@export var diffuse_texture: Texture2D
@export var normal_texture: Texture2D
@export var emission_texture: Texture2D

func _ready() -> void:
	if diffuse_texture == null:
		return
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = diffuse_texture
	if normal_texture:
		mat.normal_enabled = true
		mat.normal_texture = normal_texture
	if emission_texture:
		mat.emission_enabled = true
		mat.emission_texture = emission_texture
	_apply_to_all_meshes(self, mat)

func _apply_to_all_meshes(node: Node, material: Material) -> void:
	if node is MeshInstance3D:
		node.material_override = material
	for child in node.get_children():
		_apply_to_all_meshes(child, material)
