// Mirrors mockfly-backend: the pure (no DB, no network) parts of src/mocks/domain.js
// and the content-type helpers of src/endpoints/domain.js. Function bodies are kept
// verbatim so local responses match production. Adaptations for offline use:
//   - no Mongo: `getResponse` returns the matched response object directly instead of
//     an ObjectId (`defaultResponse` is resolved to an object by the workspace loader).
//   - no caches, request counters, proxy or DB logging.
import { faker } from '@faker-js/faker'
import { DOMParser } from 'xmldom'
import xpath from 'xpath'
import { allowedRuleComparators, allowedRuleSources, ALLOWED_XML_CONTENT_TYPE_HEADER_VALES } from './constants.js'
import { evalCode } from './vm.js'

export const queryParamsToString = query => {
  if (query) {
    const objectEntries = Object.entries(query)
    if (objectEntries.length) {
      let queryString = '?'
      objectEntries.forEach(([key, value], index) => {
        queryString += `${key}=${value}`
        if (index < objectEntries.length - 1) queryString += '&'
      })
      return queryString
    }
  }
  return ''
}

export const matchPath = (endpoint, path) => {
  const replacedPath = endpoint.path.replaceAll(/(:[a-zA-Z0-9_]+)/g, '[a-zA-Z0-9-_]+').replaceAll(/\?.*/g, '')
  const regex = new RegExp(`^${replacedPath}$`)
  return regex.test(path.replaceAll(/\?.*/g, ''))
}

export const isContentTypeJSON = (headers = []) => {
  if (headers && headers.length) {
    const contentType = headers.find(header => header.key.toLowerCase() === 'content-type')

    if (contentType && contentType.value !== 'application/json') {
      return false
    }
  }

  return true
}

export const isContentTypeXML = (headers = []) => {
  if (headers && headers.length) {
    const contentType = headers.find(header => header.key.toLowerCase() === 'content-type')

    if (contentType && ALLOWED_XML_CONTENT_TYPE_HEADER_VALES.includes(contentType.value)) {
      return true
    }
  }

  return false
}

export const isContentTypePDF = (headers = []) => {
  if (headers && headers.length) {
    const contentType = headers.find(header => header.key.toLowerCase() === 'content-type')

    if (contentType && contentType.value !== 'application/pdf') {
      return false
    }
  }

  return true
}

export const isContentTypeCSV = (headers = []) => {
  if (headers && headers.length) {
    const contentType = headers.find(header => header.key.toLowerCase() === 'content-type')

    if (contentType && contentType.value !== 'text/csv') {
      return false
    }
  }

  return true
}

export const setHeaders = (res, headers) => {
  if (headers?.length) {
    headers.forEach(header => {
      const result = getFakerFn(header.value)
      res.set(header.key, result || header.value)
    })
  }
}

export const getFakerFn = stringFn => {
  const fakerFunctions = Object.keys(faker)
  const matches = stringFn.match(/{{(\w+)\.(\w+)(?:\s+(.*))?}}/)

  if (!matches) return stringFn

  const type = matches[1]
  const subtype = matches[2]
  let params = matches[3] ? matches[3].split(',') : []

  params = params.map(param => {
    if (!Number.isNaN(Number(param))) {
      return Number(param)
    }
    return param.trim()
  })

  if (fakerFunctions.includes(type)) {
    const fakerSubtypeFunctions = Object.keys(faker[type])

    if (fakerSubtypeFunctions.includes(subtype)) {
      if (subtype === 'arrayElement' || subtype === 'shuffle') {
        const fakerResult = faker[type][subtype](params)
        return getFakerFn(stringFn.replace(matches[0], fakerResult))
      } else {
        const fakerResult = faker[type][subtype](...params)
        return getFakerFn(stringFn.replace(matches[0], fakerResult))
      }
    }
  }

  return stringFn
}

export const replaceRawFakerExpressions = string => {
  const rawFakerExpressions = string.match(/{{(faker.*?)}}/g)
  if (rawFakerExpressions) {
    rawFakerExpressions.forEach(expr => {
      const code = expr.replace(/{{|}}/g, '')
      const result = evalCode(code)
      if (result !== code) string = string.replace(expr, result)
    })
  }
  return string
}

export const parseFakerBody = body => {
  if (body && typeof body === 'object') {
    Object.entries(body).forEach(([key, value]) => {
      if (typeof body[key] === 'string') {
        let result = getFakerFn(value)
        result = replaceRawFakerExpressions(result)
        body[key] = result || value
      } else if (typeof body[key] === 'object') {
        parseFakerBody(body[key])
      }
    })
  }

  return body || {}
}

export const getNestedValue = (obj, path) => {
  if (typeof obj !== 'object' || obj === null) {
    return undefined
  }

  if (typeof path === 'string') {
    path = path.split('.')
  }

  if (!Array.isArray(path) || path.length === 0) {
    return undefined
  }

  let currentObj = obj
  for (let key of path) {
    if (typeof currentObj[key] === 'undefined') {
      return undefined
    }
    currentObj = currentObj[key]
  }

  return currentObj
}

const evaluateRule = ({ rule, requestBody, query, headers, urlParams, endpointHeaders }) => {
  let propertyValue = null

  if (rule.source === allowedRuleSources.body) {
    propertyValue = getNestedValue(requestBody, rule.property)
  }

  if (rule.source === allowedRuleSources.queryString) {
    propertyValue = query[rule.property]
  }

  if (rule.source === allowedRuleSources.header) {
    propertyValue = headers[rule.property.toLowerCase()] || headers[rule.property]
  }

  if (rule.source === allowedRuleSources.urlParam) {
    propertyValue = urlParams[rule.property]
  }

  if (
    rule.comparator === allowedRuleComparators.equal &&
    propertyValue == rule.value &&
    rule.source !== allowedRuleSources.xmlTag
  ) {
    return true
  }

  if (
    rule.comparator === allowedRuleComparators.distinct &&
    propertyValue != rule.value &&
    rule.source !== allowedRuleSources.xmlTag
  ) {
    return true
  }

  if (
    rule.comparator === allowedRuleComparators.includes &&
    rule.value &&
    typeof rule.value === 'string' &&
    rule.value
      .split(',')
      .map(item => item.trim())
      .find(item => item == propertyValue) &&
    rule.source !== allowedRuleSources.xmlTag
  ) {
    return true
  }

  if (isContentTypeXML(endpointHeaders) && rule.source === allowedRuleSources.xmlTag) {
    const tagName = rule.value
    const xml = new DOMParser().parseFromString(requestBody)

    if (xml) {
      const existsTag = xml.getElementsByTagName(tagName).length > 0

      if (rule.comparator === allowedRuleComparators.equal && existsTag) {
        return true
      }

      if (rule.comparator === allowedRuleComparators.distinct && !existsTag) {
        return true
      }
    }
  }

  if (
    isContentTypeXML(endpointHeaders) &&
    rule.source === allowedRuleSources.xPath &&
    requestBody &&
    typeof requestBody === 'string'
  ) {
    const xml = new DOMParser().parseFromString(requestBody)

    if (xml) {
      const found = xpath.select(rule.value, xml)

      return found && found.length > 0
    }
  }

  return false
}

export const getResponseThatMatchWithARule = (
  requestBody,
  query = {},
  headers,
  urlParams,
  responses,
  endpointHeaders = []
) => {
  let matchedResponse = null

  responses?.forEach(response => {
    response?.rules?.forEach(rule => {
      const mainRuleMatch = evaluateRule({ rule, requestBody, query, headers, urlParams, endpointHeaders })

      let andConditionsMatch = true
      if (rule?.andConditions?.length > 0) {
        andConditionsMatch = rule.andConditions.every(cond =>
          evaluateRule({ rule: cond, requestBody, query, headers, urlParams, endpointHeaders })
        )
      }

      if (mainRuleMatch && andConditionsMatch) {
        matchedResponse = response
      }
    })
  })

  return matchedResponse
}

export const getURLParams = (url, endpointPath) => {
  const urlParts = url.split('?')[0].split('/')
  const pathParts = endpointPath.split('/')
  let result = {}

  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i][0] === ':') {
      result[pathParts[i].substring(1)] = urlParts[i]
    }
  }

  return result
}

export const replaceFakeDates = body => {
  if (Array.isArray(body)) {
    return body.map(item => replaceFakeDates(item))
  } else if (typeof body === 'object' && body !== null) {
    return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, replaceFakeDates(value)]))
  } else if (typeof body === 'string') {
    if (/^{{new\s+Intl.DateTimeFormat\s*/.test(body) || /^{{new\s+Date\s*/.test(body)) {
      return evalCode(body.replace('{{', '').replace('}}', ''))
    }
  }

  return body
}

export const FILTERS = {
  substring: (v, a, b) => {
    if (typeof v !== 'string') return v
    const start = Number(a)
    const end = b !== undefined ? Number(b) : undefined
    return v.substring(start, end)
  },
  slice: (v, a, b) => {
    if (typeof v !== 'string' && !Array.isArray(v)) return v
    const start = Number(a)
    const end = b !== undefined ? Number(b) : undefined
    return v.slice(start, end)
  },
  upper: v => (typeof v === 'string' ? v.toUpperCase() : v),
  lower: v => (typeof v === 'string' ? v.toLowerCase() : v),
  trim: v => (typeof v === 'string' ? v.trim() : v),
  default: (v, d) => (v === undefined || v === null || v === '' ? d : v),
}

export const applyFilters = (value, filterParts) =>
  filterParts.reduce((acc, f) => {
    const [name, argsStr] = f.trim().split(':')
    const fn = FILTERS[name.trim()]
    if (!fn) return acc
    const args = argsStr ? argsStr.split(',').map(s => s.trim()) : []
    return fn(acc, ...args)
  }, value)

// Resolves `{{rootKey.a.b | filter:arg | ...}}` (or `{{:a.b | ...}}` when `prefix` is set)
// against `source`. Returns { matched: false } when the prefix differs, the path is
// empty (e.g. bare `{{body}}`), or any segment is missing (unless the filter chain
// contains `default:...`, which rescues the miss). The caller keeps the placeholder
// intact whenever we return matched:false.
export const resolvePlaceholder = (expr, source, { rootKey, prefix, caseInsensitive = false } = {}) => {
  const [pathPart, ...filterParts] = expr.split('|')
  const trimmed = pathPart.trim()

  let parts
  if (prefix) {
    if (!trimmed.startsWith(prefix)) return { matched: false }
    parts = trimmed.slice(prefix.length).split('.')
  } else {
    parts = trimmed.split('.')
    if (parts[0] !== rootKey) return { matched: false }
    parts.shift()
    if (parts.length === 0) return { matched: false }
  }

  const hasDefaultFilter = filterParts.some(f => f.trim().split(':')[0].trim() === 'default')

  let current = source
  for (const part of parts) {
    const key = caseInsensitive ? part.toLowerCase() : part
    if (current == null || current[key] === undefined) {
      if (hasDefaultFilter) return { matched: true, value: applyFilters(undefined, filterParts) }
      return { matched: false }
    }
    current = current[key]
  }
  return { matched: true, value: applyFilters(current, filterParts) }
}

const buildReplacer = ({ rootKey, prefix, caseInsensitive = false, singlePlaceholderPreservesType = true } = {}) => {
  const opts = { rootKey, prefix, caseInsensitive }
  const replace = (body, source) => {
    if (Array.isArray(body)) return body.map(item => replace(item, source))
    if (typeof body === 'object' && body !== null) {
      return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, replace(v, source)]))
    }
    if (typeof body !== 'string') return body

    if (singlePlaceholderPreservesType) {
      const single = body.match(/^{{([^}]+)}}$/)
      if (single) {
        const r = resolvePlaceholder(single[1], source, opts)
        if (r.matched) return r.value
      }
    }

    return body.replace(/{{([^}]+)}}/g, (raw, expr) => {
      const r = resolvePlaceholder(expr, source, opts)
      return r.matched ? r.value : raw
    })
  }
  return replace
}

export const replaceBodyWithRequestBody = buildReplacer({ rootKey: 'body' })

export const replaceBodyWithHeadersValue = buildReplacer({
  rootKey: 'reqHeaders',
  caseInsensitive: true,
  singlePlaceholderPreservesType: false,
})

export const replaceBodyWithEnvVars = buildReplacer({ rootKey: 'env' })

export const replaceBodyWithSearchParamsValue = buildReplacer({
  rootKey: 'searchParam',
  singlePlaceholderPreservesType: false,
})

export const replaceBodyWithURLParamsValue = buildReplacer({
  prefix: ':',
  singlePlaceholderPreservesType: false,
})

export const getRandomResponse = responses => {
  if (!responses || !responses.length) return null

  const randomIndex = Math.floor(Math.random() * responses.length)
  return responses[randomIndex]
}

// Offline adaptation of the backend's `getResponseId`: responses live in memory, so we
// return the response object itself instead of an ObjectId to look up afterwards.
export const getResponse = ({ req, urlParams, endpoint }) => {
  const responses = endpoint.responses.filter(r => r.isEnabled || r.isEnabled === undefined)

  if (endpoint?.returnRandomResponse) {
    const randomResponse = getRandomResponse(responses)
    if (randomResponse) return randomResponse
  }

  return (
    getResponseThatMatchWithARule(req.body, req.query, req.headers, urlParams, responses, endpoint.headers) ||
    endpoint?.defaultResponse ||
    null
  )
}

const extractNamespaces = xmlDoc => {
  const nsMap = {}
  const attrs = xmlDoc.documentElement.attributes

  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (attr.name.startsWith('xmlns:')) {
      const prefix = attr.name.split(':')[1]
      nsMap[prefix] = attr.value
    } else if (attr.name === 'xmlns') {
      nsMap[''] = attr.value
    }
  }

  return nsMap
}

export const replaceBodyWithXPathValues = (body, reqBody) => {
  if (reqBody && typeof reqBody === 'string') {
    const xml = new DOMParser().parseFromString(reqBody)
    const namespaces = extractNamespaces(xml)
    const select = xpath.useNamespaces(namespaces)

    if (xml && body && typeof body === 'string') {
      const xpathExpressions = body.match(/{{XPath[\s\S]*?}}/g)

      if (xpathExpressions) {
        xpathExpressions.forEach(expr => {
          const exprClean = expr.replace(/^{{XPath\s*|\s*}}$/g, '').trim()
          const result = select(exprClean, xml)

          if (result && result?.length) {
            body = body.replace(expr, result[0].toString())
          }
        })
      }
    }
  }

  return body
}
