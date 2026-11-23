const S = { tab: 'subs', quizzes: [], attempts: [], sf: 'all', draft: null, detail: null, msg: '' };
const mcq = () => ({ type: 'mcq', text: '', options: ['', '', '', ''], answer: 0, marks: 1 });
const short = () => ({ type: 'short', text: '', marks: 5 });
const tabs = [['subs', 'Submissions'], ['quizzes', 'Quizzes'], ['new', 'New quiz'], ['students', 'Students'], ['account', 'Account']];
(async () => { if (await guard('teacher')) { await load(); render(); } })();
async function load() { [S.quizzes, S.attempts, S.students] = await Promise.all([api('/api/quizzes'), api('/api/attempts'), api('/api/students')]); }

function render() {
  $('nav').innerHTML = tabs.map(([v, l]) => `<button class="tab ${S.tab === v && !S.detail ? 'on' : ''}" data-act="tab" data-v="${v}">${l}</button>`).join('');
  $('msg').innerHTML = S.msg ? `<div class="msg" role="status">${E(S.msg)}</div>` : '';
  $('view').innerHTML = S.detail ? reviewHTML(S.detail, true) : S.tab === 'new' ? builder() : S.tab === 'quizzes' ? quizzes() : S.tab === 'students' ? students() : S.tab === 'account' ? accountHTML(true) : subs();
}

function subs() {
  const rows = S.attempts.filter(a => S.sf === 'all' || a.status === S.sf);
  let h = `<div class="stats"><div><b>${S.quizzes.length}</b><span>quizzes</span></div><div><b>${S.attempts.length}</b><span>submissions</span></div><div><b>${S.attempts.filter(a => a.status === 'pending').length}</b><span>need review</span></div></div>` +
    [['all', 'All'], ['pending', 'Needs review'], ['graded', 'Marked']].map(([v, l]) => `<button class="chip ${S.sf === v ? 'on' : ''}" data-act="sf" data-v="${v}">${l}</button>`).join(' ');
  if (!rows.length) return h + '<p class="mu">No submissions yet.</p>';
  return h + `<div class="scroll"><table><tr><th>Student</th><th>Quiz</th><th>Score</th><th>Status</th><th></th></tr>${rows.map(a => `<tr><td>${E(a.student)}</td><td>${E(a.title)}<br><span class="mu">${E(sl(a))}</span></td><td>${fmt(a.score)}/${a.total} (${Math.round(a.score / a.total * 100)}%)</td><td class="st ${a.status === 'graded' ? 'g' : 'p'}">${a.status === 'graded' ? 'Marked' : 'Needs review'}</td><td><button class="btn2" data-act="open" data-id="${a.id}">${a.status === 'graded' ? 'Open' : 'Evaluate'}</button></td></tr>`).join('')}</table></div>`;
}

function quizzes() {
  if (!S.quizzes.length) return '<p class="mu">No quizzes yet. Create one in New quiz.</p>';
  return S.quizzes.map(q => `<div class="card row"><div><b>${E(q.title)}</b><br><span class="tag">${E(sl(q))}</span> <span class="mu">${E(q.subject)}, ${q.questions.length} questions, ${q.n} attempt${q.n == 1 ? '' : 's'}</span></div><button class="btn2" data-act="del" data-id="${q.id}">Delete</button></div>`).join('');
}

function students() {
  if (!S.students.length) return '<p class="mu">No students have signed up yet.</p>';
  return `<p class="mu">If a student forgets their password, set a new one here and tell them. They can change it under Account.</p><div class="scroll"><table><tr><th>Name</th><th>Email</th><th>Joined</th><th>Quizzes taken</th><th></th></tr>${S.students.map(s => `<tr><td>${E(s.name)}</td><td>${E(s.email)}</td><td>${new Date(s.created_at).toLocaleDateString()}</td><td>${s.attempts}</td><td><button class="btn2" data-act="reset" data-id="${s.id}" data-name="${E(s.name)}">Reset password</button></td></tr>`).join('')}</table></div>`;
}

function builder() {
  const d = S.draft || (S.draft = { title: '', subject: '', scope: 'chapter', chapter: '', topic: '', questions: [mcq()] });
  let h = `<div class="card"><label for="t_title">Quiz title</label><input id="t_title" value="${E(d.title)}">
  <div class="grid"><div><label for="t_subject">Subject</label><input id="t_subject" value="${E(d.subject)}" placeholder="e.g. Physics"></div>
  <div><label for="t_scope">Covers</label><select id="t_scope" class="full"><option value="syllabus" ${d.scope === 'syllabus' ? 'selected' : ''}>Full syllabus</option><option value="chapter" ${d.scope === 'chapter' ? 'selected' : ''}>One chapter</option><option value="topic" ${d.scope === 'topic' ? 'selected' : ''}>One topic in a chapter</option></select></div>
  ${d.scope !== 'syllabus' ? `<div><label for="t_chapter">Chapter</label><input id="t_chapter" value="${E(d.chapter)}" placeholder="e.g. Chapter 3: Motion"></div>` : ''}
  ${d.scope === 'topic' ? `<div><label for="t_topic">Topic</label><input id="t_topic" value="${E(d.topic)}" placeholder="e.g. Velocity"></div>` : ''}</div></div>`;
  d.questions.forEach((q, i) => {
    h += `<div class="card"><div class="row"><b>Question ${i + 1}: ${q.type === 'mcq' ? 'multiple choice' : 'written answer'}</b><button class="link" data-act="rmq" data-i="${i}">Remove</button></div>
    <label for="qt${i}">Question</label><textarea id="qt${i}" rows="2">${E(q.text)}</textarea>`;
    if (q.type === 'mcq') h += q.options.map((o, j) => `<div class="opt"><input type="radio" name="qa${i}" value="${j}" ${q.answer === j ? 'checked' : ''} aria-label="Correct answer"><input id="qo${i}_${j}" value="${E(o)}" placeholder="Option ${j + 1}"></div>`).join('') + '<p class="mu">Select the radio button beside the correct option. Leave unused options empty.</p>';
    h += `<label for="qm${i}">Marks</label><input type="number" id="qm${i}" min="0.5" step="0.5" value="${q.marks}"></div>`;
  });
  return h + `<div class="row"><div><button class="btn2" data-act="addm">Add multiple choice</button> <button class="btn2" data-act="adds">Add written answer</button></div><button class="btn" data-act="publish">Publish quiz</button></div>`;
}

// Copy what is typed in the builder into S.draft (called before any re-render).
function sync() {
  if (!$('t_title')) return;
  const d = S.draft;
  d.title = $('t_title').value; d.subject = $('t_subject').value; d.scope = $('t_scope').value;
  if ($('t_chapter')) d.chapter = $('t_chapter').value;
  if ($('t_topic')) d.topic = $('t_topic').value;
  d.questions.forEach((q, i) => {
    q.text = $('qt' + i).value; q.marks = $('qm' + i).value;
    if (q.type === 'mcq') {
      q.options = q.options.map((_, j) => $(`qo${i}_${j}`).value);
      const c = document.querySelector(`input[name=qa${i}]:checked`); q.answer = c ? +c.value : 0;
    }
  });
}

document.addEventListener('change', e => { if (e.target.id === 't_scope') { sync(); render(); } });
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset; S.msg = ''; sync();
  try {
    if (d.act === 'tab') { S.tab = d.v; S.detail = null; if (d.v !== 'new' && d.v !== 'account') await load(); }
    else if (d.act === 'back') S.detail = null;
    else if (d.act === 'sf') S.sf = d.v;
    else if (d.act === 'open') S.detail = await api('/api/attempts/' + d.id);
    else if (d.act === 'addm') S.draft.questions.push(mcq());
    else if (d.act === 'adds') S.draft.questions.push(short());
    else if (d.act === 'rmq') S.draft.questions.splice(+d.i, 1);
    else if (d.act === 'del') { if (confirm('Delete this quiz and all its submissions?')) { await api('/api/quizzes/' + d.id, { method: 'DELETE' }); await load(); } }
    else if (d.act === 'reset') {
      const p = prompt('New password for ' + d.name + ' (6 or more characters):');
      if (p) { await api(`/api/students/${d.id}/password`, { method: 'POST', body: { password: p } }); S.msg = 'Password reset for ' + d.name + '. Tell them the new password.'; }
    }
    else if (d.act === 'publish') {
      const dr = S.draft;
      const questions = dr.questions.map((q, i) => {
        if (q.type !== 'mcq') return q;
        const keep = q.options.map((o, j) => [o.trim(), j]).filter(x => x[0]);
        const a = keep.findIndex(x => x[1] === q.answer);
        if (a < 0) throw new Error(`Question ${i + 1}: the correct option is empty.`);
        return { ...q, options: keep.map(x => x[0]), answer: a };
      });
      await api('/api/quizzes', { method: 'POST', body: { ...dr, questions } });
      S.draft = null; await load(); S.tab = 'quizzes'; S.msg = 'Quiz published.';
    }
    else if (d.act === 'grade') {
      const manual = {};
      S.detail.questions.forEach((x, i) => { if (x.type === 'short') manual[i] = $('gm' + i).value; });
      await api(`/api/attempts/${S.detail.id}/grade`, { method: 'PUT', body: { manual, feedback: $('gf').value } });
      await load(); S.detail = null; S.msg = 'Marks saved.';
    }
  } catch (x) { S.msg = x.message; }
  render(); scrollTo(0, 0);
});
