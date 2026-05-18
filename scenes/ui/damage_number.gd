extends Label3D

@export var rise_distance: float = 1.5
@export var duration: float = 0.8

var elapsed: float = 0.0

func _process(delta: float) -> void:
	elapsed += delta
	if elapsed >= duration:
		queue_free()
		return
	var t := elapsed / duration
	# Rise at a constant rate from wherever the caller placed us.
	# (Don't cache start_position in _ready — the spawner sets global_position
	# AFTER add_child, by which point _ready has already fired.)
	position.y += (rise_distance / duration) * delta
	modulate.a = 1.0 - (t * t)

func setup(amount: float, color: Color) -> void:
	text = str(int(round(amount)))
	modulate = color
