# Markbook: quiz app with student and teacher logins

Node.js + Express + SQLite. Students sign up and see every previous quiz record after login.
Teachers create chapter, topic and full-syllabus quizzes, evaluate written answers, reset
student passwords and download backups.

## Run on your own computer
```bash
npm install
npm start            # http://localhost:3000   (Node 20 or newer)
```
Default teacher login: `teacher@school.com` / `teacher123` (local use only).

## Put it online (Render)
Render is used here because a paid web service can keep a persistent disk, which is where the
database file lives. Free hosting tiers erase the disk on every restart, so do not use them.
Check render.com/pricing for current prices (a small paid web service plus a 1 GB disk).

1. **Clean the folder.** Delete `node_modules` and any `markbook.db*` files, so test accounts are not uploaded.
2. **Create a GitHub repository** (private is fine) and upload all the files, including `render.yaml`.
3. On Render: **New, then Blueprint**, connect the repository, and Render reads `render.yaml`.
4. When asked, enter `TEACHER_EMAIL` and `TEACHER_PASSWORD` (a strong password). `JWT_SECRET` is generated for you.
5. Click **Apply**. When the deploy finishes, open the `onrender.com` address Render shows. It uses HTTPS automatically.
6. Log in as the teacher and change nothing else; give students the address.

Things to know:
- The app refuses to start in production without a strong `JWT_SECRET` and a non-default `TEACHER_PASSWORD`.
- Only one instance can use the disk, and each deploy causes a short downtime. This is fine for a class.
- Render snapshots the disk daily, but also use **Account, then Download backup** every week and keep the file.
- `TEACHER_PASSWORD` is only used the first time. Change the password later under Account.
- To add more teachers, set a `TEACHER_CODE` environment variable and share the code; they then use Teacher, Sign up.
- Forgotten student password: teacher dashboard, Students, Reset password.

## Environment variables
`PORT`, `NODE_ENV=production`, `DB_FILE` (database path, use the disk path online), `JWT_SECRET`,
`TEACHER_EMAIL`, `TEACHER_PASSWORD`, `TEACHER_CODE` (optional).

## Files
`server.js` (API, auth, limits), `db.js` (tables), `render.yaml`, and `public/` (pages and scripts).
