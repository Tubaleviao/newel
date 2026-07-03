import type { EntityInput, ApiInput, FabricInput } from './input-types'

/** Wrap an entity object to get type completions and validation. */
export function defineEntity(entity: EntityInput): EntityInput {
  return entity
}

/** Wrap an API object to get type completions and validation. */
export function defineApi(api: ApiInput): ApiInput {
  return api
}

/** Wrap a full fabric object to get type completions and validation. */
export function defineFabric(fabric: FabricInput): FabricInput {
  return fabric
}
