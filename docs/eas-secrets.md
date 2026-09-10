# EAS Environment Variables

CarbSnap's dish-photo recognition feature needs two environment variables baked into
the app at build time. They are **not** committed to git (see `.env.example` for local
development) and must be set as EAS environment variables before running a `preview` or
`production` build via `eas build`.

## Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_RECOGNITION_API_URL` | The deployed Cloudflare Worker's `/recognize` endpoint URL. |
| `EXPO_PUBLIC_RECOGNITION_API_SECRET` | The shared secret the Worker checks on every request (same value as the Worker's `APP_SHARED_SECRET`). |

Both variable names start with `EXPO_PUBLIC_`, which means Expo bakes their values into
the JavaScript bundle at build time — they are not server-side secrets, just a
deterrent header (see `docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md`
for why). Treat them as build inputs, not as something requiring extra secrecy beyond
"don't commit them to git."

## Getting the values

You need a deployed Cloudflare Worker first. Follow `worker/README.md` end to end —
it walks through setting the Worker's own secrets and deploying it, and ends with the
exact `EXPO_PUBLIC_RECOGNITION_API_URL` / `EXPO_PUBLIC_RECOGNITION_API_SECRET` values to
use here.

## Setting them in EAS

Run this once per variable, per build profile that needs it (`preview` and
`production`, both defined in `eas.json`):

```
eas env:create --environment preview --name EXPO_PUBLIC_RECOGNITION_API_URL --value "https://your-worker.your-subdomain.workers.dev/recognize" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_RECOGNITION_API_SECRET --value "<your APP_SHARED_SECRET value>" --visibility sensitive

eas env:create --environment production --name EXPO_PUBLIC_RECOGNITION_API_URL --value "https://your-worker.your-subdomain.workers.dev/recognize" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_RECOGNITION_API_SECRET --value "<your APP_SHARED_SECRET value>" --visibility sensitive
```

(Use `--visibility sensitive` for the secret so it's masked in build logs; the URL isn't
sensitive, so `plaintext` is fine for it.) You can also set these from the Expo dashboard
under your project's Environment Variables page instead of the CLI — same effect.

Once set, `eas build --profile preview --platform android` and
`eas build --profile production --platform android` will both have these values
available at build time.

## First-time EAS setup

This repo has no `extra.eas.projectId` in `app.json` yet — that gets written
automatically the first time you run `eas init` (or your first `eas build`) from your
own Expo account. Signing uses an EAS-managed keystore by default; you'll be walked
through creating it interactively on your first production build.
