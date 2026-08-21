import fs from 'fs'
import os from 'os'
import path from 'path'

export const DEFAULT_API_BASE = 'https://api.mockfly.dev'

const CONFIG_DIR = path.join(os.homedir(), '.mockfly')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export const loadConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return {}
  }
}

export const saveConfig = config => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
  return CONFIG_FILE
}

export const clearConfig = () => {
  try {
    fs.unlinkSync(CONFIG_FILE)
    return true
  } catch {
    return false
  }
}

// Precedence: explicit flag > env var > saved config > default.
export const resolveAuth = (options = {}) => {
  const config = loadConfig()

  // Candidates in precedence order, each labelled for `whoami`: the key that wins
  // is the one whose origin gets reported, so the two can never disagree.
  const [apiKeySource, apiKey] = [
    ['flag --key', options.key],
    ['env MOCKFLY_API_KEY', process.env.MOCKFLY_API_KEY],
    ['config file', config.apiKey],
  ].find(([, key]) => key) || [null, null]

  return {
    apiKey,
    apiKeySource,
    apiBase: (options.api || process.env.MOCKFLY_API_URL || config.apiBase || DEFAULT_API_BASE).replace(/\/+$/, ''),
  }
}
