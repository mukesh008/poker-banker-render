const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('PostgreSQL Connected via DATABASE_URL');
}

const DEFAULT_TOKENS = [
  { id: 'white', name: 'White Chip', category: 'chip', chipValue: 10, colorHex: '#f8fafc', icon: '⚪' },
  { id: 'red', name: 'Red Chip', category: 'chip', chipValue: 25, colorHex: '#ef4444', icon: '🔴' },
  { id: 'blue', name: 'Blue Chip', category: 'chip', chipValue: 50, colorHex: '#3b82f6', icon: '🔵' },
  { id: 'green', name: 'Green Chip', category: 'chip', chipValue: 100, colorHex: '#22c55e', icon: '🟢' },
  { id: 'purple', name: 'Purple Chip', category: 'chip', chipValue: 250, colorHex: '#a855f7', icon: '🟣' },
  { id: 'black', name: 'Black Chip', category: 'chip', chipValue: 500, colorHex: '#0f172a', icon: '⚫' },
  { id: 'dice', name: 'Dice Token', category: 'special', chipValue: 1000, colorHex: '#f59e0b', icon: '🎲' },
  { id: 'deck', name: 'Deck Token', category: 'special', chipValue: 2500, colorHex: '#ec4899', icon: '🃏' }
];

let state = {
  users: [
    {
      id: 1,
      name: 'Owner Admin',
      pinHash: bcrypt.hashSync('1234', 10),
      upiId: 'owner@upi',
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
    status: 'ACTIVE', // 'ACTIVE' or 'SETTLED'
    bankerUserId: 1,
    bankerName: 'Owner Admin',
    baseBuyInCash: 500,
    baseStartingChips: 1000,
    ratePerChip: 0.50,
    chipConfig: JSON.parse(JSON.stringify(DEFAULT_TOKENS)),
    players: [],
    pendingRebuys: [],
    expenses: [],
    auditLog: ['Addaa khul gaya! Baithak shuru. Kismat aazmao ya chaddi becho.'],
    lastSettlement: null
  },
  gameHistory: [] // Archived previous sessions
};

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

function calculateUnifiedSettlement() {
  const players = state.game.players;
  const expenses = state.game.expenses;
  const count = players.length;
  if (count === 0) return { balances: [], transactions: [] };

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
      pokerNet: Math.round(pokerNet * 100) / 100,
      expensePaid: Math.round(expensePaid * 100) / 100,
      expenseNet: Math.round(expenseNet * 100) / 100,
      finalNet: finalNet
    };
  });

  let debtors = balances.filter(b => b.finalNet < -0.01).map(b => ({ ...b, net: -b.finalNet }));
  let creditors = balances.filter(b => b.finalNet > 0.01).map(b => ({ ...b, net: b.finalNet }));

  debtors.sort((a, b) => b.net - a.net);
  creditors.sort((a, b) => b.net - a.net);

  let transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    let debtor = debtors[i];
    let creditor = creditors[j];
    let amount = Math.min(debtor.net, creditor.net);
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

    debtor.net = Math.round((debtor.net - amount) * 100) / 100;
    creditor.net = Math.round((creditor.net - amount) * 100) / 100;

    if (debtor.net <= 0.01) i++;
    if (creditor.net <= 0.01) j++;
  }

  return {
    totalPot: players.reduce((s, p) => s + p.totalBuyInCash, 0),
    totalExpenses: totalExpense,
    fairShare: Math.round(fairShare * 100) / 100,
    balances,
    transactions,
    closedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  };
}

// REST APIs
app.post('/api/auth/signup', (req, res) => {
  const { name, pin, upiId, avatar } = req.body;
  if (!name || !pin || pin.length !== 4) {
    return res.status(400).json({ error: 'Naam aur 4-digit PIN daalna zaroori hai bhai!' });
  }
  const cleanName = name.trim();
  if (state.users.some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(400).json({ error: 'Ye naam pehle se kisi bakre ka hai. Doosra chun!' });
  }

  const newUser = {
    id: Date.now(),
    name: cleanName,
    pinHash: bcrypt.hashSync(pin, 10),
    upiId: upiId ? upiId.trim() : '',
    avatar: avatar || '🃏',
    isAdmin: false,
    isApproved: false,
    isBanker: false,
    isDisabled: false
  };

  state.users.push(newUser);
  state.game.auditLog.unshift(`Naya Khiladi [${cleanName}] aane ko tadap raha hai. Admin approval ka wait kar!`);
  io.emit('stateSync', getPublicState());
  res.json({ message: 'Registration submit ho gaya! Admin ko bol ki approve kare warna entry nahi milegi.' });
});

app.post('/api/auth/login', (req, res) => {
  const { userId, pin } = req.body;
  const user = state.users.find(u => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'Khiladi mila nahi database me!' });
  if (user.isDisabled) {
    return res.status(403).json({ error: 'Tereko Admin ne laath maarke DISABLE kiya hai! No entry.' });
  }
  if (!user.isApproved && !user.isAdmin) {
    return res.status(403).json({ error: 'Ruk ja chotey! Admin ne abhi tak approve nahi kiya.' });
  }

  const match = bcrypt.compareSync(pin, user.pinHash);
  if (!match) return res.status(401).json({ error: 'Galat PIN! Dhyan se daal hero mat ban.' });

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

// WebSockets
io.on('connection', (socket) => {
  socket.emit('stateSync', getPublicState());

  // Admin approves player
  socket.on('approveUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      user.isApproved = true;
      user.isDisabled = false;
      state.game.auditLog.unshift(`Admin ne [${user.name}] ko table ki entry de di.`);
      io.emit('stateSync', getPublicState());
    }
  });

  // Admin toggle disable player
  socket.on('toggleDisableUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      user.isDisabled = !user.isDisabled;
      const act = user.isDisabled ? 'DISABLE' : 'ENABLE';
      state.game.auditLog.unshift(`⚠️ Admin ne [${user.name}] ko ${act} kar diya.`);
      io.emit('stateSync', getPublicState());
    }
  });

  // Admin permanently delete player
  socket.on('deleteUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      state.users = state.users.filter(u => u.id !== Number(userId));
      state.game.players = state.game.players.filter(p => p.userId !== Number(userId));
      state.game.auditLog.unshift(`❌ Admin ne [${user.name}] ka patta table se hamesha ke liye kaat diya.`);
      io.emit('stateSync', getPublicState());
    }
  });

  // Admin assigns Banker before or during game
  socket.on('assignBanker', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      state.users.forEach(u => { u.isBanker = false; });
      user.isBanker = true;
      state.game.bankerUserId = user.id;
      state.game.bankerName = user.name;
      state.game.auditLog.unshift(`👑 NAYA BANKER: [${user.name}] ab se tijori sambhalega! Saara paisa aur hisaab iske haath me.`);
      io.emit('stateSync', getPublicState());
    }
  });

  // Admin updates Chip, Dice, Deck & Buy-in config
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

    state.game.auditLog.unshift(`⚙️ Table Rules Updated: ₹${cash} = ${chips} pts (Rate: ₹${state.game.ratePerChip}/pt)`);
    io.emit('stateSync', getPublicState());
  });

  // Player joins live seat
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

    state.game.auditLog.unshift(`${user.avatar} [${user.name}] ne seat pakad li! Buy-in: ₹${initialCash} (${initialChips} chips)`);
    io.emit('stateSync', getPublicState());
  });

  // Player requests Rebuy
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
    state.game.auditLog.unshift(`💸 [${player.name}] chilla raha hai Rebuy ke liye: ₹${cash} (${chips} pts). Banker ji approve karo!`);
    io.emit('stateSync', getPublicState());
  });

  // Banker approves Rebuy
  socket.on('approveRebuy', (requestId) => {
    const idx = state.game.pendingRebuys.findIndex(r => r.requestId === requestId);
    if (idx === -1) return;
    const req = state.game.pendingRebuys[idx];
    const player = state.game.players.find(p => p.userId === req.userId);

    if (player) {
      player.totalBuyInCash += req.amountCash;
      player.totalChipsIssued += req.amountChips;
      state.game.auditLog.unshift(`✓ Banker ne [${player.name}] ka rebuy de diya: +₹${req.amountCash} (+${req.amountChips} pts)`);
    }
    state.game.pendingRebuys.splice(idx, 1);
    io.emit('stateSync', getPublicState());
  });

  // Banker rejects Rebuy
  socket.on('rejectRebuy', (requestId) => {
    const idx = state.game.pendingRebuys.findIndex(r => r.requestId === requestId);
    if (idx === -1) return;
    const req = state.game.pendingRebuys[idx];
    state.game.auditLog.unshift(`✕ Banker ne [${req.name}] ka rebuy reject kar diya! "Pehle pichla hisaab chukta kar!"`);
    state.game.pendingRebuys.splice(idx, 1);
    io.emit('stateSync', getPublicState());
  });

  // Add Shared Expense
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
    state.game.auditLog.unshift(`🧾 Kharcha Log: [${user.name}] ne ₹${amount} phoonke "${exp.title}" pe. Sab me barabar batega!`);
    io.emit('stateSync', getPublicState());
  });

  // Delete Expense
  socket.on('deleteExpense', (expenseId) => {
    state.game.expenses = state.game.expenses.filter(e => e.id !== Number(expenseId));
    io.emit('stateSync', getPublicState());
  });

  // Submit Cashout
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

    state.game.auditLog.unshift(`💰 [${player.name}] ne stack gina: ${totalPoints} pts = ₹${cashValue} (Net: ${player.netPnl >= 0 ? '+' : ''}₹${player.netPnl})`);
    io.emit('stateSync', getPublicState());
  });

  // Calculate Settlement Preview
  socket.on('finalizeSettlement', () => {
    const settlement = calculateUnifiedSettlement();
    state.game.status = 'SETTLED';
    state.game.lastSettlement = settlement;
    state.game.auditLog.unshift(`🏁 HISAAB TAYAAR: Total Pot: ₹${settlement.totalPot}, Shared Expenses: ₹${settlement.totalExpenses}. Check karo kaun kiska karz utarega!`);
    io.emit('stateSync', getPublicState());
  });

  // Close & Archive Game (Admin or Banker action)
  socket.on('closeAndArchiveGame', () => {
    if (!state.game.lastSettlement) {
      state.game.lastSettlement = calculateUnifiedSettlement();
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

    // Reset table for next game session
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
      auditLog: [`Pichla game successfully BAND aur ARCHIVE ho gaya! Naya game [${state.game.roomCode}] shuru ho chuka hai.`],
      lastSettlement: null
    };

    io.emit('stateSync', getPublicState());
  });

  // Update profile avatar & UPI ID
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
  console.log(`♠️ Poker Addaa Pro listening on port ${PORT}`);
});
