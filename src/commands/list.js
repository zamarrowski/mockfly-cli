import { loadProjects, removeProject, resolveDir } from '../workspace.js'
import { bold, dim, fail, green, timeAgo } from '../utils.js'

export const list = options => {
  const dir = resolveDir(options)
  const projects = loadProjects(dir)

  if (!projects.length) {
    console.log(dim(`No projects in ${dir}. Run \`mockfly pull\` first.`))
    return
  }

  for (const project of projects) {
    console.log(
      `${bold(project.name)} ${dim(`(${project.alias})`)} — ${project.endpoints.length} endpoints, pulled ${timeAgo(project.pulledAt)}`
    )
    console.log(dim(`  slug: ${project.slug}`))
  }
}

export const rm = (slug, options) => {
  const dir = resolveDir(options)
  const removed = removeProject(dir, slug)

  if (!removed) fail(`No local project matches '${slug}'. Run \`mockfly list\` to see what is pulled.`)
  console.log(green(`✔ Removed ${removed.name} (${removed.slug})`))
}
