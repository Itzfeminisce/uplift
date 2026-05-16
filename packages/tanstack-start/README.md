# @uplift-io/tanstack-start

TanStack Start route adapter for Uplift. Export the handlers returned by `createTanStackStartHandler(uploads)`.

Async Transform Job polling is served by the exported `GET` handler. Run workers separately with `@uplift-io/uplift/server`; the adapter does not own queue policy or realtime delivery.
