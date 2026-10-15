# ♠️ Poker Night Ledger Pro (Render-Ready)

A dedicated, mobile-first web app for private home poker nights (5–6 friends) featuring:
- **PIN Authentication & Admin Whitelist:** Select your name, enter 4-digit PIN. New players must be approved by Admin.
- **Dynamic Colored Chip Valuation:** Base buy-in (e.g. ₹500 cash = 1,000 chips, rate ₹0.50/pt), White/Red/Blue/Green custom point values configurable by the Admin.
- **Banker Rebuy Approval Queue:** Players request rebuys (0.5x, 1x, 2x) from their phones; chips and pot only update once Banker physically approves.
- **Unified Expense Splitter:** Log hotel bookings, food/drinks, cigarettes. The app calculates fair share and merges it with poker net profits/losses into **one single settlement**.
- **One-Click UPI Payments:** Generates direct UPI links (`upi://pay`) so losers can pay winners with a single tap.

---

## 🚀 Quick Deployment to Render (Free Tier)

### Step 1: Push to GitHub
1. Create a new GitHub repository: `poker-night-ledger`
2. Push this project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Poker Ledger Pro"
   git remote add origin https://github.com/<your-username>/poker-night-ledger.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy on Render
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Select your GitHub repository.
4. Configure:
   - **Name:** `poker-night-ledger`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Click **Deploy Web Service**.

Render will deploy your app in ~90 seconds and give you a live URL like:  
`https://poker-night-ledger-xxxx.onrender.com`

---

## 🔑 Default Credentials
- **Admin Name:** `Admin Banker`
- **Default PIN:** `1234`
- **Admin Privileges:** Has access to the **⚙️ Admin Tab** to approve new player signups, modify chip denominations, and approve rebuy requests.
