# HTTP Security Boundary

The current API foundation does not implement authentication, browser
sessions, cookies, JWTs, or authorization.

## Current controls

- Helmet applies common HTTP security headers centrally.
- Helmet omits the CSP `upgrade-insecure-requests` directive only in
  development so browsers do not rewrite local Swagger/API HTTP requests to
  HTTPS. The directive remains enabled through Helmet defaults outside
  development.
- CORS permits browser requests only from the configured origin allowlist.
- CORS credentials are disabled.
- Requests without an `Origin` header remain available to health probes and
  server-to-server clients.
- JSON request bodies have a configurable maximum size.
- `/api/v1` uses a temporary per-process rate limiter.
- Structured logs redact common credential-bearing fields while retaining the
  correlation ID.

## CSRF boundary

No CSRF mechanism is implemented in this pass because the API does not yet use
cookie-based authentication or sessions. Restrictive CORS is not treated as a
replacement for CSRF protection.

If browser cookie-based authentication is approved later, that authentication
pass must define the CSRF policy together with cookie `SameSite`, `Secure`, and
origin-validation behavior. Bearer-token and cookie-based flows must be
evaluated separately before authentication is implemented.

## Trusted proxy boundary

`TRUSTED_PROXY_CIDRS` is an optional comma-separated list of literal IPv4/IPv6
addresses or CIDRs. Unset or blank means no trusted proxies, preserving direct
local HTTP access. Whitespace around entries is trimmed. Hostnames, aliases
such as `loopback` or `uniquelocal`, boolean trust, hop counts, wildcards, and
zero-prefix (`/0`) networks are rejected, as are IPv6 networks that cover all
IPv4-mapped addresses. Trust is never inferred from
`NODE_ENV` or private network membership.

Operators must provide the actual proxy addresses for their deployment and
keep the allowed networks as narrow as practical. No production topology or
proxy address is prescribed here. A trusted network grants trust to every
machine in that network, so it must not include untrusted clients.

Express applies this setting before middleware registration. It starts with
the socket peer and examines `X-Forwarded-For` from right to left, stopping at
the first untrusted address. Untrusted peers cannot replace the socket IP
using forwarded headers. The current rate limiter and authentication audit/
session metadata continue to use Express `request.ip`.

Trusted proxies must remove or sanitize client-supplied `X-Forwarded-For`,
`X-Forwarded-Proto`, and `X-Forwarded-Host`, supplying the verified client chain,
external scheme, and host. When the socket peer is trusted, Express also uses
forwarded protocol/host values; an IP allowlist cannot compensate for a proxy
that blindly passes attacker-controlled headers. The standard `Forwarded`
header is not used for identity resolution by the current Express stack.

This policy does not change refresh-cookie security or authentication rules.
Proxy trust does not make rate-limit counters shared across API processes.

## Known rate-limit limitation

The current limiter stores counters in API process memory. Counters are not
shared across multiple API instances and reset when a process restarts. A
Redis-backed or equivalent distributed store will replace or extend this
foundation only when Redis and deployment topology are approved.
