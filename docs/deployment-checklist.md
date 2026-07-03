# Deployment Safety Checklist

This checklist is the operating rule for PR verification, merge, and production follow-up.
It exists to prevent destructive tests from running against an operating database and to
make custom domain alias drift visible before users are affected.

## Environment Contract

- `NewMES` is the functional verification server.
  - Run feature E2E checks only here.
  - Create/delete temporary test data only here.
  - Confirm user-facing workflows here before merge or rollout.
- `cns-medical-mes` Preview and Production can point at the operating database.
  - Do not create test data.
  - Do not delete or mutate operating data.
  - Do not create accounts.
  - Do not run destructive feature E2E tests.
  - Only verify build success, route health, redirects, and runtime errors.

## Pre-Merge Checks

Run these before opening or updating the PR completion report:

```bash
npm run type-check
npm run lint
npm run build
npm run check:server-actions
git diff --name-only origin/main...HEAD
```

Confirm the changed files do not include out-of-scope areas such as:

- `prisma/schema.prisma`
- `next.config.mjs`
- monitoring, kiosk, NCWatch, LMS, or unrelated production modules
- scripts that mutate the operating database unless the PR is explicitly approved for that

## Production Deployment Checks

After merge, verify both production deployments:

- `new_mes` Production deployment is `Ready`.
- `cns-medical-mes` Production deployment is `Ready`.
- The production deployment commit matches the merge commit.
- `cnsmes.co.kr` points to the latest `cns-medical-mes` Production deployment, not an older rollback deployment.

Useful read-only commands:

```bash
npx vercel inspect https://cnsmes.co.kr
npx vercel alias list --format json --limit 100
npx vercel list cns-medical-mes --environment production --status READY --format json
```

If the custom domain alias points at an unexpected deployment, stop and report the mismatch.
Only reassign the alias when the operator explicitly asks for that change.

## Customer Domain Smoke Checks

Use unauthenticated read-only requests only:

- `https://cnsmes.co.kr/login` returns `200`.
- Protected application URLs return `307` to `/login` or another expected non-mutating response.
- Important master-data routes are checked without logging in or creating test data.

Example URLs:

```text
https://cnsmes.co.kr/login
https://cnsmes.co.kr/app/mes/master/item-categories
https://cnsmes.co.kr/app/mes/master/item-groups
https://cnsmes.co.kr/app/mes/items
```

## Runtime Log Checks

Check `cnsmes.co.kr` and the current `cns-medical-mes` Production deployment logs for:

- no `500` responses
- no `A "use server" file can only export async functions` errors
- no `Server Components render` errors
- no unexpected error-level logs from the verification requests

Useful read-only commands:

```bash
npx vercel logs https://cnsmes.co.kr --since 30m --status-code 500 --json --limit 100
npx vercel logs https://cnsmes.co.kr --since 30m --query "use server" --json --limit 100
npx vercel logs https://cnsmes.co.kr --since 30m --query "Server Components" --json --limit 100
npx vercel logs https://cnsmes.co.kr --since 30m --level error --json --limit 100
```

## Report Items

Every production follow-up report should include:

- merge commit
- `new_mes` deployment result
- `cns-medical-mes` deployment result
- `cnsmes.co.kr` alias target deployment and commit
- `/login` and protected URL response results
- runtime log result
- migration required or not required
- operating DB changes, if any
- special notes
