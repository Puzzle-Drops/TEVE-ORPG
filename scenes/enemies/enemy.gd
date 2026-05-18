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
@onready var aggro_area: Area3D = $AggroArea

func _ready() -> void:
	spawn_position = global_position
	if animator:
		# Godot's FBX importer brings animations in as one-shot by default.
		# Force idle and walk to loop so the cyclops doesn't freeze on the last
		# frame mid-gameplay. Attack stays one-shot so animation_finished fires.
		for anim_name in [anim_idle, anim_walk]:
			if animator.has_animation(anim_name):
				var a := animator.get_animation(anim_name)
				if a != null:
					a.loop_mode = Animation.LOOP_LINEAR
		animator.animation_finished.connect(_on_animation_finished)
	_update_animation()

func _set_state(new_state: State) -> void:
	if state == new_state:
		return
	state = new_state
	_update_animation()

# Default animation for the current state. ATTACK-state animation is managed
# inline in _physics_process (walk while closing gap, idle while waiting).
# NEVER interrupts a running swing.
func _update_animation() -> void:
	if animator == null or swinging:
		return
	var desired := ""
	match state:
		State.IDLE: desired = anim_idle
		State.CHASE: desired = anim_walk
		State.LEASH: desired = anim_walk
		State.ATTACK: desired = anim_idle
	if animator.current_animation != desired:
		animator.play(desired)

func _on_animation_finished(anim_name: String) -> void:
	if anim_name == anim_attack:
		swinging = false
		# TODO[combat]: apply damage to target here.
		if aggro_exit_pending:
			aggro_exit_pending = false
			target = null
			if state == State.CHASE or state == State.ATTACK:
				_set_state(State.LEASH)
			else:
				_update_animation()
		else:
			_update_animation()

# Re-aggro check for when something is already inside the aggro area at the
# moment we become IDLE. body_entered only fires on *new* overlaps, so if the
# player is sitting at the spawn point when the cyclops leashes back to it,
# we'd never know without polling. Called from LEASH -> IDLE transition.
func _try_aggro_overlapping() -> void:
	if target != null or aggro_area == null:
		return
	for body in aggro_area.get_overlapping_bodies():
		target = body
		aggro_exit_pending = false
		_set_state(State.CHASE)
		return

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
				_try_aggro_overlapping()
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
				# Player may already be inside the aggro area at spawn — re-check.
				_try_aggro_overlapping()
			else:
				var direction := to_spawn.normalized()
				velocity.x = direction.x * move_speed
				velocity.z = direction.z * move_speed
				_face_toward(spawn_position)

		State.ATTACK:
			if not is_instance_valid(target):
				if not swinging:
					_set_state(State.LEASH)
				velocity.x = 0
				velocity.z = 0
			else:
				_face_toward(target.global_position)
				var dist := global_position.distance_to(target.global_position)

				if swinging:
					# Cannot move during the swing animation.
					velocity.x = 0
					velocity.z = 0
				elif dist > attack_range + chase_buffer:
					# Target broke out of attack range + hysteresis — chase.
					_set_state(State.CHASE)
					velocity.x = 0
					velocity.z = 0
				elif attack_timer <= 0:
					# Cooldown ready — start swing. Lock velocity for the animation.
					animator.play(anim_attack)
					swinging = true
					attack_timer = attack_cooldown
					velocity.x = 0
					velocity.z = 0
				elif dist > attack_range - chase_buffer:
					# Between swings, close the gap. Play walk anim explicitly so the
					# visual matches the motion (the default ATTACK anim is idle).
					var direction := (target.global_position - global_position).normalized()
					velocity.x = direction.x * move_speed
					velocity.z = direction.z * move_speed
					if animator.current_animation != anim_walk:
						animator.play(anim_walk)
				else:
					# Comfortably in range, waiting for cooldown.
					velocity.x = 0
					velocity.z = 0
					if animator.current_animation != anim_idle:
						animator.play(anim_idle)

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
			# Don't change state — interrupting the swing would prevent
			# animation_finished from firing. Defer until the swing completes.
			aggro_exit_pending = true
		else:
			target = null
			if state == State.CHASE or state == State.ATTACK:
				_set_state(State.LEASH)
