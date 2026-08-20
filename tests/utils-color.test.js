import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// `useColor` is resolved when src/utils.js is first evaluated, so the TTY branch
// needs the environment set up before the import — hence the dynamic import and
// a file of its own (each test file gets its own process).
process.stdout.isTTY = true
delete process.env.NO_COLOR
const { bold, cyan, dim, green, red, statusColor, yellow } = await import('../src/utils.js')

const ESC = '\u001b'

describe('colour wrappers (TTY, colours on)', () => {
  it('wraps the string in the ANSI codes of each colour', () => {
    assert.equal(bold('hi'), `${ESC}[1mhi${ESC}[22m`)
    assert.equal(dim('hi'), `${ESC}[2mhi${ESC}[22m`)
    assert.equal(green('hi'), `${ESC}[32mhi${ESC}[39m`)
    assert.equal(yellow('hi'), `${ESC}[33mhi${ESC}[39m`)
    assert.equal(red('hi'), `${ESC}[31mhi${ESC}[39m`)
    assert.equal(cyan('hi'), `${ESC}[36mhi${ESC}[39m`)
  })

  it('colours statuses through the same wrappers', () => {
    assert.equal(statusColor(500)(500), `${ESC}[31m500${ESC}[39m`)
    assert.equal(statusColor(200)(200), `${ESC}[32m200${ESC}[39m`)
  })
})
