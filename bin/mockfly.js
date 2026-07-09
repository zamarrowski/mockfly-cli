#!/usr/bin/env node
import { readFileSync } from 'fs'
import { Command } from 'commander'
import { login, logout, whoami } from '../src/commands/login.js'
import { pull } from '../src/commands/pull.js'
import { list, rm } from '../src/commands/list.js'
import { serve } from '../src/commands/serve.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const program = new Command()

program
  .name('mockfly')
  .description('Serve your Mockfly mock APIs locally, offline. Pull once while online, mock without internet.')
  .version(pkg.version)

program
  .command('login')
  .description('Save your Mockfly API key (create one in the dashboard)')
  .option('-k, --key <key>', 'API key (mf_...)')
  .option('--api <url>', 'API base url (defaults to the Mockfly cloud)')
  .action(login)

program.command('logout').description('Remove the saved API key').action(logout)

program.command('whoami').description('Show the active API key and API url').action(whoami)

program
  .command('pull')
  .description('Download your projects as local JSON files (all of them, or just the given ones)')
  .argument('[projects...]', 'project slugs or names to pull (default: all)')
  .option('-d, --dir <dir>', 'workspace directory', 'mockfly')
  .option('-k, --key <key>', 'API key override')
  .option('--api <url>', 'API base url override')
  .action(pull)

program
  .command('serve')
  .description('Serve every pulled project locally — works fully offline')
  .option('-p, --port <port>', 'port to listen on', '4000')
  .option('-d, --dir <dir>', 'workspace directory', 'mockfly')
  .action(serve)

program
  .command('list')
  .description('List the projects pulled into the local workspace')
  .option('-d, --dir <dir>', 'workspace directory', 'mockfly')
  .action(list)

program
  .command('rm')
  .description('Remove a pulled project from the local workspace')
  .argument('<project>', 'project slug or name')
  .option('-d, --dir <dir>', 'workspace directory', 'mockfly')
  .action(rm)

program.parse()
