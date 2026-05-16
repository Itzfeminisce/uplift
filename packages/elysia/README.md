# @uplift-io/elysia

Elysia adapter for Uplift. Mount `upliftElysia(uploads)` to expose `HEAD`, `GET`, and `POST`.

Async Transform Job polling is served by the same mounted `GET` handler. Run workers separately with `@uplift-io/uplift/server`; the adapter does not own queue policy or realtime delivery.
