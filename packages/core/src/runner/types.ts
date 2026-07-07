import type { FabricSchema } from '../ir/types'
import type { IRSnapshot } from './snapshot'

export interface GeneratedFile {
  path: string
  content: string
  header?: string
}

export interface GeneratorOutput {
  files: GeneratedFile[]
  artifacts?: Record<string, unknown>
}

export interface GeneratorContext {
  outputDir: string
  outputs: Map<string, GeneratorOutput>
  previousSnapshot?: IRSnapshot
}

export interface Generator {
  readonly name: string
  readonly dependsOn: string[]
  generate(schema: FabricSchema, ctx: GeneratorContext): Promise<GeneratorOutput>
}
