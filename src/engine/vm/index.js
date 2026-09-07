// Mirrors mockfly-backend: src/vm/index.js
import { faker } from '@faker-js/faker'
import { Script } from 'vm'
import { REGEX_MATCH_SOURCE, REGEX_MATCH_TIMEOUT_IN_MS } from './constants.js'
import { evaluate } from './evaluator.js'
import { parse } from './parser.js'

const SANDBOX = { globals: { faker, Date, Intl, Math }, constructors: [Date, Intl.DateTimeFormat] }

const regexMatchScript = new Script(REGEX_MATCH_SOURCE)

export const evaluateExpression = code => evaluate(parse(code), SANDBOX)

export const resolveExpression = code => {
  try {
    return evaluateExpression(code)
  } catch {
    return code
  }
}

export const matchesRegex = (pattern, value) => {
  try {
    return regexMatchScript.runInNewContext({ pattern, value }, { timeout: REGEX_MATCH_TIMEOUT_IN_MS }) === true
  } catch {
    return false
  }
}
