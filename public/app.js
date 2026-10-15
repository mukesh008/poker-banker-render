const socket = io();

// Savage & Funny Hinglish Poker Quotes
const SAVAGE_QUOTES = [
  "Agar pehle 30 minute me pata nahi chala ki table ka bakra kaun hai... toh mere bhai, bakra tu hi hai!",
  "Fold karna seekh le chotey, cinema ke hero banne ke chakkar me chaddi bik jaati hai!",
  "Poker me kismat sirf cards baant-ti hai, khel toh jigra aur dimaag khelte hain.",
  "Dost dost na raha... jab river par bad-beat aake mera full-house bana!",
  "Rebuy par rebuy lene se kismat nahi badalti, thoda dhyan cards pe bhi de!",
  "All-in maarna aasan hai, par table se bina roye uthna mushkil hai.",
  "Bluff tabhi maar jab samne wale ke chehre par darr saaf dikh raha ho!",
  "Tijori Banker ki hai, par table pe sabse bada shikaari wahi hai jo chupchap chips batorta hai."
];

const AVATAR_OPTIONS = ['🦁', '🐯', '🦅', '🐺', '🦊', '🦈', '👑', '🃏', '🎩', '🥷', '💀', '💸'];

let currentUser = null;
let latestState = null;
let localChipCounts = {};
let selectedRegAvatar = '🦁';
let selectedProfileAvatar = '🦁';

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Reg failed', err));
  });
}

// PWA Install prompt trigger
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.classList.remove('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
      }
    });
  }
  setupAvatarPickers();
  showRandomSavageQuote();
});

function showRandomSavageQuote() {
  const random = SAVAGE_QUOTES[Math.floor(Math.random() * SAVAGE_QUOTES.length)];
  const qEl = document.getElementById('savageQuoteText');
  const lineEl = document.getElementById('activeQuoteLine');
  if (qEl) qEl.innerText = `"${random}"`;
  if (lineEl) lineEl.innerText = random;
}

function nextRandomQuote() {
  showRandomSavageQuote();
}

function setupAvatarPickers() {
  const regContainer = document.getElementById('signupAvatarPicker');
  const profContainer = document.getElementById('profileAvatarPicker');

  if (regContainer) {
    regContainer.innerHTML = AVATAR_OPTIONS.map(a => `
      <button type="button" onclick="selectRegAvatar('${a}')" id="regAv_${a}" class="p-1.5 rounded-xl border ${a === selectedRegAvatar ? 'border-amber-500 bg-amber-500/20' : 'border-slate-800'} hover:border-slate-600 transition">
        ${a}
      </button>
    `).join('');
  }

  if (profContainer) {
    profContainer.innerHTML = AVATAR_OPTIONS.map(a => `
      <button type="button" onclick="selectProfileAvatar('${a}')" id="profAv_${a}" class="p-1.5 rounded-xl border ${a === selectedProfileAvatar ? 'border-amber-500 bg-amber-500/20' : 'border-slate-800'} hover:border-slate-600 transition">
        ${a}
      </button>
    `).join('');
  }
}

function selectRegAvatar(av) {
  selectedRegAvatar = av;
  AVATAR_OPTIONS.forEach(a => {
    const el = document.getElementById(`regAv_${a}`);
    if (el) el.className = `p-1.5 rounded-xl border ${a === av ? 'border-amber-500 bg-amber-500/20' : 'border-slate-800'} hover:border-slate-600 transition`;
  });
}

function selectProfileAvatar(av) {
  selectedProfileAvatar = av;
  AVATAR_OPTIONS.forEach(a => {
    const el = document.getElementById(`profAv_${a}`);
    if (el) el.className = `p-1.5 rounded-xl border ${a === av ? 'border-amber-500 bg-amber-500/20' : 'border-slate-800'} hover:border-slate-600 transition`;
  });
}

socket.on('stateSync', (data) => {
  latestState = data;
  renderApp();
});

// Authentication
async function login() {
  const userId = document.getElementById('loginUserSelect').value;
  const pin = document.getElementById('loginPin').value;
  const errBox = document.getElementById('authError');
  errBox.classList.add('hidden');

  if (!userId || !pin) {
    showAuthError('Apna naam aur 4-digit PIN daal pehle!');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login fail ho gaya');

    currentUser = data.user;
    selectedProfileAvatar = currentUser.avatar || '🦁';
    localStorage.setItem('poker_user', JSON.stringify(currentUser));
    setupLoggedInView();
    showRandomSavageQuote();
    renderApp();
  } catch (err) {
    showAuthError(err.message);
  }
}

function showAuthError(msg) {
  const errBox = document.getElementById('authError');
  errBox.innerText = msg;
  errBox.classList.remove('hidden');
}

function logout() {
  currentUser = null;
  localStorage.removeItem('poker_user');
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('gameDashboard').classList.add('hidden');
  document.getElementById('currentUserBadge').classList.add('hidden');
  document.getElementById('loginPin').value = '';
}

function setupLoggedInView() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('gameDashboard').classList.remove('hidden');
  document.getElementById('currentUserBadge').classList.remove('hidden');
  document.getElementById('currentUserBadge').classList.add('flex');
  document.getElementById('loggedUserName').innerText = currentUser.name;
  document.getElementById('headerAvatar').innerText = currentUser.avatar || '🦁';

  const roleBadge = document.getElementById('roleBadge');
  const adminTab = document.getElementById('tabAdminBtn');

  if (currentUser.isAdmin) {
    roleBadge.innerText = 'MALAK / ADMIN';
    roleBadge.className = 'text-[9px] text-amber-400 font-mono font-black';
    adminTab.classList.remove('hidden');
  } else if (latestState && latestState.game.bankerUserId === currentUser.id) {
    roleBadge.innerText = 'BANKER';
    roleBadge.className = 'text-[9px] text-emerald-400 font-mono font-black';
    adminTab.classList.add('hidden');
  } else {
    roleBadge.innerText = 'KHILADI';
    roleBadge.className = 'text-[9px] text-slate-400 font-mono';
    adminTab.classList.add('hidden');
  }
}

function toggleSignupModal(show) {
  document.getElementById('signupModal').classList.toggle('hidden', !show);
}

function toggleProfileModal(show) {
  if (show && currentUser) {
    document.getElementById('profileUpi').value = currentUser.upiId || '';
    selectProfileAvatar(currentUser.avatar || '🦁');
  }
  document.getElementById('profileModal').classList.toggle('hidden', !show);
}

async function submitSignup() {
  const name = document.getElementById('regName').value;
  const pin = document.getElementById('regPin').value;
  const upiId = document.getElementById('regUpi').value;

  if (!name || pin.length !== 4) {
    alert('Naam aur 4-digit PIN compulsory hai bhai!');
    return;
  }

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin, upiId, avatar: selectedRegAvatar })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert(data.message);
    toggleSignupModal(false);
    document.getElementById('regName').value = '';
    document.getElementById('regPin').value = '';
    document.getElementById('regUpi').value = '';
  } catch (err) {
    alert(err.message);
  }
}

function saveProfile() {
  if (!currentUser) return;
  const newUpi = document.getElementById('profileUpi').value;
  currentUser.avatar = selectedProfileAvatar;
  currentUser.upiId = newUpi;
  localStorage.setItem('poker_user', JSON.stringify(currentUser));
  document.getElementById('headerAvatar').innerText = currentUser.avatar;

  socket.emit('updateProfile', {
    userId: currentUser.id,
    avatar: selectedProfileAvatar,
    upiId: newUpi
  });
  toggleProfileModal(false);
  alert('Profile updated successfully!');
}

function renderApp() {
  if (!latestState) return;

  const userSelect = document.getElementById('loginUserSelect');
  const currentSelected = userSelect.value;
  userSelect.innerHTML = '<option value="">-- Apna Naam Chun --</option>' +
    latestState.approvedUsers.map(u => `<option value="${u.id}">${u.avatar} ${u.name}${u.isBanker ? ' (👑 Banker)' : u.isAdmin ? ' (Admin)' : ''}</option>`).join('');
  if (currentSelected) userSelect.value = currentSelected;

  document.getElementById('roomCodeDisplay').innerText = `ADDAA: ${latestState.game.roomCode}`;
  const totalPot = latestState.game.players.reduce((sum, p) => sum + p.totalBuyInCash, 0);
  document.getElementById('statTotalPot').innerText = `₹${totalPot}`;
  document.getElementById('statBaseBuyin').innerText = `₹${latestState.game.baseBuyInCash}`;
  document.getElementById('statBankerName').innerText = `👑 ${latestState.game.bankerName}`;
  document.getElementById('chipRatioBadge').innerText = `1 pt = ₹${latestState.game.ratePerChip}`;

  if (!currentUser) {
    const saved = localStorage.getItem('poker_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      setupLoggedInView();
    } else {
      return;
    }
  }

  const isBankerOrAdmin = currentUser.isAdmin || (latestState.game.bankerUserId === currentUser.id);

  const seatedPlayer = latestState.game.players.find(p => p.userId === currentUser.id);
  document.getElementById('joinTableBanner').classList.toggle('hidden', !!seatedPlayer);
  document.getElementById('rebuyActionBox').classList.toggle('hidden', !seatedPlayer);

  renderTokenReferenceBar(latestState.game.chipConfig, latestState.game.ratePerChip);
  renderPlayers(latestState.game.players);
  renderPendingRebuys(latestState.game.pendingRebuys, isBankerOrAdmin);
  renderExpenses(latestState.game.expenses);
  renderCashoutInputs(latestState.game.chipConfig);
  renderSettlements(latestState.game.lastSettlement, isBankerOrAdmin);
  renderHistory(latestState.gameHistory);

  if (currentUser.isAdmin) {
    renderAdminUserManagement(latestState.allUsersForAdmin);
    renderAdminTokenConfig(latestState.game.chipConfig);
  }

  renderAudit(latestState.game.auditLog);
}

function renderTokenReferenceBar(configs, rate) {
  const bar = document.getElementById('tokenReferenceBar');
  bar.innerHTML = configs.map(c => {
    const cashVal = (c.chipValue * rate).toFixed(0);
    return `
      <span class="inline-flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-[10px]">
        <span>${c.icon}</span>
        <b style="color: ${c.colorHex}">${c.name}:</b>
        <span class="font-mono text-slate-300 font-semibold">${c.chipValue} pts</span>
        <span class="text-emerald-400 font-mono">(₹${cashVal})</span>
      </span>
    `;
  }).join('');
}

function renderPlayers(players) {
  const container = document.getElementById('activePlayersList');
  document.getElementById('playerCountLabel').innerText = `${players.length} Playing`;

  if (players.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-500 font-medium">Table abhi khaali hai! "Seat Pakad" dabao aur shuru karo.</div>`;
    return;
  }

  container.innerHTML = players.map(p => {
    const isMe = currentUser && currentUser.id === p.userId;
    const isBanker = latestState.game.bankerUserId === p.userId;
    return `
      <div class="p-3 flex items-center justify-between ${isMe ? 'bg-amber-950/20' : ''}">
        <div class="flex items-center gap-2">
          <span class="text-xl">${p.avatar || '🃏'}</span>
          <div>
            <div class="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              ${p.name} 
              ${isBanker ? '<span class="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded font-mono">BANKER</span>' : ''}
              ${isMe ? '<span class="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 rounded font-mono">TU</span>' : ''}
            </div>
            <div class="text-[11px] text-slate-400">
              Total In: <b class="text-slate-200 font-mono">₹${p.totalBuyInCash}</b> (${p.totalChipsIssued} pts)
            </div>
          </div>
        </div>
        <div class="text-right text-xs">
          ${p.hasCashedOut 
            ? `<span class="font-mono ${p.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-extrabold text-sm">${p.netPnl >= 0 ? '+' : ''}₹${p.netPnl}</span>`
            : '<span class="text-slate-500 text-[10px] font-mono font-bold bg-slate-800 px-2 py-0.5 rounded">IN PLAY</span>'
          }
        </div>
      </div>
    `;
  }).join('');
}

function renderPendingRebuys(rebuys, canApprove) {
  const box = document.getElementById('bankerApprovalBox');
  const list = document.getElementById('pendingRebuysList');

  if (!canApprove || rebuys.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  list.innerHTML = rebuys.map(r => `
    <div class="bg-gradient-to-r from-amber-950/70 to-slate-900 border border-amber-600/60 p-3 rounded-xl flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="text-2xl">${r.avatar || '💸'}</span>
        <div>
          <span class="font-extrabold text-amber-300 text-sm">${r.name}</span> ne maanga: 
          <b class="text-white font-mono">₹${r.amountCash}</b> (${r.amountChips} pts)
          <div class="text-[10px] text-amber-400/80 font-mono">${r.time} • Physical chips de aur approve kar!</div>
        </div>
      </div>
      <div class="flex gap-1.5">
        <button onclick="approveRebuy('${r.requestId}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-1.5 rounded-lg shadow active:scale-95">
          ✓ Approve
        </button>
        <button onclick="rejectRebuy('${r.requestId}')" class="bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold px-2.5 py-1.5 rounded-lg active:scale-95">
          ✕
        </button>
      </div>
    </div>
  `).join('');
}

function renderExpenses(expenses) {
  const list = document.getElementById('expenseList');
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('totalExpenseLabel').innerText = `Total: ₹${total}`;

  if (expenses.length === 0) {
    list.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">Abhi tak kisi ne koi kharcha log nahi kiya.</div>`;
    return;
  }

  list.innerHTML = expenses.map(e => `
    <div class="p-3 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="text-lg">${e.avatar || '🧾'}</span>
        <div>
          <div class="font-bold text-slate-200 text-sm">${e.title}</div>
          <div class="text-[10px] text-slate-400">Bharpaai ki: <span class="text-indigo-400 font-bold">${e.payerName}</span> ne (${e.time})</div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-mono font-extrabold text-amber-300 text-sm">₹${e.amount}</span>
        ${(currentUser && (currentUser.isAdmin || currentUser.id === e.payerId)) 
          ? `<button onclick="deleteExpense(${e.id})" class="text-rose-400 hover:text-rose-300 text-base font-bold">&times;</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

function renderCashoutInputs(configs) {
  const regGrid = document.getElementById('regularChipGrid');
  const specialGrid = document.getElementById('specialPropGrid');
  const rate = latestState.game.ratePerChip;

  const chips = configs.filter(c => c.category === 'chip');
  const specials = configs.filter(c => c.category === 'special');

  regGrid.innerHTML = chips.map(c => `
    <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
      <div class="flex items-center justify-between text-[11px] font-bold">
        <span class="flex items-center gap-1" style="color: ${c.colorHex}">
          <span>${c.icon}</span> ${c.name}
        </span>
        <span class="text-slate-400 font-mono text-[10px]">${c.chipValue} pts</span>
      </div>
      <input type="number" min="0" placeholder="0" 
        value="${localChipCounts[c.id] || ''}"
        oninput="updateLocalToken('${c.id}', this.value)"
        class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right text-xs font-mono text-white focus:outline-none focus:border-amber-500" />
      <div class="text-[10px] text-slate-500 text-right font-mono">
        ₹${(c.chipValue * rate).toFixed(0)} / chip
      </div>
    </div>
  `).join('');

  specialGrid.innerHTML = specials.map(c => `
    <div class="bg-gradient-to-br from-amber-950/20 to-slate-950 p-2.5 rounded-xl border border-amber-900/50 space-y-1">
      <div class="flex items-center justify-between text-xs font-extrabold text-amber-300">
        <span class="flex items-center gap-1.5">
          <span class="text-base">${c.icon}</span> ${c.name}
        </span>
        <span class="font-mono text-amber-400 text-xs">${c.chipValue} pts</span>
      </div>
      <input type="number" min="0" placeholder="0" 
        value="${localChipCounts[c.id] || ''}"
        oninput="updateLocalToken('${c.id}', this.value)"
        class="w-full bg-slate-900 border border-amber-700/60 rounded-lg px-2 py-1 text-right text-xs font-mono text-amber-200 font-bold focus:outline-none focus:border-amber-500" />
      <div class="text-[10px] text-amber-400/80 text-right font-mono font-bold">
        Value: ₹${(c.chipValue * rate).toFixed(0)} each
      </div>
    </div>
  `).join('');
}

function updateLocalToken(id, val) {
  localChipCounts[id] = Number(val) || 0;
  computeLocalCashoutPreview();
}

function computeLocalCashoutPreview() {
  if (!latestState) return;
  let totalPts = 0;
  latestState.game.chipConfig.forEach(c => {
    totalPts += (localChipCounts[c.id] || 0) * c.chipValue;
  });
  const cashVal = (totalPts * latestState.game.ratePerChip).toFixed(2);
  document.getElementById('cashoutTotalChips').innerText = `${totalPts} pts`;
  document.getElementById('cashoutCashValue').innerText = `₹${cashVal}`;
}

function renderSettlements(settlement, isBankerOrAdmin) {
  const container = document.getElementById('settlementReport');
  const closeBox = document.getElementById('closeGameSection');

  if (!settlement) {
    if (closeBox) closeBox.classList.add('hidden');
    return;
  }

  if (closeBox && isBankerOrAdmin) {
    closeBox.classList.remove('hidden');
  }

  let html = `
    <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Total Poker Pot:</span>
        <span class="text-emerald-400 font-bold text-sm">₹${settlement.totalPot}</span>
      </div>
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Total Party Kharcha:</span>
        <span class="text-indigo-400 font-bold text-sm">₹${settlement.totalExpenses}</span>
      </div>
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Per Khiladi Fair Share:</span>
        <span class="text-slate-200 font-bold">₹${settlement.fairShare} / person</span>
      </div>
    </div>

    <div class="space-y-2">
      <div class="text-xs font-extrabold text-slate-200 uppercase tracking-wider">Kaun Kisko Kitna Dega (Final Payout):</div>
  `;

  if (settlement.transactions.length === 0) {
    html += `<div class="p-3 text-center text-xs text-slate-400 bg-slate-950 rounded-xl border border-slate-800">Sabka hisaab barabar! Kisi ko kisi ko ek rupaya nahi dena.</div>`;
  } else {
    html += settlement.transactions.map(t => `
      <div class="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="text-xl">${t.fromAvatar || '💸'}</span>
          <div>
            <div>
              <span class="text-rose-400 font-extrabold">${t.from}</span> dega 
              <span class="text-emerald-400 font-extrabold">${t.to}</span> ko
            </div>
            ${t.upiId ? `<div class="text-[10px] text-slate-400 font-mono">UPI: ${t.upiId}</div>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-black text-amber-300 text-sm">₹${t.amount}</span>
          ${t.upiUrl ? `
            <a href="${t.upiUrl}" class="bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black text-[11px] px-3 py-1.5 rounded-lg shadow active:scale-95">
              Direct Pay UPI
            </a>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderHistory(history) {
  const container = document.getElementById('gameHistoryList');
  if (!history || history.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">Koi purana hisaab saved nahi hai. Game band hone par summary yahan save hogi!</div>`;
    return;
  }

  container.innerHTML = history.map((h, idx) => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow">
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <div>
          <span class="text-xs font-black text-amber-400 font-mono">GAME: ${h.roomCode}</span>
          <span class="text-[10px] text-slate-400 block">${h.closedAt}</span>
        </div>
        <div class="text-right">
          <span class="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">Banker: ${h.bankerName}</span>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-1.5 text-center text-[11px] font-mono bg-slate-950 p-2 rounded-xl border border-slate-800">
        <div>
          <span class="text-[9px] text-slate-400 block">Total Pot</span>
          <b class="text-emerald-400">₹${h.totalPot}</b>
        </div>
        <div>
          <span class="text-[9px] text-slate-400 block">Total Kharcha</span>
          <b class="text-indigo-400">₹${h.totalExpenses}</b>
        </div>
        <div>
          <span class="text-[9px] text-slate-400 block">Khiladi</span>
          <b class="text-slate-200">${h.playersCount} players</b>
        </div>
      </div>

      <!-- Historical Transactions -->
      <div class="space-y-1 pt-1">
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Transfers:</span>
        ${h.settlement.transactions.length === 0 ? '<div class="text-[10px] text-slate-500">Sab barabar tha.</div>' : ''}
        ${h.settlement.transactions.map(t => `
          <div class="text-[11px] bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800 flex justify-between items-center">
            <span><b class="text-rose-400">${t.from}</b> ➔ <b class="text-emerald-400">${t.to}</b></span>
            <span class="font-mono font-bold text-amber-300">₹${t.amount}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderAdminUserManagement(users) {
  const container = document.getElementById('adminUserManagementList');
  if (!users || users.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500">Koi user registered nahi hai.</p>`;
    return;
  }

  container.innerHTML = users.map(u => {
    return `
      <div class="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="text-xl">${u.avatar || '👤'}</span>
          <div>
            <div class="font-bold text-slate-100 flex items-center gap-1.5">
              ${u.name}
              ${u.isAdmin ? '<span class="text-[9px] text-amber-400 font-mono">MALAK</span>' : ''}
              ${u.isBanker ? '<span class="text-[9px] text-emerald-400 font-mono">👑 BANKER</span>' : ''}
              ${u.isDisabled ? '<span class="text-[9px] bg-rose-950 text-rose-400 border border-rose-800 px-1 rounded">DISABLED</span>' : ''}
              ${!u.isApproved ? '<span class="text-[9px] bg-amber-950 text-amber-300 border border-amber-800 px-1 rounded">PENDING</span>' : ''}
            </div>
            <div class="text-[10px] text-slate-400 font-mono">UPI: ${u.upiId || 'None'}</div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          ${!u.isApproved ? `
            <button onclick="approveUser(${u.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg">
              Approve
            </button>
          ` : ''}

          ${!u.isAdmin ? `
            <button onclick="assignBanker(${u.id})" class="bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-1 rounded-lg shadow" title="Make Banker">
              👑 Make Banker
            </button>
            <button onclick="toggleDisableUser(${u.id})" class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] px-2 py-1 rounded-lg border border-slate-700">
              ${u.isDisabled ? 'Enable' : 'Disable'}
            </button>
            <button onclick="deleteUser(${u.id})" class="bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] px-2 py-1 rounded-lg font-bold">
              Delete
            </button>
          ` : '<span class="text-[10px] text-slate-500 font-mono">Owner</span>'}
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminTokenConfig(configs) {
  const container = document.getElementById('adminTokenConfigList');
  const rate = latestState.game.ratePerChip;

  container.innerHTML = configs.map(c => {
    const cashVal = (c.chipValue * rate).toFixed(0);
    const isSpecial = c.category === 'special';
    return `
      <div class="bg-slate-950 p-2.5 rounded-xl border ${isSpecial ? 'border-amber-600/40 bg-amber-950/10' : 'border-slate-800'} flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <span class="text-base">${c.icon}</span>
          <div>
            <div class="font-bold text-xs" style="color: ${c.colorHex}">${c.name}</div>
            <div class="text-[10px] text-slate-400">₹<span id="cashPreview_${c.id}">${cashVal}</span> cash</div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <input type="number" id="tokenCfg_${c.id}" value="${c.chipValue}" 
            oninput="updateAdminTokenPreview('${c.id}')"
            class="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-white text-xs focus:border-amber-500 focus:outline-none" />
          <span class="text-[10px] text-slate-400 font-mono">pts</span>
        </div>
      </div>
    `;
  }).join('');
}

function updateAdminTokenPreview(id) {
  const cash = Number(document.getElementById('adminBaseCash').value) || 500;
  const chips = Number(document.getElementById('adminBaseChips').value) || 1000;
  const rate = cash / chips;
  const input = document.getElementById(`tokenCfg_${id}`);
  const preview = document.getElementById(`cashPreview_${id}`);
  if (input && preview) {
    const pts = Number(input.value) || 0;
    preview.innerText = (pts * rate).toFixed(0);
  }
}

function renderAudit(logs) {
  const list = document.getElementById('auditLogList');
  list.innerHTML = logs.slice(0, 10).map(l => `<li>• ${l}</li>`).join('');
}

// User & Admin Sockets
function joinTable() {
  if (!currentUser) return;
  socket.emit('joinTable', { userId: currentUser.id });
}

function requestRebuy(multiplier) {
  if (!currentUser) return;
  socket.emit('requestRebuy', { userId: currentUser.id, multiplier });
}

function approveRebuy(requestId) {
  socket.emit('approveRebuy', requestId);
}

function rejectRebuy(requestId) {
  socket.emit('rejectRebuy', requestId);
}

function addExpense() {
  if (!currentUser) return;
  const title = document.getElementById('expenseTitle').value;
  const amount = document.getElementById('expenseAmount').value;
  if (!amount || Number(amount) <= 0) {
    alert('Bill ka amount sahi se daal!');
    return;
  }
  socket.emit('addExpense', { payerId: currentUser.id, title, amount });
  document.getElementById('expenseTitle').value = '';
  document.getElementById('expenseAmount').value = '';
}

function deleteExpense(id) {
  socket.emit('deleteExpense', id);
}

function submitCashout() {
  if (!currentUser) return;
  socket.emit('submitCashout', { userId: currentUser.id, chipCounts: localChipCounts });
  alert('Tere chips submit ho gaye! Banker verify karega.');
}

function finalizeSettlement() {
  socket.emit('finalizeSettlement');
}

function closeAndArchiveGame() {
  if (confirm("Khel sach me khatam karna hai? Ye saara hisaab purane records (History) me save kar dega!")) {
    socket.emit('closeAndArchiveGame');
  }
}

function approveUser(userId) {
  socket.emit('approveUser', userId);
}

function toggleDisableUser(userId) {
  socket.emit('toggleDisableUser', userId);
}

function deleteUser(userId) {
  if (confirm("Pakka is khiladi ko hamesha ke liye delete karna hai?")) {
    socket.emit('deleteUser', userId);
  }
}

function assignBanker(userId) {
  if (confirm("Is khiladi ko tijori ka Banker banana hai?")) {
    socket.emit('assignBanker', userId);
  }
}

function saveAdminConfig() {
  const cash = Number(document.getElementById('adminBaseCash').value) || 500;
  const chips = Number(document.getElementById('adminBaseChips').value) || 1000;
  
  const updatedChipConfig = latestState.game.chipConfig.map(c => {
    const el = document.getElementById(`tokenCfg_${c.id}`);
    return {
      ...c,
      chipValue: el ? (Number(el.value) || c.chipValue) : c.chipValue
    };
  });

  socket.emit('updateConfig', { 
    baseBuyInCash: cash, 
    baseStartingChips: chips, 
    chipConfig: updatedChipConfig 
  });
  alert('Naye niyam aur chip values save ho gaye!');
}

function switchTab(tab) {
  ['table', 'expenses', 'cashout', 'history', 'admin'].forEach(t => {
    const el = document.getElementById(`${t}Tab`);
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
    if (el) el.classList.toggle('hidden', t !== tab);
    if (btn) {
      if (t === tab) {
        btn.classList.add('bg-amber-500', 'text-slate-950', 'font-black');
        btn.classList.remove('hover:text-slate-200');
      } else {
        btn.classList.remove('bg-amber-500', 'text-slate-950', 'font-black');
        btn.classList.add('hover:text-slate-200');
      }
    }
  });
}
