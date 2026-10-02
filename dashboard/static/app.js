'use strict';
let state = null;
let currentView = 'overview';
let reviewedRelease = null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {research:'Research',building:'Building',qa:'Quality checks',review:'Your review',maintenance:'Maintenance',awaiting_review:'Awaiting review',approved:'Approved · not submitted',changes_requested:'Fixes requested',superseded:'Superseded'};
const gates = {automated_tests:'Automated tests',android_device:'Android device test',ios_device:'iOS device test',save_migration:'Save migration',performance:'Performance',privacy_ads:'Privacy & advertising',license_review:'License review',launch_materials:'Launch materials'};
const pages = {overview:['Studio overview','A clear view of what is building, what needs care, and what is ready for you.'],portfolio:['Game portfolio','Original games, separate repositories, one shared standard of quality.'],releases:['Release reviews','Inspect the exact builds and evidence before you authorize a release.'],maintenance:['Keep the games growing','Reserved capacity and a 30-day update target for every released title.'],activity:['Activity log','A traceable record of incoming candidates and your release decisions.']};
const initials = (title) => title.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('');
const badge = (text, cls='neutral') => `<span class="badge ${cls}">${esc(text)}</span>`;
const art = (title,i=0) => `<div class="game-art art-${i%5}" aria-hidden="true">${esc(initials(title))}</div>`;
const empty = (heading,body) => `<div class="empty-state"><strong>${esc(heading)}</strong>${esc(body)}</div>`;

async function api(path, options={}) {
  const headers = {...options.headers};
  if (options.method && options.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if(state) headers['X-CSRF-Token'] = state.csrf;
  }
  const response = await fetch(path, {...options, headers, credentials:'same-origin'});
  if (response.status === 401) { window.location.assign('/login'); throw new Error('Your session expired. Sign in again.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error(`Request failed (${response.status}).`); }
  if (!response.ok) {
    const message = typeof data.detail === 'string' ? data.detail : 'Check the form fields and try again.';
    throw new Error(message);
  }
  return data;
}
function toast(message) {const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,6500);}
function errorAt(selector,message) {const el=$(selector);el.textContent=message;el.hidden=!message;}
function navigate() {
  currentView=location.hash.slice(1);
  if(!pages[currentView]) currentView='overview';
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${currentView}`);
  document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===currentView;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#page-title').textContent=pages[currentView][0];$('#page-subtitle').textContent=pages[currentView][1];
  $('#breadcrumb-title').textContent={overview:'Overview',portfolio:'Game portfolio',releases:'Release reviews',maintenance:'Maintenance',activity:'Activity log'}[currentView];
}
function reviewRow(r,i) {
  const gateBadge=r.gates_pass?badge('QA gates passed','pass'):badge('Approval blocked','fail');
  return `<article class="review-row">${art(r.title,i)}<div class="review-meta"><h3>${esc(r.title)}</h3><p>v${esc(r.version)} · Android + iOS</p></div><div class="review-right">${gateBadge}<button class="button" data-action="review" data-id="${esc(r.id)}">Review build ↗</button></div></article>`;
}
function maintenanceRows() {
  const items=state.projects.filter(x=>x.next_update_at).sort((a,b)=>a.next_update_at.localeCompare(b.next_update_at));
  if(!items.length) return empty('No update deadlines yet','Schedules will start after real releases have been confirmed. The store connector is not implemented yet.');
  return items.map(p=>{
    const date=new Date(p.next_update_at+'T12:00:00Z');
    const days=Math.ceil((date-new Date())/86400000);
    const due=days<0?`${Math.abs(days)}d overdue`:days===0?'Due today':`In ${days} days`;
    return `<div class="maintenance-row"><div class="calendar-tile"><strong>${date.getUTCDate()}</strong><small>${date.toLocaleDateString('en',{month:'short',timeZone:'UTC'})}</small></div><div class="maintenance-name"><strong>${esc(p.title)}</strong><p>${state.mode==='demo'?'Sample schedule':'Update target'} · ${esc(p.next_update_at)}</p></div>${badge(due,days<0?'fail':days<8?'pending':'neutral')}</div>`;
  }).join('');
}
function activityRows(limit) {
  if(!state.events.length)return empty('No recorded activity','Incoming candidate manifests and owner decisions will appear here.');
  return state.events.slice(0,limit).map(e=>`<div class="activity-row"><span class="activity-dot"></span><div><p><strong>${esc(e.action.replaceAll('_',' '))}</strong> · ${esc(e.subject)}</p><small>${esc(new Date(e.time).toLocaleString())} · ${esc(e.actor)} · #${e.seq}</small>${e.detail.note?`<p>${esc(e.detail.note)}</p>`:''}</div></div>`).join('');
}
function renderProjects() {
  const query=$('#project-search').value.toLowerCase();
  const projects=state.projects.filter(p=>[p.title,p.category,p.summary].join(' ').toLowerCase().includes(query));
  $('#portfolio-grid').innerHTML=projects.map((p,i)=>`<article class="portfolio-card">${art(p.title,i)}<div>${badge(p.category)}<h3>${esc(p.title)}</h3></div><p>${esc(p.summary)}</p><div class="card-foot">${badge(labels[p.stage]||p.stage,'pass')}<span>${esc(p.slug)}</span></div></article>`).join('')||empty('No matching projects','Create an original game brief or change the search.');
}
function render() {
  const demo=state.mode==='demo';
  $('#demo-banner').hidden=!demo;$('#mode-pill').textContent=demo?'LOCAL DEMO':'OWNER WORKSPACE';
  $('#owner-name').textContent=state.owner;$('#date').textContent=new Date().toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'});
  const pending=state.releases.filter(r=>r.status==='awaiting_review');
  const blocked=pending.filter(r=>!r.gates_pass).length;
  $('#nav-reviews').textContent=pending.length;
  const stats=[['Active projects',state.projects.length,'Portfolio records','▦',''],['Awaiting review',pending.length,'Your single approval gate','↗','accent'],['Blocked candidates',blocked,'Must return to development','◇',''],['Update windows',state.projects.filter(p=>p.next_update_at).length,'30-day maintenance target','◷','']];
  $('#metrics').innerHTML=stats.map(([t,n,f,i,c])=>`<article class="metric ${c}"><div class="metric-top"><span>${t}</span><span class="metric-icon">${i}</span></div><div class="metric-number">${n.toString().padStart(2,'0')}</div><div class="metric-foot">${f}</div></article>`).join('');
  $('#review-list').innerHTML=pending.slice(0,3).map(reviewRow).join('')||empty('No candidates awaiting review','Agents can submit a candidate once both platform builds and QA evidence are ready.');
  $('#connections').innerHTML=[['◇','Claude / Mac workers','Not connected'],['⌘','GitHub repository sync','Not connected'],['↗','App Store + Play Store','Not connected'],['⇄','Candidate intake',state.integrations.agent_intake?'Configured · token protected':'Disabled in demo']].map(([i,n,s])=>`<div class="connection"><span><b class="connection-icon">${i}</b>${n}</span><span class="connection-status">${s}</span></div>`).join('');
  $('#pipeline').innerHTML=['research','building','qa','review','maintenance'].map(stage=>{
    const ps=state.projects.filter(p=>p.stage===stage);
    return `<div class="pipeline-column"><div class="column-heading"><span class="dot"></span>${labels[stage]}<small>${ps.length.toString().padStart(2,'0')}</small></div>${ps.map(p=>`<div class="pipeline-chip">${esc(p.title)}<small>${esc(p.category)}</small></div>`).join('')||'<p class="column-empty">No projects here</p>'}</div>`;
  }).join('');
  $('#maintenance-preview').innerHTML=maintenanceRows();$('#maintenance-full').innerHTML=maintenanceRows();
  $('#activity-preview').innerHTML=activityRows(3);$('#activity-full').innerHTML=activityRows(60);
  $('#audit-status').textContent=state.audit_chain_valid?'Hash chain verified':'Integrity check failed';$('#audit-status').className='badge '+(state.audit_chain_valid?'pass':'fail');
  $('#release-grid').innerHTML=state.releases.map((r,i)=>`<article class="portfolio-card">${art(r.title,i)}<div>${badge(labels[r.status]||r.status,r.status==='approved'?'pass':r.status==='changes_requested'?'fail':'neutral')}<h3>${esc(r.title)}</h3></div><p>Version ${esc(r.version)} · Android + iOS<br>${r.gates_pass?'All required evidence is marked passed.':'QA evidence is incomplete or contains failures.'}</p><div class="manifest-fingerprint">Manifest ${esc(r.manifest_hash.slice(0,24))}…</div><button class="button ${r.status==='awaiting_review'?'primary':''}" data-action="review" data-id="${esc(r.id)}">${r.status==='awaiting_review'?'Review candidate':'View record'} ↗</button></article>`).join('')||empty('No release candidates yet','The agent intake API accepts immutable manifests. No release can publish from this dashboard version.');
  renderProjects();
}
async function refresh(){state=await api('/api/state');errorAt('#page-error','');render();}
function openReview(id) {
  const r=state.releases.find(x=>x.id===id);if(!r)return;
  reviewedRelease=structuredClone(r);
  const m=r.manifest,demo=state.mode==='demo',waiting=r.status==='awaiting_review';
  $('#release-dialog-content').innerHTML=`<div class="dialog-header"><div><div class="eyebrow">${demo?'DEMO REVIEW · NO REAL BUILD':'OWNER RELEASE CHECKPOINT'}</div><h2 id="release-dialog-title">${esc(r.title)}</h2><p class="subtle">Version ${esc(r.version)} · Android + iOS · ${esc(labels[r.status])}</p></div><button class="icon-button close-button" data-action="close-review" aria-label="Close release review">×</button></div><div class="dialog-body"><div class="dialog-summary">${badge(r.gates_pass?'All QA gates marked passed':'QA blocks approval',r.gates_pass?'pass':'fail')}${badge('Store submission not connected','neutral')}<a class="text-link" href="/api/releases/${encodeURIComponent(r.id)}/manifest" download>Export exact manifest ↓</a></div><div class="manifest-fingerprint">Commit: ${esc(m.commit)}<br>Manifest SHA-256: ${esc(r.manifest_hash)}</div><section class="dialog-section"><h3>What changed</h3><p>${esc(m.release_notes)}</p></section><section class="dialog-section"><h3>Review both platform builds</h3><div class="build-grid">${m.artifacts.map(a=>`<article class="build-card"><strong>${a.platform==='android'?'Android':'iOS'} · ${esc(a.label)}</strong><p>${esc(a.installation_notes)}</p><code>SHA-256 ${esc(a.sha256)}</code>${demo?'<span class="badge pending">Sample reference · not installable</span>':`<a class="text-link" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Open private build reference ↗</a>`}</article>`).join('')}</div></section><section class="dialog-section"><h3>Quality evidence · ${m.evidence.length} required checks</h3><table class="evidence-table"><thead><tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col">Evidence summary</th></tr></thead><tbody>${m.evidence.map(e=>`<tr><td>${esc(gates[e.gate])}</td><td>${badge(e.status,e.status)}</td><td>${esc(e.summary)}${demo?'':`<a class="text-link" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Inspect evidence ↗</a>`}</td></tr>`).join('')}</tbody></table></section><section class="dialog-section"><h3>Known issues · ${m.blocking_issues} blocking</h3><p>${m.known_issues.length?m.known_issues.map(esc).join('\n'):'No issues were declared. Verify the evidence before approval.'}</p></section><section class="dialog-section"><h3>Launch materials</h3><p>${esc(m.launch_summary)}</p></section>${waiting?`<form id="decision-form" class="review-form"><h3>${demo?'Try the review workflow':'Your release decision'}</h3><p class="subtle">${demo?'Demo checkboxes simulate review only. They do not claim you played a real game.':'Approval covers only the immutable manifest above. It does not authorize changed builds or future updates.'}</p><br><label class="check-label"><input type="checkbox" id="attest-play">${demo?'Simulate':'I completed'} hands-on playtesting of both Android and iOS builds.</label><label class="check-label"><input type="checkbox" id="attest-evidence">${demo?'Simulate':'I completed'} review of QA evidence, known issues, and launch materials.</label><label>Type <code>APPROVE ${esc(r.version)}</code> to approve<input id="confirmation" autocomplete="off" placeholder="APPROVE ${esc(r.version)}" maxlength="100"></label><label>Review notes / requested fixes<textarea id="review-note" rows="3" maxlength="2000" placeholder="Describe changes clearly. At least 10 characters required when requesting fixes."></textarea></label><div id="decision-error" class="inline-error" role="alert" hidden></div><div class="dialog-actions"><button type="button" class="button danger" data-action="request-changes">Request fixes</button><button type="submit" class="button primary" ${!r.gates_pass?'disabled':''}>${demo?'Record demo approval':'Approve exact release'}</button></div></form>`:`<div class="quiet-note">This candidate is ${esc(labels[r.status])}. ${esc(r.decision_note||'')}<br>No store upload has occurred through this application.</div>`}</div>`;
  $('#release-dialog').showModal();$('#release-dialog').scrollTop=0;
}
async function decide(action) {
  if(!reviewedRelease)return;
  const buttons=$('#release-dialog').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
  try {
    const result=await api(`/api/releases/${encodeURIComponent(reviewedRelease.id)}/decision`,{method:'POST',body:JSON.stringify({manifest_hash:reviewedRelease.manifest_hash,action,confirmation:$('#confirmation').value,note:$('#review-note').value,attest_playtested_both:$('#attest-play').checked,attest_reviewed_evidence:$('#attest-evidence').checked})});
    $('#release-dialog').close();reviewedRelease=null;await refresh();toast(result.message);
  } catch(e) {
    errorAt('#decision-error',e.message);buttons.forEach(b=>b.disabled=false);
    if(reviewedRelease&&!reviewedRelease.gates_pass)$('#decision-form button[type=submit]').disabled=true;
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  switch(button.dataset.action){
    case'review':openReview(button.dataset.id);break;
    case'close-review':$('#release-dialog').close();reviewedRelease=null;break;
    case'new-project':$('#project-form').reset();errorAt('#project-error','');$('#project-dialog').showModal();break;
    case'close-project':$('#project-dialog').close();break;
    case'request-changes':decide('request_changes');break;
  }
});
document.addEventListener('submit',event=>{if(event.target.id==='decision-form'){event.preventDefault();decide('approve');}});
$('#project-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;const button=form.querySelector('button[type=submit]');button.disabled=true;
  try{await api('/api/projects',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});$('#project-dialog').close();await refresh();toast('Project record created. No repository or agent job was started.');}catch(e){errorAt('#project-error',e.message);}finally{button.disabled=false;}
});
$('#project-search').addEventListener('input',()=>state&&renderProjects());
$('#logout').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST'});window.location.assign('/login');}catch(e){toast(e.message);}});
$('#release-dialog').addEventListener('cancel',()=>reviewedRelease=null);
window.addEventListener('hashchange',navigate);
navigate();refresh().catch(e=>errorAt('#page-error',e.message));
setInterval(()=>{if(!document.hidden&&!$('#release-dialog').open&&!$('#project-dialog').open)refresh().catch(e=>errorAt('#page-error',e.message));},30000);
