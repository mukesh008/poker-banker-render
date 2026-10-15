const socket = io();

// Application State
let currentUser = null; // { id, name, upiId, isAdmin }
let latestState = null;
let localChipCounts = {};

// Handle state synchronization from WebSocket
socket.on('stateSync', (data) => {
  latestState = data;
  renderApp();
});

// Auth Handlers
async function login() {
  const userId = document.getElementById('loginUserSelect').value;
  const pin = document.getElementById('loginPin').value;
  const errBox = document.getElementById('authError');
  errBox.classList.add('hidden');

  if (!userId || !pin) {
    showAuthError('Please choose your name and enter your PIN');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    currentUser = data.user;
    localStorage.setItem('poker_user', JSON.stringify(currentUser));
    setupLoggedInView();
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

  const roleBadge = document.getElementById('roleBadge');
  const adminTab = document.getElementById('tabAdminBtn');

  if (currentUser.isAdmin) {
    roleBadge.innerText = 'BANKER / ADMIN';
    roleBadge.className = 'text-[10px] text-amber-400 font-mono font-bold';
    adminTab.classList.remove('hidden');
  } else {
    roleBadge.innerText = 'PLAYER';
    roleBadge.className = 'text-[10px] text-slate-400 font-mono';
    adminTab.classList.add('hidden');
  }
}

function toggleSignupModal(show) {
  document.getElementById('signupModal').classList.toggle('hidden', !show);
}

async function submitSignup() {
  const name = document.getElementById('regName').value;
  const pin = document.getElementById('regPin').value;
  const upiId = document.getElementById('regUpi').value;

  if (!name || pin.length !== 4) {
    alert('Please enter name and a 4-digit PIN');
    return;
  }

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin, upiId })
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

// Rendering Main App
function renderApp() {
  if (!latestState) return;

  // Render Login User Dropdown
  const userSelect = document.getElementById('loginUserSelect');
  const currentSelected = userSelect.value;
  userSelect.innerHTML = '<option value="">-- Choose your name --</option>' +
    latestState.approvedUsers.map(u => `<option value="${u.id}">${u.name}${u.isAdmin ? ' (Banker)' : ''}</option>`).join('');
  if (currentSelected) userSelect.value = currentSelected;

  // Update room code & stats
  document.getElementById('roomCodeDisplay').innerText = `ROOM: ${latestState.game.roomCode}`;
  const totalPot = latestState.game.players.reduce((sum, p) => sum + p.totalBuyInCash, 0);
  document.getElementById('statTotalPot').innerText = `₹${totalPot}`;
  document.getElementById('statBaseBuyin').innerText = `₹${latestState.game.baseBuyInCash}`;
  document.getElementById('statRate').innerText = `₹${latestState.game.ratePerChip}/pt`;

  if (!currentUser) {
    // Attempt auto login from localStorage
    const saved = localStorage.getItem('poker_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      setupLoggedInView();
    } else {
      return;
    }
  }

  // Check if current user is seated
  const seatedPlayer = latestState.game.players.find(p => p.userId === currentUser.id);
  const joinBanner = document.getElementById('joinTableBanner');
  const rebuyBox = document.getElementById('rebuyActionBox');

  if (!seatedPlayer) {
    joinBanner.classList.remove('hidden');
    rebuyBox.classList.add('hidden');
  } else {
    joinBanner.classList.add('hidden');
    rebuyBox.classList.remove('hidden');
  }

  // Render Seated Players
  renderPlayers(latestState.game.players);

  // Render Pending Rebuys for Banker
  renderPendingRebuys(latestState.game.pendingRebuys);

  // Render Expenses
  renderExpenses(latestState.game.expenses);

  // Render Chip Inputs for Cashout
  renderChipInputs(latestState.game.chipConfig);

  // Render Settlements if exists
  renderSettlements(latestState.game.lastSettlement);

  // Render Admin pending user approvals
  if (currentUser.isAdmin) {
    renderAdminApprovals(latestState.pendingUsers);
  }

  // Render Audit Feed
  renderAudit(latestState.game.auditLog);
}

function renderPlayers(players) {
  const container = document.getElementById('activePlayersList');
  document.getElementById('playerCountLabel').innerText = `${players.length} Playing`;

  if (players.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">No players seated yet. Click Take Seat to join!</div>`;
    return;
  }

  container.innerHTML = players.map(p => {
    const isMe = currentUser && currentUser.id === p.userId;
    return `
      <div class="p-3 flex items-center justify-between ${isMe ? 'bg-emerald-950/20' : ''}">
        <div>
          <div class="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
            ${p.name} ${isMe ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded">YOU</span>' : ''}
          </div>
          <div class="text-[11px] text-slate-400">
            Total In: <b class="text-slate-200">₹${p.totalBuyInCash}</b> (${p.totalChipsIssued} chips)
          </div>
        </div>
        <div class="text-right text-xs">
          ${p.hasCashedOut 
            ? `<span class="font-mono ${p.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${p.netPnl >= 0 ? '+' : ''}₹${p.netPnl}</span>`
            : '<span class="text-slate-500 text-[10px] font-mono">IN PLAY</span>'
          }
        </div>
      </div>
    `;
  }).join('');
}

function renderPendingRebuys(rebuys) {
  const box = document.getElementById('bankerApprovalBox');
  const list = document.getElementById('pendingRebuysList');

  if (!currentUser || !currentUser.isAdmin || rebuys.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  list.innerHTML = rebuys.map(r => `
    <div class="bg-amber-950/40 border border-amber-600/50 p-2.5 rounded-lg flex items-center justify-between text-xs">
      <div>
        <span class="font-bold text-amber-300">${r.name}</span> requested 
        <b class="text-white">₹${r.amountCash}</b> (${r.amountChips} chips)
        <div class="text-[10px] text-amber-400/80">${r.time}</div>
      </div>
      <div class="flex gap-1.5">
        <button onclick="approveRebuy('${r.requestId}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded">
          ✓ Approve
        </button>
        <button onclick="rejectRebuy('${r.requestId}')" class="bg-rose-900/60 hover:bg-rose-900 text-rose-300 px-2 py-1 rounded">
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
    list.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">No shared expenses logged yet.</div>`;
    return;
  }

  list.innerHTML = expenses.map(e => `
    <div class="p-3 flex items-center justify-between text-xs">
      <div>
        <div class="font-medium text-slate-200">${e.title}</div>
        <div class="text-[10px] text-slate-400">Paid by <span class="text-indigo-400 font-semibold">${e.payerName}</span> at ${e.time}</div>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-mono font-bold text-amber-300">₹${e.amount}</span>
        ${(currentUser && (currentUser.isAdmin || currentUser.id === e.payerId)) 
          ? `<button onclick="deleteExpense(${e.id})" class="text-rose-400 hover:text-rose-300 text-xs">&times;</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

function renderChipInputs(configs) {
  const grid = document.getElementById('chipInputGrid');
  grid.innerHTML = configs.map(c => `
    <div class="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
      <div class="flex items-center gap-1.5 text-xs font-semibold" style="color: ${c.colorHex}">
        <span class="w-3 h-3 rounded-full inline-block border border-slate-700" style="background-color: ${c.colorHex}"></span>
        ${c.color} (${c.chipValue} pts)
      </div>
      <input type="number" min="0" placeholder="0" 
        value="${localChipCounts[c.color] || ''}"
        oninput="updateLocalChip('${c.color}', this.value)"
        class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-xs font-mono text-white focus:outline-none focus:border-emerald-500" />
    </div>
  `).join('');
}

function updateLocalChip(color, val) {
  localChipCounts[color] = Number(val) || 0;
  computeLocalCashoutPreview();
}

function computeLocalCashoutPreview() {
  if (!latestState) return;
  let totalPts = 0;
  latestState.game.chipConfig.forEach(c => {
    totalPts += (localChipCounts[c.color] || 0) * c.chipValue;
  });
  const cashVal = (totalPts * latestState.game.ratePerChip).toFixed(2);
  document.getElementById('cashoutTotalChips').innerText = `${totalPts} pts`;
  document.getElementById('cashoutCashValue').innerText = `₹${cashVal}`;
}

function renderSettlements(settlement) {
  const container = document.getElementById('settlementReport');
  if (!settlement) return;

  let html = `
    <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Total Pot:</span>
        <span class="text-emerald-400 font-bold">₹${settlement.totalPot}</span>
      </div>
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Shared Expenses:</span>
        <span class="text-indigo-400 font-bold">₹${settlement.totalExpenses}</span>
      </div>
      <div class="flex justify-between font-mono">
        <span class="text-slate-400">Fair Expense Share:</span>
        <span class="text-slate-200">₹${settlement.fairShare} / player</span>
      </div>
    </div>

    <div class="space-y-1.5">
      <div class="text-xs font-semibold text-slate-300">Net Settlements (Who Pays Whom):</div>
  `;

  if (settlement.transactions.length === 0) {
    html += `<div class="p-3 text-center text-xs text-slate-400">All accounts are even. No transfers needed!</div>`;
  } else {
    html += settlement.transactions.map(t => `
      <div class="bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs">
        <div>
          <span class="text-rose-400 font-bold">${t.from}</span> pays <span class="text-emerald-400 font-bold">${t.to}</span>
          ${t.upiId ? `<div class="text-[10px] text-slate-400 font-mono">UPI: ${t.upiId}</div>` : ''}
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-bold text-amber-300">₹${t.amount}</span>
          ${t.upiUrl ? `
            <a href="${t.upiUrl}" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-2.5 py-1 rounded shadow">
              Pay via UPI
            </a>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderAdminApprovals(pending) {
  const container = document.getElementById('pendingUsersList');
  if (pending.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500">No new user registrations pending.</p>`;
    return;
  }
  container.innerHTML = pending.map(u => `
    <div class="bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs">
      <div>
        <div class="font-bold text-slate-200">${u.name}</div>
        <div class="text-[10px] text-slate-400 font-mono">UPI: ${u.upiId || 'None'}</div>
      </div>
      <button onclick="approveUser(${u.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded">
        Approve Player
      </button>
    </div>
  `).join('');
}

function renderAudit(logs) {
  const list = document.getElementById('auditLogList');
  list.innerHTML = logs.slice(0, 10).map(l => `<li>• ${l}</li>`).join('');
}

// User Actions Triggering WebSockets
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
    alert('Please enter valid amount');
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
  alert('Your chip counts have been submitted!');
}

function finalizeSettlement() {
  socket.emit('finalizeSettlement');
}

function approveUser(userId) {
  socket.emit('approveUser', userId);
}

function saveAdminConfig() {
  const cash = document.getElementById('adminBaseCash').value;
  const chips = document.getElementById('adminBaseChips').value;
  socket.emit('updateConfig', { baseBuyInCash: cash, baseStartingChips: chips });
  alert('Configuration updated!');
}

function resetGameSession() {
  if (confirm("Reset current table for a brand new poker night?")) {
    socket.emit('resetGame');
  }
}

// Tab Switching
function switchTab(tab) {
  ['table', 'expenses', 'cashout', 'admin'].forEach(t => {
    const el = document.getElementById(`${t}Tab`);
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
    if (el) el.classList.toggle('hidden', t !== tab);
    if (btn) {
      if (t === tab) {
        btn.classList.add('bg-emerald-600', 'text-white', 'font-semibold');
        btn.classList.remove('hover:text-slate-200');
      } else {
        btn.classList.remove('bg-emerald-600', 'text-white', 'font-semibold');
        btn.classList.add('hover:text-slate-200');
      }
    }
  });
}
