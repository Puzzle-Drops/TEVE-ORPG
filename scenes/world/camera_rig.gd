extends Node3D

# Top-down ARPG camera rig.
#
# - Locked mode (default): the rig's world position smoothly follows the
#   player. Press Y to toggle.
# - Unlocked mode: classic RTS / League "edge scroll" — push the mouse to
#   any screen edge to pan the camera in that direction. Y again to snap
#   back to the player.
# - Mouse wheel zooms by moving the Camera3D closer to / farther from the
#   rig origin along a fixed pitch (so the angle stays constant).
#
# The rig itself is a Node3D; the Camera3D is a child positioned along the
# pitched offset. Player is discovered via the "player" group so this rig
# doesn't need a direct path to it.

@export_group("Zoom")
@export var zoom_min: float = 6.0
@export var zoom_max: float = 28.0
@export var zoom_step: float = 1.5
@export var zoom_default: float = 14.14   # matches the old (0, 10, 10) offset

@export_group("Pan (unlocked)")
@export var pan_edge_pixels: int = 30     # how close to an edge before we pan
@export var pan_speed: float = 18.0       # world units / sec at full edge

@export_group("Follow (locked)")
@export var follow_rate: float = 25.0     # higher = camera catches up faster

@export_group("Setup")
@export var camera_pitch_deg: float = 45.0  # downward viewing angle

var locked: bool = true
var zoom_distance: float
var focus_point: Vector3 = Vector3.ZERO
var initialized: bool = false             # snap (not lerp) on the first usable frame

@onready var camera: Camera3D = $Camera3D

func _ready() -> void:
	zoom_distance = zoom_default
	_update_camera_offset()

func _process(delta: float) -> void:
	if Input.is_action_just_pressed("camera_toggle"):
		locked = not locked
	if Input.is_action_just_pressed("camera_zoom_in"):
		zoom_distance = maxf(zoom_min, zoom_distance - zoom_step)
		_update_camera_offset()
	if Input.is_action_just_pressed("camera_zoom_out"):
		zoom_distance = minf(zoom_max, zoom_distance + zoom_step)
		_update_camera_offset()

	if locked:
		var player := _find_player()
		if player != null:
			if not initialized:
				focus_point = player.global_position
				initialized = true
			else:
				# Frame-independent exponential follow.
				var t := 1.0 - exp(-follow_rate * delta)
				focus_point = focus_point.lerp(player.global_position, t)
	else:
		_handle_edge_scroll(delta)

	global_position = focus_point

func _handle_edge_scroll(delta: float) -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	var mouse_pos := get_viewport().get_mouse_position()
	var pan_x := 0.0
	var pan_z := 0.0
	if mouse_pos.x < pan_edge_pixels:
		pan_x = -1.0
	elif mouse_pos.x > viewport_size.x - pan_edge_pixels:
		pan_x = 1.0
	if mouse_pos.y < pan_edge_pixels:
		pan_z = -1.0   # screen-up = into the scene (-Z world)
	elif mouse_pos.y > viewport_size.y - pan_edge_pixels:
		pan_z = 1.0
	focus_point.x += pan_x * pan_speed * delta
	focus_point.z += pan_z * pan_speed * delta

func _update_camera_offset() -> void:
	# Camera sits on the +Y+Z side of the rig at a fixed pitch; zoom_distance
	# controls how far away it is. Rotation stays whatever was authored in
	# the scene (set once to look back at the rig origin).
	var angle := deg_to_rad(camera_pitch_deg)
	camera.position = Vector3(0, sin(angle) * zoom_distance, cos(angle) * zoom_distance)

func _find_player() -> Node3D:
	var players := get_tree().get_nodes_in_group("player")
	for p in players:
		if is_instance_valid(p):
			return p
	return null
