/* ── KAI — Knowledge Action Intelligence ── */
/* utils.js — pure utility and helper functions, Phase B refactor */
/* No DOM dependencies. All functions are pure or self-contained. */

// ── DATE & TIME UTILITIES ──

// Returns YYYY-MM-DD for today in local time
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// Returns the short day name (MON, TUE etc) for a YYYY-MM-DD or ISO date string
// Appends T12:00:00 to avoid UTC midnight BST day-shift bug
function getDayName(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr);
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
}

// Returns a formatted date string e.g. "Monday, 23 June"
function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Returns event start time as HH:MM string, or 'All day'
function getTime(ev) {
  if (ev.start?.date) return 'All day';
  if (!ev.start?.dateTime) return '';
  return new Date(ev.start.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Returns the Monday of the week containing `date` (YYYY-MM-DD), offset by offsetWeeks
function getWeekStart(date, offsetWeeks = 0) {
  const d = new Date(date + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  return d.toISOString().split('T')[0];
}

// Returns the Friday of the week starting at weekStart (YYYY-MM-DD)
function getWeekEnd(weekStart) {
  const d = new Date(weekStart + 'T12:00:00');
  d.setDate(d.getDate() + 4);
  return d.toISOString().split('T')[0];
}

// Resolves natural language date references to a YYYY-MM-DD string
// Used by calendar command parser and action due date extraction
function extractDueDate(text) {
  const t = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Returns the date of the next occurrence of a weekday (0=Sun..6=Sat)
  // If today IS that day, returns today (not next week)
  function nextWeekday(target) {
    const d = new Date(today);
    const diff = (target - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }

  if (t.includes('today'))      return today.toISOString().split('T')[0];
  if (t.includes('tomorrow'))   { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
  if (t.includes('friday'))     return nextWeekday(5);
  if (t.includes('thursday'))   return nextWeekday(4);
  if (t.includes('wednesday'))  return nextWeekday(3);
  if (t.includes('tuesday'))    return nextWeekday(2);
  if (t.includes('monday'))     return nextWeekday(1);
  if (t.includes('next week'))  { const d = new Date(today); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; }
  if (t.includes('end of week')) return nextWeekday(5);
  if (t.includes('end of month')) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return d.toISOString().split('T')[0];
  }
  return null;
}

// ── CALENDAR EVENT UTILITIES ──

// Returns duration of a calendar event in decimal hours
function getEventHours(ev) {
  if (!ev.start?.dateTime || !ev.end?.dateTime) return 0;
  return (new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 3600000;
}

// Returns all events from calendarData within a date range (inclusive)
function getEventsForRange(startDate, endDate) {
  return calendarData.filter(ev => {
    const d = ev.start?.dateTime?.split('T')[0] || ev.start?.date;
    if (!d) return false;
    return d >= startDate && d <= endDate;
  });
}

// ── TIMECODE DEFINITIONS & MATCHING ──

const TC_DEFINITIONS = [
  {
    code: 'PRJ-042', name: 'Digital Transformation',
    desc: 'Architecture, delivery, AI programme, vendor briefings',
    badgeClass: 'tc-badge-prj', hrsColor: 'var(--teal)',
    barColor: 'var(--teal)', barColorLt: '#C8E6CA',
    keywords: ['prj-042','digital transformation','architecture review','ai strategy','vendor briefing','control plane','peer review','milestone','architecture peer','architecture strategy'],
  },
  {
    code: 'GOV-011', name: 'Governance and Oversight',
    desc: 'Board meetings, risk reviews, compliance, policy',
    badgeClass: 'tc-badge-gov', hrsColor: 'var(--purple)',
    barColor: 'var(--purple)', barColorLt: '#D1C4E9',
    keywords: ['gov-011','governance','board','risk','compliance','framework','oversight','committee','technology committee','architecture guild','guild'],
  },
  {
    code: 'BAU-001', name: 'Business As Usual',
    desc: 'Standups, 1:1s, team meetings, general ops',
    badgeClass: 'tc-badge-bau', hrsColor: 'var(--amber)',
    barColor: 'var(--amber)', barColorLt: '#FFE082',
    keywords: ['bau-001','standup','stand-up','1:1','one to one','programme director','team meeting','catch up','catch-up'],
  },
];

// Matches a calendar event to a timecode — returns code string or null
function matchTimecode(ev) {
  const s = (ev.summary || '').toLowerCase();
  const d = (ev.description || '').toLowerCase();
  const combined = s + ' ' + d;
  // Skip non-meeting events
  if (s.includes('focus:') || s.includes('transit') || s.includes('kai timecode') || s.includes('prep:') || s.includes('travel')) return null;
  for (const tc of TC_DEFINITIONS) {
    if (tc.keywords.some(kw => combined.includes(kw))) return tc.code;
  }
  return null;
}

// ── EMAIL PRIORITY & SILENCE DETECTION ──

// Returns sender tier object for silence detector — { label, rank }
function getSenderTier(from) {
  const f = from.toLowerCase();
  if (f.includes('director') || f.includes('chief') || f.includes('cto') || f.includes('ceo')) return { label: 'Director', rank: 1 };
  if (f.includes('head of') || f.includes('vp ')) return { label: 'Head', rank: 2 };
  if (f.includes('manager') || f.includes('lead') || f.includes('senior')) return { label: 'Senior', rank: 3 };
  return { label: 'Colleague', rank: 4 };
}

// Converts a time-ago string ("3h ago", "2d ago") to hours
function getEmailAgeHours(timeStr) {
  if (!timeStr) return 0;
  if (timeStr.includes('h ago')) return parseInt(timeStr) || 0;
  if (timeStr.includes('d ago')) return (parseInt(timeStr) || 0) * 24;
  return 0;
}

// Determines if an email should be auto-archived for compliance
function shouldAutoArchive(email) {
  const combined = (email.subject + ' ' + (email.body || email.snippet || '')).toLowerCase();
  const complianceKeywords = [
    'approved', 'confirmed', 'sign off', 'signed off', 'authorised', 'authorized',
    'policy', 'regulatory', 'compliance', 'mandatory', 'governance', 'board',
    'decision', 'formal notice', 'annual leave', 'leave approved', 'risk',
    'data protection', 'gdpr', 'audit', 'framework', 'control'
  ];
  return complianceKeywords.some(kw => combined.includes(kw)) &&
    (email.priority === 'urgent' || email.priority === 'high');
}

// ── MEETING PRIORITY FOR CLASH RESOLUTION ──

// Returns priority string: 'critical' | 'high' | 'medium' | 'low'
function getMeetingPriority(ev) {
  const s = (ev.summary || '').toLowerCase();
  const d = (ev.description || '').toLowerCase();
  const combined = s + ' ' + d;
  // Own reminders and auto-created events — always low
  if (s.startsWith('reminder:') || s.includes('focus:') || s.includes('prep:') ||
      s.includes('focus block') || s.includes('transit') || s.includes('kai timecode') ||
      d.includes('created by kai') || d.includes('knowledge action intelligence')) return 'low';
  // Critical — never decline
  if (combined.includes('director') || combined.includes('exco') || combined.includes('1:1 with') ||
      combined.includes('board') || combined.includes('governance') || combined.includes('minister') ||
      combined.includes('cto') || s.includes('gov-011')) return 'critical';
  // High
  if (combined.includes('programme') || combined.includes('milestone') || combined.includes('prj-042') ||
      combined.includes('risk') || combined.includes('compliance') || combined.includes('stakeholder') ||
      combined.includes('mandatory') || combined.includes('required') || combined.includes('compulsory')) return 'high';
  // Medium
  if (combined.includes('guild') || combined.includes('peer review') || combined.includes('vendor') ||
      combined.includes('briefing') || combined.includes('catch-up') || combined.includes('catch up') ||
      combined.includes('bau-001') || combined.includes('standup') || combined.includes('stand-up')) return 'medium';
  // Training/health/wellbeing blocks — low unless mandatory
  if (s.includes('training') || s.includes('health') || s.includes('safety') || s.includes('e-learning')) return 'low';
  return 'medium';
}

// Numeric priority score map for clash resolution comparison
const PRIORITY_SCORE = { critical: 4, high: 3, medium: 2, low: 1 };

// Human-readable priority label with emoji
function getPriorityLabel(priority) {
  return { critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' }[priority] || '⚪ Unknown';
}

// ── WEATHER CODE HELPERS (used by Wellbeing travel day) ──

function weatherCodeToEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁️';
  if (code <= 49) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

function weatherCodeToDesc(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code <= 3) return 'Overcast';
  if (code <= 49) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Rain showers';
  return 'Thunderstorm';
}

// ── EMAIL CALENDAR INTENT PATTERNS ──

const MEETING_REQUEST_PATTERNS = [
  /can we (meet|catch up|find time|grab time|schedule|book)/i,
  /are you (free|available)/i,
  /let'?s (meet|catch up|connect|talk|discuss|schedule)/i,
  /(find|schedule|book|arrange) (a |an )?(meeting|call|time|slot|session)/i,
  /would (you|you be able to) (meet|join|attend)/i,
  /(quick |brief )?(call|chat|meeting|catch-?up)/i,
  /calendar invite/i,
  /when are you (free|available|next free)/i,
];

const APPROVAL_PATTERNS = [
  /(leave|holiday|annual leave|time off).{0,30}(approved|confirmed|granted)/i,
  /(approved|confirmed).{0,30}(leave|holiday|time off|annual leave)/i,
  /your (request|application).{0,30}(approved|granted|confirmed)/i,
];

const TRAINING_PATTERNS = [
  /(mandatory|required|compulsory).{0,40}(training|course|module|learning)/i,
  /(training|course|module).{0,40}(mandatory|required|compulsory|must complete|please complete)/i,
  /complete.{0,30}by/i,
  /compliance training/i,
  /you are required to (attend|complete)/i,
];

const DEADLINE_PATTERNS = [
  /(deadline|due date).{0,30}\d{1,2}[\/\-\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})/i,
  /submit.{0,30}by/i,
  /required by.{0,30}(monday|tuesday|wednesday|thursday|friday|\d)/i,
  /please (respond|reply|submit|complete|return).{0,30}by/i,
];

// Detects whether an email contains a calendar-actionable intent
// Returns { type: 'meeting'|'approval'|'training'|'deadline', email } or null
function detectEmailCalendarIntent(email) {
  const full = email.subject + ' ' + (email.body || email.snippet);
  if (MEETING_REQUEST_PATTERNS.some(p => p.test(full))) return { type: 'meeting', email };
  if (APPROVAL_PATTERNS.some(p => p.test(full)))        return { type: 'approval', email };
  if (TRAINING_PATTERNS.some(p => p.test(full)))        return { type: 'training', email };
  if (DEADLINE_PATTERNS.some(p => p.test(full)))        return { type: 'deadline', email };
  return null;
}

// ── CALENDAR COMMAND PARSER (regex-based fast path) ──
// Used as pre-check before calling Claude's detectCalendarIntent

function parseCalendarCommand(text) {
  const t = text.toLowerCase().trim();

  const onDay = text.match(/remind me (?:on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)(?:\s+at (\d{1,2}(?::\d{2})?))?(?:\s+to\s+|\s+about\s+|\s+to\s+complete\s+|\s+re[:\s])(.+)/i);
  if (onDay) {
    const dateStr = extractDueDate(onDay[1]);
    const timeRaw = onDay[2];
    const timeStr = timeRaw ? (timeRaw.includes(':') ? timeRaw : timeRaw + ':00').padStart(5,'0') : '09:00';
    return { title: 'Reminder: ' + onDay[3].trim(), dateStr, timeStr, duration: 15 };
  }

  const inDays = text.match(/remind me in (\d+) days?(?:\s+time)?(?:\s+(?:about|to))\s+(.+)/i);
  if (inDays) {
    const days = parseInt(inDays[1]);
    const d = new Date(); d.setDate(d.getDate() + days);
    return { title: 'Reminder: ' + inDays[2].trim(), dateStr: d.toISOString().split('T')[0], timeStr: '09:00', duration: 15 };
  }

  const tomorrowAt = text.match(/remind me tomorrow at (\d{1,2}(?::\d{2})?) (?:to |about )?(.+)/i);
  if (tomorrowAt) {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const time = tomorrowAt[1].includes(':') ? tomorrowAt[1] : tomorrowAt[1] + ':00';
    return { title: 'Reminder: ' + tomorrowAt[2].trim(), dateStr: d.toISOString().split('T')[0], timeStr: time.padStart(5,'0'), duration: 15 };
  }

  const addCal = text.match(/add (.+?) to my calendar(?: on)?(?: (?:monday|tuesday|wednesday|thursday|friday|tomorrow|today))?(?: at (\d{1,2}(?::\d{2})?))?/i);
  if (addCal) {
    const timeRaw = addCal[2];
    const timeStr = timeRaw ? (timeRaw.includes(':') ? timeRaw : timeRaw + ':00').padStart(5,'0') : '09:00';
    return { title: addCal[1].trim(), dateStr: extractDueDate(t) || todayStr(), timeStr, duration: 30 };
  }

  const blockFor = text.match(/block (.+?) for (.+)/i);
  if (blockFor) {
    return { title: blockFor[2].trim(), dateStr: extractDueDate(blockFor[1].trim()) || todayStr(), timeStr: '09:00', duration: 60 };
  }

  const createWith = text.match(/create (?:a )?meeting with (.+?) on (.+?)(?:\s+at (\d{1,2}(?::\d{2})?))?$/i);
  if (createWith) {
    const timeRaw = createWith[3];
    const timeStr = timeRaw ? (timeRaw.includes(':') ? timeRaw : timeRaw + ':00').padStart(5,'0') : '10:00';
    return { title: 'Meeting with ' + createWith[1].trim(), dateStr: extractDueDate(createWith[2].trim()) || todayStr(), timeStr, duration: 30 };
  }

  return null;
}

// ── NOTES / ACTIONS CONTEXT BUILDER ──

// Builds a plain-text summary of open KAI actions for the Claude system prompt
function buildNotesContext() {
  const open = kaiNotes.actions.filter(a => !a.done);
  if (!open.length) return '';
  const now = new Date();
  const overdue = open.filter(a => a.due && new Date(a.due + 'T12:00:00') < now);
  const lines = open.map(a => {
    const isOverdue = a.due && new Date(a.due + 'T12:00:00') < now;
    const dueStr = a.due ? ` (due ${new Date(a.due + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : '';
    return `- ${isOverdue ? '[OVERDUE] ' : ''}${a.text}${dueStr}`;
  }).join('\n');
  return `\nOPEN ACTIONS (${open.length} total, ${overdue.length} overdue):\n${lines}`;
}
