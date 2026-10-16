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

// EXACT Requested Chip & Prop Default Points (Red added with 2000 pts)
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
      name: 'Nawab Banker',
      pinHash: bcrypt.hashSync('1234', 10),
      upiId: 'nawab@upi',
      avatar: '👑',
      isAdmin: true,
      isApproved: true,
      isBanker: true,
      isDisabled: false
    }
  ],
  game: {
    id: 1,
    roomCode: 'ADDAA88',
    status: 'ACTIVE',
    bankerUserId: 1,
    bankerName: 'Nawab Banker',
    baseBuyInCash: 500,
    baseStartingChips: 1000,
    ratePerChip: 0.50,
    chipConfig: JSON.parse(JSON.stringify(DEFAULT_TOKENS)),
    players: [],
    pendingRebuys: [],
    expenses: [],
    auditLog: ['Mehfil shuru! High stakes poker addaa ready hai.'],
    lastSettlement: null
  },
  gameHistory: []
};

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

// Greedy settlement solver helper
function solveDebtGraph(balances, amountKey = 'net') {
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

// Calculate Separate & Combined Settlements
function calculateSeparateAndCombinedSettlements() {
  const players = state.game.players;
  const expenses = state.game.expenses;
  const count = players.length;
  if (count === 0) return { balances: [], pokerTransactions: [], expenseTransactions: [], combinedTransactions: [] };

  const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const fairShare = count > 0 ? (totalExpense / count) : 0;

  const expensePaidMap = {};
  players.forEach(p => { expensePaidMap[p.userId] = 0; });
  expenses.forEach(e => {
    if (expensePaidMap[e.payerId] !== undefined) {
      expensePaidMap[e.payerId] += Number(e.amount);
    }
  });

  const balances = players.map(p => {
    const pokerNet = Number(p.cashOutValue || 0) - Number(p.totalBuyInCash || 0);
    const expensePaid = expensePaidMap[p.userId] || 0;
    const expenseNet = expensePaid - fairShare;
    const finalNet = Math.round((pokerNet + expenseNet) * 100) / 100;

    return {
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      upiId: p.upiId,
      totalBuyInCash: p.totalBuyInCash,
      cashOutValue: p.cashOutValue || 0,
      pokerNet: Math.round(pokerNet * 100) / 100,
      expensePaid: Math.round(expensePaid * 100) / 100,
      expenseNet: Math.round(expenseNet * 100) / 100,
      finalNet: finalNet
    };
  });

  // 1. Separate Poker Settlement (Sirf poker winnings aur losses ka lena-dena)
  const pokerTransactions = solveDebtGraph(balances, 'pokerNet');

  // 2. Separate Kharcha Settlement (Sirf food/hotel/party kharche ka lena-dena)
  const expenseTransactions = solveDebtGraph(balances, 'expenseNet');

  // 3. Combined / Net Settlement (Dono ko jod kar single final payment)
  const combinedTransactions = solveDebtGraph(balances, 'finalNet');

  return {
    totalPot: players.reduce((s, p) => s + p.totalBuyInCash, 0),
    totalExpenses: totalExpense,
    fairShare: Math.round(fairShare * 100) / 100,
    balances,
    pokerTransactions,
    expenseTransactions,
    combinedTransactions,
    transactions: combinedTransactions, // legacy support
    closedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
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
    isBanker: false,
    isDisabled: false
  };

  state.users.push(newUser);
  state.game.auditLog.unshift(`Naya Khiladi [${cleanName}] entry maang raha hai.`);
  io.emit('stateSync', getPublicState());
  res.json({ message: 'Registration submit ho gaya! Admin approve karega tab login milega.' });
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

  res.json({
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      upiId: user.upiId,
      isAdmin: user.isAdmin,
      isBanker: user.isBanker || (state.game.bankerUserId === user.id)
    }
  });
});

function getPublicState() {
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
      upiId: u.upiId
    })),
    game: state.game,
    gameHistory: state.gameHistory
  };
}

io.on('connection', (socket) => {
  socket.emit('stateSync', getPublicState());

  socket.on('approveUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      user.isApproved = true;
      user.isDisabled = false;
      state.game.auditLog.unshift(`[${user.name}] ko table me entry de di gayi.`);
      io.emit('stateSync', getPublicState());
    }
  });

  socket.on('toggleDisableUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      user.isDisabled = !user.isDisabled;
      const act = user.isDisabled ? 'DISABLE' : 'ENABLE';
      state.game.auditLog.unshift(`Admin ne [${user.name}] ko ${act} kiya.`);
      io.emit('stateSync', getPublicState());
    }
  });

  socket.on('deleteUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      state.users = state.users.filter(u => u.id !== Number(userId));
      state.game.players = state.game.players.filter(p => p.userId !== Number(userId));
      delete pushSubscriptions[userId];
      state.game.auditLog.unshift(`[${user.name}] ko list se delete kar diya gaya.`);
      io.emit('stateSync', getPublicState());
    }
  });

  socket.on('assignBanker', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      state.users.forEach(u => { u.isBanker = false; });
      user.isBanker = true;
      state.game.bankerUserId = user.id;
      state.game.bankerName = user.name;
      state.game.auditLog.unshift(`👑 NAYA BANKER: [${user.name}] ab se tijori sambhalenge!`);
      io.emit('stateSync', getPublicState());

      sendPushToUser(user.id, {
        title: '👑 Aap Bane Naye Banker!',
        body: 'Aapko table ka Khazanchi (Banker) bana diya gaya hai.',
        icon: '/icons/icon-192.png'
      });
    }
  });

  socket.on('updateConfig', ({ baseBuyInCash, baseStartingChips, chipConfig }) => {
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
    io.emit('stateSync', getPublicState());
  });

  socket.on('joinTable', ({ userId }) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (!user || user.isDisabled) return;
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
    io.emit('stateSync', getPublicState());
  });

  socket.on('requestRebuy', ({ userId, multiplier }) => {
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
    state.users.filter(u => u.isAdmin && u.id !== state.game.bankerUserId).forEach(admin => {
      sendPushToUser(admin.id, pushPayload);
    });
  });

  socket.on('approveRebuy', (requestId) => {
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
    io.emit('stateSync', getPublicState());
  });

  socket.on('rejectRebuy', (requestId) => {
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
    io.emit('stateSync', getPublicState());
  });

  socket.on('addExpense', ({ payerId, title, amount }) => {
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
    io.emit('stateSync', getPublicState());
  });

  socket.on('deleteExpense', (expenseId) => {
    state.game.expenses = state.game.expenses.filter(e => e.id !== Number(expenseId));
    io.emit('stateSync', getPublicState());
  });

  socket.on('submitCashout', ({ userId, chipCounts }) => {
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
    io.emit('stateSync', getPublicState());
  });

  // Calculates separate poker, separate kharcha, and combined settlements
  socket.on('finalizeSettlement', () => {
    const settlement = calculateSeparateAndCombinedSettlements();
    state.game.status = 'SETTLED';
    state.game.lastSettlement = settlement;
    state.game.auditLog.unshift(`🏁 HISAAB TAYAAR: Poker Pot: ₹${settlement.totalPot}, Party Kharcha: ₹${settlement.totalExpenses}.`);
    io.emit('stateSync', getPublicState());
  });

  socket.on('closeAndArchiveGame', () => {
    if (!state.game.lastSettlement) {
      state.game.lastSettlement = calculateSeparateAndCombinedSettlements();
    }

    const archiveEntry = {
      id: Date.now(),
      roomCode: state.game.roomCode,
      closedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      bankerName: state.game.bankerName,
      totalPot: state.game.lastSettlement.totalPot,
      totalExpenses: state.game.lastSettlement.totalExpenses,
      fairShare: state.game.lastSettlement.fairShare,
      settlement: state.game.lastSettlement,
      playersCount: state.game.players.length
    };

    state.gameHistory.unshift(archiveEntry);

    state.game = {
      id: Date.now(),
      roomCode: 'ADDAA' + Math.floor(10 + Math.random() * 90),
      status: 'ACTIVE',
      bankerUserId: state.game.bankerUserId,
      bankerName: state.game.bankerName,
      baseBuyInCash: state.game.baseBuyInCash,
      baseStartingChips: state.game.baseStartingChips,
      ratePerChip: state.game.ratePerChip,
      chipConfig: state.game.chipConfig,
      players: [],
      pendingRebuys: [],
      expenses: [],
      auditLog: [`Pichla game archive ho gaya. Naya addaa [${state.game.roomCode}] ready hai.`],
      lastSettlement: null
    };

    io.emit('stateSync', getPublicState());
  });

  socket.on('updateProfile', ({ userId, avatar, upiId }) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      if (avatar) user.avatar = avatar;
      if (upiId !== undefined) user.upiId = upiId.trim();
      const p = state.game.players.find(x => x.userId === user.id);
      if (p) {
        if (avatar) p.avatar = avatar;
        if (upiId !== undefined) p.upiId = upiId.trim();
      }
      io.emit('stateSync', getPublicState());
    }
  });
});

server.listen(PORT, () => {
  console.log(`♠️ Poker Addaa running on port ${PORT}`);
});
