// Mirrors mockfly-backend: src/vm/index.js, without its worker thread. The cloud evaluates
// every expression in a worker with a timeout and a heap cap because one process serves
// every project; the CLI serves one user's own snapshots, so it evaluates in-thread. The
// grammar, the sandbox and the result size cap are the same files, so results match.
import { Script } from 'vm'
import { REGEX_MATCH_SOURCE, REGEX_MATCH_TIMEOUT_IN_MS } from './constants.js'
import { evaluateExpression } from './expression.js'

const regexMatchScript = new Script(REGEX_MATCH_SOURCE)

export { evaluateExpression }

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
