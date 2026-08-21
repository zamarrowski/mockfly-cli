import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import fs from 'fs'
import path from 'path'
import { useTempHome } from './helpers.js'

// src/config.js pins ~/.mockfly/config.json at import time, so HOME has to point
// at a throwaway directory before the module is loaded.
const home = useTempHome()
const { DEFAULT_API_BASE, clearConfig, loadConfig, resolveAuth, saveConfig } = await import('../src/config.js')

const CONFIG_DIR = path.join(home, '.mockfly')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const reset = () => {
  fs.rmSync(CONFIG_DIR, { recursive: true, force: true })
  delete process.env.MOCKFLY_API_KEY
  delete process.env.MOCKFLY_API_URL
}

beforeEach(reset)

describe('loadConfig', () => {
  it('returns an empty object when there is no config file', () => {
    assert.deepEqual(loadConfig(), {})
  })

  it('returns an empty object when the config file is corrupt', () => {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, '{ nope')

    assert.deepEqual(loadConfig(), {})
  })

  it('reads back what saveConfig wrote', () => {
    saveConfig({ apiKey: 'mf_abcdef123456', apiBase: 'https://api.mockfly.dev' })

    assert.deepEqual(loadConfig(), { apiKey: 'mf_abcdef123456', apiBase: 'https://api.mockfly.dev' })
  })
})

describe('saveConfig', () => {
  it('creates ~/.mockfly and returns the config path', () => {
    const file = saveConfig({ apiKey: 'mf_x' })

    assert.equal(file, CONFIG_FILE)
    assert.equal(fs.existsSync(CONFIG_FILE), true)
  })

  it('writes pretty-printed JSON', () => {
    saveConfig({ apiKey: 'mf_x' })

    assert.equal(fs.readFileSync(CONFIG_FILE, 'utf8'), '{\n  "apiKey": "mf_x"\n}')
  })

  it('overwrites an existing config', () => {
    saveConfig({ apiKey: 'first' })
    saveConfig({ apiKey: 'second' })

    assert.deepEqual(loadConfig(), { apiKey: 'second' })
  })

  // The API key is a credential: the directory stays owner-only and the file
  // owner-read/write. Pinned so a future change cannot loosen it unnoticed.
  it('keeps the directory 0700 and the file 0600', { skip: process.platform === 'win32' }, () => {
    saveConfig({ apiKey: 'mf_x' })

    assert.equal(fs.statSync(CONFIG_DIR).mode & 0o777, 0o700)
    assert.equal(fs.statSync(CONFIG_FILE).mode & 0o777, 0o600)
  })
})

describe('clearConfig', () => {
  it('removes the config file and reports true', () => {
    saveConfig({ apiKey: 'mf_x' })

    assert.equal(clearConfig(), true)
    assert.equal(fs.existsSync(CONFIG_FILE), false)
    assert.deepEqual(loadConfig(), {})
  })

  it('reports false when there was nothing to remove', () => {
    assert.equal(clearConfig(), false)
  })
})

describe('resolveAuth', () => {
  it('falls back to no key and the default API base', () => {
    assert.deepEqual(resolveAuth(), { apiKey: null, apiKeySource: null, apiBase: DEFAULT_API_BASE })
    assert.equal(DEFAULT_API_BASE, 'https://api.mockfly.dev')
  })

  it('uses the saved config when there is no flag or env var', () => {
    saveConfig({ apiKey: 'mf_saved', apiBase: 'https://saved.example.com' })

    assert.deepEqual(resolveAuth({}), {
      apiKey: 'mf_saved',
      apiKeySource: 'config file',
      apiBase: 'https://saved.example.com',
    })
  })

  it('prefers the env vars over the saved config', () => {
    saveConfig({ apiKey: 'mf_saved', apiBase: 'https://saved.example.com' })
    process.env.MOCKFLY_API_KEY = 'mf_env'
    process.env.MOCKFLY_API_URL = 'https://env.example.com'

    assert.deepEqual(resolveAuth({}), {
      apiKey: 'mf_env',
      apiKeySource: 'env MOCKFLY_API_KEY',
      apiBase: 'https://env.example.com',
    })
  })

  it('prefers the flags over everything else', () => {
    saveConfig({ apiKey: 'mf_saved', apiBase: 'https://saved.example.com' })
    process.env.MOCKFLY_API_KEY = 'mf_env'
    process.env.MOCKFLY_API_URL = 'https://env.example.com'

    assert.deepEqual(resolveAuth({ key: 'mf_flag', api: 'https://flag.example.com' }), {
      apiKey: 'mf_flag',
      apiKeySource: 'flag --key',
      apiBase: 'https://flag.example.com',
    })
  })

  it('resolves the key and the base url independently', () => {
    saveConfig({ apiBase: 'https://saved.example.com' })
    process.env.MOCKFLY_API_KEY = 'mf_env'

    assert.deepEqual(resolveAuth({}), {
      apiKey: 'mf_env',
      apiKeySource: 'env MOCKFLY_API_KEY',
      apiBase: 'https://saved.example.com',
    })
  })

  it('trims trailing slashes off the API base, whatever its source', () => {
    assert.equal(resolveAuth({ api: 'https://flag.example.com/' }).apiBase, 'https://flag.example.com')
    assert.equal(resolveAuth({ api: 'https://flag.example.com///' }).apiBase, 'https://flag.example.com')

    process.env.MOCKFLY_API_URL = 'https://env.example.com//'
    assert.equal(resolveAuth({}).apiBase, 'https://env.example.com')
    delete process.env.MOCKFLY_API_URL

    saveConfig({ apiBase: 'https://saved.example.com/' })
    assert.equal(resolveAuth({}).apiBase, 'https://saved.example.com')
  })
})
