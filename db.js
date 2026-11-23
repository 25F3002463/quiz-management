const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const file = process.env.DB_FILE || 'markbook.db';
require('fs').mkdirSync(require('path').dirname(file), { recursive: true });
const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('student','teacher')),
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quizzes(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN('syllabus','chapter','topic')),
  chapter TEXT DEFAULT '', topic TEXT DEFAULT '', questions TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  answers TEXT NOT NULL, auto_score REAL NOT NULL, manual TEXT NOT NULL DEFAULT '{}',
  feedback TEXT DEFAULT '', total REAL NOT NULL, status TEXT NOT NULL,
  submitted_at INTEGER NOT NULL, UNIQUE(quiz_id, student_id));
`);

// First run: create a teacher account (change these with env vars).
const email = (process.env.TEACHER_EMAIL || 'teacher@school.com').toLowerCase();
if (!db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) {
  db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run('Teacher', email, bcrypt.hashSync(process.env.TEACHER_PASSWORD || 'teacher123', 10), 'teacher', Date.now());
}
module.exports = db;
