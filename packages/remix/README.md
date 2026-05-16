# @uplift-io/remix

Remix adapter for Uplift. Use `createRemixHandler(uploads)` and export its `loader` and `action`.

Async Transform Job polling is served by the exported `loader`. Run workers separately with `@uplift-io/uplift/server`; the adapter does not own queue policy or realtime delivery.
