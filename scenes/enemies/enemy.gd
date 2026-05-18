extends CharacterBody3D

@export var move_speed: float = 2.5
@export var attack_range: float = 2.5
@export var chase_buffer: float = 1.0  # hysteresis: chase until (attack_range - chase_buffer), leave attack if > attack_range
@export var attack_cooldown: float = 1.5
@export var leash_distance: float = 15.0

@export_group("Animations")
@export var anim_idle: String = "Idle01"
@export var anim_walk: String = "walk"
@export var anim_attack: String = "Attack01"

enum State { IDLE, CHASE, ATTACK, LEASH }
var state: State = State.IDLE
var target: Node3D = null
var spawn_position: Vector3
var attack_timer: float = 0.0

@onready var animator: AnimationPlayer = $ModelInstance/AnimationPlayer

func _ready() -> void:
	spawn_position = global_position
	if animator:
		animator.animation_finished.connect(_on_animation_finished)
	_set_state(State.IDLE)

func _set_state(new_state: State) -> void:
	if state == new_state:
		return
	state = new_state
	if animator == null:
		return
	match state:
		State.IDLE: animator.play(anim_idle)
		State.CHASE: animator.play(anim_walk)
		State.LEASH: animator.play(anim_walk)
		State.ATTACK: animator.play(anim_idle)  # idle while waiting for attack cooldown

func _on_animation_finished(anim_name: String) -> void:
	# After an attack swing finishes, return to idle so we don't hold the last frame
	if anim_name == anim_attack:
		animator.play(anim_idle)

func _physics_process(delta: float) -> void:
	if attack_timer > 0:
		attack_timer -= delta

	match state:
		State.IDLE:
			velocity.x = 0
			velocity.z = 0

		State.CHASE:
			if not is_instance_valid(target):
				target = null
				_set_state(State.IDLE)
			elif global_position.distance_to(spawn_position) > leash_distance:
				target = null
				_set_state(State.LEASH)
			else:
				var to_target := target.global_position - global_position
				to_target.y = 0
				var dist := to_target.length()
				# Hysteresis: don't switch to ATTACK until comfortably inside attack_range
				if dist <= attack_range - chase_buffer:
					_set_state(State.ATTACK)
					velocity.x = 0
					velocity.z = 0
				else:
					var direction := to_target.normalized()
					velocity.x = direction.x * move_speed
					velocity.z = direction.z * move_speed
					_face_toward(target.global_position)

		State.LEASH:
			var to_spawn := spawn_position - global_position
			to_spawn.y = 0
			if to_spawn.length() < 0.3:
				_set_state(State.IDLE)
				velocity.x = 0
				velocity.z = 0
			else:
				var direction := to_spawn.normalized()
				velocity.x = direction.x * move_speed
				velocity.z = direction.z * move_speed
				_face_toward(spawn_position)

		State.ATTACK:
			velocity.x = 0
			velocity.z = 0
			if not is_instance_valid(target):
				target = null
				_set_state(State.IDLE)
			else:
				_face_toward(target.global_position)
				var dist := global_position.distance_to(target.global_position)
				if dist > attack_range:
					_set_state(State.CHASE)
				elif attack_timer <= 0:
					animator.play(anim_attack)
					attack_timer = attack_cooldown

	velocity.y = 0
	move_and_slide()

func _face_toward(world_pos: Vector3) -> void:
	var look_pos := world_pos
	look_pos.y = global_position.y  # yaw only
	if global_position.distance_to(look_pos) > 0.01:
		look_at(look_pos, Vector3.UP)
		rotation.x = 0
		rotation.z = 0

func _on_aggro_area_body_entered(body: Node3D) -> void:
	if target == null:
		target = body
		_set_state(State.CHASE)

func _on_aggro_area_body_exited(body: Node3D) -> void:
	if body == target:
		target = null
		if state == State.CHASE or state == State.ATTACK:
			_set_state(State.LEASH)
