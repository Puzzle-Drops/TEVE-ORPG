extends Node3D

@onready var bar: ProgressBar = $SubViewport/ProgressBar

func set_hp_ratio(ratio: float) -> void:
	ratio = clampf(ratio, 0.0, 1.0)
	# Hide when at (or above) full HP — only show when damaged
	visible = ratio < 0.999
	if bar:
		bar.value = ratio * 100.0
