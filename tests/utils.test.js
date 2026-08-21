import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bold, cyan, dim, fail, green, red, statusColor, timeAgo, yellow } from '../src/utils.js'
import { ProcessExited, captureConsole, stubExit } from './helpers.js'

// This file runs with a piped stdout (isTTY undefined), which is the no-colour
// branch of `useColor`. tests/utils-color.test.js covers the TTY branch: the
// value is resolved at import time, so it takes a separate process.
describe('colour wrappers (no TTY)', () => {
  it('returns the plain string when colours are off', () => {
    assert.equal(bold('hi'), 'hi')
    assert.equal(dim('hi'), 'hi')
    assert.equal(green('hi'), 'hi')
    assert.equal(yellow('hi'), 'hi')
    assert.equal(red('hi'), 'hi')
    assert.equal(cyan('hi'), 'hi')
  })

  it('stringifies non-string input', () => {
    assert.equal(green(200), '200')
  })
})

describe('timeAgo', () => {
  const ago = ms => new Date(Date.now() - ms).toISOString()
  const SECOND = 1000
  const MINUTE = 60 * SECOND
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR

  it('returns "unknown" without a timestamp', () => {
    assert.equal(timeAgo(undefined), 'unknown')
    assert.equal(timeAgo(null), 'unknown')
    assert.equal(timeAgo(''), 'unknown')
  })

  it('reports anything under a minute as "just now"', () => {
    assert.equal(timeAgo(ago(0)), 'just now')
    assert.equal(timeAgo(ago(59 * SECOND)), 'just now')
  })

  it('clamps timestamps in the future to "just now"', () => {
    assert.equal(timeAgo(new Date(Date.now() + DAY).toISOString()), 'just now')
  })

  it('switches to minutes at 60 seconds', () => {
    assert.equal(timeAgo(ago(60 * SECOND)), '1m ago')
    assert.equal(timeAgo(ago(59 * MINUTE)), '59m ago')
  })

  it('switches to hours at 60 minutes', () => {
    assert.equal(timeAgo(ago(HOUR)), '1h ago')
    assert.equal(timeAgo(ago(23 * HOUR)), '23h ago')
  })

  it('switches to days at 24 hours', () => {
    assert.equal(timeAgo(ago(DAY)), '1d ago')
    assert.equal(timeAgo(ago(8 * DAY)), '8d ago')
  })

  it('returns "unknown" for an unparseable timestamp', () => {
    assert.equal(timeAgo('not a date'), 'unknown')
    assert.equal(timeAgo('2024-13-45T99:99:99Z'), 'unknown')
  })
})

describe('statusColor', () => {
  it('maps each status range to its colour', () => {
    assert.equal(statusColor(500), red)
    assert.equal(statusColor(503), red)
    assert.equal(statusColor(400), yellow)
    assert.equal(statusColor(404), yellow)
    assert.equal(statusColor(499), yellow)
    assert.equal(statusColor(300), cyan)
    assert.equal(statusColor(301), cyan)
    assert.equal(statusColor(200), green)
    assert.equal(statusColor(204), green)
    assert.equal(statusColor(0), green)
  })
})

describe('fail', () => {
  it('writes the message to stderr and exits 1', () => {
    const console_ = captureConsole()
    const exit = stubExit()

    try {
      assert.throws(() => fail('boom'), ProcessExited)
    } finally {
      exit.restore()
      console_.restore()
    }

    assert.deepEqual(console_.err, ['✖ boom'])
    assert.deepEqual(exit.codes, [1])
    assert.deepEqual(console_.out, [])
  })
})
