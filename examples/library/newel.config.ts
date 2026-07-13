import { defineConfig } from '@newel/core'
import { TypeScriptGenerator } from '@newel/generator-typescript'
import { OpenApiGenerator } from '@newel/generator-openapi'
import { SqlGenerator } from '@newel/generator-sql'
import { DocsGenerator } from '@newel/generator-docs'
import { UiGenerator } from '@newel/generator-ui'
import { PrismaGenerator } from '@newel/generator-prisma'
import { ExpressGenerator } from '@newel/generator-express'
import { AppGenerator } from '@newel/generator-app'

export default defineConfig({
  schema: './src/fabric.ts',
  output: './src/generated',
  patches: './src/fabric.patches.ts',
  generators: [
    new TypeScriptGenerator(),
    new OpenApiGenerator(),
    new SqlGenerator(),
    new DocsGenerator(),
    new UiGenerator(),
    new PrismaGenerator(),
    new ExpressGenerator({ orm: 'prisma' }),
    new AppGenerator(),
  ],
})
