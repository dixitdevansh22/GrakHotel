/**
 * GRAK Hotel — Production Backend Server
 * Node.js + Express + sqlite3
 */

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const nodemailer   = require('nodemailer');
const sqlite3      = require('sqlite3').verbose();
const path         = require('path');
require('dotenv').config();

// ─── APP SETUP ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ─── DATABASE SETUP ──────────────────────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'grakhotel.db'), (err) => {
  if (err) console.error('DB connection error:', err);
  else console.log('Database connected.');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref  TEXT UNIQUE NOT NULL,
    guest_name   TEXT NOT NULL,
    email        TEXT NOT NULL,
    phone        TEXT NOT NULL,
    room_type    TEXT NOT NULL,
    check_in     TEXT NOT NULL,
    check_out    TEXT NOT NULL,
    guests       INTEGER NOT NULL DEFAULT 1,
    special_req  TEXT,
    status       TEXT DEFAULT 'pending',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS service_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    request_ref  TEXT UNIQUE NOT NULL,
    guest_name   TEXT NOT NULL,
    email        TEXT NOT NULL,
    phone        TEXT,
    room_no      TEXT,
    service_cat  TEXT NOT NULL,
    priority     TEXT DEFAULT 'Normal',
    preferred_dt TEXT,
    details      TEXT NOT NULL,
    status       TEXT DEFAULT 'open',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    phone        TEXT,
    subject      TEXT,
    message      TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', methods: ['GET','POST'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests. Please try again in 15 minutes.' }
});
app.use('/api/', apiLimiter);

// ─── EMAIL TRANSPORTER ───────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generateRef(prefix) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

async function sendEmail(options) {
  if (!process.env.SMTP_USER) {
    console.log('[Email skipped — SMTP not configured]', options.subject);
    return;
  }
  try {
    await transporter.sendMail({ from: `"GRAK Hotel Etah" <${process.env.SMTP_USER}>`, ...options });
  } catch (err) {
    console.error('[Email error]', err.message);
  }
}

function roomPrice(roomType) {
  const prices = { 'Comfort Room': 3500, 'Executive Suite': 5500, 'Maharaja Suite': 8500 };
  return prices[roomType] || 3500;
}

function nightsBetween(checkIn, checkOut) {
  return Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── DB HELPER (promisify) ────────────────────────────────────────────────────
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'GRAK Hotel API is running.', timestamp: new Date().toISOString() });
});

// ── ROOM BOOKING ──────────────────────────────────────────────────────────────
app.post('/api/booking', async (req, res) => {
  const { guest_name, email, phone, room_type, check_in, check_out, guests, special_req } = req.body;

  if (!guest_name || !email || !phone || !room_type || !check_in || !check_out)
    return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
  if (!validateEmail(email))
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });

  const checkInDate  = new Date(check_in);
  const checkOutDate = new Date(check_out);
  if (checkInDate >= checkOutDate)
    return res.status(400).json({ success: false, message: 'Check-out must be after check-in.' });
  if (checkInDate < new Date())
    return res.status(400).json({ success: false, message: 'Check-in date cannot be in the past.' });

  const validRooms = ['Comfort Room', 'Executive Suite', 'Maharaja Suite'];
  if (!validRooms.includes(room_type))
    return res.status(400).json({ success: false, message: 'Invalid room type selected.' });

  const booking_ref = generateRef('GRK');
  const nights      = nightsBetween(check_in, check_out);
  const total_price = nights * roomPrice(room_type);

  try {
    await dbRun(
      `INSERT INTO bookings (booking_ref, guest_name, email, phone, room_type, check_in, check_out, guests, special_req)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [booking_ref, guest_name, email, phone, room_type, check_in, check_out, guests || 1, special_req || '']
    );

    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@grakhotel.com',
      subject: `New Booking [${booking_ref}] — ${room_type} — ${guest_name}`,
      html: bookingEmailHtml({ booking_ref, guest_name, email, phone, room_type, check_in, check_out, guests, special_req, nights, total_price }),
    });
    await sendEmail({
      to: email,
      subject: `Your GRAK Hotel Booking Confirmed — ${booking_ref}`,
      html: bookingConfirmHtml({ booking_ref, guest_name, room_type, check_in, check_out, nights, total_price }),
    });

    return res.status(201).json({ success: true, message: 'Booking submitted successfully!', booking_ref, nights, total_price, room_type });
  } catch (err) {
    console.error('[Booking error]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// ── SERVICE REQUEST ───────────────────────────────────────────────────────────
app.post('/api/service-request', async (req, res) => {
  const { guest_name, email, phone, room_no, service_cat, priority, preferred_dt, details } = req.body;

  if (!guest_name || !email || !details || !service_cat)
    return res.status(400).json({ success: false, message: 'Name, email, service category and details are required.' });
  if (!validateEmail(email))
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });

  const request_ref = generateRef('SRQ');

  try {
    await dbRun(
      `INSERT INTO service_requests (request_ref, guest_name, email, phone, room_no, service_cat, priority, preferred_dt, details)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [request_ref, guest_name, email, phone || '', room_no || '', service_cat, priority || 'Normal', preferred_dt || '', details]
    );

    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@grakhotel.com',
      subject: `Service Request [${priority || 'Normal'}] — ${service_cat} — ${guest_name}`,
      html: serviceEmailHtml({ request_ref, guest_name, email, phone, room_no, service_cat, priority, preferred_dt, details }),
    });
    await sendEmail({
      to: email,
      subject: `Service Request Received — ${request_ref} | GRAK Hotel`,
      html: serviceAckHtml({ request_ref, guest_name, service_cat, priority }),
    });

    return res.status(201).json({ success: true, message: 'Service request submitted. Our team will respond within 2 hours.', request_ref });
  } catch (err) {
    console.error('[Service request error]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// ── CONTACT ───────────────────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !message)
    return res.status(400).json({ success: false, message: 'Name, email and message are required.' });
  if (!validateEmail(email))
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });

  try {
    await dbRun(
      `INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)`,
      [name, email, phone || '', subject || 'General Enquiry', message]
    );
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@grakhotel.com',
      subject: `Website Enquiry from ${name} — ${subject || 'General'}`,
      html: `<p><b>From:</b> ${name} (${email})<br><b>Phone:</b> ${phone||'N/A'}<br><b>Subject:</b> ${subject||'General'}</p><p>${message.replace(/\n/g,'<br>')}</p>`,
    });
    return res.status(201).json({ success: true, message: 'Your message has been sent. We will reply within 24 hours.' });
  } catch (err) {
    console.error('[Contact error]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// ── AVAILABILITY ──────────────────────────────────────────────────────────────
app.get('/api/availability', async (req, res) => {
  const { room_type, check_in, check_out } = req.query;
  if (!room_type || !check_in || !check_out)
    return res.status(400).json({ success: false, message: 'room_type, check_in and check_out are required.' });

  try {
    const conflict = await dbGet(
      `SELECT COUNT(*) as cnt FROM bookings WHERE room_type=? AND status!='cancelled' AND check_in<? AND check_out>?`,
      [room_type, check_out, check_in]
    );
    const available = conflict.cnt === 0;
    return res.json({ success: true, room_type, check_in, check_out, available,
      message: available ? 'Room is available.' : 'Room not available for selected dates.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── FALLBACK ──────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✦ GRAK Hotel backend running at http://localhost:${PORT}\n`);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════
function emailWrapper(content) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#0d0d0d;color:#e8e0d0;margin:0;padding:0}
  .wrap{max-width:600px;margin:0 auto;background:#1a1a1a;border-top:3px solid #C9A84C}
  .header{background:#0d0d0d;padding:2rem;text-align:center;border-bottom:1px solid #2c2c2c}
  .logo{font-family:Georgia,serif;font-size:2rem;letter-spacing:0.3em;color:#C9A84C}
  .body{padding:2rem}
  .row{display:flex;justify-content:space-between;margin-bottom:0.8rem;font-size:0.88rem}
  .label{color:#9a9080;width:40%}
  .val{color:#faf8f3;font-weight:500;text-align:right}
  .ref{background:#2c2c2c;border-left:3px solid #C9A84C;padding:1rem;margin:1.5rem 0;font-family:monospace;font-size:1rem;color:#C9A84C}
  .footer{background:#0d0d0d;padding:1.2rem;text-align:center;font-size:0.7rem;color:#9a9080;border-top:1px solid #2c2c2c}
  h2{color:#C9A84C;font-family:Georgia,serif;font-weight:300;margin-bottom:1rem}
</style></head><body>
<div class="wrap">
  <div class="header"><div class="logo">GRAK HOTEL</div></div>
  <div class="body">${content}</div>
  <div class="footer">GRAK Hotel • Civil Lines, Etah, Uttar Pradesh 207001<br>+91 98765 43210 • reservations@grakhotel.com</div>
</div></body></html>`;
}

function bookingEmailHtml(d) {
  return emailWrapper(`
    <h2>New Booking Received</h2>
    <div class="ref">Booking Ref: ${d.booking_ref}</div>
    <div class="row"><span class="label">Guest Name</span><span class="val">${d.guest_name}</span></div>
    <div class="row"><span class="label">Email</span><span class="val">${d.email}</span></div>
    <div class="row"><span class="label">Phone</span><span class="val">${d.phone}</span></div>
    <div class="row"><span class="label">Room Type</span><span class="val">${d.room_type}</span></div>
    <div class="row"><span class="label">Check-in</span><span class="val">${d.check_in}</span></div>
    <div class="row"><span class="label">Check-out</span><span class="val">${d.check_out}</span></div>
    <div class="row"><span class="label">Nights</span><span class="val">${d.nights}</span></div>
    <div class="row"><span class="label">Estimated Total</span><span class="val">₹${d.total_price.toLocaleString('en-IN')}</span></div>
    ${d.special_req ? `<div class="row"><span class="label">Special Requests</span><span class="val">${d.special_req}</span></div>` : ''}
  `);
}

function bookingConfirmHtml(d) {
  return emailWrapper(`
    <h2>Booking Confirmed ✦</h2>
    <p style="color:#9a9080;margin-bottom:1.5rem">Dear ${d.guest_name}, thank you for choosing GRAK Hotel.</p>
    <div class="ref">Booking Ref: ${d.booking_ref}</div>
    <div class="row"><span class="label">Room</span><span class="val">${d.room_type}</span></div>
    <div class="row"><span class="label">Check-in</span><span class="val">${d.check_in} (2:00 PM)</span></div>
    <div class="row"><span class="label">Check-out</span><span class="val">${d.check_out} (11:00 AM)</span></div>
    <div class="row"><span class="label">Nights</span><span class="val">${d.nights}</span></div>
    <div class="row"><span class="label">Estimated Total</span><span class="val">₹${d.total_price.toLocaleString('en-IN')}</span></div>
    <p style="color:#9a9080;font-size:0.8rem;margin-top:1.5rem">Our team will contact you within 2 hours to confirm your stay.</p>
  `);
}

function serviceEmailHtml(d) {
  return emailWrapper(`
    <h2>Service Request — ${d.priority || 'Normal'} Priority</h2>
    <div class="ref">Request Ref: ${d.request_ref}</div>
    <div class="row"><span class="label">Service</span><span class="val">${d.service_cat}</span></div>
    <div class="row"><span class="label">Guest</span><span class="val">${d.guest_name}</span></div>
    <div class="row"><span class="label">Room</span><span class="val">${d.room_no || 'Not specified'}</span></div>
    <div class="row"><span class="label">Email</span><span class="val">${d.email}</span></div>
    <div class="row"><span class="label">Phone</span><span class="val">${d.phone || 'Not provided'}</span></div>
    <div style="margin-top:1.5rem;padding:1rem;background:#2c2c2c;border-left:3px solid #C9A84C">
      <p style="color:#9a9080;font-size:0.75rem;margin-bottom:0.5rem">REQUEST DETAILS</p>
      <p style="color:#faf8f3">${d.details.replace(/\n/g,'<br>')}</p>
    </div>
  `);
}

function serviceAckHtml(d) {
  return emailWrapper(`
    <h2>Service Request Received ✦</h2>
    <p style="color:#9a9080;margin-bottom:1.5rem">Dear ${d.guest_name}, your request has been received and will be responded to within 2 hours.</p>
    <div class="ref">Request Ref: ${d.request_ref}</div>
    <div class="row"><span class="label">Service</span><span class="val">${d.service_cat}</span></div>
    <div class="row"><span class="label">Priority</span><span class="val">${d.priority || 'Normal'}</span></div>
  `);
}
