import { createApp } from '../server.js'
import { loadProjects, resolveDir } from '../workspace.js'
import { bold, cyan, dim, fail, timeAgo, yellow } from '../utils.js'

export const serve = options => {
  const dir = resolveDir(options)
  const port = Number(options.port) || 4000
  const projects = loadProjects(dir)

  if (!projects.length) {
    fail(`No projects found in ${dir}. Run \`mockfly pull\` while online, then \`mockfly serve\` works offline.`)
  }

  const app = createApp(projects)

  const server = app.listen(port, () => {
    console.log(`\n${bold('Mockfly')} serving ${projects.length} project${projects.length === 1 ? '' : 's'} on ${cyan(`http://localhost:${port}`)}\n`)

    for (const project of projects) {
      const age = timeAgo(project.pulledAt)
      const staleness = age.endsWith('d ago') && parseInt(age) >= 7 ? yellow(` (pulled ${age} — consider re-pulling)`) : dim(` (pulled ${age})`)
      console.log(`  ${bold(project.name.padEnd(24))} ${cyan(`http://localhost:${port}/${project.alias}`)}${staleness}`)
      console.log(dim(`  ${''.padEnd(24)} http://localhost:${port}/${project.slug} — ${project.endpoints.length} endpoints`))
    }

    console.log(dim('\nRequests:\n'))
  })

  server.on('error', error => {
    if (error.code === 'EADDRINUSE') fail(`Port ${port} is already in use. Try \`mockfly serve --port ${port + 1}\`.`)
    fail(error.message)
  })

  // Commander ignores the return value; returning the listener lets a test close it.
  return server
}
