const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Web Push VAPID Configuration
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BFsL7n6gTfC3w43_m42Y7d598XJ8vFzW01qP3E_6l5tE1yZ4a41Y_X4oW7bT3mG5oX7A3rW2yE8mZ4oT5aW1bC8',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'N2145kM6gH3_F27p1X4w8Z_B5aV7c3yL9mX1bQ4rE0s'
};

webpush.setVapidDetails(
  'mailto:banker@pokeraddaa.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('PostgreSQL Connected via DATABASE_URL');
}

const pushSubscriptions = {};

// EXACT Requested Chip & Prop Default Points
const DEFAULT_TOKENS = [
  { id: 'white', name: 'White Chip', category: 'chip', chipValue: 1000, colorHex: '#f8fafc', icon: '⚪' },
  { id: 'blue', name: 'Blue Chip', category: 'chip', chipValue: 50, colorHex: '#38bdf8', icon: '🔵' },
  { id: 'green', name: 'Green Chip', category: 'chip', chipValue: 100, colorHex: '#34d399', icon: '🟢' },
  { id: 'red', name: 'Red Chip', category: 'chip', chipValue: 2000, colorHex: '#f87171', icon: '🔴' },
  { id: 'purple', name: 'Purple Shahi', category: 'chip', chipValue: 1500, colorHex: '#c084fc', icon: '🟣' },
  { id: 'black', name: 'Black VIP', category: 'chip', chipValue: 500, colorHex: '#94a3b8', icon: '⚫' },
  { id: 'dice', name: 'Dice Token', category: 'special', chipValue: 5000, colorHex: '#fbbf24', icon: '🎲' },
  { id: 'deck', name: 'Deck Token', category: 'special', chipValue: 10000, colorHex: '#f472b6', icon: '🃏' }
];

let state = {
  users: [
    {
      id: 1,
      name: 'Owner Admin',
      pinHash: bcrypt.hashSync('1234', 10),
      upiId: 'admin@upi',
      avatar: '👑',
      isAdmin: true, // ADMIN CANNOT PLAY POKER (MANAGER ONLY)
      isApproved: true,
      isDisabled: false
    },
    {
      id: 2,
      name: 'Nawab Banker',
      pinHash: bcrypt.hashSync('1234', 10),
      upiId: 'nawab@upi',
      avatar: '🎩',
      isAdmin: false,
      isApproved: true,
      isDisabled: false
    }
  ],
  game: {
    id: 1,
    roomCode: 'ADDAA88',
    status: 'ACTIVE',
    bankerUserId: 2, // Default initial Banker
    bankerName: 'Nawab Banker',
    baseBuyInCash: 500,
    baseStartingChips: 1000,
    ratePerChip: 0.50,
    chipConfig: JSON.parse(JSON.stringify(DEFAULT_TOKENS)),
    players: [],
    pendingRebuys: [],
    expenses: [],
    roomMembers: [1, 2],
    excludedExpenseUserIds: [], // Users excluded by Admin from party kharcha
    auditLog: ['Mehfil shuru! Admin sirf nazraana sambhalenge (khel nahi sakte). Banker ke haath me hisaab hai.'],
    pokerSettlement: null,
    expenseSettlement: null
  },
  gameHistory: []
};

// ------------------- AUTOMATED POSTGRESQL PERSISTENCE ENGINE -------------------
async function initDatabase() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_storage (
        key VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const res = await pool.query(`SELECT data FROM app_storage WHERE key = 'poker_state' LIMIT 1;`);
    if (res.rows.length > 0 && res.rows[0].data) {
      const saved = res.rows[0].data;
      if (saved.users && saved.users.length > 0) state.users = saved.users;
      if (saved.game) state.game = saved.game;
      if (saved.gameHistory) state.gameHistory = saved.gameHistory;
      console.log(`📦 Restored persistent data: ${state.users.length} users, ${state.gameHistory.length} archived sessions!`);
    } else {
      await saveStateToDatabase();
    }
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

async function saveStateToDatabase() {
  if (pool) {
    try {
      const payload = JSON.stringify({
        users: state.users,
        game: state.game,
        gameHistory: state.gameHistory
      });
      await pool.query(`
        INSERT INTO app_storage (key, data, updated_at)
        VALUES ('poker_state', $1::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = CURRENT_TIMESTAMP;
      `, [payload]);
    } catch (e) {
      console.error('Save state to PostgreSQL error:', e.message);
    }
  }
}

async function sendPushToUser(userId, payload) {
  const subs = pushSubscriptions[userId] || [];
  const stringPayload = JSON.stringify(payload);

  for (let i = subs.length - 1; i >= 0; i--) {
    const sub = subs[i];
    try {
      await webpush.sendNotification(sub, stringPayload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        subs.splice(i, 1);
      }
    }
  }
}

function recalculatePlayerCashouts() {
  state.game.players.forEach(p => {
    if (p.hasCashedOut && p.cashOutChips) {
      let totalPts = 0;
      state.game.chipConfig.forEach(c => {
        const count = Number(p.cashOutChips[c.id]) || 0;
        totalPts += count * c.chipValue;
      });
      p.totalCashOutChips = totalPts;
      p.cashOutValue = Math.round((totalPts * state.game.ratePerChip) * 100) / 100;
      p.netPnl = Math.round((p.cashOutValue - p.totalBuyInCash) * 100) / 100;
    }
  });
}

function solveDebtGraph(balances, amountKey) {
  let debtors = balances.filter(b => b[amountKey] < -0.01).map(b => ({ ...b, netVal: -b[amountKey] }));
  let creditors = balances.filter(b => b[amountKey] > 0.01).map(b => ({ ...b, netVal: b[amountKey] }));

  debtors.sort((a, b) => b.netVal - a.netVal);
  creditors.sort((a, b) => b.netVal - a.netVal);

  let transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    let debtor = debtors[i];
    let creditor = creditors[j];
    let amount = Math.min(debtor.netVal, creditor.netVal);
    amount = Math.round(amount * 100) / 100;

    if (amount > 0) {
      const upiUrl = creditor.upiId 
        ? `upi://pay?pa=${encodeURIComponent(creditor.upiId)}&pn=${encodeURIComponent(creditor.name)}&am=${amount}&cu=INR`
        : null;

      transactions.push({
        from: debtor.name,
        to: creditor.name,
        fromAvatar: debtor.avatar,
        toAvatar: creditor.avatar,
        amount: amount,
        upiId: creditor.upiId,
        upiUrl: upiUrl
      });
    }

    debtor.netVal = Math.round((debtor.netVal - amount) * 100) / 100;
    creditor.netVal = Math.round((creditor.netVal - amount) * 100) / 100;

    if (debtor.netVal <= 0.01) i++;
    if (creditor.netVal <= 0.01) j++;
  }

  return transactions;
}

// 1. PURE POKER SETTLEMENT (Banker-only calculation; purely table chips vs buy-ins)
function calculatePurePokerSettlement() {
  const players = state.game.players;
  if (players.length === 0) return { totalPot: 0, balances: [], transactions: [] };

  const totalPot = players.reduce((s, p) => s + p.totalBuyInCash, 0);

  const balances = players.map(p => {
    const net = Number(p.cashOutValue || 0) - Number(p.totalBuyInCash || 0);
    return {
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      upiId: p.upiId,
      totalBuyInCash: p.totalBuyInCash,
      cashOutValue: p.cashOutValue || 0,
      pokerNet: Math.round(net * 100) / 100
    };
  });

  const transactions = solveDebtGraph(balances, 'pokerNet');

  return {
    totalPot,
    balances,
    transactions,
    calculatedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  };
}

// 2. ROOM-BASED KHARCHA SPLITTER (Excluding players removed from Kharcha by Admin)
function getActiveRoomExpenseMembers() {
  const memberMap = new Map();
  const excludedIds = Array.isArray(state.game.excludedExpenseUserIds) ? state.game.excludedExpenseUserIds.map(Number) : [];

  // Room members who joined and are approved and NOT excluded by Admin
  if (Array.isArray(state.game.roomMembers)) {
    state.game.roomMembers.forEach(uid => {
      const numId = Number(uid);
      if (!excludedIds.includes(numId)) {
        const u = state.users.find(x => Number(x.id) === numId && x.isApproved && !x.isDisabled);
        if (u) {
          memberMap.set(Number(u.id), {
            id: Number(u.id),
            name: u.name,
            avatar: u.avatar || '👤',
            upiId: u.upiId || ''
          });
        }
      }
    });
  }

  // Anyone seated at table (unless excluded)
  state.game.players.forEach(p => {
    const pid = Number(p.userId);
    if (!excludedIds.includes(pid) && !memberMap.has(pid)) {
      memberMap.set(pid, {
        id: pid,
        name: p.name,
        avatar: p.avatar || '👤',
        upiId: p.upiId || ''
      });
    }
  });

  // Anyone who paid an expense
  state.game.expenses.forEach(e => {
    const pid = Number(e.payerId);
    if (!memberMap.has(pid)) {
      const u = state.users.find(x => Number(x.id) === pid);
      if (u) {
        memberMap.set(pid, {
          id: pid,
          name: u.name,
          avatar: u.avatar || '👤',
          upiId: u.upiId || ''
        });
      }
    }
  });

  return Array.from(memberMap.values());
}

function calculatePureExpenseSettlement() {
  const members = getActiveRoomExpenseMembers();
  const expenses = state.game.expenses;
  const count = Math.max(1, members.length);

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const fairShare = totalExpenses > 0 ? (Math.round((totalExpenses / count) * 100) / 100) : 0;

  const expensePaidMap = {};
  members.forEach(m => { expensePaidMap[m.id] = 0; });

  expenses.forEach(e => {
    const pid = Number(e.payerId);
    if (expensePaidMap[pid] !== undefined) {
      expensePaidMap[pid] += Number(e.amount);
    }
  });

  const balances = members.map(m => {
    const paid = expensePaidMap[m.id] || 0;
    const net = paid - fairShare;
    return {
      userId: m.id,
      name: m.name,
      avatar: m.avatar,
      upiId: m.upiId,
      paidAmount: paid,
      fairShare: fairShare,
      expenseNet: Math.round(net * 100) / 100
    };
  });

  const transactions = solveDebtGraph(balances, 'expenseNet');

  return {
    totalExpenses,
    playerCount: count,
    fairShare,
    balances,
    transactions,
    calculatedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  };
}

// REST APIs
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'Missing userId or subscription' });
  }

  if (!pushSubscriptions[userId]) {
    pushSubscriptions[userId] = [];
  }

  const exists = pushSubscriptions[userId].some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    pushSubscriptions[userId].push(subscription);
  }

  res.json({ success: true, message: 'Push notification subscription registered!' });
});

app.post('/api/auth/signup', (req, res) => {
  const { name, pin, upiId, avatar } = req.body;
  if (!name || !pin || pin.length !== 4) {
    return res.status(400).json({ error: 'Naam aur 4-digit PIN daalna zaroori hai!' });
  }
  const cleanName = name.trim();
  if (state.users.some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(400).json({ error: 'Ye naam pehle se kisi aur khiladi ka hai. Doosra try karo!' });
  }

  const newUser = {
    id: Date.now(),
    name: cleanName,
    pinHash: bcrypt.hashSync(pin, 10),
    upiId: upiId ? upiId.trim() : '',
    avatar: avatar || '🦁',
    isAdmin: false,
    isApproved: false,
    isDisabled: false
  };

  state.users.push(newUser);
  state.game.auditLog.unshift(`Naya Khiladi [${cleanName}] entry maang raha hai.`);
  saveStateToDatabase().catch(()=>{});
  io.emit('stateSync', getPublicState());
  res.json({ message: 'Registration request submit ho gayi! Admin ke approval ke baad login ho jayega.' });
});

app.post('/api/auth/login', (req, res) => {
  const { userId, pin } = req.body;
  const user = state.users.find(u => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'Khiladi mila nahi list me!' });
  if (user.isDisabled) {
    return res.status(403).json({ error: 'Admin ne aapko temporary block kiya hua hai!' });
  }
  if (!user.isApproved && !user.isAdmin) {
    return res.status(403).json({ error: 'Admin ne abhi approve nahi kiya hai.' });
  }

  const match = bcrypt.compareSync(pin, user.pinHash);
  if (!match) return res.status(401).json({ error: 'Galat PIN! Dhyan se PIN daalo.' });

  if (!Array.isArray(state.game.roomMembers)) state.game.roomMembers = [];
  if (!state.game.roomMembers.includes(user.id)) {
    state.game.roomMembers.push(user.id);
    saveStateToDatabase().catch(()=>{});
  }
  res.json({
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      upiId: user.upiId,
      isAdmin: user.isAdmin,
      isBanker: (state.game.bankerUserId === user.id)
    }
  });
});

function getPublicState() {
  const membersForExp = typeof getActiveRoomExpenseMembers === 'function' ? getActiveRoomExpenseMembers() : [];
  const totalExp = state.game.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const pCount = Math.max(1, membersForExp.length);
  const fairShare = totalExp > 0 ? (Math.round((totalExp / pCount) * 100) / 100) : 0;
  state.game.liveExpenseStats = {
    totalExpenses: totalExp,
    playerCount: pCount,
    fairShare: fairShare
  };

  return {
    approvedUsers: state.users.filter(u => u.isApproved && !u.isDisabled).map(u => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      isAdmin: u.isAdmin,
      isBanker: (state.game.bankerUserId === u.id),
      upiId: u.upiId
    })),
    allUsersForAdmin: state.users.map(u => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      isAdmin: u.isAdmin,
      isApproved: u.isApproved,
      isDisabled: u.isDisabled,
      isBanker: (state.game.bankerUserId === u.id),
      upiId: u.upiId,
      isExcludedFromExpense: Array.isArray(state.game.excludedExpenseUserIds) && state.game.excludedExpenseUserIds.includes(u.id)
    })),
    game: state.game,
    gameHistory: state.gameHistory
  };
}

io.on('connection', (socket) => {
  socket.emit('stateSync', getPublicState());

  // ADMIN ONLY: Approve Player
  socket.on('approveUser', async (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      user.isApproved = true;
      user.isDisabled = false;
      state.game.auditLog.unshift(`[${user.name}] ko table me entry de di gayi.`);
      saveStateToDatabase().catch(()=>{});
      io.emit('stateSync', getPublicState());
    }
  });

  // ADMIN ONLY: Disable/Enable Player
  socket.on('toggleDisableUser', async (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      user.isDisabled = !user.isDisabled;
      const act = user.isDisabled ? 'DISABLE' : 'ENABLE';
      state.game.auditLog.unshift(`Admin ne [${user.name}] ko ${act} kiya.`);
      saveStateToDatabase().catch(()=>{});
      io.emit('stateSync', getPublicState());
    }
  });

  // ADMIN ONLY: Delete Player
  socket.on('deleteUser', async (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      state.users = state.users.filter(u => u.id !== Number(userId));
      state.game.players = state.game.players.filter(p => p.userId !== Number(userId));
      delete pushSubscriptions[userId];
      state.game.auditLog.unshift(`[${user.name}] ko list se delete kar diya gaya.`);
      saveStateToDatabase().catch(()=>{});
      io.emit('stateSync', getPublicState());
    }
  });

  // ADMIN ONLY: Toggle Exclude Player from Kharcha (Kharche se hatana ya jodna)
  socket.on('toggleExcludeFromExpense', async ({ adminUserId, targetUserId }) => {
    const admin = state.users.find(u => u.id === Number(adminUserId));
    if (!admin || !admin.isAdmin) return; // Only Admin can manage

    const tid = Number(targetUserId);
    const targetUser = state.users.find(u => u.id === tid);
    if (!targetUser) return;

    if (!Array.isArray(state.game.excludedExpenseUserIds)) {
      state.game.excludedExpenseUserIds = [];
    }

    const idx = state.game.excludedExpenseUserIds.indexOf(tid);
    if (idx === -1) {
      state.game.excludedExpenseUserIds.push(tid);
      state.game.auditLog.unshift(`🧾 Admin ne [${targetUser.name}] ko party kharche se ALAG kar diya (Inpe kharcha nahi lagega).`);
    } else {
      state.game.excludedExpenseUserIds.splice(idx, 1);
      state.game.auditLog.unshift(`🧾 Admin ne [${targetUser.name}] ko wapas party kharche me SHAMIL kiya.`);
    }

    // Recalculate expense settlement in real-time
    state.game.expenseSettlement = calculatePureExpenseSettlement();
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // ONLY CURRENT BANKER CAN HAND OVER BANKER ROLE TO ANOTHER PLAYER
  socket.on('assignBanker', async ({ currentBankerUserId, newBankerUserId }) => {
    const currentBankerId = Number(currentBankerUserId);
    const newBankerId = Number(newBankerUserId);

    // Rule: Pahle se bana hua Banker hi doosre ko Banker bana sakta hai!
    if (Number(state.game.bankerUserId) !== currentBankerId) {
      socket.emit('actionError', 'Sirf maujooda Banker hi kisi aur ko Banker bana sakta hai!');
      return;
    }

    const targetUser = state.users.find(u => u.id === newBankerId);
    if (!targetUser) return;
    if (targetUser.isAdmin) {
      socket.emit('actionError', 'Admin Banker nahi ban sakta kyunki Admin poker nahi khelte!');
      return;
    }

    state.game.bankerUserId = targetUser.id;
    state.game.bankerName = targetUser.name;
    state.game.auditLog.unshift(`👑 KHAZANCHI BADLAAV: Puraane Banker ne [${targetUser.name}] ko Banker ki gaddi saup di!`);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());

    sendPushToUser(targetUser.id, {
      title: '👑 Aap Bane Naye Banker!',
      body: `Pichle Banker ne aapko table ka naya Khazanchi (Banker) bana diya hai.`,
      icon: '/icons/icon-192.png'
    });
  });

  socket.on('updateConfig', async ({ baseBuyInCash, baseStartingChips, chipConfig }) => {
    const cash = Number(baseBuyInCash) || 500;
    const chips = Number(baseStartingChips) || 1000;
    state.game.baseBuyInCash = cash;
    state.game.baseStartingChips = chips;
    state.game.ratePerChip = Number((cash / chips).toFixed(4));

    if (Array.isArray(chipConfig)) {
      state.game.chipConfig = chipConfig;
    }
    recalculatePlayerCashouts();

    state.game.auditLog.unshift(`⚙️ Rules Update: ₹${cash} = ${chips} chips (Rate: ₹${state.game.ratePerChip}/pt)`);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  socket.on('joinRoomUser', async ({ userId }) => {
    const uid = Number(userId);
    if (!state.game.roomMembers) state.game.roomMembers = [];
    if (uid && !state.game.roomMembers.includes(uid)) {
      state.game.roomMembers.push(uid);
      const u = state.users.find(x => x.id === uid);
      if (u) {
        state.game.auditLog.unshift(`${u.avatar || '👤'} [${u.name}] room me dakhil ho gaye.`);
      }
      saveStateToDatabase().catch(()=>{});
      io.emit('stateSync', getPublicState());
    }
  });

  // RULE: ADMIN CANNOT PLAY POKER (SEAT DISABLED FOR ADMIN)
  socket.on('joinTable', async ({ userId }) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (!user || user.isDisabled) return;
    if (user.isAdmin) {
      socket.emit('actionError', 'Admin poker table par nahi baith sakte! Admin sirf addaa manage karenge.');
      return;
    }
    if (state.game.players.some(p => p.userId === user.id)) return;

    const initialCash = state.game.baseBuyInCash;
    const initialChips = state.game.baseStartingChips;

    state.game.players.push({
      userId: user.id,
      name: user.name,
      avatar: user.avatar,
      upiId: user.upiId,
      totalBuyInCash: initialCash,
      totalChipsIssued: initialChips,
      cashOutChips: {},
      totalCashOutChips: 0,
      cashOutValue: 0,
      netPnl: -initialCash,
      hasCashedOut: false
    });

    state.game.auditLog.unshift(`${user.avatar} [${user.name}] ne seat li! Buy-in: ₹${initialCash} (${initialChips} chips)`);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  socket.on('requestRebuy', async ({ userId, multiplier }) => {
    const player = state.game.players.find(p => p.userId === Number(userId));
    if (!player) return;

    let cash = Math.round(state.game.baseBuyInCash * (multiplier || 1.0));
    const chips = Math.round(cash / state.game.ratePerChip);

    const req = {
      requestId: Date.now().toString(),
      userId: player.userId,
      name: player.name,
      avatar: player.avatar,
      amountCash: cash,
      amountChips: chips,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };

    state.game.pendingRebuys.push(req);
    state.game.auditLog.unshift(`💸 [${player.name}] ne Rebuy maanga: ₹${cash} (${chips} pts).`);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());

    const pushPayload = {
      title: `🔔 Rebuy Request: ${player.name}`,
      body: `${player.name} ne ₹${cash} (${chips} chips) maange hain. Table pe approve karein!`,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32x32.png',
      tag: 'poker-rebuy-request',
      vibrate: [200, 100, 200],
      data: { url: '/' }
    };

    if (state.game.bankerUserId) {
      sendPushToUser(state.game.bankerUserId, pushPayload);
    }
  });

  // BANKER ONLY: Approve Rebuy
  socket.on('approveRebuy', async ({ bankerUserId, requestId }) => {
    if (Number(state.game.bankerUserId) !== Number(bankerUserId)) {
      socket.emit('actionError', 'Sirf Banker hi rebuy approve kar sakta hai!');
      return;
    }
    const idx = state.game.pendingRebuys.findIndex(r => r.requestId === requestId);
    if (idx === -1) return;
    const req = state.game.pendingRebuys[idx];
    const player = state.game.players.find(p => p.userId === req.userId);

    if (player) {
      player.totalBuyInCash += req.amountCash;
      player.totalChipsIssued += req.amountChips;
      state.game.auditLog.unshift(`✓ Banker ne [${player.name}] ka rebuy de diya: +₹${req.amountCash} (+${req.amountChips} pts)`);

      sendPushToUser(player.userId, {
        title: '✅ Rebuy Manzoor!',
        body: `Banker ne aapka ₹${req.amountCash} (+${req.amountChips} chips) ka rebuy approve kar diya.`,
        icon: '/icons/icon-192.png'
      });
    }
    state.game.pendingRebuys.splice(idx, 1);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // BANKER ONLY: Reject Rebuy
  socket.on('rejectRebuy', async ({ bankerUserId, requestId }) => {
    if (Number(state.game.bankerUserId) !== Number(bankerUserId)) {
      socket.emit('actionError', 'Sirf Banker hi rebuy reject kar sakta hai!');
      return;
    }
    const idx = state.game.pendingRebuys.findIndex(r => r.requestId === requestId);
    if (idx === -1) return;
    const req = state.game.pendingRebuys[idx];
    state.game.auditLog.unshift(`✕ Banker ne [${req.name}] ka rebuy reject kiya.`);

    sendPushToUser(req.userId, {
      title: '✕ Rebuy Reject Hua',
      body: `Banker ne aapka ₹${req.amountCash} ka rebuy reject kar diya.`,
      icon: '/icons/icon-192.png'
    });

    state.game.pendingRebuys.splice(idx, 1);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // Add Expense
  socket.on('addExpense', async ({ payerId, title, amount }) => {
    const user = state.users.find(u => u.id === Number(payerId));
    if (!user || !amount || amount <= 0) return;

    const exp = {
      id: Date.now(),
      payerId: user.id,
      payerName: user.name,
      avatar: user.avatar,
      title: title || 'Kharcha',
      amount: Number(amount),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };

    state.game.expenses.push(exp);
    state.game.auditLog.unshift(`🧾 Kharcha Log: [${user.name}] ne ₹${amount} kharch kiye "${exp.title}" par.`);
    state.game.expenseSettlement = calculatePureExpenseSettlement();
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // Delete Expense
  socket.on('deleteExpense', async (expenseId) => {
    state.game.expenses = state.game.expenses.filter(e => e.id !== Number(expenseId));
    state.game.expenseSettlement = calculatePureExpenseSettlement();
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // BANKER ONLY: Trigger Settle Kharcha
  socket.on('calculateExpenseSettlement', async ({ triggerUserId }) => {
    if (Number(state.game.bankerUserId) !== Number(triggerUserId)) {
      socket.emit('actionError', 'Kharcha sirf maujooda Banker hi settle kar sakta hai!');
      return;
    }
    state.game.expenseSettlement = calculatePureExpenseSettlement();
    state.game.auditLog.unshift(`🧾 Khazanchi (Banker) ne party kharcha settle kiya: Kul ₹${state.game.expenseSettlement.totalExpenses}`);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // Submit Cashout
  socket.on('submitCashout', async ({ userId, chipCounts }) => {
    const player = state.game.players.find(p => p.userId === Number(userId));
    if (!player) return;

    let totalPoints = 0;
    state.game.chipConfig.forEach(c => {
      const count = Number(chipCounts[c.id]) || 0;
      totalPoints += count * c.chipValue;
    });

    const cashValue = Math.round((totalPoints * state.game.ratePerChip) * 100) / 100;

    player.cashOutChips = chipCounts;
    player.totalCashOutChips = totalPoints;
    player.cashOutValue = cashValue;
    player.netPnl = Math.round((cashValue - player.totalBuyInCash) * 100) / 100;
    player.hasCashedOut = true;

    state.game.auditLog.unshift(`💰 [${player.name}] ne chips gine: ${totalPoints} pts = ₹${cashValue} (Net: ${player.netPnl >= 0 ? '+' : ''}₹${player.netPnl})`);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // BANKER ONLY: Finalize Poker Settlement
  socket.on('finalizePokerSettlement', async ({ triggerUserId }) => {
    if (Number(state.game.bankerUserId) !== Number(triggerUserId)) {
      socket.emit('actionError', 'Poker game ka hisaab sirf maujooda Banker hi nikaal sakta hai!');
      return;
    }
    const settlement = calculatePurePokerSettlement();
    state.game.status = 'SETTLED';
    state.game.pokerSettlement = settlement;
    state.game.auditLog.unshift(`🏁 POKER HISAAB TAYAAR: Banker ne table settlement final kar di.`);
    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  // BANKER ONLY: Archive & Close Session
  socket.on('closeAndArchiveGame', async ({ triggerUserId }) => {
    if (Number(state.game.bankerUserId) !== Number(triggerUserId)) {
      socket.emit('actionError', 'Game sirf maujooda Banker hi close aur archive kar sakta hai!');
      return;
    }

    if (!state.game.pokerSettlement) {
      state.game.pokerSettlement = calculatePurePokerSettlement();
    }
    if (!state.game.expenseSettlement) {
      state.game.expenseSettlement = calculatePureExpenseSettlement();
    }

    const archiveEntry = {
      id: Date.now(),
      roomCode: state.game.roomCode,
      closedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      bankerName: state.game.bankerName,
      totalPot: state.game.pokerSettlement.totalPot,
      totalExpenses: state.game.expenseSettlement.totalExpenses,
      pokerSettlement: state.game.pokerSettlement,
      expenseSettlement: state.game.expenseSettlement,
      playersCount: state.game.players.length
    };

    state.gameHistory.unshift(archiveEntry);

    state.game = {
      id: Date.now(),
      roomCode: 'ADDAA' + Math.floor(10 + Math.random() * 90),
      status: 'ACTIVE',
      bankerUserId: state.game.bankerUserId, // Retain current Banker
      bankerName: state.game.bankerName,
      baseBuyInCash: state.game.baseBuyInCash,
      baseStartingChips: state.game.baseStartingChips,
      ratePerChip: state.game.ratePerChip,
      chipConfig: state.game.chipConfig,
      players: [],
      pendingRebuys: [],
      expenses: [],
      roomMembers: [state.game.bankerUserId],
      excludedExpenseUserIds: [],
      auditLog: [`Pichla game archive ho gaya. Naya addaa [${state.game.roomCode}] ready hai.`],
      pokerSettlement: null,
      expenseSettlement: null
    };

    saveStateToDatabase().catch(()=>{});
    io.emit('stateSync', getPublicState());
  });

  socket.on('updateProfile', async ({ userId, avatar, upiId }) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      if (avatar) user.avatar = avatar;
      if (upiId !== undefined) user.upiId = upiId.trim();
      const p = state.game.players.find(x => x.userId === user.id);
      if (p) {
        if (avatar) p.avatar = avatar;
        if (upiId !== undefined) p.upiId = upiId.trim();
      }
      saveStateToDatabase().catch(()=>{});
      io.emit('stateSync', getPublicState());
    }
  });
});

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`♠️ Poker Addaa with strictly enforced Roles running on port ${PORT}`);
  });
});
