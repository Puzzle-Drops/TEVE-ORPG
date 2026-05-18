extends Node3D

const BAR_WIDTH := 1.5

@onready var fill: MeshInstance3D = $Fill

func set_hp_ratio(ratio: float) -> void:
	ratio = clampf(ratio, 0.0, 1.0)
	# Hide when at (or above) full HP — only show when damaged
	visible = ratio < 0.999
	# Anchor the fill at the left edge of the background:
	# QuadMesh is centered on its node origin, so shift the node and scale together.
	if ratio <= 0.0:
		fill.scale.x = 0.001  # avoid zero scale (causes warnings)
	else:
		fill.scale.x = ratio
	fill.position.x = -BAR_WIDTH * 0.5 + BAR_WIDTH * 0.5 * ratio
