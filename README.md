# Our Jam

Live music made together. Fans contribute **Sound Waves**, move five votes among them, and help turn an artist's album into a new release at every show.

## Development

Production multiplayer comes first. Read [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), [PROGRESS.md](PROGRESS.md), and [the canonical 54-work-package roadmap](registry/roadmap.json). The DJ version and the secondary demonstration mode have separate specifications in `docs/10-dj-v2-plan.md` and `docs/11-demonstration-plan.md`.

Node.js 24 and npm are required. Use `npm ci` and `npm run check`. Application setup and deployment commands are added with their implementation; no provider, hardware or production readiness is implied by this repository's existence.

The shared TypeScript application uses a React web client, Fastify API, PostgreSQL, and a durable job queue. The full plan also includes Expo iOS/Android clients.

## Project resources

- GitHub: https://github.com/neophilism/Our-Jam
- Render project: `prj-db5btotckfvc739m1ck0`
- Neon project: `crimson-hat-87508124`
- Neon production branch: `br-aged-sea-b55fzq0v`

Never reuse credentials or services from another project. Never commit secret values. The artist's core prompts and unpublished recordings are private. See [security boundaries](docs/security-implementation.md).

## Running the implemented application

Install with `npm ci`. Configure `.env.local` from `.env.example` using only Our Jam's development database. Apply migrations with `npm run db:migrate`, then run `npm run dev:api` and `npm run dev:web` in separate terminals. Production builds use `npm run build` and `npm start` with runtime environment variables.

The performer route is `/performer`; audience entry is `/event/<code>` and the public display is `/screen/<code>`. Artist archives use `/artist/<id>` and the current guest’s liked tracks use `/library`. Artist core prompts remain private. Music generation starts disabled and needs approved provider/storage configuration. No demonstration data is seeded by production startup.

See [deployment](docs/deployment.md), [generation activation](docs/generation-implementation.md), and [playback/recording recovery](docs/playback-and-recovery.md). Responsive browser clients are implemented; native iOS/Android delivery remains a separate V1 milestone.

## End-to-End Everywhere progress

The canonical [security/e2eesa-status.json](security/e2eesa-status.json) records standard implementation, complete testing and independent expert review separately. Engine Room reads it automatically from GitHub. All initial stages are pending; existing profile locks and approved decisions remain authoritative. Read [adoption and independent-account instructions](docs/E2EESA_ADOPTION.md), and run `python3 scripts/validate_e2eesa_status.py`. Record validation does not establish product security or certification.
