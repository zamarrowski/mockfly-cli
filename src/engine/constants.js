// Mirrors mockfly-backend: src/responses/constants.js + src/endpoints/constants.js.
// Kept in sync by hand — the CLI intentionally duplicates the engine instead of
// sharing a package with the backend.

export const allowedRuleComparators = {
  equal: 'equal',
  distinct: 'distinct',
  includes: 'includes',
}

export const allowedRuleSources = {
  body: 'body',
  queryString: 'queryString',
  urlParam: 'urlParam',
  header: 'header',
  xmlTag: 'xmlTag',
  xPath: 'xPath',
}

export const ALLOWED_XML_CONTENT_TYPE_HEADER_VALES = ['application/xml', 'text/xml; charset=utf-8', 'text/xml']

export const PROXY_CONFIGURATION_VALUES = {
  default: 'default',
  useProxy: 'useProxy',
  useMock: 'useMock',
}
