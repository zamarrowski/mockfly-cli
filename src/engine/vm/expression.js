// Mirrors mockfly-backend: src/vm/expression.js
import { faker } from '@faker-js/faker'
import { evaluate } from './evaluator.js'
import { parse } from './parser.js'

const SANDBOX = { globals: { faker, Date, Intl, Math }, constructors: [Date, Intl.DateTimeFormat] }

export const evaluateExpression = code => evaluate(parse(code), SANDBOX)
