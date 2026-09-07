// Mirrors mockfly-backend: src/vm/evaluator.js
import { BLOCKED_PROPERTY_NAMES, nodeTypes, punctuators } from './constants.js'

const BINARY_OPERATIONS = {
  [punctuators.plus]: (left, right) => left + right,
  [punctuators.minus]: (left, right) => left - right,
  [punctuators.star]: (left, right) => left * right,
  [punctuators.slash]: (left, right) => left / right,
}

export const assertPropertyAllowed = name => {
  if (BLOCKED_PROPERTY_NAMES.includes(name)) throw new Error(`Access to "${name}" is not allowed`)

  return true
}

const getProperty = (object, property) => {
  const name = String(property)

  assertPropertyAllowed(name)

  if (object === null || object === undefined) throw new Error(`Cannot read "${name}" of ${object}`)

  return object[name]
}

const setProperty = (object, key, value) => {
  assertPropertyAllowed(key)
  object[key] = value

  return object
}

const callFunction = (fn, thisArgument, args) => {
  if (typeof fn !== 'function') throw new Error('Cannot call a value that is not a function')

  return Reflect.apply(fn, thisArgument, args)
}

const evaluateLiteral = node => node.value

const evaluateIdentifier = (node, sandbox) => {
  if (!Object.hasOwn(sandbox.globals, node.name)) throw new Error(`Unknown identifier "${node.name}"`)

  return sandbox.globals[node.name]
}

const evaluateArray = (node, sandbox) => node.elements.map(element => evaluate(element, sandbox))

const evaluateObject = (node, sandbox) => {
  return node.properties.reduce((object, { key, value }) => setProperty(object, key, evaluate(value, sandbox)), {})
}

const evaluateMember = (node, sandbox) => getProperty(evaluate(node.object, sandbox), evaluate(node.property, sandbox))

const evaluateCallee = (node, sandbox) => {
  if (node.type !== nodeTypes.member) return { fn: evaluate(node, sandbox), thisArgument: undefined }

  const object = evaluate(node.object, sandbox)

  return { fn: getProperty(object, evaluate(node.property, sandbox)), thisArgument: object }
}

const evaluateArguments = (args, sandbox) => args.map(arg => evaluate(arg, sandbox))

const evaluateCall = (node, sandbox) => {
  const { fn, thisArgument } = evaluateCallee(node.callee, sandbox)

  return callFunction(fn, thisArgument, evaluateArguments(node.args, sandbox))
}

const evaluateConstruct = (node, sandbox) => {
  const constructor = evaluate(node.callee, sandbox)

  if (!sandbox.constructors.includes(constructor)) throw new Error('Constructor is not allowed')

  return Reflect.construct(constructor, evaluateArguments(node.args, sandbox))
}

const evaluateUnary = (node, sandbox) => -evaluate(node.argument, sandbox)

const evaluateBinary = (node, sandbox) => {
  return BINARY_OPERATIONS[node.operator](evaluate(node.left, sandbox), evaluate(node.right, sandbox))
}

const EVALUATORS = {
  [nodeTypes.literal]: evaluateLiteral,
  [nodeTypes.identifier]: evaluateIdentifier,
  [nodeTypes.array]: evaluateArray,
  [nodeTypes.object]: evaluateObject,
  [nodeTypes.member]: evaluateMember,
  [nodeTypes.call]: evaluateCall,
  [nodeTypes.construct]: evaluateConstruct,
  [nodeTypes.unary]: evaluateUnary,
  [nodeTypes.binary]: evaluateBinary,
}

export const evaluate = (node, sandbox) => EVALUATORS[node.type](node, sandbox)
