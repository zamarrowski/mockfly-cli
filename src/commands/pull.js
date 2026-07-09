import path from 'path'
import { fetchProjectExport, fetchProjects } from '../api.js'
import { resolveAuth } from '../config.js'
import { aliasFor, resolveDir, saveProject } from '../workspace.js'
import { dim, fail, green, yellow } from '../utils.js'

export const pull = async (slugs, options) => {
  const auth = resolveAuth(options)
  if (!auth.apiKey) fail('No API key found. Run `mockfly login` first (or pass --key / set MOCKFLY_API_KEY).')

  const dir = resolveDir(options)

  let available
  try {
    available = await fetchProjects(auth)
  } catch (error) {
    fail(error.message)
  }

  if (!available.length) fail('Your account has no projects yet. Create one in the Mockfly dashboard.')

  let targets = available
  if (slugs.length) {
    targets = []
    for (const wanted of slugs) {
      const match = available.find(p => p.slug === wanted || aliasFor(p.name) === wanted)
      if (!match) {
        console.log(yellow(`⚠ No project matches '${wanted}' — available: ${available.map(p => aliasFor(p.name)).join(', ')}`))
        continue
      }
      targets.push(match)
    }
    if (!targets.length) fail('Nothing to pull.')
  }

  console.log(dim(`Pulling ${targets.length} project${targets.length === 1 ? '' : 's'} into ${dir}`))

  for (const target of targets) {
    try {
      const payload = await fetchProjectExport(auth, target._id)
      const file = saveProject(dir, payload)
      const endpoints = payload.endpoints?.length || 0
      console.log(green(`✔ ${target.name}`) + dim(` — ${endpoints} endpoint${endpoints === 1 ? '' : 's'} → ${path.basename(file)}`))
    } catch (error) {
      console.log(yellow(`⚠ ${target.name}: ${error.message}`))
    }
  }

  console.log(dim('\nRun `mockfly serve` to mock these APIs offline.'))
}
