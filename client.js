window.__ModuleLoader__.load({
  id: 'dsh-balance-pill',
  factory(require) {
    const React = require('react')

    const NS = 'dsh-balance-pill'
    const SLOT = 'conversation.composer.dock'
    const ROUTE = '/dsh-balance-pill/state'
    const STORAGE_PREFIX = 'dsh.balance-pill/v1/'
    const LAST_KEY = 'dsh.balance-pill/last/v1'
    const REFRESH_MS = 60000
    const MIN_GAP_MS = 15000
    const MAX_BACKOFF_MS = 300000
    const SETTLE_MS = 2500
    const REQUEST_TIMEOUT_MS = 20000

    const EN = {
      balance: 'Balance',
      spent: 'This session',
      unknown: '—',
      pending: '…',
      signedOut: 'Sign in to a DeepSeek account to read the balance.',
      failed: 'Balance read failed. Click to retry.',
      clickHint: 'Click to refresh',
      breakdown: 'Recharged {recharged} · Granted {granted} · Updated {time}',
      since: 'Counting since {time}',
    }
    const ZH = {
      balance: '余额',
      spent: '本次',
      unknown: '—',
      pending: '…',
      signedOut: '未登录 DeepSeek 账号，无法读取余额。',
      failed: '余额读取失败，点击重试。',
      clickHint: '点击刷新',
      breakdown: '充值 {recharged} · 赠送 {granted} · 更新于 {time}',
      since: '自 {time} 起累计',
    }

    const CSS = [
      '.dshbp_anchor{min-width:0;display:inline-flex}',
      '.dshbp_pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:1px 8px;border:0;border-radius:var(--dsw-radius-sm,4px);background:0 0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-family:inherit;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer}',
      '.dshbp_pill:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-secondary)}',
      '.dshbp_pill:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}',
      '.dshbp_pill svg{flex:none;width:14px;height:14px}',
      '.dshbp_label{min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.dshbp_code{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));opacity:.7}',
      '.dshbp_sep{flex:none;color:var(--dsw-alias-separator-primary,currentColor);margin:0 2px}',
    ].join('')

    function isChinese(active) {
      return typeof active === 'string' && active.toLowerCase().startsWith('zh')
    }

    function localeTag(active) {
      return isChinese(active) ? 'zh-CN' : 'en-US'
    }

    function currencySign(currency) {
      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      return currency ? `${currency} ` : ''
    }

    function amountText(value, active, digits) {
      try {
        return new Intl.NumberFormat(localeTag(active), {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(value)
      } catch {
        return value.toFixed(digits)
      }
    }

    function moneyText(value, currency, active, digits) {
      return `${currencySign(currency)}${amountText(value, active, digits)}`
    }

    function spendDigits(value) {
      return value > 0 && value < 0.01 ? 4 : 2
    }

    function clockText(time, active) {
      try {
        return new Date(time).toLocaleTimeString(localeTag(active), { hour12: false })
      } catch {
        return new Date(time).toISOString()
      }
    }

    function readJson(key) {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return undefined
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : undefined
      } catch {
        // Storage can be unavailable (private mode, quota); a missing reading is not fatal.
        return undefined
      }
    }

    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Storage can be unavailable (private mode, quota); the reading still works for this mount.
      }
    }

    function normaliseSummary(source) {
      if (source === undefined || source === null) return undefined
      const total = Number(source.total)
      if (!Number.isFinite(total)) return undefined
      return {
        currency: source.currency === 'USD' ? 'USD' : 'CNY',
        recharged: Number(source.recharged) || 0,
        granted: Number(source.granted) || 0,
        total,
      }
    }

    function storageKey(sessionId) {
      return `${STORAGE_PREFIX}${sessionId}`
    }

    function readProgress(sessionId) {
      const parsed = readJson(storageKey(sessionId))
      if (parsed === undefined) return undefined
      const lastTotal = Number(parsed.lastTotal)
      const spend = Number(parsed.spend)
      if (!Number.isFinite(lastTotal) || !Number.isFinite(spend)) return undefined
      return {
        currency: parsed.currency === 'USD' ? 'USD' : 'CNY',
        lastTotal,
        spend: spend > 0 ? spend : 0,
        since: Number(parsed.since) || Date.now(),
      }
    }

    function writeProgress(sessionId, progress) {
      writeJson(storageKey(sessionId), progress)
    }

    /** The last successful reading, reused for the first paint after a remount. */
    function readLastBalance() {
      const parsed = readJson(LAST_KEY)
      if (parsed === undefined) return undefined
      const summary = normaliseSummary(parsed)
      if (summary === undefined) return undefined
      return { summary, at: Number(parsed.at) || Date.now() }
    }

    function writeLastBalance(summary, at) {
      writeJson(LAST_KEY, { ...summary, at })
    }

    function clearLastBalance() {
      try {
        window.localStorage.removeItem(LAST_KEY)
      } catch {
        // Storage unavailable; nothing cached to clear.
      }
    }

    /**
     * Advance the per-session running total: only a drop of the wallet counts as
     * spend, so a top-up or a bonus never turns into a negative charge.
     */
    function advanceProgress(previous, summary, now) {
      if (!previous || previous.currency !== summary.currency) {
        return { currency: summary.currency, lastTotal: summary.total, spend: 0, since: now }
      }
      const delta = previous.lastTotal - summary.total
      return {
        currency: summary.currency,
        lastTotal: summary.total,
        spend: delta > 0 ? previous.spend + delta : previous.spend,
        since: previous.since,
      }
    }

    function translate(locale, key, params) {
      const template = (isChinese(locale) ? ZH : EN)[key] ?? EN[key] ?? key
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      )
    }

    function shortCode(value) {
      if (typeof value !== 'string' || value.length === 0) return undefined
      return value.length > 24 ? `${value.slice(0, 21)}…` : value
    }

    function balanceIcon() {
      return React.createElement(
        'svg',
        { viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false' },
        React.createElement('rect', {
          x: 1.75,
          y: 4,
          width: 12.5,
          height: 8.25,
          rx: 2,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.2,
        }),
        React.createElement('path', {
          d: 'M9.75 4v8.25',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.2,
        }),
        React.createElement('circle', { cx: 11.7, cy: 8.15, r: 0.85, fill: 'currentColor' }),
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'balance-pill: dictionaries')
      ctx.effect(() => {
        if (document.querySelector(`style[data-dsh-plugin="${NS}"]`) !== null) return () => {}
        const tag = document.createElement('style')
        tag.dataset.dshPlugin = NS
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'balance-pill: styles')

      function BalancePill(props) {
        const sessionId = props.sessionId
        const useProjection = props.useProjection
        const stats = useProjection('sessionStats')
        const steps = typeof stats?.steps === 'number' ? stats.steps : 0
        const [balance, setBalance] = React.useState(() => {
          const cached = readLastBalance()
          if (cached === undefined) return { phase: 'loading' }
          return { phase: 'ready', summary: cached.summary, at: cached.at }
        })
        const [revision, setRevision] = React.useState(0)
        const alive = React.useRef(true)
        const inflight = React.useRef(false)
        const lastFetch = React.useRef(0)
        const sessionRef = React.useRef(sessionId)
        sessionRef.current = sessionId

        // The session's own running total, re-read whenever the Session or a reading changes.
        const progress = React.useMemo(
          () => readProgress(sessionId),
          [sessionId, revision],
        )

        const refresh = React.useCallback(async (force) => {
          if (inflight.current) return false
          if (!force && Date.now() - lastFetch.current < MIN_GAP_MS) return false
          inflight.current = true
          lastFetch.current = Date.now()
          const target = sessionRef.current
          const controller = new AbortController()
          const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
          try {
            const query = `?locale=${encodeURIComponent(ctx.locale.getSnapshot().active)}&tz=${-new Date().getTimezoneOffset() * 60}`
            const response = await fetch(`${ROUTE}${query}`, {
              headers: { accept: 'application/json' },
              cache: 'no-store',
              signal: controller.signal,
            })
            const body = await response.json().catch(() => undefined)
            if (!alive.current) return false
            if (body === undefined || body.ok !== true) {
              const code = shortCode(body?.error) ?? `http-${response.status}`
              setBalance((previous) =>
                previous.phase === 'ready' ? { ...previous, error: code } : { phase: 'failed', error: code },
              )
              return false
            }
            if (body.status !== 'ready') {
              if (body.status === 'signed-out') {
                clearLastBalance()
                setBalance({ phase: 'signed-out' })
                return false
              }
              setBalance((previous) =>
                previous.phase === 'ready' ? { ...previous, error: 'rejected' } : { phase: 'failed', error: 'rejected' },
              )
              return false
            }
            const summary = normaliseSummary(body)
            if (summary === undefined) {
              setBalance((previous) =>
                previous.phase === 'ready' ? { ...previous, error: 'empty' } : { phase: 'failed', error: 'empty' },
              )
              return false
            }
            const now = Date.now()
            writeProgress(target, advanceProgress(readProgress(target), summary, now))
            writeLastBalance(summary, now)
            setBalance({ phase: 'ready', summary, at: now })
            setRevision((value) => value + 1)
            return true
          } catch (error) {
            if (!alive.current) return false
            const code = error?.name === 'AbortError'
              ? 'timeout'
              : shortCode(error instanceof Error ? error.message : String(error)) ?? 'failed'
            setBalance((previous) =>
              previous.phase === 'ready' ? { ...previous, error: code } : { phase: 'failed', error: code },
            )
            return false
          } finally {
            window.clearTimeout(timeout)
            inflight.current = false
          }
        }, [])

        // One polling loop for this mount; it survives Session switches so the reading never blanks.
        React.useEffect(() => {
          alive.current = true
          let timer = 0
          let cancelled = false
          let failures = 0
          const loop = async () => {
            const ok = await refresh(true)
            if (cancelled) return
            failures = ok ? 0 : failures + 1
            const delay = ok
              ? REFRESH_MS
              : Math.min(REFRESH_MS * 2 ** Math.min(failures, 3), MAX_BACKOFF_MS)
            timer = window.setTimeout(loop, delay)
          }
          void loop()
          const wake = () => {
            if (document.visibilityState === 'visible') void refresh(false)
          }
          window.addEventListener('focus', wake)
          document.addEventListener('visibilitychange', wake)
          return () => {
            cancelled = true
            alive.current = false
            window.clearTimeout(timer)
            window.removeEventListener('focus', wake)
            document.removeEventListener('visibilitychange', wake)
          }
        }, [refresh])

        // A Session switch only re-reads that Session's running total; the balance stays on screen.
        React.useEffect(() => {
          void refresh(false)
        }, [sessionId, refresh])

        const lastSteps = React.useRef(steps)
        React.useEffect(() => {
          if (steps === lastSteps.current) return undefined
          lastSteps.current = steps
          const timer = window.setTimeout(() => {
            void refresh(false)
          }, SETTLE_MS)
          return () => window.clearTimeout(timer)
        }, [steps, refresh])

        const active = ctx.locale.getSnapshot().active
        const tr = typeof props.t === 'function' ? props.t : (key, params) => translate(active, key, params)
        const open = () => {
          void refresh(true)
        }

        const anchor = (children, title, label) =>
          React.createElement(
            'span',
            { className: 'dshbp_anchor' },
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'dshbp_pill',
                title,
                'aria-label': label,
                onClick: open,
              },
              balanceIcon(),
              children,
            ),
          )

        if (balance.phase === 'loading') {
          const pending = `${tr('balance')} ${tr('pending')}`
          return anchor(
            React.createElement('span', { className: 'dshbp_label' }, pending),
            `${tr('clickHint')}`,
            pending,
          )
        }

        if (balance.phase !== 'ready') {
          const label = `${tr('balance')} ${tr('unknown')}`
          const hint = balance.phase === 'signed-out' ? tr('signedOut') : tr('failed')
          const suffix = balance.phase === 'signed-out' ? undefined : shortCode(balance.error)
          return anchor(
            [
              React.createElement('span', { key: 'label', className: 'dshbp_label' }, label),
              suffix === undefined
                ? null
                : React.createElement('span', { key: 'code', className: 'dshbp_code' }, `(${suffix})`),
            ],
            [hint, suffix, tr('clickHint')].filter(Boolean).join('\n'),
            suffix === undefined ? label : `${label} ${suffix}`,
          )
        }

        const { summary, at } = balance
        const spend = progress?.spend ?? 0
        const since = progress?.since
        const totalText = `${tr('balance')} ${moneyText(summary.total, summary.currency, active, 2)}`
        const spendText = `${tr('spent')} ${moneyText(spend, summary.currency, active, spendDigits(spend))}`
        const title = [
          tr('breakdown', {
            recharged: moneyText(summary.recharged, summary.currency, active, 2),
            granted: moneyText(summary.granted, summary.currency, active, 2),
            time: clockText(at, active),
          }),
          since === undefined ? undefined : tr('since', { time: clockText(since, active) }),
          balance.error === undefined ? undefined : `${tr('failed')} (${balance.error})`,
          tr('clickHint'),
        ]
          .filter((line) => line !== undefined)
          .join('\n')

        return anchor(
          [
            React.createElement('span', { key: 'total', className: 'dshbp_label' }, totalText),
            React.createElement('span', { key: 'sep', className: 'dshbp_sep', 'aria-hidden': true }, '·'),
            React.createElement('span', { key: 'spend', className: 'dshbp_label' }, spendText),
          ],
          title,
          `${totalText} · ${spendText}`,
        )
      }

      ctx.slots.inject(SLOT, () =>
        ctx.slots.register(
          {
            name: SLOT,
            id: 'balance-pill',
            order: 2,
            locale: NS,
          },
          BalancePill,
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply,
      // Pure helpers for the Node test suite. The client module loader ignores
      // unknown exports; none of these are part of the plugin's public API.
      _internals: {
        advanceProgress,
        normaliseSummary,
        readProgress,
        writeProgress,
        moneyText,
        spendDigits,
        translate,
        storageKey,
      },
    }
  },
})
