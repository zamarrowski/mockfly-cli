// Mirrors mockfly-backend: src/vm/constants.js
export const REGEX_MATCH_TIMEOUT_IN_MS = 50

export const REGEX_MATCH_SOURCE = 'new RegExp(pattern).test(value)'

export const EXPRESSION_TIMEOUT_IN_MS = 100

export const EVALUATOR_BOOT_TIMEOUT_IN_MS = 5000

export const EVALUATOR_MAX_HEAP_IN_MB = 128

export const TIMED_OUT_EXPRESSION_TTL_IN_SECONDS = 600

export const MAX_RESULT_SIZE = 1000000

export const signalIndexes = { ready: 0, response: 1 }

export const tokenTypes = {
  number: 'number',
  string: 'string',
  identifier: 'identifier',
  regex: 'regex',
  punctuator: 'punctuator',
  end: 'end',
}

export const nodeTypes = {
  literal: 'literal',
  regex: 'regex',
  identifier: 'identifier',
  array: 'array',
  object: 'object',
  member: 'member',
  call: 'call',
  construct: 'construct',
  unary: 'unary',
  binary: 'binary',
}

export const punctuators = {
  dot: '.',
  comma: ',',
  colon: ':',
  openParen: '(',
  closeParen: ')',
  openBracket: '[',
  closeBracket: ']',
  openBrace: '{',
  closeBrace: '}',
  plus: '+',
  minus: '-',
  star: '*',
  slash: '/',
}

export const PUNCTUATORS = Object.values(punctuators)

export const VALUE_ENDING_PUNCTUATORS = [punctuators.closeParen, punctuators.closeBracket, punctuators.closeBrace]

export const POSTFIX_OPERATORS = [punctuators.dot, punctuators.openBracket, punctuators.openParen]

export const ADDITIVE_OPERATORS = [punctuators.plus, punctuators.minus]

export const MULTIPLICATIVE_OPERATORS = [punctuators.star, punctuators.slash]

export const STRING_ESCAPES = { n: '\n', t: '\t', r: '\r' }

export const KEYWORD_LITERALS = { true: true, false: false, null: null, undefined: undefined }

export const NEW_KEYWORD = 'new'

export const BIGINT_SUFFIX = 'n'

export const BLOCKED_PROPERTY_NAMES = [
  'constructor',
  'prototype',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'caller',
  'callee',
  'arguments',
  'call',
  'apply',
  'bind',
  'seed',
  'setDefaultRefDate',
]
