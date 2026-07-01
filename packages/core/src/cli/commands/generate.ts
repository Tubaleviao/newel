import { loadSchema, loadConfig } from '../loader'
import { runGenerators } from '../../runner/runner'
import * as path from 'path'

export async function generateCommand(configPath: string): Promise<void> {
  try {
    const config = await loadConfig(configPath)
    const fabricPath = path.resolve(path.dirname(configPath), config.schema)
    const schema = await loadSchema(fabricPath)

    console.log(`Generating from ${schema.meta.name}...`)
    const result = await runGenerators(schema, config.generators, {
      outputDir: path.resolve(path.dirname(configPath), config.output),
    })

    const fileCount = result.manifest.files.length
    console.log(`✓ Generated ${fileCount} file(s)`)
    for (const entry of result.manifest.files) {
      console.log(`  ${entry.path}  [${entry.generator}]`)
    }
  } catch (err) {
    console.error(`✗ Generation failed: ${(err as Error).message}`)
    process.exit(1)
  }
}
