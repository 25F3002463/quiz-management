const S = { tab: 'home', quizzes: [], attempts: [], filter: 'all', take: null, detail: null, msg: '' };
const tabs = [['home', 'Dashboard'], ['quizzes', 'Quizzes'], ['account', 'Account']];
(async () => { if (await guard('student')) { await load(); render(); } })();
async function load() { [S.quizzes, S.attempts] = await Promise.all([api('/api/quizzes'), api('/api/attempts')]); }

function render() {
  $('nav').innerHTML = tabs.map(([v, l]) => `<button class="tab ${S.tab === v && !S.take && !S.detail ? 'on' : ''}" data-act="tab" data-v="${v}">${l}</button>`).join('');
  $('msg').innerHTML = S.msg ? `<div class="msg" role="status">${E(S.msg)}</div>` : '';
  $('view').innerHTML = S.take ? takeView() : S.detail ? reviewHTML(S.detail, false) : S.tab === 'account' ? accountHTML(false) : S.tab === 'home' ? home() : list();
}

function home() {
  const g = S.attempts.filter(a => a.status === 'graded');
  const avg = g.length ? Math.round(g.reduce((s, a) => s + a.score / a.total * 100, 0) / g.length) : null;
  const h = `<div class="stats"><div><b>${S.attempts.length}</b><span>quizzes taken</span></div><div><b>${avg === null ? '-' : avg + '%'}</b><span>average mark</span></div><div><b>${S.attempts.length - g.length}</b><span>awaiting review</span></div></div><h2>Your previous records</h2>`;
  if (!S.attempts.length) return h + '<p class="mu">Nothing here yet. Take a quiz and your marks will be saved here for every future login.</p>';
  return h + S.attempts.map(a => `<div class="card row"><div><b>${E(a.title)}</b><br><span class="tag">${E(sl(a))}</span> <span class="mu">${E(a.subject)}, ${new Date(a.submitted_at).toLocaleDateString()}</span><br><span class="st ${a.status === 'graded' ? 'g' : 'p'}">${a.status === 'graded' ? 'Marked' : 'Awaiting review'}</span></div><div class="row"><div class="pen s">${fmt(a.score)}<small>/${a.total}</small></div><button class="btn2" data-act="detail" data-id="${a.id}">Details</button></div></div>`).join('');
}

function list() {
  const qs = S.quizzes.filter(q => S.filter === 'all' || q.scope === S.filter), order = { syllabus: 0, chapter: 1, topic: 2 };
  let h = [['all', 'All'], ['syllabus', 'Full syllabus'], ['chapter', 'Chapter-wise'], ['topic', 'Topic-wise']]
    .map(([v, l]) => `<button class="chip ${S.filter === v ? 'on' : ''}" data-act="filter" data-v="${v}">${l}</button>`).join(' ');
  if (!qs.length) return h + '<p class="mu">No quizzes here yet.</p>';
  [...new Set(qs.map(q => q.subject))].forEach(sub => {
    h += `<h3>${E(sub)}</h3>`;
    qs.filter(q => q.subject === sub).sort((a, b) => order[a.scope] - order[b.scope] || a.chapter.localeCompare(b.chapter)).forEach(q => {
      const at = S.attempts.find(a => a.quiz_id === q.id);
      h += `<div class="card row"><div><b>${E(q.title)}</b><br><span class="tag">${E(sl(q))}</span> <span class="mu">${q.questions.length} questions, ${q.questions.reduce((s, x) => s + x.marks, 0)} marks</span></div>${at ? `<button class="btn2" data-act="detail" data-id="${at.id}">View marks</button>` : `<button class="btn" data-act="start" data-id="${q.id}">Start quiz</button>`}</div>`;
    });
  });
  return h;
}

function takeView() {
  const q = S.take;
  return `<button class="link" data-act="back">← Back</button><h2>${E(q.title)}</h2><p class="mu">${E(sl(q))}</p>` +
    q.questions.map((x, i) => `<div class="card"><p><b>${i + 1}.</b> ${E(x.text)} <span class="mu">(${x.marks} mark${x.marks == 1 ? '' : 's'})</span></p>` +
      (x.type === 'mcq' ? x.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"> ${E(o)}</label>`).join('')
        : `<textarea id="a${i}" rows="4" placeholder="Write your answer"></textarea>`) + '</div>').join('') +
    `<button class="btn" data-act="submit">Submit quiz</button>`;
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset; S.msg = '';
  try {
    if (d.act === 'tab') { S.tab = d.v; S.take = S.detail = null; if (d.v !== 'account') await load(); }
    else if (d.act === 'filter') S.filter = d.v;
    else if (d.act === 'back') S.take = S.detail = null;
    else if (d.act === 'start') S.take = S.quizzes.find(q => q.id == d.id);
    else if (d.act === 'detail') S.detail = await api('/api/attempts/' + d.id);
    else if (d.act === 'submit') {
      const answers = {};
      S.take.questions.forEach((x, i) => {
        if (x.type === 'mcq') { const c = document.querySelector(`input[name=q${i}]:checked`); if (c) answers[i] = +c.value; }
        else answers[i] = $('a' + i).value;
      });
      const r = await api(`/api/quizzes/${S.take.id}/attempt`, { method: 'POST', body: { answers } });
      await load(); S.take = null; S.tab = 'home'; S.detail = await api('/api/attempts/' + r.id); S.msg = 'Quiz submitted.';
    }
  } catch (x) {
    S.msg = x.message;
    if (d.act === 'submit') { $('msg').innerHTML = `<div class="msg" role="alert">${E(x.message)}</div>`; return; }  // keep typed answers
  }
  render(); scrollTo(0, 0);
});
