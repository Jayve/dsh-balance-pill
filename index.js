/**
 * Host half of Balance Pill.
 *
 * The Client module never talks to the account Remote namespace. It fetches one
 * loopback-only JSON route, and this module serves the wallet summary from the
 * signed-in DeepSeek account service. Keeping the account call on the Host also
 * keeps credentials and Platform request headers out of the browser.
 *
 * @module dsh-balance-pill
 */

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'balance-pill'

/** The web server must exist before the route can be registered. */
export const inject = ['webServer']

/** Route polled by the Client module. */
export const ROUTE = '/dsh-balance-pill/state'

/**
 * Client identity reported to the Platform account API.
 *
 * The running Web host's release version is preferred; this constant is only a
 * fallback for compositions where the optional `clientModules` service is
 * absent or has not composed its graph yet.
 */
export const FALLBACK_CLIENT_VERSION = '0.2.1-rc.2'

/**
 * Write one JSON response with the headers this local route needs.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers,
  })
  res.end(JSON.stringify(body))
}

/**
 * Whether a socket address belongs to the loopback interface.
 *
 * The route is reachable by every local process, so refusing non-loopback peers
 * is the only network-level restriction this plugin applies.
 *
 * @param {string | undefined} address
 * @returns {boolean}
 */
export function isLoopback(address) {
  if (typeof address !== 'string') return false
  return address === '::1'
    || address === '127.0.0.1'
    || address === '::ffff:127.0.0.1'
}

/**
 * Extract the hostname from an HTTP `Host` authority without its port.
 *
 * @param {string | undefined} authority
 * @returns {string | undefined}
 */
function authorityHostname(authority) {
  if (typeof authority !== 'string') return undefined
  const text = authority.trim().toLowerCase()
  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    return end === -1 ? undefined : text.slice(0, end + 1)
  }
  const colon = text.lastIndexOf(':')
  return colon === -1 ? text : text.slice(0, colon)
}

/**
 * Whether a request's `Host` header names the local GUI authority.
 *
 * A loopback socket address alone does not stop DNS rebinding: a page served
 * from `evil.example:<port>` can resolve to 127.0.0.1 and become same-origin
 * with this route. Requiring a loopback authority closes that path.
 *
 * @param {string | undefined} authority
 * @returns {boolean}
 */
export function isLoopbackAuthority(authority) {
  const hostname = authorityHostname(authority)
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

/**
 * Parse a wallet amount. Platform returns decimal strings so that precision is
 * not lost before formatting; numbers are accepted for hand-built fixtures.
 *
 * @param {unknown} raw
 * @returns {number | undefined}
 */
function toAmount(raw) {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''))
  return Number.isFinite(value) ? value : undefined
}

/**
 * Fold the account wallet arrays into one currency summary, preferring CNY.
 *
 * Bonus wallets are reported separately from recharged wallets by the Platform;
 * both contribute to the total balance. Unknown currencies and unparseable
 * amounts are ignored rather than mislabelled.
 *
 * @param {unknown} balance - ready value of `AccountDetails['balance']`.
 * @returns {{ currency: 'CNY' | 'USD', recharged: number, granted: number, total: number } | undefined}
 */
export function summariseBalance(balance) {
  if (balance === null || typeof balance !== 'object') return undefined

  /** @type {Map<'CNY' | 'USD', { currency: 'CNY' | 'USD', recharged: number, granted: number }>} */
  const totals = new Map()
  const add = (wallet, granted) => {
    if (wallet === null || typeof wallet !== 'object') return
    const currency = wallet.currency
    if (currency !== 'CNY' && currency !== 'USD') return
    const value = toAmount(wallet.balance)
    if (value === undefined) return
    const entry = totals.get(currency) ?? { currency, recharged: 0, granted: 0 }
    if (granted) entry.granted += value
    else entry.recharged += value
    totals.set(currency, entry)
  }

  for (const wallet of Array.isArray(balance.value) ? balance.value : []) add(wallet, false)
  for (const wallet of Array.isArray(balance.bonusWallets) ? balance.bonusWallets : []) add(wallet, true)

  const list = [...totals.values()].map((entry) => ({
    currency: entry.currency,
    recharged: entry.recharged,
    granted: entry.granted,
    total: entry.recharged + entry.granted,
  }))
  if (list.length === 0) return undefined
  return list.find((entry) => entry.currency === 'CNY') ?? list[0]
}

/**
 * Read the running Web host's release version when the optional client module
 * registry is live. The graph can be composed after this plugin activates, so a
 * miss is not cached.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {string | undefined}
 */
function detectClientVersion(ctx) {
  try {
    const graph = ctx.get('clientModules')?.graph?.()
    const version = graph?.release?.version
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined
  } catch {
    // The graph is optional and may be unavailable during boot; the caller falls back.
    return undefined
  }
}

/**
 * Build the local state handler. Exported so tests can drive the route without
 * booting Cordis or the Web host.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ clientVersion?: string }} [config]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createStateHandler(ctx, config = {}) {
  const configured = typeof config?.clientVersion === 'string' ? config.clientVersion.trim() : ''
  /** @type {string | undefined} */
  let cached

  const clientVersion = () => {
    if (cached !== undefined) return cached
    if (configured !== '') {
      cached = configured
      return cached
    }
    const detected = detectClientVersion(ctx)
    if (detected !== undefined) {
      cached = detected
      return cached
    }
    return FALLBACK_CLIENT_VERSION
  }

  return async function handleBalanceState(req, res) {
    if (req.method !== 'GET') {
      send(res, 405, { ok: false, error: 'method-not-allowed' }, { allow: 'GET' })
      return
    }
    if (!isLoopback(req.socket?.remoteAddress)) {
      send(res, 403, { ok: false, error: 'loopback-only' })
      return
    }
    if (!isLoopbackAuthority(req.headers?.host)) {
      send(res, 403, { ok: false, error: 'host-not-allowed' })
      return
    }

    const account = ctx.get('deepseekAccount')
    if (account === undefined || account === null) {
      send(res, 503, { ok: false, error: 'account-unavailable' })
      return
    }

    const url = new URL(req.url ?? ROUTE, 'http://localhost')
    const locale = (url.searchParams.get('locale') ?? 'en').slice(0, 35)
    const offset = Number(url.searchParams.get('tz'))
    const client = {
      version: clientVersion(),
      locale,
      timezoneOffsetSeconds: Number.isFinite(offset) ? offset : 0,
    }

    try {
      const state = await account.getState()
      if (state?.status !== 'credential-stored') {
        send(res, 200, { ok: true, status: 'signed-out' })
        return
      }
      const balance = await account.getBalance(client)
      if (balance === null || balance === undefined) {
        send(res, 200, { ok: true, status: 'signed-out' })
        return
      }
      if (balance.status !== 'ready') {
        send(res, 200, { ok: true, status: 'failed' })
        return
      }
      const summary = summariseBalance(balance)
      if (summary === undefined) {
        send(res, 200, { ok: true, status: 'failed' })
        return
      }
      send(res, 200, { ok: true, status: 'ready', ...summary })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      send(res, 502, { ok: false, error: message.slice(0, 200) || 'balance-request-failed' })
    }
  }
}

/**
 * Register the state route as a disposable Cordis effect.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ clientVersion?: string }} [config]
 */
export function apply(ctx, config = {}) {
  const handler = createStateHandler(ctx, config)
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler }),
    'balance-pill: state route',
  )
}
