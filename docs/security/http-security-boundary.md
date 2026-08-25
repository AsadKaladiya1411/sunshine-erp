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

## Known rate-limit limitation

The current limiter stores counters in API process memory. Counters are not
shared across multiple API instances and reset when a process restarts. A
Redis-backed or equivalent distributed store will replace or extend this
foundation only when Redis and deployment topology are approved.
