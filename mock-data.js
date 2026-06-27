/* ── KAI — Knowledge Action Intelligence ── */
/* mock-data.js — hardcoded demo data for offline / Google-independent demo mode */
/* Data matches the seed.html spec exactly. Dates anchor to current week dynamically. */
/* v4.2 — 3 Friday events, full week scaffold */

// ── DEMO MODE FLAG ──
// Set to true by startDemoMode(), checked by fetchEmails / fetchCalendar stubs
let DEMO_MODE = false;

// ── DATE ANCHORING ──
// All mock dates are computed relative to the current week's Monday
// so the demo always shows "this week" regardless of when it's run

function getMockWeekDates() {
  // Build today's date string from local time parts — avoids UTC/BST shift
  const now = new Date();
  const todayLocal = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  // Parse back using T12:00:00 to stay in local time zone safely
  const today = new Date(todayLocal + 'T12:00:00');
  const dow = today.getDay(); // 0=Sun,1=Mon...
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);

  const localDateStr = (d) =>
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

  const dates = {};
  ['mon','tue','wed','thu','fri'].forEach((key, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates[key] = localDateStr(dt);
  });
  return dates;
}

// ── MOCK EMAILS ──
// Shape matches parseEmail() output exactly:
// { id, from, fromEmail, subject, snippet, body, time, priority, unread }

function getMockEmails() {
  return [
    {
      id: 'mock-email-1',
      from: 'Sarah Chen',
      fromEmail: 'sarah.chen.director@org.co.uk',
      subject: 'URGENT: Strategy paper needed by 2pm today',
      snippet: 'I need the platform strategy paper on my desk before the 2pm ExCo briefing. This is blocking the board decision.',
      body: `Hi,

I need the platform strategy paper on my desk before the 2pm ExCo briefing. This is blocking the board decision on the Digital Transformation programme funding.

Please can you ensure it covers:
- Current state architecture
- Target state and migration path
- Risk register summary
- Cost estimate for Phase 2

This is time-critical. The board meets at 3pm and I need time to review.

Sarah Chen
Director, Technology & Change`,
      time: '2h ago',
      priority: 'urgent',
      unread: true
    },
    {
      id: 'mock-email-2',
      from: 'Marcus Webb',
      fromEmail: 'marcus.webb@org.co.uk',
      subject: 'AI Control Framework — sign-off needed before Governance Board',
      snippet: 'The AI Control Framework paper needs your sign-off before it goes to the Governance Board tomorrow morning.',
      body: `Hi,

The AI Control Framework paper needs your sign-off before it goes to the Governance Board tomorrow morning at 10am.

I've incorporated the feedback from the last Architecture Review. Key changes:
- Section 3 updated with new model risk thresholds
- Appendix B now includes the vendor assessment matrix
- Data residency controls aligned to UK South requirement

Can you review and confirm by COB today?

Marcus Webb
Head of Risk & Technology`,
      time: '4h ago',
      priority: 'urgent',
      unread: true
    },
    {
      id: 'mock-email-3',
      from: 'James Thornton',
      fromEmail: 'james.thornton.cto@org.co.uk',
      subject: 'Control Plane analysis — still waiting',
      snippet: 'Following up on the Control Plane analysis I requested last week. This is now blocking the vendor evaluation.',
      body: `Hi,

Following up on the Control Plane analysis I requested last week. This is now blocking the vendor evaluation we have scheduled for next Tuesday.

We need to understand:
1. Current latency profile under load
2. Failure mode analysis for the API gateway layer
3. Recommendation on active/active vs active/passive for the DR configuration

I appreciate you're busy but this has been outstanding for 26 hours now.

James Thornton
Chief Technology Officer`,
      time: '26h ago',
      priority: 'high',
      unread: true
    },
    {
      id: 'mock-email-4',
      from: 'Priya Sharma',
      fromEmail: 'priya.sharma@org.co.uk',
      subject: 'PRJ-042 milestone review — overdue',
      snippet: 'The Q2 milestone review for PRJ-042 was due last Friday. Can we schedule 30 minutes this week?',
      body: `Hi,

The Q2 milestone review for PRJ-042 was due last Friday. We need to update the programme board on delivery status before the end of month report goes out.

Can we schedule 30 minutes this week? I have availability Tuesday afternoon or Thursday morning.

The key items to cover:
- RAG status update for all workstreams
- Dependency tracker review
- Budget vs actuals for Q2
- Risks and mitigations

Priya Sharma
Programme Manager, Digital Transformation`,
      time: '1d ago',
      priority: 'high',
      unread: true
    },
    {
      id: 'mock-email-5',
      from: 'Rachel Okonkwo',
      fromEmail: 'rachel.okonkwo@org.co.uk',
      subject: 'Architecture Guild — materials for Thursday session',
      snippet: 'Please find attached the agenda and pre-read materials for Thursday\'s Architecture Guild session.',
      body: `Hi all,

Please find attached the agenda and pre-read materials for Thursday's Architecture Guild session.

Agenda:
1. Review of cloud platform decisions (15 min)
2. API governance framework update (20 min)
3. PRJ-042 architecture checkpoint (25 min)
4. AOB

Pre-read: Cloud Strategy Decision Log v2.3 (attached)

The session will be recorded for those who cannot attend.

Rachel Okonkwo
EA Lead, Architecture Practice`,
      time: '3h ago',
      priority: 'normal',
      unread: false
    },
    {
      id: 'mock-email-6',
      from: 'IT Helpdesk',
      fromEmail: 'helpdesk.noreply@org.co.uk',
      subject: 'Your ticket INC0047821 has been updated',
      snippet: 'Your IT support ticket INC0047821 (VPN access issue) has been updated. Status: In Progress.',
      body: `This is an automated notification.

Your IT support ticket INC0047821 (VPN access issue) has been updated.

Status: In Progress
Assigned to: Infrastructure Team
Expected resolution: Within 4 hours

You will receive another notification when the ticket is resolved.

IT Helpdesk
Do not reply to this email.`,
      time: '5h ago',
      priority: 'fyi',
      unread: false
    },
    {
      id: 'mock-email-7',
      from: 'All Staff Newsletter',
      fromEmail: 'communications.noreply@org.co.uk',
      subject: 'This week at the organisation — staff bulletin',
      snippet: 'This week\'s staff bulletin includes updates on the new hybrid working policy, upcoming town hall, and wellbeing resources.',
      body: `Good morning,

This week's staff bulletin:

HYBRID WORKING POLICY UPDATE
The updated hybrid working policy takes effect from 1st July. Please review the guidance on the intranet.

TOWN HALL — 3RD JULY
The all-staff town hall will be held on 3rd July at 10am. Join via Teams or in-person at the main auditorium.

WELLBEING RESOURCES
New mental health resources are now available on the wellbeing hub. See the intranet for details.

Communications Team`,
      time: '8h ago',
      priority: 'fyi',
      unread: false
    }
  ];
}

// ── MOCK CALENDAR EVENTS ──
// Shape matches Google Calendar API items exactly:
// { id, summary, description, start: {dateTime|date}, end: {dateTime|date} }

function getMockCalendarEvents() {
  const d = getMockWeekDates();

  // Last week dates
  const lw = {};
  ['mon','tue','wed','thu','fri'].forEach((key, i) => {
    const dt = new Date(d.mon + 'T12:00:00');
    dt.setDate(dt.getDate() - 7 + i);
    lw[key] = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  });

  // Next week dates
  const nw = {};
  ['mon','tue','wed','thu','fri'].forEach((key, i) => {
    const dt = new Date(d.mon + 'T12:00:00');
    dt.setDate(dt.getDate() + 7 + i);
    nw[key] = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  });

  return [
    // ── MONDAY ──
    {
      id: 'mock-cal-1',
      summary: 'FOCUS: Platform Strategy Paper',
      description: 'KAI timecode: BAU-001\nProtected focus time — do not book.',
      start: { dateTime: d.mon + 'T09:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.mon + 'T11:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-2',
      summary: 'Director 1:1 — Sarah Chen',
      description: 'KAI timecode: GOV-011\nMonthly 1:1 with Director of Technology & Change.',
      start: { dateTime: d.mon + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.mon + 'T14:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-3',
      summary: 'Architecture Review — Control Plane',
      description: 'KAI timecode: PRJ-042\nReview of control plane analysis and vendor evaluation inputs.',
      start: { dateTime: d.mon + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.mon + 'T15:00:00', timeZone: 'Europe/London' }
    },

    // ── TUESDAY ──
    {
      id: 'mock-cal-4',
      summary: 'PREP: Governance Board',
      description: 'KAI timecode: BAU-001\nPrep slot before Governance Board.',
      start: { dateTime: d.tue + 'T09:30:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.tue + 'T10:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-5',
      summary: 'Governance Board',
      description: 'KAI timecode: GOV-011\nQuarterly Governance Board — AI Control Framework on agenda.',
      start: { dateTime: d.tue + 'T10:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.tue + 'T12:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-6',
      summary: 'PRJ-042 Digital Transformation Review',
      description: 'KAI timecode: PRJ-042\nQ2 milestone review with programme manager.',
      start: { dateTime: d.tue + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.tue + 'T15:00:00', timeZone: 'Europe/London' }
    },

    // ── WEDNESDAY — 6 back-to-backs, no lunch ──
    {
      id: 'mock-cal-7',
      summary: 'Platform Architecture Standup',
      description: 'KAI timecode: BAU-001\nDaily standup with platform architecture team.',
      start: { dateTime: d.wed + 'T09:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.wed + 'T09:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-8',
      summary: 'Vendor Briefing — Cloud Infrastructure',
      description: 'KAI timecode: PRJ-042\nAWS briefing on UK South resilience options.',
      start: { dateTime: d.wed + 'T09:30:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.wed + 'T10:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-9',
      summary: 'Risk Committee — Technology Sub-Group',
      description: 'KAI timecode: GOV-011\nTechnology risk sub-group. Standing agenda item.',
      start: { dateTime: d.wed + 'T10:30:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.wed + 'T11:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-10',
      summary: 'AI Strategy Peer Review',
      description: 'KAI timecode: PRJ-042\nPeer review of AI strategy paper before ExCo submission.',
      start: { dateTime: d.wed + 'T11:30:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.wed + 'T12:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-11',
      summary: 'Programme Director Catch-up',
      description: 'KAI timecode: BAU-001\nWeekly catch-up with programme director.',
      start: { dateTime: d.wed + 'T13:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.wed + 'T13:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-12',
      summary: 'Architecture Strategy — Leadership Briefing',
      description: 'KAI timecode: PRJ-042\nBriefing to leadership on 3-year architecture strategy.',
      start: { dateTime: d.wed + 'T13:30:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.wed + 'T16:00:00', timeZone: 'Europe/London' }
    },

    // ── THURSDAY — Travel day ──
    {
      id: 'mock-cal-13',
      summary: 'TRAVEL: London (All Day)',
      description: 'Travel to London for ExCo briefing and stakeholder meetings.',
      start: { date: d.thu },
      end:   { date: d.thu }
    },
    {
      id: 'mock-cal-14',
      summary: 'Transit: Manchester → London Euston',
      description: 'Avanti West Coast 07:23. Arrive 09:15.',
      start: { dateTime: d.thu + 'T07:23:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.thu + 'T09:15:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-15',
      summary: 'ExCo Technology Briefing',
      description: 'KAI timecode: GOV-011\nPresentation to ExCo on Digital Transformation programme status.',
      start: { dateTime: d.thu + 'T10:30:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.thu + 'T11:30:00', timeZone: 'Europe/London' }
    },

    // ── FRIDAY — Light day ──
    {
      id: 'mock-cal-16',
      summary: '1:1 with Programme Director (BAU-001)',
      description: 'KAI timecode: BAU-001\nWeekly catch-up with programme director.',
      start: { dateTime: d.fri + 'T10:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.fri + 'T11:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-17',
      summary: 'Architecture Peer Review (PRJ-042)',
      description: 'KAI timecode: PRJ-042\nPRJ-042 architecture peer review session.',
      start: { dateTime: d.fri + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.fri + 'T15:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-18',
      summary: 'KAI Timecode Reminder — log this week',
      description: 'KAI timecode: BAU-001\nWeekly reminder to submit timecodes before 5pm.',
      start: { dateTime: d.fri + 'T16:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: d.fri + 'T16:15:00', timeZone: 'Europe/London' }
    },

    // ── LAST WEEK ──
    {
      id: 'mock-cal-lw-1',
      summary: 'FOCUS: Platform Strategy Review',
      description: 'KAI timecode: PRJ-042\nProtected focus time.',
      start: { dateTime: lw.mon + 'T09:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.mon + 'T11:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-2',
      summary: 'Technology Committee (GOV-011)',
      description: 'KAI timecode: GOV-011\nMonthly Technology Committee.',
      start: { dateTime: lw.mon + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.mon + 'T15:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-3',
      summary: 'PRJ-042 Sprint Planning',
      description: 'KAI timecode: PRJ-042\nDigital Transformation sprint planning.',
      start: { dateTime: lw.tue + 'T10:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.tue + 'T11:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-4',
      summary: 'Stakeholder Briefing — Risk Team (GOV-011)',
      description: 'KAI timecode: GOV-011\nRisk team briefing on AI governance.',
      start: { dateTime: lw.tue + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.tue + 'T15:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-5',
      summary: 'Team Standup (BAU-001)',
      description: 'KAI timecode: BAU-001\nDaily standup.',
      start: { dateTime: lw.wed + 'T09:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.wed + 'T09:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-6',
      summary: 'Architecture Review (PRJ-042)',
      description: 'KAI timecode: PRJ-042\nArchitecture review session.',
      start: { dateTime: lw.wed + 'T11:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.wed + 'T12:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-7',
      summary: 'TRAVEL: Birmingham — Regional Office',
      description: 'Travel day — regional office visit.',
      start: { date: lw.thu },
      end:   { date: lw.thu }
    },
    {
      id: 'mock-cal-lw-8',
      summary: 'Regional Leadership Briefing (GOV-011)',
      description: 'KAI timecode: GOV-011\nLeadership briefing at regional office.',
      start: { dateTime: lw.thu + 'T10:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.thu + 'T11:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-9',
      summary: '1:1 with Programme Director (BAU-001)',
      description: 'KAI timecode: BAU-001\nWeekly 1:1.',
      start: { dateTime: lw.fri + 'T10:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.fri + 'T11:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-lw-10',
      summary: 'KAI Timecode Reminder — log this week',
      description: 'KAI timecode: BAU-001\nWeekly timecode reminder.',
      start: { dateTime: lw.fri + 'T16:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: lw.fri + 'T16:15:00', timeZone: 'Europe/London' }
    },

    // ── NEXT WEEK ──
    {
      id: 'mock-cal-nw-1',
      summary: 'FOCUS: AI Strategy Paper',
      description: 'KAI timecode: PRJ-042\nProtected focus time for AI strategy paper.',
      start: { dateTime: nw.mon + 'T09:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: nw.mon + 'T11:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-nw-2',
      summary: 'PRJ-042 Milestone Review — Priya Sharma',
      description: 'KAI timecode: PRJ-042\nQ2 milestone review with programme manager.',
      start: { dateTime: nw.tue + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: nw.tue + 'T14:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-nw-2b',
      summary: 'Technology Committee — AI Governance (GOV-011)',
      description: 'KAI timecode: GOV-011\nEmergency Technology Committee session on AI governance framework sign-off.',
      start: { dateTime: nw.tue + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: nw.tue + 'T15:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-nw-3',
      summary: 'Team Standup (BAU-001)',
      description: 'KAI timecode: BAU-001\nDaily standup.',
      start: { dateTime: nw.wed + 'T09:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: nw.wed + 'T09:30:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-nw-4',
      summary: 'Governance Board (GOV-011)',
      description: 'KAI timecode: GOV-011\nQuarterly Governance Board.',
      start: { dateTime: nw.wed + 'T10:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: nw.wed + 'T12:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-nw-5',
      summary: 'Architecture Peer Review (PRJ-042)',
      description: 'KAI timecode: PRJ-042\nArchitecture peer review.',
      start: { dateTime: nw.thu + 'T14:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: nw.thu + 'T15:00:00', timeZone: 'Europe/London' }
    },
    {
      id: 'mock-cal-nw-6',
      summary: 'Risk Review (GOV-011)',
      description: 'KAI timecode: GOV-011\nQuarterly risk review.',
      start: { dateTime: nw.fri + 'T10:00:00', timeZone: 'Europe/London' },
      end:   { dateTime: nw.fri + 'T11:00:00', timeZone: 'Europe/London' }
    }
  ];
}

// ── DEMO MODE ENTRY POINT ──
// Called when user clicks "Try Demo Mode" on auth screen
// Bypasses all Google API calls and loads the app with mock data

function startDemoMode() {
  const modal = document.getElementById('demoPasswordModal');
  modal.style.display = 'flex';
  document.getElementById('demoPasswordInput').value = '';
  document.getElementById('demoPasswordError').textContent = '';
  setTimeout(() => document.getElementById('demoPasswordInput').focus(), 100);
}

function closeDemoPasswordModal() {
  document.getElementById('demoPasswordModal').style.display = 'none';
}

function submitDemoPassword() {
  const pwd = document.getElementById('demoPasswordInput').value;
  if (pwd !== 'KAI-Demo-2026') {
    document.getElementById('demoPasswordError').textContent = 'Incorrect password. Please try again.';
    document.getElementById('demoPasswordInput').select();
    return;
  }
  closeDemoPasswordModal();
  DEMO_MODE = true;

  // Set a fake user display name in session
  sessionStorage.setItem('userEmail', 'demo.user@kai-demo.mode');

  // Patch fetchEmails and fetchCalendar to return mock data
  // These are defined in app.js but reassigned here before loadApp() runs
  window._fetchEmailsReal    = window.fetchEmails;
  window._fetchCalendarReal  = window.fetchCalendar;

  window.fetchEmails   = async () => getMockEmails();
  window.fetchCalendar = async () => getMockCalendarEvents();

  // Patch createCalendarEvent to simulate success in demo mode
  window._createCalendarEventReal = window.createCalendarEvent;
  window.createCalendarEvent = async (title, dateStr, timeStr, durationMins) => {
    // Simulate a created event — add to calendarData in memory
    const id = 'mock-created-' + Date.now();
    const start = timeStr
      ? { dateTime: dateStr + 'T' + timeStr + ':00', timeZone: 'Europe/London' }
      : { date: dateStr };
    const end = timeStr
      ? { dateTime: new Date(new Date(dateStr + 'T' + timeStr + ':00').getTime() + durationMins * 60000).toISOString(), timeZone: 'Europe/London' }
      : { date: dateStr };
    const ev = { id, summary: title, description: 'Created by KAI — Demo Mode', start, end };
    calendarData.push(ev);
    return { id, htmlLink: null };
  };

  // Patch Drive functions to no-ops in demo mode (no real Drive access)
  window.loadKaiNotes = async () => {
    kaiNotes = { actions: [], lastUpdated: null };
    renderNotes();
    const el = document.getElementById('notesStatus');
    if (el) el.textContent = 'Demo mode — changes not saved';
  };
  window.saveKaiNotes = async () => { /* no-op in demo */ };
  window.ensureKaiNotesFile = async () => null;

  loadApp();
}
