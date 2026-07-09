const useColor = process.stdout.isTTY && !process.env.NO_COLOR

const wrap = (open, close) => s => (useColor ? `[${open}m${s}[${close}m` : `${s}`)

export const bold = wrap(1, 22)
export const dim = wrap(2, 22)
export const green = wrap(32, 39)
export const yellow = wrap(33, 39)
export const red = wrap(31, 39)
export const cyan = wrap(36, 39)

export const timeAgo = iso => {
  if (!iso) return 'unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export const statusColor = status => {
  if (status >= 500) return red
  if (status >= 400) return yellow
  if (status >= 300) return cyan
  return green
}

export const fail = message => {
  console.error(red(`✖ ${message}`))
  process.exit(1)
}
