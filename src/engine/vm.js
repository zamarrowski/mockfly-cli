// Mirrors mockfly-backend: src/vm/index.js
import { faker } from '@faker-js/faker'
import { VM } from 'vm2'

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
