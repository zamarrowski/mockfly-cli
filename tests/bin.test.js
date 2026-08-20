import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execFile } from 'child_process'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { promisify } from 'util'
import { tempDir } from './helpers.js'

const run = promisify(execFile)

const BIN = fileURLToPath(new URL('../bin/mockfly.js', import.meta.url))
const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// The commander wiring only runs as a subprocess, and V8 coverage from a child is
// deliberately kept out of the report (NODE_V8_COVERAGE is dropped) so the numbers
// only ever reflect what the in-process tests actually reach. This file is here to
// prove the published binary starts, nothing more.
const env = { ...process.env }
delete env.NODE_V8_COVERAGE

const mockfly = args => run(process.execPath, [BIN, ...args], { env })

describe('bin/mockfly.js', () => {
  it('prints the package version', async () => {
    const { stdout } = await mockfly(['--version'])

    assert.equal(stdout.trim(), PKG.version)
  })

  it('lists every command in the help output', async () => {
    const { stdout } = await mockfly(['--help'])

    assert.match(stdout, /Usage: mockfly \[options\] \[command\]/)
    for (const command of ['login', 'logout', 'whoami', 'pull', 'serve', 'list', 'rm']) {
      assert.match(stdout, new RegExp(`^\\s{2}${command}\\b`, 'm'))
    }
  })

  it('exits 1 on an unknown command', async () => {
    const error = await mockfly(['nope']).then(
      () => null,
      e => e
    )

    assert.ok(error, 'expected the command to fail')
    assert.equal(error.code, 1)
    assert.match(error.stderr, /unknown command 'nope'/)
  })

  it('runs a command end to end', async () => {
    const { stdout } = await mockfly(['list', '--dir', tempDir('mockfly-workspace-')])

    assert.match(stdout, /Run `mockfly pull` first\./)
  })
})
