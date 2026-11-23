const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const os = require('os');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
// In production, refuse to start with weak or missing secrets.
const prod = process.env.NODE_ENV === 'production';
if (prod) {
  const missing = [];
  if ((process.env.JWT_SECRET || '').length < 32) missing.push('JWT_SECRET (at least 32 characters)');
  if (!process.env.TEACHER_PASSWORD || process.env.TEACHER_PASSWORD === 'teacher123') missing.push('TEACHER_PASSWORD (not the default)');
  if (missing.length) { console.error('Refusing to start. Set these environment variables: ' + missing.join(', ')); process.exit(1); }
}
const db = require('./db');

// Set JWT_SECRET in production, otherwise everyone is logged out on restart.
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const app = express();
app.set('trust proxy', 1);   // the host's HTTPS proxy sits in front of the app
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"],
  upgradeInsecureRequests: prod ? [] : null } } }));
app.use(express.json({ limit: '1mb' }), cookieParser());

// Rate limits: only FAILED logins count, so a class sharing one network is not locked out by good logins.
const limiter = (limit, windowMs, error, skipSuccessfulRequests) =>
  rateLimit({ windowMs, limit, skipSuccessfulRequests, standardHeaders: true, legacyHeaders: false, message: { error } });
app.use('/api/login', limiter(20, 15 * 60 * 1000, 'Too many failed logins. Try again in 15 minutes.', true));
app.use('/api/signup', limiter(20, 60 * 60 * 1000, 'Too many sign-ups from this network. Try again later.', false));
app.get('/healthz', (req, res) => { db.prepare('SELECT 1').get(); res.send('ok'); });

const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const setCookie = (res, u) => res.cookie('token', jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }),
  { httpOnly: true, sameSite: 'lax', maxAge: 6048e5, secure: process.env.NODE_ENV === 'production' });

// auth() = any logged-in user, auth('teacher') / auth('student') = that role only
const auth = role => (req, res, next) => {
  try {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(jwt.verify(req.cookies.token, SECRET).id);
    if (!u) throw new Error();
    if (role && u.role !== role) return res.status(403).json({ error: 'Not allowed for your account type.' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please log in.' }); }
};

/* ---------- accounts ---------- */
app.post('/api/signup', (req, res) => {
  const { name, password, role = 'student', code } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (!String(name || '').trim() || !/^\S+@\S+\.\S+$/.test(email) || String(password || '').length < 6)
    return res.status(400).json({ error: 'Enter your name, a valid email and a password of 6 or more characters.' });
  if (role === 'teacher' && (!process.env.TEACHER_CODE || code !== process.env.TEACHER_CODE))
    return res.status(403).json({ error: 'Invalid teacher invite code.' });
  try {
    const r = db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(name.trim(), email, bcrypt.hashSync(password, 10), role, Date.now());
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    setCookie(res, u); res.json(pub(u));
  } catch { res.status(409).json({ error: 'An account with this email already exists.' }); }
});

app.post('/api/login', (req, res) => {
  const { password, role } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  if (role && u.role !== role)
    return res.status(403).json({ error: `This is a ${u.role} account. Use the ${u.role} tab.` });
  setCookie(res, u); res.json(pub(u));
});

app.post('/api/logout', (req, res) => res.clearCookie('token').json({ ok: 1 }));
app.get('/api/me', auth(), (req, res) => res.json(pub(req.user)));

/* ---------- quizzes ---------- */
const Q = r => ({ id: r.id, title: r.title, subject: r.subject, scope: r.scope, chapter: r.chapter,
  topic: r.topic, questions: JSON.parse(r.questions), created_at: r.created_at, n: r.n });
const hideAnswers = q => ({ ...q, questions: q.questions.map(({ answer, ...x }) => x) });

app.get('/api/quizzes', auth(), (req, res) => {
  const rows = db.prepare(`SELECT q.*, (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id=q.id) n
    FROM quizzes q ORDER BY q.created_at DESC`).all().map(Q);
  const done = new Set(db.prepare('SELECT quiz_id FROM attempts WHERE student_id=?').all(req.user.id).map(r => r.quiz_id));
  res.json(rows.map(q => ({ ...(req.user.role === 'teacher' ? q : hideAnswers(q)), attempted: done.has(q.id) })));
});

app.post('/api/quizzes', auth('teacher'), (req, res) => {
  const { title, subject, scope, chapter = '', topic = '', questions } = req.body;
  const ok = title?.trim() && subject?.trim() && ['syllabus', 'chapter', 'topic'].includes(scope)
    && (scope === 'syllabus' || chapter.trim()) && (scope !== 'topic' || topic.trim())
    && Array.isArray(questions) && questions.length
    && questions.every(q => q.text?.trim() && +q.marks > 0 && (q.type === 'short' ||
      (q.type === 'mcq' && Array.isArray(q.options) && q.options.length >= 2 && q.options[q.answer]?.trim())));
  if (!ok) return res.status(400).json({ error: 'Complete the quiz details and every question.' });
  const qs = questions.map(q => q.type === 'mcq'
    ? { type: 'mcq', text: q.text.trim(), options: q.options.map(String), answer: +q.answer, marks: +q.marks }
    : { type: 'short', text: q.text.trim(), marks: +q.marks });
  const r = db.prepare(`INSERT INTO quizzes(title,subject,scope,chapter,topic,questions,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(title.trim(), subject.trim(), scope, scope === 'syllabus' ? '' : chapter.trim(),
    scope === 'topic' ? topic.trim() : '', JSON.stringify(qs), req.user.id, Date.now());
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/quizzes/:id', auth('teacher'), (req, res) => {
  db.prepare('DELETE FROM quizzes WHERE id=?').run(req.params.id); res.json({ ok: 1 });
});

/* ---------- attempts (a student's saved records) ---------- */
app.post('/api/quizzes/:id/attempt', auth('student'), (req, res) => {
  const q = db.prepare('SELECT * FROM quizzes WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  const qs = JSON.parse(q.questions), given = req.body.answers || {}, answers = {};
  let auto = 0, total = 0;
  qs.forEach((x, i) => {
    total += x.marks;
    if (x.type === 'mcq') {
      answers[i] = given[i] == null ? null : Number(given[i]);
      if (answers[i] === x.answer) auto += x.marks;
    } else answers[i] = String(given[i] || '').slice(0, 5000);
  });
  try {
    const r = db.prepare(`INSERT INTO attempts(quiz_id,student_id,answers,auto_score,total,status,submitted_at)
      VALUES(?,?,?,?,?,?,?)`).run(q.id, req.user.id, JSON.stringify(answers), auto, total,
      qs.some(x => x.type === 'short') ? 'pending' : 'graded', Date.now());
    res.json({ id: r.lastInsertRowid });
  } catch { res.status(409).json({ error: 'You have already submitted this quiz.' }); }
});

const SEL = `SELECT a.*, q.title, q.subject, q.scope, q.chapter, q.topic, q.questions, u.name student
  FROM attempts a JOIN quizzes q ON q.id=a.quiz_id JOIN users u ON u.id=a.student_id`;
const A = r => ({ id: r.id, quiz_id: r.quiz_id, title: r.title, subject: r.subject, scope: r.scope,
  chapter: r.chapter, topic: r.topic, student: r.student, total: r.total, status: r.status,
  submitted_at: r.submitted_at,
  score: r.auto_score + Object.values(JSON.parse(r.manual)).reduce((s, v) => s + (+v || 0), 0) });

// Students get only their own history; teachers get everyone's (pending first).
app.get('/api/attempts', auth(), (req, res) => {
  const rows = req.user.role === 'teacher'
    ? db.prepare(SEL + " ORDER BY (a.status='pending') DESC, a.submitted_at DESC").all()
    : db.prepare(SEL + ' WHERE a.student_id=? ORDER BY a.submitted_at DESC').all(req.user.id);
  res.json(rows.map(A));
});

app.get('/api/attempts/:id', auth(), (req, res) => {
  const r = db.prepare(SEL + ' WHERE a.id=?').get(req.params.id);
  if (!r || (req.user.role !== 'teacher' && r.student_id !== req.user.id))
    return res.status(404).json({ error: 'Record not found.' });
  res.json({ ...A(r), questions: JSON.parse(r.questions), answers: JSON.parse(r.answers),
    manual: JSON.parse(r.manual), feedback: r.feedback });
});

app.put('/api/attempts/:id/grade', auth('teacher'), (req, res) => {
  const r = db.prepare(SEL + ' WHERE a.id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Record not found.' });
  const given = req.body.manual || {}, manual = {};
  JSON.parse(r.questions).forEach((x, i) => {
    if (x.type === 'short') { const v = parseFloat(given[i]); manual[i] = isNaN(v) ? 0 : Math.max(0, Math.min(x.marks, v)); }
  });
  db.prepare("UPDATE attempts SET manual=?, feedback=?, status='graded' WHERE id=?")
    .run(JSON.stringify(manual), String(req.body.feedback || '').slice(0, 2000), r.id);
  res.json({ ok: 1 });
});

/* ---------- passwords, students, backup ---------- */
const validPw = p => typeof p === 'string' && p.length >= 6 && p.length <= 100;

app.post('/api/password', auth(), (req, res) => {
  if (!bcrypt.compareSync(String(req.body.current || ''), req.user.password_hash))
    return res.status(403).json({ error: 'Current password is incorrect.' });
  if (!validPw(req.body.password)) return res.status(400).json({ error: 'New password must be 6 or more characters.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.password, 10), req.user.id);
  res.json({ ok: 1 });
});

app.get('/api/students', auth('teacher'), (req, res) => res.json(db.prepare(
  `SELECT u.id, u.name, u.email, u.created_at, (SELECT COUNT(*) FROM attempts a WHERE a.student_id=u.id) attempts
   FROM users u WHERE u.role='student' ORDER BY u.name`).all()));

// Teacher sets a new password for a student who forgot theirs.
app.post('/api/students/:id/password', auth('teacher'), (req, res) => {
  if (!validPw(req.body.password)) return res.status(400).json({ error: 'Password must be 6 or more characters.' });
  const r = db.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='student'")
    .run(bcrypt.hashSync(req.body.password, 10), req.params.id);
  r.changes ? res.json({ ok: 1 }) : res.status(404).json({ error: 'Student not found.' });
});

// Downloads a consistent copy of the whole database.
app.get('/api/backup', auth('teacher'), async (req, res) => {
  const f = path.join(os.tmpdir(), `markbook-${Date.now()}.db`);
  try {
    await db.backup(f);
    res.download(f, `markbook-backup-${new Date().toISOString().slice(0, 10)}.db`, () => fs.unlink(f, () => {}));
  } catch { res.status(500).json({ error: 'Backup failed.' }); }
});

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Markbook running at http://localhost:${PORT}`));
// Close the database cleanly when the host restarts or redeploys the app.
process.on('SIGTERM', () => server.close(() => { db.close(); process.exit(0); }));
