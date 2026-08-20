import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/server.js'
import { buildRuntimeProject } from '../src/workspace.js'

const projectPayload = {
  schemaVersion: 1,
  exportedAt: '2026-07-09T10:00:00.000Z',
  project: { name: 'User API', slug: 'aaaa-1111' },
  environment: { BASE_URL: 'https://prod.example.com' },
  endpoints: [
    {
      path: '/users/:id',
      method: 'GET',
      delay: 0,
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      position: 0,
      returnRandomResponse: false,
      defaultResponseIndex: 0,
      responses: [
        {
          name: 'Success',
          status: 200,
          body: { id: '{{:id}}', profile: '{{env.BASE_URL}}/users/{{:id}}', page: '{{searchParam.page}}' },
          isEnabled: true,
          rules: [],
        },
        {
          name: 'Not found',
          status: 404,
          body: { error: 'not found' },
          isEnabled: true,
          rules: [{ source: 'urlParam', property: 'id', comparator: 'equal', value: '999' }],
        },
      ],
    },
    {
      path: '/users',
      method: 'POST',
      delay: 0,
      headers: [],
      position: 1,
      returnRandomResponse: false,
      defaultResponseIndex: 0,
      responses: [
        {
          name: 'Created',
          status: 201,
          body: { name: '{{body.name}}', email: '{{internet.email}}' },
          isEnabled: true,
          rules: [],
        },
      ],
    },
  ],
}

const secondProjectPayload = {
  schemaVersion: 1,
  project: { name: 'Payments Mock', slug: 'bbbb-2222' },
  environment: {},
  endpoints: [
    {
      path: '/charges',
      method: 'GET',
      delay: 0,
      headers: [],
      position: 0,
      defaultResponseIndex: 0,
      responses: [{ name: 'OK', status: 200, body: { charges: [] }, isEnabled: true, rules: [] }],
    },
  ],
}

describe('serve (offline mock server)', () => {
  let server
  let base

  before(async () => {
    const projects = [
      buildRuntimeProject(projectPayload, 'a.json'),
      buildRuntimeProject(secondProjectPayload, 'b.json'),
    ]
    const app = createApp(projects, { quiet: true })
    server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    base = `http://localhost:${server.address().port}`
  })

  after(() => server.close())

  it('serves the default response with url params, env vars and search params replaced', async () => {
    const res = await fetch(`${base}/aaaa-1111/users/5?page=2`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { id: '5', profile: 'https://prod.example.com/users/5', page: '2' })
  })

  it('selects a response by rule', async () => {
    const res = await fetch(`${base}/aaaa-1111/users/999`)
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'not found' })
  })

  it('replaces request body values and faker expressions', async () => {
    const res = await fetch(`${base}/aaaa-1111/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' }),
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.equal(body.name, 'Ada')
    assert.ok(body.email.includes('@'))
  })

  it('does not leak faker mutations between requests', async () => {
    const first = await (
      await fetch(`${base}/aaaa-1111/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'A' }),
      })
    ).json()
    const second = await (
      await fetch(`${base}/aaaa-1111/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'B' }),
      })
    ).json()
    assert.equal(second.name, 'B')
    assert.notEqual(second.email, first.email)
  })

  it('serves a second project under its own slug', async () => {
    const res = await fetch(`${base}/bbbb-2222/charges`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { charges: [] })
  })

  it('serves projects under their name alias too', async () => {
    const res = await fetch(`${base}/payments-mock/charges`)
    assert.equal(res.status, 200)
  })

  it('returns 404 for unknown endpoints of a known project', async () => {
    const res = await fetch(`${base}/aaaa-1111/nope`)
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.match(body.error, /Endpoint not found/)
  })

  it('returns 404 for unknown projects', async () => {
    const res = await fetch(`${base}/unknown-project/users/1`)
    assert.equal(res.status, 404)
  })

  it('lists the served projects at the root', async () => {
    const res = await fetch(`${base}/`)
    const body = await res.json()
    assert.equal(body.projects.length, 2)
  })

  it('answers OPTIONS preflight with 204 and CORS headers', async () => {
    const res = await fetch(`${base}/aaaa-1111/whatever`, { method: 'OPTIONS' })
    assert.equal(res.status, 204)
    assert.ok(res.headers.get('access-control-allow-origin'))
  })
})
