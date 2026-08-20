import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import fs from 'fs'
import path from 'path'
import { ProcessExited, captureConsole, jsonResponse, stubExit, stubFetch, tempDir, useTempHome } from './helpers.js'

// src/commands/pull.js pulls in src/config.js, which pins ~/.mockfly at import time.
const home = useTempHome()
const { pull } = await import('../src/commands/pull.js')

const PROJECTS = [
  { _id: 'id-users', slug: 'aaaa-1111', name: 'User API' },
  { _id: 'id-payments', slug: 'bbbb-2222', name: 'Payments Mock' },
]

const exportFor = id => ({
  schemaVersion: 1,
  exportedAt: '2026-07-09T10:00:00.000Z',
  project:
    id === 'id-users'
      ? { name: 'User API', slug: 'aaaa-1111' }
      : { name: 'Payments Mock', slug: 'bbbb-2222' },
  environment: id === 'id-users' ? { BASE_URL: 'https://prod.example.com' } : {},
  endpoints: id === 'id-users' ? [{ path: '/users', method: 'GET', responses: [] }] : [],
})

// Answers /public/projects with `projects` and every export with `exportFor`,
// unless the id is listed in `failing`.
const stubApi = ({ projects = PROJECTS, failing = [] } = {}) =>
  stubFetch(async url => {
    if (url.endsWith('/public/projects')) return jsonResponse({ results: projects })

    const id = url.match(/\/public\/projects\/(.+)\/export$/)[1]
    if (failing.includes(id)) return jsonResponse({ error: 'export failed' }, { status: 500 })
    return jsonResponse(exportFor(id))
  })

let console_
let exit
let fetchStub
let dir

beforeEach(() => {
  dir = tempDir('mockfly-workspace-')
  delete process.env.MOCKFLY_API_KEY
  delete process.env.MOCKFLY_API_URL
  console_ = captureConsole()
  exit = stubExit()
})

afterEach(() => {
  fetchStub?.restore()
  exit.restore()
  console_.restore()
  fetchStub = undefined
})

describe('pull', () => {
  it('pulls every project when no name is given', async () => {
    fetchStub = stubApi()

    await pull([], { dir, key: 'mf_x' })

    assert.deepEqual(fs.readdirSync(dir).sort(), ['aaaa-1111.json', 'bbbb-2222.json'])
    assert.equal(console_.out[0], `Pulling 2 projects into ${dir}`)
    assert.match(console_.stdout, /✔ User API — 1 endpoint → aaaa-1111\.json/)
    assert.match(console_.stdout, /✔ Payments Mock — 0 endpoints → bbbb-2222\.json/)
    assert.match(console_.stdout, /Run `mockfly serve` to mock these APIs offline\./)
  })

  it('writes the export payload plus a pulledAt stamp', async () => {
    fetchStub = stubApi()

    await pull(['aaaa-1111'], { dir, key: 'mf_x' })

    const written = JSON.parse(fs.readFileSync(path.join(dir, 'aaaa-1111.json'), 'utf8'))
    assert.equal(written.schemaVersion, 1)
    assert.equal(written.exportedAt, '2026-07-09T10:00:00.000Z')
    assert.deepEqual(written.project, { name: 'User API', slug: 'aaaa-1111' })
    assert.deepEqual(written.environment, { BASE_URL: 'https://prod.example.com' })
    assert.deepEqual(written.endpoints, [{ path: '/users', method: 'GET', responses: [] }])
    assert.match(written.pulledAt, /^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles an export payload without endpoints or environment', async () => {
    fetchStub = stubFetch(async url => {
      if (url.endsWith('/public/projects')) return jsonResponse({ results: [PROJECTS[0]] })
      return jsonResponse({ project: { name: 'User API', slug: 'aaaa-1111' } })
    })

    await pull([], { dir, key: 'mf_x' })

    assert.match(console_.stdout, /✔ User API — 0 endpoints → aaaa-1111\.json/)
    assert.equal(console_.stdout.includes('environment variables'), false)
    assert.deepEqual(fs.readdirSync(dir), ['aaaa-1111.json'])
  })

  it('sends the API key resolved from the flag', async () => {
    fetchStub = stubApi()

    await pull([], { dir, key: 'mf_flag_key' })

    for (const call of fetchStub.calls) assert.equal(call.options.headers.authorization, 'mf_flag_key')
  })

  it('picks projects by slug and by name alias', async () => {
    fetchStub = stubApi()

    await pull(['payments-mock'], { dir, key: 'mf_x' })
    assert.deepEqual(fs.readdirSync(dir), ['bbbb-2222.json'])

    await pull(['aaaa-1111'], { dir, key: 'mf_x' })
    assert.deepEqual(fs.readdirSync(dir).sort(), ['aaaa-1111.json', 'bbbb-2222.json'])
    assert.match(console_.stdout, /Pulling 1 project into/)
  })

  it('warns about an unknown name and pulls the rest', async () => {
    fetchStub = stubApi()

    await pull(['nope', 'user-api'], { dir, key: 'mf_x' })

    assert.match(console_.stdout, /⚠ No project matches 'nope' — available: user-api, payments-mock/)
    assert.deepEqual(fs.readdirSync(dir), ['aaaa-1111.json'])
  })

  it('exits when none of the given names match', async () => {
    fetchStub = stubApi()

    await assert.rejects(pull(['nope', 'also-nope'], { dir, key: 'mf_x' }), ProcessExited)

    assert.deepEqual(fs.readdirSync(dir), [])
    assert.deepEqual(console_.err, ['✖ Nothing to pull.'])
    assert.deepEqual(exit.codes, [1])
  })

  it('reports a failing export and keeps going with the others', async () => {
    fetchStub = stubApi({ failing: ['id-users'] })

    await pull([], { dir, key: 'mf_x' })

    assert.match(console_.stdout, /⚠ User API: API error 500: export failed/)
    assert.deepEqual(fs.readdirSync(dir), ['bbbb-2222.json'])
  })

  it('exits without a key', async () => {
    fetchStub = stubApi()

    await assert.rejects(pull([], { dir }), ProcessExited)

    assert.deepEqual(console_.err, [
      '✖ No API key found. Run `mockfly login` first (or pass --key / set MOCKFLY_API_KEY).',
    ])
    assert.equal(fetchStub.calls.length, 0)
  })

  it('picks the key up from MOCKFLY_API_KEY', async () => {
    process.env.MOCKFLY_API_KEY = 'mf_env_key'
    fetchStub = stubApi()

    await pull([], { dir })

    assert.equal(fetchStub.calls[0].options.headers.authorization, 'mf_env_key')
  })

  it('exits when the project list cannot be fetched', async () => {
    fetchStub = stubFetch(async () => {
      throw new TypeError('fetch failed')
    })

    await assert.rejects(pull([], { dir, key: 'mf_x' }), ProcessExited)

    assert.match(console_.stderr, /Could not reach https:\/\/api\.mockfly\.dev — are you online\?/)
  })

  it('exits when the account has no projects', async () => {
    fetchStub = stubApi({ projects: [] })

    await assert.rejects(pull([], { dir, key: 'mf_x' }), ProcessExited)

    assert.deepEqual(console_.err, ['✖ Your account has no projects yet. Create one in the Mockfly dashboard.'])
  })

  it('warns about environment variables when pulling into a custom directory', async () => {
    fetchStub = stubApi()

    await pull(['user-api'], { dir, key: 'mf_x' })

    assert.match(console_.stdout, /⚠ These files include your project environment variables\./)
    assert.match(console_.stdout, /keep the workspace out of version control/)
  })

  it('stays quiet when the pulled projects have no environment variables', async () => {
    fetchStub = stubApi()

    await pull(['payments-mock'], { dir, key: 'mf_x' })

    assert.equal(console_.stdout.includes('environment variables'), false)
  })

  it('stays quiet about environment variables when using the default workspace', async () => {
    fetchStub = stubApi()

    await pull(['user-api'], { key: 'mf_x' })

    const defaultDir = path.join(home, '.mockfly', 'projects')
    assert.deepEqual(fs.readdirSync(defaultDir), ['aaaa-1111.json'])
    assert.equal(console_.stdout.includes('environment variables'), false)
  })
})
