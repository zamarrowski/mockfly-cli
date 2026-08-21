import readline from 'readline/promises'
import { fetchProjects } from '../api.js'
import { DEFAULT_API_BASE, saveConfig, clearConfig, resolveAuth } from '../config.js'
import { bold, dim, fail, green } from '../utils.js'

const promptForKey = async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log(dim('Create an API key in the Mockfly dashboard (starts with mf_) and paste it here.'))
  const key = (await rl.question('API key: ')).trim()
  rl.close()
  return key
}

export const login = async options => {
  const apiKey = options.key || (await promptForKey())
  if (!apiKey) fail('No API key provided.')

  const apiBase = (options.api || process.env.MOCKFLY_API_URL || DEFAULT_API_BASE).replace(/\/+$/, '')

  let projects
  try {
    projects = await fetchProjects({ apiKey, apiBase })
  } catch (error) {
    fail(error.message)
  }

  const file = saveConfig({ apiKey, apiBase })
  console.log(green(`✔ Logged in — ${projects.length} project${projects.length === 1 ? '' : 's'} available.`))
  console.log(dim(`Key saved in ${file}`))
}

export const logout = () => {
  const removed = clearConfig()
  console.log(removed ? green('✔ Logged out.') : dim('Nothing to do — you were not logged in.'))
}

export const whoami = () => {
  const { apiKey, apiKeySource, apiBase } = resolveAuth()

  if (!apiKey) {
    console.log(dim('Not logged in. Run `mockfly login`.'))
    return
  }

  console.log(`${bold('API key:')} ${apiKey.slice(0, 11)}… ${dim(`(${apiKeySource})`)}`)
  console.log(`${bold('API url:')} ${apiBase}`)
}
