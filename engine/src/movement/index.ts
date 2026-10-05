export { MOVEMENT, MOVEMENT_CHOICES } from './constants';
export { intentFromDevices, NO_INTENT } from './intent';
export type { IntentDevices, MovementIntent } from './intent';
export { airVelocity, groundMotion, groundSpeedOf, isWalkable, levelGround, PlayerMovement, slopeDegrees } from './ground';
export type { GroundedState, GroundHeightQuery, GroundHit, GroundMotion, GroundProbe, MovementCollider, MovementMode, MovementWater } from './ground';
export { CAPSULE_MAX_PASSES, capsuleAxis, closestPointOnTriangle, closestVerticalSegmentTriangle, defaultCapsule, resolveCapsule } from './capsule';
export type { CapsuleResolution, CapsuleShape, ResolveOptions, SegmentTriangleClosest, TriangleQuery, Vec3 } from './capsule';
export { SWIM_SURFACE_BAND, swimEnterDepth, swimExitDepth, swimSpeedOf, swimVelocity } from './swim';
