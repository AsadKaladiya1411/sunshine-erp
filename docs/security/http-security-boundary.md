# HTTP Security Boundary

The current API foundation implements organization-scoped authentication and
centralized authorization. Authentication routes are available under
`/api/v1/auth`; access tokens are JWT bearer tokens, refresh credentials use an
HttpOnly cookie, and authenticated sessions are validated against PostgreSQL.

## Current controls

- Helmet applies common HTTP security headers centrally.
- Helmet omits the CSP `upgrade-insecure-requests` directive only in
  development so browsers do not rewrite local Swagger/API HTTP requests to
  HTTPS. The directive remains enabled through Helmet defaults outside
  development.
- CORS permits browser requests only from the configured origin allowlist.
- CORS credentials are enabled so approved browser origins can use the
  refresh-token cookie.
- Requests without an `Origin` header remain available to health probes and
  server-to-server clients.
- Refresh tokens use an HttpOnly cookie whose `Secure`, `SameSite`, and path
  attributes come from centralized configuration. Production configuration
  rejects an insecure refresh cookie, and `SameSite=None` also requires
  `Secure` in every environment.
- Authenticated routes validate the JWT access token and its authoritative
  PostgreSQL-backed session. Centralized RBAC permission enforcement is
  available for permission-protected operations.
- JSON request bodies have a configurable maximum size.
- `/api/v1` uses a temporary per-process rate limiter.
- Structured logs redact common credential-bearing fields while retaining the
  correlation ID.
- Client-supplied correlation IDs are accepted only after trimming when they
  contain no more than 255 ASCII letters, digits, periods, underscores, colons,
  or hyphens. Missing or invalid values are replaced with a generated UUID.

## CSRF boundary

The API does not implement a general-purpose CSRF-token framework. The
cookie-bearing refresh and logout routes require an `Origin` header that
exactly matches the configured origin allowlist. The refresh credential remains
in its HttpOnly cookie, while protected access-token operations use bearer
authentication.

Restrictive CORS is not treated as the sole CSRF control. The trusted-Origin
check is enforced directly on refresh and logout in addition to the configured
refresh-cookie `SameSite` and `Secure` attributes.

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
