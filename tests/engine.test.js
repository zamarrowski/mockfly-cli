import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FILTERS,
  RULE_COMPARATORS,
  applyFilters,
  evaluateRule,
  getFakerFn,
  getNestedValue,
  getRandomResponse,
  getResponse,
  getResponseThatMatchWithARule,
  getURLParams,
  isContentTypeCSV,
  isContentTypeJSON,
  isContentTypePDF,
  isContentTypeXML,
  matchPath,
  parseFakerBody,
  queryParamsToString,
  replaceBodyWithEnvVars,
  replaceBodyWithHeadersValue,
  replaceBodyWithRequestBody,
  replaceBodyWithSearchParamsValue,
  replaceBodyWithURLParamsValue,
  replaceBodyWithXPathValues,
  replaceFakeDates,
  resolvePlaceholder,
  setHeaders,
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

  it('returns the last matching response when several match', () => {
    const rule = { source: 'body', property: 'user.role', comparator: 'equal', value: 'admin' }
    const responses = [
      { name: 'first', rules: [rule] },
      { name: 'second', rules: [rule] },
    ]

    assert.equal(getResponseThatMatchWithARule({ user: { role: 'admin' } }, {}, {}, {}, responses)?.name, 'second')
  })

  it('returns null when no rule matches', () => {
    assert.equal(getResponseThatMatchWithARule({}, {}, {}, {}, [adminResponse, queryResponse]), null)
  })
})

describe('evaluateRule', () => {
  const evaluate = (rule, context = {}) =>
    evaluateRule({ rule, requestBody: null, query: {}, headers: {}, urlParams: {}, ...context })

  it('compares a nested body property with equal', () => {
    const rule = { source: 'body', property: 'user.name', comparator: 'equal', value: 'sergio' }

    assert.equal(evaluate(rule, { requestBody: { user: { name: 'sergio' } } }), true)
    assert.equal(evaluate(rule, { requestBody: { user: { name: 'angela' } } }), false)
  })

  it('compares loosely, so a numeric body value matches a string rule value', () => {
    const rule = { source: 'body', property: 'total', comparator: 'equal', value: '100' }

    assert.equal(evaluate(rule, { requestBody: { total: 100 } }), true)
  })

  it('matches distinct when the body property is missing', () => {
    const rule = { source: 'body', property: 'missing', comparator: 'distinct', value: 'sergio' }

    assert.equal(evaluate(rule, { requestBody: {} }), true)
  })

  it('treats includes as membership in a comma separated list', () => {
    const rule = { source: 'queryString', property: 'env', comparator: 'includes', value: 'pro, pre , dev' }

    assert.equal(evaluate(rule, { query: { env: 'pre' } }), true)
    assert.equal(evaluate(rule, { query: { env: 'p' } }), false)
  })

  it('does not match includes when the rule value is not a list', () => {
    const rule = { source: 'queryString', property: 'env', comparator: 'includes', value: ['pro'] }

    assert.equal(evaluate(rule, { query: { env: 'pro' } }), false)
  })

  it('reads a header ignoring the case of the property', () => {
    const rule = { source: 'header', property: 'X-Country', comparator: 'equal', value: 'ES' }

    assert.equal(evaluate(rule, { headers: { 'x-country': 'ES' } }), true)
    assert.equal(evaluate(rule, { headers: { 'X-Country': 'ES' } }), true)
  })

  it('reads a url param', () => {
    const rule = { source: 'urlParam', property: 'id', comparator: 'equal', value: '3' }

    assert.equal(evaluate(rule, { urlParams: { id: '3' } }), true)
  })

  it('returns false for an unknown comparator', () => {
    const rule = { source: 'body', property: 'name', comparator: 'whatever', value: 'sergio' }

    assert.equal(evaluate(rule, { requestBody: { name: 'sergio' } }), false)
  })

  it('returns false for an unknown source', () => {
    const rule = { source: 'cookie', property: 'session', comparator: 'equal', value: 'abc' }

    assert.equal(evaluate(rule), false)
  })
})

describe('jsonPath rules', () => {
  const requestBody = {
    items: [
      { sku: 'A-1', price: 5 },
      { sku: 'B-2', price: 50 },
    ],
  }
  const evaluate = (rule, body = requestBody) =>
    evaluateRule({ rule, requestBody: body, query: {}, headers: {}, urlParams: {} })

  it('indexes into an array', () => {
    const rule = { source: 'jsonPath', property: '$.items[0].sku', comparator: 'equal', value: 'A-1' }

    assert.equal(evaluate(rule), true)
    assert.equal(evaluate({ ...rule, value: 'B-2' }), false)
  })

  it('matches when any of the values a wildcard selects matches', () => {
    const rule = { source: 'jsonPath', property: '$.items[*].sku', comparator: 'equal', value: 'B-2' }

    assert.equal(evaluate(rule), true)
    assert.equal(evaluate({ ...rule, value: 'C-3' }), false)
  })

  it('supports a filter expression', () => {
    const rule = { source: 'jsonPath', property: '$.items[?(@.price>10)].sku', comparator: 'equal', value: 'B-2' }

    assert.equal(evaluate(rule), true)
  })

  it('evaluates an expression that selects nothing against an undefined value', () => {
    const property = '$.items[5].sku'

    assert.equal(evaluate({ source: 'jsonPath', property, comparator: 'exists' }), false)
    assert.equal(evaluate({ source: 'jsonPath', property, comparator: 'notExists' }), true)
  })

  it('does not match when the request body is not an object', () => {
    const rule = { source: 'jsonPath', property: '$.items[0].sku', comparator: 'equal', value: 'A-1' }

    assert.equal(evaluate(rule, '<root/>'), false)
    assert.equal(evaluate(rule, null), false)
  })

  it('does not match when the expression does not parse', () => {
    const rule = { source: 'jsonPath', property: '$.items[?(@.price>)]', comparator: 'exists' }

    assert.equal(evaluate(rule), false)
  })

  it('does not match with an unknown comparator', () => {
    const rule = { source: 'jsonPath', property: '$.items[0].sku', comparator: 'whatever', value: 'A-1' }

    assert.equal(evaluate(rule), false)
  })
})

describe('rule comparators', () => {
  const compare = (comparator, value, expected) => RULE_COMPARATORS[comparator](value, expected)

  it('compares substrings with contains and notContains', () => {
    assert.equal(compare('contains', 'sergio@mockfly.dev', 'mockfly'), true)
    assert.equal(compare('contains', 'sergio@mockfly.dev', 'other'), false)
    assert.equal(compare('notContains', 'sergio@mockfly.dev', 'other'), true)
    assert.equal(compare('notContains', 'sergio@mockfly.dev', 'mockfly'), false)
  })

  it('treats a missing value as an empty string when comparing substrings', () => {
    assert.equal(compare('contains', undefined, 'mockfly'), false)
    assert.equal(compare('notContains', null, 'mockfly'), true)
  })

  it('compares prefixes and suffixes', () => {
    assert.equal(compare('startsWith', 'mf_1234', 'mf_'), true)
    assert.equal(compare('startsWith', 'sk_1234', 'mf_'), false)
    assert.equal(compare('endsWith', 'sergio@empresa.com', '@empresa.com'), true)
    assert.equal(compare('endsWith', 'sergio@otra.com', '@empresa.com'), false)
  })

  it('matches a regular expression', () => {
    assert.equal(compare('regex', 'user-42', '^user-\\d+$'), true)
    assert.equal(compare('regex', 'user-abc', '^user-\\d+$'), false)
  })

  it('does not match a regular expression that does not compile', () => {
    assert.equal(compare('regex', 'user-42', '^(user'), false)
  })

  // The reason the regex runs inside vm2 with a timeout: without it this call would
  // block the server for years instead of returning false in a few milliseconds.
  it('gives up instead of hanging on a catastrophic regular expression', () => {
    const start = Date.now()

    assert.equal(compare('regex', `${'a'.repeat(40)}b`, '^(a+)+$'), false)
    assert.ok(Date.now() - start < 1000)
  })

  it('compares numbers, coercing strings', () => {
    assert.equal(compare('greaterThan', '150', 100), true)
    assert.equal(compare('greaterThan', 100, 100), false)
    assert.equal(compare('greaterOrEqual', 100, 100), true)
    assert.equal(compare('lessThan', 50, '100'), true)
    assert.equal(compare('lessThan', 100, 50), false)
    assert.equal(compare('lessOrEqual', 100, 100), true)
  })

  it('does not match a numeric comparator when either side is not a number', () => {
    assert.equal(compare('greaterThan', 'ten', 5), false)
    assert.equal(compare('greaterThan', undefined, 5), false)
    assert.equal(compare('greaterThan', null, 5), false)
    assert.equal(compare('greaterThan', '', 5), false)
    assert.equal(compare('lessThan', 5, 'ten'), false)
  })

  it('compares against zero', () => {
    assert.equal(compare('greaterThan', 1, 0), true)
    assert.equal(compare('lessOrEqual', 0, 0), true)
  })

  it('checks presence with exists and notExists', () => {
    assert.equal(compare('exists', 'anything'), true)
    assert.equal(compare('exists', ''), true)
    assert.equal(compare('exists', 0), true)
    assert.equal(compare('exists', undefined), false)
    assert.equal(compare('exists', null), false)
    assert.equal(compare('notExists', undefined), true)
    assert.equal(compare('notExists', 'anything'), false)
  })

  it('checks emptiness with isEmpty and isNotEmpty', () => {
    assert.equal(compare('isEmpty', ''), true)
    assert.equal(compare('isEmpty', '   '), true)
    assert.equal(compare('isEmpty', []), true)
    assert.equal(compare('isEmpty', {}), true)
    assert.equal(compare('isEmpty', undefined), true)
    assert.equal(compare('isEmpty', 'sergio'), false)
    assert.equal(compare('isEmpty', 0), false)
    assert.equal(compare('isNotEmpty', 'sergio'), true)
    assert.equal(compare('isNotEmpty', [1]), true)
    assert.equal(compare('isNotEmpty', ''), false)
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
    const body = replaceBodyWithRequestBody({ name: '{{body.missing | default:anon}}' }, {})
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

describe('queryParamsToString', () => {
  it('returns an empty string without params', () => {
    assert.equal(queryParamsToString(undefined), '')
    assert.equal(queryParamsToString(null), '')
    assert.equal(queryParamsToString({}), '')
  })

  it('rebuilds the query string, joining pairs with &', () => {
    assert.equal(queryParamsToString({ page: '2' }), '?page=2')
    assert.equal(queryParamsToString({ page: '2', size: '10' }), '?page=2&size=10')
  })
})

describe('matchPath', () => {
  it('matches a literal path', () => {
    assert.equal(matchPath({ path: '/users' }, '/users'), true)
    assert.equal(matchPath({ path: '/users' }, '/users/1'), false)
  })

  it('matches several params in one path', () => {
    const endpoint = { path: '/users/:userId/posts/:postId' }
    assert.equal(matchPath(endpoint, '/users/5/posts/9'), true)
    assert.equal(matchPath(endpoint, '/users/5/posts'), false)
  })

  it('ignores a query string declared on the endpoint itself', () => {
    assert.equal(matchPath({ path: '/users?active=true' }, '/users'), true)
  })

  it('does not match a param against an empty segment', () => {
    assert.equal(matchPath({ path: '/users/:id' }, '/users/'), false)
  })
})

describe('content type helpers', () => {
  const contentType = value => [{ key: 'Content-Type', value }]

  it('treats no content-type header as JSON', () => {
    assert.equal(isContentTypeJSON([]), true)
    assert.equal(isContentTypeJSON(undefined), true)
    assert.equal(isContentTypeJSON(null), true)
    assert.equal(isContentTypeJSON([{ key: 'X-Trace', value: '1' }]), true)
  })

  it('detects a JSON content type, whatever the header case', () => {
    assert.equal(isContentTypeJSON(contentType('application/json')), true)
    assert.equal(isContentTypeJSON([{ key: 'content-type', value: 'application/json' }]), true)
    assert.equal(isContentTypeJSON(contentType('text/csv')), false)
    assert.equal(isContentTypeJSON(contentType('application/pdf')), false)
  })

  it('detects the XML content types the backend allows', () => {
    assert.equal(isContentTypeXML(contentType('application/xml')), true)
    assert.equal(isContentTypeXML(contentType('text/xml')), true)
    assert.equal(isContentTypeXML(contentType('text/xml; charset=utf-8')), true)
    assert.equal(isContentTypeXML(contentType('application/json')), false)
    assert.equal(isContentTypeXML([]), false)
    assert.equal(isContentTypeXML(undefined), false)
    assert.equal(isContentTypeXML([{ key: 'X-Trace', value: '1' }]), false)
  })

  it('detects a PDF content type', () => {
    assert.equal(isContentTypePDF(contentType('application/pdf')), true)
    assert.equal(isContentTypePDF(contentType('application/json')), false)
    assert.equal(isContentTypePDF([]), true)
    assert.equal(isContentTypePDF(undefined), true)
    assert.equal(isContentTypePDF([{ key: 'X-Trace', value: '1' }]), true)
  })

  it('detects a CSV content type', () => {
    assert.equal(isContentTypeCSV(contentType('text/csv')), true)
    assert.equal(isContentTypeCSV(contentType('application/json')), false)
    assert.equal(isContentTypeCSV([]), true)
    assert.equal(isContentTypeCSV(undefined), true)
    assert.equal(isContentTypeCSV([{ key: 'X-Trace', value: '1' }]), true)
  })
})

describe('setHeaders', () => {
  const fakeRes = () => {
    const store = {}
    return { store, set: (key, value) => (store[key] = value) }
  }

  it('does nothing without headers', () => {
    const res = fakeRes()
    setHeaders(res, undefined)
    setHeaders(res, [])
    assert.deepEqual(res.store, {})
  })

  it('copies headers over, resolving faker placeholders in the value', () => {
    const res = fakeRes()
    setHeaders(res, [
      { key: 'X-Plain', value: 'ok' },
      { key: 'X-Generated', value: '{{string.alpha 6}}' },
    ])

    assert.equal(res.store['X-Plain'], 'ok')
    assert.match(res.store['X-Generated'], /^[a-zA-Z]{6}$/)
  })

  it('keeps the raw value when the faker call resolves to something empty', () => {
    const res = fakeRes()
    setHeaders(res, [{ key: 'X-Empty', value: '{{string.alpha 0}}' }])

    assert.equal(res.store['X-Empty'], '{{string.alpha 0}}')
  })
})

describe('getFakerFn', () => {
  it('leaves a string without a placeholder untouched', () => {
    assert.equal(getFakerFn('plain'), 'plain')
  })

  it('leaves unknown faker modules and methods untouched', () => {
    assert.equal(getFakerFn('{{nope.nope}}'), '{{nope.nope}}')
    assert.equal(getFakerFn('{{internet.nope}}'), '{{internet.nope}}')
  })

  it('passes numeric arguments through as numbers', () => {
    assert.match(getFakerFn('{{string.alpha 5}}'), /^[a-zA-Z]{5}$/)

    const int = Number(getFakerFn('{{number.int 3}}'))
    assert.ok(Number.isInteger(int) && int >= 0 && int <= 3)
  })

  it('passes a comma list as an array to arrayElement', () => {
    assert.ok(['a', 'b', 'c'].includes(getFakerFn('{{helpers.arrayElement a,b,c}}')))
  })

  it('passes a comma list as an array to shuffle', () => {
    assert.deepEqual(getFakerFn('{{helpers.shuffle a,b,c}}').split(',').sort(), ['a', 'b', 'c'])
  })

  // The placeholder regex is greedy, so `(.*)` swallows everything up to the last
  // `}}` and two calls in one string collapse into one. Pinned as it behaves today.
  it('collapses two placeholders in one string into a single faker call', () => {
    const result = getFakerFn('{{string.alpha 3}}-{{string.alpha 4}}')

    assert.match(result, /^[a-zA-Z]+$/)
    assert.equal(result.includes('{{'), false)
  })
})

describe('parseFakerBody', () => {
  it('returns an empty object for an empty body', () => {
    assert.deepEqual(parseFakerBody(undefined), {})
    assert.deepEqual(parseFakerBody(null), {})
  })

  it('leaves non-string values alone', () => {
    assert.deepEqual(parseFakerBody({ n: 1, b: true, nil: null }), { n: 1, b: true, nil: null })
  })

  it('recurses into nested objects and arrays', () => {
    const body = parseFakerBody({ list: ['{{string.alpha 4}}'], deep: { deeper: { v: '{{string.alpha 4}}' } } })

    assert.match(body.list[0], /^[a-zA-Z]{4}$/)
    assert.match(body.deep.deeper.v, /^[a-zA-Z]{4}$/)
  })

  it('keeps an empty string as an empty string', () => {
    assert.deepEqual(parseFakerBody({ empty: '' }), { empty: '' })
  })

  it('keeps a raw faker expression that cannot be evaluated', () => {
    assert.deepEqual(parseFakerBody({ x: '{{faker.this is not valid js}}' }), { x: '{{faker.this is not valid js}}' })
  })
})

describe('getNestedValue', () => {
  it('walks a dotted path', () => {
    assert.equal(getNestedValue({ a: { b: { c: 7 } } }, 'a.b.c'), 7)
    assert.equal(getNestedValue({ a: { b: { c: 7 } } }, ['a', 'b']).c, 7)
  })

  it('returns undefined for a non-object source', () => {
    assert.equal(getNestedValue(null, 'a'), undefined)
    assert.equal(getNestedValue(undefined, 'a'), undefined)
    assert.equal(getNestedValue('a string', 'length'), undefined)
    assert.equal(getNestedValue(7, 'a'), undefined)
  })

  it('returns undefined for an unusable path', () => {
    assert.equal(getNestedValue({ a: 1 }, []), undefined)
    assert.equal(getNestedValue({ a: 1 }, 7), undefined)
    assert.equal(getNestedValue({ a: 1 }, null), undefined)
  })

  it('returns undefined when a segment is missing', () => {
    assert.equal(getNestedValue({ a: 1 }, 'b'), undefined)
    assert.equal(getNestedValue({ a: { b: 1 } }, 'a.c'), undefined)
  })
})

describe('rule sources and comparators', () => {
  const responseWith = rule => ({ name: 'matched', rules: [rule] })
  const match = (rule, { body, query = {}, headers = {}, urlParams = {}, endpointHeaders = [] } = {}) =>
    getResponseThatMatchWithARule(body, query, headers, urlParams, [responseWith(rule)], endpointHeaders)

  it('matches a header rule case-insensitively', () => {
    const rule = { source: 'header', property: 'X-Role', comparator: 'equal', value: 'admin' }

    assert.equal(match(rule, { headers: { 'x-role': 'admin' } })?.name, 'matched')
    assert.equal(match(rule, { headers: { 'X-Role': 'admin' } })?.name, 'matched')
    assert.equal(match(rule, { headers: { 'x-role': 'guest' } }), null)
  })

  it('matches a urlParam rule', () => {
    const rule = { source: 'urlParam', property: 'id', comparator: 'equal', value: '999' }

    assert.equal(match(rule, { urlParams: { id: '999' } })?.name, 'matched')
    assert.equal(match(rule, { urlParams: { id: '1' } }), null)
  })

  it('matches a body rule against a missing nested property', () => {
    const rule = { source: 'body', property: 'user.role', comparator: 'distinct', value: 'admin' }

    assert.equal(match(rule, { body: {} })?.name, 'matched')
    assert.equal(match(rule, { body: undefined })?.name, 'matched')
  })

  it('matches the distinct comparator', () => {
    const rule = { source: 'queryString', property: 'type', comparator: 'distinct', value: 'a' }

    assert.equal(match(rule, { query: { type: 'b' } })?.name, 'matched')
    assert.equal(match(rule, { query: { type: 'a' } }), null)
  })

  it('compares loosely, so "1" equals 1', () => {
    const rule = { source: 'queryString', property: 'n', comparator: 'equal', value: 1 }

    assert.equal(match(rule, { query: { n: '1' } })?.name, 'matched')
  })

  it('ignores an includes rule whose value is not a comma string', () => {
    const includes = value => ({ source: 'queryString', property: 't', comparator: 'includes', value })

    assert.equal(match(includes(5), { query: { t: 5 } }), null)
    assert.equal(match(includes(''), { query: { t: '' } }), null)
  })

  it('ignores an unknown comparator', () => {
    const rule = { source: 'queryString', property: 't', comparator: 'whatever', value: 'a' }

    assert.equal(match(rule, { query: { t: 'a' } }), null)
  })

  it('matches the comparators the backend added on top of equal, distinct and includes', () => {
    const rule = { source: 'queryString', property: 't', comparator: 'startsWith', value: 'a' }

    assert.equal(match(rule, { query: { t: 'ab' } })?.name, 'matched')
    assert.equal(match(rule, { query: { t: 'ba' } }), null)
  })

  it('tolerates responses without rules', () => {
    assert.equal(getResponseThatMatchWithARule({}, {}, {}, {}, [{ name: 'no rules' }]), null)
    assert.equal(getResponseThatMatchWithARule({}, {}, {}, {}, undefined), null)
  })

  it('defaults the query to an empty object', () => {
    const rule = { source: 'queryString', property: 'x', comparator: 'distinct', value: 'a' }
    assert.equal(getResponseThatMatchWithARule({}, undefined, {}, {}, [responseWith(rule)])?.name, 'matched')
  })

  it('keeps the last matching response when several match', () => {
    const rule = { source: 'queryString', property: 'x', comparator: 'equal', value: '1' }
    const responses = [
      { name: 'first', rules: [rule] },
      { name: 'second', rules: [rule] },
    ]

    assert.equal(getResponseThatMatchWithARule({}, { x: '1' }, {}, {}, responses)?.name, 'second')
  })
})

describe('xml rules', () => {
  const xmlHeaders = [{ key: 'Content-Type', value: 'application/xml' }]
  const match = (rule, body, endpointHeaders = xmlHeaders) =>
    getResponseThatMatchWithARule(body, {}, {}, {}, [{ name: 'matched', rules: [rule] }], endpointHeaders)

  it('matches an xmlTag rule when the tag is present', () => {
    const rule = { source: 'xmlTag', comparator: 'equal', value: 'Item' }

    assert.equal(match(rule, '<root><Item>1</Item></root>')?.name, 'matched')
    assert.equal(match(rule, '<root/>'), null)
  })

  it('matches an xmlTag distinct rule when the tag is absent', () => {
    const rule = { source: 'xmlTag', comparator: 'distinct', value: 'Item' }

    assert.equal(match(rule, '<root/>')?.name, 'matched')
    assert.equal(match(rule, '<root><Item>1</Item></root>'), null)
  })

  it('ignores xml rules when the endpoint is not an xml endpoint', () => {
    const rule = { source: 'xmlTag', comparator: 'equal', value: 'Item' }

    assert.equal(match(rule, '<root><Item>1</Item></root>', []), null)
  })

  it('matches an xPath rule when the expression selects something', () => {
    const rule = { source: 'xPath', comparator: 'equal', value: '//Item' }

    assert.equal(match(rule, '<root><Item>1</Item></root>')?.name, 'matched')
    assert.equal(match(rule, '<root/>'), null)
  })

  it('ignores an xPath rule when the request body is not a string', () => {
    const rule = { source: 'xPath', comparator: 'equal', value: '//Item' }

    assert.equal(match(rule, { Item: 1 }), null)
    assert.equal(match(rule, undefined), null)
  })

  it('ignores an xPath rule when the request body is an empty string', () => {
    const rule = { source: 'xPath', comparator: 'equal', value: '//Item' }

    assert.equal(match(rule, ''), null)
  })

  // Pinned, not endorsed: `null != '//Item'` is true before the expression is ever
  // evaluated, so this rule matches every request. The backend does the same and
  // parity beats fixing it here.
  it('matches every request for an xPath rule with distinct, as the backend does', () => {
    const rule = { source: 'xPath', comparator: 'distinct', value: '//Item' }

    assert.equal(match(rule, '<root/>')?.name, 'matched')
    assert.equal(match(rule, '<root><Item>1</Item></root>')?.name, 'matched')
  })

  it('ignores an xmlTag rule with a comparator other than equal or distinct', () => {
    const rule = { source: 'xmlTag', comparator: 'includes', value: 'Item' }

    assert.equal(match(rule, '<root><Item>1</Item></root>'), null)
  })

  it('ignores an xml rule when the body does not parse as xml', () => {
    assert.equal(match({ source: 'xmlTag', comparator: 'equal', value: 'Item' }, ''), null)
    assert.equal(match({ source: 'xmlTag', comparator: 'distinct', value: 'Item' }, ''), null)
  })
})

describe('filters', () => {
  const filtered = (expr, source) => replaceBodyWithRequestBody({ v: expr }, source).v

  it('applies substring with one and two bounds', () => {
    assert.equal(filtered('{{body.s | substring:0,3}}', { s: 'ABCdef' }), 'ABC')
    assert.equal(filtered('{{body.s | substring:3}}', { s: 'ABCdef' }), 'def')
  })

  it('applies slice to strings and arrays', () => {
    assert.equal(filtered('{{body.s | slice:1,3}}', { s: 'ABCdef' }), 'BC')
    assert.deepEqual(filtered('{{body.arr | slice:0,2}}', { arr: [1, 2, 3] }), [1, 2])
    assert.deepEqual(filtered('{{body.arr | slice:1}}', { arr: [1, 2, 3] }), [2, 3])
  })

  it('leaves values of the wrong type alone', () => {
    assert.equal(filtered('{{body.n | substring:0,3}}', { n: 12345 }), 12345)
    assert.equal(filtered('{{body.n | slice:0,3}}', { n: 12345 }), 12345)
    assert.equal(filtered('{{body.n | upper}}', { n: 12345 }), 12345)
    assert.equal(filtered('{{body.n | lower}}', { n: 12345 }), 12345)
    assert.equal(filtered('{{body.n | trim}}', { n: 12345 }), 12345)
  })

  it('applies upper, lower and trim', () => {
    assert.equal(filtered('{{body.s | upper}}', { s: 'ada' }), 'ADA')
    assert.equal(filtered('{{body.s | lower}}', { s: 'ADA' }), 'ada')
    assert.equal(filtered('{{body.s | trim}}', { s: '  ada  ' }), 'ada')
  })

  it('uses default only for missing, null or empty values', () => {
    assert.equal(filtered('{{body.s | default:anon}}', { s: 'ada' }), 'ada')
    assert.equal(filtered('{{body.s | default:anon}}', { s: '' }), 'anon')
    assert.equal(filtered('{{body.s | default:anon}}', { s: null }), 'anon')
    assert.equal(filtered('{{body.missing | default:anon}}', {}), 'anon')
  })

  it('chains filters left to right', () => {
    assert.equal(filtered('{{body.s | trim | upper | substring:0,2}}', { s: '  ada  ' }), 'AD')
  })

  it('skips an unknown filter, keeping the value', () => {
    assert.equal(filtered('{{body.s | nosuchfilter}}', { s: 'ada' }), 'ada')
    assert.equal(filtered('{{body.s | nosuchfilter | upper}}', { s: 'ada' }), 'ADA')
  })

  it('can be used on its own', () => {
    assert.equal(applyFilters('  ada  ', ['trim', 'upper']), 'ADA')
    assert.equal(applyFilters('ada', []), 'ada')
    assert.equal(FILTERS.upper('ada'), 'ADA')
  })
})

describe('resolvePlaceholder', () => {
  it('does not match when the root key differs', () => {
    assert.deepEqual(resolvePlaceholder('other.x', { x: 1 }, { rootKey: 'body' }), { matched: false })
  })

  it('does not match a bare root key with no path', () => {
    assert.deepEqual(resolvePlaceholder('body', { x: 1 }, { rootKey: 'body' }), { matched: false })
  })

  it('does not match when the prefix is missing', () => {
    assert.deepEqual(resolvePlaceholder('id', { id: 1 }, { prefix: ':' }), { matched: false })
  })

  it('resolves a prefixed path', () => {
    assert.deepEqual(resolvePlaceholder(':id', { id: '42' }, { prefix: ':' }), { matched: true, value: '42' })
  })

  it('does not match a missing segment without a default filter', () => {
    assert.deepEqual(resolvePlaceholder('body.a.b', { a: {} }, { rootKey: 'body' }), { matched: false })
    assert.deepEqual(resolvePlaceholder('body.a.b', { a: null }, { rootKey: 'body' }), { matched: false })
  })

  it('lowercases the path segments when asked to', () => {
    assert.deepEqual(resolvePlaceholder('h.X-Trace', { 'x-trace': 'abc' }, { rootKey: 'h', caseInsensitive: true }), {
      matched: true,
      value: 'abc',
    })
  })
})

describe('placeholder replacement', () => {
  it('replaces request header values case-insensitively, as strings', () => {
    const body = replaceBodyWithHeadersValue(
      { trace: '{{reqHeaders.X-Trace}}', mixed: 'trace={{reqHeaders.x-trace}}' },
      { 'x-trace': 'abc' }
    )

    assert.deepEqual(body, { trace: 'abc', mixed: 'trace=abc' })
  })

  it('never preserves the type for headers and search params', () => {
    assert.equal(replaceBodyWithHeadersValue({ n: '{{reqHeaders.n}}' }, { n: 7 }).n, '7')
    assert.equal(replaceBodyWithSearchParamsValue({ n: '{{searchParam.n}}' }, { n: 7 }).n, '7')
    assert.equal(replaceBodyWithURLParamsValue({ n: '{{:n}}' }, { n: 7 }).n, '7')
  })

  it('walks arrays and nested objects', () => {
    const body = replaceBodyWithRequestBody(
      { list: ['{{body.name}}'], deep: { name: '{{body.name}}' }, n: 1, flag: true, nil: null },
      { name: 'Ada' }
    )

    assert.deepEqual(body, { list: ['Ada'], deep: { name: 'Ada' }, n: 1, flag: true, nil: null })
  })

  it('preserves objects and arrays taken from the request body', () => {
    const body = replaceBodyWithRequestBody({ user: '{{body.user}}' }, { user: { id: 1 } })

    assert.deepEqual(body, { user: { id: 1 } })
  })

  it('keeps a placeholder whose source is missing', () => {
    assert.deepEqual(replaceBodyWithEnvVars({ u: '{{env.MISSING}}/x' }, {}), { u: '{{env.MISSING}}/x' })
    assert.deepEqual(replaceBodyWithURLParamsValue({ u: '{{:missing}}' }, {}), { u: '{{:missing}}' })
  })
})

describe('replaceFakeDates', () => {
  it('evaluates Intl.DateTimeFormat expressions', () => {
    const body = replaceFakeDates(['{{new Intl.DateTimeFormat("en-US").format(new Date(0))}}'])

    assert.deepEqual(body, ['1/1/1970'])
  })

  it('recurses into arrays and nested objects', () => {
    const body = replaceFakeDates({ list: [{ y: '{{new Date(0).getUTCFullYear()}}' }] })

    assert.equal(body.list[0].y, 1970)
  })

  it('leaves anything else alone', () => {
    assert.equal(replaceFakeDates('plain'), 'plain')
    assert.equal(replaceFakeDates(7), 7)
    assert.equal(replaceFakeDates(null), null)
    assert.equal(replaceFakeDates('{{new Thing()}}'), '{{new Thing()}}')
  })
})

describe('getRandomResponse', () => {
  it('returns null without responses', () => {
    assert.equal(getRandomResponse([]), null)
    assert.equal(getRandomResponse(undefined), null)
    assert.equal(getRandomResponse(null), null)
  })

  it('returns one of the given responses', () => {
    const responses = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

    for (let i = 0; i < 20; i++) assert.ok(responses.includes(getRandomResponse(responses)))
  })
})

describe('getResponse', () => {
  const req = { body: {}, query: {}, headers: {} }

  it('returns a random enabled response when the endpoint asks for it', () => {
    const responses = [{ name: 'a' }, { name: 'b', isEnabled: false }]
    const endpoint = { responses, returnRandomResponse: true, defaultResponse: responses[0], headers: [] }

    for (let i = 0; i < 20; i++) {
      assert.equal(getResponse({ req, urlParams: {}, endpoint }).name, 'a')
    }
  })

  it('falls back to the default response when every response is disabled', () => {
    const fallback = { name: 'default', isEnabled: false }
    const endpoint = { responses: [fallback], returnRandomResponse: true, defaultResponse: fallback, headers: [] }

    assert.equal(getResponse({ req, urlParams: {}, endpoint }).name, 'default')
  })

  it('prefers a rule match over the default response', () => {
    const rule = { source: 'queryString', property: 'x', comparator: 'equal', value: '1' }
    const matched = { name: 'matched', rules: [rule] }
    const fallback = { name: 'default' }
    const endpoint = { responses: [matched, fallback], defaultResponse: fallback, headers: [] }

    assert.equal(getResponse({ req: { ...req, query: { x: '1' } }, urlParams: {}, endpoint }).name, 'matched')
  })

  it('returns null when nothing matches and there is no default response', () => {
    const endpoint = { responses: [], headers: [] }

    assert.equal(getResponse({ req, urlParams: {}, endpoint }), null)
  })

  it('treats a response without isEnabled as enabled', () => {
    const only = { name: 'legacy' }
    const endpoint = { responses: [only], defaultResponse: only, headers: [] }

    assert.equal(getResponse({ req, urlParams: {}, endpoint }).name, 'legacy')
  })
})

describe('getURLParams', () => {
  it('returns an empty object for a path without params', () => {
    assert.deepEqual(getURLParams('/users', '/users'), {})
  })

  it('ignores the query string', () => {
    assert.deepEqual(getURLParams('/users/5?a=1&b=2', '/users/:id'), { id: '5' })
  })

  it('leaves a param undefined when the url is shorter than the pattern', () => {
    assert.deepEqual(getURLParams('/users', '/users/:id'), { id: undefined })
  })
})

describe('replaceBodyWithXPathValues', () => {
  const soap = [
    '<soap:Envelope xmlns="urn:default" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="urn:mockfly">',
    '<soap:Body><m:Item>42</m:Item></soap:Body>',
    '</soap:Envelope>',
  ].join('')

  it('resolves XPath expressions against the request body, namespaces included', () => {
    assert.equal(replaceBodyWithXPathValues('<r>{{XPath //m:Item/text()}}</r>', soap), '<r>42</r>')
  })

  it('resolves several expressions in one body', () => {
    const body = '<r><a>{{XPath //m:Item/text()}}</a><b>{{XPath //m:Item/text()}}</b></r>'

    assert.equal(replaceBodyWithXPathValues(body, soap), '<r><a>42</a><b>42</b></r>')
  })

  it('keeps an expression that selects nothing', () => {
    const body = '<r>{{XPath //m:Nope/text()}}</r>'

    assert.equal(replaceBodyWithXPathValues(body, soap), body)
  })

  it('returns the body untouched when there is nothing to resolve', () => {
    assert.equal(replaceBodyWithXPathValues('<r>plain</r>', soap), '<r>plain</r>')
    assert.equal(replaceBodyWithXPathValues('<r/>', undefined), '<r/>')
    assert.equal(replaceBodyWithXPathValues('<r/>', { not: 'a string' }), '<r/>')
    assert.deepEqual(replaceBodyWithXPathValues({ not: 'a string' }, soap), { not: 'a string' })
  })
})
