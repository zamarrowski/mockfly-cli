import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getResponse,
  getResponseThatMatchWithARule,
  getURLParams,
  matchPath,
  parseFakerBody,
  replaceBodyWithEnvVars,
  replaceBodyWithRequestBody,
  replaceBodyWithSearchParamsValue,
  replaceBodyWithURLParamsValue,
  replaceFakeDates,
} from '../src/engine/index.js'

describe('matchPath', () => {
  const endpoint = { path: '/users/:id' }

  it('matches url params', () => {
    assert.equal(matchPath(endpoint, '/users/5'), true)
    assert.equal(matchPath(endpoint, '/users/abc-DEF_1'), true)
  })

  it('ignores query strings', () => {
    assert.equal(matchPath(endpoint, '/users/5?active=true'), true)
  })

  it('rejects different paths', () => {
    assert.equal(matchPath(endpoint, '/users'), false)
    assert.equal(matchPath(endpoint, '/users/5/posts'), false)
  })
})

describe('rules', () => {
  const adminResponse = {
    name: 'admin',
    status: 200,
    body: { role: 'admin' },
    rules: [{ source: 'body', property: 'user.role', comparator: 'equal', value: 'admin' }],
  }
  const queryResponse = {
    name: 'filtered',
    status: 200,
    body: {},
    rules: [{ source: 'queryString', property: 'type', comparator: 'includes', value: 'a, b, c' }],
  }

  it('matches a body rule with nested property', () => {
    const match = getResponseThatMatchWithARule({ user: { role: 'admin' } }, {}, {}, {}, [adminResponse])
    assert.equal(match?.name, 'admin')
  })

  it('does not match when the value differs', () => {
    const match = getResponseThatMatchWithARule({ user: { role: 'guest' } }, {}, {}, {}, [adminResponse])
    assert.equal(match, null)
  })

  it('matches includes comparator against a comma list', () => {
    const match = getResponseThatMatchWithARule({}, { type: 'b' }, {}, {}, [queryResponse])
    assert.equal(match?.name, 'filtered')
  })

  it('honors andConditions', () => {
    const response = {
      name: 'both',
      rules: [
        {
          source: 'queryString',
          property: 'a',
          comparator: 'equal',
          value: '1',
          andConditions: [{ source: 'queryString', property: 'b', comparator: 'equal', value: '2' }],
        },
      ],
    }
    assert.equal(getResponseThatMatchWithARule({}, { a: '1', b: '2' }, {}, {}, [response])?.name, 'both')
    assert.equal(getResponseThatMatchWithARule({}, { a: '1', b: '3' }, {}, {}, [response]), null)
  })
})

describe('getResponse', () => {
  it('falls back to the default response', () => {
    const defaultResponse = { name: 'default', status: 200 }
    const endpoint = { responses: [defaultResponse], defaultResponse, headers: [] }
    const response = getResponse({ req: { body: {}, query: {}, headers: {} }, urlParams: {}, endpoint })
    assert.equal(response.name, 'default')
  })

  it('skips disabled responses', () => {
    const disabled = {
      name: 'disabled',
      isEnabled: false,
      rules: [{ source: 'queryString', property: 'x', comparator: 'equal', value: '1' }],
    }
    const fallback = { name: 'fallback' }
    const endpoint = { responses: [disabled, fallback], defaultResponse: fallback, headers: [] }
    const response = getResponse({ req: { body: {}, query: { x: '1' }, headers: {} }, urlParams: {}, endpoint })
    assert.equal(response.name, 'fallback')
  })
})

describe('placeholders', () => {
  it('replaces url params preserving strings', () => {
    const body = replaceBodyWithURLParamsValue({ id: '{{:id}}', link: '/users/{{:id}}' }, { id: '42' })
    assert.deepEqual(body, { id: '42', link: '/users/42' })
  })

  it('replaces request body values preserving type on single placeholders', () => {
    const body = replaceBodyWithRequestBody({ count: '{{body.count}}' }, { count: 7 })
    assert.deepEqual(body, { count: 7 })
  })

  it('applies filters', () => {
    const body = replaceBodyWithRequestBody({ name: '{{body.name | upper}}' }, { name: 'ada' })
    assert.deepEqual(body, { name: 'ADA' })
  })

  it('uses default filter on missing values', () => {
    const body = replaceBodyWithRequestBody({ name: "{{body.missing | default:anon}}" }, {})
    assert.deepEqual(body, { name: 'anon' })
  })

  it('keeps unknown placeholders intact', () => {
    const body = replaceBodyWithRequestBody({ name: '{{body.missing}}' }, {})
    assert.deepEqual(body, { name: '{{body.missing}}' })
  })

  it('replaces env vars', () => {
    const body = replaceBodyWithEnvVars({ url: '{{env.BASE}}/x' }, { BASE: 'https://x.dev' })
    assert.deepEqual(body, { url: 'https://x.dev/x' })
  })

  it('replaces search params', () => {
    const body = replaceBodyWithSearchParamsValue({ page: '{{searchParam.page}}' }, { page: '3' })
    assert.deepEqual(body, { page: '3' })
  })
})

describe('faker templating', () => {
  it('replaces faker placeholders with generated values', () => {
    const body = parseFakerBody({ email: '{{internet.email}}', nested: { name: '{{person.firstName}}' } })
    assert.equal(typeof body.email, 'string')
    assert.ok(body.email.includes('@'))
    assert.notEqual(body.nested.name, '{{person.firstName}}')
  })

  it('evaluates raw faker expressions', () => {
    const body = parseFakerBody({ n: '{{faker.number.int({ min: 1, max: 2 })}}' })
    assert.ok(['1', '2'].includes(String(body.n)))
  })

  it('leaves unknown expressions untouched', () => {
    const body = parseFakerBody({ x: '{{nope.nothing}}' })
    assert.equal(body.x, '{{nope.nothing}}')
  })
})

describe('replaceFakeDates', () => {
  it('evaluates Date expressions', () => {
    const body = replaceFakeDates({ now: '{{new Date().getFullYear()}}' })
    assert.equal(body.now, new Date().getFullYear())
  })
})

describe('getURLParams', () => {
  it('extracts named params', () => {
    assert.deepEqual(getURLParams('/users/5/posts/9?x=1', '/users/:userId/posts/:postId'), {
      userId: '5',
      postId: '9',
    })
  })
})
