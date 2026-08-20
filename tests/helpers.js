// Shared plumbing for the CLI tests. No dependencies on purpose: node:test,
// node:assert and the standard library are enough for everything here.
import fs from 'fs'
import os from 'os'
import path from 'path'

// Every test that touches the filesystem gets its own throwaway directory, so
// nothing ever reaches the real ~/.mockfly.
export const tempDir = (prefix = 'mockfly-test-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

export class ProcessExited extends Error {
  constructor(code) {
    super(`process.exit(${code})`)
    this.name = 'ProcessExited'
    this.code = code
  }
}

// `fail()` calls process.exit(1), which would take the test runner down with it.
// Throwing keeps the caller's control flow faithful to a real exit (nothing after
// the fail() runs); pass { throwOnExit: false } for the few call sites that are
// reached from an event handler, where a throw would escape as uncaught.
export const stubExit = ({ throwOnExit = true } = {}) => {
  const original = process.exit
  const codes = []

  process.exit = code => {
    codes.push(code)
    if (throwOnExit) throw new ProcessExited(code)
  }

  return {
    codes,
    restore: () => {
      process.exit = original
    },
  }
}

export const captureConsole = () => {
  const originalLog = console.log
  const originalError = console.error
  const out = []
  const err = []

  console.log = (...args) => out.push(args.map(String).join(' '))
  console.error = (...args) => err.push(args.map(String).join(' '))

  return {
    out,
    err,
    get stdout() {
      return out.join('\n')
    },
    get stderr() {
      return err.join('\n')
    },
    restore: () => {
      console.log = originalLog
      console.error = originalError
    },
  }
}
