/* ── KAI — Knowledge Action Intelligence ── */
/* app.js — main application logic, Phase C refactor */
/* Depends on: utils.js (loaded first) */

const CLIENT_ID = '61547713726-04f7c0c7i54l3rbiovf260gm2r7prml1.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file';
const REDIRECT_URI = 'https://kishore510.github.io/kai-demo';
const WORKER_URL = 'https://kai-demo-proxy.kishore510.workers.dev';

let accessToken = null;
let gmailData = [];
let calendarData = [];
let chatHistory = [];
let selectedEmailId = null;
let activeFilters = new Set(); // empty = show all
let currentMeeting = null;
let prepChatHistory = [];

// ── AUTH ──

function startAuth() {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: SCOPES,
    prompt: 'consent',
    login_hint: 'kai.demo.assistant@gmail.com'
  });
  window.location = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

function signOut() {
  accessToken = null;
  sessionStorage.clear();
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
}

// Handles the OAuth implicit flow callback — token arrives in the URL hash
async function handleCallback() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (!token) return false;
  // Clear the token from the URL so it's not visible or re-processed
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  accessToken = token;
  // Try to get the user's email to display
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const info = await r.json();
    if (info.email) sessionStorage.setItem('userEmail', info.email);
  } catch(e) { /* non-fatal */ }
  sessionStorage.setItem('token', token);
  return true;
}

// Check token validity silently — does NOT show the expired banner unless called directly
async function checkTokenValid() {
  if (!accessToken) return false;
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (r.status === 401) {
      accessToken = null;
      sessionStorage.removeItem('token');
      return false;
    }
    return true;
  } catch(e) {
    return false;
  }
}

function showTokenExpiredBanner() {
  if (document.getElementById('tokenBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'tokenBanner';
  banner.style.cssText = 'position:fixed;top:52px;left:0;right:0;z-index:500;background:#FAEEDA;border-bottom:1px solid #F5D38A;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:#854F0B;';
  banner.innerHTML = `
    <span>⚠️ Your session has expired — please reconnect</span>
    <button onclick="reAuth()" style="background:#BA7517;color:white;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;">Refresh session</button>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#BA7517;padding:0 4px;">×</button>
  `;
  document.body.appendChild(banner);
}

function reAuth() {
  sessionStorage.removeItem('token');
  startAuth();
}

// Periodic token check — only fires if app is loaded and token is set
setInterval(async () => {
  if (accessToken) {
    const valid = await checkTokenValid();
    if (!valid) showTokenExpiredBanner();
  }
}, 45 * 60 * 1000);

// ── GMAIL ──

async function fetchEmails() {
  if (typeof DEMO_MODE !== 'undefined' && DEMO_MODE) return getMockEmails();
  const r = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&labelIds=INBOX',
    { headers: { Authorization: 'Bearer ' + accessToken } }
  );
  if (r.status === 401) { showTokenExpiredBanner(); return []; }
  const d = await r.json();
  if (!d.messages) return [];
  const msgs = await Promise.all(d.messages.slice(0, 10).map(m =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { Authorization: 'Bearer ' + accessToken } }).then(r => r.json())
  ));
  return msgs.map(parseEmail);
}

function parseEmail(msg) {
  const h = msg.payload?.headers || [];
  const get = (name) => h.find(x => x.name.toLowerCase() === name.toLowerCase())?.value || '';
  const isUnread = msg.labelIds?.includes('UNREAD');
  const from = get('From');
  const fromName = from.replace(/<.*>/, '').trim().replace(/"/g, '') || from;
  const fromEmail = (from.match(/<(.+)>/) || [, ''])[1] || from;
  const subject = get('Subject') || '(no subject)';
  const date = get('Date');
  const snippet = msg.snippet || '';

  let priority = 'normal';
  const fl = fromEmail.toLowerCase();
  const sl = subject.toLowerCase();
  if (fl.includes('sarah.chen') || fl.includes('director') || sl.includes('urgent')) priority = 'urgent';
  else if (fl.includes('marcus.webb') || fl.includes('james.thornton') || fl.includes('cto') || fl.includes('head of risk')) priority = 'high';
  else if (fl.includes('priya') || fl.includes('programme')) priority = 'high';
  else if (fl.includes('helpdesk') || fl.includes('noreply') || fl.includes('newsletter')) priority = 'fyi';

  let body = '';
  const extractBody = (part) => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      try { body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch(e) {}
    }
    if (part.parts) part.parts.forEach(extractBody);
  };
  extractBody(msg.payload || {});

  const timeAgo = () => {
    const sent = new Date(date);
    const diff = (Date.now() - sent) / 3600000;
    if (diff < 1) return 'Just now';
    if (diff < 24) return Math.floor(diff) + 'h ago';
    return Math.floor(diff / 24) + 'd ago';
  };

  return { id: msg.id, from: fromName.trim(), fromEmail, subject, snippet, body: body || snippet, time: timeAgo(), priority, unread: isUnread };
}

// ── CALENDAR ──

async function fetchCalendar() {
  if (typeof DEMO_MODE !== 'undefined' && DEMO_MODE) return getMockCalendarEvents();
  // Anchor to Monday 00:00 of current week so earlier days are included
  const weekStart = getWeekStart(todayStr(), 0);
  const timeMin = new Date(weekStart + 'T00:00:00').toISOString();
  const timeMax = new Date(weekStart + 'T00:00:00');
  timeMax.setDate(timeMax.getDate() + 7);
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=50`,
    { headers: { Authorization: 'Bearer ' + accessToken } }
  );
  if (r.status === 401) { showTokenExpiredBanner(); return []; }
  return (await r.json()).items || [];
}

// ── RENDER ──


// Returns YYYY-MM-DD for today in local time


function renderEventRow(ev) {
  const t = getTime(ev);
  const s = ev.summary || '';
  const isClashing = clashedEventIds.has(ev.id);
  let tagClass = 'reply', tagLabel = t || '';
  const isSkip = s.includes('Transit') || s.includes('KAI Timecode');
  if (s.includes('FOCUS') || s.includes('PREP')) { tagClass = 'focus'; tagLabel = s.includes('PREP') ? 'PREP' : 'FOCUS'; }
  else if (isClashing || s.includes('CLASH') || s.toLowerCase().includes('clash')) { tagClass = 'clash'; tagLabel = 'CLASH'; }
  else if (s.includes('TRAVEL') || s.includes('Transit')) { tagClass = 'travel'; tagLabel = 'TRAVEL'; }
  const displayName = s.replace(/\s*\(.*?\)\s*/g, '').replace(/^(FOCUS|PREP|TRAVEL):\s*/, '').substring(0, 52);
  const evIdx = calendarData.findIndex(e => e.id === ev.id);
  const clickable = !isSkip;
  const clashAttr = isClashing ? `data-clash="true"` : '';
  return `<div class="day-item ${clickable ? 'meeting-clickable' : ''} ${isClashing ? 'clash-row' : ''}" ${clashAttr} ${clickable ? `onclick="openMeetingPrep(${evIdx})" style="cursor:pointer"` : ''} title="${clickable ? 'Click to prep for this meeting' : ''}">
    <span class="tag ${tagClass}">${tagLabel}</span>
    <span style="flex:1">${displayName}</span>
    ${clickable ? '<span style="font-size:10px;color:#ccc;margin-left:4px">›</span>' : ''}
  </div>`;
}

function renderToday(events) {
  const today = todayStr();
  const todayEvs = events.filter(ev => {
    const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    return d === today;
  });

  // Update the date label
  const lbl = document.getElementById('todayDateLabel');
  if (lbl) lbl.textContent = formatFullDate(today);

  // Update greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const titleEl = document.getElementById('briefingTitle');
  if (titleEl) titleEl.textContent = `${greeting} — here's your week`;

  if (!todayEvs.length) {
    return '<div style="padding:14px 14px;font-size:12px;color:var(--muted)">No meetings today.</div>';
  }

  return todayEvs.map(ev => renderEventRow(ev)).join('');
}

function renderWeekAhead(events) {
  const today = todayStr();
  const days = {};
  events.forEach(ev => {
    const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    if (!d || d === today) return; // today handled separately
    if (!days[d]) days[d] = [];
    days[d].push(ev);
  });

  const sorted = Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(0, 5);
  if (!sorted.length) return '<div style="padding:16px;font-size:12px;color:var(--muted)">No further events this week.</div>';

  return sorted.map(([date, evs]) => {
    const dayName = getDayName(date);
    const items = evs.map(ev => renderEventRow(ev)).join('');
    return `<div class="day-row"><div class="day-nm">${dayName}</div><div class="day-items">${items}</div></div>`;
  }).join('');
}

function analyseBriefing(emails, events) {
  const urgentCount = emails.filter(e => e.priority === 'urgent' || e.priority === 'high').length;
  const unreadCount = emails.filter(e => e.unread).length;
  document.getElementById('statEmails').textContent = unreadCount;

  // Count clashes and store clashing event IDs — future events only
  const now = new Date();
  const byDay = {};
  events.forEach(ev => {
    const d = ev.start?.dateTime?.split('T')[0];
    // Skip events that have already ended
    if (ev.end?.dateTime && new Date(ev.end.dateTime) < now) return;
    if (d) { if (!byDay[d]) byDay[d] = []; byDay[d].push(ev); }
  });
  let clashes = 0;
  clashedEventIds = new Set();
  clashDayDate = null;
  Object.entries(byDay).forEach(([date, dayEvs]) => {
    for (let i = 0; i < dayEvs.length; i++) {
      for (let j = i + 1; j < dayEvs.length; j++) {
        const e1 = new Date(dayEvs[i].end?.dateTime);
        const s2 = new Date(dayEvs[j].start?.dateTime);
        if (s2 < e1) {
          clashes++;
          clashedEventIds.add(dayEvs[i].id);
          clashedEventIds.add(dayEvs[j].id);
          if (!clashDayDate) clashDayDate = date;
        }
      }
    }
  });
  document.getElementById('statClashes').textContent = clashes;
  const resolveBtn = document.getElementById('resolveBtn');
  const clashArrow = document.getElementById('clashArrow');
  if (resolveBtn) resolveBtn.style.display = clashes > 0 ? 'block' : 'none';
  if (clashArrow) clashArrow.style.display = clashes > 0 ? 'none' : 'block';

  // Wellbeing
  let heavyDay = '';
  Object.entries(byDay).forEach(([d, evs]) => {
    if (evs.length >= 5) heavyDay = getDayName(d);
  });
  document.getElementById('statWellbeing').textContent = heavyDay || '–';

  // Wellbeing nudges
  const nudges = [];
  Object.entries(byDay).forEach(([d, evs]) => {
    if (evs.length >= 5) {
      const dayName = getDayName(d);
      nudges.push({
        level: '#dd3333',
        text: `<b>${dayName} looks intense</b> — ${evs.length} meetings detected.`,
        action: { label: '📅 Block lunch slot', date: d, time: '13:00', dur: 30, title: `LUNCH: Protected on ${dayName}` }
      });
    }
  });
  if (emails.filter(e => e.unread && (e.priority === 'urgent' || e.priority === 'high')).length > 2)
    nudges.push({ level: '#ddaa00', text: `<b>Multiple high-priority unread emails.</b> Recommend addressing these before your first meeting.` });
  nudges.push({ level: '#22aa55', text: `<b>Timecodes ready</b> — KAI has matched this week's meetings to PRJ-042, GOV-011 and BAU-001.` });

  document.getElementById('wellbeingNudges').innerHTML = nudges.slice(0, 3).map(n => {
    const btnHtml = n.action
      ? `<button class="kai-action-btn" style="margin-top:6px;font-size:10px;display:block" onclick="blockLunchSlot('${n.action.title}','${n.action.date}','${n.action.time}',${n.action.dur})">📅 Block lunch slot</button>`
      : '';
    return `<div class="wb-row"><div class="wb-dot" style="background:${n.level}"></div><div class="wb-txt">${n.text}${btnHtml}</div></div>`;
  }).join('');

  // Meeting hours this week
  const thisWeekStart = getWeekStart(todayStr(), 0);
  const thisWeekEnd = getWeekEnd(thisWeekStart);
  const weekEvs = events.filter(ev => {
    const d = ev.start?.dateTime?.split('T')[0];
    return d && d >= thisWeekStart && d <= thisWeekEnd && ev.start?.dateTime && ev.end?.dateTime;
  });
  const totalHrs = weekEvs.reduce((s, ev) => s + (new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 3600000, 0);
  const hrsEl = document.getElementById('statHrsNum');
  if (hrsEl) hrsEl.textContent = totalHrs.toFixed(1);

  detectSilence(emails);

  document.getElementById('briefingSub').textContent = `KAI analysed ${emails.length} emails and ${events.length} calendar events · Updated just now`;
  document.getElementById('pillStatus').textContent = `${urgentCount} urgent items need attention`;
}

// ── SILENCE DETECTOR ──


function detectSilence(emails) {
  const silent = emails
    .filter(e => !e.archived && (e.priority === 'urgent' || e.priority === 'high') && e.unread)
    .map(e => ({ ...e, tier: getSenderTier(e.from + ' ' + (e.fromEmail || '')), ageHours: getEmailAgeHours(e.time) }))
    .sort((a, b) => a.tier.rank - b.tier.rank || b.ageHours - a.ageHours);

  const stat = document.getElementById('statSilence');
  if (stat) stat.textContent = silent.length || '–';
  const list = document.getElementById('silenceList');
  const sub  = document.getElementById('silenceSubLabel');
  if (!list) return;
  if (sub) sub.textContent = silent.length > 0 ? silent.length + ' waiting' : 'All replied';
  if (!silent.length) {
    list.innerHTML = '<div style="padding:12px 13px;font-size:11px;color:var(--muted)">No urgent emails awaiting reply.</div>';
    return;
  }
  list.innerHTML = silent.slice(0, 5).map(e => {
    const ageLabel = e.ageHours >= 48 ? Math.round(e.ageHours/24)+'d' : Math.round(e.ageHours)+'h';
    const ageClass = e.ageHours >= 24 ? 'critical' : e.ageHours >= 8 ? 'warning' : 'normal';
    return '<div class="silence-item" onclick="goToEmailAndSelect(\'' + e.id + '\')">' +
      '<span class="silence-age ' + ageClass + '">' + ageLabel + '</span>' +
      '<span class="silence-tier">' + e.tier.label + '</span>' +
      '<div class="silence-body"><div class="silence-from">' + e.from + '</div><div class="silence-subj">' + e.subject + '</div></div>' +
      '<span class="silence-arrow">›</span></div>';
  }).join('');
}

function goToSilence() {
  const inboxNav = document.querySelector('.nav-item[data-panel="inbox"]');
  if (inboxNav) switchPanel(inboxNav);
  setTimeout(() => filterEmails('unread', null), 100);
}

function goToEmailAndSelect(emailId) {
  const inboxNav = document.querySelector('.nav-item[data-panel="inbox"]');
  if (inboxNav) switchPanel(inboxNav);
  filterEmails('all', null);
  setTimeout(() => selectEmail(emailId), 150);
}

// ── INBOX ──

function renderEmailList(customList = null) {
  let filtered;
  if (customList) {
    filtered = customList;
  } else if (activeFilters.size === 0) {
    // No filters active — show all
    filtered = gmailData;
  } else if (activeFilters.has('sender:')) {
    // Sender filter (set via KAI chat action) — find the sender value
    const senderFilter = [...activeFilters].find(f => f.startsWith('sender:'));
    const name = senderFilter ? senderFilter.slice(7).toLowerCase() : '';
    filtered = gmailData.filter(e => e.from.toLowerCase().includes(name) || e.fromEmail.toLowerCase().includes(name));
  } else {
    // Multi-select: each active filter is an OR on priority/unread
    // e.g. urgent+unread = emails that are urgent OR unread
    filtered = gmailData.filter(e => {
      if (activeFilters.has('unread') && e.unread) return true;
      if (activeFilters.has('urgent') && e.priority === 'urgent') return true;
      if (activeFilters.has('high') && e.priority === 'high') return true;
      if (activeFilters.has('normal') && e.priority === 'normal') return true;
      if (activeFilters.has('fyi') && e.priority === 'fyi') return true;
      return false;
    });
  }
  const priorityOrder = { urgent: 0, high: 1, normal: 2, fyi: 3 };
  const sorted = [...filtered].sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));
  const unreadCount = gmailData.filter(e => e.unread).length;
  document.getElementById('inboxBadge').textContent = unreadCount;
  const mobBadge = document.getElementById('mobInboxBadge');
  if (mobBadge) { mobBadge.textContent = unreadCount; mobBadge.style.display = unreadCount > 0 ? 'block' : 'none'; }

  document.getElementById('emailList').innerHTML = sorted.map(e => `
    <div class="email-item ${e.unread ? 'unread' : ''} ${selectedEmailId === e.id ? 'selected' : ''}" onclick="selectEmail('${e.id}')">
      <div class="e-meta"><span class="e-from">${e.from}</span><span class="e-time">${e.time}</span></div>
      <div class="e-subject">${e.subject}</div>
      <div class="e-preview">${e.snippet}</div>
      <div class="e-tags">
        <span class="pri ${e.priority}">${e.priority.toUpperCase()}</span>
        ${e.unread ? '<span class="pri unread">UNREAD</span>' : ''}
        ${shouldAutoArchive(e) ? '<span class="arch-badge">📋 ARCHIVE RECOMMENDED</span>' : ''}
        ${e.archived ? '<span class="arch-badge">🗄️ ARCHIVED</span>' : ''}
      </div>
    </div>
  `).join('') || '<div style="padding:20px;font-size:12px;color:var(--muted);text-align:center">No emails found</div>';
}

function filterEmails(f, btn) {
  if (f === 'all') {
    // All clears every active filter
    activeFilters.clear();
  } else if (f.startsWith('sender:')) {
    // Sender filter from KAI chat — exclusive, replaces everything
    activeFilters.clear();
    activeFilters.add(f);
  } else {
    // Toggle: clicking an active filter removes it; clicking All explicitly shows all
    if (activeFilters.has(f)) {
      activeFilters.delete(f);
    } else {
      activeFilters.add(f);
    }
  }

  // Sync button states
  document.getElementById('fbtnAll')?.classList.toggle('active', activeFilters.size === 0);
  document.getElementById('fbtnUrgent')?.classList.toggle('active', activeFilters.has('urgent'));
  document.getElementById('fbtnHigh')?.classList.toggle('active', activeFilters.has('high'));
  document.getElementById('fbtnUnread')?.classList.toggle('active', activeFilters.has('unread'));

  // Update label
  const lbl = document.getElementById('inboxFilterLabel');
  if (lbl) {
    if (activeFilters.size === 0) lbl.textContent = 'All emails';
    else if (f.startsWith('sender:')) lbl.textContent = 'From: ' + f.slice(7);
    else {
      const labels = [];
      if (activeFilters.has('urgent')) labels.push('Urgent');
      if (activeFilters.has('high')) labels.push('High');
      if (activeFilters.has('unread')) labels.push('Unread');
      lbl.textContent = labels.join(' + ') + ' emails';
    }
  }
  renderEmailList();
}

function selectEmail(id) {
  selectedEmailId = id;
  const email = gmailData.find(e => e.id === id);
  if (!email) return;
  renderEmailList();
  if (window.innerWidth <= 768) { document.getElementById('emailDetail').classList.add('mob-open'); }

  document.getElementById('emailDetail').innerHTML = `
    <div class="ed-hdr">
      <div class="ed-subject">${email.subject}</div>
      <div class="ed-meta"><b>${email.from}</b> &lt;${email.fromEmail}&gt;<br>${email.time}</div>
      <span class="pri ${email.priority}">${email.priority.toUpperCase()} PRIORITY</span>
    </div>
    <div class="ed-body"><div class="ed-text">${email.body || email.snippet}</div></div>
    <div class="ed-actions">
      <button class="btn btn-p" onclick="draftReply('${email.id}')">✨ KAI Draft Reply</button>
      <button class="btn btn-archive" id="archiveBtn-${email.id}" onclick="archiveEmail('${email.id}')">🗄️ Archive to Drive</button>
      <button class="btn btn-s">Reply</button>
      <button class="btn btn-s">Forward</button>
    </div>
    <div class="draft-area" id="draftArea" style="display:none">
      <div class="draft-lbl">✦ KAI Draft Reply</div>
      <div class="draft-txt" id="draftTxt"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-p" onclick="copyDraft()">Copy</button>
        <button class="btn btn-s" onclick="document.getElementById('draftArea').style.display='none'">Dismiss</button>
      </div>
    </div>
  `;
}

async function draftReply(emailId) {
  const email = gmailData.find(e => e.id === emailId);
  if (!email) return;
  const da = document.getElementById('draftArea');
  const dt = document.getElementById('draftTxt');
  da.style.display = 'block';
  dt.innerHTML = '<div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div>';

  const prompt = `You are a senior Enterprise Platform Architect at a UK financial services regulator. Draft a professional, direct reply to this email. Be concise. No sycophancy. Sign off with "Best regards," only.

From: ${email.from}
Subject: ${email.subject}
Message: ${email.body}

Write only the email body. No subject line.`;

  try {
    const reply = await callClaude(prompt, false);
    dt.textContent = reply;
  } catch(e) {
    dt.textContent = 'Unable to generate draft — check your Cloudflare Worker URL is configured.';
  }
}

function copyDraft() {
  navigator.clipboard.writeText(document.getElementById('draftTxt').textContent);
  event.target.textContent = 'Copied!';
  setTimeout(() => { if (event.target) event.target.textContent = 'Copy'; }, 1800);
}

// ── CLAUDE ──

function buildKaiSystem() {
  const now = new Date();
  const today = todayStr();
  const todayFormatted = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeNow = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const urgent = gmailData.filter(e => e.priority === 'urgent');
  const unread = gmailData.filter(e => e.unread);

  const emailSummary = gmailData.slice(0, 8).map(e =>
    `- [${e.priority.toUpperCase()}] From: ${e.from} | Subject: ${e.subject} | ${e.unread ? 'UNREAD' : 'read'} | Received: ${e.time}`
  ).join('\n');

  // Split calendar into today vs rest of week
  const todayEvs = calendarData.filter(ev => {
    const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    return d === today;
  });
  const restEvs = calendarData.filter(ev => {
    const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    return d && d !== today;
  });

  const fmtEv = ev => {
    const start = ev.start?.dateTime
      ? new Date(ev.start.dateTime).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : (ev.start?.date ? new Date(ev.start.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
    return `- ${start}: ${ev.summary || '(no title)'}`;
  };

  const todaySummary = todayEvs.length ? todayEvs.map(fmtEv).join('\n') : 'No meetings today.';
  const restSummary = restEvs.slice(0, 10).map(fmtEv).join('\n') || 'No further events this week.';

  return `You are KAI — Knowledge Action Intelligence. You are the personal organisational intelligence assistant for a senior Enterprise Platform Architect at a UK financial services regulatory organisation.

TODAY IS: ${todayFormatted} — current time is ${timeNow}.
Use this date when answering questions about today, tomorrow, this week, or how long ago something happened.

You have just read their REAL inbox and calendar. Use only this actual data — do not invent emails or events.

INBOX (${gmailData.length} emails, ${unread.length} unread, ${urgent.length} urgent):
${emailSummary || 'No emails loaded yet.'}

TODAY'S CALENDAR (${todayEvs.length} meetings today):
${todaySummary}

REST OF WEEK CALENDAR:
${restSummary}

TIMECODES: PRJ-042 (Digital Transformation), GOV-011 (Governance and Board), BAU-001 (BAU)
${buildNotesContext()}
RULES:
- Only reference emails and events that appear in the data above
- When asked about "today", use TODAY'S CALENDAR section specifically
- If open actions exist, proactively mention overdue ones when relevant
- You CAN create calendar events directly — if someone asks you to block time, set a reminder, or create a meeting, tell them to use the chat command format e.g. "Remind me on Friday to X" or "Block Monday for Y" and KAI will show an editable event card. NEVER say you cannot create calendar entries or push notifications — you can, via the proposal card.
- If the inbox is empty or shows only Google system emails, say so honestly
- Be direct, concise and professional
- Give specific actionable answers based on what you can actually see`;
}

// callClaude(userMsg, isChat, systemOverride, historyOverride)
// - isChat: if true, includes chat history in messages
// - systemOverride: optional custom system prompt (e.g. for meeting prep)
// - historyOverride: optional message history array (for multi-turn prep chat)
async function callClaude(userMsg, isChat = false, systemOverride = null, historyOverride = null) {
  const system = systemOverride || buildKaiSystem();

  let messages;
  if (historyOverride) {
    // Use provided history + new user message
    messages = [...historyOverride, { role: 'user', content: userMsg }];
  } else if (isChat) {
    messages = [...chatHistory, { role: 'user', content: userMsg }];
  } else {
    messages = [{ role: 'user', content: userMsg }];
  }

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages
    })
  });
  if (!res.ok) throw new Error('Worker responded ' + res.status);
  const data = await res.json();
  return data.content?.[0]?.text || 'No response';
}

// ── CHAT ──

// Lightweight intent parser — looks at KAI's reply and extracts an inbox filter action if relevant
function parseKaiIntent(text) {
  const t = text.toLowerCase();

  // Sender filter — "emails from X" or "from X"
  const senderMatch = text.match(/emails? from ([A-Z][a-zA-Z\s]+?)(?:\s*[\.\,\—\-]|$)/m)
    || text.match(/from ([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/m);
  if (senderMatch) {
    const name = senderMatch[1].trim();
    // Don't trigger on generic phrases
    if (!['The', 'Your', 'KAI', 'Hi', 'A', 'An', 'Our'].includes(name)) {
      return { label: `Show emails from ${name} →`, filter: 'sender:' + name };
    }
  }

  // Unread / unreplied
  if (t.includes('unread') || t.includes('not replied') || t.includes('haven\'t replied') || t.includes('no reply') || t.includes('unreplied')) {
    return { label: 'Show unread emails →', filter: 'unread' };
  }

  // Urgent
  if ((t.includes('urgent') || t.includes('high priority') || t.includes('needs your attention') || t.includes('need your attention')) && !t.includes('no urgent')) {
    return { label: 'Show urgent emails →', filter: 'urgent' };
  }

  // FYI / noise
  if (t.includes('fyi') || t.includes('newsletter') || t.includes('noise')) {
    return { label: 'Show FYI emails →', filter: 'fyi' };
  }

  return null;
}

function addMsg(role, text, inboxAction = null) {
  const msgs = document.getElementById('chatMsgs');
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  const formatted = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  let actionHtml = '';
  if (inboxAction) {
    actionHtml = `<div style="margin-top:8px"><button class="kai-action-btn" onclick="filterInboxBy('${inboxAction.filter}','${inboxAction.label.replace(/'/g, '')}')">${inboxAction.label}</button></div>`;
  }
  d.innerHTML = `<div class="m-av ${role}">${role === 'kai' ? 'KAI' : 'You'}</div><div class="m-bub ${role}">${formatted}${actionHtml}</div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

// Switch to inbox and apply a filter — called from KAI action buttons
function filterInboxBy(filter, label) {
  const inboxNav = document.querySelector('.nav-item[data-panel="inbox"]');
  if (inboxNav) switchPanel(inboxNav);
  const mobInbox = document.querySelector('.mob-nav-item[data-panel="inbox"]');
  if (mobInbox) { document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active')); mobInbox.classList.add('active'); }
  filterEmails(filter, null);
}

function addTyping(containerId = 'chatMsgs', typingId = 'typing') {
  const msgs = document.getElementById(containerId);
  const d = document.createElement('div');
  d.className = 'msg'; d.id = typingId;
  d.innerHTML = '<div class="m-av kai">KAI</div><div class="m-bub kai"><div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>';
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendChat() {
  const inp = document.getElementById('chatIn');
  const btn = document.getElementById('sendBtn');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = ''; inp.style.height = 'auto'; btn.disabled = true;
  addMsg('user', text);

  // Check if this is a "remember" command — handle locally without calling Claude
  const rememberText = parseRememberIntent(text);
  if (rememberText) {
    const due = extractDueDate(rememberText);
    await addKaiAction(rememberText, due);
    const dueMsg = due ? ` Flagged as due ${new Date(due + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' })}.` : '';
    addMsg('kai', `Got it — added to your open actions and saved to Drive.${dueMsg} I'll remind you if it goes overdue.`);
    btn.disabled = false; inp.focus();
    return;
  }

  // Use Claude to detect calendar intent — handles any natural phrasing
  addTyping('chatMsgs', 'typing');
  try {
    const calIntent = await detectCalendarIntent(text);
    if (calIntent) {
      document.getElementById('typing')?.remove();
      proposeEvent(calIntent.title, calIntent.dateStr, calIntent.timeStr, calIntent.duration,
        'Here\'s what I\'ll create — edit any details before confirming:');
      btn.disabled = false; inp.focus();
      return;
    }
  } catch(e) { /* non-fatal — fall through to normal chat */ }

  // Normal KAI chat
  try {
    chatHistory.push({ role: 'user', content: text });
    const reply = await callClaude(text, true);
    document.getElementById('typing')?.remove();
    const action = parseKaiIntent(reply);
    addMsg('kai', reply, action);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    document.getElementById('typing')?.remove();
    addMsg('kai', 'Having trouble connecting. Please check your Worker URL configuration.');
    chatHistory.pop(); // remove the user message we pushed if call failed
  }
  btn.disabled = false; inp.focus();
}

function sendQuick(btn) {
  document.getElementById('chatIn').value = btn.textContent;
  sendChat();
}

// ── NAVIGATION ──

function switchPanel(item) {
  // Deactivate all nav items
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  item.classList.add('active');
  // Switch panels
  const panel = item.dataset.panel;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + panel).classList.add('active');
  // If there's a scroll target, scroll to it after panel renders
  const scrollTarget = item.dataset.scroll;
  if (scrollTarget) {
    setTimeout(() => {
      const el = document.getElementById(scrollTarget);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
  if (panel === 'wellbeing') renderWellbeingPanel();
}

function mobNav(btn) {
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const panel = btn.dataset.panel;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + panel).classList.add('active');
  // Sync sidebar active state — for mobile, just match on panel
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.panel === panel && !i.dataset.scroll);
  });
  if (panel === 'wellbeing') renderWellbeingPanel();
}

function goToUnreplied() {
  const inboxNav = document.querySelector('.nav-item[data-panel="inbox"]');
  if (inboxNav) switchPanel(inboxNav);
  const mobInbox = document.querySelector('.mob-nav-item[data-panel="inbox"]');
  if (mobInbox) { document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active')); mobInbox.classList.add('active'); }
  setTimeout(() => filterEmails('unread', null), 100);
}

function goToCalendar() {
  // Switch to the dedicated Calendar panel
  const calNav = document.querySelector('.nav-item[data-panel="calendar"]');
  if (calNav) switchPanel(calNav);
  const mobCal = document.querySelector('.mob-nav-item[data-panel="calendar"]');
  if (mobCal) { document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active')); mobCal.classList.add('active'); }
  setTimeout(() => {
    // Pulse and scroll to clash rows in the calendar panel
    const clashRows = document.querySelectorAll('.clash-event');
    if (clashRows.length) {
      clashRows[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      clashRows.forEach(row => {
        row.classList.add('pulsing');
        setTimeout(() => row.classList.remove('pulsing'), 2200);
      });
    }
  }, 200);
}

function goToWellbeing() {
  const wbNav = document.querySelector('.nav-item[data-panel="wellbeing"]');
  if (wbNav) switchPanel(wbNav);
  const mobWb = document.querySelector('.mob-nav-item[data-panel="wellbeing"]');
  if (mobWb) { document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active')); mobWb.classList.add('active'); }
}

function goToTimecodes() {
  const tcNav = document.querySelector('.nav-item[data-panel="timecodes"]');
  if (tcNav) switchPanel(tcNav);
  const mobTc = document.querySelector('.mob-nav-item[data-panel="timecodes"]');
  if (mobTc) { document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active')); mobTc.classList.add('active'); }
}

function closeMobileEmail() {
  document.getElementById('emailDetail').classList.remove('mob-open');
}

// Switches to Ask KAI and proposes a calendar event — used by wellbeing nudge buttons
function blockLunchSlot(title, dateStr, timeStr, dur) {
  const chatNav = document.querySelector('.nav-item[data-panel="chat"]');
  if (chatNav) switchPanel(chatNav);
  const mobChat = document.querySelector('.mob-nav-item[data-panel="chat"]');
  if (mobChat) { document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active')); mobChat.classList.add('active'); }
  setTimeout(() => proposeEvent(title, dateStr, timeStr, dur, 'KAI suggests protecting this time for lunch:'), 150);
}

// ── REFRESH ──

async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.classList.add('spinning');
  document.getElementById('pillStatus').textContent = 'Refreshing...';
  document.getElementById('briefingSub').textContent = 'Refreshing your inbox and calendar...';
  try {
    const [emails, events] = await Promise.all([fetchEmails(), fetchCalendar()]);
    // fetchEmails/fetchCalendar already handle 401 by showing the banner and returning []
    gmailData = emails;
    calendarData = events;
    document.getElementById('todayEvents').innerHTML = renderToday(events);
    document.getElementById('weekAhead').innerHTML = renderWeekAhead(events);
    renderEmailList();
    analyseBriefing(emails, events);
    renderCalendarPanel();
    renderTimecodePanel();
    const urgentEmails = emails.filter(e => e.priority === 'urgent' || e.priority === 'high');
    const msgs = document.getElementById('chatMsgs');
    if (msgs) {
      const d = document.createElement('div');
      d.className = 'msg';
      d.innerHTML = `<div class="m-av kai">KAI</div><div class="m-bub kai">Refreshed — I can see <b>${emails.length} emails</b> and <b>${events.length} calendar events</b>. ${urgentEmails.length > 0 ? urgentEmails.length + ' need your attention.' : 'No urgent items.'}</div>`;
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    }
  } catch(e) {
    document.getElementById('briefingSub').textContent = 'Refresh failed — try again';
  }
  if (btn) btn.classList.remove('spinning');
}

// ── INIT ──

async function loadApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';
  try {
    const email = sessionStorage.getItem('userEmail') || '';
    document.getElementById('topbarEmail').textContent = DEMO_MODE ? '' : email;
    const demoModePill = document.getElementById('demoModePill');
    if (demoModePill) demoModePill.style.display = DEMO_MODE ? 'inline-flex' : 'none';
    const [emails, events] = await Promise.all([fetchEmails(), fetchCalendar()]);
    gmailData = emails;
    calendarData = events;
    document.getElementById('todayEvents').innerHTML = renderToday(events);
    document.getElementById('weekAhead').innerHTML = renderWeekAhead(events);
    renderEmailList();
    analyseBriefing(emails, events);
    renderCalendarPanel();
    renderTimecodePanel();
    const urgentEmails = emails.filter(e => e.priority === 'urgent' || e.priority === 'high');
    chatHistory = [];
    document.getElementById('chatMsgs').innerHTML = `<div class="msg"><div class="m-av kai">KAI</div><div class="m-bub kai">Hi — I've read your inbox and calendar. You have <b>${urgentEmails.length} high-priority emails</b> and <b>${events.length} calendar events</b> this week. What would you like help with?</div></div>`;
    checkAutoArchiveRecommendations();
    if (DEMO_MODE) { kaiNotes = { actions: [], lastUpdated: null }; renderNotes(); }
    else { loadKaiNotes(); } // async — non-blocking
    scanEmailsForCalendarIntents(emails); // async — fires after 5s delay
  } catch(e) {
    console.error(e);
    document.getElementById('weekAhead').innerHTML = '<div style="padding:16px;font-size:12px;color:var(--coral)">Error loading data. Token may have expired — try signing out and back in.</div>';
  }
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'grid';
}

async function init() {
  // 1. Check for existing valid token in session
  const stored = sessionStorage.getItem('token');
  if (stored) {
    accessToken = stored;
    await loadApp();
    return;
  }
  // 2. Check if we're returning from OAuth (token in URL hash)
  const fromCallback = await handleCallback();
  if (fromCallback) {
    await loadApp();
    return;
  }
  // 3. No token — show auth screen
  document.getElementById('authScreen').style.display = 'flex';
}

init();

// ── ARCHIVE ──

const archivedItems = [];
const REGULATORY_KEYWORDS = ['governance', 'regulatory', 'compliance', 'sign-off', 'board decision', 'risk framework', 'control framework', 'audit', 'policy', 'approval', 'minister', 'exco', 'urgent'];


function getArchiveFolder(email) {
  const subj = (email.subject + ' ' + (email.body || '')).toLowerCase();
  if (subj.includes('governance') || subj.includes('board') || subj.includes('control framework')) return 'KAI Archive/Governance';
  if (subj.includes('regulatory') || subj.includes('compliance') || subj.includes('risk')) return 'KAI Archive/Regulatory';
  if (subj.includes('prj-042') || subj.includes('digital transformation') || subj.includes('project')) return 'KAI Archive/Projects/PRJ-042';
  if (email.priority === 'urgent' || email.priority === 'high') return 'KAI Archive/Stakeholder Correspondence';
  return 'KAI Archive/General';
}

async function ensureDriveFolder(folderPath) {
  const parts = folderPath.split('/');
  let parentId = 'root';
  for (const part of parts) {
    // Try to search for existing folder — may return empty under drive.file scope, that's OK
    try {
      const search = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(part)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false&fields=files(id)`,
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );
      const result = await search.json();
      if (result.files && result.files.length > 0) {
        parentId = result.files[0].id;
        continue;
      }
    } catch(e) { /* search failed — fall through to create */ }
    // Create the folder
    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
    const folder = await create.json();
    if (!folder.id) throw new Error('Could not create Drive folder: ' + part);
    parentId = folder.id;
  }
  return parentId;
}

async function archiveEmail(emailId) {
  const email = gmailData.find(e => e.id === emailId);
  if (!email) return;
  const btn = document.getElementById('archiveBtn-' + emailId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Archiving...'; }
  try {
    const folder = getArchiveFolder(email);
    const folderId = await ensureDriveFolder(folder);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${dateStr} — ${email.subject.substring(0, 60).replace(/[/\?%*:|"<>]/g, '')}.txt`;
    const fileContent = [
      'KAI ARCHIVED EMAIL',
      '==================',
      `Date Archived: ${new Date().toLocaleString('en-GB')}`,
      `Archive Location: ${folder}`,
      `Auto-Archive Triggered: ${shouldAutoArchive(email) ? 'Yes' : 'No — Manual'}`,
      '',
      'EMAIL DETAILS',
      '=============',
      `From: ${email.from} <${email.fromEmail}>`,
      `Subject: ${email.subject}`,
      `Received: ${email.time}`,
      `Priority: ${email.priority.toUpperCase()}`,
      '',
      'MESSAGE',
      '=======',
      email.body || email.snippet,
      '',
      '---',
      'Archived by KAI — Knowledge Action Intelligence',
    ].join('\n');

    const metadata = { name: fileName, parents: [folderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'text/plain' }));

    const upload = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
      body: form
    });
    const file = await upload.json();
    if (!file.id) throw new Error('Upload failed');

    email.archived = true;
    archivedItems.unshift({ email, folder, fileName, fileId: file.id, link: file.webViewLink, archivedAt: new Date() });
    if (btn) { btn.textContent = '✅ Archived'; btn.style.background = 'rgba(34,197,94,0.2)'; }
    renderEmailList();
    updateArchivePanel();
    showArchiveToast(email, folder, file.webViewLink);
    document.getElementById('archiveBadge').textContent = archivedItems.length;
    const mab = document.getElementById('mobArchiveBadge');
    if (mab) { mab.textContent = archivedItems.length; mab.style.display = 'block'; }
    chatHistory.push({ role: 'user', content: `I just archived the email "${email.subject}" from ${email.from}` });
    chatHistory.push({ role: 'assistant', content: `Done — I've saved "${email.subject}" to ${folder} in Google Drive. Do you want me to draft a response acknowledging receipt?` });
  } catch(err) {
    if (btn) { btn.disabled = false; btn.textContent = '🗄️ Archive to Drive'; }
    showArchiveToast(null, null, null, err.message);
  }
}

function showArchiveToast(email, folder, link, error = null) {
  const existing = document.getElementById('archiveToast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'archiveToast';
  toast.className = 'arch-toast';
  if (error) {
    toast.style.borderLeftColor = 'var(--coral)';
    toast.innerHTML = `<div class="arch-toast-icon">⚠️</div><div><div class="arch-toast-title" style="color:var(--coral)">Archive failed</div><div class="arch-toast-sub">${error}</div></div>`;
  } else {
    toast.innerHTML = `<div class="arch-toast-icon">🗄️</div><div><div class="arch-toast-title">Archived to Google Drive</div><div class="arch-toast-sub">Saved to ${folder} ${link ? '· <a href="' + link + '" target="_blank" style="color:var(--teal)">Open in Drive</a>' : ''}</div></div><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#999;cursor:pointer;font-size:18px;padding:0 0 0 8px;margin-left:auto">×</button>`;
  }
  document.body.appendChild(toast);
  setTimeout(() => toast?.remove(), 6000);
}

function updateArchivePanel() {
  const list = document.getElementById('archiveList');
  if (!list) return;
  if (archivedItems.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:20px">No items archived yet.</div>';
    return;
  }
  list.innerHTML = archivedItems.map(item => `
    <div class="archive-item">
      <div>📄</div>
      <div style="flex:1;min-width:0">
        <div class="archive-item-name">${item.email.subject.substring(0, 55)}${item.email.subject.length > 55 ? '...' : ''}</div>
        <div class="archive-item-meta">From: ${item.email.from} · ${item.archivedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="archive-item-meta" style="color:var(--green)">${item.folder}</div>
        ${item.link ? `<a href="${item.link}" target="_blank" class="archive-item-link">Open in Drive →</a>` : ''}
      </div>
      <span class="arch-badge">SAVED</span>
    </div>
  `).join('');
}

function checkAutoArchiveRecommendations() {
  const recommended = gmailData.filter(e => !e.archived && shouldAutoArchive(e));
  if (recommended.length > 0) {
    const names = recommended.slice(0, 2).map(e => e.from).join(', ');
    const msg = `📋 I've identified ${recommended.length} email${recommended.length > 1 ? 's' : ''} that should be archived for compliance — from ${names}${recommended.length > 2 ? ' and others' : ''}. Open them and use the <b>Archive to Drive</b> button.`;
    setTimeout(() => {
      const msgs = document.getElementById('chatMsgs');
      if (!msgs) return;
      const d = document.createElement('div');
      d.className = 'msg';
      d.innerHTML = `<div class="m-av kai">KAI</div><div class="m-bub kai">${msg}</div>`;
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    }, 3000);
  }
}

// ── MEETING PREP ──

function openMeetingPrep(evIdx) {
  const ev = calendarData[evIdx];
  if (!ev) return;
  currentMeeting = ev;
  prepChatHistory = [];

  const title = ev.summary || 'Meeting';
  const cleanTitle = title.replace(/^(FOCUS|PREP|TRAVEL):\s*/, '').replace(/\s*\(.*?\)\s*/g, '').trim();
  document.getElementById('sheetTitle').textContent = cleanTitle;

  const time = getTime(ev);
  const dayName = getDayName(ev.start?.date || ev.start?.dateTime?.split('T')[0]);
  const duration = ev.start?.dateTime && ev.end?.dateTime
    ? Math.round((new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 60000) + ' min'
    : '';
  const desc = ev.description || '';
  const timecodeMatch = desc.match(/KAI timecode:\s*(\S+)/i);
  const timecode = timecodeMatch ? timecodeMatch[1] : '';

  document.getElementById('sheetMeta').innerHTML = `
    <span>📅 ${dayName}</span>
    ${time ? `<span>⏰ ${time}</span>` : ''}
    ${duration ? `<span>⏱ ${duration}</span>` : ''}
    ${timecode ? `<span style="background:var(--teal-lt);color:var(--teal-dk);padding:1px 7px;border-radius:100px;font-size:10px;font-weight:500">${timecode}</span>` : ''}
  `;

  // Reset tabs to Brief
  document.querySelectorAll('.prep-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.prep-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('.prep-tab').classList.add('active');
  document.getElementById('prepTab-brief').classList.add('active');

  // Reset content
  document.getElementById('prepSummary').innerHTML = '<div class="prep-loading"><div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div> KAI is preparing your brief...</div>';
  document.getElementById('prepTalkingPoints').innerHTML = '<div class="prep-loading"><div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div> Generating talking points...</div>';
  document.getElementById('prepWatchOut').innerHTML = '<div class="prep-loading"><div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div> Analysing risks...</div>';

  document.getElementById('meetingOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  loadRelatedEmails(ev);
  initPrepChat(ev);
  generateMeetingBrief(ev);
}

function closeMeetingSheet() {
  document.getElementById('meetingOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentMeeting = null;
}

function closeMeetingPrep(e) {
  if (e.target === document.getElementById('meetingOverlay')) closeMeetingSheet();
}

function switchPrepTab(tab, btn) {
  document.querySelectorAll('.prep-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.prep-tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('prepTab-' + tab).classList.add('active');
}

function loadRelatedEmails(ev) {
  const title = (ev.summary || '').toLowerCase();
  const words = title.split(/\s+/).filter(w => w.length > 3);
  const related = gmailData.filter(email => {
    const combined = (email.subject + ' ' + email.from + ' ' + email.snippet).toLowerCase();
    return words.some(w => combined.includes(w));
  });
  const container = document.getElementById('prepRelatedEmails');
  if (related.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:#888;padding:8px 0">No emails directly related to this meeting found in your inbox.</div>';
    return;
  }
  container.innerHTML = related.slice(0, 5).map(email => `
    <div class="rel-email" onclick="openRelatedEmail('${email.id}')">
      <div style="flex:1">
        <div class="rel-email-from">${email.from}</div>
        <div class="rel-email-subj">${email.subject}</div>
      </div>
      <span class="pri ${email.priority}">${email.priority.toUpperCase()}</span>
    </div>
  `).join('');
}

function openRelatedEmail(emailId) {
  closeMeetingSheet();
  setTimeout(() => {
    selectEmail(emailId);
    const inboxNav = document.querySelector('.nav-item[data-panel="inbox"]');
    if (inboxNav) switchPanel(inboxNav);
  }, 200);
}

function initPrepChat(ev) {
  const cleanTitle = (ev.summary || 'this meeting').replace(/^(FOCUS|PREP|TRAVEL):\s*/, '').replace(/\s*\(.*?\)\s*/g, '').trim();
  const time = getTime(ev);

  prepChatHistory = [];

  document.getElementById('prepChatMsgs').innerHTML = `
    <div class="msg">
      <div class="m-av kai">KAI</div>
      <div class="m-bub kai">I'm ready to help you prep for <b>${cleanTitle}</b>${time ? ' at ' + time : ''}. I can draft an agenda, write talking points, create a pre-read, or structure a deck. What would you like to work on?</div>
    </div>`;

  const titleLower = cleanTitle.toLowerCase();
  let prompts = ['Draft an agenda', 'Key talking points', 'Write a pre-read note', 'Help me structure a deck', 'What questions should I ask?'];
  if (titleLower.includes('board') || titleLower.includes('governance')) {
    prompts = ['Draft board paper outline', 'Key risks to raise', 'Decision points needed', 'Write exec summary', 'Prep briefing for attendees'];
  } else if (titleLower.includes('1:1') || titleLower.includes('director')) {
    prompts = ['What to raise with the Director', 'Draft talking points', 'Pending items to cover', 'How to frame the AI strategy', 'Draft a follow-up note'];
  } else if (titleLower.includes('project') || titleLower.includes('prj')) {
    prompts = ['Project status summary', 'Risks and blockers', 'Draft milestone update', 'Stakeholder questions', 'Actions from last time'];
  }

  document.getElementById('prepQuickPrompts').innerHTML = prompts.map(p =>
    `<button class="prep-qp" onclick="sendPrepQuick('${p}')">${p}</button>`
  ).join('');
}

async function generateMeetingBrief(ev) {
  const cleanTitle = (ev.summary || 'meeting').replace(/^(FOCUS|PREP|TRAVEL):\s*/, '').replace(/\s*\(.*?\)\s*/g, '').trim();
  const time = getTime(ev);
  const desc = ev.description || '';
  const relatedEmails = gmailData.filter(email => {
    const words = cleanTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const combined = (email.subject + ' ' + email.snippet).toLowerCase();
    return words.some(w => combined.includes(w));
  }).slice(0, 3).map(e => `- Email from ${e.from}: "${e.subject}"`).join('\n');

  const system = `You are KAI, an AI assistant for a senior Enterprise Platform Architect at a UK financial services regulator.

Generate a concise meeting prep brief. Respond with exactly three sections separated by ||| :

Section 1 - WHAT THIS IS ABOUT (2-3 sentences explaining the purpose and context)
Section 2 - TALKING POINTS (exactly 4 bullet points, each starting with •)
Section 3 - WATCH OUT FOR (exactly 3 bullet points of risks/things to be aware of, each starting with •)

Meeting: ${cleanTitle}
Time: ${time}
Calendar description: ${desc || 'none'}
Related emails in inbox:
${relatedEmails || 'none'}

Be specific to a financial services regulator context — governance-heavy, senior leadership audience.`;

  try {
    const response = await callClaude('Generate the brief now.', false, system);
    const parts = response.split('|||');
    if (parts[0]) {
      document.getElementById('prepSummary').innerHTML =
        `<div class="prep-content">${parts[0].trim().replace(/\n/g, '<br>')}</div>`;
    }
    if (parts[1]) {
      const bullets = parts[1].trim().split('\n').filter(l => l.trim().startsWith('•'));
      document.getElementById('prepTalkingPoints').innerHTML = bullets.map(b =>
        `<div class="prep-bullet"><div class="prep-bullet-dot"></div><div class="prep-bullet-text">${b.replace('•', '').trim()}</div></div>`
      ).join('') || `<div class="prep-content">${parts[1].trim()}</div>`;
    }
    if (parts[2]) {
      const bullets = parts[2].trim().split('\n').filter(l => l.trim().startsWith('•'));
      document.getElementById('prepWatchOut').innerHTML = bullets.map(b =>
        `<div class="prep-bullet"><div class="prep-bullet-dot" style="background:var(--coral)"></div><div class="prep-bullet-text">${b.replace('•', '').trim()}</div></div>`
      ).join('') || `<div class="prep-content">${parts[2].trim()}</div>`;
    }
  } catch(e) {
    document.getElementById('prepSummary').innerHTML = '<div style="font-size:12px;color:#888">Brief generation requires the Cloudflare Worker to be configured.</div>';
    document.getElementById('prepTalkingPoints').innerHTML = '';
    document.getElementById('prepWatchOut').innerHTML = '';
  }
}

async function sendPrepChat() {
  const input = document.getElementById('prepChatInput');
  const btn = document.getElementById('prepSendBtn');
  const text = input.value.trim();
  if (!text || !currentMeeting) return;
  input.value = ''; input.style.height = 'auto'; btn.disabled = true;

  const cleanTitle = (currentMeeting.summary || 'meeting').replace(/^(FOCUS|PREP|TRAVEL):\s*/, '').replace(/\s*\(.*?\)\s*/g, '').trim();

  const msgs = document.getElementById('prepChatMsgs');
  const userDiv = document.createElement('div');
  userDiv.className = 'msg user';
  userDiv.innerHTML = `<div class="m-av user">You</div><div class="m-bub user">${text}</div>`;
  msgs.appendChild(userDiv);
  msgs.scrollTop = msgs.scrollHeight;

  addTyping('prepChatMsgs', 'prepTyping');
  // Do NOT push to prepChatHistory yet — callClaude will append text as the user message
  // We push after the call so history stays in sync

  const system = `You are KAI — a meeting preparation assistant for a senior Enterprise Platform Architect at a UK financial services regulator.

You are helping them prepare for: ${cleanTitle}
Time: ${getTime(currentMeeting)}
Meeting description: ${currentMeeting.description || 'none'}
Related emails: ${gmailData.filter(e => {
    const words = cleanTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return words.some(w => (e.subject + e.snippet).toLowerCase().includes(w));
  }).slice(0, 3).map(e => e.from + ': ' + e.subject).join(', ') || 'none'}

Help with: agendas, talking points, deck structures, pre-read notes, risk analysis, stakeholder questions, action item lists.
When drafting structured content, use headers and bullets. Keep responses concise but substantive.`;

  try {
    // prepChatHistory has prior turns; callClaude appends text as the new user message
    const reply = await callClaude(text, false, system, prepChatHistory);
    document.getElementById('prepTyping')?.remove();
    // Now push both turns to history
    prepChatHistory.push({ role: 'user', content: text });
    prepChatHistory.push({ role: 'assistant', content: reply });
    const replyDiv = document.createElement('div');
    replyDiv.className = 'msg';
    replyDiv.innerHTML = `<div class="m-av kai">KAI</div><div class="m-bub kai" style="max-width:100%">${reply.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/^- /gm, '• ')}</div>`;
    msgs.appendChild(replyDiv);
    msgs.scrollTop = msgs.scrollHeight;
  } catch(e) {
    document.getElementById('prepTyping')?.remove();
    const errDiv = document.createElement('div');
    errDiv.className = 'msg';
    errDiv.innerHTML = '<div class="m-av kai">KAI</div><div class="m-bub kai">Unable to connect — check your Worker URL configuration.</div>';
    msgs.appendChild(errDiv);
  }
  btn.disabled = false;
}

function sendPrepQuick(text) {
  document.getElementById('prepChatInput').value = text;
  switchPrepTab('prep', document.querySelectorAll('.prep-tab')[2]);
  sendPrepChat();
}

function renderCalendarPanel() {
  const container = document.getElementById('calendarView');
  if (!container) return;

  const today = todayStr();
  const weekStart = getWeekStart(today, 0);

  // Build Mon–Fri scaffold for current week
  const weekDays = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    weekDays.push(d.toISOString().split('T')[0]);
  }

  // Group events by date
  const days = {};
  calendarData.forEach(ev => {
    const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    if (!d) return;
    if (!days[d]) days[d] = [];
    days[d].push(ev);
  });

  if (!Object.keys(days).length && !weekDays.includes(today)) {
    container.innerHTML = '<div class="cal-empty">No calendar events found. Make sure you ran the data seeder.</div>';
    return;
  }

  // Update badge with total event count
  const badge = document.getElementById('calBadge');
  if (badge) badge.textContent = calendarData.length;

  // Update sub heading
  const sub = document.getElementById('calendarSub');
  if (sub) {
    const clashCount = clashedEventIds.size / 2;
    sub.textContent = `${calendarData.length} events this week${clashCount > 0 ? ' · ' + Math.ceil(clashCount) + ' clash' + (Math.ceil(clashCount) > 1 ? 'es' : '') : ''} · click any event to prep`;
  }

  // Legend
  const legend = `<div class="cal-legend">
    <div class="cal-legend-item"><span class="tag focus" style="font-size:9px;padding:1px 6px">FOCUS</span> Focus block</div>
    <div class="cal-legend-item"><span class="tag prep" style="font-size:9px;padding:1px 6px">PREP</span> Prep time</div>
    <div class="cal-legend-item"><span class="tag clash" style="font-size:9px;padding:1px 6px">CLASH</span> Overlapping</div>
    <div class="cal-legend-item"><span class="tag travel" style="font-size:9px;padding:1px 6px">TRAVEL</span> Travel day</div>
  </div>`;

  const html = weekDays.map(date => {
    const isToday = date === today;
    const isPast = date < today;
    const dayName = getDayName(date);
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    const todayLabel = isToday ? ' — Today' : '';
    const evs = days[date] || [];

    const eventRows = evs.length ? evs.map(ev => {
      const isClashing = clashedEventIds.has(ev.id);
      const s = ev.summary || '';
      const t = getTime(ev);

      let tagClass = '', tagLabel = '';
      if (s.includes('FOCUS'))  { tagClass = 'focus';  tagLabel = 'FOCUS'; }
      else if (s.includes('PREP'))   { tagClass = 'prep';   tagLabel = 'PREP'; }
      else if (isClashing)           { tagClass = 'clash';  tagLabel = 'CLASH'; }
      else if (s.includes('TRAVEL') || s.includes('Transit')) { tagClass = 'travel'; tagLabel = 'TRAVEL'; }

      const displayName = s.replace(/\s*\(.*?\)\s*/g, '').replace(/^(FOCUS|PREP|TRAVEL):\s*/, '').substring(0, 55);
      const evIdx = calendarData.findIndex(e => e.id === ev.id);
      const isSkip = s.includes('Transit') || s.includes('KAI Timecode');
      const clickable = !isSkip;

      return `<div class="cal-event ${isClashing ? 'clash-event' : ''}" style="${isPast ? 'opacity:0.55' : ''}"
        ${clickable ? `onclick="openMeetingPrep(${evIdx})" title="Click to prep for this meeting"` : ''}>
        <div class="cal-event-time">${t || '·'}</div>
        <div class="cal-event-title">${displayName}</div>
        <div class="cal-event-tags">
          ${tagLabel ? `<span class="tag ${tagClass}">${tagLabel}</span>` : ''}
        </div>
        ${clickable ? '<div class="cal-event-arrow">›</div>' : ''}
      </div>`;
    }).join('') : `<div class="cal-empty" style="padding:10px 14px;font-size:11px;color:#bbb">${isPast ? 'No meetings' : 'No meetings scheduled'}</div>`;

    return `<div class="cal-day">
      <div class="cal-day-hdr ${isToday ? 'today' : ''}">
        <div class="cal-day-name">${dayName}</div>
        <div class="cal-day-date">${dateLabel}${todayLabel}</div>
        <div class="cal-day-count">${evs.length} event${evs.length !== 1 ? 's' : ''}</div>
      </div>
      ${eventRows}
    </div>`;
  }).join('');

  container.innerHTML = legend + html;
}


let clashedEventIds = new Set();
let clashDayDate = null; // date string of the day with clashes, for scrolling
let kaiNotes = { actions: [], lastUpdated: null };
let kaiNotesFileId = null;

// Notes file structure:
// { actions: [{ id, text, due, createdAt, done }], lastUpdated }

async function loadKaiNotes() {
  try {
    // 1. Ask Worker for the stored file ID
    const r = await fetch(WORKER_URL + '/notes-id');
    // Worker returns non-JSON for non-POST if old worker — handle gracefully
    if (!r.ok) { renderNotes(); return; }
    const { fileId } = await r.json();

    if (fileId) {
      // 2. Fetch the file content from Drive directly
      kaiNotesFileId = fileId;
      const dr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      if (dr.ok) {
        kaiNotes = await dr.json();
      } else {
        // File was deleted — create a new one
        kaiNotesFileId = null;
        await ensureKaiNotesFile();
      }
    } else {
      // No file ID stored yet — create the file
      await ensureKaiNotesFile();
    }
  } catch(e) {
    // Non-fatal — notes just won't load
    console.warn('KAI Notes load failed:', e.message);
  }
  renderNotes();
}

async function ensureKaiNotesFile() {
  try {
    const content = JSON.stringify({ actions: [], lastUpdated: new Date().toISOString() });
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: 'kai-notes.json' })], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
      body: form
    });
    const file = await r.json();
    if (file.id) {
      kaiNotesFileId = file.id;
      // Store file ID in Worker KV so all devices can find it
      await fetch(WORKER_URL + '/notes-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id })
      });
    }
  } catch(e) {
    console.warn('KAI Notes file creation failed:', e.message);
  }
}

async function saveKaiNotes() {
  if (!kaiNotesFileId) return;
  try {
    kaiNotes.lastUpdated = new Date().toISOString();
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${kaiNotesFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(kaiNotes)
    });
  } catch(e) {
    console.warn('KAI Notes save failed:', e.message);
  }
}

function renderNotes() {
  const list = document.getElementById('notesList');
  const status = document.getElementById('notesStatus');
  if (!list) return;

  const open = kaiNotes.actions.filter(a => !a.done);
  const now = new Date();
  const overdue = open.filter(a => a.due && new Date(a.due + 'T12:00:00') < now);

  if (status) status.textContent = DEMO_MODE ? 'Demo mode — changes not saved' : (kaiNotesFileId ? '✓ Synced to Drive' : 'Not synced');

  if (open.length === 0) {
    list.innerHTML = '<div style="padding:12px 13px;font-size:11px;color:var(--muted)">No open actions. Tell KAI to remember something.</div>';
    return;
  }

  list.innerHTML = open.map(a => {
    // Parse due date as local noon to avoid UTC DST day-shift
    const dueDate = a.due ? new Date(a.due + 'T12:00:00') : null;
    const isOverdue = dueDate && dueDate < new Date();
    const dueStr = dueDate ? 'Due: ' + dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return `<div class="action-item">
      <div class="action-item-dot ${isOverdue ? 'overdue' : ''}"></div>
      <div style="flex:1">
        <div class="action-item-text">${a.text}</div>
        ${dueStr ? `<div class="action-item-due" style="${isOverdue ? 'color:var(--coral)' : ''}">${isOverdue ? '⚠️ ' : ''}${dueStr}</div>` : ''}
      </div>
      <button class="action-item-done" onclick="markActionDone('${a.id}')">✓ Done</button>
    </div>`;
  }).join('');
}

async function addKaiAction(text, due = null) {
  const action = {
    id: Date.now().toString(),
    text,
    due,
    createdAt: new Date().toISOString(),
    done: false
  };
  kaiNotes.actions.unshift(action);
  renderNotes();
  await saveKaiNotes();
  return action;
}

async function markActionDone(id) {
  const action = kaiNotes.actions.find(a => a.id === id);
  if (action) {
    action.done = true;
    renderNotes();
    await saveKaiNotes();
  }
}

// Parse "remember X" or "remind me to X" from chat input
function parseRememberIntent(text) {
  const t = text.toLowerCase().trim();
  const patterns = [
    /^remember (?:that )?(?:i need to |i must |to )?(.+)/i,
    /^remind me to (.+)/i,
    /^(?:make a note|note down|log) (?:that )?(.+)/i,
    /^add (?:an? )?action[: ]+(.+)/i,
    /^(?:don't forget|don't let me forget)[: ]+(.+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// Extract due date hint from action text — simple patterns only

// Build notes context for KAI system prompt

// Uses Claude to detect calendar intent from any natural language phrasing
// Returns {title, dateStr, timeStr, duration} or null if not a calendar request
async function detectCalendarIntent(text) {
  const today = todayStr();
  const todayFormatted = new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const system = `You are a calendar intent detector. Today is ${todayFormatted}.

Analyse the user message. If it contains a request to:
- Create a calendar event, meeting, or appointment
- Block time for something
- Set a reminder on a specific date or in X days
- Reserve time for a task or activity

Respond with ONLY a JSON object, no other text, no markdown:
{"isCalendar": true, "title": "event title", "dateStr": "YYYY-MM-DD", "timeStr": "HH:MM", "duration": 30}

Rules for the JSON:
- title: concise event name, prefix with "Reminder: " for reminders
- dateStr: always a specific YYYY-MM-DD date resolved from today (${today})
- timeStr: 24hr format HH:MM, use "09:00" if not specified
- duration: minutes, use 30 for meetings, 15 for reminders, 60 for training/workshops

If the message is NOT a calendar request, respond with ONLY:
{"isCalendar": false}`;

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system,
      messages: [{ role: 'user', content: text }]
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.isCalendar) return null;
    if (!parsed.title || !parsed.dateStr) return null;
    return {
      title:   parsed.title,
      dateStr: parsed.dateStr,
      timeStr: parsed.timeStr || '09:00',
      duration: parsed.duration || 30
    };
  } catch(e) {
    return null;
  }
}


// Proposal counter for unique IDs
let proposalCounter = 0;

// Creates a Google Calendar event via API
async function createCalendarEvent(title, dateStr, timeStr, durationMins, description = '') {
  // Build start datetime — dateStr is YYYY-MM-DD, timeStr is HH:MM or empty (all-day)
  let startObj, endObj;
  if (timeStr) {
    const start = new Date(dateStr + 'T' + timeStr + ':00');
    const end = new Date(start.getTime() + durationMins * 60000);
    startObj = { dateTime: start.toISOString(), timeZone: 'Europe/London' };
    endObj   = { dateTime: end.toISOString(),   timeZone: 'Europe/London' };
  } else {
    // All-day event
    startObj = { date: dateStr };
    endObj   = { date: dateStr };
  }

  const body = {
    summary: title,
    description: description || 'Created by KAI — Knowledge Action Intelligence',
    start: startObj,
    end: endObj,
  };

  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status === 401) { showTokenExpiredBanner(); throw new Error('Token expired'); }
  const data = await r.json();
  if (!data.id) throw new Error(data.error?.message || 'Event creation failed');
  return data; // returns full event object including htmlLink
}

// Renders an event proposal card inside a chat bubble
// proposalId is used to find the card DOM elements on confirm
function renderEventProposal(proposalId, title, dateStr, timeStr, durationMins, reason) {
  return `<div class="event-proposal" id="proposal-${proposalId}">
    <div class="event-proposal-title">📅 Calendar Event</div>
    <div style="font-size:12px;color:#555;margin-bottom:10px">${reason}</div>
    <div class="event-proposal-field">
      <label>Title</label>
      <input id="p${proposalId}-title" value="${title.replace(/"/g, '&quot;')}" placeholder="Event title">
    </div>
    <div class="event-proposal-field">
      <label>Date</label>
      <input id="p${proposalId}-date" type="date" value="${dateStr}">
    </div>
    <div class="event-proposal-field">
      <label>Time</label>
      <input id="p${proposalId}-time" type="time" value="${timeStr || ''}" placeholder="Leave blank for all-day">
    </div>
    <div class="event-proposal-field">
      <label>Duration</label>
      <input id="p${proposalId}-dur" type="number" value="${durationMins}" min="15" step="15" style="width:70px"> <span style="font-size:11px;color:#888">mins</span>
    </div>
    <div class="event-proposal-actions">
      <button class="btn-create" onclick="confirmCreateEvent('${proposalId}')">✓ Create event</button>
      <button class="btn-dismiss" onclick="dismissProposal('${proposalId}')">Dismiss</button>
    </div>
  </div>`;
}

async function confirmCreateEvent(proposalId) {
  const title    = document.getElementById('p' + proposalId + '-title')?.value?.trim();
  const dateStr  = document.getElementById('p' + proposalId + '-date')?.value;
  const timeStr  = document.getElementById('p' + proposalId + '-time')?.value;
  const dur      = parseInt(document.getElementById('p' + proposalId + '-dur')?.value) || 30;
  const card     = document.getElementById('proposal-' + proposalId);
  if (!title || !dateStr) return;

  const btn = card?.querySelector('.btn-create');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  try {
    const ev = await createCalendarEvent(title, dateStr, timeStr, dur);
    const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeLabel = timeStr ? ' at ' + timeStr : ' (all day)';
    if (card) card.outerHTML = `<div class="event-created">✅ <div><b>${title}</b> added to your calendar — ${dateLabel}${timeLabel}${ev.htmlLink ? ' · <a href="' + ev.htmlLink + '" target="_blank" style="color:var(--teal)">Open in Calendar</a>' : ''}</div></div>`;
    // Refresh calendar data in background
    fetchCalendar().then(events => {
      calendarData = events;
      document.getElementById('todayEvents').innerHTML = renderToday(events);
      document.getElementById('weekAhead').innerHTML = renderWeekAhead(events);
      analyseBriefing(gmailData, events);
    });
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Create event'; }
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'font-size:11px;color:var(--coral);margin-top:6px';
    errDiv.textContent = 'Failed: ' + e.message + '. Make sure calendar.events scope is authorised — sign out and back in.';
    card?.appendChild(errDiv);
  }
}

function dismissProposal(proposalId) {
  const card = document.getElementById('proposal-' + proposalId);
  if (card) card.style.display = 'none';
}

// Propose an event in chat — adds a KAI bubble with an editable proposal card
function proposeEvent(title, dateStr, timeStr, durationMins, reason) {
  const id = (++proposalCounter).toString();
  const msgs = document.getElementById('chatMsgs');
  const d = document.createElement('div');
  d.className = 'msg';
  d.innerHTML = `<div class="m-av kai">KAI</div><div class="m-bub kai" style="max-width:92%">${reason ? reason + '<br><br>' : ''}${renderEventProposal(id, title, dateStr, timeStr, durationMins, '')}</div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── EMAIL INTENT DETECTION ──


/* REMOVED_TO_UTILS: function detectEmailCalendarIntent(email) */
// Scan emails and surface calendar action suggestions in chat after load
function scanEmailsForCalendarIntents(emails) {
  const intents = emails
    .filter(e => !e.priority === 'fyi') // skip noise
    .map(e => detectEmailCalendarIntent(e))
    .filter(Boolean)
    .slice(0, 3); // max 3 suggestions at once

  if (!intents.length) return;

  setTimeout(() => {
    intents.forEach(intent => {
      const { type, email } = intent;
      let msg = '', proposalFn = null;

      const today = todayStr();
      // Default to tomorrow for suggestions
      const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0]; })();
      // Next free morning — simple heuristic: 09:00 tomorrow
      const nextSlot = { date: tomorrow, time: '09:00' };

      if (type === 'meeting') {
        msg = `📅 <b>${email.from}</b> is asking to meet ("${email.subject}"). Want me to create a calendar event and suggest a slot?`;
        proposalFn = () => proposeEvent(
          `Catch-up with ${email.from.split(' ')[0]}`,
          nextSlot.date, nextSlot.time, 30,
          `Suggested from email: "${email.subject}"`
        );
      } else if (type === 'approval') {
        msg = `🏖️ Looks like you have an approved leave or holiday in this email from <b>${email.from}</b>. Want me to block it on your calendar?`;
        proposalFn = () => proposeEvent(
          'Annual Leave',
          today, '', 480,
          `Detected from: "${email.subject}"`
        );
      } else if (type === 'training') {
        msg = `📚 <b>${email.from}</b> has sent what looks like a mandatory training or compliance deadline. Want me to block time to complete it?`;
        proposalFn = () => proposeEvent(
          'Complete: ' + email.subject.substring(0, 45),
          nextSlot.date, '14:00', 60,
          `Detected from: "${email.subject}"`
        );
      } else if (type === 'deadline') {
        msg = `⏰ <b>${email.from}</b> has sent a deadline or submission request. Want me to create a calendar reminder?`;
        proposalFn = () => proposeEvent(
          'DEADLINE: ' + email.subject.substring(0, 40),
          nextSlot.date, '09:00', 30,
          `Detected from: "${email.subject}"`
        );
      }

      if (!msg) return;
      const msgs = document.getElementById('chatMsgs');
      const d = document.createElement('div');
      d.className = 'msg';
      const btnId = 'calSuggest-' + email.id;
      d.innerHTML = `<div class="m-av kai">KAI</div><div class="m-bub kai">${msg}<div style="margin-top:8px"><button class="kai-action-btn" id="${btnId}">📅 Yes, propose event →</button></div></div>`;
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
      // Attach click after render
      setTimeout(() => {
        const btn = document.getElementById(btnId);
        if (btn) btn.onclick = () => { btn.style.display = 'none'; proposalFn(); };
      }, 50);
    });
  }, 5000); // delay 5s so it doesn't fire before the welcome message settles
}

// ── CHAT COMMAND — REMIND ME / ADD TO CALENDAR ──


// ── CLASH RESOLUTION ──

// Determines meeting priority for clash resolution


async function resolveClashes() {
  // Switch to Ask KAI and show resolution there
  const chatNav = document.querySelector('.nav-item[data-panel="chat"]');
  if (chatNav) switchPanel(chatNav);
  const mobChat = document.querySelector('.mob-nav-item[data-panel="chat"]');
  if (mobChat) { document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active')); mobChat.classList.add('active'); }

  // Find all clashing event pairs — future events only
  const now = new Date();
  const byDay = {};
  calendarData.forEach(ev => {
    const d = ev.start?.dateTime?.split('T')[0];
    if (ev.end?.dateTime && new Date(ev.end.dateTime) < now) return;
    if (d) { if (!byDay[d]) byDay[d] = []; byDay[d].push(ev); }
  });

  const clashPairs = [];
  Object.entries(byDay).forEach(([date, evs]) => {
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        const e1 = new Date(evs[i].end?.dateTime);
        const s2 = new Date(evs[j].start?.dateTime);
        if (s2 < e1) clashPairs.push({ date, a: evs[i], b: evs[j] });
      }
    }
  });

  if (!clashPairs.length) {
    addMsg('kai', 'No calendar clashes detected this week.');
    return;
  }

  // Show typing
  addTyping('chatMsgs', 'typing');

  // Build clash description for Claude
  const clashDesc = clashPairs.map((p, i) => {
    const dateLabel = new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    const priA = getMeetingPriority(p.a);
    const priB = getMeetingPriority(p.b);
    return `Clash ${i+1} on ${dateLabel}:
  - "${p.a.summary}" at ${getTime(p.a)} [Priority: ${priA}]
  - "${p.b.summary}" at ${getTime(p.b)} [Priority: ${priB}]`;
  }).join('\n\n');

  const system = `You are KAI — an intelligent assistant for a senior Enterprise Platform Architect at a UK financial services regulator.

Analyse these calendar clashes and recommend what to do with each one. For each clash:
1. Identify which meeting is higher priority (Director/board/governance = always keep)
2. Recommend: KEEP, RESCHEDULE, or DECLINE for each meeting
3. Give a one-line reason
4. If rescheduling — suggest "find a new slot earlier this week" or "move to next week"

Priority rules — follow these exactly, the priority labels above are pre-calculated:
- CRITICAL (never decline or move): Director 1:1s, board meetings, governance board, CTO, ExCo
- HIGH (keep unless clashing with critical): programme boards, milestones, risk/compliance, mandatory training
- MEDIUM (reschedule if clashing with high+): peer reviews, vendor briefings, guild sessions, BAU standups
- LOW (always move — these are flexible): self-created reminders, focus blocks, prep slots, training blocks, health & safety sessions, anything created by KAI

IMPORTANT: The priority label in brackets is definitive. If a meeting is labelled [Priority: low] always recommend moving it, even if the title sounds important.

Be direct and specific. Format each clash as:
**Clash [N] — [Day]**
✓ Keep: [meeting name] — [reason]
↻ Reschedule: [meeting name] — [reason] / suggest: [when]

End with a one-line summary of total actions needed.`;

  try {
    const reply = await callClaude(clashDesc, false, system);
    document.getElementById('typing')?.remove();

    // Render the response with action buttons for each clash pair
    const msgs = document.getElementById('chatMsgs');
    const d = document.createElement('div');
    d.className = 'msg';

    // Build action buttons for each clash
    const actionButtons = clashPairs.map((p, i) => {
      const priA = getMeetingPriority(p.a);
      const priB = getMeetingPriority(p.b);
      const scoreA = PRIORITY_SCORE[priA] || 2;
      const scoreB = PRIORITY_SCORE[priB] || 2;
      const keepEv = scoreA >= scoreB ? p.a : p.b;
      const moveEv = keepEv === p.a ? p.b : p.a;
      const evIdx = calendarData.findIndex(e => e.id === moveEv.id);
      const dateLabel = new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

      return `<div style="margin-top:8px;padding:10px 12px;background:#F8F8F5;border-radius:8px;border:0.5px solid #E0E0D8">
        <div style="font-size:11px;font-weight:500;color:#1a1a1a;margin-bottom:6px">Clash on ${dateLabel}</div>
        <div style="font-size:11px;color:#555;margin-bottom:8px">
          <span style="color:var(--teal)">✓ Keep:</span> ${keepEv.summary?.substring(0,40)}<br>
          <span style="color:var(--amber)">↻ Move:</span> ${moveEv.summary?.substring(0,40)}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${evIdx >= 0 ? `<button class="kai-action-btn" style="font-size:10px" onclick="openMeetingPrep(${evIdx})">📋 Prep for kept meeting</button>` : ''}
          <button class="kai-action-btn" style="font-size:10px" onclick="proposeReschedule('${moveEv.id}','${moveEv.summary?.replace(/'/g,'')}')">↻ Find new slot</button>
        </div>
      </div>`;
    }).join('');

    d.innerHTML = `<div class="m-av kai">KAI</div><div class="m-bub kai" style="max-width:95%">${reply.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<b>$1</b>')}${actionButtons}</div>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;

  } catch(e) {
    document.getElementById('typing')?.remove();
    addMsg('kai', 'Unable to analyse clashes — check your Worker connection.');
  }
}

// Propose a reschedule for a specific meeting
function proposeReschedule(evId, evTitle) {
  const ev = calendarData.find(e => e.id === evId);
  if (!ev) return;
  // Find next free slot — simple heuristic: same duration, next available morning
  const dur = ev.start?.dateTime && ev.end?.dateTime
    ? Math.round((new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 60000)
    : 60;
  // Propose tomorrow morning or next Monday
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  proposeEvent(evTitle || 'Rescheduled meeting', dateStr, '10:00', dur,
    `Rescheduled to resolve calendar clash — edit date and time before confirming:`);
}


// Returns events for a date range

// Match an event to a timecode

// Get duration in hours from a calendar event

// Get week start (Monday) for a date


let tcCurrentWeek = 'this';

// ── WELLBEING PANEL ──


async function renderWellbeingPanel() {
  const today = todayStr();
  const byDay = {};
  calendarData.forEach(ev => {
    const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    if (d) { if (!byDay[d]) byDay[d] = []; byDay[d].push(ev); }
  });

  const dayStats = Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).slice(0, 7).map(([date, evs]) => {
    const timed = evs.filter(ev => ev.start?.dateTime && ev.end?.dateTime);
    const totalHrs = timed.reduce((s, ev) => s + (new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 3600000, 0);
    const sorted = [...timed].sort((a,b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));
    let maxGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (new Date(sorted[i].start.dateTime) - new Date(sorted[i-1].end.dateTime)) / 60000;
      if (gap > maxGap) maxGap = gap;
    }
    const lunchProtected = timed.some(ev => { const t = (ev.summary||'').toLowerCase(); return t.includes('lunch') || t.includes('break'); });
    let dayClashes = 0;
    for (let i = 0; i < timed.length; i++)
      for (let j = i+1; j < timed.length; j++)
        if (new Date(timed[j].start.dateTime) < new Date(timed[i].end.dateTime)) dayClashes++;
    const hasTravel = evs.some(ev => { const s = (ev.summary||'').toLowerCase(); return s.includes('travel') || s.includes('transit') || s.includes('london') || s.includes('offsite'); });
    let score = 'green';
    if (hasTravel) score = 'travel';
    else if (timed.length >= 6 || totalHrs >= 5) score = 'red';
    else if (timed.length >= 4 || totalHrs >= 3) score = 'amber';
    return { date, meetingCount: timed.length, totalHrs, maxGap, lunchProtected, dayClashes, hasTravel, score };
  });

  // Day cards
  const dayCardsEl = document.getElementById('wbDayCards');
  if (dayCardsEl) {
    dayCardsEl.innerHTML = dayStats.map(s => {
      const dayName = getDayName(s.date);
      const dateLabel = new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' });
      const isToday = s.date === today;
      const pills = [];
      if (s.dayClashes > 0) pills.push('<span class="wb-day-pill clash">⚡ ' + s.dayClashes + ' clash' + (s.dayClashes > 1 ? 'es' : '') + '</span>');
      if (s.score === 'red') pills.push('<span class="wb-day-pill heavy">🔴 Heavy day</span>');
      if (s.hasTravel) pills.push('<span class="wb-day-pill travel">✈️ Travel</span>');
      if (s.lunchProtected) pills.push('<span class="wb-day-pill lunch">✓ Lunch</span>');
      else if (s.meetingCount >= 4) pills.push('<span class="wb-day-pill nolunch">⚠ No lunch</span>');
      if (s.score === 'green' && !s.hasTravel) pills.push('<span class="wb-day-pill light">✓ Manageable</span>');
      const badgeLabel = s.hasTravel ? '✈' : (s.score === 'red' ? '!' : (s.score === 'amber' ? '~' : '✓'));
      return '<div class="wb-day-card">' +
        '<div class="wb-day-card-hdr">' +
          '<div class="wb-day-badge ' + s.score + '">' + badgeLabel + '</div>' +
          '<div><div class="wb-day-name">' + dayName + (isToday ? ' <span style="font-size:9px;color:var(--teal)">TODAY</span>' : '') + '</div>' +
          '<div class="wb-day-meta">' + dateLabel + ' · ' + s.meetingCount + ' meetings · ' + s.totalHrs.toFixed(1) + ' hrs</div></div>' +
          (s.maxGap >= 30 ? '<div style="font-size:10px;color:var(--green);margin-left:auto">' + Math.round(s.maxGap) + 'm gap</div>' : '') +
        '</div>' +
        (pills.length ? '<div class="wb-day-pills">' + pills.join('') + '</div>' : '') +
      '</div>';
    }).join('');
  }

  // Nudge chips
  const nudges = [];
  const totalWeekHrs = dayStats.reduce((s, d) => s + d.totalHrs, 0);
  dayStats.filter(s => s.score === 'red').forEach(s => nudges.push({ icon: '🔴', text: '<b>' + getDayName(s.date) + ' is your heaviest day</b> — ' + s.meetingCount + ' meetings, ' + s.totalHrs.toFixed(1) + ' hrs.' }));
  dayStats.filter(s => !s.lunchProtected && s.meetingCount >= 4 && !s.hasTravel).forEach(s => nudges.push({ icon: '⚠️', text: '<b>No lunch break on ' + getDayName(s.date) + '.</b> Consider blocking 30 minutes.' }));
  dayStats.filter(s => s.dayClashes > 0).forEach(s => nudges.push({ icon: '⚡', text: '<b>' + s.dayClashes + ' clash' + (s.dayClashes > 1 ? 'es' : '') + ' on ' + getDayName(s.date) + '.</b> Use Calendar panel to resolve.' }));
  const travelDay = dayStats.find(s => s.hasTravel);
  if (travelDay) nudges.push({ icon: '✈️', text: '<b>Travel day on ' + getDayName(travelDay.date) + '.</b> Factor in transit fatigue.' });
  if (totalWeekHrs >= 20) nudges.push({ icon: '📊', text: '<b>' + totalWeekHrs.toFixed(1) + ' hrs in meetings this week</b> — ' + Math.round((totalWeekHrs/37.5)*100) + '% of a standard week.' });
  nudges.push({ icon: '💧', text: '<b>Stay hydrated.</b> Back-to-back meetings make it easy to forget.' });
  nudges.push({ icon: '🚶', text: '<b>Move between meetings.</b> Even 2 minutes resets your focus.' });

  const nudgeEl = document.getElementById('wbNudgeChips');
  if (nudgeEl) nudgeEl.innerHTML = nudges.slice(0, 6).map(n =>
    '<div class="wb-nudge"><div class="wb-nudge-icon">' + n.icon + '</div><div>' + n.text + '</div></div>'
  ).join('');

  // KAI read paragraph — only generate once
  const readEl = document.getElementById('wbReadText');
  const subEl  = document.getElementById('wellbeingSub');
  if (readEl && readEl.textContent === 'Analysing your calendar and inbox...') {
    const daySummary = dayStats.map(s =>
      getDayName(s.date) + ': ' + s.meetingCount + ' meetings, ' + s.totalHrs.toFixed(1) + 'hrs' +
      (s.dayClashes > 0 ? ', ' + s.dayClashes + ' clash(es)' : '') +
      (s.hasTravel ? ', travel day' : '') +
      (s.score === 'red' ? ' [HEAVY]' : s.score === 'amber' ? ' [MODERATE]' : ' [LIGHT]')
    ).join('; ');
    const wbSystem = `You are KAI — an intelligent assistant for a senior Enterprise Platform Architect at a UK financial services regulatory organisation. Write a warm, honest, specific 3-4 sentence summary of their week. Reference specific days and patterns. Be direct — like a trusted colleague, not a wellness app. End with one actionable suggestion. Calendar: ${daySummary}. Total meeting hours: ${totalWeekHrs.toFixed(1)}.`;
    try {
      readEl.textContent = 'KAI is reading your week...';
      const reply = await callClaude('Write the wellbeing summary now.', false, wbSystem);
      readEl.textContent = reply;
      if (subEl) subEl.textContent = 'KAI has analysed your week · Updated just now';
    } catch(e) {
      readEl.textContent = 'Unable to generate summary — check your Worker connection.';
    }
  }

  // Travel day weather
  if (travelDay) {
    const weatherCard = document.getElementById('wbWeatherCard');
    const weatherTitle = document.getElementById('wbWeatherTitle');
    const weatherBody = document.getElementById('wbWeatherBody');
    if (weatherCard) weatherCard.style.display = 'block';
    const travelDateLabel = new Date(travelDay.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
    if (weatherTitle) weatherTitle.textContent = 'London · ' + travelDateLabel;
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FLondon&forecast_days=7';
      const wr = await fetch(url);
      const wd = await wr.json();
      const idx = (wd.daily?.time || []).indexOf(travelDay.date);
      if (idx >= 0) {
        const code = wd.daily.weathercode[idx];
        const tmax = Math.round(wd.daily.temperature_2m_max[idx]);
        const tmin = Math.round(wd.daily.temperature_2m_min[idx]);
        const rain = wd.daily.precipitation_sum[idx];
        const rainNote = rain > 1 ? ' · ' + rain.toFixed(1) + 'mm rain — bring an umbrella.' : ' · Dry conditions expected.';
        if (weatherBody) weatherBody.innerHTML =
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">' +
            '<div style="font-size:28px">' + weatherCodeToEmoji(code) + '</div>' +
            '<div><div style="font-size:15px;font-weight:500">' + weatherCodeToDesc(code) + '</div>' +
            '<div style="font-size:12px;color:#666">' + tmin + '°C – ' + tmax + '°C' + rainNote + '</div></div>' +
          '</div>' +
          '<div style="font-size:11.5px;color:#555">KAI detected a London travel day. Check rail or tube status before you leave.</div>';
      }
    } catch(e) {
      if (weatherBody) weatherBody.textContent = 'Weather data unavailable.';
    }
  }
}


function switchTcWeek(week) {
  tcCurrentWeek = week;
  document.getElementById('tcTabThis').classList.toggle('active', week === 'this');
  document.getElementById('tcTabLast').classList.toggle('active', week === 'last');
  renderTimecodePanel();
}

function renderTimecodePanel() {
  if (!calendarData.length) return;

  const today = todayStr();
  const thisWeekStart = getWeekStart(today, 0);
  const thisWeekEnd   = getWeekEnd(thisWeekStart);
  const lastWeekStart = getWeekStart(today, -1);
  const lastWeekEnd   = getWeekEnd(lastWeekStart);

  const isThis = tcCurrentWeek === 'this';
  const weekStart = isThis ? thisWeekStart : lastWeekStart;
  const weekEnd   = isThis ? thisWeekEnd   : lastWeekEnd;
  const compStart = isThis ? lastWeekStart : getWeekStart(today, -2);
  const compEnd   = isThis ? lastWeekEnd   : getWeekEnd(getWeekStart(today, -2));

  const weekLabel = new Date(weekStart + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }) +
    ' – ' + new Date(weekEnd + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  // Update sub
  const sub = document.getElementById('timecodesSub');
  if (sub) sub.textContent = `Hours matched from your calendar · Week of ${weekLabel}`;

  const events     = getEventsForRange(weekStart, weekEnd);
  const compEvents = getEventsForRange(compStart, compEnd);

  // Classify events
  const classified = {};
  const unmatched = [];
  TC_DEFINITIONS.forEach(tc => { classified[tc.code] = []; });

  events.forEach(ev => {
    const code = matchTimecode(ev);
    if (code) classified[code].push(ev);
    else if (ev.start?.dateTime && !((ev.summary||'').toLowerCase().includes('focus') || (ev.summary||'').toLowerCase().includes('transit') || (ev.summary||'').toLowerCase().includes('kai timecode') || (ev.summary||'').toLowerCase().includes('travel'))) {
      unmatched.push(ev);
    }
  });

  // Comp week hours
  const compHours = {};
  TC_DEFINITIONS.forEach(tc => { compHours[tc.code] = 0; });
  compEvents.forEach(ev => {
    const code = matchTimecode(ev);
    if (code) compHours[code] += getEventHours(ev);
  });

  const totalLogged = TC_DEFINITIONS.reduce((sum, tc) =>
    sum + classified[tc.code].reduce((s, ev) => s + getEventHours(ev), 0), 0);
  const totalUnmatched = unmatched.reduce((s, ev) => s + getEventHours(ev), 0);
  const totalMeetings = totalLogged + totalUnmatched;
  const maxHrs = Math.max(...TC_DEFINITIONS.map(tc =>
    classified[tc.code].reduce((s, ev) => s + getEventHours(ev), 0)), 0.1);

  // Unmatched warning
  const warnEl = document.getElementById('tcUnmatched');
  if (unmatched.length > 0 && warnEl) {
    warnEl.style.display = 'flex';
    warnEl.innerHTML = `⚠️ <span><b>${totalUnmatched.toFixed(1)} hrs unmatched</b> — ${unmatched.length} meeting${unmatched.length>1?'s':''} couldn't be auto-assigned: ${unmatched.map(e=>e.summary||'').slice(0,2).join(', ')}${unmatched.length>2?' and others':''}</span>`;
  } else if (warnEl) { warnEl.style.display = 'none'; }

  // Summary bar
  document.getElementById('tcSummaryBar').innerHTML = `
    <div class="tc-sum-stat"><div class="tc-sum-n">${totalLogged.toFixed(1)}</div><div class="tc-sum-l">hrs logged</div></div>
    <div class="tc-sum-stat"><div class="tc-sum-n" style="color:var(--amber)">${totalUnmatched.toFixed(1)}</div><div class="tc-sum-l">hrs unmatched</div></div>
    <div class="tc-sum-stat"><div class="tc-sum-n" style="color:var(--purple)">${totalMeetings.toFixed(1)}</div><div class="tc-sum-l">hrs in meetings</div></div>
  `;

  // Cards
  document.getElementById('tcCards').innerHTML = TC_DEFINITIONS.map(tc => {
    const evs = classified[tc.code];
    const hrs = evs.reduce((s, ev) => s + getEventHours(ev), 0);
    const pct = Math.round((hrs / Math.max(totalMeetings, 0.1)) * 100);
    const compHrs = compHours[tc.code];
    const compPct = Math.round((compHrs / Math.max(totalMeetings, 0.1)) * 100);

    const meetings = evs.map(ev => {
      const d = ev.start?.dateTime?.split('T')[0];
      const dayName = d ? getDayName(d) : '';
      const t = getTime(ev);
      const dur = getEventHours(ev);
      const durStr = dur === Math.floor(dur) ? dur + '.0h' : dur.toFixed(2).replace('.00','') + 'h';
      return `<div class="tc-mtg-row">
        <div class="tc-mtg-day">${dayName}</div>
        <div class="tc-mtg-time">${t}</div>
        <div class="tc-mtg-name">${(ev.summary||'').replace(/\s*\(.*?\)\s*/g,'').substring(0,45)}</div>
        <div class="tc-mtg-dur">${durStr}</div>
      </div>`;
    }).join('');

    const noMeetings = evs.length === 0
      ? `<div class="tc-mtg-row"><div class="tc-mtg-name" style="color:#bbb;font-style:italic">No meetings matched this week</div></div>`
      : '';

    return `<div class="tc-card-wrap">
      <div class="tc-card-hdr">
        <div class="tc-badge ${tc.badgeClass}">${tc.code}</div>
        <div class="tc-card-info">
          <div class="tc-card-name">${tc.name}</div>
          <div class="tc-card-desc">${tc.desc}</div>
        </div>
        <div class="tc-card-hrs">
          <div class="tc-hrs-n" style="color:${tc.hrsColor}">${hrs.toFixed(1)}</div>
          <div class="tc-hrs-l">hrs this week</div>
        </div>
      </div>
      <div class="tc-bar-wrap">
        <div class="tc-bar-bg"><div class="tc-bar-fill" style="width:${pct}%;background:${tc.barColor}"></div></div>
      </div>
      <div class="tc-mtg-list">${meetings}${noMeetings}</div>
      <div class="tc-vs-row">
        <div class="tc-vs-lbl">vs ${isThis ? 'last' : 'prior'} week</div>
        <div class="tc-vs-bars">
          <div class="tc-vs-bar-row">
            <div class="tc-vs-bar-lbl">${isThis ? 'This' : 'Last'}</div>
            <div class="tc-vs-bar" style="width:${Math.max(pct,2)}%;background:${tc.barColor}"></div>
            <div class="tc-vs-bar-val" style="color:${tc.hrsColor}">${hrs.toFixed(1)}h</div>
          </div>
          <div class="tc-vs-bar-row">
            <div class="tc-vs-bar-lbl">${isThis ? 'Last' : 'Prior'}</div>
            <div class="tc-vs-bar" style="width:${Math.max(compPct,2)}%;background:${tc.barColorLt}"></div>
            <div class="tc-vs-bar-val" style="color:#aaa">${compHrs.toFixed(1)}h</div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Copy text
  const now = new Date().toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const lines = TC_DEFINITIONS.map(tc => {
    const hrs = classified[tc.code].reduce((s, ev) => s + getEventHours(ev), 0);
    return `${tc.code}  ${tc.name.padEnd(28)}${hrs.toFixed(1)} hrs`;
  });
  const copyText = `Week: ${weekLabel}
${'━'.repeat(50)}
${lines.join('\n')}
${'━'.repeat(50)}
TOTAL    Logged${' '.repeat(22)}${totalLogged.toFixed(1)} hrs
         Unmatched${' '.repeat(19)}${totalUnmatched.toFixed(1)} hrs
         In meetings${' '.repeat(17)}${totalMeetings.toFixed(1)} hrs
${'━'.repeat(50)}
Generated by KAI · ${now}`;

  const copyEl = document.getElementById('tcCopyText');
  const copySection = document.getElementById('tcCopySection');
  if (copyEl) copyEl.textContent = copyText;
  if (copySection) copySection.style.display = 'block';
}

function copyTimecodes() {
  const text = document.getElementById('tcCopyText')?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('tcCopyBtn');
    if (btn) { btn.textContent = 'Copied!'; btn.style.background = 'var(--green)'; setTimeout(() => { btn.textContent = 'Copy'; btn.style.background = ''; }, 2000); }
  });
}

// ── HELP ──

function openHelp() {
  document.getElementById('helpOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeHelpSheet() {
  document.getElementById('helpOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function closeHelp(e) {
  if (e.target === document.getElementById('helpOverlay')) closeHelpSheet();
}
