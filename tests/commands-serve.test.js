import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import fs from 'fs'
import { createServer } from 'net'
import path from 'path'
import { serve } from '../src/commands/serve.js'
import { ProcessExited, captureConsole, freePort, stubExit, tempDir } from './helpers.js'

const DAY = 24 * 60 * 60 * 1000

const snapshot = ({ name, slug, endpoints = [], pulledAt }) => ({
  project: { name, slug },
  pulledAt,
  endpoints,
})

let console_
let exit
let dir
const closables = []

const seed = payload => fs.writeFileSync(path.join(dir, `${payload.project.slug}.json`), JSON.stringify(payload))

const closed = server =>
  new Promise(resolve => {
    if (!server?.listening) return resolve()
    server.close(resolve)
  })

beforeEach(() => {
  dir = tempDir('mockfly-workspace-')
  console_ = captureConsole()
  exit = stubExit()
})

afterEach(async () => {
  while (closables.length) await closed(closables.pop())
  exit.restore()
  console_.restore()
})

describe('serve', () => {
  it('exits when there is nothing to serve', () => {
    assert.throws(() => serve({ dir, port: '4321' }), ProcessExited)

    assert.deepEqual(console_.err, [
      `✖ No projects found in ${dir}. Run \`mockfly pull\` while online, then \`mockfly serve\` works offline.`,
    ])
    assert.deepEqual(exit.codes, [1])
  })

  it('listens on the given port and prints one line per project url', async () => {
    seed(
      snapshot({
        name: 'User API',
        slug: 'aaaa-1111',
        endpoints: [{ path: '/users' }],
        pulledAt: new Date(Date.now() - 60 * 1000).toISOString(),
      })
    )
    const port = await freePort()

    const server = serve({ dir, port: String(port) })
    closables.push(server)
    await new Promise(resolve => server.once('listening', resolve))

    assert.equal(server.address().port, port)
    assert.match(console_.stdout, new RegExp(`Mockfly serving 1 project on http://localhost:${port}`))
    assert.match(console_.stdout, new RegExp(`User API\\s+http://localhost:${port}/user-api \\(pulled 1m ago\\)`))
    assert.match(console_.stdout, new RegExp(`http://localhost:${port}/aaaa-1111 — 1 endpoints`))
    assert.match(console_.stdout, /Requests:/)

    const res = await fetch(`http://localhost:${port}/`)
    assert.equal((await res.json()).projects.length, 1)
  })

  it('pluralises the project count', async () => {
    seed(snapshot({ name: 'User API', slug: 'aaaa-1111' }))
    seed(snapshot({ name: 'Payments Mock', slug: 'bbbb-2222' }))
    const port = await freePort()

    const server = serve({ dir, port: String(port) })
    closables.push(server)
    await new Promise(resolve => server.once('listening', resolve))

    assert.match(console_.stdout, /Mockfly serving 2 projects on/)
  })

  it('nudges you to re-pull a snapshot that is a week old or more', async () => {
    seed(snapshot({ name: 'Stale API', slug: 'stale', pulledAt: new Date(Date.now() - 7 * DAY).toISOString() }))
    seed(snapshot({ name: 'Fresh API', slug: 'fresh', pulledAt: new Date(Date.now() - 6 * DAY).toISOString() }))
    const port = await freePort()

    const server = serve({ dir, port: String(port) })
    closables.push(server)
    await new Promise(resolve => server.once('listening', resolve))

    assert.match(console_.stdout, /\(pulled 7d ago — consider re-pulling\)/)
    assert.match(console_.stdout, /\(pulled 6d ago\)/)
    assert.equal(console_.stdout.includes('6d ago — consider'), false)
  })

  // `Number(options.port) || 4000` means an unusable --port silently falls back to
  // the default, which is what this pins — by occupying 4000 first, so the run
  // never leaves a listener behind on a well-known port.
  it('falls back to port 4000 and reports the port already in use', async () => {
    seed(snapshot({ name: 'User API', slug: 'aaaa-1111' }))

    const squatter = createServer()
    const occupied = await new Promise(resolve => {
      squatter.once('error', () => resolve(false)) // someone else already has 4000
      squatter.listen(4000, () => resolve(true))
    })
    if (occupied) closables.push(squatter)

    // fail() is reached from the 'error' event handler, where a throw would escape
    // as an uncaught exception, so process.exit only records here.
    exit.restore()
    exit = stubExit({ throwOnExit: false })

    const server = serve({ dir })
    closables.push(server)
    await new Promise(resolve => server.once('error', resolve))

    assert.equal(console_.err[0], '✖ Port 4000 is already in use. Try `mockfly serve --port 4001`.')
    assert.equal(exit.codes[0], 1)
  })
})
