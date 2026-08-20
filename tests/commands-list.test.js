import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import fs from 'fs'
import path from 'path'
import { list, rm } from '../src/commands/list.js'
import { ProcessExited, captureConsole, stubExit, tempDir } from './helpers.js'

const snapshot = ({ name, slug, endpoints = [], pulledAt }) => ({
  project: { name, slug },
  pulledAt,
  endpoints,
})

let console_
let exit
let dir

const seed = payload => fs.writeFileSync(path.join(dir, `${payload.project.slug}.json`), JSON.stringify(payload))

beforeEach(() => {
  dir = tempDir('mockfly-workspace-')
  console_ = captureConsole()
  exit = stubExit()
})

afterEach(() => {
  exit.restore()
  console_.restore()
})

describe('list', () => {
  it('points at `mockfly pull` when the workspace is empty', () => {
    list({ dir })

    assert.deepEqual(console_.out, [`No projects in ${dir}. Run \`mockfly pull\` first.`])
  })

  it('points at `mockfly pull` when the workspace does not exist', () => {
    const missing = path.join(dir, 'missing')

    list({ dir: missing })

    assert.deepEqual(console_.out, [`No projects in ${missing}. Run \`mockfly pull\` first.`])
  })

  it('prints one block per project with alias, endpoint count, age and slug', () => {
    seed(
      snapshot({
        name: 'User API',
        slug: 'aaaa-1111',
        endpoints: [{ path: '/users' }, { path: '/users/:id' }],
        pulledAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      })
    )

    list({ dir })

    assert.deepEqual(console_.out, ['User API (user-api) — 2 endpoints, pulled 2h ago', '  slug: aaaa-1111'])
  })

  it('says "unknown" when the snapshot has no timestamp', () => {
    seed(snapshot({ name: 'Bare', slug: 'bare' }))

    list({ dir })

    assert.equal(console_.out[0], 'Bare (bare) — 0 endpoints, pulled unknown')
  })

  it('lists every project in the workspace', () => {
    seed(snapshot({ name: 'User API', slug: 'aaaa-1111' }))
    seed(snapshot({ name: 'Payments Mock', slug: 'bbbb-2222' }))

    list({ dir })

    assert.equal(console_.out.length, 4)
    assert.match(console_.stdout, /User API \(user-api\)/)
    assert.match(console_.stdout, /Payments Mock \(payments-mock\)/)
  })
})

describe('rm', () => {
  it('removes a project by slug', () => {
    seed(snapshot({ name: 'User API', slug: 'aaaa-1111' }))

    rm('aaaa-1111', { dir })

    assert.deepEqual(console_.out, ['✔ Removed User API (aaaa-1111)'])
    assert.deepEqual(fs.readdirSync(dir), [])
  })

  it('removes a project by alias', () => {
    seed(snapshot({ name: 'User API', slug: 'aaaa-1111' }))

    rm('user-api', { dir })

    assert.deepEqual(console_.out, ['✔ Removed User API (aaaa-1111)'])
    assert.deepEqual(fs.readdirSync(dir), [])
  })

  it('exits when nothing matches', () => {
    seed(snapshot({ name: 'User API', slug: 'aaaa-1111' }))

    assert.throws(() => rm('nope', { dir }), ProcessExited)

    assert.deepEqual(console_.err, ["✖ No local project matches 'nope'. Run `mockfly list` to see what is pulled."])
    assert.deepEqual(exit.codes, [1])
    assert.deepEqual(fs.readdirSync(dir), ['aaaa-1111.json'])
  })

  it('exits on an empty workspace', () => {
    assert.throws(() => rm('anything', { dir }), ProcessExited)

    assert.match(console_.stderr, /No local project matches 'anything'/)
  })
})
