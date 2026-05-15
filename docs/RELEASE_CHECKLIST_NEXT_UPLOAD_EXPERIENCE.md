# Next Upload Experience Release Checklist

- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `pnpm build`.
- Run `pnpm docs:check`.
- Run `pnpm examples:check`.
- Run `pnpm bundle:size`.
- Run `pnpm smoke:pack`.
- Review `README.md`, package READMEs, docs snippets, and static site copy for shipped-only behavior.
- Review changelogs and changesets for core, OpenAPI, and framework adapter packages.
- Smoke check `HEAD`, `GET`, preflight `POST`, and upload `POST` on at least one framework adapter.
