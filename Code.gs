/**
 * Neeta's Makeover Studio — Booking Backend
 * Google Apps Script Web App
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire file → Save (Ctrl+S)
 * 3. Click Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who can access: Anyone
 * 4. Click Deploy → Copy the Web App URL
 * 5. Paste that URL into index.html at: const APPS_SCRIPT_URL = 'PASTE_HERE';
 *    Also paste it into admin.html at:  const APPS_SCRIPT_URL = 'PASTE_HERE';
 * 6. Push both files to GitHub → Vercel auto-deploys
 *
 * OWNER DASHBOARD:
 * Visit https://neetasmakeoverstudio.in/admin.html
 * Password is set below in ADMIN_PASSWORD
 */

// ── CONFIGURATION ──────────────────────────────────────────────────────────────

// WhatsApp notification numbers (owner's numbers)
const PHONE_1 = '918318410873';   // +91 83184 10873
const PHONE_2 = '919450155997';   // +91 94501 55997

// CallMeBot API keys (optional — leave as-is if not using WhatsApp notifications)
const CALLMEBOT_KEY_1 = 'REPLACE_WITH_KEY_FOR_8318410873';
const CALLMEBOT_KEY_2 = 'REPLACE_WITH_KEY_FOR_9450155997';

// Admin dashboard password — change this to something only you know
const ADMIN_PASSWORD = 'neeta@1234';

// Google Sheet name where bookings are stored
const SHEET_NAME = 'Bookings';

// ── JSON RESPONSE HELPER ────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET ENDPOINTS ───────────────────────────────────────────────────────────────
//
//  ?action=slots&date=YYYY-MM-DD          → { booked: ["11:00", ...] }
//  ?action=all&password=XXX               → { bookings: [...] }
//  ?action=cancel&password=XXX&row=N      → { ok: true }

function doGet(e) {
  try {
    const action = e.parameter.action;

    // ── Public: booked slots for a date ──
    if (action === 'slots') {
      const date = e.parameter.date;
      if (!date) return jsonResponse({ error: 'Missing date' });
      const sheet = getSheet();
      const data  = sheet.getDataRange().getValues();
      const booked = [];
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === date && String(data[i][5]) !== 'CANCELLED') {
          booked.push(String(data[i][1]));
        }
      }
      return jsonResponse({ booked });
    }

    // ── Admin: all bookings ──
    if (action === 'all') {
      if (e.parameter.password !== ADMIN_PASSWORD) {
        return jsonResponse({ error: 'Unauthorized' });
      }
      const sheet = getSheet();
      const data  = sheet.getDataRange().getValues();
      const bookings = [];
      for (let i = 1; i < data.length; i++) {
        if (!data[i][0]) continue; // skip empty rows
        bookings.push({
          row:      i + 1,
          date:     String(data[i][0]),
          time:     String(data[i][1]),
          name:     String(data[i][2]),
          phone:    String(data[i][3]),
          bookedAt: String(data[i][4]),
          status:   String(data[i][5]),
        });
      }
      return jsonResponse({ bookings });
    }

    // ── Admin: cancel a booking ──
    if (action === 'cancel') {
      if (e.parameter.password !== ADMIN_PASSWORD) {
        return jsonResponse({ error: 'Unauthorized' });
      }
      const row = parseInt(e.parameter.row);
      if (!row || row < 2) return jsonResponse({ error: 'Invalid row' });
      const sheet = getSheet();
      sheet.getRange(row, 6).setValue('CANCELLED');
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── POST: Save booking + send notifications ─────────────────────────────────────
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
          String(existing[i][5]) !== 'CANCELLED') {
        return jsonResponse({ ok: false, error: 'This slot was just booked by someone else. Please choose another time.' });
      }
    }

    // Save the booking
    const timestamp = new Date().toISOString();
    sheet.appendRow([date, time, name, phone, timestamp, 'CONFIRMED']);

    // Send WhatsApp notifications (if CallMeBot keys are configured)
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
  if (!apiKey || apiKey.startsWith('REPLACE_')) return;
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(text)}&apikey=${apiKey}`;
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (err) {
    Logger.log('WhatsApp send error: ' + err.message);
  }
}

function formatDatePretty(dateStr) {
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTimePretty(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
