#!/usr/bin/env node
import { Command } from 'commander'
import { validateCommand } from './commands/validate'
import { inspectCommand } from './commands/inspect'
import { generateCommand } from './commands/generate'
import { checkDriftCommand } from './commands/check-drift'

const program = new Command()

program
  .name('quoin')
  .description('Generate all application artifacts from a single fabric.ts source of truth')
  .version('0.0.1')

program
  .command('validate')
  .description('Check for errors in fabric.js without writing files')
  .option('-s, --schema <path>', 'path to fabric.js', './src/fabric.js')
  .action((opts: { schema: string }) => validateCommand(opts.schema))

program
  .command('inspect')
  .description('Print the resolved IR as JSON')
  .option('-s, --schema <path>', 'path to fabric.js', './src/fabric.js')
  .action((opts: { schema: string }) => inspectCommand(opts.schema))

program
  .command('generate')
  .description('Run all generators in dependency order')
  .option('-c, --config <path>', 'path to quoin.config.ts', './quoin.config.ts')
  .action((opts: { config: string }) => generateCommand(opts.config))

program
  .command('check-drift')
  .description('Detect if any generated file was manually edited')
  .option('-c, --config <path>', 'path to quoin.config.ts', './quoin.config.ts')
  .action((opts: { config: string }) => checkDriftCommand(opts.config))

program.parse()
