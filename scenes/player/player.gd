extends CharacterBody3D

@export var move_speed: float = 5.0
@export var stop_distance: float = 0.2

@export_group("Combat")
@export var max_hp: float = 100.0
@export var attack_damage: float = 10.0
@export var attack_range: float = 2.5
@export var attack_cooldown: float = 1.0
@export var cast_point: float = 0.3           # wind-up duration; locked here, then projectile fires
@export var projectile_speed: float = 100.0   # melee = very fast/invisible; ranged classes will go slower
@export var projectile_visible: bool = false  # melee invisible by convention
@export var attack_move_engage_range: float = 6.0  # auto-engage radius while attack-moving
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
var attack_timer: float = 0.0     # cooldown between swings
var cast_timer: float = 0.0       # > 0 = locked in cast point (wind-up); fires projectile at 0
var pending_target: Node3D = null # captured at swing start; projectile homes on this
var spawn_position: Vector3
var current_anim: String = ""
# Attack-move: A on ground sets destination; player walks toward it and
# auto-engages enemies within attack_move_engage_range along the way.
var attack_move_destination: Vector3 = Vector3.ZERO
var has_attack_move_dest: bool = false
# Stand-still toggle: S key flips it on/off. Any move/attack command clears it.
var stand_still_active: bool = false

const ENEMY_LAYER_MASK := 4  # layer 3 = "enemy" per project.godot
const DAMAGE_NUMBER = preload("res://scenes/ui/damage_number.tscn")
const PROJECTILE = preload("res://scenes/projectile/projectile.tscn")
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
	_set_anim(anim_idle)

func _physics_process(delta: float) -> void:
	if attack_timer > 0:
		attack_timer -= delta

	# Cast point tick — fire projectile when the wind-up completes.
	if cast_timer > 0:
		cast_timer -= delta
		if cast_timer <= 0:
			_fire_projectile()

	var locked := cast_timer > 0  # true only during the (short) cast-point window

	# Input — accepted even during cast point so we can queue intent.
	# Right-click: enemy under cursor -> attack; ground -> move there.
	if Input.is_action_just_pressed("move_to_cursor"):
		var enemy := _raycast_enemy(get_viewport().get_mouse_position())
		if enemy != null:
			attack_target = enemy
			has_attack_move_dest = false
			stand_still_active = false
		else:
			var ground = _raycast_ground(get_viewport().get_mouse_position())
			if ground != null:
				target_position = ground
				attack_target = null
				has_attack_move_dest = false
				stand_still_active = false
	# Right-click held (after initial press) updates the move target while
	# we're not currently attacking. Lets you drag the cursor and have the
	# player follow continuously.
	elif Input.is_action_pressed("move_to_cursor"):
		if attack_target == null and not has_attack_move_dest:
			var ground = _raycast_ground(get_viewport().get_mouse_position())
			if ground != null:
				target_position = ground

	# A key: enemy under cursor -> attack; ground -> attack-move to there.
	if Input.is_action_just_pressed("attack_move"):
		var enemy := _raycast_enemy(get_viewport().get_mouse_position())
		if enemy != null:
			attack_target = enemy
			has_attack_move_dest = false
		else:
			var ground = _raycast_ground(get_viewport().get_mouse_position())
			if ground != null:
				attack_move_destination = ground
				has_attack_move_dest = true
				attack_target = null
				target_position = global_position
		stand_still_active = false

	# S key: toggle stand-still on/off. Doesn't clear targets — when you
	# release the toggle, the player resumes whatever they were doing.
	if Input.is_action_just_pressed("stand_still"):
		stand_still_active = not stand_still_active

	if attack_target != null:
		if not is_instance_valid(attack_target):
			attack_target = null
		elif attack_target.has_method("is_alive") and not attack_target.is_alive():
			attack_target = null

	# Auto-engage during attack-move: if we're heading somewhere and not
	# currently attacking anything, grab the nearest enemy in range.
	if has_attack_move_dest and attack_target == null and cast_timer <= 0:
		var nearby := _find_nearest_enemy(attack_move_engage_range)
		if nearby != null:
			attack_target = nearby

	# Movement / attack state
	if locked:
		# Wind-up: stand still, face the target we committed to.
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
		elif stand_still_active:
			velocity.x = 0
			velocity.z = 0
		else:
			var direction := to_target.normalized()
			velocity.x = direction.x * move_speed
			velocity.z = direction.z * move_speed
	elif stand_still_active:
		velocity.x = 0
		velocity.z = 0
	elif has_attack_move_dest:
		# Walk toward the attack-move destination; auto-engage logic above
		# will set attack_target if an enemy comes into engage range.
		var to_dest := attack_move_destination - global_position
		to_dest.y = 0
		if to_dest.length() > stop_distance:
			var direction := to_dest.normalized()
			velocity.x = direction.x * move_speed
			velocity.z = direction.z * move_speed
		else:
			# Arrived at the attack-move target. Done.
			has_attack_move_dest = false
			velocity.x = 0
			velocity.z = 0
	else:
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

	# Animation. During cast point the attack anim is playing — don't override.
	# After cast point we're free, so idle/walk takes over.
	if not locked:
		var moving := absf(velocity.x) > 0.1 or absf(velocity.z) > 0.1
		_set_anim(anim_walk if moving else anim_idle)

	# Face direction: pending_target during wind-up beats everything;
	# otherwise attack_target > movement direction.
	if model:
		var face_dir := Vector3.ZERO
		if locked and pending_target != null and is_instance_valid(pending_target):
			face_dir = pending_target.global_position - model.global_position
			face_dir.y = 0
		elif attack_target != null and is_instance_valid(attack_target):
			face_dir = attack_target.global_position - model.global_position
			face_dir.y = 0
		elif absf(velocity.x) > 0.1 or absf(velocity.z) > 0.1:
			face_dir = Vector3(velocity.x, 0, velocity.z)
		if face_dir.length() > 0.01:
			model.look_at(model.global_position + face_dir.normalized(), Vector3.UP, true)
			model.rotation.x = 0
			model.rotation.z = 0

func _raycast_enemy(mouse_pos: Vector2) -> Node3D:
	var camera := get_viewport().get_camera_3d()
	if camera == null:
		return null
	var from := camera.project_ray_origin(mouse_pos)
	var to := from + camera.project_ray_normal(mouse_pos) * 1000.0
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collision_mask = ENEMY_LAYER_MASK
	var result := space.intersect_ray(query)
	if result.is_empty():
		return null
	var collider = result["collider"]
	if collider != null and collider.has_method("take_damage"):
		return collider
	return null

func _raycast_ground(mouse_pos: Vector2):
	var camera := get_viewport().get_camera_3d()
	if camera == null:
		return null
	var from := camera.project_ray_origin(mouse_pos)
	var dir := camera.project_ray_normal(mouse_pos)
	if absf(dir.y) < 0.0001:
		return null
	var t := -from.y / dir.y
	if t < 0:
		return null
	return from + dir * t

func _find_nearest_enemy(max_dist: float) -> Node3D:
	var nearest: Node3D = null
	var nearest_dist := max_dist
	for e in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(e):
			continue
		if e.has_method("is_alive") and not e.is_alive():
			continue
		var d := global_position.distance_to(e.global_position)
		if d < nearest_dist:
			nearest_dist = d
			nearest = e
	return nearest

func _start_swing() -> void:
	# Capture the target NOW so the projectile commits to whoever was clicked,
	# even if attack_target gets switched mid-cast.
	pending_target = attack_target
	cast_timer = cast_point
	attack_timer = attack_cooldown
	# Speed up the attack animation to fit the cast point window. The FBX
	# clip is ~1.0s; if cast_point is 0.3s, play at ~3.3x so the swing
	# visual completes right as the projectile fires.
	if animator and animator.has_animation(anim_attack):
		var anim: Animation = animator.get_animation(anim_attack)
		var speed_scale := 1.0
		if anim and anim.length > 0.0 and cast_point > 0.0:
			speed_scale = anim.length / cast_point
		animator.play(anim_attack, -1, speed_scale)
		current_anim = anim_attack

func _fire_projectile() -> void:
	if pending_target == null or not is_instance_valid(pending_target):
		pending_target = null
		return
	if pending_target.has_method("is_alive") and not pending_target.is_alive():
		pending_target = null
		return
	var proj := PROJECTILE.instantiate()
	get_tree().current_scene.add_child(proj)
	proj.global_position = global_position + Vector3(0, 1.0, 0)  # chest height
	if proj.has_method("setup"):
		proj.setup(self, pending_target, attack_damage, projectile_speed, projectile_visible)
	pending_target = null

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
	if animator == null or cast_timer > 0:
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
		if to_dest.length() < stop_distance and not has_attack_move_dest:
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
	pending_target = null
	cast_timer = 0.0
	has_attack_move_dest = false
	stand_still_active = false
	_refresh_hp_bar()
