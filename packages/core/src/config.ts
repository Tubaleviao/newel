import type { Generator } from './runner/types'

export interface QuoinConfig {
  schema: string
  output: string
  generators: Generator[]
}

export function defineConfig(config: QuoinConfig): QuoinConfig {
  return config
}
