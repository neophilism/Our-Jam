# Native implementation handoff

The mobile guest API and shared public types are independent of the Expo application dependencies. The audience client is in a separate draft PR because its dependency audit blocks merge/distribution.

Implemented client paths: event entry and custom links; origin-scoped SecureStore identity; native/browser shared ballot and release APIs; ranked searchable Sound Waves; stale-connection voting disable; foreground native playback and half-listen feedback; comments/reporting; profile anonymity; period-filtered event leaderboards. Generated native projects confirm the configured absence of audio recording permission.

Verified locally: TypeScript, iOS and Android JavaScript/Hermes export, native configuration generation, and server-side cross-client parity. No simulator/physical device or signed package has been tested. The application requires a real deployed HTTPS origin to connect; no placeholder endpoint is represented as a working environment.

The high-severity dependency gate remains enabled. Its known upstream findings are GHSA-vfj7-8cjw-p6xm (braces) and GHSA-86w9-cpqp-85rv (node-forge), with no patched releases listed at inspection. Do not suppress audit results or use an incompatible forced SDK downgrade. See the client README for reproducible commands, sources and remaining P032–P036 acceptance criteria.
