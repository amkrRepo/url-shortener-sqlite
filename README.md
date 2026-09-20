# URL Shortener (NestJS + Prisma + SQLite)

A minimal URL shortener backend built with NestJS, Prisma ORM, and a
file-based SQLite database, with a full Jest + Supertest E2E test suite.

## Tech stack

- NestJS 10
- Prisma ORM 5 (SQLite provider)
- class-validator / class-transformer for DTO validation
- Jest + Supertest for E2E testing
- TypeScript (strict mode)

## Project structure

```
prisma/
  schema.prisma        # Url model, SQLite datasource
src/
  main.ts               # Bootstraps Nest, registers global ValidationPipe
  app.module.ts
  prisma/
    prisma.service.ts   # Injectable PrismaClient wrapper
    prisma.module.ts    # Global module exporting PrismaService
  urls/
    urls.module.ts
    urls.controller.ts  # POST /urls/shorten, GET /urls/redirect
    urls.service.ts     # short_code generation + Prisma access
    dto/
      urls.dto.ts        # CreateUrlDto with @IsUrl() validation
test/
  urls.e2e-spec.ts       # E2E test suite
  jest-e2e.json          # Jest config scoped to *.e2e-spec.ts
.env                     # DATABASE_URL for the dev DB (dev.db)
.env.test                # DATABASE_URL for the test DB (test.db)
```

## Setup (development)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Generate the Prisma client:

   ```bash
   npm run prisma:generate
   ```

3. Run migrations against the dev database (uses `DATABASE_URL` from `.env`,
   creating `prisma/dev.db`):

   ```bash
   npm run prisma:migrate:dev
   ```

4. Start the app:

   ```bash
   npm run start:dev
   ```

   The API is now available at `http://localhost:3000`.

## API

### `POST /urls/shorten`

Request body:

```json
{ "original_url": "https://example.com" }
```

- `201 Created` with the created record (`id`, `original_url`, `short_code`,
  `created_at`) when `original_url` is present and a syntactically valid URL.
- `400 Bad Request` when `original_url` is missing or not a valid URL
  (enforced by `@IsUrl()` on `CreateUrlDto` via the global `ValidationPipe`
  registered in `main.ts`).

### `GET /urls/redirect?short_code=xxxx`

- `302 Found` with a `Location` header set to the original URL, issued via
  `res.redirect()` using the raw Express `@Res()` response (not
  passthrough mode — see the comment in `urls.controller.ts` for why
  passthrough mode would prevent us from manually driving the status code
  and header).
- `404 Not Found` when no record matches `short_code`.

Unexpected/database errors are not caught or relabeled as 400/404 anywhere
in the request path — they propagate naturally and surface as `500`s.

## Running the E2E tests

The E2E suite uses its own SQLite database (`test.db`), completely separate
from the dev database, so tests never touch dev data.

1. Make sure `.env.test` exists and points at a dedicated test database
   (already included in this repo):

   ```
   DATABASE_URL="file:./test.db"
   ```

2. Run the E2E test script:

   ```bash
   npm run test:e2e
   ```

   This runs two things in sequence, via npm's `pretest:e2e` hook:

   - `dotenv -e .env.test -- prisma migrate deploy` — applies all committed
     migrations to the test database defined by `.env.test`, without
     generating new migrations or prompting interactively. This is the
     exact command used to prepare the schema before tests run.
   - `dotenv -e .env.test -- jest --config ./test/jest-e2e.json --runInBand`
     — runs the E2E spec(s) against that migrated test database.

   If you ever need to reset the test database from scratch instead of
   just applying migrations, you can run:

   ```bash
   dotenv -e .env.test -- prisma migrate reset --force
   ```

### Test isolation strategy

Each test in `test/urls.e2e-spec.ts` runs against the same live NestJS app
instance (created once in `beforeAll` / torn down in `afterAll`). Isolation
between tests is handled by an `afterEach` hook that calls
`prisma.url.deleteMany()`, wiping the `Url` table after every test so each
test starts from a clean, empty table. This was chosen over resetting the
SQLite file between runs because it's fast and avoids re-spawning the
Prisma client for every test.

### What each test verifies

| Test | Verifies |
|---|---|
| **Happy path** (`shortens a URL and then redirects...`) | `POST /urls/shorten` returns `201` with a generated `short_code`, and following that code via `GET /urls/redirect?short_code=...` returns a real `302` with a `Location` header equal to the original URL. |
| `returns 400 when original_url is missing` | The global `ValidationPipe` rejects a body with no `original_url` before it reaches the controller/service. |
| `returns 400 when original_url is not a syntactically valid URL` | `@IsUrl()` rejects a malformed value like `"not-a-url"`. |
| `returns 404 when redirecting with a short_code that does not exist` | The service throws `NotFoundException` when no `Url` row matches, and Nest's built-in exception filter turns that into a `404`. |
| `generates distinct short_codes for two shorten requests with the same original_url` | Shortening the same `original_url` twice produces two different `short_code` values, confirming there's no accidental caching/deduplication and that the uniqueness constraint on `short_code` is respected. |

## Notes on design choices

- **`short_code` generation**: a random 7-character alphanumeric string
  drawn from a 62-character alphabet via `crypto.randomBytes`. On the rare
  chance of a collision with an existing `short_code` (a Prisma `P2002`
  unique-constraint error), the service retries with a freshly generated
  code up to 5 times before giving up. Any other database error is
  re-thrown as-is and allowed to surface as a `500`.
- **Redirect implementation**: uses `@Res() res: Response` (Express) and
  calls `res.redirect(302, url.original_url)` directly, rather than
  `@Res({ passthrough: true })`. Passthrough mode returns control to
  Nest's own response-handling pipeline after the handler runs, which
  would prevent explicitly setting the redirect status code and `Location`
  header the way this spec requires (and the way Supertest's
  `.expect('Location', ...)` needs to assert against).
- **Validation**: `CreateUrlDto` is a class (not an interface/type) so that
  `class-validator`'s decorator metadata exists at runtime, which the
  global `ValidationPipe` (registered in `main.ts`) inspects on every
  incoming request.
