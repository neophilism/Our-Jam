> **Canonical PR roadmap:** [registry/roadmap.json](registry/roadmap.json). This detailed development plan is preserved as original source; agents must update canonical PR tracking file.

# Production development plan

## Outcome and ordering

V1 is the actual artist-and-audience product: multiuser phone participation, public visualization, generation, free releases, performer selection, and recording through supported audio hardware. Native iOS and Android delivery belongs to V1. V2 adds DJ-controlled rounds and mixing integrations. Demonstration mode is a separate secondary deliverable after production V1; it is not the first implementation.

The first-show candidate is a smaller deployment of the production system with the same authentication, database, voting invariants, job processing and release architecture. It does not substitute simulated users or prerecorded outputs for live audience generation. If the candidate cannot pass the event gates, use the traditional first show and deploy the application at the second or third show.

## Milestones

| Milestone | PRs | Observable exit condition |
| --- | --- | --- |
| Foundation and feasibility | P001–P007 | Self-contained repository, approved provider path, verified audio plan, staging and scoped identities |
| Crowd co-creation | P008–P013 | Real phones vote against one authoritative round and a readable 3D public display |
| Generation and release | P014–P019 | One billed generation per closed round, downloadable published media, feedback and notifications |
| Live performance candidate | P020–P027 | Performer preview and queue, validated recording route, rehearsed production deployment |
| Complete web and mobile V1 | P028–P041 | Advanced visual design, native apps, richer fan features, recording exports and scale hardening |
| V1 release | P042 | Full acceptance matrix passes on real hardware and production resources |
| DJ V2 | D001–D008 | Performer-defined round boundaries and audited mixing integrations |
| Secondary demonstration | M001–M004 | Isolated presentation and single-user mode using production contracts |

The event candidate needs all P001–P027 unless an explicit feature gate in the show plan identifies a supported fallback. P028–P042 complete the requested V1 scope. D and M tracks may begin after P042; demonstration has lower priority than production improvements and DJ event commitments.

## Dependency and merge policy

The explicit dependency lists in the PR register are minimum prerequisites. Follow numerical order by default; independent work can be prepared ahead without merging consumers before their prerequisites. Full V1 waits for every P PR. D008 waits for every D PR; M004 waits for every M PR.

Once implementation is authorized, create a branch and reviewable PR for each slice, run required checks on its actual head, resolve failures or merge conflicts, and merge when GitHub reports the PR safely mergeable and required checks pass. Do not bypass branch protections. Rebase or update dependent branches and rerun affected checks after parent merges. Continue to the next available PR without routine approvals. No new spending, destructive resource changes or unauthorized external messages are implied.

Each PR includes the problem, changes, affected contracts, migrations, test evidence, rollback or feature-flag strategy, and progress updates. Keep deployment references, credential requirements without secret values, architectural decisions, operational instructions and acceptance evidence in the repository. Track the project in Engine Room using its actual integration when supplied; preserve an unsynced local record if access is absent.

## Release gates

- G0: Provider account can legally and technically support this exact application, standalone downloads and public use; the show hardware route is verified.
- G1: Real multiuser voting satisfies budget, cutoff, deduplication, identity and tenant-isolation invariants.
- G2: Closed rounds produce recoverable jobs and approved audio; files publish atomically with clear failure states.
- G3: The artist can preview privately, insert next and preserve local album playback during network trouble; recording passes the declared hardware tier.
- G4: Real iPhone and Android rehearsal, restore exercise, monitoring, venue QR visibility and failover pass for the declared audience cap.
- G5: Full native and web V1 feature, accessibility, privacy, store and operational acceptance passes.

G0 through G4 are required for a first-show deployment. G5 is required to call V1 complete. These are evidence gates, not self-certifications. Reconcile the user's full End-To-End-Everywhere Security Architecture Standard when it is available; do not claim conformance from its title.

