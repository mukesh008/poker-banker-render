# ♠️ Poker Addaa Pro v14 (Permanent PostgreSQL Database Persistence)

### 🛑 Why Does Data Get Removed On Updates?
Render runs web services inside **ephemeral Linux containers**. 
Whenever you push changes to your GitHub repository:
1. Render completely destroys the old running container.
2. It builds and boots a fresh container straight from your Git commits.
3. If user data, PINs, and poker balances were only kept in RAM memory (`let state = ...`), everything gets wiped clean!

---

### 🛡️ How Version 14 Solves This Permanently:
In this update, `server.js` now features an automated **PostgreSQL State Persistence Engine**:
- On server boot, it automatically initializes an `app_storage` table in PostgreSQL via `DATABASE_URL`.
- It restores all registered players, PIN hashes, active table states, buy-ins, live kharcha, and old session histories.
- Every user registration, chip count, rebuy, party expense, and archived game history is saved automatically to PostgreSQL.
- Whenever you push code updates to GitHub, the fresh container boots up, loads the state from PostgreSQL, and continues without losing data.

---

### 🚀 2-Minute Setup on Render (Step-by-Step):

#### Step 1: Create a Free PostgreSQL Database on Render
1. Go to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** (top right) $ightarrow$ **PostgreSQL**.
3. Name it: `poker-database` (select **Free** plan).
4. Click **Create Database**.

#### Step 2: Connect the Database to Your Poker Web Service
1. Open your newly created `poker-database` on Render.
2. Scroll down to **Connections** and copy the **Internal Database URL** (e.g., `postgresql://poker_user:...@dpg-...:5432/poker_db`).
3. Open your Poker Web Service in Render $ightarrow$ click **Environment** in the left sidebar.
4. Click **Add Environment Variable**:
   - **Key:** `DATABASE_URL`
   - **Value:** Paste the copied PostgreSQL database URL.
5. Click **Save Changes**.
