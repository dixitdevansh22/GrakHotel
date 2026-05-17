# GRAK Hotel — Deployment Guide
## Free Hosting on Render.com + GitHub

This guide takes you from zero to a live, professional website with a working backend.
Estimated time: **20–30 minutes**.

---

## What You Have

```
grak-hotel-backend/
├── server.js          ← Express backend (APIs, email, database)
├── package.json       ← Dependencies
├── .env.example       ← Environment variables template
├── .gitignore         ← Keeps secrets out of Git
└── public/
    └── index.html     ← Your full hotel website (API-connected)
```

---

## STEP 1 — Set Up Gmail App Password (for email sending)

> Skip this if you don't need email notifications yet — the backend still works, it just won't send emails.

1. Go to **myaccount.google.com** → Security → 2-Step Verification (enable it)
2. Then go to: **myaccount.google.com/apppasswords**
3. Create a new App Password → name it "GRAK Hotel"
4. Copy the 16-character password shown — you'll need it in Step 3.

---

## STEP 2 — Push Code to GitHub

1. Create a free account at **github.com**
2. Create a new **private** repository named `grak-hotel`
3. Open a terminal in your project folder and run:

```bash
git init
git add .
git commit -m "GRAK Hotel — initial backend"
git remote add origin https://github.com/YOUR_USERNAME/grak-hotel.git
git push -u origin main
```

---

## STEP 3 — Deploy Backend on Render (FREE)

1. Go to **render.com** → Sign up (free) → "New +" → **Web Service**
2. Connect your GitHub account and select the `grak-hotel` repository
3. Fill in these settings:

| Field            | Value                    |
|------------------|--------------------------|
| Name             | `grak-hotel`             |
| Region           | Singapore (closest to India) |
| Branch           | `main`                   |
| Root Directory   | *(leave blank)*          |
| Runtime          | **Node**                 |
| Build Command    | `npm install`            |
| Start Command    | `node server.js`         |
| Instance Type    | **Free**                 |

4. Scroll down to **Environment Variables** → click "Add Environment Variable":

| Key              | Value                            |
|------------------|----------------------------------|
| `SMTP_HOST`      | `smtp.gmail.com`                 |
| `SMTP_PORT`      | `587`                            |
| `SMTP_SECURE`    | `false`                          |
| `SMTP_USER`      | `your-gmail@gmail.com`           |
| `SMTP_PASS`      | `your-16-char-app-password`      |
| `ADMIN_EMAIL`    | `admin@grakhotel.com`            |
| `ALLOWED_ORIGIN` | `https://your-app.onrender.com`  |

5. Click **Create Web Service**
6. Wait ~3 minutes. Your site will be live at:
   `https://grak-hotel.onrender.com`

> ⚠️ **Free Render note:** The free tier "spins down" after 15 minutes of inactivity and takes ~30 seconds to wake up on next visit. This is fine for a hotel website with real traffic. Upgrade to the $7/month "Starter" plan to remove this.

---

## STEP 4 — Test Your Live APIs

Open your browser or use these test URLs:

```
Health check:   https://grak-hotel.onrender.com/api/health
Website:        https://grak-hotel.onrender.com/
```

Test a booking via curl (optional):
```bash
curl -X POST https://grak-hotel.onrender.com/api/booking \
  -H "Content-Type: application/json" \
  -d '{
    "guest_name": "Test Guest",
    "email": "test@email.com",
    "phone": "+91 98765 43210",
    "room_type": "Comfort Room",
    "check_in": "2026-06-01",
    "check_out": "2026-06-03",
    "guests": 2
  }'
```

---

## STEP 5 — Custom Domain (Optional, Free)

If you have a domain like `grakhotel.com`:
1. In Render dashboard → your service → **Settings** → **Custom Domains**
2. Add `www.grakhotel.com`
3. In your domain registrar (GoDaddy / Namecheap), add a CNAME record:
   - Name: `www`
   - Value: `grak-hotel.onrender.com`
4. Render provides free SSL automatically.

---

## API Reference

| Endpoint                  | Method | Description                          |
|---------------------------|--------|--------------------------------------|
| `/api/health`             | GET    | Check if backend is running          |
| `/api/booking`            | POST   | Submit a room reservation            |
| `/api/service-request`    | POST   | Submit a guest service request       |
| `/api/contact`            | POST   | Submit a contact/enquiry message     |
| `/api/availability`       | GET    | Check room availability for dates    |

### Availability Check Example
```
GET /api/availability?room_type=Comfort Room&check_in=2026-06-01&check_out=2026-06-03
```

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env with your real Gmail credentials

# 3. Start the server
npm run dev   # with auto-reload (nodemon)
# OR
npm start     # without auto-reload

# 4. Open in browser
# http://localhost:3000
```

---

## Viewing Submissions (Database)

All bookings and service requests are stored in `grakhotel.db` (SQLite).
To view them:

```bash
# Install SQLite viewer (one-time)
npm install -g sqlite3

# Open the database
sqlite3 grakhotel.db

# View all bookings
SELECT * FROM bookings;

# View service requests
SELECT * FROM service_requests;

# Exit
.quit
```

Or use a free GUI tool: **DB Browser for SQLite** (sqlitebrowser.org)

---

## Free Hosting Alternatives

| Platform        | Free Tier          | Notes                               |
|-----------------|--------------------|-------------------------------------|
| **Render**      | 750 hrs/month      | Best for Node.js, recommended       |
| **Railway**     | $5 credit/month    | Faster, no sleep, credit-card free  |
| **Cyclic**      | Unlimited requests | Good for simple APIs                |
| **Vercel**      | Serverless only    | Needs code restructure              |
| **Netlify**     | Static + functions | Functions have 10s timeout limit    |

**Recommendation: Use Render** for this project — it's the easiest with no restructuring needed.

---

## Support

For issues contact your developer or refer to:
- Render docs: https://render.com/docs
- Nodemailer docs: https://nodemailer.com
- Express docs: https://expressjs.com
