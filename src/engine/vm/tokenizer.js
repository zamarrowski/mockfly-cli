// Mirrors mockfly-backend: src/vm/tokenizer.js
import {
  BIGINT_SUFFIX,
  PUNCTUATORS,
  STRING_ESCAPES,
  VALUE_ENDING_PUNCTUATORS,
  punctuators,
  tokenTypes,
} from './constants.js'

const SINGLE_QUOTE = "'"
const DOUBLE_QUOTE = '"'
const BACKSLASH = '\\'
const DECIMAL_SEPARATOR = '.'
const OPEN_CHARACTER_CLASS = '['
const CLOSE_CHARACTER_CLASS = ']'
const VALUE_TOKEN_TYPES = [tokenTypes.number, tokenTypes.string, tokenTypes.identifier, tokenTypes.regex]

const isDigit = char => char >= '0' && char <= '9'

const isLetter = char => /^[A-Za-z]$/.test(char)

const isIdentifierStart = char => /^[A-Za-z_$]$/.test(char)

const isIdentifierPart = char => isIdentifierStart(char) || isDigit(char)

const isWhitespace = char => /^\s$/.test(char)

const isQuote = char => char === SINGLE_QUOTE || char === DOUBLE_QUOTE

const isRegexDelimiter = char => char === punctuators.slash

const endsValue = token => {
  if (token === undefined) return false
  if (token.type === tokenTypes.punctuator) return VALUE_ENDING_PUNCTUATORS.includes(token.value)

  return VALUE_TOKEN_TYPES.includes(token.type)
}

export const buildSyntaxError = (message, position) => new Error(`${message} at position ${position}`)

const buildToken = (type, value, position) => ({ type, value, position })

const skipWhile = (code, start, predicate) => {
  let end = start

  while (end < code.length && predicate(code[end])) end++

  return end
}

const hasDecimals = (code, position) => code[position] === DECIMAL_SEPARATOR && isDigit(code[position + 1])

const readNumber = (code, start) => {
  const integerEnd = skipWhile(code, start, isDigit)

  if (code[integerEnd] === BIGINT_SUFFIX) {
    return { token: buildToken(tokenTypes.number, BigInt(code.slice(start, integerEnd)), start), end: integerEnd + 1 }
  }

  const end = hasDecimals(code, integerEnd) ? skipWhile(code, integerEnd + 1, isDigit) : integerEnd

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

const findRegexPatternEnd = (code, start) => {
  let position = start + 1
  let inCharacterClass = false

  while (position < code.length && (inCharacterClass || !isRegexDelimiter(code[position]))) {
    if (code[position] === BACKSLASH) position++
    else if (code[position] === OPEN_CHARACTER_CLASS) inCharacterClass = true
    else if (code[position] === CLOSE_CHARACTER_CLASS) inCharacterClass = false

    position++
  }

  return position
}

const readRegex = (code, start) => {
  const patternEnd = findRegexPatternEnd(code, start)

  if (!isRegexDelimiter(code[patternEnd])) throw buildSyntaxError('Unterminated regular expression', start)

  const flagsEnd = skipWhile(code, patternEnd + 1, isLetter)
  const value = { pattern: code.slice(start + 1, patternEnd), flags: code.slice(patternEnd + 1, flagsEnd) }

  return { token: buildToken(tokenTypes.regex, value, start), end: flagsEnd }
}

const readPunctuator = (code, start) => ({
  token: buildToken(tokenTypes.punctuator, code[start], start),
  end: start + 1,
})

const readToken = (code, position, previousToken) => {
  const char = code[position]

  if (isDigit(char)) return readNumber(code, position)
  if (isIdentifierStart(char)) return readIdentifier(code, position)
  if (isQuote(char)) return readString(code, position)
  if (isRegexDelimiter(char) && !endsValue(previousToken)) return readRegex(code, position)
  if (PUNCTUATORS.includes(char)) return readPunctuator(code, position)

  throw buildSyntaxError(`Unexpected character "${char}"`, position)
}

export const tokenize = code => {
  const tokens = []
  let position = skipWhile(code, 0, isWhitespace)

  while (position < code.length) {
    const { token, end } = readToken(code, position, tokens[tokens.length - 1])

    tokens.push(token)
    position = skipWhile(code, end, isWhitespace)
  }

  tokens.push(buildToken(tokenTypes.end, null, position))

  return tokens
}
