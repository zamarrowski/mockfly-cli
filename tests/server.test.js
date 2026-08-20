import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/server.js'
import { buildRuntimeProject } from '../src/workspace.js'
import { captureConsole } from './helpers.js'

const contentType = value => [{ key: 'Content-Type', value }]

const endpoint = (path, method, headers, responses, extra = {}) => ({
  path,
  method,
  delay: 0,
  headers,
  responses,
  defaultResponseIndex: 0,
  ...extra,
})

// One project holding an endpoint per content type and per failure mode, so every
// branch of handleMockRequest is reachable over HTTP.
const payload = {
  project: { name: 'Edge Cases', slug: 'cccc-3333' },
  environment: {},
  endpoints: [
    endpoint('/soap', 'POST', contentType('text/xml'), [
      { name: 'Soap', status: 200, body: '<r>{{XPath //m:Item/text()}}</r>' },
    ]),
    endpoint('/report.pdf', 'GET', contentType('application/pdf'), [{ name: 'Pdf', status: 200, body: 'ignored' }]),
    endpoint('/report.csv', 'GET', contentType('text/csv'), [{ name: 'Csv', status: 200, body: 'ignored' }]),
    endpoint('/plain', 'GET', contentType('text/plain'), [{ name: 'Plain', status: 200, body: 'just text' }]),
    endpoint(
      '/proxied',
      'GET',
      contentType('application/json'),
      [{ name: 'Proxied', status: 200, body: { ok: true } }],
      { proxyConfiguration: 'useProxy' }
    ),
    endpoint('/slow', 'GET', contentType('application/json'), [{ name: 'Slow', status: 200, body: { ok: true } }], {
      delay: 20,
    }),
    endpoint('/no-response', 'GET', contentType('application/json'), []),
    endpoint('/statusless', 'GET', contentType('application/json'), [{ name: 'Statusless' }]),
    endpoint('/echo', 'POST', contentType('application/json'), [
      { name: 'Echo', status: 200, body: { in: '{{body.v}}' } },
    ]),
    // An endpoint path that is not a valid regexp: matchPath throws, which is the
    // only way into handleMockRequest's catch.
    endpoint('/broken([', 'GET', contentType('application/json'), [{ name: 'Never', status: 200, body: {} }]),
    endpoint('/broken([', 'OPTIONS', contentType('application/json'), [{ name: 'Never', status: 200, body: {} }]),
  ],
}

const soapBody = [
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="urn:mockfly">',
  '<soap:Body><m:Item>42</m:Item></soap:Body>',
  '</soap:Envelope>',
].join('')

describe('server (non-JSON responses, logging and error paths)', () => {
  let server
  let base
  let console_

  before(async () => {
    // quiet: false so the request log itself is exercised; the output is captured
    // for the whole suite and asserted where it matters.
    const app = createApp([buildRuntimeProject(payload, 'c.json')], { quiet: false })
    server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    base = `http://localhost:${server.address().port}`
    console_ = captureConsole()
  })

  after(() => {
    console_.restore()
    server.close()
  })

  it('resolves XPath placeholders for an xml endpoint and sends the body as text', async () => {
    const res = await fetch(`${base}/cccc-3333/soap`, {
      method: 'POST',
      headers: { 'content-type': 'text/xml' },
      body: soapBody,
    })

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/xml/)
    assert.equal(await res.text(), '<r>42</r>')
  })

  it('sends the sample pdf for a pdf endpoint', async () => {
    const res = await fetch(`${base}/cccc-3333/report.pdf`)

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-disposition'), /attachment; filename="sample\.pdf"/)
    assert.ok((await res.arrayBuffer()).byteLength > 0)
  })

  it('sends the sample csv for a csv endpoint', async () => {
    const res = await fetch(`${base}/cccc-3333/report.csv`)

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-disposition'), /attachment; filename="sample\.csv"/)
    assert.ok((await res.text()).length > 0)
  })

  it('sends the raw body for any other content type', async () => {
    const res = await fetch(`${base}/cccc-3333/plain`)

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/plain/)
    assert.equal(await res.text(), 'just text')
  })

  it('serves the mock and says so for an endpoint configured as proxy', async () => {
    const res = await fetch(`${base}/cccc-3333/proxied`)

    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
    assert.match(console_.stdout, /\(offline\) GET \/proxied is configured as proxy — serving the mock instead/)
  })

  it('logs every request with its method, path, status and response name', async () => {
    await fetch(`${base}/cccc-3333/plain`)

    assert.match(console_.stdout, /^GET {4} \/cccc-3333\/plain → 200 \(Plain\)$/m)
  })

  it('honours the endpoint delay', async () => {
    const started = Date.now()
    const res = await fetch(`${base}/cccc-3333/slow`)

    assert.equal(res.status, 200)
    assert.ok(Date.now() - started >= 15)
  })

  it('answers 200 with an empty body when the endpoint has no response at all', async () => {
    const res = await fetch(`${base}/cccc-3333/no-response`)

    assert.equal(res.status, 200)
    // parseFakerBody turns an absent body into {} for a JSON endpoint.
    assert.equal(await res.text(), '{}')
    assert.match(console_.stdout, /GET {4} \/cccc-3333\/no-response → 200$/m)
  })

  it('defaults a response without a status to 200', async () => {
    const res = await fetch(`${base}/cccc-3333/statusless`)

    assert.equal(res.status, 200)
    assert.equal(await res.text(), '{}')
  })

  it('turns an endpoint that cannot be matched into a 500', async () => {
    const res = await fetch(`${base}/cccc-3333/broken`)

    assert.equal(res.status, 500)
    assert.match((await res.json()).error, /SyntaxError/)
    assert.match(console_.stderr, /Invalid regular expression/)
  })

  it('answers 204 instead when the same failure happens on an OPTIONS request', async () => {
    const res = await fetch(`${base}/cccc-3333/broken`, { method: 'OPTIONS' })

    assert.equal(res.status, 204)
  })

  it('turns a malformed JSON request body into a 400', async () => {
    const res = await fetch(`${base}/cccc-3333/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    })

    assert.equal(res.status, 400)
    assert.match((await res.json()).error, /SyntaxError/)
  })

  it('answers OPTIONS for an unknown project with 204', async () => {
    const res = await fetch(`${base}/unknown/anything`, { method: 'OPTIONS' })

    assert.equal(res.status, 204)
  })

  it('mirrors the request origin and the requested headers back', async () => {
    const res = await fetch(`${base}/cccc-3333/plain`, {
      headers: { origin: 'https://app.example.com', 'access-control-request-headers': 'x-trace' },
    })

    assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example.com')
    assert.equal(res.headers.get('access-control-allow-headers'), 'x-trace')
    assert.equal(res.headers.get('x-powered-by'), null)
  })
})

describe('a project without an environment', () => {
  it('leaves env placeholders intact', async () => {
    // createApp is handed the runtime project as is; buildRuntimeProject always
    // fills `environment` in, so this covers the fallback on its own.
    const project = {
      name: 'No Env',
      slug: 'dddd-4444',
      alias: 'no-env',
      endpoints: [
        {
          path: '/config',
          method: 'GET',
          delay: 0,
          headers: contentType('application/json'),
          responses: [{ name: 'Config', status: 200, body: { url: '{{env.BASE_URL}}' } }],
          defaultResponse: { name: 'Config', status: 200, body: { url: '{{env.BASE_URL}}' } },
        },
      ],
    }

    const app = createApp([project], { quiet: true })
    const server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))

    try {
      const res = await fetch(`http://localhost:${server.address().port}/dddd-4444/config`)
      assert.deepEqual(await res.json(), { url: '{{env.BASE_URL}}' })
    } finally {
      server.close()
    }
  })
})

describe('project keys', () => {
  it('skips an empty alias and never lets one project shadow another', async () => {
    const unnamed = buildRuntimeProject({ project: { name: '', slug: 'unnamed' }, endpoints: [] }, 'u.json')
    const clashing = buildRuntimeProject({ project: { name: 'Unnamed', slug: 'other' }, endpoints: [] }, 'o.json')

    assert.equal(unnamed.alias, '')

    const app = createApp([unnamed, clashing], { quiet: true })
    const server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://localhost:${server.address().port}`

    try {
      assert.equal((await fetch(`${base}/unnamed/x`)).status, 404)
      assert.equal((await fetch(`${base}/other/x`)).status, 404)
      assert.equal((await fetch(`${base}/`)).status, 200)
    } finally {
      server.close()
    }
  })
})
