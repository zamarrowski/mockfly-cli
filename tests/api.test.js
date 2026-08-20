import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { fetchProjectExport, fetchProjects } from '../src/api.js'
import { brokenBodyResponse, jsonResponse, stubFetch } from './helpers.js'

const auth = { apiBase: 'https://api.example.com', apiKey: 'mf_test_key' }

let fetchStub

afterEach(() => {
  fetchStub?.restore()
  fetchStub = undefined
})

describe('fetchProjects', () => {
  it('calls /public/projects with the api key and returns the results array', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [{ _id: '1', name: 'User API' }] }))

    const projects = await fetchProjects(auth)

    assert.deepEqual(projects, [{ _id: '1', name: 'User API' }])
    assert.equal(fetchStub.calls.length, 1)
    assert.equal(fetchStub.calls[0].url, 'https://api.example.com/public/projects')
    assert.deepEqual(fetchStub.calls[0].options, {
      headers: { authorization: 'mf_test_key', accept: 'application/json' },
    })
  })

  it('returns an empty array when the payload has no results', async () => {
    fetchStub = stubFetch(async () => jsonResponse({}))

    assert.deepEqual(await fetchProjects(auth), [])
  })
})

describe('fetchProjectExport', () => {
  it('calls the export endpoint of the given project and returns the payload as is', async () => {
    const payload = { project: { slug: 'aaaa-1111' }, endpoints: [] }
    fetchStub = stubFetch(async () => jsonResponse(payload))

    assert.deepEqual(await fetchProjectExport(auth, 'abc123'), payload)
    assert.equal(fetchStub.calls[0].url, 'https://api.example.com/public/projects/abc123/export')
  })
})

describe('api errors', () => {
  it('turns a 401 into a "run mockfly login" message', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ error: 'unauthorized' }, { status: 401 }))

    await assert.rejects(fetchProjects(auth), {
      message: 'Invalid API key. Run `mockfly login` with a key created in the Mockfly dashboard.',
    })
  })

  it('includes the error field of a JSON error body', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ error: 'project not found' }, { status: 404 }))

    await assert.rejects(fetchProjectExport(auth, 'nope'), { message: 'API error 404: project not found' })
  })

  it('keeps the status only when the JSON error body has no error field', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ detail: 'nope' }, { status: 500 }))

    await assert.rejects(fetchProjects(auth), { message: 'API error 500' })
  })

  it('keeps the status only when the error body is not JSON', async () => {
    fetchStub = stubFetch(async () => brokenBodyResponse({ status: 502 }))

    await assert.rejects(fetchProjects(auth), { message: 'API error 502' })
  })

  it('reports an offline failure with the base url and the underlying reason', async () => {
    fetchStub = stubFetch(async () => {
      throw new TypeError('fetch failed')
    })

    await assert.rejects(fetchProjects(auth), {
      message: 'Could not reach https://api.example.com — are you online? (fetch failed)',
    })
  })
})
