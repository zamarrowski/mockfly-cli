// Mirrors mockfly-backend: src/responses/constants.js + src/endpoints/constants.js.
// Kept in sync by hand — the CLI intentionally duplicates the engine instead of
// sharing a package with the backend.

export const allowedRuleComparators = {
  equal: 'equal',
  distinct: 'distinct',
  includes: 'includes',
  contains: 'contains',
  notContains: 'notContains',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  regex: 'regex',
  greaterThan: 'greaterThan',
  greaterOrEqual: 'greaterOrEqual',
  lessThan: 'lessThan',
  lessOrEqual: 'lessOrEqual',
  exists: 'exists',
  notExists: 'notExists',
  isEmpty: 'isEmpty',
  isNotEmpty: 'isNotEmpty',
}

export const allowedRuleSources = {
  body: 'body',
  queryString: 'queryString',
  urlParam: 'urlParam',
  header: 'header',
  jsonPath: 'jsonPath',
  xmlTag: 'xmlTag',
  xPath: 'xPath',
}

// jsep instead of eval: a filter expression cannot reach eval, Function or a global.
export const JSON_PATH_EVAL_MODE = 'safe'

export const ALLOWED_XML_CONTENT_TYPE_HEADER_VALES = ['application/xml', 'text/xml; charset=utf-8', 'text/xml']

export const PROXY_CONFIGURATION_VALUES = {
  default: 'default',
  useProxy: 'useProxy',
  useMock: 'useMock',
}
