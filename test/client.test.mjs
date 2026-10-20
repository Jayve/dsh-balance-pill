import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}

/**
 * Execute the browser bundle with a minimal module-loader and localStorage
 * double, then materialize the factory with a React stub. None of the helpers
 * under test call React.
 */
function loadClient(storage = makeStorage()) {
  let registration
  const window = {
    __ModuleLoader__: {
      load(definition) {
        registration = definition
      },
    },
    localStorage: storage,
  }
  new Function('window', source)(window)
  return { registration, exports: registration.factory(() => ({})), window, storage }
}

const { registration, exports } = loadClient()
const {
  advanceProgress,
  normaliseSummary,
  readProgress,
  writeProgress,
  moneyText,
  spendDigits,
  translate,
  storageKey,
} = exports._internals

test('registers the package id and the required client services', () => {
  assert.equal(registration.id, 'dsh-balance-pill')
  assert.deepEqual(exports.inject, ['slots', 'locale'])
  assert.equal(typeof exports.apply, 'function')
})

test('normalises a ready summary and defaults the currency', () => {
  assert.deepEqual(normaliseSummary({
    currency: 'USD',
    recharged: '1.00',
    granted: '0.50',
    total: '1.50',
  }), { currency: 'USD', recharged: 1, granted: 0.5, total: 1.5 })

  assert.deepEqual(normaliseSummary({ total: '2' }), {
    currency: 'CNY',
    recharged: 0,
    granted: 0,
    total: 2,
  })
  assert.equal(normaliseSummary({ total: 'nope' }), undefined)
  assert.equal(normaliseSummary(undefined), undefined)
  assert.equal(normaliseSummary(null), undefined)
})

test('the first reading establishes a baseline with no spend', () => {
  const progress = advanceProgress(undefined, { currency: 'CNY', total: 10 }, 1000)
  assert.deepEqual(progress, { currency: 'CNY', lastTotal: 10, spend: 0, since: 1000 })
})

test('a lower wallet balance accumulates spend and keeps the start time', () => {
  const first = { currency: 'CNY', lastTotal: 10, spend: 0.5, since: 1000 }
  const progress = advanceProgress(first, { currency: 'CNY', total: 8.25 }, 2000)
  assert.deepEqual(progress, { currency: 'CNY', lastTotal: 8.25, spend: 2.25, since: 1000 })
})

test('a top-up moves the baseline without adding negative spend', () => {
  const first = { currency: 'CNY', lastTotal: 10, spend: 1.25, since: 1000 }
  const progress = advanceProgress(first, { currency: 'CNY', total: 20 }, 2000)
  assert.deepEqual(progress, { currency: 'CNY', lastTotal: 20, spend: 1.25, since: 1000 })
})

test('a currency switch starts a new baseline', () => {
  const first = { currency: 'CNY', lastTotal: 10, spend: 3, since: 1000 }
  const progress = advanceProgress(first, { currency: 'USD', total: 4 }, 2000)
  assert.deepEqual(progress, { currency: 'USD', lastTotal: 4, spend: 0, since: 2000 })
})

test('progress persists per session and survives malformed storage', () => {
  const { storage } = loadClient()
  const client = loadClient(storage).exports._internals
  const key = client.storageKey('session-1')
  assert.equal(key, 'dsh.balance-pill/v1/session-1')

  client.writeProgress('session-1', { currency: 'CNY', lastTotal: 9, spend: 1, since: 1234 })
  assert.deepEqual(client.readProgress('session-1'), {
    currency: 'CNY',
    lastTotal: 9,
    spend: 1,
    since: 1234,
  })

  storage.values.set(key, '{not json')
  assert.equal(client.readProgress('session-1'), undefined)

  storage.values.set(key, JSON.stringify({ currency: 'CNY', lastTotal: 'x', spend: 1 }))
  assert.equal(client.readProgress('session-1'), undefined)

  storage.values.set(key, JSON.stringify({ currency: 'CNY', lastTotal: 9, spend: -3, since: 0 }))
  const clamped = client.readProgress('session-1')
  assert.equal(clamped.currency, 'CNY')
  assert.equal(clamped.lastTotal, 9)
  assert.equal(clamped.spend, 0)
  assert.equal(typeof clamped.since, 'number')
})

test('storage failures never break the reading', () => {
  const broken = {
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('quota')
    },
    removeItem() {
      throw new Error('blocked')
    },
  }
  const client = loadClient(broken).exports._internals
  assert.equal(client.readProgress('session-1'), undefined)
  assert.doesNotThrow(() => {
    client.writeProgress('session-1', { currency: 'CNY', lastTotal: 1, spend: 0, since: 1 })
  })
})

test('formats money with the active locale and currency sign', () => {
  assert.equal(moneyText(6.19, 'CNY', 'zh', 2), '¥6.19')
  assert.equal(moneyText(6.19, 'CNY', 'zh-CN', 2), '¥6.19')
  assert.equal(moneyText(1.5, 'USD', 'en', 2), '$1.50')
  assert.equal(moneyText(0.0042, 'CNY', 'en', 4), '¥0.0042')
  assert.equal(spendDigits(0), 2)
  assert.equal(spendDigits(0.005), 4)
  assert.equal(spendDigits(1), 2)
})

test('translates known keys and leaves unknown keys visible', () => {
  assert.equal(translate('zh', 'balance'), '余额')
  assert.equal(translate('zh-CN', 'balance'), '余额')
  assert.equal(translate('en', 'spent'), 'This session')
  assert.equal(translate('zh', 'since', { time: '12:00' }), '自 12:00 起累计')
  assert.equal(translate('zh', 'missing-key'), 'missing-key')
  assert.equal(translate('fr', 'balance'), 'Balance')
})

test('exposes the internal helpers only through the test bridge', () => {
  assert.equal(typeof storageKey, 'function')
  assert.equal(exports._internals.storageKey('x'), 'dsh.balance-pill/v1/x')
})
