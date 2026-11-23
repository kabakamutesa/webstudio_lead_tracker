# KWS Lead Tracker (database version)

Tracker (public/index.html) -> API (api/app.js on Vercel) -> Neon Postgres.
Password login. Deleted leads are soft-deleted (kept in the database, hidden in the app).

## Setup (about 20 minutes)

1. **Neon**: open your project -> SQL Editor -> paste all of `schema.sql` -> Run.
   Then Connect -> copy two connection strings: the pooled one (for the app) and the DIRECT one, with no "-pooler" in the host (for backups).
2. **GitHub**: create a PRIVATE repo, upload everything in this folder (including the hidden `.github` folder).
3. **Vercel**: Add New Project -> import the repo -> framework "Other" -> before deploying add Environment Variables:
   - `DATABASE_URL` = the pooled Neon string
   - `APP_PASSWORD` = the password you will sign in with (long, not reused anywhere)
   - `SESSION_SECRET` = any long random string (40+ characters)
   Deploy, open the URL, sign in.
4. **Move your leads**: in your OLD browser tracker click Export backup, then in the new site click Import and choose that .json. Check the counts match.
5. **Backups**: GitHub repo -> Settings -> Secrets and variables -> Actions -> New secret `NEON_DIRECT_URL` = the DIRECT string.
   Actions tab -> nightly-backup -> Run workflow. When it is green, open the run and download the `leads-backup-...` artifact (kept 90 days; runs nightly after that).
6. **Test a restore once**: create a new Neon branch or project, then run
   `pg_restore --no-owner -d "<new connection string>" backup.dump` and confirm the leads are there.

## Rules to keep your data safe
- Never paste the connection strings into the page or the chat. They live only in Vercel and GitHub secrets.
- Keep the old browser file and its JSON backup until step 6 passes.
- If the app shows "NOT SAVED", do not close the tab: fix your connection and make any change to retry.
