extends CharacterBody3D

@export var move_speed: float = 5.0
@export var stop_distance: float = 0.2

@export_group("Combat")
@export var max_hp: float = 100.0
@export var attack_damage: float = 10.0
@export var attack_range: float = 2.5
@export var attack_cooldown: float = 0.8
@export var damage_number_offset: Vector3 = Vector3(0, 0.3, 0)

@export_group("Animations")
@export var anim_idle: String = "Idle01"
@export var anim_walk: String = "Run_Forward"
@export var anim_attack: String = "Combat_Unarmed_Attack"
@export var anim_hit: String = "Combat_Unarmed_Hit"
@export var anim_death: String = "Death"

var hp: float
var target_position: Vector3
var attack_target: Node3D = null
var attack_timer: float = 0.0
var spawn_position: Vector3
var swinging: bool = false  # mid-attack animation; movement and anim changes locked
var current_anim: String = ""

const ENEMY_LAYER_MASK := 4  # layer 3 = "enemy" per project.godot
const DAMAGE_NUMBER = preload("res://scenes/ui/damage_number.tscn")
const ANIM_LIBRARY_SCENE = preload("res://assets/models/players/animations/characters/hu_m_base_pack.fbx")

@onready var hp_bar: ProgressBar = get_node_or_null("HUD/PlayerHP")
@onready var hp_bar_3d: Node3D = get_node_or_null("HPBar")
@onready var animator: AnimationPlayer = get_node_or_null("ModelInstance/AnimationPlayer")
@onready var model: Node3D = get_node_or_null("ModelInstance")

func _ready() -> void:
	hp = max_hp
	spawn_position = global_position
	target_position = global_position
	_refresh_hp_bar()
	_load_external_animations()
	if animator:
		animator.animation_finished.connect(_on_animation_finished)
	_set_anim(anim_idle)

func _physics_process(delta: float) -> void:
	if attack_timer > 0:
		attack_timer -= delta

	var stand_still := Input.is_action_pressed("stand_still")

	# Input
	if Input.is_action_pressed("move_to_cursor"):
		_set_target_from_mouse(get_viewport().get_mouse_position())
		attack_target = null
	if Input.is_action_just_pressed("basic_attack"):
		_try_select_attack_target(get_viewport().get_mouse_position())

	# Drop the attack target if it's been freed OR dead but still in the
	# despawn delay window. Either way we stop trying to hit it.
	if attack_target != null:
		if not is_instance_valid(attack_target):
			attack_target = null
		elif attack_target.has_method("is_alive") and not attack_target.is_alive():
			attack_target = null

	# Movement / attack state
	if swinging:
		# Locked in attack animation — no movement, no new swings.
		velocity.x = 0
		velocity.z = 0
	elif attack_target != null:
		var to_target := attack_target.global_position - global_position
		to_target.y = 0
		var dist := to_target.length()
		if dist <= attack_range:
			velocity.x = 0
			velocity.z = 0
			if attack_timer <= 0:
				_start_swing()
		elif stand_still:
			# Hold position; wait for the target to come into range.
			velocity.x = 0
			velocity.z = 0
		else:
			var direction := to_target.normalized()
			velocity.x = direction.x * move_speed
			velocity.z = direction.z * move_speed
	elif stand_still:
		# No target and pressed S — just stand here.
		velocity.x = 0
		velocity.z = 0
	else:
		# Plain move-to-cursor.
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

	# Anim state (skip while swinging — the attack anim is playing and
	# locked; _on_animation_finished restores the right anim afterward).
	if not swinging:
		var moving := absf(velocity.x) > 0.1 or absf(velocity.z) > 0.1
		_set_anim(anim_walk if moving else anim_idle)

	# Face direction: attack target > movement direction > no change.
	if model:
		var face_dir := Vector3.ZERO
		if attack_target != null and is_instance_valid(attack_target):
			face_dir = attack_target.global_position - model.global_position
			face_dir.y = 0
		elif absf(velocity.x) > 0.1 or absf(velocity.z) > 0.1:
			face_dir = Vector3(velocity.x, 0, velocity.z)
		if face_dir.length() > 0.01:
			model.look_at(model.global_position + face_dir.normalized(), Vector3.UP, true)
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

func _start_swing() -> void:
	if animator == null or not animator.has_animation(anim_attack):
		# No attack anim available — fall back to instant damage on cooldown
		# so combat still works.
		_apply_attack_damage()
		attack_timer = attack_cooldown
		return
	animator.play(anim_attack)
	current_anim = anim_attack
	swinging = true
	attack_timer = attack_cooldown

func _apply_attack_damage() -> void:
	if attack_target == null or not is_instance_valid(attack_target):
		return
	if attack_target.has_method("take_damage"):
		attack_target.take_damage(attack_damage, self)

func _on_animation_finished(anim_name: String) -> void:
	if anim_name == anim_attack:
		swinging = false
		_apply_attack_damage()
		# Anim will be re-set by _physics_process next tick (idle or walk).

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
		# Force locomotion clips to loop; attack/hit/death stay one-shot
		# so animation_finished fires reliably.
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
#
# Also strips Root-bone tracks. Root motion in this animation pack is
# authored on the Root bone; if left in, every animation forces the
# model's visual facing to its authored frame, overriding our code-driven
# look_at rotation (player would "snap back" to the animation's facing
# each time a new clip plays). Removing those tracks lets the rest of
# the skeleton animate naturally while we drive position/rotation in code.
func _retarget_to_skeleton(anim: Animation) -> void:
	var indices_to_remove := []
	for i in anim.get_track_count():
		var path_str := str(anim.track_get_path(i))
		var bone := path_str.get_file()
		if ":" in bone:
			bone = bone.split(":")[0]
		if bone == "Root":
			indices_to_remove.append(i)
			continue
		anim.track_set_path(i, NodePath("Skeleton3D:" + bone))
	# Remove in reverse so the remaining indices stay valid.
	indices_to_remove.reverse()
	for i in indices_to_remove:
		anim.remove_track(i)

func _set_anim(anim_name: String) -> void:
	if animator == null or swinging:
		return
	if anim_name == "" or current_anim == anim_name:
		return
	if not animator.has_animation(anim_name):
		return
	animator.play(anim_name)
	current_anim = anim_name

func take_damage(amount: float, attacker: Node3D) -> void:
	hp -= amount
	print("[Player] HP: %.1f / %.1f" % [hp, max_hp])
	_refresh_hp_bar()
	_spawn_damage_number(amount, Color(1, 0.35, 0.35, 1))
	# Auto-retaliate: if we have no current target AND we're not actively
	# walking somewhere (arrived at destination), counter-attack whoever hit
	# us. The S-key stand-still mode doesn't suppress retaliation — it just
	# stops us from walking toward the attacker; we'll still swing if they
	# come into attack_range.
	if attack_target == null and attacker != null and is_instance_valid(attacker):
		var to_dest := target_position - global_position
		to_dest.y = 0
		if to_dest.length() < stop_distance:
			attack_target = attacker
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
	print("[Player] died — respawning")
	hp = max_hp
	global_position = spawn_position
	target_position = global_position
	attack_target = null
	swinging = false
	_refresh_hp_bar()
