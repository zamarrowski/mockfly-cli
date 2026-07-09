// Offline replica of mockfly-backend's `handleMockRequest` (src/mocks/domain.js):
// same endpoint matching, response selection and body transformation chain, but
// endpoints/responses/env come from the in-memory projects loaded from the pulled
// JSON files instead of MongoDB. No plan limits, no request counters, no proxy.
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  getResponse,
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
  setHeaders,
} from './engine/index.js'
import { PROXY_CONFIGURATION_VALUES } from './engine/constants.js'
import { dim, statusColor } from './utils.js'

const ASSETS_DIR = fileURLToPath(new URL('../assets', import.meta.url))

const logRequest = ({ method, url, status, responseName }) => {
  const color = statusColor(status)
  console.log(`${method.padEnd(7)} ${url} ${dim('→')} ${color(status)}${responseName ? dim(` (${responseName})`) : ''}`)
}

const handleMockRequest = (project, req, res, { quiet }) => {
  try {
    const method = req.method
    const basePath = '/' + req.path.split('/').slice(2).join('/')
    const pathWithQuery = basePath + queryParamsToString(req.query)

    const endpoint = project.endpoints.filter(e => e.method === method).find(e => matchPath(e, pathWithQuery))

    if (!endpoint) {
      if (method === 'OPTIONS') return res.status(204).send()
      return res.status(404).json({ error: 'Error: Endpoint not found with that path and method' })
    }

    if (endpoint.proxyConfiguration === PROXY_CONFIGURATION_VALUES.useProxy && !quiet) {
      console.log(dim(`(offline) ${method} ${endpoint.path} is configured as proxy — serving the mock instead`))
    }

    const urlParams = getURLParams(pathWithQuery, endpoint.path)
    const response = getResponse({ req, urlParams, endpoint })

    setHeaders(res, endpoint.headers)

    setTimeout(() => {
      res.statusCode = response?.status || 200
      // In the backend every request gets a fresh document from Mongo; here responses
      // live in memory and `parseFakerBody` mutates, so clone before transforming.
      let body = response?.body !== undefined ? structuredClone(response.body) : undefined

      if (isContentTypeJSON(endpoint.headers)) {
        body = parseFakerBody(body)
        body = replaceFakeDates(body)
        body = replaceBodyWithURLParamsValue(body, urlParams)
        body = replaceBodyWithRequestBody(body, req?.body)
        body = replaceBodyWithEnvVars(body, project.environment || {})
        body = replaceBodyWithHeadersValue(body, req.headers)
        body = replaceBodyWithSearchParamsValue(body, req.query)
      } else if (isContentTypeXML(endpoint.headers)) {
        body = replaceBodyWithXPathValues(body, req.body)
      }

      if (!quiet) {
        logRequest({ method, url: req.path, status: res.statusCode, responseName: response?.name })
      }

      if (isContentTypeJSON(endpoint.headers)) {
        res.json(body)
      } else if (isContentTypePDF(endpoint.headers)) {
        res.download(path.join(ASSETS_DIR, 'sample.pdf'))
      } else if (isContentTypeCSV(endpoint.headers)) {
        res.download(path.join(ASSETS_DIR, 'sample.csv'))
      } else {
        res.send(body)
      }
    }, endpoint?.delay || 0)
  } catch (error) {
    if (req.method !== 'OPTIONS') {
      console.error(error)
      res.status(error.status || 500).json({ error: error.toString() })
    } else {
      res.status(204).send()
    }
  }
}

export const createApp = (projects, { quiet = false } = {}) => {
  const byKey = new Map()
  for (const project of projects) {
    byKey.set(project.slug, project)
    if (project.alias && !byKey.has(project.alias)) byKey.set(project.alias, project)
  }

  const app = express()
  app.disable('x-powered-by')

  // Mock servers are typically hit from browser apps in dev — allow everything.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
    res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*')
    next()
  })

  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(express.text({ type: ['text/xml', 'application/xml', 'application/soap+xml', 'text/plain'], limit: '10mb' }))

  app.get('/', (req, res) => {
    res.json({
      mockfly: 'offline',
      projects: projects.map(p => ({
        name: p.name,
        slug: p.slug,
        alias: p.alias,
        endpoints: p.endpoints.length,
        pulledAt: p.pulledAt,
      })),
    })
  })

  app.use((req, res, next) => {
    const key = req.path.split('/')[1]
    const project = byKey.get(key)

    if (!project) {
      if (req.method === 'OPTIONS') return res.status(204).send()
      return res.status(404).json({
        error: `Unknown project '${key}'.`,
        serving: projects.map(p => ({ slug: p.slug, alias: p.alias })),
      })
    }

    handleMockRequest(project, req, res, { quiet })
  })

  // Body-parser errors (e.g. malformed JSON) end up here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status || 400).json({ error: err.toString() })
  })

  return app
}
