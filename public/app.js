const socket = io();

// 20+ Adult, Naughty & Hilarious Hinglish Poker Quotes (with Lucknow Swag)
const HINGLISH_QUOTES = [
  "Pehle aap, pehle aap ke chakkar me gaddi ka badshah koi aur loot le gaya! Poker me zyada sharmaye toh chaddi aur izzat dono utar jayegi!",
  "Poker aur sex me ek cheez common hai bhai... bluff tabhi tak chalta hai jab tak samne wala check na kar le!",
  "Pocket Aces leke baithna aur condom jeb me leke ghoomna ek barabar hai... maza tabhi hai jab samne se call aaye!",
  "Jitna time ladki ko patane me lagate ho, utna time cards read karne me laga lo toh raat ko rona nahi padega!",
  "Agar tera card khada nahi ho raha toh all-in kyu maar raha hai? Sharafat se fold maar aur chai pi!",
  "All-in maarna aur bina protection ke ghusna... dono me achanak lene ke dene pad jaate hain huzoor!",
  "Hazratganj ki shaam aur poker ka jaam... agar samne wale ka bluff na pakad sako toh pant khulna tay hai!",
  "Table pe bluff maarna aur date pe 'Main sirf tumse pyaar karta hu' bolna... dono me pakde gaye toh pitna tay hai!",
  "Poker me kismat sirf kapde kholne jaisi hai... aage kya nikalega kisi ko nahi pata!",
  "Poker ka asli nasha wahi hai... raat ko chips jeeto ya haaro, par subah utho toh kamar zaroor dukhni chahiye!",
  "Dost dost na raha jab river par usne mera flush dekh ke gaaliyan nikaali!",
  "Samne wale ke haath me kitna bada maal (stack) hai, uspe nazar rakhna hi asal khiladi ki pehchan hai!",
  "Fold karna seekho chotey, cinema ka porn-star banne ke chakkar me saare chips kho baithoge!",
  "Chips sambhal ke daalo janaab... table pe aag lagaane ke chakkar me ghar pe biwi ke haathon dande na pad jayein!",
  "Jitni tezi se tu Rebuy maang raha hai, utni tezi se toh OYO me room bhi lock nahi hota!",
  "Table pe shanti aur bed pe toofan... dono jagah zyada jaldbaazi karne se game jaldi khatam ho jaata hai!",
  "Jab kismat hi l**de lagane par aamada ho... toh badshah aur begum bhi kisi kaam ke nahi rehte!",
  "Nawab sahab ne kaha tha: Tash me aur ishq me, jab tak samne wala poora nanga na ho jaye... game band mat samjho!",
  "Table pe paisa aur biwi ka gussa... kab gayab ho jaye kisi ko nahi pata!",
  "Cards ache na hon toh hila ke so jao, par table pe aake bakchodi mat pelo!"
];

const AVATAR_OPTIONS = ['🦁', '🐯', '🦅', '🐺', '🦊', '🦈', '👑', '🃏', '🎩', '🥷', '💀', '💸'];

let currentUser = null;
let latestState = null;
let localChipCounts = {};
let selectedRegAvatar = '🦁';
let selectedProfileAvatar = '🦁';
let activeQuoteIndex = 0;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Registration error:', err));
  });
}

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
  activeQuoteIndex = Math.floor(Math.random() * HINGLISH_QUOTES.length);
  updateQuoteUI();
}

function nextRandomQuote() {
  activeQuoteIndex = (activeQuoteIndex + 1) % HINGLISH_QUOTES.length;
  updateQuoteUI();
}

function nextRandomQuoteInModal() {
  activeQuoteIndex = (activeQuoteIndex + 1) % HINGLISH_QUOTES.length;
  updateQuoteUI();
}

function updateQuoteUI() {
  const quote = HINGLISH_QUOTES[activeQuoteIndex];
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
      <button type="button" onclick="selectRegAvatar('${a}')" id="regAv_${a}" class="p-1.5 rounded-xl border ${a === selectedRegAvatar ? 'border-amber-500 bg-amber-500/20' : 'border-white/10'} hover:border-slate-500 transition">
        ${a}
      </button>
    `).join('');
  }

  if (profContainer) {
    profContainer.innerHTML = AVATAR_OPTIONS.map(a => `
      <button type="button" onclick="selectProfileAvatar('${a}')" id="profAv_${a}" class="p-1.5 rounded-xl border ${a === selectedProfileAvatar ? 'border-amber-500 bg-amber-500/20' : 'border-white/10'} hover:border-slate-500 transition">
        ${a}
      </button>
    `).join('');
  }
}

function selectRegAvatar(av) {
  selectedRegAvatar = av;
  AVATAR_OPTIONS.forEach(a => {
    const el = document.getElementById(`regAv_${a}`);
    if (el) el.className = `p-1.5 rounded-xl border ${a === av ? 'border-amber-500 bg-amber-500/20' : 'border-white/10'} hover:border-slate-500 transition`;
  });
}

function selectProfileAvatar(av) {
  selectedProfileAvatar = av;
  AVATAR_OPTIONS.forEach(a => {
    const el = document.getElementById(`profAv_${a}`);
    if (el) el.className = `p-1.5 rounded-xl border ${a === av ? 'border-amber-500 bg-amber-500/20' : 'border-white/10'} hover:border-slate-500 transition`;
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
    showAuthError('Apna naam aur 4-digit PIN daalo pehle bhai!');
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
  autoRegisterPushIfGranted();
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
    roleBadge.className = 'text-[8px] text-amber-400 font-mono font-black';
    bnavAdmin.classList.remove('hidden');
  } else if (latestState && latestState.game.bankerUserId === currentUser.id) {
    roleBadge.innerText = 'BANKER';
    roleBadge.className = 'text-[8px] text-emerald-400 font-mono font-black';
    bnavAdmin.classList.add('hidden');
  } else {
    roleBadge.innerText = 'KHILADI';
    roleBadge.className = 'text-[8px] text-slate-400 font-mono font-bold';
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
    alert('Naam aur 4-digit PIN dono zaroori hain bhai!');
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
  alert('Aapka profile update ho gaya hai!');
}

function renderApp() {
  if (!latestState) return;

  const userSelect = document.getElementById('loginUserSelect');
  const currentSelected = userSelect.value;
  userSelect.innerHTML = '<option value="">-- Apna Naam Select Karo --</option>' +
    latestState.approvedUsers.map(u => `<option value="${u.id}">${u.avatar} ${u.name}${u.isBanker ? ' (👑 Banker)' : u.isAdmin ? ' (Admin)' : ''}</option>`).join('');
  if (currentSelected) userSelect.value = currentSelected;

  document.getElementById('roomCodeDisplay').innerText = `ROOM: ${latestState.game.roomCode}`;
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
  renderPurePokerSettlement(latestState.game.pokerSettlement, isBankerOrAdmin);
  renderPureExpenseSettlement(latestState.game.expenseSettlement);
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
      <span class="inline-flex items-center gap-1.5 bg-gray-900/90 px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-medium shadow-sm">
        <span>${c.icon}</span>
        <b style="color: ${c.colorHex}">${c.name}:</b>
        <span class="font-mono text-slate-100 font-bold">${c.chipValue} pts</span>
        <span class="text-emerald-400 font-mono text-[10px] font-semibold">(₹${cashVal})</span>
      </span>
    `;
  }).join('');
}

function renderPlayers(players) {
  const container = document.getElementById('activePlayersList');
  document.getElementById('playerCountLabel').innerText = `${players.length} Playing`;

  if (players.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-500 font-medium">Table khali hai bhai! "Seat Pakdo" dabao aur aao.</div>`;
    return;
  }

  container.innerHTML = players.map(p => {
    const isMe = currentUser && currentUser.id === p.userId;
    const isBanker = latestState.game.bankerUserId === p.userId;
    return `
      <div class="p-3 flex items-center justify-between ${isMe ? 'bg-amber-500/10' : ''}">
        <div class="flex items-center gap-2.5">
          <span class="text-xl leading-none">${p.avatar || '🃏'}</span>
          <div>
            <div class="text-xs font-bold text-white flex items-center gap-1.5">
              ${p.name} 
              ${isBanker ? '<span class="text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded font-mono font-bold">BANKER</span>' : ''}
              ${isMe ? '<span class="text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 rounded font-mono font-bold">YOU</span>' : ''}
            </div>
            <div class="text-[11px] text-slate-400 font-medium">
              Total In: <b class="text-slate-200 font-mono">₹${p.totalBuyInCash}</b> (${p.totalChipsIssued} pts)
            </div>
          </div>
        </div>
        <div class="text-right text-xs">
          ${p.hasCashedOut 
            ? `<span class="font-mono ${p.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-extrabold text-sm">${p.netPnl >= 0 ? '+' : ''}₹${p.netPnl}</span>`
            : '<span class="text-slate-400 text-[10px] font-mono font-bold bg-gray-900 border border-white/10 px-2 py-0.5 rounded">IN PLAY</span>'
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
    <div class="bg-gray-900 border border-amber-500/40 p-3 rounded-xl flex items-center justify-between text-xs shadow-md">
      <div class="flex items-center gap-2.5">
        <span class="text-2xl leading-none">${r.avatar || '💸'}</span>
        <div>
          <span class="font-extrabold text-amber-300 text-sm">${r.name}</span> ne maanga: 
          <b class="text-white font-mono">₹${r.amountCash}</b> (${r.amountChips} pts)
          <div class="text-[10px] text-amber-400/80 font-mono">${r.time} • Chips do aur approve karo!</div>
        </div>
      </div>
      <div class="flex gap-1.5">
        <button onclick="approveRebuy('${r.requestId}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-1.5 rounded-lg shadow active:scale-95 transition">
          ✓ Approve
        </button>
        <button onclick="rejectRebuy('${r.requestId}')" class="bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold px-2.5 py-1.5 rounded-lg active:scale-95 transition">
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
    list.innerHTML = `<div class="p-4 text-center text-xs text-slate-500 font-medium">Abhi tak kisi kharche ka hisaab add nahi hua.</div>`;
    return;
  }

  list.innerHTML = expenses.map(e => `
    <div class="p-3 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2.5">
        <span class="text-lg leading-none">${e.avatar || '🧾'}</span>
        <div>
          <div class="font-bold text-white text-sm">${e.title}</div>
          <div class="text-[10px] text-slate-400">Paid by: <span class="text-indigo-400 font-bold">${e.payerName}</span> (${e.time})</div>
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
    <div class="bg-gray-900/90 p-2.5 rounded-xl border border-white/10 space-y-1 shadow-sm">
      <div class="flex items-center justify-between text-[11px] font-bold">
        <span class="flex items-center gap-1.5" style="color: ${c.colorHex}">
          <span>${c.icon}</span> ${c.name}
        </span>
        <span class="text-slate-300 font-mono text-[10px]">${c.chipValue} pts</span>
      </div>
      <input type="number" min="0" placeholder="0" 
        value="${localChipCounts[c.id] || ''}"
        oninput="updateLocalToken('${c.id}', this.value)"
        class="w-full bg-gray-950 border border-white/15 rounded-lg px-2.5 py-1 text-right text-xs font-mono text-white focus:outline-none focus:border-amber-500 font-bold" />
      <div class="text-[10px] text-slate-400 text-right font-mono">
        ₹${(c.chipValue * rate).toFixed(0)} / chip
      </div>
    </div>
  `).join('');

  specialGrid.innerHTML = specials.map(c => `
    <div class="bg-gray-900/90 p-2.5 rounded-xl border border-amber-500/30 space-y-1 shadow-sm">
      <div class="flex items-center justify-between text-xs font-extrabold text-amber-300">
        <span class="flex items-center gap-1.5">
          <span class="text-base">${c.icon}</span> ${c.name}
        </span>
        <span class="font-mono text-amber-400 text-xs font-bold">${c.chipValue} pts</span>
      </div>
      <input type="number" min="0" placeholder="0" 
        value="${localChipCounts[c.id] || ''}"
        oninput="updateLocalToken('${c.id}', this.value)"
        class="w-full bg-gray-950 border border-amber-500/30 rounded-lg px-2.5 py-1 text-right text-xs font-mono text-amber-200 font-extrabold focus:outline-none focus:border-amber-500" />
      <div class="text-[10px] text-amber-400/90 text-right font-mono font-bold">
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


function finalizePokerSettlementAction() {
  socket.emit('finalizePokerSettlement');
}

function calculateExpenseSettlementAction() {
  socket.emit('calculateExpenseSettlement');
}

function renderPurePokerSettlement(settlement, isBankerOrAdmin) {
  const container = document.getElementById('purePokerSettlementReport');
  const closeBox = document.getElementById('closeGameSection');

  if (!settlement) {
    if (closeBox) closeBox.classList.add('hidden');
    container.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">Game khatam hone par "Poker Hisaab Nikalo" dabayein.</p>';
    return;
  }

  if (closeBox && isBankerOrAdmin) {
    closeBox.classList.remove('hidden');
  }

  let html = `
    <div class="bg-gray-950 p-3.5 rounded-xl border border-emerald-500/30 flex justify-between items-center text-xs font-mono">
      <div>
        <span class="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">Total Poker Pot</span>
        <span class="text-emerald-400 font-black text-base">₹${settlement.totalPot}</span>
      </div>
      <div class="text-right">
        <span class="text-[9px] text-slate-400 block font-mono">Calculated At</span>
        <span class="text-slate-200 font-bold">${settlement.calculatedAt || ''}</span>
      </div>
    </div>

    <div class="space-y-2">
      <div class="text-xs font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
        <span>♠️</span> Poker Game Ki Direct Adaigi (Who Pays Whom):
      </div>
  `;

  const txs = settlement.transactions || [];
  if (txs.length === 0) {
    html += `<div class="p-3 text-center text-xs text-slate-400 bg-gray-950 rounded-xl border border-white/10">Poker me kisi ko kisi ko paisa nahi dena. Sab even!</div>`;
  } else {
    html += txs.map(t => `
      <div class="bg-gray-900 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-between text-xs shadow-sm">
        <div class="flex items-center gap-2.5">
          <span class="text-xl leading-none">${t.fromAvatar || '💸'}</span>
          <div>
            <div>
              <span class="text-rose-400 font-extrabold">${t.from}</span> dega 
              <span class="text-emerald-400 font-extrabold">${t.to}</span> ko
            </div>
            ${t.upiId ? `<div class="text-[10px] text-slate-400 font-mono">UPI: ${t.upiId}</div>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-black text-emerald-400 text-sm">₹${t.amount}</span>
          ${t.upiUrl ? `
            <a href="${t.upiUrl}" class="bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black text-[11px] px-3 py-1.5 rounded-lg shadow active:scale-95 transition">
              Pay Poker UPI
            </a>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderPureExpenseSettlement(settlement) {
  const container = document.getElementById('pureExpenseSettlementReport');
  if (!settlement) {
    container.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">Kharcha settlement dekhne ke liye "Kharcha Settle Karo" dabayein.</p>';
    return;
  }

  let html = `
    <div class="grid grid-cols-2 gap-2 bg-gray-950 p-3 rounded-xl border border-indigo-500/30 text-center text-xs font-mono">
      <div>
        <span class="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">Total Party Kharcha</span>
        <span class="text-indigo-400 font-bold text-sm">₹${settlement.totalExpenses}</span>
      </div>
      <div>
        <span class="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">Har Khiladi Ka Hissa</span>
        <span class="text-slate-100 font-bold text-sm">₹${settlement.fairShare} / person</span>
      </div>
    </div>

    <div class="space-y-2 pt-1">
      <div class="text-xs font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
        <span>🧾</span> Sirf Kharcha Ka Lena-Dena (Bills Settlement):
      </div>
  `;

  const txs = settlement.transactions || [];
  if (txs.length === 0) {
    html += `<div class="p-3 text-center text-xs text-slate-400 bg-gray-950 rounded-xl border border-white/10">Kharchon ka hisaab bilkul barabar hai!</div>`;
  } else {
    html += txs.map(t => `
      <div class="bg-gray-900 border border-indigo-500/20 p-3 rounded-xl flex items-center justify-between text-xs shadow-sm">
        <div class="flex items-center gap-2.5">
          <span class="text-xl leading-none">${t.fromAvatar || '🧾'}</span>
          <div>
            <div>
              <span class="text-rose-400 font-extrabold">${t.from}</span> dega 
              <span class="text-indigo-400 font-extrabold">${t.to}</span> ko
            </div>
            ${t.upiId ? `<div class="text-[10px] text-slate-400 font-mono">UPI: ${t.upiId}</div>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-black text-indigo-300 text-sm">₹${t.amount}</span>
          ${t.upiUrl ? `
            <a href="${t.upiUrl}" class="bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-500 hover:to-blue-400 text-white font-black text-[11px] px-3 py-1.5 rounded-lg shadow active:scale-95 transition">
              Pay Bill UPI
            </a>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  html += `</div>`;
  container.innerHTML = html;
}



function renderDetailedHistory(history) {
  const container = document.getElementById('gameHistoryList');
  if (!history || history.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 glass-card rounded-2xl border border-white/10">Koi purana hisaab saved nahi hai. Game band hone par summary yahan save hogi!</div>`;
    return;
  }

  container.innerHTML = history.map((h) => {
    const pokerBalances = (h.pokerSettlement && h.pokerSettlement.balances) ? h.pokerSettlement.balances : [];
    const pokerTxs = (h.pokerSettlement && h.pokerSettlement.transactions) ? h.pokerSettlement.transactions : [];
    const expenseTxs = (h.expenseSettlement && h.expenseSettlement.transactions) ? h.expenseSettlement.transactions : [];

    return `
      <div class="glass-card rounded-2xl p-4 space-y-3.5 shadow-lg border border-white/10">
        <div class="flex justify-between items-start border-b border-white/10 pb-2.5">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-black text-amber-400 font-mono">${h.roomCode}</span>
              <span class="text-[10px] bg-gray-900 text-slate-300 px-2 py-0.5 rounded-full font-mono border border-white/10">Banker: ${h.bankerName}</span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono block mt-0.5">${h.closedAt}</span>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block font-mono">Poker Pot: <b class="text-emerald-400 font-mono">₹${h.totalPot}</b></span>
            <span class="text-[10px] text-slate-400 block font-mono">Party Kharcha: <b class="text-indigo-400 font-mono">₹${h.totalExpenses}</b></span>
          </div>
        </div>

        <!-- 1. Pure Poker Results -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">♠️ Poker Table Results (Win / Loss):</div>
          <div class="bg-gray-950 rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
            ${pokerBalances.map(b => {
              const isWin = b.pokerNet > 0;
              const isLoss = b.pokerNet < 0;
              const colorClass = isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400';
              const badgeClass = isWin ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' : isLoss ? 'bg-rose-950/80 text-rose-300 border-rose-800' : 'bg-gray-900 text-slate-400 border-white/10';
              const sign = b.pokerNet > 0 ? '+' : '';

              return `
                <div class="p-2.5 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span class="text-lg leading-none">${b.avatar || '👤'}</span>
                    <div>
                      <div class="font-bold text-white">${b.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono">
                        Buy-in: ₹${b.totalBuyInCash || 0} | Cashout: ₹${b.cashOutValue || 0}
                      </div>
                    </div>
                  </div>

                  <div class="text-right">
                    <div class="font-mono font-black text-sm ${colorClass}">
                      ${sign}₹${b.pokerNet}
                    </div>
                    <span class="text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold ${badgeClass}">
                      ${isWin ? 'WIN' : isLoss ? 'LOSS' : 'EVEN'}
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Poker Payments -->
        <div class="space-y-1 pt-1">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Poker Payments:</div>
          ${pokerTxs.length === 0 ? '<div class="text-[11px] text-slate-500 italic bg-gray-950 p-2 rounded-xl border border-white/10">Poker me koi payments pending nahi the.</div>' : pokerTxs.map(t => `
            <div class="text-[11px] bg-gray-950/80 px-3 py-1.5 rounded-xl border border-white/10 flex justify-between items-center">
              <span><b class="text-rose-400">${t.from}</b> ➔ <b class="text-emerald-400">${t.to}</b></span>
              <span class="font-mono font-extrabold text-emerald-400">₹${t.amount}</span>
            </div>
          `).join('')}
        </div>

        <!-- 2. Pure Kharcha Payments -->
        <div class="space-y-1 pt-2 border-t border-white/10">
          <div class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">🧾 Kharcha / Bills Payments:</div>
          ${expenseTxs.length === 0 ? '<div class="text-[11px] text-slate-500 italic bg-gray-950 p-2 rounded-xl border border-white/10">Kharchon ka hisaab barabar tha.</div>' : expenseTxs.map(t => `
            <div class="text-[11px] bg-gray-950/80 px-3 py-1.5 rounded-xl border border-white/10 flex justify-between items-center">
              <span><b class="text-rose-400">${t.from}</b> ➔ <b class="text-indigo-400">${t.to}</b></span>
              <span class="font-mono font-extrabold text-indigo-300">₹${t.amount}</span>
            </div>
          `).join('')}
        </div>

      </div>
    `;
  }).join('');
}


function renderAdminUserManagement(users) {
  const container = document.getElementById('adminUserManagementList');
  if (!users || users.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500">Koi user registered nahi hai.</p>`;
    return;
  }

  container.innerHTML = users.map(u => {
    return `
      <div class="bg-gray-900 border border-white/10 p-3 rounded-xl flex items-center justify-between text-xs shadow-sm">
        <div class="flex items-center gap-2.5">
          <span class="text-xl leading-none">${u.avatar || '👤'}</span>
          <div>
            <div class="font-bold text-white flex items-center gap-1.5">
              ${u.name}
              ${u.isAdmin ? '<span class="text-[8px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/30">ADMIN</span>' : ''}
              ${u.isBanker ? '<span class="text-[8px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/30">👑 BANKER</span>' : ''}
              ${u.isDisabled ? '<span class="text-[8px] bg-rose-950 text-rose-400 border border-rose-800 px-1 rounded">DISABLED</span>' : ''}
              ${!u.isApproved ? '<span class="text-[8px] bg-amber-950 text-amber-300 border border-amber-800 px-1 rounded">PENDING</span>' : ''}
            </div>
            <div class="text-[10px] text-slate-400 font-mono">UPI: ${u.upiId || 'None'}</div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          ${!u.isApproved ? `
            <button onclick="approveUser(${u.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg transition active:scale-95">
              Approve
            </button>
          ` : ''}

          ${!u.isAdmin ? `
            <button onclick="assignBanker(${u.id})" class="bg-amber-500 hover:bg-amber-400 text-gray-950 font-black text-[10px] px-2 py-1 rounded-lg shadow transition active:scale-95" title="Banker Banao">
              👑 Banker
            </button>
            <button onclick="toggleDisableUser(${u.id})" class="bg-gray-800 hover:bg-gray-700 text-slate-200 text-[10px] px-2 py-1 rounded-lg border border-white/10 transition active:scale-95">
              ${u.isDisabled ? 'Enable' : 'Disable'}
            </button>
            <button onclick="deleteUser(${u.id})" class="bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] px-2 py-1 rounded-lg font-bold transition active:scale-95">
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
      <div class="bg-gray-900 p-2.5 rounded-xl border ${isSpecial ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10'} flex items-center justify-between shadow-sm">
        <div class="flex items-center gap-2">
          <span class="text-base">${c.icon}</span>
          <div>
            <div class="font-bold text-xs" style="color: ${c.colorHex}">${c.name}</div>
            <div class="text-[10px] text-slate-400 font-mono">₹<span id="cashPreview_${c.id}">${cashVal}</span> cash</div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <input type="number" id="tokenCfg_${c.id}" value="${c.chipValue}" 
            oninput="updateAdminTokenPreview('${c.id}')"
            class="w-20 bg-gray-950 border border-white/15 rounded-lg px-2 py-1 text-right font-mono text-white text-xs focus:border-amber-500 focus:outline-none font-bold" />
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
    alert('Bill ka amount sahi se daalo bhai!');
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
  alert('Aapke chips submit ho gaye hain! Banker verify karega.');
}

function finalizeSettlement() {
  socket.emit('finalizeSettlement');
}

function closeAndArchiveGame() {
  if (confirm("Game band karke history me save karna hai?")) {
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
  if (confirm("Pakka is player ko delete karna hai?")) {
    socket.emit('deleteUser', userId);
  }
}

function assignBanker(userId) {
  if (confirm("Is khiladi ko Banker banana hai?")) {
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
  alert('Rules aur chip values save ho gayi hain!');
}

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


// ==================== WEB PUSH CLIENT LOGIC ====================
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    alert('Aapka browser Push Notifications support nahi karta bhai!');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission deny ho gayi. Settings se enable karein!');
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const res = await fetch('/api/push/vapid-key');
    const { publicKey } = await res.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    if (currentUser) {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, subscription })
      });
      document.getElementById('notifBellIcon').innerText = '🔕';
      alert('🔔 Shabaash! Push Notifications ON ho gaye hain. Ab koi rebuy maangega toh phone pe ghanti bajegi!');
    } else {
      alert('Pehle login kar lo, phir notification activate karo!');
    }
  } catch (err) {
    console.error('Push error:', err);
    alert('Push subscription me issue aaya: ' + err.message);
  }
}

// Auto check push subscription on login
async function autoRegisterPushIfGranted() {
  if ('Notification' in window && Notification.permission === 'granted' && currentUser) {
    try {
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        const res = await fetch('/api/push/vapid-key');
        const { publicKey } = await res.json();
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, subscription })
      });
      const icon = document.getElementById('notifBellIcon');
      if (icon) icon.innerText = '🔕';
    } catch (e) {
      console.log('Auto push registration silent fail:', e);
    }
  }
}
