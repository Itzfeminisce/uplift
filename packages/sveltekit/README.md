# @uplift-io/sveltekit

SvelteKit endpoint adapter for Uplift. Export the handlers returned by `createSvelteKitHandler(uploads)`.

Async Transform Job polling is served by the exported `GET` handler. Run workers separately with `@uplift-io/uplift/server`; the adapter does not own queue policy or realtime delivery.
