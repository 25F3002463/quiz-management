const $ = id => document.getElementById(id);
const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => +(+n).toFixed(2);
const sl = q => q.scope === 'syllabus' ? 'Full syllabus' : q.scope === 'chapter' ? 'Chapter: ' + q.chapter : 'Topic: ' + q.chapter + ' › ' + q.topic;

async function api(url, o = {}) {
  const r = await fetch(url, { method: o.method || 'GET', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}
// Redirects to the login page if signed out, or to the right dashboard if the role is wrong.
async function guard(role) {
  try {
    const me = await api('/api/me');
    if (me.role !== role) { location.href = me.role === 'teacher' ? '/teacher.html' : '/student.html'; return null; }
    $('who').textContent = me.name; return me;
  } catch { location.href = '/'; return null; }
}
async function logout() { await api('/api/logout', { method: 'POST' }); location.href = '/'; }

// Shared marks/answers view. T=true shows the teacher's evaluation inputs.
function reviewHTML(d, T) {
  let h = `<button class="link" data-act="back">← Back</button><div class="top"><div><h2>${E(d.title)}</h2>
  <p class="mu">${T ? E(d.student) + ', ' : ''}${E(sl(d))}, ${new Date(d.submitted_at).toLocaleDateString()}</p></div>
  <div class="pen">${fmt(d.score)}<small>/${d.total}</small></div></div>
  <p class="mu">${d.status === 'graded' ? Math.round(d.score / d.total * 100) + '% overall' : 'Written answers are awaiting review. This score covers multiple choice so far.'}</p>`;
  d.questions.forEach((x, i) => {
    const a = d.answers[i];
    h += `<div class="card"><p><b>${i + 1}.</b> ${E(x.text)}</p>`;
    if (x.type === 'mcq') {
      const ok = a === x.answer;
      h += `<p>Answer: <b class="${ok ? 'ok' : 'bad'}">${a == null ? 'Not answered' : E(x.options[a])} ${ok ? '✓' : '✗'}</b></p>${ok ? '' : `<p class="mu">Correct: ${E(x.options[x.answer])}</p>`}<p class="mu">${ok ? x.marks : 0}/${x.marks} marks</p>`;
    } else {
      h += `<div class="ans">${a ? E(a) : '<i>Not answered</i>'}</div>` + (T
        ? `<label>Marks out of ${x.marks} <input type="number" id="gm${i}" min="0" max="${x.marks}" step="0.5" value="${E(d.manual[i] ?? '')}"></label>`
        : `<p class="mu">${d.manual[i] != null ? d.manual[i] + '/' + x.marks + ' marks' : 'Awaiting review'}</p>`);
    }
    h += '</div>';
  });
  if (T) h += `<label>Feedback for the student<textarea id="gf" rows="3">${E(d.feedback)}</textarea></label><p><button class="btn" data-act="grade">Save marks</button></p>`;
  else if (d.feedback) h += `<div class="card"><b>Teacher feedback</b><div class="ans">${E(d.feedback)}</div></div>`;
  return h;
}

document.addEventListener('click', e => { if (e.target.id === 'out') logout(); });

// Account tab (both roles): change password; teachers also get the backup download.
function accountHTML(T) {
  return `<div class="card"><h2>Change password</h2><form id="pwf">
    <label for="pc">Current password</label><input id="pc" type="password" autocomplete="current-password" required>
    <label for="pn">New password (6 or more characters)</label><input id="pn" type="password" minlength="6" autocomplete="new-password" required>
    <p><button class="btn">Update password</button></p></form></div>` + (T ? `<div class="card"><h2>Backup</h2>
    <p class="mu">Download a copy of all accounts, quizzes and marks. Do this every week and keep the file somewhere safe.</p>
    <a class="btn2" href="/api/backup">Download backup</a></div>` : '');
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'pwf') return; e.preventDefault();
  try {
    await api('/api/password', { method: 'POST', body: { current: $('pc').value, password: $('pn').value } });
    e.target.reset(); $('msg').innerHTML = '<div class="msg" role="status">Password updated.</div>';
  } catch (x) { $('msg').innerHTML = `<div class="msg" role="alert">${E(x.message)}</div>`; }
});
