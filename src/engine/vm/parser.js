// Mirrors mockfly-backend: src/vm/parser.js
import {
  ADDITIVE_OPERATORS,
  KEYWORD_LITERALS,
  MULTIPLICATIVE_OPERATORS,
  NEW_KEYWORD,
  POSTFIX_OPERATORS,
  nodeTypes,
  punctuators,
  tokenTypes,
} from './constants.js'
import { buildSyntaxError, tokenize } from './tokenizer.js'

const OBJECT_KEY_TOKEN_TYPES = [tokenTypes.identifier, tokenTypes.string, tokenTypes.number]

const peek = cursor => cursor.tokens[cursor.index]

const advance = cursor => cursor.tokens[cursor.index++]

const isPunctuator = (token, value) => token.type === tokenTypes.punctuator && token.value === value

const isOneOfPunctuators = (token, values) => token.type === tokenTypes.punctuator && values.includes(token.value)

const describeToken = token => (token.type === tokenTypes.end ? 'end of expression' : `token "${token.value}"`)

const buildUnexpectedTokenError = token => buildSyntaxError(`Unexpected ${describeToken(token)}`, token.position)

const expectPunctuator = (cursor, value) => {
  const token = advance(cursor)

  if (!isPunctuator(token, value)) throw buildUnexpectedTokenError(token)

  return token
}

const expectIdentifier = cursor => {
  const token = advance(cursor)

  if (token.type !== tokenTypes.identifier) throw buildUnexpectedTokenError(token)

  return token.value
}

const buildLiteral = value => ({ type: nodeTypes.literal, value })

const buildIdentifier = name => ({ type: nodeTypes.identifier, name })

const buildMember = (object, property) => ({ type: nodeTypes.member, object, property })

const parseSeparatedList = (cursor, closing, parseItem) => {
  const items = []

  while (!isPunctuator(peek(cursor), closing)) {
    items.push(parseItem(cursor))

    if (!isPunctuator(peek(cursor), closing)) expectPunctuator(cursor, punctuators.comma)
  }

  advance(cursor)

  return items
}

const parseArguments = cursor => parseSeparatedList(cursor, punctuators.closeParen, parseExpression)

const parseArray = cursor => ({
  type: nodeTypes.array,
  elements: parseSeparatedList(cursor, punctuators.closeBracket, parseExpression),
})

const parseProperty = cursor => {
  const keyToken = advance(cursor)

  if (!OBJECT_KEY_TOKEN_TYPES.includes(keyToken.type)) throw buildUnexpectedTokenError(keyToken)

  expectPunctuator(cursor, punctuators.colon)

  return { key: String(keyToken.value), value: parseExpression(cursor) }
}

const parseObject = cursor => ({
  type: nodeTypes.object,
  properties: parseSeparatedList(cursor, punctuators.closeBrace, parseProperty),
})

const parseConstructorReference = cursor => {
  let node = buildIdentifier(expectIdentifier(cursor))

  while (isPunctuator(peek(cursor), punctuators.dot)) {
    advance(cursor)
    node = buildMember(node, buildLiteral(expectIdentifier(cursor)))
  }

  return node
}

const parseConstruct = cursor => {
  const callee = parseConstructorReference(cursor)

  expectPunctuator(cursor, punctuators.openParen)

  return { type: nodeTypes.construct, callee, args: parseArguments(cursor) }
}

const parseGroup = cursor => {
  const node = parseExpression(cursor)

  expectPunctuator(cursor, punctuators.closeParen)

  return node
}

const parseIdentifierOrKeyword = (cursor, token) => {
  if (token.value === NEW_KEYWORD) return parseConstruct(cursor)
  if (Object.hasOwn(KEYWORD_LITERALS, token.value)) return buildLiteral(KEYWORD_LITERALS[token.value])

  return buildIdentifier(token.value)
}

const parsePrimary = cursor => {
  const token = advance(cursor)

  if (token.type === tokenTypes.number || token.type === tokenTypes.string) return buildLiteral(token.value)
  if (token.type === tokenTypes.regex) return { type: nodeTypes.regex, ...token.value }
  if (token.type === tokenTypes.identifier) return parseIdentifierOrKeyword(cursor, token)
  if (isPunctuator(token, punctuators.openParen)) return parseGroup(cursor)
  if (isPunctuator(token, punctuators.openBracket)) return parseArray(cursor)
  if (isPunctuator(token, punctuators.openBrace)) return parseObject(cursor)

  throw buildUnexpectedTokenError(token)
}

const parseComputedProperty = cursor => {
  const property = parseExpression(cursor)

  expectPunctuator(cursor, punctuators.closeBracket)

  return property
}

const parsePostfixOperation = (cursor, object) => {
  const operator = advance(cursor).value

  if (operator === punctuators.dot) return buildMember(object, buildLiteral(expectIdentifier(cursor)))
  if (operator === punctuators.openBracket) return buildMember(object, parseComputedProperty(cursor))

  return { type: nodeTypes.call, callee: object, args: parseArguments(cursor) }
}

const parsePostfix = cursor => {
  let node = parsePrimary(cursor)

  while (isOneOfPunctuators(peek(cursor), POSTFIX_OPERATORS)) node = parsePostfixOperation(cursor, node)

  return node
}

const parseUnary = cursor => {
  if (!isPunctuator(peek(cursor), punctuators.minus)) return parsePostfix(cursor)

  advance(cursor)

  return { type: nodeTypes.unary, operator: punctuators.minus, argument: parseUnary(cursor) }
}

const parseBinary = (cursor, operators, parseOperand) => {
  let node = parseOperand(cursor)

  while (isOneOfPunctuators(peek(cursor), operators)) {
    const operator = advance(cursor).value

    node = { type: nodeTypes.binary, operator, left: node, right: parseOperand(cursor) }
  }

  return node
}

const parseMultiplicative = cursor => parseBinary(cursor, MULTIPLICATIVE_OPERATORS, parseUnary)

const parseExpression = cursor => parseBinary(cursor, ADDITIVE_OPERATORS, parseMultiplicative)

export const parse = code => {
  const cursor = { tokens: tokenize(code), index: 0 }
  const node = parseExpression(cursor)

  if (peek(cursor).type !== tokenTypes.end) throw buildUnexpectedTokenError(peek(cursor))

  return node
}
