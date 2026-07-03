const { defineConfig } = require('@quoin/core')
const { TypeScriptGenerator } = require('@quoin/generator-typescript')

module.exports = defineConfig({
  schema: './fabric.js',
  output: './src/generated',
  generators: [
    new TypeScriptGenerator(),
  ],
})
