import { defineConfig } from '@quoin/core'
import { TypeScriptGenerator } from '@quoin/generator-typescript'

export default defineConfig({
  schema: './fabric.ts',
  output: './src/generated',
  generators: [
    new TypeScriptGenerator(),
  ],
})
