import fs from 'fs'
import os from 'os'
import path from 'path'

// Pulled projects live next to the config (~/.mockfly) by default, out of the
// user's working directory — snapshots must survive reboots, so no tmp dirs.
// Pass --dir for a project-local workspace (e.g. mocks committed with a repo).
export const defaultDir = () => path.join(os.homedir(), '.mockfly', 'projects')

export const resolveDir = (options = {}) => (options.dir ? path.resolve(options.dir) : defaultDir())

// Human-friendly alias derived from the project name, so mocks can be reached at
// /user-api/... besides the UUID slug.
export const aliasFor = name =>
  (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const saveProject = (dir, exportPayload) => {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${exportPayload.project.slug}.json`)
  const payload = { ...exportPayload, pulledAt: new Date().toISOString() }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2))
  return file
}

const projectFiles = dir => {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dir, f))
}

// Turns a pulled export payload into the in-memory model `serve` works with:
// endpoints sorted by position and `defaultResponse` resolved from its index
// to a direct object reference (offline there are no ObjectIds).
export const buildRuntimeProject = (raw, file) => {
  const endpoints = [...(raw.endpoints || [])]
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map(e => {
      const endpoint = { ...e, responses: (e.responses || []).map(r => ({ ...r })) }
      const index = Number.isInteger(e.defaultResponseIndex) ? e.defaultResponseIndex : -1
      endpoint.defaultResponse = index >= 0 ? endpoint.responses[index] : endpoint.responses[0]
      return endpoint
    })

  return {
    name: raw.project.name,
    slug: raw.project.slug,
    alias: aliasFor(raw.project.name),
    environment: raw.environment || {},
    pulledAt: raw.pulledAt || raw.exportedAt || null,
    endpoints,
    file,
  }
}

export const loadProjects = dir => {
  const projects = []

  for (const file of projectFiles(dir)) {
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      console.error(`Skipping ${path.basename(file)}: invalid JSON (${error.message})`)
      continue
    }

    if (!raw?.project?.slug || !Array.isArray(raw?.endpoints)) {
      console.error(`Skipping ${path.basename(file)}: not a Mockfly project file`)
      continue
    }

    projects.push(buildRuntimeProject(raw, file))
  }

  return projects
}

export const removeProject = (dir, slugOrAlias) => {
  const project = loadProjects(dir).find(p => p.slug === slugOrAlias || p.alias === slugOrAlias)
  if (!project) return null

  fs.unlinkSync(project.file)
  return project
}
