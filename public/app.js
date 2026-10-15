const socket = io();

// Rich Lucknowi Poker Quotes with Tahzeeb, Humor & Wit
const LUCKNOWI_QUOTES = [
  "Pehle aap, pehle aap ke chakkar me badshah koi aur loot le gaya huzoor! Tash ke dastarkhwan par tehzeeb dil me rakhiye, par daanw dimaag se lagaiye!",
  "Hazratganj ki sham aur poker ka jaam... agar samne wale ka bluff na pakad sakein, toh khamoshi se fold farmayein!",
  "Aadaab huzoor! Kismat sirf patte baant-ti hai, baazi wahi jeetta hai jiske paas sabr aur qaleja dono hon.",
  "Dost dost na raha jab river par aake hamara Shahi Flush ban gaya!",
  "All-in lagane me itni jaldi na kijiye janab, mehfil abhi jawan hai aur asrafiyan mehengi!",
  "Khazanchi (Banker) ki tijori me asrafiyan tabhi aati hain jab samne wala tehzeeb me rehkar ghalat daanw chal bethe.",
  "Bluff tabhi aazmayein jab mukhalif ke chehre par darr saaf numaya ho!",
  "Khel me jeet aur haar toh dastoor-e-zamaana hai huzoor, bas aakhir me hisaab bebaak hona chahiye!"
];

const AVATAR_OPTIONS = ['🦁', '🐯', '🦅', '🐺', '🦊', '🦈', '👑', '🃏', '🎩', '🥷', '💀', '💸'];

let currentUser = null;
let latestState = null;
let localChipCounts = {};
let selectedRegAvatar = '🦁';
let selectedProfileAvatar = '🦁';
let activeQuoteIndex = 0;

// Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Registration error:', err));
  });
}

// Global PWA prompt handling
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const directBtn = document.getElementById('directInstallBtnModal');
  if (directBtn) directBtn.classList.remove('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
  const directBtn = document.getElementById('directInstallBtnModal');
  if (directBtn) {
    directBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          toggleInstallGuide(false);
        }
        deferredPrompt = null;
      }
    });
  }
  setupAvatarPickers();
  showRandomQuote();
});

function showRandomQuote() {
  activeQuoteIndex = Math.floor(Math.random() * LUCKNOWI_QUOTES.length);
  updateQuoteUI();
}

function nextRandomQuote() {
  activeQuoteIndex = (activeQuoteIndex + 1) % LUCKNOWI_QUOTES.length;
  updateQuoteUI();
}

function nextRandomQuoteInModal() {
  activeQuoteIndex = (activeQuoteIndex + 1) % LUCKNOWI_QUOTES.length;
  updateQuoteUI();
}

function updateQuoteUI() {
  const quote = LUCKNOWI_QUOTES[activeQuoteIndex];
  const authQ = document.getElementById('savageQuoteText');
  const lineQ = document.getElementById('activeQuoteLine');
  const modalQ = document.getElementById('fullModalQuoteText');

  if (authQ) authQ.innerText = `"${quote}"`;
  if (lineQ) lineQ.innerText = quote;
  if (modalQ) modalQ.innerText = `"${quote}"`;
}

function showQuoteModal() {
  updateQuoteUI();
  toggleQuoteModal(true);
}

function toggleQuoteModal(show) {
  document.getElementById('quoteModal').classList.toggle('hidden', !show);
}

function toggleInstallGuide(show) {
  document.getElementById('installGuideModal').classList.toggle('hidden', !show);
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
    showAuthError('Apna naam aur 4-digit PIN inayat kijiye pehle!');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Dakhila na ho saka');

    currentUser = data.user;
    selectedProfileAvatar = currentUser.avatar || '🦁';
    localStorage.setItem('poker_user', JSON.stringify(currentUser));
    setupLoggedInView();
    showRandomQuote();
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
  document.getElementById('bottomNav').classList.add('hidden');
  document.getElementById('loginPin').value = '';
}

function setupLoggedInView() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('gameDashboard').classList.remove('hidden');
  document.getElementById('currentUserBadge').classList.remove('hidden');
  document.getElementById('currentUserBadge').classList.add('flex');
  document.getElementById('bottomNav').classList.remove('hidden');
  document.getElementById('loggedUserName').innerText = currentUser.name;
  document.getElementById('headerAvatar').innerText = currentUser.avatar || '👑';

  const roleBadge = document.getElementById('roleBadge');
  const bnavAdmin = document.getElementById('bnav_admin');

  if (currentUser.isAdmin) {
    roleBadge.innerText = 'MALAK';
    roleBadge.className = 'text-[9px] text-amber-400 font-mono font-black';
    bnavAdmin.classList.remove('hidden');
  } else if (latestState && latestState.game.bankerUserId === currentUser.id) {
    roleBadge.innerText = 'KHAZANCHI';
    roleBadge.className = 'text-[9px] text-emerald-400 font-mono font-black';
    bnavAdmin.classList.add('hidden');
  } else {
    roleBadge.innerText = 'KHILADI';
    roleBadge.className = 'text-[9px] text-slate-400 font-mono';
    bnavAdmin.classList.add('hidden');
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
    alert('Naam aur 4-digit PIN dono laazmi hain huzoor!');
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
  alert('Aapka shahi profile update kar diya gaya hai!');
}

function renderApp() {
  if (!latestState) return;

  const userSelect = document.getElementById('loginUserSelect');
  const currentSelected = userSelect.value;
  userSelect.innerHTML = '<option value="">-- Apna Naam Chuniyega --</option>' +
    latestState.approvedUsers.map(u => `<option value="${u.id}">${u.avatar} ${u.name}${u.isBanker ? ' (👑 Khazanchi)' : u.isAdmin ? ' (Malak)' : ''}</option>`).join('');
  if (currentSelected) userSelect.value = currentSelected;

  document.getElementById('roomCodeDisplay').innerText = `BAITHAK: ${latestState.game.roomCode}`;
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
  renderDetailedHistory(latestState.gameHistory);

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
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-500 font-medium">Dastarkhwan khali hai huzoor! "Masnad Sambhaliye" dabayein aur ronaq badhayein.</div>`;
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
              ${isBanker ? '<span class="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded font-mono">KHAZANCHI</span>' : ''}
              ${isMe ? '<span class="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 rounded font-mono">AAP</span>' : ''}
            </div>
            <div class="text-[11px] text-slate-400">
              Kul Dastak: <b class="text-slate-200 font-mono">₹${p.totalBuyInCash}</b> (${p.totalChipsIssued} pts)
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
          <span class="font-extrabold text-amber-300 text-sm">${r.name}</span> ne talab kiya: 
          <b class="text-white font-mono">₹${r.amountCash}</b> (${r.amountChips} pts)
          <div class="text-[10px] text-amber-400/80 font-mono">${r.time} • Asrafiyan inayat karein aur manzoor karein!</div>
        </div>
      </div>
      <div class="flex gap-1.5">
        <button onclick="approveRebuy('${r.requestId}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-1.5 rounded-lg shadow active:scale-95">
          ✓ Qabool
        </button>
        <button onclick="rejectRebuy('${r.requestId}')" class="bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold px-2.5 py-1.5 rounded-lg active:scale-95">
          ✕ Rad
        </button>
      </div>
    </div>
  `).join('');
}

function renderExpenses(expenses) {
  const list = document.getElementById('expenseList');
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('totalExpenseLabel').innerText = `Kul: ₹${total}`;

  if (expenses.length === 0) {
    list.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">Abhi tak kisi kharche ka اندراج nahi hua.</div>`;
    return;
  }

  list.innerHTML = expenses.map(e => `
    <div class="p-3 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="text-lg">${e.avatar || '🧾'}</span>
        <div>
          <div class="font-bold text-slate-200 text-sm">${e.title}</div>
          <div class="text-[10px] text-slate-400">Adaigi ki: <span class="text-indigo-400 font-bold">${e.payerName}</span> ne (${e.time})</div>
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
        ₹${(c.chipValue * rate).toFixed(0)} / asrafi
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
        Qeemat: ₹${(c.chipValue * rate).toFixed(0)} har ek
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
        <span class="text-slate-400">Kul Tijori Pot:</span>
        <span class="text-emerald-400 font-bold text-sm">₹${settlement.totalPot}</span>
      </div>
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Kul Dastarkhwan Kharcha:</span>
        <span class="text-indigo-400 font-bold text-sm">₹${settlement.totalExpenses}</span>
      </div>
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Har Khiladi Ka Hissa:</span>
        <span class="text-slate-200 font-bold">₹${settlement.fairShare} / person</span>
      </div>
    </div>

    <div class="space-y-2">
      <div class="text-xs font-extrabold text-slate-200 uppercase tracking-wider">Kiska Kitna Nafa/Nuqsan & Adaigi:</div>
  `;

  if (settlement.transactions.length === 0) {
    html += `<div class="p-3 text-center text-xs text-slate-400 bg-slate-950 rounded-xl border border-slate-800">Dilon me safai hai huzoor! Sabka hisaab barabar hai.</div>`;
  } else {
    html += settlement.transactions.map(t => `
      <div class="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="text-xl">${t.fromAvatar || '💸'}</span>
          <div>
            <div>
              <span class="text-rose-400 font-extrabold">${t.from}</span> ada karenge 
              <span class="text-emerald-400 font-extrabold">${t.to}</span> ko
            </div>
            ${t.upiId ? `<div class="text-[10px] text-slate-400 font-mono">UPI: ${t.upiId}</div>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-black text-amber-300 text-sm">₹${t.amount}</span>
          ${t.upiUrl ? `
            <a href="${t.upiUrl}" class="bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black text-[11px] px-3 py-1.5 rounded-lg shadow active:scale-95">
              Direct UPI Bhejein
            </a>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  html += `</div>`;
  container.innerHTML = html;
}

// Renders complete per-user Win/Loss tables for historical sessions
function renderDetailedHistory(history) {
  const container = document.getElementById('gameHistoryList');
  if (!history || history.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">Koi purana hisaab mahfooz nahi hai huzoor. Khel band hone par mukammal tafseel yahan aayegi!</div>`;
    return;
  }

  container.innerHTML = history.map((h) => {
    const balances = (h.settlement && h.settlement.balances) ? h.settlement.balances : [];

    return `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        
        <!-- Header Info -->
        <div class="flex justify-between items-start border-b border-slate-800 pb-2.5">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-black text-amber-400 font-mono">${h.roomCode}</span>
              <span class="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">Khazanchi: ${h.bankerName}</span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono block mt-0.5">${h.closedAt}</span>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block font-mono">Kul Pot: <b class="text-emerald-400 font-mono">₹${h.totalPot}</b></span>
            <span class="text-[10px] text-slate-400 block font-mono">Kul Kharcha: <b class="text-indigo-400 font-mono">₹${h.totalExpenses}</b></span>
          </div>
        </div>

        <!-- Per-User WIN / LOSS Table -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-bold text-slate-200 uppercase tracking-wider flex items-center justify-between">
            <span>Har Khiladi Ka Nafa / Nuqsan (Win/Loss):</span>
            <span class="text-[10px] text-slate-400 font-normal">Final Net Balance</span>
          </div>
          
          <div class="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800/80">
            ${balances.map(b => {
              const isWin = b.finalNet > 0;
              const isLoss = b.finalNet < 0;
              const colorClass = isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400';
              const badgeClass = isWin ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' : isLoss ? 'bg-rose-950/80 text-rose-300 border-rose-800' : 'bg-slate-800 text-slate-400 border-slate-700';
              const sign = b.finalNet > 0 ? '+' : '';

              return `
                <div class="p-2.5 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">${b.avatar || '👤'}</span>
                    <div>
                      <div class="font-bold text-slate-200">${b.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono">
                        Buy-in: ₹${b.totalBuyInCash || 0} | Cashout: ₹${b.cashOutValue || 0}
                      </div>
                    </div>
                  </div>

                  <div class="text-right">
                    <div class="font-mono font-black text-sm ${colorClass}">
                      ${sign}₹${b.finalNet}
                    </div>
                    <span class="text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold ${badgeClass}">
                      ${isWin ? 'NAFA (WIN)' : isLoss ? 'NUQSAN (LOSS)' : 'EVEN'}
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Payment Settlements Instructions -->
        <div class="space-y-1.5 pt-1">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aapas Ki Adaigiyan:</div>
          <div class="space-y-1">
            ${(!h.settlement || h.settlement.transactions.length === 0) 
              ? '<div class="text-[11px] text-slate-500 italic bg-slate-950 p-2 rounded-xl border border-slate-800">Tamam khiladiyon ka hisaab barabar tha.</div>' 
              : h.settlement.transactions.map(t => `
                <div class="text-[11px] bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span><b class="text-rose-400">${t.from}</b> ➔ <b class="text-emerald-400">${t.to}</b></span>
                  <span class="font-mono font-extrabold text-amber-300">₹${t.amount}</span>
                </div>
              `).join('')
            }
          </div>
        </div>

      </div>
    `;
  }).join('');
}

function renderAdminUserManagement(users) {
  const container = document.getElementById('adminUserManagementList');
  if (!users || users.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500">Koi user darj nahi hai.</p>`;
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
              ${u.isBanker ? '<span class="text-[9px] text-emerald-400 font-mono">👑 KHAZANCHI</span>' : ''}
              ${u.isDisabled ? '<span class="text-[9px] bg-rose-950 text-rose-400 border border-rose-800 px-1 rounded">DISABLED</span>' : ''}
              ${!u.isApproved ? '<span class="text-[9px] bg-amber-950 text-amber-300 border border-amber-800 px-1 rounded">PENDING</span>' : ''}
            </div>
            <div class="text-[10px] text-slate-400 font-mono">UPI: ${u.upiId || 'None'}</div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          ${!u.isApproved ? `
            <button onclick="approveUser(${u.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg">
              Manzoor
            </button>
          ` : ''}

          ${!u.isAdmin ? `
            <button onclick="assignBanker(${u.id})" class="bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-1 rounded-lg shadow" title="Khazanchi Banayein">
              👑 Khazanchi
            </button>
            <button onclick="toggleDisableUser(${u.id})" class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] px-2 py-1 rounded-lg border border-slate-700">
              ${u.isDisabled ? 'Enable' : 'Disable'}
            </button>
            <button onclick="deleteUser(${u.id})" class="bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] px-2 py-1 rounded-lg font-bold">
              Alahida
            </button>
          ` : '<span class="text-[10px] text-slate-500 font-mono">Malak</span>'}
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

// User Actions
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
    alert('Kharcha ki sahi raqam darj kijiye huzoor!');
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
  alert('Aapka hisaab Khazanchi Sahab ke rubaroo pesh ho chuka hai!');
}

function finalizeSettlement() {
  socket.emit('finalizeSettlement');
}

function closeAndArchiveGame() {
  if (confirm("Khel ka ikhtitaam farmayein? Ye hisaab hamesha ke liye tareekhi dastawez (History) me darj ho jayega!")) {
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
  if (confirm("Kya aap waqai is khiladi ko mehfil se alahida karna chahte hain?")) {
    socket.emit('deleteUser', userId);
  }
}

function assignBanker(userId) {
  if (confirm("Kya aap in mohtaram ko Tijori ka Khazanchi (Banker) banana chahte hain?")) {
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
  alert('Naye qawaneen aur asrafiyon ki qeematein kamyabi se mahfooz ho gayin!');
}

// Bottom Navigation Tab Switching
function switchTab(tab) {
  const tabs = ['table', 'expenses', 'cashout', 'history', 'admin'];
  tabs.forEach(t => {
    const el = document.getElementById(`${t}Tab`);
    const bbtn = document.getElementById(`bnav_${t}`);
    if (el) el.classList.toggle('hidden', t !== tab);
    if (bbtn) {
      if (t === tab) {
        bbtn.className = 'flex flex-col items-center py-1 px-2.5 rounded-xl text-amber-400 font-extrabold transition scale-105';
      } else {
        bbtn.className = 'flex flex-col items-center py-1 px-2.5 rounded-xl text-slate-400 font-medium transition hover:text-slate-200';
      }
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
