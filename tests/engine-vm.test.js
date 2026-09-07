import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nodeTypes, tokenTypes } from '../src/engine/vm/constants.js'
import { assertPropertyAllowed, evaluate } from '../src/engine/vm/evaluator.js'
import { evaluateExpression, resolveExpression } from '../src/engine/vm/index.js'
import { parse } from '../src/engine/vm/parser.js'
import { tokenize } from '../src/engine/vm/tokenizer.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('tokenize', () => {
  it('tokenizes identifiers, punctuators and numbers with their positions', () => {
    assert.deepEqual(tokenize('faker.number.int(10)'), [
      { type: tokenTypes.identifier, value: 'faker', position: 0 },
      { type: tokenTypes.punctuator, value: '.', position: 5 },
      { type: tokenTypes.identifier, value: 'number', position: 6 },
      { type: tokenTypes.punctuator, value: '.', position: 12 },
      { type: tokenTypes.identifier, value: 'int', position: 13 },
      { type: tokenTypes.punctuator, value: '(', position: 16 },
      { type: tokenTypes.number, value: 10, position: 17 },
      { type: tokenTypes.punctuator, value: ')', position: 19 },
      { type: tokenTypes.end, value: null, position: 20 },
    ])
  })

  it('reads a decimal number as a single token', () => {
    assert.deepEqual(tokenize('1.5').slice(0, -1), [{ type: tokenTypes.number, value: 1.5, position: 0 }])
  })

  it('keeps the dot as a punctuator when a number is followed by an identifier', () => {
    assert.deepEqual(tokenize('1.toFixed').slice(0, -1), [
      { type: tokenTypes.number, value: 1, position: 0 },
      { type: tokenTypes.punctuator, value: '.', position: 1 },
      { type: tokenTypes.identifier, value: 'toFixed', position: 2 },
    ])
  })

  it('reads single and double quoted strings', () => {
    assert.deepEqual(tokenize(`'es-ES' "en-US"`).slice(0, -1), [
      { type: tokenTypes.string, value: 'es-ES', position: 0 },
      { type: tokenTypes.string, value: 'en-US', position: 8 },
    ])
  })

  it('unescapes the supported escape sequences inside a string', () => {
    assert.equal(tokenize(`'a\\nb\\tc\\rd\\'e\\\\f'`)[0].value, `a\nb\tc\rd'e\\f`)
  })

  it('skips whitespace between tokens', () => {
    assert.deepEqual(
      tokenize('  a ,\t b \n').map(token => token.value),
      ['a', ',', 'b', null]
    )
  })

  it('reads identifiers with underscores, dollars and digits', () => {
    assert.deepEqual(tokenize('$ref_1').slice(0, -1), [{ type: tokenTypes.identifier, value: '$ref_1', position: 0 }])
  })

  it('rejects a string that is not terminated', () => {
    assert.throws(() => tokenize(`'abc`), { message: 'Unterminated string at position 0' })
  })

  it('rejects a string that ends with an escape character', () => {
    assert.throws(() => tokenize(`'abc\\`), { message: 'Unterminated string at position 0' })
  })

  it('rejects a character that is not part of the grammar', () => {
    assert.throws(() => tokenize('a @ b'), { message: 'Unexpected character "@" at position 2' })
  })

  it('rejects a template literal', () => {
    assert.throws(() => tokenize('`${1}`'), { message: 'Unexpected character "`" at position 0' })
  })

  it('rejects a statement separator', () => {
    assert.throws(() => tokenize('a(); b()'), { message: 'Unexpected character ";" at position 3' })
  })
})

const literal = value => ({ type: nodeTypes.literal, value })
const identifier = name => ({ type: nodeTypes.identifier, name })
const member = (object, property) => ({ type: nodeTypes.member, object, property })
const call = (callee, args) => ({ type: nodeTypes.call, callee, args })
const construct = (callee, args) => ({ type: nodeTypes.construct, callee, args })
const binary = (operator, left, right) => ({ type: nodeTypes.binary, operator, left, right })
const unary = argument => ({ type: nodeTypes.unary, operator: '-', argument })

describe('parse', () => {
  it('parses a member chain ending in a call without arguments', () => {
    assert.deepEqual(
      parse('faker.person.firstName()'),
      call(member(member(identifier('faker'), literal('person')), literal('firstName')), [])
    )
  })

  it('parses literal arguments of every supported kind', () => {
    assert.deepEqual(
      parse(`fn(1, 'a', "b", true, false, null, undefined)`),
      call(identifier('fn'), [
        literal(1),
        literal('a'),
        literal('b'),
        literal(true),
        literal(false),
        literal(null),
        literal(undefined),
      ])
    )
  })

  it('parses a computed member access', () => {
    assert.deepEqual(parse(`list[0]['key']`), member(member(identifier('list'), literal(0)), literal('key')))
  })

  it('parses chained calls on the result of a call', () => {
    const recent = call(member(member(identifier('faker'), literal('date')), literal('recent')), [])
    const iso = call(member(recent, literal('toISOString')), [])

    assert.deepEqual(
      parse(`faker.date.recent().toISOString().split('T')[0]`),
      member(call(member(iso, literal('split')), [literal('T')]), literal(0))
    )
  })

  it('parses array literals and tolerates a trailing comma', () => {
    assert.deepEqual(parse(`['cat', 'dog',]`), { type: nodeTypes.array, elements: [literal('cat'), literal('dog')] })
  })

  it('parses object literals with identifier, string and number keys', () => {
    assert.deepEqual(parse(`{ min: 1, 'max': 2, 3: false }`), {
      type: nodeTypes.object,
      properties: [
        { key: 'min', value: literal(1) },
        { key: 'max', value: literal(2) },
        { key: '3', value: literal(false) },
      ],
    })
  })

  it('parses nested object literals as arguments', () => {
    assert.deepEqual(parse(`faker.string.numeric({ length: { min: 5, max: 10 } })`).args[0], {
      type: nodeTypes.object,
      properties: [
        {
          key: 'length',
          value: {
            type: nodeTypes.object,
            properties: [
              { key: 'min', value: literal(5) },
              { key: 'max', value: literal(10) },
            ],
          },
        },
      ],
    })
  })

  it('parses a construct expression with a dotted constructor and a method call on it', () => {
    assert.deepEqual(
      parse(`new Intl.DateTimeFormat('es-ES').format(new Date())`),
      call(
        member(construct(member(identifier('Intl'), literal('DateTimeFormat')), [literal('es-ES')]), literal('format')),
        [construct(identifier('Date'), [])]
      )
    )
  })

  it('gives multiplication precedence over addition and binds the unary minus to its operand', () => {
    assert.deepEqual(parse('1 + 2 * -3'), binary('+', literal(1), binary('*', literal(2), unary(literal(3)))))
  })

  it('associates additive operators to the left', () => {
    assert.deepEqual(parse('1 - 2 - 3'), binary('-', binary('-', literal(1), literal(2)), literal(3)))
  })

  it('lets parentheses override the precedence', () => {
    assert.deepEqual(parse('(1 + 2) / 3'), binary('/', binary('+', literal(1), literal(2)), literal(3)))
  })

  it('rejects tokens left after the expression', () => {
    assert.throws(() => parse('1 2'), { message: 'Unexpected token "2" at position 2' })
  })

  it('rejects an expression that ends after a dot', () => {
    assert.throws(() => parse('faker.'), { message: 'Unexpected end of expression at position 6' })
  })

  it('rejects a construct expression without an argument list', () => {
    assert.throws(() => parse('new Date'), { message: 'Unexpected end of expression at position 8' })
  })

  it('rejects a dotted constructor that is not an identifier', () => {
    assert.throws(() => parse('new Intl.()'), { message: 'Unexpected token "(" at position 9' })
  })

  it('rejects an object literal shorthand property', () => {
    assert.throws(() => parse('{ min }'), { message: 'Unexpected token "}" at position 6' })
  })

  it('rejects a computed object literal key', () => {
    assert.throws(() => parse('{ [a]: 1 }'), { message: 'Unexpected token "[" at position 2' })
  })

  it('rejects list items that are not separated by commas', () => {
    assert.throws(() => parse('[1 2]'), { message: 'Unexpected token "2" at position 3' })
  })

  it('rejects a group that is not closed', () => {
    assert.throws(() => parse('(1'), { message: 'Unexpected end of expression at position 2' })
  })

  it('rejects a computed member access that is not closed', () => {
    assert.throws(() => parse('list[0'), { message: 'Unexpected end of expression at position 6' })
  })

  it('rejects an expression that starts with a closing punctuator', () => {
    assert.throws(() => parse(')'), { message: 'Unexpected token ")" at position 0' })
  })
})

describe('assertPropertyAllowed', () => {
  it('returns true for a regular property name', () => {
    assert.equal(assertPropertyAllowed('firstName'), true)
  })

  it('throws for every blocked property name', () => {
    for (const name of ['constructor', 'prototype', '__proto__', '__defineGetter__', 'caller', 'arguments', 'seed']) {
      assert.throws(() => assertPropertyAllowed(name), { message: `Access to "${name}" is not allowed` })
    }
  })
})

class Thing {}

const buildSandbox = () => ({
  globals: {
    Date,
    Intl,
    Math,
    Thing,
    sum: (left, right) => left + right,
    getThis() {
      return this
    },
    list: ['a', 'b'],
    user: {
      name: 'Ann',
      greet(prefix) {
        return `${prefix} ${this.name}`
      },
    },
  },
  constructors: [Date, Intl.DateTimeFormat],
})

const run = code => evaluate(parse(code), buildSandbox())

describe('evaluate', () => {
  it('evaluates literals to their value', () => {
    assert.equal(run(`'text'`), 'text')
    assert.equal(run('42'), 42)
    assert.equal(run('null'), null)
  })

  it('resolves an identifier from the sandbox globals', () => {
    assert.deepEqual(run('list'), ['a', 'b'])
  })

  it('rejects an identifier that is not a sandbox global', () => {
    assert.throws(() => run('process'), { message: 'Unknown identifier "process"' })
  })

  it('does not resolve identifiers through the prototype of the globals object', () => {
    assert.throws(() => run('toString'), { message: 'Unknown identifier "toString"' })
  })

  it('reads plain and computed members', () => {
    assert.equal(run('user.name'), 'Ann')
    assert.equal(run('list[1]'), 'b')
    assert.equal(run(`list['length']`), 2)
  })

  it('calls a method with the object it was read from as this', () => {
    assert.equal(run(`user.greet('Hi')`), 'Hi Ann')
  })

  it('calls methods on primitive values', () => {
    assert.equal(run(`'a-b'.split('-')[1].toUpperCase()`), 'B')
  })

  it('calls a function that is not a method without a this value', () => {
    assert.equal(run('sum(1, 2)'), 3)
    assert.equal(run('getThis()'), undefined)
  })

  it('rejects calling a value that is not a function', () => {
    assert.throws(() => run('user.name()'), { message: 'Cannot call a value that is not a function' })
  })

  it('rejects reading a member of null or undefined', () => {
    assert.throws(() => run('user.missing.deeper'), { message: 'Cannot read "deeper" of undefined' })
    assert.throws(() => run('null.anything'), { message: 'Cannot read "anything" of null' })
  })

  it('rejects a blocked property through a plain member access', () => {
    assert.throws(() => run('user.constructor'), { message: 'Access to "constructor" is not allowed' })
    assert.throws(() => run('Date.prototype'), { message: 'Access to "prototype" is not allowed' })
  })

  it('rejects a blocked property through a computed member access', () => {
    assert.throws(() => run(`user['__proto__']`), { message: 'Access to "__proto__" is not allowed' })
    assert.throws(() => run(`Math['const' + 'ructor']`), { message: 'Access to "constructor" is not allowed' })
  })

  it('rejects calling a blocked property', () => {
    assert.throws(() => run(`user.constructor.constructor('return process')()`), {
      message: 'Access to "constructor" is not allowed',
    })
  })

  it('evaluates array and object literals', () => {
    assert.deepEqual(run(`[1, 'two', [3]]`), [1, 'two', [3]])
    assert.deepEqual(run(`{ min: 1, nested: { max: 2 } }`), { min: 1, nested: { max: 2 } })
  })

  it('rejects an object literal with a blocked key', () => {
    assert.throws(() => run('{ __proto__: { polluted: true } }'), { message: 'Access to "__proto__" is not allowed' })
  })

  it('constructs an allowed constructor', () => {
    assert.equal(run('new Date(0).getTime()'), 0)
    assert.equal(run(`new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(new Date(0))`), '1/1/1970')
  })

  it('rejects constructing something outside the allowed constructors', () => {
    assert.throws(() => run('new Thing()'), { message: 'Constructor is not allowed' })
    assert.throws(() => run('new Intl.NumberFormat()'), { message: 'Constructor is not allowed' })
  })

  it('evaluates arithmetic and concatenation', () => {
    assert.equal(run('-(1 + 2) * 3'), -9)
    assert.equal(run('10 / 4 - 1'), 1.5)
    assert.equal(run(`'user-' + 42`), 'user-42')
  })
})

describe('evaluateExpression', () => {
  it('resolves a faker call without arguments', () => {
    assert.match(evaluateExpression('faker.person.firstName()'), /\S+/)
  })

  it('resolves a faker call with a nested object argument', () => {
    assert.match(evaluateExpression('faker.string.numeric({ length: { min: 5, max: 10 } })'), /^\d{5,10}$/)
  })

  it('resolves a faker call with a numeric range argument', () => {
    assert.ok([1, 2].includes(evaluateExpression('faker.number.int({ min: 1, max: 2 })')))
  })

  it('resolves a faker call with an array argument', () => {
    assert.ok(
      ['cat', 'dog', 'mouse'].includes(evaluateExpression(`faker.helpers.arrayElement(['cat', 'dog', 'mouse'])`))
    )
  })

  it('resolves a faker call that returns an array', () => {
    assert.deepEqual([...evaluateExpression(`faker.helpers.shuffle(['cat', 'dog', 'mouse'])`)].sort(), [
      'cat',
      'dog',
      'mouse',
    ])
  })

  it('resolves a method called on the result of a faker call', () => {
    assert.match(evaluateExpression('faker.date.recent().toISOString()'), ISO_DATE)
  })

  it('resolves a chain of calls and a computed index', () => {
    assert.match(evaluateExpression(`faker.date.recent().toISOString().split('T')[0]`), /^\d{4}-\d{2}-\d{2}$/)
  })

  it('resolves the concatenation of two faker calls', () => {
    assert.match(evaluateExpression(`faker.person.firstName() + ' ' + faker.person.lastName()`), /^\S+ \S+/)
  })

  it('resolves a Date method to its raw value', () => {
    assert.match(evaluateExpression('new Date().toISOString()'), ISO_DATE)
    assert.equal(typeof evaluateExpression('new Date().getTime()'), 'number')
    assert.equal(evaluateExpression('new Date(0).getUTCFullYear()'), 1970)
  })

  it('resolves date arithmetic', () => {
    assert.equal(evaluateExpression('new Date().getFullYear() - 18'), new Date().getFullYear() - 18)
    assert.match(evaluateExpression('new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()'), ISO_DATE)
  })

  it('resolves Intl.DateTimeFormat with a locale', () => {
    assert.match(
      evaluateExpression(`new Intl.DateTimeFormat('es-ES').format(new Date(0))`),
      /^\d{1,2}\/\d{1,2}\/\d{4}$/
    )
  })

  it('resolves Intl.DateTimeFormat with an options object', () => {
    assert.equal(
      evaluateExpression(
        `new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(0))`
      ),
      '1 de enero de 1970'
    )
  })

  it('resolves Intl.DateTimeFormat formatting the current date', () => {
    assert.match(
      evaluateExpression(
        `new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Australia/Sydney' }).format()`
      ),
      /GMT\+1[01]$/
    )
  })

  it('rejects an identifier outside the sandbox', () => {
    assert.throws(() => evaluateExpression('process.exit()'), { message: 'Unknown identifier "process"' })
    assert.throws(() => evaluateExpression('this'), { message: 'Unknown identifier "this"' })
  })

  it('rejects reaching Function through a constructor', () => {
    assert.throws(() => evaluateExpression(`faker.constructor.constructor('return process')()`), {
      message: 'Access to "constructor" is not allowed',
    })
  })

  it('rejects mutating the shared faker state', () => {
    assert.throws(() => evaluateExpression('faker.seed(1)'), { message: 'Access to "seed" is not allowed' })
    assert.throws(() => evaluateExpression('faker.setDefaultRefDate(new Date(0))'), {
      message: 'Access to "setDefaultRefDate" is not allowed',
    })
  })

  it('rejects a constructor that is not Date or Intl.DateTimeFormat', () => {
    assert.throws(() => evaluateExpression(`new Intl.NumberFormat('en')`), { message: 'Constructor is not allowed' })
  })

  it('rejects JavaScript syntax outside the expression grammar', () => {
    assert.throws(() => evaluateExpression('(() => 1)()'), /Unexpected character "="/)
    assert.throws(() => evaluateExpression('faker.person.firstName(); process.exit()'), /Unexpected character ";"/)
    assert.throws(() => evaluateExpression('faker.a === 1'), /Unexpected character "="/)
  })

  it('rejects a faker path that does not exist', () => {
    assert.throws(() => evaluateExpression('faker.this.does.not.exist()'), {
      message: 'Cannot read "does" of undefined',
    })
  })
})

describe('resolveExpression', () => {
  it('returns the value of a valid expression', () => {
    assert.equal(resolveExpression('new Date(0).getTime()'), 0)
  })

  it('returns the code untouched when the expression cannot be resolved', () => {
    assert.equal(resolveExpression('process.exit()'), 'process.exit()')
    assert.equal(resolveExpression('faker.this.does.not.exist()'), 'faker.this.does.not.exist()')
  })
})
