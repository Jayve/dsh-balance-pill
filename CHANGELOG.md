# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-21

### Added

- Composer-dock pill showing the signed-in DeepSeek wallet balance and the
  wallet drop observed since the current session started.
- Host route `GET /dsh-balance-pill/state` backed by `deepseekAccount`, so the
  browser never calls the account Remote namespace or handles credentials.
- Per-session spend ledger in `localStorage`, with a last-good summary reused
  across page reloads.
- Automatic refresh every 60 seconds, on focus, after a turn settles, and on
  click; 15-second minimum gap and 120 s → 300 s failure backoff.
- A 20-second abort on each state request, rendered as a `timeout` code so a
  hung account call cannot block later refreshes.
- Automatic client identity from the running Web host, with an optional
  `clientVersion` override.
- CNY/USD wallet folding with CNY preference, bonus wallets included, and
  4-decimal display for amounts below `0.01`.
- Bilingual UI dictionaries (English and Chinese) and locale metadata.
- Host and client test suites, CI, release workflow, and contribution and
  security policies.

### Security

- The state route is loopback-only, `GET`-only, uncached, and returns amounts
  only. It has no additional authentication, matching other local plugin
  routes; any local process can read the balance.
- The route requires a loopback `Host` authority, which blocks a DNS-rebinding
  page served from a public hostname that resolves to 127.0.0.1.

[Unreleased]: https://github.com/Jayve/dsh-balance-pill/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Jayve/dsh-balance-pill/releases/tag/v1.0.0
