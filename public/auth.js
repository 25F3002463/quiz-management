let role = 'student', mode = 'login';
const dash = u => location.href = u.role === 'teacher' ? '/teacher.html' : '/student.html';
function upd() {
  $('nameRow').hidden = mode === 'login';
  $('codeRow').hidden = !(mode === 'signup' && role === 'teacher');
  $('go').textContent = mode === 'login' ? 'Log in' : 'Create account';
  $('pw').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  document.querySelectorAll('[data-role]').forEach(b => b.classList.toggle('on', b.dataset.role === role));
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-role],[data-mode]'); if (!b) return;
  if (b.dataset.role) role = b.dataset.role; else mode = b.dataset.mode;
  upd();
});
$('f').onsubmit = async e => {
  e.preventDefault(); $('err').textContent = '';
  try {
    dash(await api(mode === 'login' ? '/api/login' : '/api/signup',
      { method: 'POST', body: { name: $('nm').value, email: $('em').value, password: $('pw').value, role, code: $('cd').value } }));
  } catch (x) { $('err').textContent = x.message; }
};
api('/api/me').then(dash).catch(() => {});   // already logged in: go straight to the dashboard
upd();
