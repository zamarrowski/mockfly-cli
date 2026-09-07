// Mirrors mockfly-backend: src/vm/constants.js
export const REGEX_MATCH_TIMEOUT_IN_MS = 50

export const REGEX_MATCH_SOURCE = 'new RegExp(pattern).test(value)'

export const tokenTypes = {
  number: 'number',
  string: 'string',
  identifier: 'identifier',
  punctuator: 'punctuator',
  end: 'end',
}

export const nodeTypes = {
  literal: 'literal',
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

export const POSTFIX_OPERATORS = [punctuators.dot, punctuators.openBracket, punctuators.openParen]

export const ADDITIVE_OPERATORS = [punctuators.plus, punctuators.minus]

export const MULTIPLICATIVE_OPERATORS = [punctuators.star, punctuators.slash]

export const STRING_ESCAPES = { n: '\n', t: '\t', r: '\r' }

export const KEYWORD_LITERALS = { true: true, false: false, null: null, undefined: undefined }

export const NEW_KEYWORD = 'new'

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
  'seed',
  'setDefaultRefDate',
]
