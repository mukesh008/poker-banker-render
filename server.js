const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup: Render PostgreSQL or In-Memory fallback for immediate plug-and-play
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('Connected to Render Managed PostgreSQL');
} else {
  console.log('Running in In-Memory / File fallback mode (No DATABASE_URL provided)');
}

// In-Memory state for live websocket speed (backed by state sync)
let state = {
  users: [
    {
      id: 1,
      name: 'Admin Banker',
      pinHash: bcrypt.hashSync('1234', 10),
      upiId: 'banker@upi',
      isAdmin: true,
      isApproved: true
    }
  ],
  game: {
    id: 1,
    roomCode: 'POKER88',
    status: 'ACTIVE', // 'ACTIVE' or 'SETTLED'
    baseBuyInCash: 500,
    baseStartingChips: 1000,
    ratePerChip: 0.50,
    chipConfig: [
      { color: 'White', chipValue: 10, colorHex: '#f8fafc' },
      { color: 'Red', chipValue: 25, colorHex: '#ef4444' },
      { color: 'Blue', chipValue: 50, colorHex: '#3b82f6' },
      { color: 'Green', chipValue: 100, colorHex: '#22c55e' }
    ],
    players: [], // { id, userId, name, upiId, totalBuyInCash, totalChipsIssued, cashOutChips: {}, totalCashOutChips: 0, cashOutValue: 0, netPnl: 0, hasCashedOut: false }
    pendingRebuys: [], // { requestId, userId, name, amountCash, amountChips, timestamp }
    expenses: [], // { id, payerId, payerName, title, amount, timestamp }
    auditLog: [],
    lastSettlement: null
  }
};

// Settlement Algorithm: Combines Poker + Shared Expenses & Minimizes Transactions
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
      upiId: p.upiId,
      pokerNet: Math.round(pokerNet * 100) / 100,
      expensePaid: Math.round(expensePaid * 100) / 100,
      expenseNet: Math.round(expenseNet * 100) / 100,
      finalNet: finalNet
    };
  });

  // Minimum Cash Flow Settlement using Greedy Algorithm
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
    transactions
  };
}

// REST APIs
app.post('/api/auth/signup', (req, res) => {
  const { name, pin, upiId } = req.body;
  if (!name || !pin || pin.length !== 4) {
    return res.status(400).json({ error: 'Name and 4-digit PIN required' });
  }
  const cleanName = name.trim();
  if (state.users.some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(400).json({ error: 'User name already exists' });
  }

  const newUser = {
    id: Date.now(),
    name: cleanName,
    pinHash: bcrypt.hashSync(pin, 10),
    upiId: upiId ? upiId.trim() : '',
    isAdmin: false,
    isApproved: false
  };

  state.users.push(newUser);
  state.game.auditLog.unshift(`New player ${cleanName} signed up (Pending admin approval)`);
  io.emit('stateSync', getPublicState());
  res.json({ message: 'Signup submitted. Please ask Admin to approve your account.' });
});

app.post('/api/auth/login', (req, res) => {
  const { userId, pin } = req.body;
  const user = state.users.find(u => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.isApproved && !user.isAdmin) {
    return res.status(403).json({ error: 'Account pending admin approval' });
  }

  const match = bcrypt.compareSync(pin, user.pinHash);
  if (!match) return res.status(401).json({ error: 'Invalid 4-digit PIN' });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      upiId: user.upiId,
      isAdmin: user.isAdmin
    }
  });
});

function getPublicState() {
  return {
    approvedUsers: state.users.filter(u => u.isApproved).map(u => ({ id: u.id, name: u.name, isAdmin: u.isAdmin, upiId: u.upiId })),
    pendingUsers: state.users.filter(u => !u.isApproved && !u.isAdmin).map(u => ({ id: u.id, name: u.name, upiId: u.upiId })),
    game: state.game
  };
}

// Socket.io Real-time Handlers
io.on('connection', (socket) => {
  socket.emit('stateSync', getPublicState());

  // Admin approves player
  socket.on('approveUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user) {
      user.isApproved = true;
      state.game.auditLog.unshift(`Player ${user.name} approved by Admin`);
      io.emit('stateSync', getPublicState());
    }
  });

  // Admin updates game/chip configuration
  socket.on('updateConfig', ({ baseBuyInCash, baseStartingChips, chipConfig }) => {
    const cash = Number(baseBuyInCash) || 500;
    const chips = Number(baseStartingChips) || 1000;
    state.game.baseBuyInCash = cash;
    state.game.baseStartingChips = chips;
    state.game.ratePerChip = Number((cash / chips).toFixed(4));
    if (Array.isArray(chipConfig)) {
      state.game.chipConfig = chipConfig;
    }
    state.game.auditLog.unshift(`Config updated: ₹${cash} = ${chips} chips (Rate: ₹${state.game.ratePerChip}/chip)`);
    io.emit('stateSync', getPublicState());
  });

  // Join Table with Initial Buy-in
  socket.on('joinTable', ({ userId }) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (!user) return;
    if (state.game.players.some(p => p.userId === user.id)) return;

    const initialCash = state.game.baseBuyInCash;
    const initialChips = state.game.baseStartingChips;

    state.game.players.push({
      userId: user.id,
      name: user.name,
      upiId: user.upiId,
      totalBuyInCash: initialCash,
      totalChipsIssued: initialChips,
      cashOutChips: {},
      totalCashOutChips: 0,
      cashOutValue: 0,
      netPnl: -initialCash,
      hasCashedOut: false
    });

    state.game.auditLog.unshift(`${user.name} joined table (Initial Buy-in: ₹${initialCash} / ${initialChips} chips)`);
    io.emit('stateSync', getPublicState());
  });

  // Player requests Rebuy
  socket.on('requestRebuy', ({ userId, multiplier, customCash }) => {
    const player = state.game.players.find(p => p.userId === Number(userId));
    if (!player) return;

    let cash = state.game.baseBuyInCash;
    if (multiplier) cash = Math.round(state.game.baseBuyInCash * multiplier);
    if (customCash) cash = Number(customCash);

    const chips = Math.round(cash / state.game.ratePerChip);

    const req = {
      requestId: Date.now().toString(),
      userId: player.userId,
      name: player.name,
      amountCash: cash,
      amountChips: chips,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    state.game.pendingRebuys.push(req);
    state.game.auditLog.unshift(`Rebuy requested by ${player.name}: ₹${cash} (${chips} chips)`);
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
      state.game.auditLog.unshift(`✓ Banker approved rebuy for ${player.name}: +₹${req.amountCash} (+${req.amountChips} chips)`);
    }
    state.game.pendingRebuys.splice(idx, 1);
    io.emit('stateSync', getPublicState());
  });

  // Banker rejects Rebuy
  socket.on('rejectRebuy', (requestId) => {
    const idx = state.game.pendingRebuys.findIndex(r => r.requestId === requestId);
    if (idx === -1) return;
    const req = state.game.pendingRebuys[idx];
    state.game.auditLog.unshift(`✕ Banker rejected rebuy for ${req.name} (₹${req.amountCash})`);
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
      title: title || 'Group Expense',
      amount: Number(amount),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    state.game.expenses.push(exp);
    state.game.auditLog.unshift(`🧾 Expense: ${user.name} paid ₹${amount} for "${exp.title}"`);
    io.emit('stateSync', getPublicState());
  });

  // Delete Expense
  socket.on('deleteExpense', (expenseId) => {
    state.game.expenses = state.game.expenses.filter(e => e.id !== Number(expenseId));
    io.emit('stateSync', getPublicState());
  });

  // Submit Cashout Chip Counts
  socket.on('submitCashout', ({ userId, chipCounts }) => {
    const player = state.game.players.find(p => p.userId === Number(userId));
    if (!player) return;

    let totalPoints = 0;
    state.game.chipConfig.forEach(c => {
      const count = Number(chipCounts[c.color]) || 0;
      totalPoints += count * c.chipValue;
    });

    const cashValue = Math.round((totalPoints * state.game.ratePerChip) * 100) / 100;

    player.cashOutChips = chipCounts;
    player.totalCashOutChips = totalPoints;
    player.cashOutValue = cashValue;
    player.netPnl = Math.round((cashValue - player.totalBuyInCash) * 100) / 100;
    player.hasCashedOut = true;

    state.game.auditLog.unshift(`${player.name} counted chips: ${totalPoints} pts = ₹${cashValue} (Net: ${player.netPnl >= 0 ? '+' : ''}₹${player.netPnl})`);
    io.emit('stateSync', getPublicState());
  });

  // Finalize & Calculate Unified Settlement
  socket.on('finalizeSettlement', () => {
    const settlement = calculateUnifiedSettlement();
    state.game.status = 'SETTLED';
    state.game.lastSettlement = settlement;
    state.game.auditLog.unshift(`🏁 Game settled! Total Pot: ₹${settlement.totalPot}, Total Shared Expenses: ₹${settlement.totalExpenses}`);
    io.emit('stateSync', getPublicState());
  });

  // Reset / New Game Session
  socket.on('resetGame', () => {
    state.game = {
      id: Date.now(),
      roomCode: 'POKER' + Math.floor(10 + Math.random() * 90),
      status: 'ACTIVE',
      baseBuyInCash: state.game.baseBuyInCash,
      baseStartingChips: state.game.baseStartingChips,
      ratePerChip: state.game.ratePerChip,
      chipConfig: state.game.chipConfig,
      players: [],
      pendingRebuys: [],
      expenses: [],
      auditLog: ['New session started.'],
      lastSettlement: null
    };
    io.emit('stateSync', getPublicState());
  });
});

server.listen(PORT, () => {
  console.log(`♠️ Poker Ledger running on port ${PORT}`);
});
