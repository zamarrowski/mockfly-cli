// Mirrors mockfly-backend: src/vm/index.js
import { faker } from '@faker-js/faker'
import { VM } from 'vm2'

const REGEX_MATCH_TIMEOUT_IN_MS = 50

export const evalCode = code => {
  try {
    const vm = new VM({
      sandbox: { faker },
    })

    return vm.run(code)
  } catch {
    return code
  }
}

export const matchesRegex = (pattern, value) => {
  try {
    const vm = new VM({
      timeout: REGEX_MATCH_TIMEOUT_IN_MS,
      sandbox: { pattern, value },
    })

    return vm.run('new RegExp(pattern).test(value)') === true
  } catch {
    return false
  }
}
