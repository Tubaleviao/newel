import { loadConfig } from '../loader'
import { checkDrift } from '../../runner/drift'
import * as path from 'path'

export async function checkDriftCommand(configPath: string): Promise<void> {
  try {
    const config = await loadConfig(configPath)
    const outputDir = path.resolve(path.dirname(configPath), config.output)
    const result = checkDrift(outputDir)

    if (result.drifted.length === 0 && result.missing.length === 0) {
      console.log(`✓ No drift detected (${result.ok.length} file(s) match manifest)`)
      return
    }

    if (result.drifted.length > 0) {
      console.error(`✗ Manually edited files detected:`)
      for (const f of result.drifted) console.error(`  ✎ ${f}`)
    }
    if (result.missing.length > 0) {
      console.error(`✗ Missing generated files:`)
      for (const f of result.missing) console.error(`  ✗ ${f}`)
    }

    process.exit(1)
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`)
    process.exit(1)
  }
}
