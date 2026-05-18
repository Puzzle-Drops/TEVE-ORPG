extends CharacterBody3D

@export var move_speed: float = 5.0
@export var stop_distance: float = 0.2

@export_group("Combat")
@export var max_hp: float = 100.0
@export var attack_damage: float = 10.0
@export var attack_range: float = 2.5
@export var attack_cooldown: float = 0.8

var hp: float
var target_position: Vector3
var attack_target: Node3D = null
var attack_timer: float = 0.0
var spawn_position: Vector3

const ENEMY_LAYER_MASK := 4  # layer 3 = "enemy" per project.godot

@onready var hp_bar: ProgressBar = get_node_or_null("HUD/PlayerHP")

func _ready() -> void:
	hp = max_hp
	spawn_position = global_position
	target_position = global_position
	_refresh_hp_bar()

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
	if hp <= 0:
		_respawn()

func _refresh_hp_bar() -> void:
	if hp_bar:
		hp_bar.max_value = max_hp
		hp_bar.value = hp

func _respawn() -> void:
	# Placeholder death handling — reset HP and snap back to spawn.
	# Real death flow (animation, screen fade, etc.) is for later.
	print("[Player] died — respawning")
	hp = max_hp
	global_position = spawn_position
	target_position = global_position
	attack_target = null
	_refresh_hp_bar()
