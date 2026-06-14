# Supabase Auth And Cloud Scores

SheetLab uses Supabase as a client-side, RLS-protected cloud layer. Local project
save still works without signing in.

## Project

- URL: `https://zfqlevubgoedfzzgedok.supabase.co`
- Client key type: publishable key

The publishable key is safe to use in browser code when every user table has RLS
enabled and policies use `auth.uid()`.

## Database Setup

Run this migration in the Supabase SQL editor or through the Supabase CLI:

```txt
supabase/migrations/202606140001_auth_scores_practice.sql
```

It creates:

- `profiles`
- `scores`
- `practice_attempts`

It also enables RLS and adds owner-scoped policies for signed-in users.

## Optional Environment Override

The app has a built-in project fallback for quick testing. Production deploys can
override it with:

```txt
VITE_SUPABASE_URL=https://zfqlevubgoedfzzgedok.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_C84VQoIRT-X_rEE9wpMPAg_Gw2AmmhB
```

Never put a Supabase secret/service-role key in the frontend.
