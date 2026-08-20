import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  aliasFor,
  buildRuntimeProject,
  defaultDir,
  loadProjects,
  removeProject,
  resolveDir,
  saveProject,
} from '../src/workspace.js'
import { captureConsole, tempDir } from './helpers.js'

describe('aliasFor', () => {
  it('slugifies a project name', () => {
    assert.equal(aliasFor('User API'), 'user-api')
    assert.equal(aliasFor('Payments Mock'), 'payments-mock')
  })

  it('collapses runs of non-alphanumeric characters into a single dash', () => {
    assert.equal(aliasFor('Orders   &&&   Refunds'), 'orders-refunds')
    assert.equal(aliasFor('v1.2/api'), 'v1-2-api')
  })

  it('drops accents and symbols instead of transliterating them', () => {
    assert.equal(aliasFor('Café Münchén'), 'caf-m-nch-n')
    assert.equal(aliasFor('$$ Payments $$'), 'payments')
  })

  it('trims leading and trailing dashes', () => {
    assert.equal(aliasFor('  -Hello-  '), 'hello')
    assert.equal(aliasFor('---'), '')
  })

  it('returns an empty string for empty or missing names', () => {
    assert.equal(aliasFor(''), '')
    assert.equal(aliasFor(undefined), '')
    assert.equal(aliasFor(null), '')
  })
})

describe('resolveDir', () => {
  it('defaults to ~/.mockfly/projects', () => {
    assert.equal(defaultDir(), path.join(os.homedir(), '.mockfly', 'projects'))
    assert.equal(resolveDir(), defaultDir())
    assert.equal(resolveDir({}), defaultDir())
  })

  it('resolves --dir to an absolute path', () => {
    assert.equal(resolveDir({ dir: 'mocks' }), path.resolve('mocks'))
    assert.equal(resolveDir({ dir: '/tmp/mocks' }), '/tmp/mocks')
  })
})

describe('saveProject', () => {
  it('writes <slug>.json, creating the workspace directory', () => {
    const dir = path.join(tempDir(), 'nested', 'workspace')
    const file = saveProject(dir, { project: { name: 'User API', slug: 'aaaa-1111' }, endpoints: [] })

    assert.equal(file, path.join(dir, 'aaaa-1111.json'))
    const written = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(written.project.slug, 'aaaa-1111')
    assert.deepEqual(written.endpoints, [])
  })

  it('stamps pulledAt with an ISO timestamp', () => {
    const dir = tempDir()
    const before = Date.now()
    const file = saveProject(dir, { project: { name: 'X', slug: 'x' }, endpoints: [] })
    const { pulledAt } = JSON.parse(fs.readFileSync(file, 'utf8'))

    assert.match(pulledAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
    assert.ok(new Date(pulledAt).getTime() >= before - 1000)
  })

  it('overwrites a previous snapshot of the same project', () => {
    const dir = tempDir()
    saveProject(dir, { project: { name: 'X', slug: 'x' }, endpoints: [{ path: '/a' }] })
    const file = saveProject(dir, { project: { name: 'X', slug: 'x' }, endpoints: [] })

    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).endpoints, [])
    assert.deepEqual(fs.readdirSync(dir), ['x.json'])
  })
})

describe('buildRuntimeProject', () => {
  const payload = () => ({
    project: { name: 'User API', slug: 'aaaa-1111' },
    environment: { BASE_URL: 'https://x.dev' },
    pulledAt: '2026-07-09T10:00:00.000Z',
    endpoints: [
      { path: '/third', method: 'GET', position: 2, responses: [{ name: 'c' }] },
      { path: '/first', method: 'GET', position: 0, responses: [{ name: 'a' }] },
      { path: '/second', method: 'GET', position: 1, responses: [{ name: 'b' }] },
    ],
  })

  it('maps the export payload onto the runtime shape', () => {
    const project = buildRuntimeProject(payload(), '/w/aaaa-1111.json')

    assert.equal(project.name, 'User API')
    assert.equal(project.slug, 'aaaa-1111')
    assert.equal(project.alias, 'user-api')
    assert.deepEqual(project.environment, { BASE_URL: 'https://x.dev' })
    assert.equal(project.pulledAt, '2026-07-09T10:00:00.000Z')
    assert.equal(project.file, '/w/aaaa-1111.json')
  })

  it('sorts endpoints by position', () => {
    const project = buildRuntimeProject(payload(), 'f.json')
    assert.deepEqual(
      project.endpoints.map(e => e.path),
      ['/first', '/second', '/third']
    )
  })

  it('treats a missing position as 0', () => {
    const raw = payload()
    raw.endpoints = [{ path: '/positioned', position: 1, responses: [] }, { path: '/unpositioned', responses: [] }]
    const project = buildRuntimeProject(raw, 'f.json')

    assert.deepEqual(
      project.endpoints.map(e => e.path),
      ['/unpositioned', '/positioned']
    )
  })

  it('resolves defaultResponseIndex to the response object itself', () => {
    const raw = payload()
    raw.endpoints = [{ path: '/x', defaultResponseIndex: 1, responses: [{ name: 'a' }, { name: 'b' }] }]
    const [endpoint] = buildRuntimeProject(raw, 'f.json').endpoints

    assert.equal(endpoint.defaultResponse, endpoint.responses[1])
    assert.equal(endpoint.defaultResponse.name, 'b')
  })

  it('falls back to the first response when the index is missing or negative', () => {
    const raw = payload()
    raw.endpoints = [
      { path: '/none', responses: [{ name: 'a' }, { name: 'b' }] },
      { path: '/negative', defaultResponseIndex: -1, responses: [{ name: 'a' }, { name: 'b' }] },
      { path: '/notAnInt', defaultResponseIndex: 1.5, responses: [{ name: 'a' }, { name: 'b' }] },
      { path: '/null', defaultResponseIndex: null, responses: [{ name: 'a' }, { name: 'b' }] },
    ]

    for (const endpoint of buildRuntimeProject(raw, 'f.json').endpoints) {
      assert.equal(endpoint.defaultResponse, endpoint.responses[0], endpoint.path)
    }
  })

  it('leaves defaultResponse undefined when the index is out of range', () => {
    const raw = payload()
    raw.endpoints = [{ path: '/x', defaultResponseIndex: 7, responses: [{ name: 'a' }] }]
    const [endpoint] = buildRuntimeProject(raw, 'f.json').endpoints

    assert.equal(endpoint.defaultResponse, undefined)
  })

  it('clones endpoints and responses so the runtime never mutates the payload', () => {
    const raw = payload()
    const project = buildRuntimeProject(raw, 'f.json')
    const endpoint = project.endpoints.find(e => e.path === '/first')

    assert.notEqual(endpoint, raw.endpoints[1])
    assert.notEqual(endpoint.responses[0], raw.endpoints[1].responses[0])
    endpoint.responses[0].name = 'mutated'
    assert.equal(raw.endpoints[1].responses[0].name, 'a')
  })

  it('tolerates a payload without endpoints, responses or environment', () => {
    const project = buildRuntimeProject({ project: { name: 'Bare', slug: 'bare' } }, 'f.json')

    assert.deepEqual(project.endpoints, [])
    assert.deepEqual(project.environment, {})
    assert.equal(project.pulledAt, null)

    const [endpoint] = buildRuntimeProject(
      { project: { name: 'B', slug: 'b' }, endpoints: [{ path: '/x' }] },
      'f.json'
    ).endpoints
    assert.deepEqual(endpoint.responses, [])
    assert.equal(endpoint.defaultResponse, undefined)
  })

  it('falls back to exportedAt when pulledAt is absent', () => {
    const raw = payload()
    delete raw.pulledAt
    raw.exportedAt = '2026-01-01T00:00:00.000Z'

    assert.equal(buildRuntimeProject(raw, 'f.json').pulledAt, '2026-01-01T00:00:00.000Z')
  })
})

describe('loadProjects', () => {
  const write = (dir, name, content) =>
    fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content))

  it('returns an empty list when the workspace does not exist', () => {
    assert.deepEqual(loadProjects(path.join(tempDir(), 'missing')), [])
  })

  it('returns an empty list for an empty workspace', () => {
    assert.deepEqual(loadProjects(tempDir()), [])
  })

  it('loads every project snapshot in the directory', () => {
    const dir = tempDir()
    write(dir, 'a.json', { project: { name: 'A api', slug: 'a' }, endpoints: [] })
    write(dir, 'b.json', { project: { name: 'B api', slug: 'b' }, endpoints: [{ path: '/x', responses: [] }] })

    const projects = loadProjects(dir).sort((x, y) => x.slug.localeCompare(y.slug))
    assert.deepEqual(
      projects.map(p => p.alias),
      ['a-api', 'b-api']
    )
    assert.equal(projects[1].endpoints.length, 1)
    assert.equal(projects[0].file, path.join(dir, 'a.json'))
  })

  it('ignores files that are not .json', () => {
    const dir = tempDir()
    write(dir, 'notes.txt', 'hello')
    write(dir, 'a.json', { project: { name: 'A', slug: 'a' }, endpoints: [] })

    assert.equal(loadProjects(dir).length, 1)
  })

  it('skips invalid JSON and says so on stderr', () => {
    const dir = tempDir()
    write(dir, 'broken.json', '{ not json')
    write(dir, 'ok.json', { project: { name: 'Ok', slug: 'ok' }, endpoints: [] })

    const console_ = captureConsole()
    let projects
    try {
      projects = loadProjects(dir)
    } finally {
      console_.restore()
    }

    assert.deepEqual(
      projects.map(p => p.slug),
      ['ok']
    )
    assert.match(console_.stderr, /Skipping broken\.json: invalid JSON \(/)
  })

  it('skips json files that are not project snapshots', () => {
    const dir = tempDir()
    write(dir, 'no-slug.json', { project: { name: 'X' }, endpoints: [] })
    write(dir, 'no-project.json', { endpoints: [] })
    write(dir, 'no-endpoints.json', { project: { name: 'X', slug: 'x' } })
    write(dir, 'endpoints-not-array.json', { project: { name: 'X', slug: 'x' }, endpoints: {} })
    write(dir, 'null.json', 'null')

    const console_ = captureConsole()
    let projects
    try {
      projects = loadProjects(dir)
    } finally {
      console_.restore()
    }

    assert.deepEqual(projects, [])
    assert.equal(console_.err.length, 5)
    for (const line of console_.err) assert.match(line, /not a Mockfly project file$/)
  })
})

describe('removeProject', () => {
  const seed = () => {
    const dir = tempDir()
    fs.writeFileSync(
      path.join(dir, 'aaaa-1111.json'),
      JSON.stringify({ project: { name: 'User API', slug: 'aaaa-1111' }, endpoints: [] })
    )
    return dir
  }

  it('removes a project by slug and returns it', () => {
    const dir = seed()
    const removed = removeProject(dir, 'aaaa-1111')

    assert.equal(removed.name, 'User API')
    assert.equal(fs.existsSync(path.join(dir, 'aaaa-1111.json')), false)
  })

  it('removes a project by alias', () => {
    const dir = seed()
    const removed = removeProject(dir, 'user-api')

    assert.equal(removed.slug, 'aaaa-1111')
    assert.deepEqual(fs.readdirSync(dir), [])
  })

  it('returns null when nothing matches, leaving the workspace untouched', () => {
    const dir = seed()

    assert.equal(removeProject(dir, 'nope'), null)
    assert.deepEqual(fs.readdirSync(dir), ['aaaa-1111.json'])
  })

  it('returns null for an empty workspace', () => {
    assert.equal(removeProject(tempDir(), 'anything'), null)
  })
})
