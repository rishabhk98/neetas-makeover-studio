/**
 * Neeta's Makeover Studio — Booking Backend
 * Google Apps Script Web App
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire file → Save (Ctrl+S)
 * 3. Fill in CALLMEBOT_KEY_1 and CALLMEBOT_KEY_2 below (see CallMeBot setup)
 * 4. Click Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who can access: Anyone
 * 5. Click Deploy → Copy the Web App URL
 * 6. Paste that URL into index.html at: const APPS_SCRIPT_URL = 'PASTE_HERE';
 * 7. Push index.html to GitHub → Vercel auto-deploys
 *
 * CALLMEBOT SETUP (do once per WhatsApp number):
 * 1. Save +34 644 32 44 47 as a WhatsApp contact
 * 2. Send the message: I allow callmebot to send me messages
 * 3. You'll receive an API key via WhatsApp (e.g. "1234567")
 * 4. Paste the key below for each phone number
 */

// ── CONFIGURATION ──────────────────────────────────────────────────────────────

// WhatsApp notification numbers (owner's numbers)
const PHONE_1 = '918318410873';   // +91 83184 10873
const PHONE_2 = '919450155997';   // +91 94501 55997

// CallMeBot API keys (get these by following setup instructions above)
const CALLMEBOT_KEY_1 = 'REPLACE_WITH_KEY_FOR_8318410873';
const CALLMEBOT_KEY_2 = 'REPLACE_WITH_KEY_FOR_9450155997';

// Google Sheet name where bookings are stored
const SHEET_NAME = 'Bookings';

// ── CORS HEADERS ───────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET: Return booked slots for a date ────────────────────────────────────────
// URL: ?action=slots&date=YYYY-MM-DD
// Returns: { booked: ["11:00", "14:30", ...] }

function doGet(e) {
  try {
    const action = e.parameter.action;
    const date   = e.parameter.date;

    if (action === 'slots' && date) {
      const sheet = getSheet();
      const data  = sheet.getDataRange().getValues();
      const booked = [];

      // Column indices: A=date, B=time, C=name, D=phone, E=timestamp
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === date && data[i][5] !== 'CANCELLED') {
          booked.push(String(data[i][1]));
        }
      }

      return jsonResponse({ booked });
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── POST: Save booking + send WhatsApp notifications ──────────────────────────
// Body: { name, phone, date, time }
// Returns: { ok: true } or { ok: false, error: "..." }

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { name, phone, date, time } = body;

    if (!name || !phone || !date || !time) {
      return jsonResponse({ ok: false, error: 'Missing required fields' });
    }

    const sheet = getSheet();

    // Race condition guard: check slot is still free
    const existing = sheet.getDataRange().getValues();
    for (let i = 1; i < existing.length; i++) {
      if (String(existing[i][0]) === date &&
          String(existing[i][1]) === time &&
          existing[i][5] !== 'CANCELLED') {
        return jsonResponse({ ok: false, error: 'This slot was just booked by someone else. Please choose another time.' });
      }
    }

    // Save the booking
    const timestamp = new Date().toISOString();
    sheet.appendRow([date, time, name, phone, timestamp, 'CONFIRMED']);

    // Send WhatsApp notifications to both owner numbers
    const prettyDate = formatDatePretty(date);
    const prettyTime = formatTimePretty(time);
    const message = `🌸 New Appointment!\n\n👤 ${name}\n📞 ${phone}\n📅 ${prettyDate}\n⏰ ${prettyTime}\n\nReply to confirm.\n— Neeta's Makeover Studio`;

    sendWhatsApp(CALLMEBOT_KEY_1, PHONE_1, message);
    sendWhatsApp(CALLMEBOT_KEY_2, PHONE_2, message);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────────

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Date', 'Time', 'Name', 'Phone', 'Booked At', 'Status']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sendWhatsApp(apiKey, phone, text) {
  if (!apiKey || apiKey.startsWith('REPLACE_')) return; // Skip if not configured
  try {
    const encodedText = encodeURIComponent(text);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedText}&apikey=${apiKey}`;
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (err) {
    Logger.log('WhatsApp send error: ' + err.message);
  }
}

function formatDatePretty(dateStr) {
  // dateStr: "YYYY-MM-DD"
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTimePretty(timeStr) {
  // timeStr: "HH:MM"
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
