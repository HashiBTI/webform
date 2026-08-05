/**
 * app.js
 * Main application logic for CFF — Company Formation Framework.
 * Renders all views into #root and wires up interaction via event
 * delegation (no inline on-click attributes, so this plays nicely with
 * a strict Content-Security-Policy on the server).
 *
 * Loaded as a plain classic script (not an ES module) so the whole site
 * can be opened directly from disk (file://) as well as served over
 * http(s) — no bundler, no build step. Because of that, this file relies
 * on js/storage.js and js/api.js being loaded first in index.html: their
 * top-level declarations (saveState, loadState, clearState,
 * storageAvailable, analyseValues, cancelActiveRequest, ApiError) are
 * plain globals by the time this script runs, so no import statement is
 * needed here.
 */

/* ========================================================================
   DATA
   ======================================================================== */

const QUESTIONS = [
  {n:1, q:"How do you fill your space?", h:"What objects, materials, tools, books, technology, collections, or belongings occupy most of your personal and working space?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:2, q:"How do you spend your time?", h:"What activities regularly receive most of your available time?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:3, q:"How do you spend your energy?", h:"Which activities, people, responsibilities, or interests receive most of your physical and mental energy?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:4, q:"How do you spend your money?", h:"What categories, activities, responsibilities, or interests receive most of your money?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:5, q:"In which areas are you most organised?", h:"What parts of your life, work, possessions, responsibilities, or activities do you naturally organise?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:6, q:"Where are you most reliable?", h:"In which areas can others consistently depend on you?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:7, q:"What dominates your thoughts?", h:"What subjects, responsibilities, goals, problems, or people do you think about most frequently?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:8, q:"What do you visualise most?", h:"What future situations, achievements, experiences, or results do you regularly imagine?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:9, q:"What do you most often talk to yourself about?", h:"What subjects dominate your internal conversations?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:10, q:"What do you most often talk to others about?", h:"What subjects naturally appear in your conversations with other people?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:11, q:"What inspires you?", h:"Which people, ideas, achievements, experiences, causes, or possibilities inspire you most?", labels:["Answer 1","Answer 2","Answer 3"]},
  {n:12, q:"Which goals stand out in your life and have stood the test of time?", h:"Enter the top three goals that have remained important to you over a long period.", labels:["Goal 1","Goal 2","Goal 3"]},
  {n:13, q:"What topics do you regularly study, read about, or research?", h:"What subjects do you voluntarily and repeatedly try to understand more deeply?", labels:["Answer 1","Answer 2","Answer 3"]},
];

const ROLE_META = {
  visitor:{ label:"Visitor", tagline:"Understand who you are, what matters most to you, and where your life can go next.",
    cards:["Values Assessment","Life Cycle Assessment","Success Journey Assessment","AI Personal Analysis","Personal Strengths","Goals & Aspirations"] },
  owner:{ label:"Business Owner", tagline:"Connect your values, experience, resources, and vision to build a successful company.",
    cards:["Founder Profile","Values Assessment","Life Cycle Assessment","Success Journey Assessment","Business Idea","Vision & Mission","Company Values","Company Formation Roadmap"] },
  employee:{ label:"Company Employee", tagline:"Understand your strengths, improve your capabilities, and contribute meaningfully to the company.",
    cards:["Employee Profile","Values Assessment","Life Cycle Assessment","Success Journey Assessment","Suitable Roles","Training Recommendations","Performance Development Plan"] }
};

const MIN_ANSWER_LEN = 10;

/* ========================================================================
   STATE
   ======================================================================== */

function freshState(){
  return {
    view: 'role-select',
    role: null,
    user: null,           // { id, name, email, phone, company, jobTitle }
    valuesAnswers: {},    // { [questionNumber]: [a1,a2,a3] }
    currentQ: 0,
    analysis: null,
    analysisLoading: false,
    analysisError: null,
    stubTitle: null,
    navOpen: false,
  };
}

let state = freshState();
let saveTimer = null;

function queuePersist(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveState({
      role: state.role,
      user: state.user,
      valuesAnswers: state.valuesAnswers,
      analysis: state.analysis,
    });
  }, 350);
}

/* ========================================================================
   HELPERS
   ======================================================================== */

function escapeHtml(str){
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function announce(message){
  const region = document.getElementById('live-region');
  if(region) region.textContent = message;
}

function isEmailValid(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isNameValid(name){
  return name.trim().length >= 2;
}

function isPhoneValid(phone){
  // Accepts digits with optional +, spaces, dashes, parentheses; 7–15 digits total.
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/** Generates a short, unique-enough member ID, e.g. "CFF-7K3F9Q2". */
function generateUserId(){
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'CFF-' + stamp.slice(-4) + rand;
}

function answerLen(str){
  return (str || '').trim().length;
}

function questionAnswered(n){
  const a = state.valuesAnswers[n] || [];
  return a.length === 3 && a.every(x => answerLen(x) >= MIN_ANSWER_LEN);
}

function completedCount(){
  return QUESTIONS.filter(item => questionAnswered(item.n)).length;
}

function allQuestionsComplete(){
  return completedCount() === QUESTIONS.length;
}

let toastTimer = null;
function showToast(message, kind=''){
  let el = document.getElementById('toast');
  if(el) el.remove();
  el = document.createElement('div');
  el.id = 'toast';
  el.className = 'toast' + (kind ? ' toast-' + kind : '');
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

/* ========================================================================
   NAVIGATION
   ======================================================================== */

function go(view, extra){
  state.view = view;
  state.navOpen = false;
  if(extra) Object.assign(state, extra);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function confirmLeaveAssessmentIfNeeded(){
  if(state.view === 'values' && !allQuestionsComplete() && completedCount() > 0){
    return window.confirm('Your progress is saved automatically, but the assessment is not finished yet. Leave anyway?');
  }
  return true;
}

window.addEventListener('beforeunload', (e) => {
  if(state.view === 'values' && !allQuestionsComplete() && completedCount() > 0){
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ========================================================================
   RENDER
   ======================================================================== */

function render(){
  const root = document.getElementById('root');
  let html = '';
  switch(state.view){
    case 'role-select': html = viewRoleSelect(); break;
    case 'auth': html = viewAuth(); break;
    case 'dashboard': html = viewDashboard(); break;
    case 'values': html = viewValues(); break;
    case 'values-summary': html = viewValuesSummary(); break;
    case 'analysis': html = viewAnalysis(); break;
    case 'stage-stub': html = viewStageStub(); break;
    case 'settings': html = viewSettings(); break;
    default: html = viewRoleSelect();
  }
  root.innerHTML = html;
  afterRender();
}

function afterRender(){
  if(state.view === 'values'){
    const firstField = document.querySelector('.answer-block textarea');
    if(firstField && document.activeElement !== firstField){
      // Only auto-focus when nothing else is already focused (e.g. right after render on question change)
      firstField.focus({ preventScroll: true });
    }
  }
  if(state.view === 'auth'){
    const firstField = document.getElementById('in-name');
    if(firstField) firstField.focus();
  }
}

/* ---------------------------------------------------------------------- */
/* Shared fragments                                                        */
/* ---------------------------------------------------------------------- */

function topbar(activeKey){
  if(!state.user) return '';
  return `
  <header class="topbar">
    <div class="shell topbar-inner">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">C</div>
        <div class="brand-name">CFF</div>
        <span class="badge badge-navy">${escapeHtml(ROLE_META[state.role].label)}</span>
      </div>
      <button class="nav-toggle" type="button" data-action="toggle-nav" aria-expanded="${state.navOpen}" aria-controls="nav-links" aria-label="Toggle navigation menu">☰</button>
      <nav class="nav-links ${state.navOpen ? 'open' : ''}" id="nav-links" aria-label="Main navigation">
        <button class="navlink ${activeKey==='dashboard'?'active':''}" data-action="go" data-view="dashboard" type="button">Dashboard</button>
        <button class="navlink ${activeKey==='values'?'active':''}" data-action="go" data-view="values" type="button">Assessments</button>
        <button class="navlink ${activeKey==='settings'?'active':''}" data-action="go" data-view="settings" type="button">Settings</button>
        <button class="navlink" data-action="logout" type="button">Logout</button>
      </nav>
    </div>
  </header>`;
}

function siteFooter(){
  return `
  <footer class="site-footer">
    <div class="shell site-footer-inner">
      <p>&copy; ${new Date().getFullYear()} CFF — Company Formation Framework. Prototype build.</p>
      <p>AI-generated content is guidance, not professional advice.</p>
    </div>
  </footer>`;
}

function journeyStrip(current){
  const stages = ['Values', 'Life Cycle', 'Success Journey'];
  return `<div class="journey-strip">
    ${stages.map((s,i) => {
      const idx = i+1;
      const cls = idx < current ? 'done' : (idx === current ? 'current' : '');
      return `<div style="display:flex;align-items:center;gap:8px;">
        <div class="journey-node ${cls}">${idx < current ? '✓' : idx}</div>
        <div class="journey-label ${idx===current?'current':''}">${s}</div>
        ${i < 2 ? '<div class="journey-divider"></div>' : ''}
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* View: Role select                                                       */
/* ---------------------------------------------------------------------- */

function viewRoleSelect(){
  const roles = [
    { key:'visitor', title:'Visitor', desc:'Explore your personal values, life journey, strengths, goals, and future direction.', cta:'Continue as Visitor' },
    { key:'owner', title:'Business Owner', desc:'Discover your founder values, business strengths, leadership profile, company purpose, and growth direction.', cta:'Continue as Business Owner' },
    { key:'employee', title:'Company Employee', desc:'Understand your values, strengths, experience, suitable responsibilities, and contribution to the company.', cta:'Continue as Employee' },
  ];
  return `
  <main id="main" class="fade-in hero-section">
    <div class="hero-inner">
      <div class="shell" style="width:100%;">
        <div class="hero-head">
          <span class="badge badge-teal">Company Formation Framework</span>
          <h1>Welcome to the Company Formation Framework</h1>
          <p>Select the profile that best describes you.</p>
        </div>
        <div class="grid-auto" role="list">
          ${roles.map(r => `
            <button type="button" class="role-card" role="listitem" data-action="select-role" data-role="${r.key}">
              <h2>${r.title}</h2>
              <p>${r.desc}</p>
              <span class="btn btn-primary btn-block" aria-hidden="true">${r.cta}</span>
            </button>`).join('')}
        </div>
      </div>
    </div>
  </main>`;
}

/* ---------------------------------------------------------------------- */
/* View: Auth                                                              */
/* ---------------------------------------------------------------------- */

function viewAuth(){
  const roleKey = state.role;
  return `
  <main id="main" class="fade-in shell auth-wrap">
    <button class="btn btn-ghost" type="button" data-action="go" data-view="role-select">← Change profile</button>
    <div class="card auth-card" style="margin-top:22px;">
      <span class="badge badge-navy">${escapeHtml(ROLE_META[roleKey].label)}</span>
      <h2>Create your account</h2>
      <p class="auth-sub">This is a prototype — no password required. Just tell us who you are.</p>

      <form id="signup-form" data-action="submit-signup" novalidate>
        <div class="field">
          <label for="in-name">Full Name</label>
          <input id="in-name" name="name" type="text" autocomplete="name" required aria-required="true" aria-describedby="err-name">
          <div class="field-error" id="err-name" role="alert"></div>
        </div>
        <div class="field">
          <label for="in-email">Email Address</label>
          <input id="in-email" name="email" type="email" autocomplete="email" required aria-required="true" aria-describedby="err-email">
          <div class="field-error" id="err-email" role="alert"></div>
        </div>
        <div class="field">
          <label for="in-phone">Phone Number</label>
          <input id="in-phone" name="phone" type="tel" autocomplete="tel" required aria-required="true" aria-describedby="err-phone">
          <div class="field-error" id="err-phone" role="alert"></div>
        </div>
        ${roleKey === 'owner' ? `
        <div class="field">
          <label for="in-company">Company Name <span style="font-weight:400;">(optional)</span></label>
          <input id="in-company" name="company" type="text" autocomplete="organization">
        </div>` : ''}
        ${roleKey === 'employee' ? `
        <div class="field">
          <label for="in-job">Job Title <span style="font-weight:400;">(optional)</span></label>
          <input id="in-job" name="jobTitle" type="text" autocomplete="organization-title">
        </div>` : ''}
        <div class="field">
          <label class="checkbox-row" for="in-consent">
            <input id="in-consent" name="consent" type="checkbox" required aria-required="true" aria-describedby="err-consent">
            <span>I accept the Terms &amp; Conditions and consent to my answers being processed by an AI system to generate personalised insights.</span>
          </label>
          <div class="field-error" id="err-consent" role="alert"></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:6px;">Continue to Dashboard</button>
      </form>
    </div>
  </main>`;
}

async function handleSignupSubmit(form){
  const name = form.querySelector('#in-name').value;
  const email = form.querySelector('#in-email').value;
  const phone = form.querySelector('#in-phone').value;
  const consent = form.querySelector('#in-consent').checked;
  const companyField = form.querySelector('#in-company');
  const jobField = form.querySelector('#in-job');
  const submitButton = form.querySelector('button[type="submit"]');

  let valid = true;
  const setErr = (id, msg) => {
    const el = form.querySelector('#' + id);
    if(el) el.textContent = msg || '';
  };

  if(!isNameValid(name)){
    setErr('err-name', 'Please enter your full name (at least 2 characters).');
    form.querySelector('#in-name').classList.add('invalid');
    valid = false;
  }else{
    setErr('err-name', '');
    form.querySelector('#in-name').classList.remove('invalid');
  }

  if(!isEmailValid(email)){
    setErr('err-email', 'Please enter a valid email address.');
    form.querySelector('#in-email').classList.add('invalid');
    valid = false;
  }else{
    setErr('err-email', '');
    form.querySelector('#in-email').classList.remove('invalid');
  }

  if(!isPhoneValid(phone)){
    setErr('err-phone', 'Please enter a valid phone number (7–15 digits).');
    form.querySelector('#in-phone').classList.add('invalid');
    valid = false;
  }else{
    setErr('err-phone', '');
    form.querySelector('#in-phone').classList.remove('invalid');
  }

  if(!consent){
    setErr('err-consent', 'You must accept the Terms & Conditions to continue.');
    valid = false;
  }else{
    setErr('err-consent', '');
  }

  if(!valid){
    announce('Please fix the highlighted fields.');
    return;
  }

  try{
    if(submitButton){
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }

    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      }),
    });

    let result = {};
    try{
      result = await response.json();
    }catch(_){
      result = {};
    }

    if(!response.ok){
      throw new Error(result.error || 'Could not save your details.');
    }

    state.user = {
      id: (state.user && state.user.id) ? state.user.id : generateUserId(),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      company: companyField ? companyField.value.trim() : '',
      jobTitle: jobField ? jobField.value.trim() : '',
    };

    queuePersist();
    announce('Your details were saved successfully.');
    go('dashboard');
  }catch(error){
    console.error('Lead submission error:', error);
    announce(error.message || 'Your details could not be saved.');
    alert('Data was not saved: ' + (error.message || 'Unknown error'));
  }finally{
    if(submitButton){
      submitButton.disabled = false;
      submitButton.textContent = 'Continue to Dashboard';
    }
  }
}

function logout(){
  cancelActiveRequest();
  state = freshState();
  render();
}

/* ---------------------------------------------------------------------- */
/* View: Dashboard                                                         */
/* ---------------------------------------------------------------------- */

function viewDashboard(){
  const meta = ROLE_META[state.role];
  const doneCount = completedCount();
  const valuesPct = Math.round((doneCount / QUESTIONS.length) * 100);
  const overallPct = Math.round(valuesPct / 3); // Values is stage 1 of 3

  return `
  ${topbar('dashboard')}
  <main id="main" class="fade-in shell" style="padding:36px 0 40px;">
    <div class="dash-head">
      <h1>Welcome back, ${escapeHtml(state.user.name.split(' ')[0])}</h1>
      <p class="dash-tagline">${meta.tagline}</p>
    </div>

    <div class="grid-2" style="margin-bottom:28px;">
      <div class="card" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="font-weight:700;font-size:14.5px;">Profile completion</div>
          <div style="font-weight:700;color:var(--teal);">${overallPct}%</div>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${overallPct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" style="width:${overallPct}%;"></div>
        </div>
        ${journeyStrip(valuesPct === 100 ? 2 : 1)}
        <button class="btn btn-teal" type="button" data-action="go" data-view="values">
          ${doneCount > 0 && doneCount < 13 ? 'Continue Values Assessment' : (doneCount === 13 ? 'Review Values Assessment' : 'Start Values Assessment')}
        </button>
      </div>
      <div class="card" style="padding:24px;">
        <div style="font-weight:700;font-size:14.5px;margin-bottom:10px;">AI Advisor</div>
        <p style="font-size:13px;color:var(--ink-soft);line-height:1.5;margin:0 0 14px;">
          ${state.role==='visitor' ? 'Your Personal Clarity Advisor is ready once your Values Assessment is complete.' :
            state.role==='owner' ? 'Your Founder & Company Formation Advisor is ready once your Values Assessment is complete.' :
            'Your Employee Growth & Career Advisor is ready once your Values Assessment is complete.'}
        </p>
        <button class="btn btn-ghost btn-block" type="button" data-action="go" data-view="${doneCount===13 ? 'analysis' : 'values'}">
          ${doneCount===13 ? 'Open AI Analysis' : 'Complete Assessment First'}
        </button>
      </div>
    </div>

    <div style="font-weight:700;font-size:14.5px;margin-bottom:12px;">${escapeHtml(meta.label)} Modules</div>
    <div class="grid-auto">
      ${meta.cards.map(c => {
        const lower = c.toLowerCase();
        const isValues = lower.includes('values assessment');
        const isLifecycle = lower.includes('life cycle');
        const isSuccess = lower.includes('success journey');
        let action, view, extraAttr = '', status, statusClass = '';
        if(isValues){
          action = 'go'; view = 'values';
          status = doneCount === 13 ? 'Complete' : (doneCount > 0 ? doneCount + '/13 done' : 'Not started');
          statusClass = doneCount === 13 ? 'complete' : '';
        } else if(isLifecycle || isSuccess){
          action = 'go'; view = 'stage-stub'; extraAttr = `data-stub-title="${escapeHtml(c)}"`;
          status = 'Not started';
        } else {
          action = 'go'; view = 'stage-stub'; extraAttr = `data-stub-title="${escapeHtml(c)}"`;
          status = 'Preview available';
        }
        return `<button type="button" class="module-card" data-action="${action}" data-view="${view}" ${extraAttr}>
          <h3>${escapeHtml(c)}</h3>
          <div class="module-status ${statusClass}">${status}</div>
        </button>`;
      }).join('')}
    </div>
  </main>
  ${siteFooter()}`;
}

/* ---------------------------------------------------------------------- */
/* View: Stage stub (Life Cycle / Success / other modules)                 */
/* ---------------------------------------------------------------------- */

function viewStageStub(){
  return `
  ${topbar('dashboard')}
  <main id="main" class="fade-in shell" style="padding:56px 0;max-width:560px;">
    <button class="btn btn-ghost" type="button" data-action="go" data-view="dashboard" style="margin-bottom:20px;">← Back to dashboard</button>
    <div class="card stub-card">
      <span class="badge badge-gold">In this prototype</span>
      <h2 style="font-size:22px;color:var(--navy);margin:14px 0 0;">${escapeHtml(state.stubTitle || 'This module')}</h2>
      <p>This module follows the same pattern as the Values Assessment — structured questions, autosave, and an AI-generated analysis. It's stubbed here so the Values Assessment could go deep first.</p>
      <button class="btn btn-primary" type="button" data-action="go" data-view="dashboard" style="margin-top:16px;">Back to Dashboard</button>
    </div>
  </main>
  ${siteFooter()}`;
}

/* ---------------------------------------------------------------------- */
/* View: Values assessment                                                 */
/* ---------------------------------------------------------------------- */

function questionNav(){
  return `<div class="q-nav" role="tablist" aria-label="Jump to question">
    ${QUESTIONS.map((item, idx) => {
      const cls = idx === state.currentQ ? 'current' : (questionAnswered(item.n) ? 'answered' : '');
      return `<button type="button" class="q-nav-btn ${cls}" data-action="jump-question" data-idx="${idx}"
        role="tab" aria-selected="${idx===state.currentQ}" aria-label="Question ${item.n}${questionAnswered(item.n) ? ', answered' : ', not answered'}">${item.n}</button>`;
    }).join('')}
  </div>`;
}

function viewValues(){
  const i = state.currentQ;
  const item = QUESTIONS[i];
  const answers = state.valuesAnswers[item.n] || ['', '', ''];
  const doneCount = completedCount();
  const allDone = doneCount === 13;

  return `
  ${topbar('values')}
  <main id="main" class="fade-in shell assessment-wrap" style="padding:32px 0 90px;">
    <button class="btn btn-ghost" type="button" data-action="save-exit" style="margin-bottom:18px;">← Save &amp; Exit</button>

    <div class="assessment-head">
      <span class="badge badge-teal">Stage 1 of 3 — Values</span>
      <h1 style="font-size:26px;color:var(--navy);margin:12px 0 6px;">The 13 Questions That Reveal Your Highest Values</h1>
    </div>
    <p class="assessment-instructions">You need to provide three answers to each question. Think carefully before answering. Enter real examples from your daily life rather than ideal or expected answers.</p>

    ${questionNav()}

    <div class="q-progress-row">
      <span class="label">Question ${item.n} of 13</span>
      <span class="count">${doneCount}/13 answered</span>
    </div>
    <div class="progress-track" style="margin-bottom:26px;" role="progressbar" aria-valuenow="${doneCount}" aria-valuemin="0" aria-valuemax="13">
      <div class="progress-fill" style="width:${(doneCount/13)*100}%;"></div>
    </div>

    <div class="card question-card">
      <h2>${escapeHtml(item.q)}</h2>
      <p class="question-helper">${escapeHtml(item.h)}</p>
      <div class="answer-group">
        ${[0,1,2].map(k => {
          const val = answers[k] || '';
          const len = answerLen(val);
          const ok = len >= MIN_ANSWER_LEN;
          return `
          <div class="answer-block">
            <div class="answer-block-head">
              <label for="ans-${item.n}-${k}">${item.labels[k]}</label>
              <button type="button" class="clear-answer-btn" data-action="clear-answer" data-qn="${item.n}" data-idx="${k}">Clear</button>
            </div>
            <textarea id="ans-${item.n}-${k}" data-action="answer-input" data-qn="${item.n}" data-idx="${k}"
              placeholder="Write a real, specific example…" aria-describedby="meta-${item.n}-${k}">${escapeHtml(val)}</textarea>
            <div class="answer-meta" id="meta-${item.n}-${k}">
              <span class="charcount ${ok ? 'ok' : ''}" data-role="status-label">${ok ? '✓ Looks good' : `Minimum ${MIN_ANSWER_LEN} characters`}</span>
              <span class="charcount" data-role="char-label">${len} characters</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="assessment-footer">
      <button class="btn btn-ghost" type="button" data-action="nav-prev" ${i===0 ? 'disabled' : ''}>← Previous</button>
      <span class="autosave-note" aria-live="polite">Autosaved${storageAvailable ? '' : ' (storage unavailable in this browser — progress will not persist)'}</span>
      ${i < 12
        ? `<button class="btn btn-primary" type="button" data-action="nav-next">Next →</button>`
        : `<button class="btn btn-teal" type="button" data-action="go-review" ${!allDone ? 'disabled' : ''}>Review &amp; Generate Analysis</button>`
      }
    </div>
    ${i===12 && !allDone ? `<p class="validation-note">Complete all 13 questions (3 answers each, ${MIN_ANSWER_LEN}+ characters) to continue.</p>` : ''}
  </main>
  ${siteFooter()}`;
}

function updateAnswerLive(qn, idx, value){
  if(!state.valuesAnswers[qn]) state.valuesAnswers[qn] = ['', '', ''];
  state.valuesAnswers[qn][idx] = value;
  queuePersist();

  // Lightweight DOM patch instead of a full re-render so the textarea keeps focus/caret.
  const meta = document.getElementById(`meta-${qn}-${idx}`);
  if(meta){
    const len = answerLen(value);
    const ok = len >= MIN_ANSWER_LEN;
    meta.querySelector('[data-role="status-label"]').textContent = ok ? '✓ Looks good' : `Minimum ${MIN_ANSWER_LEN} characters`;
    meta.querySelector('[data-role="status-label"]').className = 'charcount' + (ok ? ' ok' : '');
    meta.querySelector('[data-role="char-label"]').textContent = `${len} characters`;
  }
  const doneCountEl = document.querySelector('.q-progress-row .count');
  if(doneCountEl) doneCountEl.textContent = `${completedCount()}/13 answered`;
  const fill = document.querySelector('.progress-track .progress-fill');
  if(fill) fill.style.width = `${(completedCount()/13)*100}%`;

  const navBtn = document.querySelector(`.q-nav-btn[data-idx="${state.currentQ}"]`);
  if(navBtn && questionAnswered(qn) && qn === QUESTIONS[state.currentQ].n){
    navBtn.classList.add('answered');
  }
}

function clearAnswer(qn, idx){
  if(!window.confirm('Clear this answer?')) return;
  if(!state.valuesAnswers[qn]) state.valuesAnswers[qn] = ['', '', ''];
  state.valuesAnswers[qn][idx] = '';
  queuePersist();
  render();
}

function navQuestion(delta){
  state.currentQ = Math.min(QUESTIONS.length - 1, Math.max(0, state.currentQ + delta));
  render();
}

function jumpQuestion(idx){
  state.currentQ = Math.min(QUESTIONS.length - 1, Math.max(0, idx));
  render();
}

function saveAndExit(){
  queuePersist();
  showToast('Progress saved.', 'teal');
  go('dashboard');
}

/* ---------------------------------------------------------------------- */
/* View: Values assessment — completion summary                           */
/* ---------------------------------------------------------------------- */

function viewValuesSummary(){
  const allDone = allQuestionsComplete();
  return `
  ${topbar('values')}
  <main id="main" class="fade-in shell assessment-wrap" style="padding:32px 0 90px;">
    <button class="btn btn-ghost" type="button" data-action="go" data-view="values" style="margin-bottom:18px;">← Back to questions</button>
    <span class="badge badge-teal">Stage 1 of 3 — Values</span>
    <h1 style="font-size:24px;color:var(--navy);margin:12px 0 6px;">Review your answers</h1>
    <p class="assessment-instructions">Check everything below before generating your analysis. You can jump back to edit any question.</p>

    <div class="card" style="padding:8px 24px;">
      ${QUESTIONS.map((item, idx) => {
        const ok = questionAnswered(item.n);
        const a = state.valuesAnswers[item.n] || [];
        const preview = ok ? a.map(x => x.trim()).join(' · ').slice(0, 140) + (a.join('').length > 140 ? '…' : '') : '';
        return `
        <div class="summary-row">
          <div style="min-width:0;">
            <h4>${item.n}. ${escapeHtml(item.q)}</h4>
            ${ok ? `<p>${escapeHtml(preview)}</p>` : `<p class="summary-missing">Not yet complete</p>`}
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-action="jump-question" data-idx="${idx}" style="flex-shrink:0;">Edit</button>
        </div>`;
      }).join('')}
    </div>

    <div class="assessment-footer" style="justify-content:flex-end;">
      <button class="btn btn-teal" type="button" data-action="generate-analysis" ${!allDone ? 'disabled' : ''}>Generate My Values Analysis</button>
    </div>
    ${!allDone ? `<p class="validation-note">Finish every question above before generating your analysis.</p>` : ''}
  </main>
  ${siteFooter()}`;
}

/* ========================================================================
   AI ANALYSIS
   ======================================================================== */

async function generateAnalysis(){
  if(!allQuestionsComplete()){
    showToast('Please complete all 13 questions first.', 'danger');
    return;
  }
  state.analysisLoading = true;
  state.analysisError = null;
  go('analysis');

  const formattedAnswers = QUESTIONS.map(item => ({
    n: item.n,
    q: item.q,
    values: (state.valuesAnswers[item.n] || ['', '', '']).map(v => v.trim())
  }));

  try{
    announce('Generating your values analysis. This may take a few seconds.');
    const result = await analyseValues(ROLE_META[state.role].label, formattedAnswers);
    state.analysis = result;
    state.analysisLoading = false;
    queuePersist();
    announce('Your values analysis is ready.');
    render();
  }catch(err){
    state.analysisLoading = false;
    state.analysisError = err instanceof ApiError ? err.message : 'Something went wrong while generating your analysis. Please try again.';
    announce(state.analysisError);
    render();
  }
}

function viewAnalysis(){
  const roleAgent = state.role==='visitor' ? 'Personal Clarity Advisor'
    : state.role==='owner' ? 'Founder & Company Formation Advisor'
    : 'Employee Growth & Career Advisor';

  let body = '';

  if(state.analysisLoading){
    body = `
    <div class="card analysis-loading" role="status" aria-live="polite">
      <div class="spinner"></div>
      <div style="font-weight:700;color:var(--navy);margin-bottom:4px;">Your ${escapeHtml(roleAgent)} is reviewing all 39 answers…</div>
      <div style="font-size:13px;color:var(--ink-soft);">Looking for repeated themes across space, time, energy, money, thought, and goals.</div>
    </div>`;
  } else if(state.analysisError){
    body = `
    <div class="card error-card" role="alert">
      <div class="title">Analysis failed</div>
      <p>${escapeHtml(state.analysisError)}</p>
      <button class="btn btn-primary" type="button" data-action="retry-analysis">Retry</button>
    </div>`;
  } else if(state.analysis){
    const a = state.analysis;
    body = `
    <div id="analysis-report">
      <div class="card statement-card fade-in">
        <span class="badge badge-navy">Personal Values Statement</span>
        <p style="margin-top:10px;">${escapeHtml(a.valuesStatement || '')}</p>
      </div>

      <div class="grid-3" style="margin-bottom:20px;">
        ${(a.topValues || []).map((v, i) => `
          <div class="card value-card">
            <div class="eyebrow">Top Value ${i+1}</div>
            <h3>${escapeHtml(v.name)}</h3>
            <span class="badge ${v.confidenceLevel==='strong' ? 'badge-teal' : v.confidenceLevel==='moderate' ? 'badge-gold' : 'badge-navy'}" style="margin-bottom:10px;">${escapeHtml(v.confidenceLevel)} evidence</span>
            <p class="evidence"><strong>Evidence:</strong> ${escapeHtml(v.evidence)}</p>
          </div>`).join('')}
      </div>

      <div class="card list-card" style="margin-bottom:20px;">
        <h4>Supporting Values</h4>
        <div class="tag-list">
          ${(a.supportingValues || []).map(v => `<span class="badge badge-navy">${escapeHtml(v.name)} · ${escapeHtml(v.confidenceLevel)}</span>`).join('')}
        </div>
      </div>

      <div class="grid-2">
        ${listSection('Repeated Themes', a.repeatedThemes)}
        ${listSection('Behavioural Patterns', a.behaviouralPatterns)}
        ${listSection('Where Your Time Goes', a.timeAreas)}
        ${listSection('Where Your Energy Goes', a.energyAreas)}
        ${listSection('Where Your Money Goes', a.moneyAreas)}
        ${listSection('Sources of Inspiration', a.inspirationSources)}
        ${listSection('Long-Term Goals', a.longTermGoals)}
        ${listSection('Learning Interests', a.learningInterests)}
        ${listSection('Possible Conflicts', a.possibleConflicts)}
        ${listSection('Personal Strengths', a.personalStrengths)}
        ${listSection('Recommended Development Areas', a.developmentAreas)}
        ${listSection('Recommended Next Steps', a.recommendedNextSteps)}
      </div>
      <p class="analysis-disclaimer">AI-generated results are guidance and should be reviewed by you before making important personal, career, financial, or business decisions.</p>
    </div>

    <div class="btn-row no-print" style="margin-top:20px;">
      <button class="btn btn-ghost" type="button" data-action="download-report">Download Report</button>
      <button class="btn btn-ghost" type="button" data-action="print-report">Print Report</button>
      <button class="btn btn-ghost" type="button" data-action="regenerate-analysis">Regenerate Analysis</button>
    </div>
    `;
  }

  return `
  ${topbar('dashboard')}
  <main id="main" class="fade-in shell" style="padding:32px 0 90px;">
    <button class="btn btn-ghost no-print" type="button" data-action="go" data-view="dashboard" style="margin-bottom:18px;">← Back to dashboard</button>
    <span class="badge badge-teal">${escapeHtml(roleAgent)}</span>
    <h1 style="font-size:26px;color:var(--navy);margin:12px 0 20px;">Your Values Analysis</h1>
    ${body}
  </main>
  ${siteFooter()}`;
}

function listSection(title, items){
  if(!items || !items.length) return '';
  return `<div class="card list-card">
    <h4>${escapeHtml(title)}</h4>
    <ul>${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
  </div>`;
}

function downloadReport(){
  const a = state.analysis;
  if(!a) return;
  const roleLabel = ROLE_META[state.role].label;
  const sections = [
    ['Repeated Themes', a.repeatedThemes], ['Behavioural Patterns', a.behaviouralPatterns],
    ['Where Time Goes', a.timeAreas], ['Where Energy Goes', a.energyAreas], ['Where Money Goes', a.moneyAreas],
    ['Sources of Inspiration', a.inspirationSources], ['Long-Term Goals', a.longTermGoals],
    ['Learning Interests', a.learningInterests], ['Possible Conflicts', a.possibleConflicts],
    ['Personal Strengths', a.personalStrengths], ['Recommended Development Areas', a.developmentAreas],
    ['Recommended Next Steps', a.recommendedNextSteps],
  ];
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CFF Values Report — ${escapeHtml(state.user.name)}</title>
  <style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;color:#1a2238;padding:0 20px;}
  h1{color:#14213d;} h2{color:#14213d;font-size:18px;border-bottom:1px solid #e3e6ea;padding-bottom:6px;margin-top:28px;}
  .val{margin-bottom:14px;} .val b{color:#1f9e8e;} ul{line-height:1.7;}</style></head><body>
  <h1>CFF Values Analysis — ${escapeHtml(state.user.name)}</h1>
  <p><em>${escapeHtml(roleLabel)} · Generated ${new Date().toLocaleDateString()}</em></p>
  <h2>Personal Values Statement</h2><p>${escapeHtml(a.valuesStatement)}</p>
  <h2>Top Values</h2>
  ${(a.topValues||[]).map(v => `<div class="val"><b>${escapeHtml(v.name)}</b> (${escapeHtml(v.confidenceLevel)} evidence)<br>${escapeHtml(v.evidence)}</div>`).join('')}
  <h2>Supporting Values</h2>
  <ul>${(a.supportingValues||[]).map(v => `<li>${escapeHtml(v.name)} — ${escapeHtml(v.confidenceLevel)}: ${escapeHtml(v.evidence)}</li>`).join('')}</ul>
  ${sections.filter(([,items]) => items && items.length).map(([title, items]) => `<h2>${escapeHtml(title)}</h2><ul>${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`).join('')}
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `CFF-Values-Report-${state.user.name.replace(/\s+/g,'-')}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------- */
/* View: Settings                                                          */
/* ---------------------------------------------------------------------- */

function viewSettings(){
  return `
  ${topbar('settings')}
  <main id="main" class="fade-in shell" style="padding:36px 0 90px;max-width:520px;">
    <h1 style="font-size:24px;color:var(--navy);margin-bottom:20px;">Account Settings</h1>
    <div class="card" style="padding:24px;margin-bottom:16px;">
      <div class="settings-row">Member ID</div>
      <div class="settings-value">${escapeHtml(state.user.id || '—')}</div>
      <div class="settings-row">Name</div>
      <div class="settings-value">${escapeHtml(state.user.name)}</div>
      <div class="settings-row">Phone Number</div>
      <div class="settings-value">${escapeHtml(state.user.phone || '—')}</div>
      <div class="settings-row">Email</div>
      <div class="settings-value">${escapeHtml(state.user.email)}</div>
      ${state.user.company ? `<div class="settings-row">Company</div><div class="settings-value">${escapeHtml(state.user.company)}</div>` : ''}
      ${state.user.jobTitle ? `<div class="settings-row">Job Title</div><div class="settings-value">${escapeHtml(state.user.jobTitle)}</div>` : ''}
      <div class="settings-row">Profile Type</div>
      <div class="settings-value" style="margin-bottom:0;">${escapeHtml(ROLE_META[state.role].label)}</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost" type="button" data-action="logout">Log Out</button>
      <button class="btn btn-danger-ghost" type="button" data-action="clear-data">Clear All Saved Data</button>
    </div>
  </main>
  ${siteFooter()}`;
}

function clearAllData(){
  if(!window.confirm('This will permanently delete your saved answers, analysis, and account details from this browser. This cannot be undone. Continue?')) return;
  clearState();
  cancelActiveRequest();
  state = freshState();
  render();
  showToast('All saved data cleared.', 'teal');
}

/* ========================================================================
   EVENT DELEGATION
   ======================================================================== */

document.addEventListener('DOMContentLoaded', boot);

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if(!target) return;
  const action = target.dataset.action;

  switch(action){
    case 'select-role':
      state.role = target.dataset.role;
      go('auth');
      break;
    case 'go': {
      const view = target.dataset.view;
      if((state.view === 'values') && view !== 'values' && !confirmLeaveAssessmentIfNeeded()) return;
      if(target.dataset.stubTitle) state.stubTitle = target.dataset.stubTitle;
      go(view);
      break;
    }
    case 'toggle-nav':
      state.navOpen = !state.navOpen;
      render();
      break;
    case 'logout':
      if(window.confirm('Log out? Your saved progress will remain in this browser.')) logout();
      break;
    case 'jump-question':
      jumpQuestion(Number(target.dataset.idx));
      break;
    case 'nav-prev':
      navQuestion(-1);
      break;
    case 'nav-next':
      navQuestion(1);
      break;
    case 'clear-answer':
      clearAnswer(Number(target.dataset.qn), Number(target.dataset.idx));
      break;
    case 'save-exit':
      saveAndExit();
      break;
    case 'go-review':
      go('values-summary');
      break;
    case 'generate-analysis':
    case 'regenerate-analysis':
      if(action === 'regenerate-analysis' && !window.confirm('Regenerate your analysis? This will replace the current results.')) return;
      generateAnalysis();
      break;
    case 'retry-analysis':
      generateAnalysis();
      break;
    case 'download-report':
      downloadReport();
      break;
    case 'print-report':
      window.print();
      break;
    case 'clear-data':
      clearAllData();
      break;
  }
});

document.addEventListener('input', (e) => {
  const target = e.target.closest('[data-action="answer-input"]');
  if(!target) return;
  updateAnswerLive(Number(target.dataset.qn), Number(target.dataset.idx), target.value);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('#signup-form');
  if(!form) return;
  e.preventDefault();
  handleSignupSubmit(form);
});

/* ========================================================================
   BOOT
   ======================================================================== */

function boot(){
  const saved = loadState();
  if(saved && saved.user && saved.role){
    state = Object.assign(freshState(), saved, { view: 'dashboard' });
  }
  render();
}

// Expose go() for cases where render() is called before DOMContentLoaded fires in some browsers.
window.__cffGo = go;
