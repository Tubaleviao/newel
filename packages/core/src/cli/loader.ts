import * as path from 'path'
import * as fs from 'fs'
import type { FabricSchema } from '../ir/types'
import type { QuoinConfig } from '../config'

export async function loadSchema(fabricPath: string): Promise<FabricSchema> {
  const resolved = path.resolve(fabricPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`fabric file not found: ${resolved}`)
  }

  delete require.cache[resolved]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolved) as { default?: { toIR?: () => FabricSchema } } | { toIR?: () => FabricSchema }
  const builder = 'default' in mod ? mod.default : mod
  if (!builder || typeof (builder as { toIR?: unknown }).toIR !== 'function') {
    throw new Error(`${resolved} must export a FabricBuilder with a toIR() method as default export`)
  }
  return (builder as { toIR: () => FabricSchema }).toIR()
}

export async function loadConfig(configPath: string): Promise<QuoinConfig> {
  const resolved = path.resolve(configPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`config file not found: ${resolved}`)
  }
  delete require.cache[resolved]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolved) as { default?: QuoinConfig } | QuoinConfig
  const cfg = 'default' in mod && mod.default ? mod.default : mod as QuoinConfig
  if (!cfg.schema || !cfg.output || !cfg.generators) {
    throw new Error(`quoin.config.ts must export { schema, output, generators }`)
  }
  return cfg
}
