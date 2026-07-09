const apiRequest = async ({ apiBase, apiKey }, pathname) => {
  let res

  try {
    res = await fetch(`${apiBase}${pathname}`, {
      headers: { authorization: apiKey, accept: 'application/json' },
    })
  } catch (error) {
    throw new Error(`Could not reach ${apiBase} — are you online? (${error.message})`)
  }

  if (res.status === 401) {
    throw new Error('Invalid API key. Run `mockfly login` with a key created in the Mockfly dashboard.')
  }

  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json()).error || ''
    } catch {
      // non-JSON error body, keep the status code only
    }
    throw new Error(`API error ${res.status}${detail ? `: ${detail}` : ''}`)
  }

  return res.json()
}

export const fetchProjects = async auth => {
  const data = await apiRequest(auth, '/public/projects')
  return data.results || []
}

export const fetchProjectExport = (auth, projectId) => apiRequest(auth, `/public/projects/${projectId}/export`)
