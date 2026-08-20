// Shared plumbing for the CLI tests. No dependencies on purpose: node:test,
// node:assert and the standard library are enough for everything here.
import fs from 'fs'
import os from 'os'
import path from 'path'

// Every test that touches the filesystem gets its own throwaway directory, so
// nothing ever reaches the real ~/.mockfly.
export const tempDir = (prefix = 'mockfly-test-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

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
