# Switching on Vamos online (accounts, ranked, 1v1 lobby)

Vamos uses a free [Supabase](https://supabase.com) project for accounts, the ranked leaderboard and the 1v1 lobby. Until it's set up, the game works exactly as before and the account bar says online play isn't switched on yet.

Supabase changes its dashboard now and then, so menu names below may differ slightly (written 6 Oct 2026).

## One-time setup
1. Go to supabase.com, sign in, and create a **New project** on the free plan. Name it `vamos`. Save the database password in your password manager; the game doesn't need it.
2. Open **SQL Editor → New query**, paste the whole of `supabase/setup.sql`, and press **Run**. It should finish without errors. Running it again later is safe.
3. Open **Authentication → URL Configuration**. Set **Site URL** to `https://batancr.github.io/Vamos/` and add `https://batancr.github.io/Vamos/**` under **Redirect URLs**. Confirmation and password-reset emails link back here.
4. Under **Authentication → Sign In / Providers → Email**, keep email sign-in on and **Confirm email** on. Optionally set the minimum password length to 8, to match the sign-up form.
5. Open **Project Settings → API Keys** (older dashboards: **Settings → API**). Copy the **Project URL** and the **publishable** key (older name: "anon public").
6. Put both in `docs/online.js`, in `ONLINE_CONFIG` at the top, then push.

**Never put the secret or service_role key in the site or in a chat.** The publishable key is safe to publish, because the rules in `setup.sql` decide what each player may read and write.

## What the database holds
- `profiles`: username, stats and badges (progress), chosen character. No email: Supabase keeps that in its own private auth table.
- `runs`: one ranked score per player per daily trip. Routes are stored but hidden from other players.
- `matches`: 1v1 games. Routes are hidden until both players finish.
- `leaderboard`: a view adding up ranked points.

## Limits to know about (check them on Supabase's pricing page)
- Free projects are paused after a stretch without activity (about a week, last I knew); you restore them from the dashboard.
- Supabase's built-in email sender only sends a few emails an hour. If lots of people sign up at once, add your own email provider under Authentication → SMTP.
- Scores are worked out in the player's browser, and the database only checks they're sensible. A determined cheater could fake a time. The fix is a server check (a Supabase Edge Function running `phys.js`), which is an open item.
