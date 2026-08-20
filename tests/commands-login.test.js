import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import fs from 'fs'
import path from 'path'
import {
  ProcessExited,
  captureConsole,
  jsonResponse,
  muteStdout,
  stubExit,
  stubFetch,
  stubStdin,
  useTempHome,
} from './helpers.js'

// src/config.js resolves ~/.mockfly at import time and src/commands/login.js pulls
// it in, so HOME has to be redirected before either module is loaded.
const home = useTempHome()
const { login, logout, whoami } = await import('../src/commands/login.js')

const CONFIG_FILE = path.join(home, '.mockfly', 'config.json')
const readConfig = () => JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))

let console_
let exit
let fetchStub
let stdin

beforeEach(() => {
  fs.rmSync(path.join(home, '.mockfly'), { recursive: true, force: true })
  delete process.env.MOCKFLY_API_KEY
  delete process.env.MOCKFLY_API_URL
  console_ = captureConsole()
  exit = stubExit()
})

afterEach(() => {
  stdin?.restore()
  fetchStub?.restore()
  exit.restore()
  console_.restore()
  stdin = undefined
  fetchStub = undefined
})

describe('login', () => {
  it('validates the key against the API and saves it', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [{ _id: '1' }, { _id: '2' }] }))

    await login({ key: 'mf_abcdefghijklmnop' })

    assert.deepEqual(readConfig(), { apiKey: 'mf_abcdefghijklmnop', apiBase: 'https://api.mockfly.dev' })
    assert.equal(fetchStub.calls[0].url, 'https://api.mockfly.dev/public/projects')
    assert.equal(console_.out[0], '✔ Logged in — 2 projects available.')
    assert.equal(console_.out[1], `Key saved in ${CONFIG_FILE}`)
    assert.deepEqual(exit.codes, [])
  })

  it('says "1 project" in the singular', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [{ _id: '1' }] }))

    await login({ key: 'mf_x' })

    assert.equal(console_.out[0], '✔ Logged in — 1 project available.')
  })

  it('accepts an account with no projects yet', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [] }))

    await login({ key: 'mf_x' })

    assert.equal(console_.out[0], '✔ Logged in — 0 projects available.')
    assert.equal(readConfig().apiKey, 'mf_x')
  })

  it('honours --api, trailing slash included', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [] }))

    await login({ key: 'mf_x', api: 'https://staging.example.com/' })

    assert.equal(readConfig().apiBase, 'https://staging.example.com')
    assert.equal(fetchStub.calls[0].url, 'https://staging.example.com/public/projects')
  })

  it('falls back to MOCKFLY_API_URL when --api is missing', async () => {
    process.env.MOCKFLY_API_URL = 'https://env.example.com//'
    fetchStub = stubFetch(async () => jsonResponse({ results: [] }))

    await login({ key: 'mf_x' })

    assert.equal(readConfig().apiBase, 'https://env.example.com')
  })

  it('prompts for the key when --key is missing', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [] }))
    stdin = stubStdin('  mf_typed_key  \n')
    const stdout = muteStdout()

    try {
      await login({})
    } finally {
      stdout.restore()
    }

    assert.equal(readConfig().apiKey, 'mf_typed_key')
    assert.match(console_.stdout, /Create an API key in the Mockfly dashboard/)
  })

  it('exits when the prompt comes back empty', async () => {
    stdin = stubStdin('\n')
    const stdout = muteStdout()

    try {
      await assert.rejects(login({}), ProcessExited)
    } finally {
      stdout.restore()
    }

    assert.equal(fs.existsSync(CONFIG_FILE), false)
    assert.deepEqual(console_.err, ['✖ No API key provided.'])
    assert.deepEqual(exit.codes, [1])
  })

  it('does not write a rejected key to disk', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ error: 'unauthorized' }, { status: 401 }))

    await assert.rejects(login({ key: 'mf_bad' }), ProcessExited)

    assert.equal(fs.existsSync(CONFIG_FILE), false)
    assert.deepEqual(console_.err, [
      '✖ Invalid API key. Run `mockfly login` with a key created in the Mockfly dashboard.',
    ])
    assert.deepEqual(exit.codes, [1])
  })

  it('does not write anything when the API is unreachable', async () => {
    fetchStub = stubFetch(async () => {
      throw new TypeError('fetch failed')
    })

    await assert.rejects(login({ key: 'mf_x' }), ProcessExited)

    assert.equal(fs.existsSync(CONFIG_FILE), false)
    assert.match(console_.stderr, /Could not reach https:\/\/api\.mockfly\.dev — are you online\? \(fetch failed\)/)
  })
})

describe('logout', () => {
  it('removes the saved key', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [] }))
    await login({ key: 'mf_x' })
    console_.out.length = 0

    logout()

    assert.equal(fs.existsSync(CONFIG_FILE), false)
    assert.deepEqual(console_.out, ['✔ Logged out.'])
  })

  it('is a no-op when there was no key', () => {
    logout()

    assert.deepEqual(console_.out, ['Nothing to do — you were not logged in.'])
  })
})

describe('whoami', () => {
  it('says nothing is configured when there is no key', () => {
    whoami()

    assert.deepEqual(console_.out, ['Not logged in. Run `mockfly login`.'])
  })

  it('masks the saved key to its first 11 characters', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [] }))
    await login({ key: 'mf_abcdefghijklmnopqrstuv' })
    console_.out.length = 0

    whoami()

    assert.deepEqual(console_.out, ['API key: mf_abcdefgh… (config file)', 'API url: https://api.mockfly.dev'])
    assert.equal(console_.stdout.includes('ijklmnopqrstuv'), false)
  })

  it('credits the env var when the key only comes from the environment', () => {
    process.env.MOCKFLY_API_KEY = 'mf_from_environment_key'

    whoami()

    assert.deepEqual(console_.out, [
      'API key: mf_from_env… (env MOCKFLY_API_KEY)',
      'API url: https://api.mockfly.dev',
    ])
  })

  it('credits the config file when both are set, and shows the winning key', async () => {
    fetchStub = stubFetch(async () => jsonResponse({ results: [] }))
    await login({ key: 'mf_saved_key_value', api: 'https://saved.example.com' })
    process.env.MOCKFLY_API_KEY = 'mf_env_key_value'
    console_.out.length = 0

    whoami()

    // The env var wins over the config for the value, but the source label only
    // says "env" when the config has no key at all.
    assert.deepEqual(console_.out, ['API key: mf_env_key_… (config file)', 'API url: https://saved.example.com'])
  })
})
