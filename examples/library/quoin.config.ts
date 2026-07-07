import { defineConfig } from '@quoin/core'
import { TypeScriptGenerator } from '@quoin/generator-typescript'
import { OpenApiGenerator } from '@quoin/generator-openapi'
import { SqlGenerator } from '@quoin/generator-sql'

export default defineConfig({
  schema: './fabric.ts',
  output: './src/generated',
  generators: [
    new TypeScriptGenerator(),
    new OpenApiGenerator(),
    new SqlGenerator(),
  ],
})
