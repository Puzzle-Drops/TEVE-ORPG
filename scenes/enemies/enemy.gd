extends CharacterBody3D

@export var move_speed: float = 2.5
@export var attack_range: float = 2.5
@export var chase_buffer: float = 1.0  # positioning gap: enemy tries to be (attack_range - chase_buffer) close
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
var swinging: bool = false  # true while the attack animation is playing
var aggro_exit_pending: bool = false  # target left aggro mid-swing; resolve after swing ends

@onready var animator: AnimationPlayer = $ModelInstance/AnimationPlayer

func _ready() -> void:
	spawn_position = global_position
	if animator:
		animator.animation_finished.connect(_on_animation_finished)
	_update_animation()

func _set_state(new_state: State) -> void:
	if state == new_state:
		return
	state = new_state
	_update_animation()

# Decide what animation should be playing for the current state.
# CRITICAL: never interrupt the swing animation. While swinging is true,
# this function is a no-op. animation_finished will return us to the
# state's default animation when the swing completes.
func _update_animation() -> void:
	if animator == null or swinging:
		return
	var desired := ""
	match state:
		State.IDLE: desired = anim_idle
		State.CHASE: desired = anim_walk
		State.LEASH: desired = anim_walk
		State.ATTACK: desired = anim_idle  # idle pose between swings
	if animator.current_animation != desired:
		animator.play(desired)

func _on_animation_finished(anim_name: String) -> void:
	if anim_name == anim_attack:
		swinging = false
		# TODO[combat]: apply damage to target here (rolled against target.armor/resist).
		# Damage commits at swing-end so a target that ran out of range during the swing
		# still takes the hit.
		if aggro_exit_pending:
			# Player left aggro during the swing — now we can process that exit.
			aggro_exit_pending = false
			target = null
			if state == State.CHASE or state == State.ATTACK:
				_set_state(State.LEASH)
			else:
				_update_animation()
		else:
			_update_animation()

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
				if dist <= attack_range:
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
			if not is_instance_valid(target):
				# Target gone unexpectedly. If swinging, finish swing first
				# (animation_finished will handle the cleanup). Otherwise leash now.
				if not swinging:
					_set_state(State.LEASH)
				velocity.x = 0
				velocity.z = 0
			else:
				_face_toward(target.global_position)
				var dist := global_position.distance_to(target.global_position)

				if swinging:
					# Swing animation is playing and cannot be interrupted.
					# The enemy can still walk forward to close any gap that opened up
					# (per spec: "Can move during attack animation but stay on attack animation").
					if dist > attack_range - chase_buffer:
						var direction := (target.global_position - global_position).normalized()
						velocity.x = direction.x * move_speed
						velocity.z = direction.z * move_speed
					else:
						velocity.x = 0
						velocity.z = 0
				elif dist > attack_range + chase_buffer:
					# Target is well outside attack range AND we're not swinging — chase.
					_set_state(State.CHASE)
					velocity.x = 0
					velocity.z = 0
				elif attack_timer <= 0:
					# Cooldown ready — start swing.
					animator.play(anim_attack)
					swinging = true
					attack_timer = attack_cooldown
					velocity.x = 0
					velocity.z = 0
				elif dist > attack_range - chase_buffer:
					# Between swings, close the gap to the chase target distance.
					var direction := (target.global_position - global_position).normalized()
					velocity.x = direction.x * move_speed
					velocity.z = direction.z * move_speed
				else:
					# Comfortably positioned; wait for cooldown.
					velocity.x = 0
					velocity.z = 0

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
		aggro_exit_pending = false
		_set_state(State.CHASE)

func _on_aggro_area_body_exited(body: Node3D) -> void:
	if body == target:
		if swinging:
			# Don't change state while the swing is playing — that would interrupt
			# the animation and prevent animation_finished from ever firing, leaving
			# swinging=true forever. Defer until the swing completes.
			aggro_exit_pending = true
		else:
			target = null
			if state == State.CHASE or state == State.ATTACK:
				_set_state(State.LEASH)
