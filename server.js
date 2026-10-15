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
  console.log('Lucknowi Dastarkhwan: PostgreSQL Database Se Rabta Ho Gaya Hai Huzoor!');
}

const DEFAULT_TOKENS = [
  { id: 'white', name: 'Safed Asrafi', category: 'chip', chipValue: 10, colorHex: '#f8fafc', icon: '⚪' },
  { id: 'red', name: 'Surkh (Laal)', category: 'chip', chipValue: 25, colorHex: '#ef4444', icon: '🔴' },
  { id: 'blue', name: 'Neelam (Neeli)', category: 'chip', chipValue: 50, colorHex: '#3b82f6', icon: '🔵' },
  { id: 'green', name: 'Zammurad (Hari)', category: 'chip', chipValue: 100, colorHex: '#22c55e', icon: '🟢' },
  { id: 'purple', name: 'Baingani Shahi', category: 'chip', chipValue: 250, colorHex: '#a855f7', icon: '🟣' },
  { id: 'black', name: 'Siyah (Kaali)', category: 'chip', chipValue: 500, colorHex: '#0f172a', icon: '⚫' },
  { id: 'dice', name: 'Pasa (Dice)', category: 'special', chipValue: 1000, colorHex: '#f59e0b', icon: '🎲' },
  { id: 'deck', name: 'Gaddi (Deck)', category: 'special', chipValue: 2500, colorHex: '#ec4899', icon: '🃏' }
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
    roomCode: 'NAWAB88',
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
    auditLog: ['Aadaab Huzoor! Hazratganj ki baithak aaraasta hai. Tashreef laiye aur dilon par raaj kijiye.'],
    lastSettlement: null
  },
  gameHistory: []
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
      totalBuyInCash: p.totalBuyInCash,
      cashOutValue: p.cashOutValue || 0,
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
    return res.status(400).json({ error: 'Gustaakhi maaf huzoor, par apna Ism-e-Shareef (Naam) aur 4-digit PIN inayat kijiye.' });
  }
  const cleanName = name.trim();
  if (state.users.some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(400).json({ error: 'Huzoor, ye shandaar naam kisi aur mohtaram khiladi ne pehle hi ikhtiyar kar liya hai.' });
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
  state.game.auditLog.unshift(`Nawab Sahab [${cleanName}] ne dastak di hai. Admin Sahab ki manzoori ka intezaar hai.`);
  io.emit('stateSync', getPublicState());
  res.json({ message: 'Aapki darkhwast darj ho chuki hai huzoor. Malak-e-Dastarkhwan (Admin) ki ijazat ka intezaar kijiye.' });
});

app.post('/api/auth/login', (req, res) => {
  const { userId, pin } = req.body;
  const user = state.users.find(u => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'Maaf kijiye huzoor, aapka shumaar is mehfil ke darj shuda khiladiyon me nahi hai.' });
  if (user.isDisabled) {
    return res.status(403).json({ error: 'Aadaab! Malak ne aapki shirkat par waqti taur par pabandi aaid farmayi hai.' });
  }
  if (!user.isApproved && !user.isAdmin) {
    return res.status(403).json({ error: 'Zara tehreem rakhiye huzoor! Malak ne abhi tak ijazat-nama jari nahi farmaya.' });
  }

  const match = bcrypt.compareSync(pin, user.pinHash);
  if (!match) return res.status(401).json({ error: 'Ghalat PIN huzoor! Apne haseen haathon se sahi adad dakhil kijiye.' });

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
      state.game.auditLog.unshift(`Aadab! Janab [${user.name}] ko mehfil me ba-izzat dakhila ata farmaya gaya.`);
      io.emit('stateSync', getPublicState());
    }
  });

  socket.on('toggleDisableUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      user.isDisabled = !user.isDisabled;
      const act = user.isDisabled ? 'Kinarakashi (Disable)' : 'Ijazat (Enable)';
      state.game.auditLog.unshift(`⚠️ Janab [${user.name}] par ${act} ka hukm aaid farmaya gaya.`);
      io.emit('stateSync', getPublicState());
    }
  });

  socket.on('deleteUser', (userId) => {
    const user = state.users.find(u => u.id === Number(userId));
    if (user && !user.isAdmin) {
      state.users = state.users.filter(u => u.id !== Number(userId));
      state.game.players = state.game.players.filter(p => p.userId !== Number(userId));
      state.game.auditLog.unshift(`Janab [${user.name}] ka naam register-e-mehfil se alahida kar diya gaya.`);
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
      state.game.auditLog.unshift(`👑 KHAZANCHI MUNTKHIB: Janab [${user.name}] ab se Tijori-e-Khaas ke nigran hain!`);
      io.emit('stateSync', getPublicState());
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

    state.game.auditLog.unshift(`⚙️ Naye Qawaneen: ₹${cash} = ${chips} Asrafiyan (Darr: ₹${state.game.ratePerChip}/pt)`);
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

    state.game.auditLog.unshift(`${user.avatar} Janab [${user.name}] ne masnad sambhali! Dastak: ₹${initialCash} (${initialChips} asrafiyan)`);
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
    state.game.auditLog.unshift(`💸 Janab [${player.name}] ne mazeed Asrafiyon (Rebuy) ki iltija ki hai: ₹${cash} (${chips} pts).`);
    io.emit('stateSync', getPublicState());
  });

  socket.on('approveRebuy', (requestId) => {
    const idx = state.game.pendingRebuys.findIndex(r => r.requestId === requestId);
    if (idx === -1) return;
    const req = state.game.pendingRebuys[idx];
    const player = state.game.players.find(p => p.userId === req.userId);

    if (player) {
      player.totalBuyInCash += req.amountCash;
      player.totalChipsIssued += req.amountChips;
      state.game.auditLog.unshift(`✓ Khazanchi Sahab ne [${player.name}] ki guzarish qabool farmayi: +₹${req.amountCash} (+${req.amountChips} pts)`);
    }
    state.game.pendingRebuys.splice(idx, 1);
    io.emit('stateSync', getPublicState());
  });

  socket.on('rejectRebuy', (requestId) => {
    const idx = state.game.pendingRebuys.findIndex(r => r.requestId === requestId);
    if (idx === -1) return;
    const req = state.game.pendingRebuys[idx];
    state.game.auditLog.unshift(`✕ Khazanchi Sahab ne [${req.name}] ki darkhwast rad farmayi: "Pehle pichhla hisaab chukta farmayein!"`);
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
      title: title || 'Dastarkhwan Kharcha',
      amount: Number(amount),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };

    state.game.expenses.push(exp);
    state.game.auditLog.unshift(`🧾 Dastarkhwan Kharcha: [${user.name}] ne ₹${amount} kharch kiye "${exp.title}" par. Ba-hisaab-e-barabar!`);
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

    state.game.auditLog.unshift(`💰 Janab [${player.name}] ne hisaab pesh kiya: ${totalPoints} pts = ₹${cashValue} (Nafa/Nuqsan: ${player.netPnl >= 0 ? '+' : ''}₹${player.netPnl})`);
    io.emit('stateSync', getPublicState());
  });

  socket.on('finalizeSettlement', () => {
    const settlement = calculateUnifiedSettlement();
    state.game.status = 'SETTLED';
    state.game.lastSettlement = settlement;
    state.game.auditLog.unshift(`🏁 HISAAB-E-MEHFIL TAYAR: Kul Pot: ₹${settlement.totalPot}, Kul Kharcha: ₹${settlement.totalExpenses}. Molahiza farmayein!`);
    io.emit('stateSync', getPublicState());
  });

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

    state.game = {
      id: Date.now(),
      roomCode: 'NAWAB' + Math.floor(10 + Math.random() * 90),
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
      auditLog: [`Pichli baithak ba-adab ikhtitaam ko pahunchi. Nayi baithak [${state.game.roomCode}] aaraasta hai huzoor!`],
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
  console.log(`♠️ Lucknowi Poker Addaa running on port ${PORT}`);
});
