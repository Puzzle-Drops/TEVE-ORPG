extends CharacterBody3D

@export var move_speed: float = 5.0
@export var stop_distance: float = 0.2

var target_position: Vector3

func _ready() -> void:
	target_position = global_position

func _physics_process(_delta: float) -> void:
	# Poll right-click every physics tick so single-click AND hold-drag both work.
	if Input.is_action_pressed("move_to_cursor"):
		_set_target_from_mouse(get_viewport().get_mouse_position())

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
	# Intersect with the ground plane (y = 0)
	if absf(dir.y) < 0.0001:
		return
	var t := -from.y / dir.y
	if t < 0:
		return
	target_position = from + dir * t
