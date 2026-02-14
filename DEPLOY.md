# Deployment Guide & Guardrails

## ⚠️ Critical: No Direct Production Edits

**NEVER** use `sed`, `perl`, or direct file edits on production servers.

### Why?
- Breaks build consistency
- Causes syntax errors
- Introduces timezone/date bugs
- Creates Server Action mismatches
- Makes debugging impossible

### Required Process

1. **Local Development**
   - Make changes locally
   - Run checks: `npm run lint && npm run typecheck && npm run test && npm run build`
   - Commit with pre-commit hooks (auto-runs lint/format)

2. **Pull Request**
   - Create PR
   - CI automatically runs:
     - Lint
     - Typecheck
     - Prisma query checks
     - Tests
     - Format check
     - Build
   - **Wait for CI to pass** before merging

3. **Deployment**
   - Merge PR only after CI passes
   - Deploy using standard process (Docker Compose, etc.)
   - Never hot-edit files on production

### Emergency Hotfixes

If you MUST edit production directly (only in true emergencies):

1. **After editing**, immediately:
   ```bash
   cd frontend
   npm run format
   npm run lint
   npm run typecheck
   npm run build
   ```

2. **If any check fails**, revert the change and follow proper PR process

3. **Document** the emergency edit in a follow-up PR

## Common Issues & Fixes

### Prisma Validation Errors

**Error**: `PrismaClientValidationError: Argument 'not' must not be null`

**Cause**: Using `{ not: null }` on Int fields

**Fix**: Replace with:
- `{ gt: 0 }` if meaning is "has positive value"
- `{ not: 0 }` if meaning is "non-zero"
- Keep `{ not: null }` only for nullable String/DateTime fields

**Prevention**: Run `npm run check-prisma` before committing

### Timezone Issues

**Error**: Teachers/students see wrong times

**Cause**: Using local timezone instead of Brazil timezone

**Fix**: Always use `@/lib/datetime` utilities:
- `formatTimeInTZ(iso, locale)` - format time
- `formatDateTimeInTZ(iso, locale)` - format date+time
- `isSameDayInTZ(a, b)` - compare days
- `getTimeInTZ(iso)` - get hour/minute

**Prevention**: Never use `getHours()`, `getMinutes()`, or `toLocaleDateString()` without timezone

### Build Failures

**Error**: TypeScript errors, missing imports, etc.

**Cause**: Inconsistent code after manual edits

**Fix**:
1. Run `npm run typecheck` locally
2. Fix all errors
3. Run `npm run build` to verify
4. Commit and push

**Prevention**: Pre-commit hooks run typecheck automatically

### Server Action Mismatch

**Error**: "Failed to find Server Action ... Missing next-action header"

**Cause**: Build/client mismatch or stale deployment

**Fix**:
1. Ensure clean build: `npm run clean && npm run build`
2. Restart all containers/services
3. Clear Next.js cache if needed
4. Verify deployment uses same build artifacts

**Prevention**: Always deploy from CI/CD pipeline, never manual builds

## Pre-Commit Hooks

Husky automatically runs:
- ESLint (with auto-fix)
- Prettier (formatting)
- Typecheck (if configured)

**Setup**: Husky is automatically installed when you run `npm install` (via `prepare` script).

To skip hooks (not recommended):
```bash
git commit --no-verify
```

## CI Checks

Every PR runs:
- ✅ Lint (`npm run lint`)
- ✅ Typecheck (`npm run typecheck`)
- ✅ Prisma query check (`npm run check-prisma`)
- ✅ Tests (`npm run test`)
- ✅ Format check (`npm run format:check`)
- ✅ Build (`npm run build`)

**Do not merge PRs with failing CI checks.**

## Scripts Reference

- `npm run lint` - Run ESLint
- `npm run typecheck` - TypeScript type checking
- `npm run test` - Run Jest tests
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without changing files
- `npm run check-prisma` - Check for problematic Prisma queries
- `npm run build` - Build Next.js app

## Questions?

If unsure about a change:
1. Test locally first
2. Create a draft PR
3. Let CI run
4. Review CI output
5. Fix issues before requesting review
