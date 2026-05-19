extends Node3D

# Homing projectile for auto-attacks (LoL-style: once spawned, it WILL hit
# unless the target dies first). Melee classes use an invisible, very fast
# projectile (effectively instant). Ranged classes use slower visible ones.
#
# Spawned by attacker AFTER its cast point completes. Damage applies at
# impact, not at spawn. Target can't dodge by moving — projectile re-aims
# every frame.

@export var speed: float = 100.0
@export var hit_distance: float = 0.6   # how close before "impact"
@export var max_lifetime: float = 4.0   # safety guard; very long-range misses fizzle

var target: Node3D = null
var attacker: Node3D = null
var damage: float = 0.0
var elapsed: float = 0.0
var has_hit: bool = false

@onready var mesh: MeshInstance3D = $MeshInstance3D

func setup(p_attacker: Node3D, p_target: Node3D, p_damage: float, p_speed: float, p_visible: bool) -> void:
	attacker = p_attacker
	target = p_target
	damage = p_damage
	speed = p_speed
	if mesh:
		mesh.visible = p_visible

func _physics_process(delta: float) -> void:
	if has_hit:
		return
	elapsed += delta
	if elapsed > max_lifetime:
		queue_free()
		return
	# Target gone (queue_freed) or dead — fizzle without damage.
	if not is_instance_valid(target):
		queue_free()
		return
	if target.has_method("is_alive") and not target.is_alive():
		queue_free()
		return

	var to_target := target.global_position - global_position
	# Aim a bit above feet so visible projectiles hit chest height.
	to_target.y += 1.0
	var dist := to_target.length()
	if dist <= hit_distance:
		_hit()
		return
	var step := speed * delta
	if step >= dist:
		# Will arrive this frame.
		global_position = target.global_position + Vector3(0, 1.0, 0)
		_hit()
	else:
		global_position += to_target.normalized() * step
		# Orient toward target so visible meshes (arrows, bolts) point forward.
		look_at(target.global_position + Vector3(0, 1.0, 0), Vector3.UP, true)

func _hit() -> void:
	has_hit = true
	if is_instance_valid(target) and target.has_method("take_damage"):
		target.take_damage(damage, attacker)
	queue_free()
