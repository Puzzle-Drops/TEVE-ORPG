extends Label3D

@export var rise_distance: float = 1.5
@export var duration: float = 0.8

var elapsed: float = 0.0
var start_position: Vector3

func _ready() -> void:
	start_position = position

func _process(delta: float) -> void:
	elapsed += delta
	if elapsed >= duration:
		queue_free()
		return
	var t := elapsed / duration
	position = start_position + Vector3(0, rise_distance * t, 0)
	# Fade out, accelerating toward the end
	modulate.a = 1.0 - (t * t)

# Convenience setter so callers don't need to know about Label3D's quirks.
func setup(amount: float, color: Color) -> void:
	text = str(int(round(amount)))
	modulate = color
