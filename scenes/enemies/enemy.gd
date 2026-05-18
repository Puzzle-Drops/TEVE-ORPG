extends CharacterBody3D

@export var move_speed: float = 2.5
@export var attack_range: float = 2.5
@export var chase_buffer: float = 1.0
@export var attack_cooldown: float = 1.5
@export var leash_distance: float = 15.0

@export_group("Combat")
@export var max_hp: float = 50.0
@export var damage: float = 5.0
@export var despawn_delay: float = 3.0  # seconds after death anim before queue_free

@export_group("Animations")
@export var anim_idle: String = "Idle01"
@export var anim_walk: String = "walk"
@export var anim_attack: String = "Attack01"
@export var anim_hit: String = "hit"
@export var anim_death: String = "Death"

enum State { IDLE, CHASE, ATTACK, LEASH, DEAD }
var state: State = State.IDLE
var target: Node3D = null
var spawn_position: Vector3
var attack_timer: float = 0.0
var swinging: bool = false
var aggro_exit_pending: bool = false
var hp: float

@onready var animator: AnimationPlayer = $ModelInstance/AnimationPlayer
@onready var aggro_area: Area3D = $AggroArea
@onready var hp_bar: Node3D = get_node_or_null("HPBar")

func _ready() -> void:
	hp = max_hp
	spawn_position = global_position
	_refresh_hp_bar()
	if animator:
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

func _update_animation() -> void:
	if animator == null or swinging or state == State.DEAD:
		return
	var desired := ""
	match state:
		State.IDLE: desired = anim_idle
		State.CHASE: desired = anim_walk
		State.LEASH: desired = anim_walk
		State.ATTACK: desired = anim_idle
	if animator.current_animation != desired:
		animator.play(desired)

func take_damage(amount: float, _attacker: Node3D) -> void:
	if state == State.DEAD:
		return
	hp -= amount
	print("[%s] HP: %.1f / %.1f" % [name, hp, max_hp])
	_refresh_hp_bar()
	if hp <= 0:
		_die()
	elif not swinging:
		# Brief hit reaction. Skip if mid-swing — don't want to interrupt our own attack anim.
		animator.play(anim_hit)

func _refresh_hp_bar() -> void:
	if hp_bar and hp_bar.has_method("set_hp_ratio"):
		hp_bar.set_hp_ratio(hp / max_hp)

func _die() -> void:
	state = State.DEAD
	swinging = false
	target = null
	velocity = Vector3.ZERO
	# Stop being collidable so the player can walk through the corpse.
	collision_layer = 0
	if aggro_area:
		aggro_area.monitoring = false
	if hp_bar:
		hp_bar.visible = false
	if animator and animator.has_animation(anim_death):
		animator.play(anim_death)
	# Despawn after the death anim plays out (rough; tuneable per-enemy).
	get_tree().create_timer(despawn_delay).timeout.connect(queue_free)

func _on_animation_finished(anim_name: String) -> void:
	if anim_name == anim_attack:
		swinging = false
		# Apply damage at swing-end so a target that ran out mid-swing still gets hit.
		if is_instance_valid(target) and target.has_method("take_damage"):
			target.take_damage(damage, self)
		if aggro_exit_pending:
			aggro_exit_pending = false
			target = null
			if state == State.CHASE or state == State.ATTACK:
				_set_state(State.LEASH)
			else:
				_update_animation()
		else:
			_update_animation()
	elif anim_name == anim_hit:
		_update_animation()

func _try_aggro_overlapping() -> void:
	if target != null or aggro_area == null or state == State.DEAD:
		return
	for body in aggro_area.get_overlapping_bodies():
		target = body
		aggro_exit_pending = false
		_set_state(State.CHASE)
		return

func _physics_process(delta: float) -> void:
	if state == State.DEAD:
		velocity = Vector3.ZERO
		move_and_slide()
		return

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
					velocity.x = 0
					velocity.z = 0
				elif dist > attack_range + chase_buffer:
					_set_state(State.CHASE)
					velocity.x = 0
					velocity.z = 0
				elif attack_timer <= 0:
					animator.play(anim_attack)
					swinging = true
					attack_timer = attack_cooldown
					velocity.x = 0
					velocity.z = 0
				elif dist > attack_range - chase_buffer:
					var direction := (target.global_position - global_position).normalized()
					velocity.x = direction.x * move_speed
					velocity.z = direction.z * move_speed
					if animator.current_animation != anim_walk:
						animator.play(anim_walk)
				else:
					velocity.x = 0
					velocity.z = 0
					if animator.current_animation != anim_idle:
						animator.play(anim_idle)

	velocity.y = 0
	move_and_slide()

func _face_toward(world_pos: Vector3) -> void:
	var look_pos := world_pos
	look_pos.y = global_position.y
	if global_position.distance_to(look_pos) > 0.01:
		look_at(look_pos, Vector3.UP)
		rotation.x = 0
		rotation.z = 0

func _on_aggro_area_body_entered(body: Node3D) -> void:
	if state == State.DEAD:
		return
	if target == null:
		target = body
		aggro_exit_pending = false
		_set_state(State.CHASE)

func _on_aggro_area_body_exited(body: Node3D) -> void:
	if body == target:
		if swinging:
			aggro_exit_pending = true
		else:
			target = null
			if state == State.CHASE or state == State.ATTACK:
				_set_state(State.LEASH)
