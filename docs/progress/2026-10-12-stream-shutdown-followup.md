# Event-stream shutdown regression follow-up

At c2b6e5af332c80bd20cc0fa10a4fb5880743c480, CI run 38248922551 passed 58 of 59 application tests but failed the new live HTTP shutdown test. The late onRequest hook was insufficient to track core routes that had already been registered. The implementation now observes matching event-stream requests at the existing HTTP server before Fastify dispatch, then ends those responses in preClose. It does not bypass route authentication or close ordinary requests.

The regression retains both a live SSE response and a deliberately pending ordinary request during shutdown. It verifies the SSE ends while the ordinary request may still finish. Failure cleanup closes test-only connections; production never indiscriminately calls closeAllConnections. Phase-specific diagnostics identify any further failure. Exact-head CI is required before calling this correction verified. No cloud resource, schema, provider call or spending is changed.
