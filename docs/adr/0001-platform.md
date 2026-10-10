# ADR 0001: Shared TypeScript production application

Accepted October 10, 2026. Use Node.js 24, React, Vite, Fastify, PostgreSQL and Three.js. Keep domain functions independent from HTTP, database and rendering. The API hosts built web assets and uses a bounded connection pool. PostgreSQL-backed jobs and an event log survive restarts; no in-memory votes or process-local source of truth.

Use Neon development branch `br-blue-unit-b5rk1hit` for initial integration. Production is `br-aged-sea-b55fzq0v` in project `crimson-hat-87508124`. Local deterministic tests may use embedded PostgreSQL through PGlite; it is not a multi-instance production database or proof of hosted concurrency.

Render project `prj-db5btotckfvc739m1ck0` is the only deployment target. An initial web/API process can host the durable queue runner when no separately provisioned worker exists, with row leases and bounded work. A separate worker remains the live-event target. Free hosting can sleep and is not a live-show readiness claim.

See ADR 0002 for security scope. Provider access, album audio, storage and email are capabilities with explicit readiness. Missing integrations never generate fake tracks or fake success.
