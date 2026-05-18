extends CharacterBody3D

@export var move_speed: float = 5.0
@export var stop_distance: float = 0.2

@export_group("Combat")
@export var max_hp: float = 100.0
@export var attack_damage: float = 10.0
@export var attack_range: float = 2.5
@export var attack_cooldown: float = 0.8
@export var damage_number_offset: Vector3 = Vector3(0, 0.3, 0)  # spawn position relative to player origin (chest, since origin is capsule center)

@export_group("Animations")
@export var anim_idle: String = "Idle01"
@export var anim_walk: String = "Run_Forward"

var hp: float
var target_position: Vector3
var attack_target: Node3D = null
var attack_timer: float = 0.0
var spawn_position: Vector3

const ENEMY_LAYER_MASK := 4  # layer 3 = "enemy" per project.godot

@onready var hp_bar: ProgressBar = get_node_or_null("HUD/PlayerHP")
@onready var hp_bar_3d: Node3D = get_node_or_null("HPBar")
@onready var animator: AnimationPlayer = get_node_or_null("ModelInstance/AnimationPlayer")
@onready var model: Node3D = get_node_or_null("ModelInstance")

const DAMAGE_NUMBER = preload("res://scenes/ui/damage_number.tscn")
const ANIM_LIBRARY_SCENE = preload("res://assets/models/players/animations/characters/hu_m_base_pack.fbx")

var current_anim: String = ""

func _ready() -> void:
	hp = max_hp
	spawn_position = global_position
	target_position = global_position
	_refresh_hp_bar()
	_load_external_animations()
	_set_anim(anim_idle)

# The Human body FBX has only T_Pose; the 223-clip library lives in
# hu_m_base_pack.fbx. Instantiate that scene, grab its AnimationPlayer's
# library, attach it (with idle/walk forced to loop) to our model's
# AnimationPlayer.
func _load_external_animations() -> void:
	if animator == null:
		return
	var pack = ANIM_LIBRARY_SCENE.instantiate()
	var pack_ap: AnimationPlayer = pack.find_child("AnimationPlayer", true, false)
	if pack_ap == null:
		pack.queue_free()
		return
	var lib := AnimationLibrary.new()
	for n in pack_ap.get_animation_list():
		var anim: Animation = pack_ap.get_animation(n)
		if anim == null:
			continue
		_retarget_to_skeleton(anim)
		if n == anim_idle or n == anim_walk:
			anim.loop_mode = Animation.LOOP_LINEAR
		lib.add_animation(n, anim)
	if animator.has_animation_library(""):
		animator.remove_animation_library("")
	animator.add_animation_library("", lib)
	pack.queue_free()

# The base_pack FBX has no Skeleton3D — its animation tracks point at
# Node3D paths like "Root/Pelvis", "Root/Pelvis/spine_01", etc. Our body
# FBX has a real Skeleton3D with bones of the same names. Rewrite each
# track to point at "Skeleton3D:<bone_name>" so the animations drive the
# actual skeleton bones. Bone-name match was verified offline: 113/113.
func _retarget_to_skeleton(anim: Animation) -> void:
	for i in anim.get_track_count():
		var path_str := str(anim.track_get_path(i))
		# Extract the leaf segment of the path (the bone name) — anything
		# after the last '/'. Then strip any ':property' suffix if present.
		var bone := path_str.get_file()
		if ":" in bone:
			bone = bone.split(":")[0]
		anim.track_set_path(i, NodePath("Skeleton3D:" + bone))

func _set_anim(anim_name: String) -> void:
	if animator == null or anim_name == "" or current_anim == anim_name:
		return
	if not animator.has_animation(anim_name):
		return
	animator.play(anim_name)
	current_anim = anim_name

func _physics_process(delta: float) -> void:
	if attack_timer > 0:
		attack_timer -= delta

	# Right-click: ground move. Also cancels any auto-attack.
	if Input.is_action_pressed("move_to_cursor"):
		_set_target_from_mouse(get_viewport().get_mouse_position())
		attack_target = null

	# Left-click: select an attack target if cursor is over an enemy.
	if Input.is_action_just_pressed("basic_attack"):
		_try_select_attack_target(get_viewport().get_mouse_position())

	# Auto-clear if the targeted enemy died.
	if attack_target != null and not is_instance_valid(attack_target):
		attack_target = null

	if attack_target != null:
		# Walk toward the target; swing when in range.
		var to_target := attack_target.global_position - global_position
		to_target.y = 0
		var dist := to_target.length()
		if dist <= attack_range:
			velocity.x = 0
			velocity.z = 0
			if attack_timer <= 0:
				_perform_attack()
				attack_timer = attack_cooldown
		else:
			var direction := to_target.normalized()
			velocity.x = direction.x * move_speed
			velocity.z = direction.z * move_speed
	else:
		# Regular move-to-cursor behavior.
		var to_target := target_position - global_position
		to_target.y = 0
		if to_target.length() > stop_distance:
			var direction := to_target.normalized()
			velocity.x = direction.x * move_speed
			velocity.z = direction.z * move_speed
		else:
			velocity.x = 0
			velocity.z = 0

	velocity.y = 0
	move_and_slide()

	# Drive animation state from horizontal velocity.
	var moving := absf(velocity.x) > 0.1 or absf(velocity.z) > 0.1
	_set_anim(anim_walk if moving else anim_idle)

	# Rotate the MODEL (not the Player root) so the Camera3D — which is
	# a sibling child of Player — stays world-aligned. The Human FBX is
	# authored with +Z as visual forward, so use_model_front=true tells
	# look_at to aim +Z at the target instead of the default -Z.
	if moving and model:
		var move_dir := Vector3(velocity.x, 0, velocity.z).normalized()
		model.look_at(model.global_position + move_dir, Vector3.UP, true)
		model.rotation.x = 0
		model.rotation.z = 0

func _set_target_from_mouse(mouse_pos: Vector2) -> void:
	var camera := get_viewport().get_camera_3d()
	if not camera:
		return
	var from := camera.project_ray_origin(mouse_pos)
	var dir := camera.project_ray_normal(mouse_pos)
	if absf(dir.y) < 0.0001:
		return
	var t := -from.y / dir.y
	if t < 0:
		return
	target_position = from + dir * t

func _try_select_attack_target(mouse_pos: Vector2) -> void:
	var camera := get_viewport().get_camera_3d()
	if not camera:
		return
	var from := camera.project_ray_origin(mouse_pos)
	var to := from + camera.project_ray_normal(mouse_pos) * 1000.0
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collision_mask = ENEMY_LAYER_MASK
	var result := space.intersect_ray(query)
	if result.is_empty():
		return
	var collider = result["collider"]
	if collider != null and collider.has_method("take_damage"):
		attack_target = collider

func _perform_attack() -> void:
	if attack_target == null or not is_instance_valid(attack_target):
		return
	if attack_target.has_method("take_damage"):
		attack_target.take_damage(attack_damage, self)

func take_damage(amount: float, _attacker: Node3D) -> void:
	hp -= amount
	print("[Player] HP: %.1f / %.1f" % [hp, max_hp])
	_refresh_hp_bar()
	_spawn_damage_number(amount, Color(1, 0.35, 0.35, 1))  # red for player damage taken
	if hp <= 0:
		_respawn()

func _refresh_hp_bar() -> void:
	if hp_bar:
		hp_bar.max_value = max_hp
		hp_bar.value = hp
	if hp_bar_3d and hp_bar_3d.has_method("set_hp_ratio"):
		hp_bar_3d.set_hp_ratio(hp / max_hp)

func _spawn_damage_number(amount: float, color: Color) -> void:
	var dn := DAMAGE_NUMBER.instantiate()
	get_tree().current_scene.add_child(dn)
	dn.global_position = global_position + damage_number_offset
	if dn.has_method("setup"):
		dn.setup(amount, color)

func _respawn() -> void:
	# Placeholder death handling — reset HP and snap back to spawn.
	# Real death flow (animation, screen fade, etc.) is for later.
	print("[Player] died — respawning")
	hp = max_hp
	global_position = spawn_position
	target_position = global_position
	attack_target = null
	_refresh_hp_bar()
