extends CharacterBody3D

@export var move_speed: float = 2.5
@export var stop_distance: float = 2.0

enum State { IDLE, CHASE }
var state: State = State.IDLE
var target: Node3D = null

func _physics_process(_delta: float) -> void:
	match state:
		State.IDLE:
			velocity.x = 0
			velocity.z = 0
		State.CHASE:
			if not is_instance_valid(target):
				target = null
				state = State.IDLE
			else:
				var to_target := target.global_position - global_position
				to_target.y = 0
				if to_target.length() > stop_distance:
					var direction := to_target.normalized()
					velocity.x = direction.x * move_speed
					velocity.z = direction.z * move_speed
					# Face the target (yaw only)
					look_at(target.global_position + Vector3.UP * 0, Vector3.UP)
					rotation.x = 0
					rotation.z = 0
				else:
					velocity.x = 0
					velocity.z = 0
	velocity.y = 0
	move_and_slide()

func _on_aggro_area_body_entered(body: Node3D) -> void:
	# First body to enter the aggro radius becomes the target
	if target == null:
		target = body
		state = State.CHASE

func _on_aggro_area_body_exited(body: Node3D) -> void:
	# Player left the aggro radius — drop target and idle
	if body == target:
		target = null
		state = State.IDLE
