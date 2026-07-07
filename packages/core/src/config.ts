import type { Generator } from './runner/types'
import type { Patch } from './ir/patch'

export interface QuoinConfig {
  schema: string
  output: string
  generators: Generator[]
  /**
   * Semantic patches applied to the resolved IR before generation.
   * Can be an inline array or a path to a `.patches.ts` / `.patches.js` file
   * that default-exports a `PatchSet` or `Patch[]`.
   */
  patches?: Patch[] | string
}

export function defineConfig(config: QuoinConfig): QuoinConfig {
  return config
}
