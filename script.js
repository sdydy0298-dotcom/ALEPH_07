const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  user: null,
  plans: [],
  currentPlanId: null,
  tasks: [],
  allTasks: [],
  executions: [],
  allExecutions: [],
  review: null,
  daily: { records: [], ruleChange: null, count: 0 },
  taskFilter: 'in_progress',
  homeFilter: 'today',
  dueFilter: 'all',
  taskPage: 1,
  reviewTab: 'plan',
  taskSearch: '',
  priorityFilter: 'all',
  tagFilter: 'all',
  planFilter: 'all',
  taskScopeInitialized: false,
  taskSort: 'due',
  evidenceFilter: 'all',
  view: 'overview',
  selectedTaskId: null,
  returnToTaskDetailAfterExecution: false,
  planStatusFilter: 'all',
  planSearch: '',
  expandedPlanId: null,
  expandedTaskId: null,
};


function stripSensitiveAuthQuery() {
  if (!location.search) return;
  const params = new URLSearchParams(location.search);
  if (![...params.keys()].some(key => ['email','password','displayName','currentPassword','newPassword'].includes(key))) return;
  try { history.replaceState(null, '', `${location.pathname}${location.hash || ''}`); } catch {}
}
stripSensitiveAuthQuery();

const viewMeta = {
  overview: ['TODAY', '홈'],
  plan: ['PLAN', '계획'],
  do: ['TASKS', '할 일'],
  see: ['RESULTS', '결과 보기'],
};

function el(tag, className = '', textValue = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textValue !== '') node.textContent = String(textValue);
  return node;
}

function clear(node) { while (node?.firstChild) node.removeChild(node.firstChild); }
function pad(n) { return String(n).padStart(2, '0'); }
function kstToday() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function dateText(value) { if (!value) return '-'; return String(value).slice(0, 10).replaceAll('-', '.'); }
function dateTimeText(value) { if (!value) return '-'; return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date(value)); }
function minutesText(value) { const m = Number(value || 0); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); const r = m % 60; return r ? `${h}h ${r}m` : `${h}h`; }
function percentage(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function priorityText(value) { return ({ high: '높음', medium: '보통', low: '낮음' })[value] || value || '-'; }
function taskStatusText(value) { return value === 'done' ? '완료' : '진행 중'; }
function minuteCountText(value) { return `${Math.max(0, Number(value || 0))}분`; }
function workLogDateText(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', weekday:'short' }).format(new Date(value));
}
function workLogTimeText(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', hour:'2-digit', minute:'2-digit', hour12:true }).format(new Date(value));
}
function toLocalInput(date) { const d = new Date(date); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function formDataObject(form) { return Object.fromEntries(new FormData(form).entries()); }
const PASSWORD_MIN_LENGTH = 8;
function validatePasswordValue(password) {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN_LENGTH) return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  if (new TextEncoder().encode(value).length > 72) return '비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.';
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) return '영문 대/소문자, 숫자, 특수문자를 각각 1개 이상 포함해 주세요.';
  return '';
}
function currentPlan() { return state.plans.find(p => p.id === state.currentPlanId) || null; }
function planTitle(planId) { return state.plans.find(p => p.id === planId)?.title || '연결된 계획'; }

function toast(message, type = 'success') {
  const host = $('#toastHost');
  const item = el('div', `toast ${type}`, message);
  host.append(item);
  setTimeout(() => item.remove(), 3200);
}

function setMessage(name, message = '', tone = 'failure') {
  const target = $(`[data-form-message="${name}"]`);
  if (!target) return;
  const resolvedTone = tone === true ? 'success' : tone;
  target.textContent = message;
  target.style.color = resolvedTone === 'success' ? 'var(--primary)' : resolvedTone === 'error' ? 'var(--red)' : 'var(--orange)';
}
function setRequestMessage(name, err) { setMessage(name, err?.message || '요청을 처리하지 못했습니다.', err?.kind === 'error' ? 'error' : 'failure'); }
function requestTone(err) { return err?.kind === 'error' ? 'error' : 'failure'; }

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: { 'Accept': 'application/json' } };
  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const detail = data?.failure || data?.error || null;
    const err = new Error(detail?.message || `요청 실패 (${response.status})`);
    err.status = response.status;
    err.code = detail?.code;
    err.kind = data?.kind || (response.status >= 500 ? 'error' : 'failure');
    err.data = data;
    if (response.status === 401 && err.code === 'AUTH_REQUIRED') showAuth();
    throw err;
  }
  return data;
}

function showAuth() {
  state.user = null;
  clear($('#toastHost'));
  $('#appShell').classList.add('hidden');
  $('#authShell').classList.remove('hidden');
  closeAllDialogs();
}

function showApp() {
  $('#authShell').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
}

function syncModalLock() { document.body.classList.toggle('modal-open', $$('dialog[open]').length > 0); }
function openDialog(id) { const d = $(id); if (d && !d.open) { d.showModal(); document.body.classList.add('modal-open'); } }
function closeDialog(dialog) { if (dialog?.open) dialog.close(); requestAnimationFrame(syncModalLock); }
function closeAllDialogs() { $$('dialog').forEach(d => { if (d.open) d.close(); }); syncModalLock(); }

function switchAuthTab(tab) {
  const login = tab === 'login';
  $$('#authShell [data-auth-tab]').forEach(btn => {
    const active = btn.dataset.authTab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  $('#loginForm').classList.toggle('hidden', !login);
  $('#signupForm').classList.toggle('hidden', login);
  $('#authTitle').textContent = login ? '로그인' : '회원가입';
  $('#authEyebrow').textContent = login ? 'MY WORKSPACE' : 'CREATE ACCOUNT';
  $('#authDescription').textContent = login ? '저장한 계획과 작업 기록을 확인하세요.' : '계정을 만들고 첫 계획을 시작하세요.';
}

function switchView(view) {
  if (!viewMeta[view]) return;
  state.view = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  $('#viewEyebrow').textContent = viewMeta[view][0];
  $('#viewTitle').textContent = viewMeta[view][1];
  $('#appShell').classList.remove('menu-open');
  if (view === 'do' && !state.taskScopeInitialized && state.currentPlanId) {
    state.planFilter = state.currentPlanId;
    state.taskScopeInitialized = true;
    state.taskSearch = '';
    renderTasks();
  }
  if (view === 'see') {renderReviewPlanSelect();switchReviewTab(state.reviewTab);}
}

function setUserUI() {
  const name = state.user?.displayName || state.user?.display_name || '사용자';
  const email = state.user?.email || '-';
  $('#profileName').textContent = name;
  $('#profileEmail').textContent = email;
  $('#profileAvatar').textContent = name.slice(0, 1).toUpperCase();
  $('#overviewGreeting').textContent = '오늘의 할 일';
}

function renderPlanSelect() {
  const select = $('#planSelect');
  clear(select);
  if (!state.plans.length) {
    const opt = el('option', '', '계획 없음'); opt.value = ''; select.append(opt); select.disabled = true;
    state.currentPlanId = null;
    renderReviewPlanSelect();
    return;
  }
  select.disabled = false;
  for (const p of state.plans) { const opt = el('option', '', p.title); opt.value = p.id; select.append(opt); }
  if (!state.plans.some(p => p.id === state.currentPlanId)) state.currentPlanId = state.plans[0].id;
  select.value = state.currentPlanId;
  localStorage.setItem('pds:lastPlanId', state.currentPlanId);
  renderReviewPlanSelect();
}

function renderReviewPlanSelect() {
  const select = $('#reviewPlanSelect');
  if (!select) return;
  clear(select);
  if (!state.plans.length) { const o=el('option','','계획 없음');o.value='';select.append(o);select.disabled=true;return; }
  select.disabled=false;
  state.plans.forEach(p=>{const o=el('option','',p.title);o.value=p.id;select.append(o);});
  select.value=state.currentPlanId || state.plans[0].id;
}

function planIsDone(plan) {
  const total = Number(plan.task_count || 0);
  return total > 0 && Number(plan.done_count || 0) >= total;
}

function filteredPlans() {
  const q = state.planSearch.trim().toLowerCase();
  return state.plans.filter(plan => {
    const done = planIsDone(plan);
    if (state.planStatusFilter === 'active' && done) return false;
    if (state.planStatusFilter === 'done' && !done) return false;
    if (q && !`${plan.title} ${plan.success_criteria || ''}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => String(a.end_date || '').localeCompare(String(b.end_date || '')) || String(a.title).localeCompare(String(b.title), 'ko'));
}

function renderPlanList() {
  const list = $('#planListPanel');
  if (!list) return;
  clear(list);
  const rows = filteredPlans();
  $('#planListCount').textContent = `${rows.length}개 / 전체 ${state.plans.length}개`;
  const search = $('#planSearch'); if (search) search.value = state.planSearch;
  $$('[data-plan-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.planFilter === state.planStatusFilter));

  if (!state.plans.length) {
    const empty = el('div', 'empty-copy');
    empty.append(el('strong', '', '등록된 계획이 없습니다.'), el('p', '', '새 계획을 눌러 목표와 기간을 설정하세요.'));
    list.append(empty);
    return;
  }
  if (!rows.length) { list.append(el('div', 'empty-copy', '이 조건에 맞는 계획이 없습니다.')); return; }

  rows.forEach(plan => {
    const progress = percentage(Number(plan.done_count || 0), Number(plan.task_count || 0));
    const row = el('button', 'plan-board-row'); row.type = 'button';
    const lead = el('div', 'plan-board-lead');
    lead.append(
      el('span', `plan-state-dot ${planIsDone(plan) ? 'done' : ''}`),
      el('div', 'plan-board-copy')
    );
    const copy = lead.lastChild;
    copy.append(el('strong', '', plan.title), el('small', '', plan.success_criteria || '성공 기준 없음'));

    const period = el('div', 'plan-board-cell'); period.append(el('span', '', '기간'), el('strong', '', `${dateText(plan.start_date)} – ${dateText(plan.end_date)}`));
    const prog = el('div', 'plan-board-progress');
    const track = el('div', 'progress-track'); const fill = el('div', 'progress-fill'); fill.style.width = `${progress}%`; track.append(fill);
    prog.append(track, el('strong', '', `${progress}%`), el('small', '', `${plan.done_count || 0}/${plan.task_count || 0} 완료`));
    const meta = el('div', 'plan-board-meta'); meta.append(el('span', `priority-label ${plan.priority}`, priorityText(plan.priority)), el('span', 'row-arrow', '›'));
    row.append(lead, period, prog, meta);
    row.addEventListener('click', async () => {
      if (plan.id !== state.currentPlanId) await selectPlan(plan.id);
      else renderPlan();
      openDialog('#planDetailDialog');
    });
    list.append(row);
  });
}
async function selectPlan(planId) {
  if (!planId || planId === state.currentPlanId) return;
  state.currentPlanId = planId;
  localStorage.setItem('pds:lastPlanId', planId);
  await loadCurrentPlanData();
  renderAll();
}

function renderPlan() {
  const p = currentPlan();
  $('#taskAddBtn').textContent = state.plans.length ? '+ 할 일 추가' : '+ 첫 계획 만들기';
  $('#reviewSaveBtn').disabled = !p;
  $('#createPlanFromReviewBtn').disabled = !p;
  if (!p) return;
  $('#planPriorityPill').textContent = priorityText(p.priority);
  $('#planPriorityPill').className = `pill ${p.priority}`;
  $('#planVersionPill').textContent = `v${p.current_version_no}`;
  $('#planTitle').textContent = p.title;
  $('#planCriteria').textContent = p.success_criteria;
  $('#planDates').textContent = `${dateText(p.start_date)} — ${dateText(p.end_date)}`;
  $('#planEstimate').textContent = minutesText(p.estimated_minutes);
  const improvement = p.carried_improvement || '';
  $('#carriedImprovement').textContent = improvement || '연결된 메모가 없습니다.';
  $('#planImprovementSection').classList.toggle('hidden', !improvement);
  const progress = percentage(Number(p.done_count), Number(p.task_count));
  const block = $('#planProgressBlock'); clear(block);
  const summary = el('div','plan-progress-inline');
  const track = el('div','progress-track'); const fill = el('div','progress-fill'); fill.style.width = `${progress}%`; track.append(fill);
  summary.append(track, el('strong','',`${progress}%`));
  block.append(summary, el('small','',`완료 ${p.done_count || 0} / ${p.task_count || 0}`));
  const linked = state.allTasks.filter(t => t.plan_id === p.id);
  const linkedCount = $('#planLinkedCount');
  const linkedWrap = $('#planLinkedTasks');
  if (linkedCount) linkedCount.textContent = `${linked.length}개`;
  if (linkedWrap) {
    clear(linkedWrap);
    linked.slice(0, 3).forEach(task => {
      const chip = el('button','linked-task-chip',task.title); chip.type='button';
      chip.addEventListener('click',()=>{closeDialog($('#planDetailDialog'));openTaskList(p.id);setTimeout(()=>openTaskDetail(task),0);});
      linkedWrap.append(chip);
    });
    if(linked.length > 3) linkedWrap.append(el('span','linked-task-chip',`+${linked.length-3}개 더보기`));
    if(!linked.length) linkedWrap.append(el('span','linked-task-empty','아직 연결된 할 일이 없습니다.'));
  }
}

function taskDueState(task) {
  if (task.status === 'done') return '완료';
  const today = kstToday();
  if (String(task.due_date).slice(0,10) < today) return '지연';
  if (String(task.due_date).slice(0,10) === today) return '오늘';
  return dateText(task.due_date);
}

function makeTaskRow(task, mini = false) {
  if (mini) {
    const row = el('div', `home-task-row ${task.status === 'done' ? 'is-done' : ''}`);
    const check = el('button', `task-check ${task.status === 'done' ? 'done' : ''}`); check.type='button'; check.title=task.status==='done'?'진행 중으로 되돌리기':'완료 처리'; check.setAttribute('aria-label', `${task.title} · ${check.title}`); check.setAttribute('aria-pressed', String(task.status === 'done'));
    check.addEventListener('click',e=>{e.stopPropagation();toggleTask(task);});
    const info = el('button', 'home-task-copy'); info.type='button';
    info.append(el('span', 'mini-plan', task.plan_title || planTitle(task.plan_id || state.currentPlanId)), el('strong', '', task.title), el('small','',`예상 ${minutesText(task.estimated_minutes)}`));
    info.addEventListener('click',()=>{switchView('do'); setTimeout(()=>openTaskDetail(task),0);});
    const actions=el('div','row-actions');const log=el('button','quick-log','기록');log.type='button';log.setAttribute('aria-label',`${task.title} 작업 기록`);log.addEventListener('click',()=>openExecutionDialog(task.id));actions.append(el('span',taskDueState(task)==='지연'?'overdue-text':'',dateText(task.due_date)),log);row.append(check,info,actions);return row;
  }

  const item = el('article', `task-board-row ${task.status === 'done' ? 'is-done' : ''}`);
  const check = el('button', `task-check ${task.status === 'done' ? 'done' : ''}`); check.type='button'; check.title=task.status==='done'?'진행 중으로 되돌리기':'완료 처리'; check.setAttribute('aria-label', `${task.title} · ${check.title}`); check.setAttribute('aria-pressed', String(task.status === 'done'));
  check.addEventListener('click',e=>{e.stopPropagation();toggleTask(task);});
  const info = el('button', 'task-board-copy'); info.type='button';
  info.append(el('span','task-plan-label',task.plan_title || planTitle(task.plan_id || state.currentPlanId)), el('strong','task-title',task.title));
  const taskMeta = el('span','task-inline-meta');
  taskMeta.append(el('span',`priority-label ${task.priority}`,priorityText(task.priority)));
  if(task.tag) taskMeta.append(el('span','task-tag',task.tag));
  info.append(taskMeta);
  if (task.description) info.append(el('p','task-description',task.description));
  info.addEventListener('click',()=>openTaskDetail(task));
  const due = el('div','task-board-cell'); due.append(el('span','',task.status==='done'?'상태':'마감'),el('strong',taskDueState(task)==='지연'?'overdue-text':taskDueState(task)==='오늘'?'today-text':'',taskDueState(task)));
  const time = el('div','task-board-cell'); time.append(el('span','','시간'),el('strong','',`${minutesText(task.actual_minutes)} / ${minutesText(task.estimated_minutes)}`));
  const meta = el('button','task-row-open'); meta.type='button'; meta.setAttribute('aria-label','할 일 상세 보기'); meta.textContent='›'; meta.addEventListener('click',()=>openTaskDetail(task));
  const actions=el('div','row-actions');const log=el('button','quick-log','기록');log.type='button';log.setAttribute('aria-label',`${task.title} 작업 기록`);log.addEventListener('click',()=>openExecutionDialog(task.id));actions.append(log,meta);item.append(check,info,due,time,actions);
  return item;
}
function matchesDue(task, filter) {
  const due=String(task.due_date).slice(0,10), today=kstToday();
  const end=new Date(`${today}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+7);
  return filter==='all' || (filter==='today' && due===today) || (filter==='overdue' && due<today) || (filter==='upcoming' && due>today && due<=end.toISOString().slice(0,10));
}
function filteredTasks() {
  const q = state.taskSearch.trim().toLowerCase();
  let rows = state.allTasks.filter(t => {
    if (!matchesDue(t,state.dueFilter)) return false;
    if (state.planFilter !== 'all' && t.plan_id !== state.planFilter) return false;
    if (state.taskFilter !== 'all' && t.status !== state.taskFilter) return false;
    if (state.priorityFilter !== 'all' && t.priority !== state.priorityFilter) return false;
    if (state.tagFilter !== 'all' && (t.tag || '') !== state.tagFilter) return false;
    if (q && !`${t.title} ${t.description || ''} ${t.tag || ''} ${t.plan_title || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const priorityRank = { high: 0, medium: 1, low: 2 };
  rows = [...rows].sort((a, b) => {
    if (state.taskSort === 'priority') return (priorityRank[a.priority] - priorityRank[b.priority]) || String(a.due_date).localeCompare(String(b.due_date)) || String(a.created_at).localeCompare(String(b.created_at));
    if (state.taskSort === 'created') return String(b.created_at).localeCompare(String(a.created_at)) || String(a.id).localeCompare(String(b.id));
    return String(a.due_date).localeCompare(String(b.due_date)) || String(a.created_at).localeCompare(String(b.created_at));
  });
  return rows;
}

function renderTaskControls() {
  const tags = [...new Set(state.allTasks.map(t => t.tag).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  const tagSelect = $('#tagFilter'); const currentTag = state.tagFilter; clear(tagSelect);
  const allTag = el('option','','모든 태그'); allTag.value='all'; tagSelect.append(allTag);
  tags.forEach(tag => { const o=el('option','',tag); o.value=tag; tagSelect.append(o); });
  if (!tags.includes(currentTag)) state.tagFilter='all'; tagSelect.value=state.tagFilter;

  const planFilter = $('#planFilter'); const currentPlanFilter = state.planFilter; clear(planFilter);
  const allPlan = el('option','','모든 계획'); allPlan.value='all'; planFilter.append(allPlan);
  state.plans.forEach(p => { const o=el('option','',p.title); o.value=p.id; planFilter.append(o); });
  if (currentPlanFilter !== 'all' && !state.plans.some(p=>p.id===currentPlanFilter)) state.planFilter='all';
  planFilter.value=state.planFilter;

  const selectedPlan = state.plans.find(p => p.id === state.planFilter) || null;
  const scopedTasks = selectedPlan ? state.allTasks.filter(t => t.plan_id === selectedPlan.id) : state.allTasks;
  const scopedDone = scopedTasks.filter(t => t.status === 'done').length;
  const scopedProgress = percentage(scopedDone, scopedTasks.length);
  $('#taskPlanCount').textContent = `완료 ${scopedDone} / 전체 ${scopedTasks.length}개`;
  $('#taskPlanProgressFill').style.width = `${scopedProgress}%`;
  $('#taskPlanProgressPercent').textContent = `${scopedProgress}%`;
  $('#taskPlanViewBtn').disabled = !selectedPlan;

  const taskSearch = $('#taskSearch');
  if (!selectedPlan && state.taskSearch) state.taskSearch='';
  taskSearch.disabled = !selectedPlan;
  taskSearch.placeholder = selectedPlan ? '이 계획 안에서 할 일 검색' : '계획 선택 후 할 일 검색';
  taskSearch.value=state.taskSearch;
  $('#taskScopeHelper').textContent = selectedPlan
    ? `“${selectedPlan.title}” 안에서 할 일을 검색하고 있습니다.`
    : '검색하려면 먼저 계획을 선택하세요.';

  const taskPlanSelect = $('#taskPlanSelect'); const prev = taskPlanSelect.value; clear(taskPlanSelect);
  state.plans.forEach(p => { const o=el('option','',p.title); o.value=p.id; taskPlanSelect.append(o); });
  taskPlanSelect.value = state.plans.some(p=>p.id===prev) ? prev : (selectedPlan?.id || state.currentPlanId || state.plans[0]?.id || '');

  $('#dueFilter').value=state.dueFilter;
  $$('[data-task-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.taskFilter===state.taskFilter);b.setAttribute('aria-pressed',String(b.dataset.taskFilter===state.taskFilter));});
  $('#priorityFilter').value=state.priorityFilter;
  $('#taskSort').value=state.taskSort;
  $('#taskSortRule').textContent = state.taskSort === 'priority' ? '우선순위 → 마감일' : state.taskSort === 'created' ? '최근 생성 순' : '마감일 빠른 순';
}
function renderTasks() {
  renderTaskControls();
  const list = $('#taskList'); clear(list);
  const filtered = filteredTasks();
  $('#taskCountLabel').textContent = `${filtered.length}개 표시`;
  if (!state.plans.length) {const empty=el('div','empty-copy');empty.append(el('strong','','할 일을 추가하려면 먼저 계획을 만드세요.'));const create=el('button','button primary','첫 계획 만들기');create.type='button';create.onclick=()=>openPlanDialog();empty.append(create);list.append(empty);}
  else if (!filtered.length) {const empty=el('div','empty-copy');empty.append(el('p','','이 조건에 맞는 할 일이 없습니다.'));const reset=el('button','button ghost','필터 초기화');reset.type='button';reset.addEventListener('click',()=>resetTaskFilters());empty.append(reset);list.append(empty);}
  else {const pageSize=20;const pages=Math.ceil(filtered.length/pageSize);state.taskPage=Math.min(state.taskPage,pages);filtered.slice((state.taskPage-1)*pageSize,state.taskPage*pageSize).forEach(t=>list.append(makeTaskRow(t)));if(pages>1){const nav=el('div','list-pagination');const prev=el('button','button ghost','이전'),next=el('button','button ghost','다음');prev.type=next.type='button';prev.disabled=state.taskPage===1;next.disabled=state.taskPage===pages;prev.onclick=()=>{state.taskPage--;renderTasks();};next.onclick=()=>{state.taskPage++;renderTasks();};nav.append(prev,el('span','',`${state.taskPage} / ${pages} 페이지`),next);list.append(nav);}}

  renderHomeTasks();

  const exSelect=$('#executionTaskSelect');clear(exSelect);
  state.allTasks.forEach(t=>{const o=el('option','',`${t.title} · ${t.plan_title||planTitle(t.plan_id)}`);o.value=t.id;exSelect.append(o);});
}

function renderReview() {
  const m=state.review?.metrics||{task_count:0,completed_count:0,delayed_count:0,blocked_count:0,estimated_minutes:0,actual_minutes:0,delta_minutes:0};
  const rate=percentage(Number(m.completed_count),Number(m.task_count));
  $('#seeCompletion').textContent=`${rate}%`;$('#seeCompletionSub').textContent=`${m.completed_count} / ${m.task_count}`;
  $('#seeEstimate').textContent=minutesText(m.estimated_minutes||0);
  $('#seeActual').textContent=minutesText(m.actual_minutes||0);
  const delta=Number(m.delta_minutes||0);$('#seeDeltaSub').textContent=`차이 ${delta>0?'+':''}${minutesText(Math.abs(delta)).replace(/^/,delta<0?'-':'')}`;
  $('#seeDelayed').textContent=m.delayed_count||0;$('#seeBlocked').textContent=m.blocked_count||0;$('#seeDelta').textContent=String(delta);
  $('#improvementText').value=currentPlan()?(state.review?.improvementText||''):'';

  const goodList=$('#reviewGoodList');
  if(goodList){
    clear(goodList);
    const good=[];
    if(Number(m.completed_count)>0) good.push(`${m.completed_count}개 완료`);
    if(Number(m.actual_minutes)>0 && Number(m.estimated_minutes)>0){
      if(Number(m.actual_minutes)<=Number(m.estimated_minutes)) good.push(`기록 시간이 전체 예상 시간 이내입니다.`);
      else good.push(`기록 시간이 전체 예상 시간을 초과했습니다.`);
    }
    if(Number(m.blocked_count)===0 && Number(m.completed_count)>0) good.push('등록된 막힘 기록이 없습니다.');
    if(!good.length) good.push('할 일과 작업 기록을 추가하면 결과가 표시됩니다.');
    good.slice(0,3).forEach(text=>goodList.append(el('li','',text)));
  }

  const list=$('#evidenceList');clear(list);const ev=state.review?.evidence||[];
  if(!ev.length)list.append(el('div','empty-copy','할 일을 진행하면 계획과 실제 기록을 여기에서 비교할 수 있습니다.'));
  else ev.forEach(x=>{const row=el('div','evidence-row');const copy=el('div');copy.append(el('p','',x.title),el('small','',`${taskDueState(x)}${x.blocker_count?` · 막힘 ${x.blocker_count}회`:''}`));const chart=el('div');const track=el('div','evidence-bar');const bar=el('span');const max=Math.max(Number(x.estimated_minutes),Number(x.actual_minutes),1);bar.style.width=`${Math.min(100,Math.round((Number(x.actual_minutes)/max)*100))}%`;track.append(bar);chart.append(track,el('small','',`예상 ${minutesText(x.estimated_minutes)} / 기록 ${minutesText(x.actual_minutes)}`));row.append(copy,chart,el('strong','',x.status==='done'?'완료':'진행 중'));list.append(row);});
}

function renderDaily() {
  const { records, ruleChange }=state.daily;const timeline=$('#dailyTimeline');clear(timeline);const summary=$('#dailySummary');clear(summary);
  const values=records.map(r=>Number(r.metric_value||0));const total=values.reduce((a,b)=>a+b,0);const avg=values.length?Math.round(total/values.length):0;
  [['기록한 날짜',`${records.length}일`],['작업 시간 합계',minutesText(total)],['하루 평균',minutesText(avg)]].forEach(([k,v])=>{const chip=el('span','daily-summary-chip',k);chip.append(el('strong','',v));summary.append(chip);});
  if(!records.length)timeline.append(el('div','empty-copy','아직 하루 기록이 없습니다. 오늘 기록 작성을 눌러 추가하세요.'));
  else [...records].reverse().forEach(r=>{const card=el('article','daily-card');const date=el('div','daily-date');date.append(el('strong','',dateText(r.record_date)),el('small','',r.metric_name||'실제 작업 시간'));const copy=el('div','daily-copy');copy.append(el('h4','',r.summary),el('p','',`계획 기준 · ${r.rule_snapshot}`));card.append(date,copy,el('span','daily-value',minutesText(r.metric_value||0)));timeline.append(card);});
  if(ruleChange){const marker=el('div','rule-change-marker');marker.append(el('span','rule-change-label','계획 기준 변경'),el('strong','',`${ruleChange.before_rule} → ${ruleChange.after_rule}`),el('small','',ruleChange.reason));timeline.append(marker);}else if(records.length===2){const marker=el('div','rule-change-marker subtle');marker.append(el('span','rule-change-label','기준 점검'),el('strong','','두 번의 회고를 바탕으로 계획 기준을 한 번 조정할 수 있습니다.'),el('small','','다음 회고 전에 변경 이유와 새 기준을 남겨두세요.'));timeline.append(marker);}
  const ruleBtn=$('#ruleChangeBtn');ruleBtn.disabled=Boolean(ruleChange)||records.length!==2;ruleBtn.classList.toggle('hidden',Boolean(ruleChange)||records.length!==2);$('#dailyAddBtn').classList.toggle('hidden',records.length>=5);$('#initialRuleField').classList.toggle('hidden',records.length>0);
}

function renderOverview() {
  const label=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  $('#topbarDate').textContent=label;$('#overviewDate').textContent=label;
  $('#onboarding').classList.toggle('hidden',!!state.plans.length);$('#homeWorkspace').classList.toggle('hidden',!state.plans.length);
  const pending=state.allTasks.filter(t=>t.status!=='done');
  const todayAll=state.allTasks.filter(t=>String(t.due_date).slice(0,10)===kstToday());
  const todayPending=todayAll.filter(t=>t.status!=='done');
  const todayDone=todayAll.filter(t=>t.status==='done');
  const urgent=pending.filter(t=>matchesDue(t,'today')||matchesDue(t,'overdue')).length;
  $('#overviewGreeting').textContent='오늘의 할 일';
  $('#overviewPlanPeriod').textContent=urgent?`오늘 마감인 할 일과 진행 중인 계획을 확인하세요.`:'오늘 마감할 일은 없습니다. 진행 중인 계획을 확인하세요.';
  const remaining=$('#homeFocusRemaining'); if(remaining) remaining.textContent=todayPending.length;
  const fill=$('#homeFocusProgressFill'); if(fill) fill.style.width=`${percentage(todayDone.length,todayAll.length)}%`;
  const progressText=$('#homeFocusProgressText'); if(progressText) progressText.textContent=`${todayDone.length} / ${todayAll.length} 완료`;
  const minutes=state.allExecutions.filter(x=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.started_at))===kstToday()).reduce((v,x)=>v+Number(x.actual_minutes||0),0);
  $('#homeBriefText').textContent=`오늘 기록 ${minutesText(minutes)} · 진행 중인 계획 ${state.plans.filter(p=>!planIsDone(p)).length}개`;
  const plans=$('#overviewPlans');clear(plans);const active=state.plans.filter(p=>!planIsDone(p)).slice(0,3);
  if(!active.length)plans.append(el('div','empty-copy','진행 중인 계획이 없습니다.'));
  active.forEach(p=>{const card=el('article','home-plan-row');const copy=el('button','home-plan-copy');copy.type='button';copy.append(el('strong','',p.title),el('small','',`${dateText(p.start_date)} – ${dateText(p.end_date)}`));copy.onclick=async()=>{await selectPlan(p.id);renderPlan();openDialog('#planDetailDialog');};const action=el('button','quick-log home-plan-action', '계획 보기');action.type='button';action.onclick=async()=>{await selectPlan(p.id);renderPlan();openDialog('#planDetailDialog');};const progress=percentage(Number(p.done_count||0),Number(p.task_count||0));if(progress===0)card.classList.add('is-zero-progress');const wrap=el('div','home-plan-progress');const track=el('div','progress-track');const bar=el('div','progress-fill');bar.style.width=`${progress}%`;track.append(bar);wrap.append(track,el('span','',`${progress}%`));const meta=el('small','home-plan-meta',`완료 ${p.done_count||0} / ${p.task_count||0}`);card.append(copy,action,wrap,meta);plans.append(card);});
  renderHomeTasks();
}

function renderHomeTasks(){
 const pending=state.allTasks.filter(t=>t.status!=='done');
 for(const [filter,id] of [['today','homeTodayCount'],['overdue','homeOverdueCount'],['upcoming','homeUpcomingCount']])$('#'+id).textContent=pending.filter(t=>matchesDue(t,filter)).length;
 $$('[data-home-filter]').forEach(b=>{const active=b.dataset.homeFilter===state.homeFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 const rows=pending.filter(t=>matchesDue(t,state.homeFilter)).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date))||({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority]));
 const list=$('#overviewTasks');clear(list);rows.slice(0,6).forEach(t=>list.append(makeTaskRow(t,true)));
 if(!rows.length){const empty=el('div','empty-copy');empty.append(el('strong','',state.allTasks.length?({today:'오늘 마감인 미완료 할 일이 없습니다.',overdue:'기한이 지난 할 일이 없습니다.',upcoming:'다가오는 7일 내 마감인 할 일이 없습니다.'}[state.homeFilter]):'계획에 첫 할 일을 추가하세요.'));const btn=el('button','button ghost',state.allTasks.length?'미완료 할 일 보기':'첫 할 일 추가');btn.type='button';btn.onclick=()=>state.allTasks.length?openTaskList():openTaskDialog();empty.append(btn);list.append(empty);}
 $('#homeMoreBtn').classList.toggle('hidden',rows.length<=6);
}
function openTaskList(planId='all',due='all',status='in_progress'){
 Object.assign(state,{planFilter:planId,dueFilter:due,taskFilter:status,taskSearch:'',priorityFilter:'all',tagFilter:'all',taskSort:'due',taskPage:1,taskScopeInitialized:true});renderTasks();switchView('do');
}
function resetTaskFilters(){
 Object.assign(state,{dueFilter:'all',taskFilter:'in_progress',taskSearch:'',priorityFilter:'all',tagFilter:'all',taskSort:'due',taskPage:1});
 $('#advancedTaskFilters')?.classList.add('hidden');
 renderTasks();
}
async function addTaskToPlan(id){closeDialog($('#planDetailDialog'));await selectPlan(id);openTaskDialog();}
function switchReviewTab(tab){state.reviewTab=tab;$('#planReviewContent').classList.toggle('hidden',tab!=='plan');$('#dailyReviewContent').classList.toggle('hidden',tab!=='daily');$('.review-plan-select').classList.toggle('hidden',tab!=='plan');$$('[data-review-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.reviewTab===tab);b.setAttribute('aria-pressed',String(b.dataset.reviewTab===tab));});}
function notifyTaskComplete(task){const host=$('#toastHost');host.querySelectorAll('.completion-toast').forEach(n=>n.remove());const item=el('div','toast completion-toast');item.append(el('span','','완료 처리했습니다. 작업 기록을 남길 수 있습니다.'));const record=el('button','','작업 기록');record.type='button';record.onclick=()=>{item.remove();openExecutionDialog(task.id);};const undo=el('button','','되돌리기');undo.type='button';undo.onclick=()=>{item.remove();const latest=state.allTasks.find(t=>t.id===task.id);if(latest?.status==='done')toggleTask(latest);};const close=el('button','','닫기');close.type='button';close.onclick=()=>item.remove();item.append(record,undo,close);host.append(item);}

function renderAll() { renderPlanSelect(); renderPlanList(); renderPlan(); renderTasks(); renderReview(); renderDaily(); renderOverview(); }

async function loadPlans() {
  const data=await api('/api/plans'); state.plans=data.plans||[];
  const remembered=localStorage.getItem('pds:lastPlanId'); if(!state.currentPlanId&&remembered&&state.plans.some(p=>p.id===remembered))state.currentPlanId=remembered;
  if(!state.currentPlanId&&state.plans[0])state.currentPlanId=state.plans[0].id;
}
async function loadCurrentPlanData() {
  if(!state.currentPlanId){state.tasks=[];state.executions=[];state.review=null;return;}
  const id=encodeURIComponent(state.currentPlanId);
  const [tasks,executions,review]=await Promise.all([api(`/api/tasks?planId=${id}`),api(`/api/executions?planId=${id}`),api(`/api/review?planId=${id}`)]);
  state.tasks=tasks.tasks||[];state.executions=executions.executions||[];state.review=review;
}
async function loadAllTasks(){
  const data=await api('/api/tasks'); state.allTasks=data.tasks||[];
}

async function loadAllExecutions(){
  const data=await api('/api/executions');state.allExecutions=data.executions||[];
}

async function loadDaily(){state.daily=await api('/api/daily');}
async function refreshAll(){await loadPlans();renderPlanSelect();await Promise.all([loadCurrentPlanData(),loadAllTasks(),loadAllExecutions(),loadDaily()]);renderAll();}

async function toggleTask(task){
  const completing=task.status!=='done';
  try{await api('/api/tasks',{method:'PATCH',body:{taskId:task.id,status:task.status==='done'?'in_progress':'done'}});await refreshAll();if(completing)notifyTaskComplete(task);}catch(e){toast(e.message,requestTone(e));}
}
async function deleteTask(task){
  if(!confirm(`"${task.title}" 할 일을 삭제할까요?`))return;
  try{await api(`/api/tasks?taskId=${encodeURIComponent(task.id)}`,{method:'DELETE'});await refreshAll();toast('할 일을 삭제했습니다.');}catch(e){toast(e.message,requestTone(e));}
}

function taskExecutions(taskId){
  return state.allExecutions
    .filter(ex=>String(ex.task_id)===String(taskId))
    .sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at)) || String(b.created_at).localeCompare(String(a.created_at)));
}

function replaceTaskExecutions(taskId, logs){
  const keep=state.allExecutions.filter(ex=>String(ex.task_id)!==String(taskId));
  state.allExecutions=[...keep,...logs];
}

function renderTaskDetail(task, explicitLogs=null){
  const planName=task.plan_title||planTitle(task.plan_id);
  const actual=Math.max(0,Number(task.actual_minutes||0));
  const estimate=Math.max(0,Number(task.estimated_minutes||0));
  const progress=estimate?Math.round((actual/estimate)*100):0;
  const logs=explicitLogs===null?taskExecutions(task.id):explicitLogs;

  $('#taskDetailPlan').textContent=planName;
  $('#taskDetailPlanName').textContent=planName;
  $('#taskDetailTitle').textContent=task.title;
  $('#taskDetailDescription').textContent=task.description||'메모가 없습니다.';
  $('#taskDetailDue').textContent=dateText(task.due_date);
  $('#taskDetailEstimate').textContent=minuteCountText(estimate);
  $('#taskDetailActual').textContent=minuteCountText(actual);
  $('#taskDetailProgressText').textContent=`${progress}%`;
  $('#taskDetailProgressFill').style.width=`${Math.min(progress,100)}%`;
  $('#taskDetailCreatedAt').textContent=dateText(task.created_at);
  $('#taskDetailUpdatedAt').textContent=dateText(task.updated_at);

  const priority=$('#taskDetailPriority');
  priority.textContent=priorityText(task.priority);
  priority.className=`priority-label ${task.priority||'medium'}`;

  const status=$('#taskDetailStatus');
  status.textContent=taskStatusText(task.status);
  status.className=`task-status-pill ${task.status==='done'?'done':'in-progress'}`;

  const tags=$('#taskDetailTags');
  clear(tags);
  if(task.tag) tags.append(el('span','task-tag',task.tag));

  $('#taskDetailLogCount').textContent=`${logs.length}건`;
  const list=$('#taskDetailWorkLogList');
  clear(list);
  if(!logs.length){
    const empty=el('div','task-worklog-empty');
    empty.append(el('strong','','아직 작업 기록이 없습니다.'),el('p','','이 할 일을 수행할 때마다 작업 기록을 남겨보세요.'));
    list.append(empty);
  }else{
    logs.forEach(ex=>{
      const row=el('article','task-worklog-row');
      const dot=el('span',`task-worklog-dot ${ex.blocker_reason?'blocked':''}`);
      const body=el('div','task-worklog-body');
      const top=el('div','task-worklog-top');
      top.append(
        el('strong','task-worklog-date',workLogDateText(ex.started_at)),
        el('span','task-worklog-time',`${workLogTimeText(ex.started_at)} → ${workLogTimeText(ex.ended_at)}`),
        el('span','task-worklog-duration',minuteCountText(ex.actual_minutes))
      );
      const note=el('p','task-worklog-note',ex.note||'작업 메모가 없습니다.');
      const meta=el('div','task-worklog-meta');
      const blocker=el('span',`task-worklog-blocker ${ex.blocker_reason?'has-blocker':'clear'}`,ex.blocker_reason?`막힘: ${ex.blocker_reason}`:'막힘 없음');
      const actions=el('div','task-worklog-actions');
      const editBtn=el('button','task-worklog-action','수정');
      editBtn.type='button';
      editBtn.setAttribute('aria-label',`${workLogDateText(ex.started_at)} 작업 기록 수정`);
      editBtn.addEventListener('click',()=>{closeDialog($('#taskDetailDialog'));openExecutionEditDialog(ex);});
      const deleteBtn=el('button','task-worklog-action danger','삭제');
      deleteBtn.type='button';
      deleteBtn.setAttribute('aria-label',`${workLogDateText(ex.started_at)} 작업 기록 삭제`);
      deleteBtn.addEventListener('click',()=>deleteExecutionLog(ex));
      actions.append(editBtn,deleteBtn);
      meta.append(blocker,actions);
      body.append(top,note,meta);
      row.append(dot,body);
      list.append(row);
    });
  }

  const completeBtn=$('#taskDetailCompleteBtn');
  completeBtn.textContent=task.status==='done'?'진행 중으로 되돌리기':'완료 처리';
  completeBtn.classList.toggle('ghost',task.status==='done');
  completeBtn.classList.toggle('primary',task.status!=='done');
}

async function openTaskDetail(task){
  if(!task)return;
  state.selectedTaskId=task.id;
  const fresh=state.allTasks.find(t=>String(t.id)===String(task.id))||task;
  renderTaskDetail(fresh);
  openDialog('#taskDetailDialog');

  try{
    const data=await api(`/api/executions?taskId=${encodeURIComponent(fresh.id)}`);
    if(String(state.selectedTaskId)!==String(fresh.id))return;
    const logs=data.executions||[];
    replaceTaskExecutions(fresh.id,logs);
    const latest=state.allTasks.find(t=>String(t.id)===String(fresh.id))||fresh;
    renderTaskDetail(latest,logs);
  }catch(err){
    if(String(state.selectedTaskId)!==String(fresh.id))return;
    const list=$('#taskDetailWorkLogList');
    clear(list);
    const failed=el('div','task-worklog-empty');
    failed.append(el('strong','','작업 기록을 불러오지 못했습니다.'),el('p','',err?.message||'잠시 후 다시 시도해 주세요.'));
    list.append(failed);
    toast(err?.message||'작업 기록을 불러오지 못했습니다.',requestTone(err));
  }
}
function selectedTask(){return state.allTasks.find(t=>t.id===state.selectedTaskId)||null;}

function openPlanDialog(mode='create'){
  const form=$('#planForm');form.reset();form.elements.mode.value=mode;setMessage('plan');const p=currentPlan();
  $('#planContinueBtn').classList.toggle('hidden',mode==='revise');$('#planForm button[type=submit]').textContent=mode==='revise'?'새 버전 저장':'계획만 저장';
  $('#planDialogTitle').textContent=mode==='revise'?'계획 새 버전 만들기':'새 계획';
  if(mode==='revise'&&p){form.elements.title.value=p.title;form.elements.startDate.value=String(p.start_date).slice(0,10);form.elements.endDate.value=String(p.end_date).slice(0,10);form.elements.priority.value=p.priority;form.elements.successCriteria.value=p.success_criteria;form.elements.estimatedMinutes.value=p.estimated_minutes;form.elements.carriedImprovement.value=p.carried_improvement||'';}
  else{const start=kstToday();const end=new Date(`${start}T12:00:00+09:00`);end.setDate(end.getDate()+7);form.elements.startDate.value=start;form.elements.endDate.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(end);form.elements.carriedImprovement.value='';}
  openDialog('#planDialog');
}
function openTaskDialog(task=null){
  if(!state.plans.length){openPlanDialog('create');return;}
  const f=$('#taskForm'); f.reset(); setMessage('task'); renderTaskControls();
  if(task){
    $('#taskDialogTitle').textContent='할 일 수정'; f.elements.mode.value='edit'; f.elements.taskId.value=task.id; f.elements.planId.value=task.plan_id || state.currentPlanId || ''; f.elements.title.value=task.title; f.elements.dueDate.value=String(task.due_date).slice(0,10); f.elements.estimatedMinutes.value=task.estimated_minutes; f.elements.priority.value=task.priority; f.elements.tag.value=task.tag||''; f.elements.description.value=task.description||'';
  }else{
    $('#taskDialogTitle').textContent='할 일 추가'; f.elements.mode.value='create'; f.elements.taskId.value=''; f.elements.planId.value=state.currentPlanId || state.plans[0]?.id || ''; f.elements.dueDate.value=kstToday(); f.elements.estimatedMinutes.value=30;
  }
  openDialog('#taskDialog');
}
function setExecutionDialogMode(mode='create'){
  const f=$('#executionForm');
  const editing=mode==='edit';
  f.dataset.mode=editing?'edit':'create';
  if(!editing){f.dataset.executionId='';f.dataset.originalTaskId='';}
  const select=$('#executionTaskSelect');
  select.disabled=editing;
  f.querySelector('.dialog-head h3').textContent=editing?'작업 기록 수정':'작업 기록 남기기';
  f.querySelector('button[type="submit"]').textContent=editing?'수정 저장':'기록 저장';
}
function openExecutionDialog(taskId='',returnToDetail=false){
  if(!state.allTasks.length){toast('기록을 남길 할 일이 없습니다.','failure');return;}
  state.returnToTaskDetailAfterExecution=Boolean(returnToDetail);
  const f=$('#executionForm');
  f.reset();
  renderTaskControls();
  setExecutionDialogMode('create');
  $('#executionBlockerField').classList.add('hidden');
  const end=new Date();
  const start=new Date(end.getTime()-30*60000);
  f.elements.startedAt.value=toLocalInput(start);
  f.elements.endedAt.value=toLocalInput(end);
  if(taskId)f.elements.taskId.value=taskId;
  f.dataset.originalTaskId=taskId||'';
  setMessage('execution');
  openDialog('#executionDialog');
}
function openExecutionEditDialog(execution){
  if(!execution)return;
  const f=$('#executionForm');
  f.reset();
  renderTaskControls();
  setExecutionDialogMode('edit');
  f.dataset.executionId=String(execution.id||'');
  f.dataset.originalTaskId=String(execution.task_id||state.selectedTaskId||'');
  f.elements.taskId.value=String(execution.task_id||'');
  f.elements.startedAt.value=toLocalInput(new Date(execution.started_at));
  f.elements.endedAt.value=toLocalInput(new Date(execution.ended_at));
  f.elements.note.value=execution.note||'';
  const hasBlocker=Boolean(String(execution.blocker_reason||'').trim());
  $('#executionBlockedToggle').checked=hasBlocker;
  $('#executionBlockerField').classList.toggle('hidden',!hasBlocker);
  f.elements.blockerReason.value=execution.blocker_reason||'';
  state.returnToTaskDetailAfterExecution=true;
  setMessage('execution');
  openDialog('#executionDialog');
}
async function deleteExecutionLog(execution){
  if(!execution?.id)return;
  const taskId=String(execution.task_id||state.selectedTaskId||'');
  if(!confirm('이 작업 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.'))return;
  try{
    await api(`/api/executions?executionId=${encodeURIComponent(execution.id)}`,{method:'DELETE'});
    await refreshAll();
    toast('작업 기록을 삭제했습니다.');
    const latest=state.allTasks.find(t=>String(t.id)===taskId);
    if(latest)await openTaskDetail(latest);
  }catch(err){toast(err?.message||'작업 기록을 삭제하지 못했습니다.',requestTone(err));}
}
function openDailyDialog(){setMessage('daily');$('#dailyForm').reset();$('#initialRuleField').classList.toggle('hidden',state.daily.records.length>0);openDialog('#dailyDialog');}
function openRuleDialog(){const before=state.daily.records.at(-1)?.rule_snapshot||'-';$('#beforeRuleText').textContent=before;$('#ruleForm').reset();setMessage('rule');openDialog('#ruleDialog');}

async function showVersionHistory(){const p=currentPlan();if(!p)return;try{const data=await api(`/api/plan-versions?planId=${encodeURIComponent(p.id)}`);const list=$('#versionList');clear(list);data.versions.forEach(v=>{const row=el('article','version-row');const head=el('header');head.append(el('strong','',`v${v.version_no} · ${v.title}`),el('span','',dateTimeText(v.created_at)));row.append(head,el('p','',`${dateText(v.start_date)} — ${dateText(v.end_date)} · ${priorityText(v.priority)} · ${minutesText(v.estimated_minutes)}`),el('p','',`성공 기준: ${v.success_criteria}`));if(v.carried_improvement)row.append(el('p','',`가져온 개선점: ${v.carried_improvement}`));list.append(row);});openDialog('#versionDialog');}catch(e){toast(e.message,requestTone(e));}}

async function boot(){
  try{const me=await api('/api/auth?action=me');if(!me?.authenticated){showAuth();return;}state.user=me.user;showApp();setUserUI();await refreshAll();switchView('overview');}
  catch(e){showAuth();}
}

$$('[data-auth-tab]').forEach(btn=>btn.addEventListener('click',()=>switchAuthTab(btn.dataset.authTab)));
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();e.stopPropagation();setMessage('login');const form=e.currentTarget;const b=formDataObject(form);try{const r=await api('/api/auth?action=login',{method:'POST',body:b});state.user={id:r.user.id,email:r.user.email,displayName:r.user.display_name};showApp();setUserUI();await refreshAll();form.reset();toast('로그인했습니다.');}catch(err){form.elements.password.value='';setRequestMessage('login',err);}});
$('#signupForm').addEventListener('submit',async e=>{e.preventDefault();e.stopPropagation();setMessage('signup');const form=e.currentTarget;const b=formDataObject(form);const passwordFailure=validatePasswordValue(b.password);if(passwordFailure){setMessage('signup',passwordFailure,'failure');return;}try{const r=await api('/api/auth?action=signup',{method:'POST',body:b});state.user={id:r.user.id,email:r.user.email,displayName:r.user.display_name};showApp();setUserUI();await refreshAll();form.reset();toast('계정을 만들었습니다.');}catch(err){form.elements.password.value='';setRequestMessage('signup',err);}});

$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
$$('[data-go]').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.go)));
$('#mobileMenuBtn').addEventListener('click',()=>$('#appShell').classList.toggle('menu-open'));
$('#planSelect').addEventListener('change',async e=>{const next=e.target.value||null;if(next)await selectPlan(next);});
$('#reviewPlanSelect').addEventListener('change',async e=>{const next=e.target.value||null;if(next)await selectPlan(next);});
$('#planCreateBtn').addEventListener('click',()=>openPlanDialog('create'));
$('#planEditBtn').addEventListener('click',()=>{closeDialog($('#planDetailDialog'));openPlanDialog('revise');});
$('#taskDetailLogBtn').addEventListener('click',()=>{const t=selectedTask();if(!t)return;closeDialog($('#taskDetailDialog'));openExecutionDialog(t.id,true);});
$('#taskDetailEditBtn').addEventListener('click',()=>{const t=selectedTask();if(!t)return;closeDialog($('#taskDetailDialog'));openTaskDialog(t);});
$('#taskDetailDeleteBtn').addEventListener('click',()=>{const t=selectedTask();if(!t)return;closeDialog($('#taskDetailDialog'));deleteTask(t);});
$('#taskDetailCompleteBtn').addEventListener('click',async()=>{const t=selectedTask();if(!t)return;closeDialog($('#taskDetailDialog'));await toggleTask(t);const latest=selectedTask();if(latest)openTaskDetail(latest);});
$('#planDeleteBtn').addEventListener('click',()=>{const p=currentPlan();if(!p)return;closeDialog($('#planDetailDialog'));$('#planDeleteTarget').textContent=p.title;openDialog('#planDeleteDialog');});
$$('[data-action="create-plan"]').forEach(x=>x.addEventListener('click',()=>openPlanDialog('create')));
$('#versionHistoryBtn').addEventListener('click',()=>{closeDialog($('#planDetailDialog'));showVersionHistory();});
$('#taskAddBtn').addEventListener('click',()=>state.plans.length?openTaskDialog():openPlanDialog('create'));
$('#executionBlockedToggle').addEventListener('change',e=>{const field=$('#executionBlockerField');field.classList.toggle('hidden',!e.target.checked);if(!e.target.checked)$('#executionForm').elements.blockerReason.value='';});
$('#dailyAddBtn').addEventListener('click',openDailyDialog);
$('#ruleChangeBtn').addEventListener('click',openRuleDialog);
$('#settingsBtn').addEventListener('click',()=>openDialog('#settingsDialog'));
$$('[data-close-dialog]').forEach(btn=>btn.addEventListener('click',()=>closeDialog(btn.closest('dialog'))));
$$('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d)closeDialog(d);});d.addEventListener('close',syncModalLock);});
$$('[data-plan-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.planStatusFilter=btn.dataset.planFilter;renderPlanList();}));
$('#planSearch').addEventListener('input',e=>{state.planSearch=e.target.value;renderPlanList();});
$$('[data-task-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.taskPage=1;state.taskFilter=btn.dataset.taskFilter;$$('[data-task-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderTasks();}));
$('#taskSearch').addEventListener('input',e=>{state.taskSearch=e.target.value;state.taskPage=1;renderTasks();});
$('#planFilter').addEventListener('change',e=>{state.planFilter=e.target.value;state.taskScopeInitialized=true;state.taskSearch='';state.taskPage=1;renderTasks();});
$('#advancedFilterBtn').addEventListener('click',()=>{$('#advancedTaskFilters').classList.toggle('hidden');});
$('#taskPlanViewBtn').addEventListener('click',async()=>{if(state.planFilter==='all')return;await selectPlan(state.planFilter);switchView('plan');});
$('#priorityFilter').addEventListener('change',e=>{state.priorityFilter=e.target.value;state.taskPage=1;renderTasks();});
$('#tagFilter').addEventListener('change',e=>{state.tagFilter=e.target.value;state.taskPage=1;renderTasks();});
$('#taskSort').addEventListener('change',e=>{state.taskSort=e.target.value;renderTasks();});

$('#planForm').addEventListener('submit',async e=>{e.preventDefault();setMessage('plan');const b=formDataObject(e.currentTarget);const mode=b.mode;const nextTask=e.submitter?.dataset.nextTask==='true';delete b.mode;b.estimatedMinutes=Number(b.estimatedMinutes);if(b.endDate<b.startDate){setMessage('plan','종료일은 시작일보다 빠를 수 없습니다.','failure');return;}if(mode==='revise')b.planId=state.currentPlanId;try{const result=await api('/api/plans',{method:mode==='revise'?'PATCH':'POST',body:b});if(mode==='create'&&result?.plan?.plan_id)state.currentPlanId=result.plan.plan_id;closeDialog($('#planDialog'));await refreshAll();toast(mode==='revise'?'새 계획 버전을 저장했습니다.':'계획을 만들었습니다.');if(mode==='create'){state.planSearch='';state.planStatusFilter='all';renderPlanList();if(nextTask)openTaskDialog();}}catch(err){setRequestMessage('plan',err);}});
$('#confirmPlanDeleteBtn').addEventListener('click',async()=>{const p=currentPlan();if(!p)return;const id=p.id;try{await api(`/api/plans?planId=${encodeURIComponent(id)}`,{method:'DELETE'});closeDialog($('#planDeleteDialog'));state.currentPlanId=null;await refreshAll();toast('계획을 삭제했습니다.');}catch(e){toast(e.message,requestTone(e));}});
$('#taskForm').addEventListener('submit',async e=>{e.preventDefault();setMessage('task');const b=formDataObject(e.currentTarget);const mode=b.mode;delete b.mode;b.estimatedMinutes=Number(b.estimatedMinutes);if(mode==='create')delete b.taskId;try{await api('/api/tasks',{method:mode==='edit'?'PATCH':'POST',body:b});closeDialog($('#taskDialog'));await refreshAll();toast(mode==='edit'?'할 일을 수정했습니다.':'할 일을 추가했습니다.');if(mode==='create')openTaskList(b.planId);}catch(err){setRequestMessage('task',err);}});
$('#executionForm').addEventListener('submit',async e=>{
  e.preventDefault();
  setMessage('execution');
  const form=e.currentTarget;
  const mode=form.dataset.mode==='edit'?'edit':'create';
  const b=formDataObject(form);
  const taskId=mode==='edit'?(form.dataset.originalTaskId||state.selectedTaskId):b.taskId;
  const returnToDetail=state.returnToTaskDetailAfterExecution;
  const s=new Date(b.startedAt),end=new Date(b.endedAt);
  if(Number.isNaN(s.getTime())||Number.isNaN(end.getTime())||end<s){setMessage('execution','종료 시각은 시작 시각보다 빠를 수 없습니다.','failure');return;}
  b.startedAt=s.toISOString();
  b.endedAt=end.toISOString();
  delete b.hadBlocker;
  if(!$('#executionBlockedToggle').checked)b.blockerReason='';
  if(mode==='edit'){
    b.executionId=form.dataset.executionId;
    delete b.taskId;
  }
  try{
    await api('/api/executions',{method:mode==='edit'?'PATCH':'POST',body:b});
    closeDialog($('#executionDialog'));
    setExecutionDialogMode('create');
    await refreshAll();
    state.returnToTaskDetailAfterExecution=false;
    toast(mode==='edit'?'작업 기록을 수정했습니다.':'작업 기록을 저장했습니다.');
    if(returnToDetail){const latest=state.allTasks.find(t=>String(t.id)===String(taskId));if(latest)await openTaskDetail(latest);}
  }catch(err){setRequestMessage('execution',err);}
});
$('#dailyForm').addEventListener('submit',async e=>{e.preventDefault();setMessage('daily');const b=formDataObject(e.currentTarget);if(state.daily.records.length===0&&!String(b.ruleSnapshot||'').trim()){setMessage('daily','첫날에는 현재 계획 기준을 입력해 주세요.','failure');return;}try{await api('/api/daily',{method:'POST',body:b});closeDialog($('#dailyDialog'));await refreshAll();toast('오늘 회고를 저장했습니다.');}catch(err){setRequestMessage('daily',err);}});
$('#ruleForm').addEventListener('submit',async e=>{e.preventDefault();setMessage('rule');const b=formDataObject(e.currentTarget);const before=state.daily.records.at(-1)?.rule_snapshot||'';if(String(b.afterRule||'').trim()===String(before).trim()){setMessage('rule','새 기준은 현재 기준과 다르게 입력해 주세요.','failure');return;}try{await api('/api/rule-change',{method:'POST',body:b});closeDialog($('#ruleDialog'));await refreshAll();toast('계획 기준을 수정했습니다.');}catch(err){setRequestMessage('rule',err);}});
$('#reviewSaveBtn').addEventListener('click',async()=>{if(!state.currentPlanId)return;try{await api('/api/review',{method:'PUT',body:{planId:state.currentPlanId,improvementText:$('#improvementText').value}});await refreshAll();toast('돌아보기를 저장했습니다.');}catch(e){toast(e.message,requestTone(e));}});
$('#createPlanFromReviewBtn').addEventListener('click',()=>{const memo=$('#improvementText').value.trim();if(!memo){toast('먼저 다음에 바꿀 내용을 적어 주세요.','failure');return;}openPlanDialog('create');const form=$('#planForm');form.elements.carriedImprovement.value=memo;const details=form.querySelector('.optional-fields');if(details)details.open=true;});

$('#logoutBtn').addEventListener('click',async()=>{try{await api('/api/auth?action=logout',{method:'POST'});}catch{}showAuth();toast('로그아웃했습니다.');});
$('#passwordForm').addEventListener('submit',async e=>{e.preventDefault();setMessage('password');const form=e.currentTarget;const b=formDataObject(form);const passwordFailure=validatePasswordValue(b.newPassword);if(passwordFailure){setMessage('password',passwordFailure,'failure');return;}if(b.currentPassword===b.newPassword){setMessage('password','새 비밀번호는 기존 비밀번호와 달라야 합니다.','failure');return;}try{const r=await api('/api/auth?action=password',{method:'PATCH',body:b});form.reset();setMessage('password',r.message,'success');toast('비밀번호를 변경했습니다.');}catch(err){setRequestMessage('password',err);}});
$('#deleteAccountForm').addEventListener('submit',async e=>{e.preventDefault();setMessage('delete');if(!confirm('계정과 모든 기록을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;try{await api('/api/auth?action=account',{method:'DELETE',body:formDataObject(e.currentTarget)});showAuth();toast('계정을 삭제했습니다.');}catch(err){setRequestMessage('delete',err);}});
$('#exportBtn').addEventListener('click',async()=>{try{const response=await fetch('/api/export');if(!response.ok){const d=await response.json();const detail=d?.failure||d?.error;const err=new Error(detail?.message||'내보내기 실패');err.kind=d?.kind||(response.status>=500?'error':'failure');throw err;}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`plandosee-export-${kstToday()}.json`;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);toast('내보내기 파일을 만들었습니다.');}catch(e){toast(e.message,requestTone(e));}});

window.addEventListener('keydown',e=>{if(e.key==='Escape')$('#appShell').classList.remove('menu-open');});
$$('[data-home-filter]').forEach(b=>b.onclick=()=>{state.homeFilter=b.dataset.homeFilter;renderHomeTasks();});
$('#homeMoreBtn').onclick=()=>openTaskList('all',state.homeFilter);
$('#homeAllTasksBtn').onclick=()=>openTaskList('all','today','in_progress');
$('#homeDailyBtn').onclick=()=>{switchView('see');switchReviewTab('plan');};
$('#homeQuickTaskBtn')?.addEventListener('click',()=>{if(!state.plans.length){openPlanDialog('create');return;}switchView('do');setTimeout(()=>openTaskDialog(),0);});
$('#planTasksTextBtn')?.addEventListener('click',()=>{closeDialog($('#planDetailDialog'));openTaskList(state.currentPlanId);});
$('#profileButton')?.addEventListener('click',()=>openDialog('#settingsDialog'));
$('#dueFilter').onchange=e=>{state.dueFilter=e.target.value;state.taskPage=1;renderTasks();};
$('#resetTaskFilters').onclick=resetTaskFilters;
$('#planTasksBtn').onclick=()=>{closeDialog($('#planDetailDialog'));openTaskList(state.currentPlanId);};
$$('[data-review-tab]').forEach(b=>b.onclick=()=>switchReviewTab(b.dataset.reviewTab));
boot();
