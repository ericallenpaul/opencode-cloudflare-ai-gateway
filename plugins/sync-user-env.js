// Hydrate OpenCode's process environment from Windows User env, compute
// OpenCode attribution tags, inject Cloudflare AI Gateway metadata headers,
// and pass the hydrated env to spawned shell commands.

export default async () => {
  async function getUserEnvAll() {
    try {
      const { spawnSync } = await import('node:child_process')
      const ps = spawnSync('pwsh', [
        '-NoProfile',
        '-Command',
        "$e=[Environment]::GetEnvironmentVariables('User'); $h=@{}; foreach ($k in $e.Keys) { $h[$k] = [string]$e[$k] }; $h | ConvertTo-Json -Compress",
      ], { encoding: 'utf8' })

      if (ps.status === 0 && ps.stdout) {
        const json = ps.stdout.trim()
        if (json) {
          const obj = JSON.parse(json)
          if (obj && typeof obj === 'object') return obj
        }
      }
    } catch {
      // Non-Windows or pwsh unavailable: nothing to promote.
    }

    return {}
  }

  async function ensureProcessEnvFromUser() {
    const userEnv = await getUserEnvAll()

    for (const [key, value] of Object.entries(userEnv)) {
      if (!process.env[key] && typeof value === 'string' && value.length) {
        process.env[key] = value
      }
    }
  }

  async function computeAppTag() {
    const fs = await import('node:fs')
    const path = await import('node:path')
    let current = process.cwd()

    while (current) {
      if (fs.existsSync(path.join(current, '.git'))) return path.basename(current)

      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }

    return path.basename(process.cwd())
  }

  async function ensureAttributionEnv() {
    await ensureProcessEnvFromUser()

    if (!process.env.OPENCODE_APP_TAG) {
      process.env.OPENCODE_APP_TAG = await computeAppTag()
    }

    if (!process.env.OPENCODE_USER_TAG) {
      process.env.OPENCODE_USER_TAG = process.env.USERNAME || process.env.USER || 'unknown'
    }

    return {
      app: process.env.OPENCODE_APP_TAG,
      user: process.env.OPENCODE_USER_TAG,
    }
  }

  function isGatewayProvider(provider) {
    return provider?.options?.baseURL?.includes('gateway.ai.cloudflare.com')
  }

  function injectGatewayMetadata(cfg, metadata) {
    for (const provider of Object.values(cfg.provider ?? {})) {
      if (!isGatewayProvider(provider)) continue

      provider.options ??= {}
      provider.options.headers ??= {}
      provider.options.headers['cf-aig-metadata'] = JSON.stringify(metadata)
    }
  }

  return {
    config: async (cfg) => {
      const metadata = await ensureAttributionEnv()
      injectGatewayMetadata(cfg, metadata)
    },

    'shell.env': async (_input, env) => {
      await ensureAttributionEnv()

      for (const [key, value] of Object.entries(process.env)) {
        if (env[key] === undefined && typeof value === 'string') {
          env[key] = value
        }
      }
    },
  }
}
