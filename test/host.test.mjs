import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FALLBACK_CLIENT_VERSION,
  ROUTE,
  apply,
  createStateHandler,
  isLoopback,
  isLoopbackAuthority,
  summariseBalance,
} from '../index.js'

/**
 * Minimal ServerResponse double. The handler only writes a status line, headers,
 * and one JSON body.
 */
function makeResponse() {
  const captured = { statusCode: 0, headers: {}, body: '' }
  return {
    captured,
    writeHead(statusCode, headers) {
      captured.statusCode = statusCode
      captured.headers = headers
    },
    end(chunk) {
      captured.body = typeof chunk === 'string' ? chunk : ''
    },
  }
}

function makeRequest(overrides = {}) {
  return {
    method: 'GET',
    url: `${ROUTE}?locale=zh&tz=28800`,
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:1203' },
    ...overrides,
  }
}

function makeAccount({ state = { status: 'credential-stored' }, balance, failure } = {}) {
  const calls = []
  return {
    calls,
    async getState() {
      if (failure !== undefined) throw failure
      return state
    },
    async getBalance(client) {
      calls.push(client)
      if (failure !== undefined) throw failure
      return balance
    },
  }
}

function makeContext(services = {}) {
  return {
    get(name) {
      return services[name]
    },
    effect(callback) {
      return callback()
    },
  }
}

function wallet(currency, balance) {
  return { currency, balance }
}

function readyBalance(value, bonusWallets = []) {
  return { status: 'ready', value, bonusWallets }
}

test('loopback detection accepts the addresses a desktop Web host uses', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('192.168.1.20'), false)
  assert.equal(isLoopback('127.0.0.2'), false)
  assert.equal(isLoopback(undefined), false)
})

test('authority detection accepts local host names and rejects rebinding names', () => {
  assert.equal(isLoopbackAuthority('127.0.0.1:1203'), true)
  assert.equal(isLoopbackAuthority('localhost:1203'), true)
  assert.equal(isLoopbackAuthority('[::1]:1203'), true)
  assert.equal(isLoopbackAuthority('127.0.0.1'), true)
  assert.equal(isLoopbackAuthority('evil.example:1203'), false)
  assert.equal(isLoopbackAuthority('127.0.0.1.nip.io:1203'), false)
  assert.equal(isLoopbackAuthority(undefined), false)
})

test('summariseBalance folds recharged and bonus wallets and prefers CNY', () => {
  const summary = summariseBalance(readyBalance(
    [wallet('USD', '1.25'), wallet('CNY', '5.00')],
    [wallet('CNY', '1.19')],
  ))

  assert.equal(summary.currency, 'CNY')
  assert.equal(summary.recharged, 5)
  assert.equal(summary.granted, 1.19)
  assert.ok(Math.abs(summary.total - 6.19) < 1e-9)
})

test('summariseBalance keeps a USD-only account in USD', () => {
  const summary = summariseBalance(readyBalance([], [wallet('USD', '2.50')]))
  assert.deepEqual(summary, { currency: 'USD', recharged: 0, granted: 2.5, total: 2.5 })
})

test('summariseBalance ignores unknown currencies and unparseable amounts', () => {
  const summary = summariseBalance(readyBalance([
    wallet('EUR', '9.00'),
    wallet('CNY', 'not-a-number'),
    { currency: 'CNY' },
    null,
  ]))
  assert.equal(summary, undefined)

  const partial = summariseBalance(readyBalance([
    wallet('EUR', '9.00'),
    wallet('CNY', '0.50'),
  ]))
  assert.deepEqual(partial, { currency: 'CNY', recharged: 0.5, granted: 0, total: 0.5 })
})

test('summariseBalance tolerates a missing or failed balance object', () => {
  assert.equal(summariseBalance(undefined), undefined)
  assert.equal(summariseBalance(null), undefined)
  assert.equal(summariseBalance({ status: 'failed' }), undefined)
})

test('ready route returns the summary and forwards client metadata', async () => {
  const account = makeAccount({
    balance: readyBalance([wallet('CNY', '6.19')], [wallet('CNY', '0.00')]),
  })
  const ctx = makeContext({
    deepseekAccount: account,
    clientModules: { graph: () => ({ release: { version: '9.9.9-test' } }) },
  })
  const response = makeResponse()

  await createStateHandler(ctx)(makeRequest(), response)

  assert.equal(response.captured.statusCode, 200)
  assert.deepEqual(JSON.parse(response.captured.body), {
    ok: true,
    status: 'ready',
    currency: 'CNY',
    recharged: 6.19,
    granted: 0,
    total: 6.19,
  })
  assert.equal(response.captured.headers['cache-control'], 'no-store')
  assert.deepEqual(account.calls, [{
    version: '9.9.9-test',
    locale: 'zh',
    timezoneOffsetSeconds: 28800,
  }])
})

test('configured clientVersion wins over the detected Web release', async () => {
  const account = makeAccount({ balance: readyBalance([wallet('CNY', '1.00')]) })
  const ctx = makeContext({
    deepseekAccount: account,
    clientModules: { graph: () => ({ release: { version: '9.9.9-test' } }) },
  })

  await createStateHandler(ctx, { clientVersion: ' 1.2.3 ' })(makeRequest(), makeResponse())

  assert.equal(account.calls[0].version, '1.2.3')
})

test('client version falls back when the client module graph is absent', async () => {
  const account = makeAccount({ balance: readyBalance([wallet('CNY', '1.00')]) })
  const ctx = makeContext({ deepseekAccount: account })

  await createStateHandler(ctx)(makeRequest(), makeResponse())

  assert.equal(account.calls[0].version, FALLBACK_CLIENT_VERSION)
})

test('a signed-out account reports signed-out without reading a balance', async () => {
  const account = makeAccount({ state: { status: 'signed-out' } })
  const ctx = makeContext({ deepseekAccount: account })
  const response = makeResponse()

  await createStateHandler(ctx)(makeRequest(), response)

  assert.equal(response.captured.statusCode, 200)
  assert.deepEqual(JSON.parse(response.captured.body), { ok: true, status: 'signed-out' })
  assert.equal(account.calls.length, 0)
})

test('a null balance reports signed-out', async () => {
  const account = makeAccount({ balance: null })
  const response = makeResponse()

  await createStateHandler(makeContext({ deepseekAccount: account }))(makeRequest(), response)

  assert.deepEqual(JSON.parse(response.captured.body), { ok: true, status: 'signed-out' })
})

test('a failed balance response reports failed', async () => {
  const account = makeAccount({ balance: { status: 'failed' } })
  const response = makeResponse()

  await createStateHandler(makeContext({ deepseekAccount: account }))(makeRequest(), response)

  assert.deepEqual(JSON.parse(response.captured.body), { ok: true, status: 'failed' })
})

test('non-loopback peers and non-GET methods are refused', async () => {
  const account = makeAccount({ balance: readyBalance([wallet('CNY', '1.00')]) })
  const handler = createStateHandler(makeContext({ deepseekAccount: account }))

  const remote = makeResponse()
  await handler(makeRequest({ socket: { remoteAddress: '10.0.0.8' } }), remote)
  assert.equal(remote.captured.statusCode, 403)
  assert.equal(JSON.parse(remote.captured.body).error, 'loopback-only')

  const rebinding = makeResponse()
  await handler(makeRequest({ headers: { host: 'evil.example:1203' } }), rebinding)
  assert.equal(rebinding.captured.statusCode, 403)
  assert.equal(JSON.parse(rebinding.captured.body).error, 'host-not-allowed')

  const post = makeResponse()
  await handler(makeRequest({ method: 'POST' }), post)
  assert.equal(post.captured.statusCode, 405)
  assert.equal(post.captured.headers.allow, 'GET')
  assert.equal(account.calls.length, 0)
})

test('a missing account service fails closed', async () => {
  const response = makeResponse()
  await createStateHandler(makeContext())(makeRequest(), response)
  assert.equal(response.captured.statusCode, 503)
  assert.deepEqual(JSON.parse(response.captured.body), { ok: false, error: 'account-unavailable' })
})

test('account failures become a bounded 502 payload', async () => {
  const account = makeAccount({ failure: new Error('x'.repeat(500)) })
  const response = makeResponse()

  await createStateHandler(makeContext({ deepseekAccount: account }))(makeRequest(), response)

  assert.equal(response.captured.statusCode, 502)
  const body = JSON.parse(response.captured.body)
  assert.equal(body.ok, false)
  assert.equal(body.error.length, 200)
})

test('apply registers the exact state route as an effect', () => {
  let registered
  const ctx = {
    get() {
      return undefined
    },
    effect(callback) {
      return callback()
    },
    webServer: {
      register(definition) {
        registered = definition
        return () => {}
      },
    },
  }

  apply(ctx)

  assert.equal(registered.kind, 'exact')
  assert.equal(registered.path, ROUTE)
  assert.equal(typeof registered.handler, 'function')
})
