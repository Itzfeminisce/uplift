# @uplift-io/fastify

Fastify adapter for Uplift. Register `upliftFastify(uploads)` or call `createFastifyHandler(uploads)` with a `Request`.

Async Transform Job polling is served by the same mounted `GET` handler. Run workers separately with `@uplift-io/uplift/server`; the adapter does not own queue policy or realtime delivery.
