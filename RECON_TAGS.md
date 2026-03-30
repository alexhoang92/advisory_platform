# RECON_TAGS.md — Hamilton Platform Tag Feature Reconnaissance

> Generated: 2026-03-30
> Purpose: Pre-implementation audit covering all five areas required before beginning Phase 1–4 of the ticker/tag feature work.

---

## 1. Post Model & Existing Tags

### Current state
- **File:** `apps/api/prisma/schema.prisma` line 119
- **Field:** `tickers String[]` — native PostgreSQL `text[]` array on the `Post` model
- **No separate tags table:** The existing `Ticker` model (line 235) stores reference data (`symbol`, `name`, `sector`, `last_price`, `change_pct`, `synced_at`) but is **not linked to posts** — there is no FK relation between `Post.tickers` and `Ticker.symbol`
- **Normalization:** `tickers` are uppercased on create/update in `posts.service.ts` (lines 48, 144)

### Post model summary
```prisma
model Post {
  id           String         @id @default(cuid())
  tickers      String[]                          // ← raw string array, no FK
  ...
}

model Ticker {
  symbol     String   @id                        // ← exists but not linked to Post
  name       String
  sector     String?
  last_price Decimal?
  change_pct Decimal?
  synced_at  DateTime
  @@map("tickers")
}
```

### Create DTO (`apps/api/src/posts/dto/create-post.dto.ts`)
Accepts `tickers?: string[]` validated with `@IsArray() @IsString({ each: true })`.

### Shared Zod schema (`packages/shared`)
```ts
tickers: z.array(z.string().toUpperCase()).default([])
```

### What Phase 1 must add
- New `asset_tags` table with richer metadata (market, asset_type, currency, exchange)
- A relation from `Post.tickers` → `asset_tags` (or keep the string array and add a separate join table `_PostAssetTags`)
- **Decision:** Keep `Post.tickers String[]` as-is for backward compat; add a separate `PostTagRelation` join table linking `post_id` → `asset_tag_id` for the structured relation in Phase 2+

---

## 2. Post Composer UI

### File
`apps/web/src/pages/CreatePostPage.tsx`

### Current ticker input behaviour
- Plain `<input type="text">` controlled component, `tickerInput` local state
- `Enter` or `,` key calls `addTicker()` which uppercases and deduplicates, then appends to a local `tickers: string[]` array
- Tickers displayed as `<TickerChip symbol={ticker} />` with an `×` remove button
- On submit: `{ ...data, tickers }` sent to `useCreatePost()` mutation (POST `/api/v1/posts`)
- **No autocomplete, no API lookup, no `$` prefix parsing**

### Submit payload shape
```ts
{
  title: string,
  body_public: string,
  body_locked?: string,
  visibility: 'public' | 'preview' | 'subscribers_only',
  post_type: 'discussion' | 'trade_call' | 'research' | 'update',
  unlock_price?: number,
  tickers: string[],   // ← plain uppercase strings, e.g. ["NVDA", "AAPL"]
}
```

### What Phase 2 must replace
- Replace the plain text input with a `MentionInput` component supporting `$TICKER` autocomplete
- Keep the same `tickers` array in the submit payload (backward compat) — Phase 2 also adds `ticker_tags: string[]` and `user_mentions: string[]` as structured arrays
- The `TickerChip` display component already exists and can be reused for mention tokens

---

## 3. File Upload Infrastructure

### Current state: NOT IMPLEMENTED
- `multer` — **not installed** (not in `apps/api/package.json`)
- `@aws-sdk/client-s3` — **not installed**
- `@aws-sdk/lib-storage` — **not installed**
- No upload endpoints in any controller
- No `uploads/` directory or static file serving configured
- `apps/api/src/main.ts` — no `useStaticAssets()` or `ServeStaticModule`

### Installed packages relevant to Phase 4
```json
"@nestjs/platform-express": "^10.3.9"   // ← express platform, multer is bundled with this
```
`@nestjs/platform-express` bundles `multer` types via `@types/multer` but the package itself (`multer`) still needs to be explicitly installed.

### What Phase 4 must add
1. Install: `multer`, `@types/multer`
2. NestJS `UploadModule` with `MulterModule.register({ dest: 'uploads/posts' })`
3. `POST /api/v1/uploads/image` endpoint returning `{ url, key }`
4. Static file serving: `app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' })`
5. `image_urls Json` column on `Post` via migration

---

## 4. API Module Structure

### Pattern (from `auth`, `posts`, `users` modules)
```
apps/api/src/
├── posts/
│   ├── posts.module.ts          @Module({ controllers, providers, exports })
│   ├── posts.controller.ts      @Controller('posts') with guards
│   ├── posts.service.ts         @Injectable() with PrismaService injection
│   └── dto/
│       ├── create-post.dto.ts   class-validator decorators
│       └── update-post.dto.ts   PartialType(CreatePostDto)
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── dto/
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
└── app.module.ts                imports all feature modules
```

### Module registration pattern
New modules must be added to `apps/api/src/app.module.ts` imports array. Example:
```ts
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PostsModule,
    UsersModule,
    TagsModule,    // ← add new modules here
  ],
})
export class AppModule {}
```

### Guard pattern
- `JwtAuthGuard` — require authentication (from `auth/jwt-auth.guard.ts`)
- `OptionalJwtGuard` — defined inline in `posts.controller.ts`, passes through without token
- New modules should import and reuse these same guards

### DTO validation pattern
```ts
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export class CreateTagSearchDto {
  @IsString()
  q: string;

  @IsOptional()
  @IsEnum(['us_stock', 'crypto', 'id_stock', 'vn_stock'])
  market?: string;
}
```

### PrismaService
Located at `apps/api/src/prisma/prisma.service.ts`. Injected via `PrismaModule` which is globally available (or imported per module).

---

## 5. Frontend Routing & Feed Components

### Router
React Router v6 (`BrowserRouter`) in `apps/web/src/App.tsx`

### Current routes
```
/                  → LandingPage     (public)
/login             → LoginPage       (public)
/register          → RegisterPage    (public)
/posts/:id         → PostDetailPage  (public, visibility enforced server-side)
/profile/:username → ProfilePage     (public)
/feed              → FeedPage        (ProtectedRoute)
/profile/me/edit   → EditProfilePage (ProtectedRoute)
/posts/new         → CreatePostPage  (ProtectedRoute)
```

### New routes needed
- `/tag/:ticker` → `TagExplorePage` (public, Phase 3)

### Feed component
**File:** `apps/web/src/pages/FeedPage.tsx`
- Uses `useInfinitePosts()` hook (TanStack Query `useInfiniteQuery`)
- Renders `<PostCard post={post} />` for each item
- Cursor-based pagination via `?cursor=<id>&limit=20`

### PostCard component
**File:** `apps/web/src/components/posts/PostCard.tsx`
- Renders `post.tickers.map(ticker => <TickerChip key={ticker} symbol={ticker} />)` (line 139–143)
- `TickerChip` is a **non-clickable** display component — Phase 3 will make it linkable to `/tag/:ticker`

### TickerChip component
**File:** `apps/web/src/components/posts/TickerChip.tsx`
- Props: `{ symbol: string, changePct?: number }`
- Renders uppercase monospace ticker pill with optional price change %
- Must be extended (or wrapped) in Phase 3 to support `href` / click navigation

### Data fetching pattern
```ts
// hooks/usePosts.ts
export function useInfinitePosts() {
  return useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam }) => api.get(`/posts?cursor=${pageParam}&limit=20`),
    getNextPageParam: (last) => last.meta.cursor,
  });
}
```

New hooks for `/tags/search` and `/posts?ticker=X` should follow this same pattern in the hooks directory.

### API client
**File:** `apps/web/src/lib/api.ts`
- Wraps `fetch` with JWT injection from Zustand auth store
- Throws `ApiError` on non-2xx responses
- All new tag/ticker API calls should use this same client

---

## Summary Table

| Area | Status | Key File(s) |
|---|---|---|
| Post.tickers field | `String[]` array, no FK | `prisma/schema.prisma:119` |
| Ticker reference model | Exists, not linked to Post | `prisma/schema.prisma:235` |
| Post composer ticker input | Plain text input, no autocomplete | `pages/CreatePostPage.tsx:217–252` |
| Submit payload tickers | `string[]` of uppercase symbols | `pages/CreatePostPage.tsx:79` |
| File upload (multer/S3) | **Not implemented** | N/A |
| NestJS module pattern | module / controller / service / dto | `src/posts/` |
| React Router | v6, BrowserRouter | `App.tsx` |
| PostCard ticker rendering | Non-clickable TickerChip pills | `PostCard.tsx:137–143` |
| TickerChip component | Display only, no navigation | `components/posts/TickerChip.tsx` |
| API client | Custom fetch wrapper | `lib/api.ts` |
| Auth guards | JwtAuthGuard + OptionalJwtGuard | `auth/jwt-auth.guard.ts` |

---

## Phase-by-Phase Checklist

### Phase 1 — Ticker Seed Data + Tag Entity
- [ ] Prisma migration: add `asset_tags` table
- [ ] Seed script: `scripts/seed-tickers.ts` (or `.py`) — yfinance for US/crypto/IDX/VN
- [ ] NestJS `TagsModule` with `GET /tags/search` and `GET /tags/:ticker`
- [ ] Indexes on `ticker` and `name` columns

### Phase 2 — Mention-based Composer
- [ ] `MentionInput` component with `$` → ticker autocomplete, `@` → user autocomplete
- [ ] On submit: send `ticker_tags: string[]` and `user_mentions: string[]` alongside existing `tickers`
- [ ] Backend: update post create/update to persist `ticker_tags` as FK relation to `asset_tags`
- [ ] Backend: post read returns resolved tag objects

### Phase 3 — Tag Explore Page
- [ ] Make `TickerChip` clickable → `/tag/:ticker`
- [ ] New route `/tag/:ticker` → `TagExplorePage`
- [ ] `GET /tags/:ticker` for page header metadata
- [ ] `GET /posts?ticker=TICKER` filter on post list endpoint

### Phase 4 — Image Upload
- [ ] Install `multer` + `@types/multer`
- [ ] `UploadModule` with `POST /uploads/image`
- [ ] Static file serving for `uploads/` directory
- [ ] `image_urls Json` migration on `Post`
- [ ] Composer: file picker + paste + drag-drop upload with inline preview
- [ ] PostCard: image grid display (max 4, "+N more")
