export {
  batchLightingPath, BUILDING_LIGHTING_PATH, BUILDING_ALPHA_REFERENCE, BUILDING_BLEND, BUILDING_GROUP_FLAG, BUILDING_MATERIAL_FLAG, BUILDING_VERTEX_BYTES, BUILDING_VERTEX_LAYOUT, BuildingGroupBuilder, buildingMaterialState, groupIsInterior, MAX_BUILDING_MATERIAL_TEXTURES,
  packBuildingGroup, validateBuilding,
} from './building';
export type { Building, BuildingBatch, BuildingBatchClass, BuildingBounds, BuildingGroup, BuildingMaterial, BuildingMaterialState, BuildingTexture } from './building';
export { buildCottage, COTTAGE_FOGS, ROOM_PROP_LIGHT, COTTAGE_PORTAL, COTTAGE_PORTAL_REFS, COTTAGE_PORTAL_VERTICES, COTTAGE_PORTALS, COTTAGE_DOODAD, COTTAGE_DOODAD_MODELS, COTTAGE_DOODAD_SET, COTTAGE_DOODAD_SETS, COTTAGE_DOODADS, COTTAGE, COTTAGE_COLOURS, COTTAGE_GROUP, COTTAGE_MATERIAL, COTTAGE_MATERIALS, cottageTextures, latticeIsBar, ROOM_LIGHT } from './cottage';
export { doodadIsActive, doodadMatrix, validateBuildingDoodads, visibleDoodads } from './doodad';
export type { BuildingDoodad, BuildingDoodadSet } from './doodad';
export { buildPropModel, isPropModelName, PROP, PROP_COLOURS, PROP_MODELS, propTexture } from './props';
export type { PropModelName } from './props';
export { BUILDING_TRIANGLE_FLAG, BuildingCollision, COLLISION_KINDS, collisionIndices, collisionTriangles, DEFAULT_COLLISION_CELL_SIZE, rayTriangle, triangleCollides } from './collision';
export type { CollisionHit, CollisionKind, RaycastOptions } from './collision';
export { buildBuildingLiquidGeometry, BUILDING_LIQUID_CELL_STEP, BUILDING_LIQUID_HOLE, BUILDING_LIQUID_UNSET, buildingLiquidHeightAt, buildingLiquidTileIsHole, resolveBuildingLiquidType, validateBuildingLiquid } from './liquid';
export type { BuildingLiquid, BuildingLiquidGeometry } from './liquid';
export { BASIN, BASIN_GROUP, buildBasin } from './basin';
export { DOORWAY_PARALLEL_THRESHOLD, DOORWAY_SNAP_YARDS, findCurrentRoom, groupPortalRefs, pointInPortal, portalNeighbors, portalSignedDistance, ROOM_HIT_TOLERANCE, ROOM_RAY_YARDS, validateBuildingPortals } from './portal';
export type { BuildingPortal, BuildingPortalRef, CurrentRoom, CurrentRoomOptions, RoomCause } from './portal';
export { clipPolygonToSides, floodPortals, FULL_SCREEN, intersectRects, PORTAL_DEPTH_CAP, PORTAL_ON_PLANE_YARDS, PORTAL_RECT_EPSILON, PORTAL_W_CLAMP_BAND, PORTAL_W_CLAMP_VALUE, portalScreenRect, visibleGroupSet } from './visibility';
export type { PortalFlood, PortalFloodOptions, ScreenRect } from './visibility';
export { BUILDING_FOG_FLAG_SKIP, FOG_TRANSITION_SECONDS, FogTransition, fogWeight, MAX_GROUP_FOGS, mixFog, resolveFog, selectBuildingFog, validateBuildingFogs } from './fog';
export type { BuildingFog, ResolvedFog } from './fog';
