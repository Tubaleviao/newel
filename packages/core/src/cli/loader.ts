import * as path from 'path'
import * as fs from 'fs'
import type { FabricSchema } from '../ir/types'
import type { QuoinConfig } from '../config'
import { normalizeSchema } from '../ir/normalizer'

function registerTsx() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('tsx/cjs')
}

export async function loadSchema(fabricPath: string): Promise<FabricSchema> {
  const resolved = path.resolve(fabricPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`fabric file not found: ${resolved}`)
  }

  if (resolved.endsWith('.ts')) registerTsx()

  delete require.cache[resolved]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolved) as { default?: unknown } | Record<string, unknown>
  const exported = ('default' in mod && mod.default !== undefined) ? mod.default : mod

  if (exported && typeof (exported as { toIR?: unknown }).toIR === 'function') {
    return (exported as { toIR: () => FabricSchema }).toIR()
  }

  if (exported && typeof exported === 'object') {
    return normalizeSchema(exported)
  }

  throw new Error(
    `${resolved} must export either a FabricBuilder (with toIR()) or a plain object with { meta, entities, apis }`
  )
}

export async function loadConfig(configPath: string): Promise<QuoinConfig> {
  const resolved = path.resolve(configPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`config file not found: ${resolved}`)
  }
  if (resolved.endsWith('.ts')) registerTsx()

  delete require.cache[resolved]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolved) as { default?: QuoinConfig } | QuoinConfig
  const cfg = 'default' in mod && mod.default ? mod.default : mod as QuoinConfig
  if (!cfg.schema || !cfg.output || !cfg.generators) {
    throw new Error(`quoin.config.ts must export { schema, output, generators }`)
  }
  return cfg
}
