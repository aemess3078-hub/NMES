# PR Completion Report Template

Use this template when reporting a PR that changes production-facing behavior.

## Summary

- PR:
- Branch:
- Commit:
- Scope:
- Explicitly excluded areas:

## Code Changes

- Changed files:
- Schema changed: yes/no
- Migration required: yes/no
- `next.config.mjs` changed: yes/no
- Operating DB data changed: yes/no

## Validation

- `npm run type-check`:
- `npm run lint`:
- `npm run build`:
- `npm run check:server-actions`:
- Additional checks:

## Functional Verification

- NewMES feature verification:
- Test data created in NewMES: yes/no
- Test data deleted in NewMES: yes/no
- AuditLog checked: yes/no/not applicable

## cns-medical-mes Read-Only Verification

- Preview deployment:
- Production deployment:
- `cnsmes.co.kr` alias target deployment:
- `cnsmes.co.kr` alias target commit:
- `/login` response:
- protected URL response:
- Runtime Logs `500`:
- Runtime Logs `"use server"`:
- Runtime Logs `Server Components`:

## Operating Safety

- Operating DB data creation: none / details
- Operating DB data deletion: none / details
- Operating account creation: none / details
- Destructive E2E on cns-medical-mes: no / details

## Notes

- Special notes:
- Follow-up:
