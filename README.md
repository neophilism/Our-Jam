# Our Jam

Live music made together. Fans contribute **Sound Waves**, move five votes among them, and help turn an artist's album into a new release at every show.

## Development

Production multiplayer comes first. Read [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), [PROGRESS.md](PROGRESS.md), and [the 54-PR backlog](backlog.json). The DJ version and the secondary demonstration mode have separate specifications in `docs/10-dj-v2-plan.md` and `docs/11-demonstration-plan.md`.

Node.js 24 and npm are required. Use `npm ci` and `npm run check`. Application setup and deployment commands are added with their implementation; no provider, hardware or production readiness is implied by this repository's existence.

The shared TypeScript application uses a React web client, Fastify API, PostgreSQL, and a durable job queue. The full plan also includes Expo iOS/Android clients.

## Project resources

- GitHub: https://github.com/neophilism/Our-Jam
- Render project: `prj-db5btotckfvc739m1ck0`
- Neon project: `crimson-hat-87508124`
- Neon production branch: `br-aged-sea-b55fzq0v`

Never reuse credentials or services from another project. Never commit secret values. The artist's core prompts and unpublished recordings are private. See [security boundaries](docs/security-implementation.md).
