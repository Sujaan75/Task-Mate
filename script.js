/* ==========================================================
   TaskMate: vanilla JS to-do application
   Sections: helpers, storage, filtering, rendering, events
   ========================================================== */
(() => {
  'use strict';

  /* ---------- Constants & helpers ---------- */
  const KEY = 'taskmate.tasks.v1';
  const SEEDED = 'taskmate.seeded.v1';
  const CATEGORIES = ['Work', 'Personal', 'Health', 'Learning', 'Shopping'];
  const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
  const VIEWS = {
    all: 'All tasks', today: 'Today', upcoming: 'Upcoming',
    pending: 'Pending', completed: 'Completed'
  };
  const EMPTY_TEXT = {
    all: ['No tasks yet', 'Add your first task to start planning your day.'],
    today: ['Nothing due today', 'Tasks with today\u2019s due date will show up here.'],
    upcoming: ['No upcoming tasks', 'Give a task a future due date to see it here.'],
    pending: ['Nothing pending', 'Every task is done. Add a new one when you are ready.'],
    completed: ['No completed tasks yet', 'Tick a task off and it will appear here.']
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());
  const offsetDay = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };

  function dueLabel(s) {
    if (s === todayStr()) return 'Today';
    if (s === offsetDay(1)) return 'Tomorrow';
    if (s === offsetDay(-1)) return 'Yesterday';
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric'
    });
  }
  const isOverdue = t => !t.done && t.due && t.due < todayStr();

  /* ---------- Storage ---------- */
  function seedTasks() {
    const now = Date.now();
    const mk = (i, title, description, priority, category, due, done = false) =>
      ({ id: uid(), title, description, priority, category, due, done, created: now - i });
    return [
      mk(1, 'Review project proposal', 'Read the draft and leave comments for the team.', 'high', 'Work', todayStr()),
      mk(2, 'Book dentist appointment', '', 'medium', 'Health', offsetDay(2)),
      mk(3, 'Finish JavaScript course module', 'Complete the lesson on array methods.', 'low', 'Learning', offsetDay(5)),
      mk(4, 'Buy groceries', 'Fruit, vegetables and oat milk.', 'low', 'Shopping', offsetDay(-1)),
      mk(5, 'Send weekly status update', '', 'medium', 'Work', todayStr(), true),
      mk(6, 'Plan weekend trip', 'Pick a destination and check train times.', 'low', 'Personal', offsetDay(7))
    ];
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      if (!localStorage.getItem(SEEDED)) return seedTasks(); // first visit only
    } catch (e) { /* storage unavailable: start empty */ }
    return [];
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(tasks));
      localStorage.setItem(SEEDED, '1');
    } catch (e) { toast('Could not save changes in this browser'); }
  }

  /* ---------- State ---------- */
  let tasks = load();
  const state = { view: 'all', q: '', priority: 'all', category: 'all', sort: 'due-asc' };
  let editingId = null, deleteId = null, lastDay = todayStr();

  /* ---------- Elements ---------- */
  const el = id => document.getElementById(id);
  const list = el('list'), empty = el('empty'), taskDlg = el('taskDialog'), confirmDlg = el('confirmDialog');
  const form = el('taskForm'), fTitle = el('fTitle'), titleErr = el('titleErr');

  /* ---------- Filtering & sorting ---------- */
  function viewMatches(t, view, today) {
    switch (view) {
      case 'today': return t.due === today;
      case 'upcoming': return !!t.due && t.due > today && !t.done;
      case 'pending': return !t.done;
      case 'completed': return t.done;
      default: return true;
    }
  }

  function visibleTasks() {
    const today = todayStr();
    const { view, q, priority, category, sort } = state;
    const needle = q.trim().toLowerCase();
    const due = t => t.due || '9999-99-99';
    const sorters = {
      'due-asc': (a, b) => due(a).localeCompare(due(b)) || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
      'due-desc': (a, b) => (b.due || '0000').localeCompare(a.due || '0000') || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
      priority: (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || due(a).localeCompare(due(b)),
      newest: (a, b) => b.created - a.created
    };
    return tasks
      .filter(t => viewMatches(t, view, today)
        && (priority === 'all' || t.priority === priority)
        && (category === 'all' || t.category === category)
        && (!needle || t.title.toLowerCase().includes(needle)))
      .sort((a, b) => (a.done - b.done) || sorters[sort](a, b)); // completed tasks sink to the bottom
  }

  /* ---------- Rendering ---------- */
  function taskHTML(t) {
    const late = isOverdue(t);
    const dueTag = t.due
      ? `<span class="badge ${late ? 'late' : ''}">${late ? 'Overdue: ' : 'Due '}${dueLabel(t.due)}</span>` : '';
    const title = esc(t.title);
    return `<li class="task ${t.done ? 'done' : ''} ${late ? 'overdue' : ''}" data-id="${t.id}">
      <button class="check" role="checkbox" aria-checked="${t.done}" aria-label="Mark \u201c${title}\u201d as ${t.done ? 'incomplete' : 'complete'}" data-act="toggle">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
      </button>
      <div>
        <h3>${title}</h3>
        ${t.description ? `<p>${esc(t.description)}</p>` : ''}
        <div class="meta">
          <span class="badge ${t.priority}">${cap(t.priority)}</span>
          <span class="badge">${esc(t.category)}</span>${dueTag}
        </div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-act="edit" aria-label="Edit \u201c${title}\u201d"><i data-lucide="pencil"></i></button>
        <button class="icon-btn del" data-act="delete" aria-label="Delete \u201c${title}\u201d"><i data-lucide="trash-2"></i></button>
      </div>
    </li>`;
  }

  function renderStats() {
    const total = tasks.length, done = tasks.filter(t => t.done).length, pending = total - done;
    const rate = total ? Math.round(done / total * 100) : 0;
    const overdue = tasks.filter(isOverdue).length;
    el('sTotal').textContent = total;
    el('sDone').textContent = done;
    el('sPending').textContent = pending;
    el('sRate').textContent = rate + '%';
    el('ringPct').textContent = rate + '%';
    el('ringFg').style.strokeDashoffset = 263.9 * (1 - rate / 100);
    el('ringNote').textContent = total
      ? `${done} of ${total} tasks done${overdue ? `, ${overdue} overdue` : ''}`
      : 'Add a task to start tracking progress.';
    el('subtitle').textContent = !total ? 'A clear list is a good place to start. Add your first task.'
      : !pending ? 'Everything is done. Take a well-earned break.'
      : overdue ? `${pending} left, ${overdue} overdue. Start with the oldest one.`
      : `${pending} ${pending === 1 ? 'task' : 'tasks'} left. Pick one and make progress.`;
  }

  function renderNav() {
    const today = todayStr();
    Object.keys(VIEWS).forEach(v => {
      $(`[data-count="${v}"]`).textContent = tasks.filter(t => viewMatches(t, v, today)).length;
    });
    $$('.nav-item').forEach(b => {
      const active = b.dataset.view === state.view;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function renderList() {
    const items = visibleTasks();
    const filtering = state.q || state.priority !== 'all' || state.category !== 'all';
    el('viewTitle').textContent = VIEWS[state.view];
    el('viewCount').textContent = `${items.length} ${items.length === 1 ? 'task' : 'tasks'}`;
    list.innerHTML = items.map(taskHTML).join('');
    empty.hidden = items.length > 0;
    list.hidden = items.length === 0;
    if (items.length) return;
    const btn = el('emptyBtn');
    if (filtering) {
      el('emptyTitle').textContent = 'No matching tasks';
      el('emptyText').textContent = 'Try a different search or clear the filters.';
      btn.textContent = 'Clear filters'; btn.dataset.mode = 'clear';
    } else {
      [el('emptyTitle').textContent, el('emptyText').textContent] = EMPTY_TEXT[state.view];
      btn.textContent = 'Add a task'; btn.dataset.mode = 'add';
    }
  }

  function renderSide() {
    const next = tasks.filter(t => !t.done && t.due)
      .sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
    el('soon').innerHTML = next.length
      ? next.map(t => `<li><span class="dot ${t.priority}"></span><div><strong>${esc(t.title)}</strong>
          <span class="${isOverdue(t) ? 'late' : ''}">${isOverdue(t) ? 'Overdue: ' : ''}${dueLabel(t.due)}, ${esc(t.category)}</span></div></li>`).join('')
      : '<li class="none">Nothing scheduled. Add a due date to see tasks here.</li>';
  }

  function renderHeader() {
    const now = new Date(), h = now.getHours();
    el('greeting').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    el('today').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render() {
    renderHeader(); renderStats(); renderNav(); renderList(); renderSide(); icons();
  }

  /* ---------- Toasts ---------- */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    el('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2600);
  }

  /* ---------- Task form ---------- */
  function fillSelect(select, withAll) {
    select.innerHTML = (withAll ? '<option value="all">All categories</option>' : '')
      + CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  function openForm(id = null) {
    editingId = id;
    const t = id ? tasks.find(x => x.id === id) : null;
    el('dlgTitle').textContent = t ? 'Edit task' : 'New task';
    el('saveBtn').textContent = t ? 'Save changes' : 'Add task';
    fTitle.value = t ? t.title : '';
    el('fDesc').value = t ? t.description : '';
    el('fPri').value = t ? t.priority : 'medium';
    el('fCat').value = t ? t.category : 'Work';
    el('fDue').value = t ? t.due : '';
    setError('');
    taskDlg.showModal();
    fTitle.focus();
  }

  function setError(msg) {
    titleErr.textContent = msg;
    fTitle.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const title = fTitle.value.trim();
    if (!title) { setError('Enter a title for this task.'); fTitle.focus(); return; }
    const data = {
      title, description: el('fDesc').value.trim(), priority: el('fPri').value,
      category: el('fCat').value, due: el('fDue').value
    };
    if (editingId) {
      Object.assign(tasks.find(t => t.id === editingId), data);
      toast('Task updated');
    } else {
      tasks.unshift({ id: uid(), ...data, done: false, created: Date.now() });
      toast('Task added');
    }
    save(); taskDlg.close(); render();
  });
  fTitle.addEventListener('input', () => setError(''));

  /* ---------- Events ---------- */
  list.addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.task').dataset.id;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (btn.dataset.act === 'toggle') {
      task.done = !task.done;
      save(); render();
      toast(task.done ? 'Task completed' : 'Task marked as pending');
    } else if (btn.dataset.act === 'edit') {
      openForm(id);
    } else {
      deleteId = id;
      el('cText').textContent = `\u201c${task.title}\u201d will be removed permanently.`;
      confirmDlg.showModal();
    }
  });

  el('confirmBtn').addEventListener('click', () => {
    tasks = tasks.filter(t => t.id !== deleteId);
    deleteId = null;
    save(); confirmDlg.close(); render();
    toast('Task deleted');
  });

  // Close buttons and backdrop clicks for both dialogs
  [taskDlg, confirmDlg].forEach(dlg => {
    dlg.addEventListener('click', e => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
  });

  el('addBtn').addEventListener('click', () => openForm());
  el('emptyBtn').addEventListener('click', e => {
    if (e.currentTarget.dataset.mode === 'clear') {
      Object.assign(state, { q: '', priority: 'all', category: 'all' });
      el('search').value = ''; el('fPriority').value = 'all'; el('fCategory').value = 'all';
      render();
    } else openForm();
  });

  // Navigation
  $$('.nav-item').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view; setMenu(false); render();
  }));

  // Search, filters, sort
  el('search').addEventListener('input', e => { state.q = e.target.value; renderList(); icons(); });
  el('fPriority').addEventListener('change', e => { state.priority = e.target.value; renderList(); icons(); });
  el('fCategory').addEventListener('change', e => { state.category = e.target.value; renderList(); icons(); });
  el('fSort').addEventListener('change', e => { state.sort = e.target.value; renderList(); icons(); });

  // Mobile menu
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    el('menuBtn').setAttribute('aria-expanded', open);
    el('menuBtn').setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  el('menuBtn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  el('scrim').addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  // Theme: saved choice wins, otherwise follow the system setting
  const root = document.documentElement;
  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    const dark = theme === 'dark';
    el('themeBtn').setAttribute('aria-pressed', dark);
    el('themeBtn').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    if (persist) { try { localStorage.setItem('taskmate.theme', theme); } catch (e) { /* ignore */ } }
  }
  el('themeBtn').addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    toast(next === 'dark' ? 'Dark mode on' : 'Light mode on');
  });
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      let saved = null;
      try { saved = localStorage.getItem('taskmate.theme'); } catch (err) { /* ignore */ }
      if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    });
  }

  // Refresh date-dependent UI when the day changes
  setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); render(); } }, 60000);

  /* ---------- Init ---------- */
  applyTheme(root.getAttribute('data-theme') || 'light', false);
  fillSelect(el('fCategory'), true);
  fillSelect(el('fCat'), false);
  save();   // persists first-visit sample tasks so they are never re-seeded
  render();
})();
