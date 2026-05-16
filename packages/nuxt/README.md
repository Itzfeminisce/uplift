# @uplift-io/nuxt

Nuxt/Nitro-style adapter for Uplift. Use `createNuxtHandler(uploads)` from a server route.

Async Transform Job polling is served by the same server route. Run workers separately with `@uplift-io/uplift/server`; the adapter does not own queue policy or realtime delivery.
