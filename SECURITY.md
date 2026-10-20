# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| `1.x` | Yes |
| `<1.0.0` | No (pre-release only) |

Harness compatibility is `>=0.2.1-rc.2 <0.3.0`; a Harness release outside that
range may break the plugin but is not a security support commitment.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Use GitHub's
private vulnerability reporting:

<https://github.com/Jayve/dsh-balance-pill/security/advisories/new>

Include:

- The affected version and Harness version.
- A description of the issue and its impact.
- Reproduction steps or a proof of concept.
- Any suggested fix or mitigation.

You can expect an acknowledgement within a few days. This is a volunteer
project, so timelines are best-effort. Please allow a reasonable window for a
fix and a release before public disclosure.

## Scope

In scope:

- The Host route: authentication/authorization expectations, loopback
  enforcement, `Host` authority validation, method handling, response leakage,
  header handling, error message leakage.
- DNS rebinding that could make the route same-origin with a public page.
- Credential or account-data exposure through the route, the client bundle, or
  `localStorage`.
- Injection or XSS through locale strings, error codes, or rendered values.
- Ledger corruption that could misrepresent spend in a security-relevant way.
- Supply-chain issues in the package contents or release workflow.

Out of scope / accepted risks:

- **Local process read access.** The route has no additional authentication.
  Any process on the same machine can read the balance number. This is the
  documented trust model for local plugin routes.
- **Shared-wallet attribution.** Multiple sessions on one account count each
  other's spend. This is a measurement limitation, not a vulnerability.
- **Platform billing delay.** Stale numbers caused by late settlement are
  expected.
- **Compromised Harness origin.** If the Harness Web origin is compromised, the
  attacker can read the same balance the UI displays. The plugin does not add a
  second credential boundary inside that origin.
- Vulnerabilities in DeepSeek Harness itself; report those upstream.

## Safe defaults

The plugin is loopback-only by default, has no remote code loading, no
telemetry, and no runtime dependencies. The shipped patch enables it with no
secrets. `clientVersion` is optional and carries no credential.
