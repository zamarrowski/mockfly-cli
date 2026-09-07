// Mirrors mockfly-backend: src/vm/tokenizer.js
import { PUNCTUATORS, STRING_ESCAPES, tokenTypes } from './constants.js'

const SINGLE_QUOTE = "'"
const DOUBLE_QUOTE = '"'
const BACKSLASH = '\\'
const DECIMAL_SEPARATOR = '.'

const isDigit = char => char >= '0' && char <= '9'

const isIdentifierStart = char => /^[A-Za-z_$]$/.test(char)

const isIdentifierPart = char => isIdentifierStart(char) || isDigit(char)

const isWhitespace = char => /^\s$/.test(char)

const isQuote = char => char === SINGLE_QUOTE || char === DOUBLE_QUOTE

export const buildSyntaxError = (message, position) => new Error(`${message} at position ${position}`)

const buildToken = (type, value, position) => ({ type, value, position })

const skipWhile = (code, start, predicate) => {
  let end = start

  while (end < code.length && predicate(code[end])) end++

  return end
}

const readNumber = (code, start) => {
  let end = skipWhile(code, start, isDigit)

  if (code[end] === DECIMAL_SEPARATOR && isDigit(code[end + 1])) end = skipWhile(code, end + 1, isDigit)

  return { token: buildToken(tokenTypes.number, Number(code.slice(start, end)), start), end }
}

const readIdentifier = (code, start) => {
  const end = skipWhile(code, start, isIdentifierPart)

  return { token: buildToken(tokenTypes.identifier, code.slice(start, end), start), end }
}

const readEscapedCharacter = (code, position) => STRING_ESCAPES[code[position]] ?? code[position]

const readString = (code, start) => {
  const quote = code[start]
  let value = ''
  let position = start + 1

  while (position < code.length && code[position] !== quote) {
    const isEscape = code[position] === BACKSLASH

    if (isEscape) position++

    value += isEscape ? readEscapedCharacter(code, position) : code[position]
    position++
  }

  if (code[position] !== quote) throw buildSyntaxError('Unterminated string', start)

  return { token: buildToken(tokenTypes.string, value, start), end: position + 1 }
}

const readPunctuator = (code, start) => ({
  token: buildToken(tokenTypes.punctuator, code[start], start),
  end: start + 1,
})

const readToken = (code, position) => {
  const char = code[position]

  if (isDigit(char)) return readNumber(code, position)
  if (isIdentifierStart(char)) return readIdentifier(code, position)
  if (isQuote(char)) return readString(code, position)
  if (PUNCTUATORS.includes(char)) return readPunctuator(code, position)

  throw buildSyntaxError(`Unexpected character "${char}"`, position)
}

export const tokenize = code => {
  const tokens = []
  let position = skipWhile(code, 0, isWhitespace)

  while (position < code.length) {
    const { token, end } = readToken(code, position)

    tokens.push(token)
    position = skipWhile(code, end, isWhitespace)
  }

  tokens.push(buildToken(tokenTypes.end, null, position))

  return tokens
}
