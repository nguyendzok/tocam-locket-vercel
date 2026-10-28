/**
 * LOCKET GOLD VIP - ADMIN CONTROLLER JAVASCRIPT
 * Quản trị hồ sơ DNS, cài đặt ngân hàng MBBank, giá bán và lịch sử giao dịch
 */

let adminToken = localStorage.getItem('locket_admin_token') || '';
let currentAdminData = { users: [], settings: {}, stats: {} };
let liveMbbankTxs = [];

document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    verifyAndLoad();
  } else {
    showLoginModal();
  }
});

function showLoginModal() {
  const modal = document.getElementById('login-modal');
  const mainView = document.getElementById('admin-main-view');
  if (modal) modal.style.display = 'flex';
  if (mainView) mainView.style.display = 'none';
}

function hideLoginModal() {
  const modal = document.getElementById('login-modal');
  const mainView = document.getElementById('admin-main-view');
  if (modal) modal.style.display = 'none';
  if (mainView) mainView.style.display = 'block';
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const input = document.getElementById('admin-pass-input');
  const btn = document.getElementById('btn-login-submit');
  const pass = input?.value.trim();

  if (!pass) return alert('Vui lòng nhập mật khẩu quản trị!');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...';
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const data = await res.json();

    if (res.ok && data.success && data.token) {
      adminToken = data.token;
      localStorage.setItem('locket_admin_token', adminToken);
      hideLoginModal();
      loadAdminData();
    } else {
      alert(data.message || 'Mật khẩu không chính xác!');
      input?.focus();
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Đăng Nhập Quản Trị';
    }
  }
}

function handleLogout() {
  if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi trang quản trị?')) {
    adminToken = '';
    localStorage.removeItem('locket_admin_token');
    showLoginModal();
  }
}

async function verifyAndLoad() {
  try {
    const res = await fetch('/api/admin/data', {
      headers: { 'x-admin-token': adminToken }
    });
    if (res.status === 401) {
      adminToken = '';
      localStorage.removeItem('locket_admin_token');
      showLoginModal();
      return;
    }
    const data = await res.json();
    if (data.success) {
      hideLoginModal();
      currentAdminData = data;
      renderAllAdminUI(data);
    }
  } catch (e) {
    console.error('Lỗi tải dữ liệu admin:', e);
    showLoginModal();
  }
}

async function loadAdminData() {
  try {
    const res = await fetch('/api/admin/data', {
      headers: { 'x-admin-token': adminToken }
    });
    const data = await res.json();
    if (data.success) {
      currentAdminData = data;
      renderAllAdminUI(data);
    }
  } catch (e) {
    console.error('Lỗi làm mới dữ liệu:', e);
  }
}

function switchAdminTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.admin-nav-tabs .tab-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';
  if (btn) btn.classList.add('active');

  if (tabId === 'tab-mbbank') {
    loadMbbankLive();
  }
}

function renderAllAdminUI(data) {
  // 1. Thống kê
  document.getElementById('stat-total-users').innerText = data.stats.totalUsers || 0;
  document.getElementById('stat-active-users').innerText = data.stats.activeUsers || 0;
  document.getElementById('stat-expired-users').innerText = data.stats.expiredUsers || 0;

  // 2. Render Users Table
  renderUsersTable(data.users || []);

  // 3. Render Plans Form
  renderPlansForm(data.settings?.plans || {});

  // 4. Fill Bank & Token Settings
  fillBankSettingsForm(data.settings || {});
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">
          Chưa có hồ sơ DNS nào được tạo trong hệ thống.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isAct = u.status === 'ACTIVE' && (!u.expiresAt || u.expiresAt === 'LIFETIME' || new Date(u.expiresAt).getTime() > Date.now());
    const statusBadge = isAct
      ? `<span class="badge-status badge-active"><i class="fa-solid fa-circle-check"></i> Hoạt động</span>`
      : `<span class="badge-status badge-expired"><i class="fa-solid fa-circle-xmark"></i> Hết hạn (Rụng)</span>`;

    let expStr = 'Vĩnh Viễn';
    if (u.expiresAt && u.expiresAt !== 'LIFETIME' && u.expiresAt !== 'Vĩnh Viễn') {
      const d = new Date(u.expiresAt);
      expStr = isNaN(d) ? u.expiresAt : d.toLocaleString('vi-VN');
    }

    const avatar = u.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=F59E0B&color=fff&bold=true`;

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${avatar}" alt="" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1.5px solid #F59E0B;" onerror="this.src='https://ui-avatars.com/api/?name=${u.username}&background=333&color=fff'">
            <div>
              <b style="color:#fff; font-size:13.5px;">@${u.username}</b>
              <div style="font-size:11px; color:#94a3b8;">Tạo: ${new Date(u.activatedAt || Date.now()).toLocaleDateString('vi-VN')}</div>
            </div>
          </div>
        </td>
        <td>
          <code style="color:#38BDF8; font-size:11.5px;">${u.uid ? u.uid.substring(0, 16) + '...' : 'Chưa gán'}</code>
        </td>
        <td>
          <b style="color:#F59E0B;">${u.durationName || u.duration || 'Vĩnh Viễn'}</b>
        </td>
        <td>
          <span style="color:${isAct ? '#10B981' : '#EF4444'}; font-weight:700;">${expStr}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <a href="/api/profile/download?u=${encodeURIComponent(u.username)}&exp=${encodeURIComponent(u.expParam || 'lifetime')}" class="btn-action-sm btn-action-primary" title="Tải profile iOS .mobileconfig">
              <i class="fa-brands fa-apple"></i> iOS
            </a>
            <button type="button" class="btn-action-sm btn-action-primary" onclick="copyText('${u.nextdnsDotHost || (u.username + '.dns.locketvip.online')}', 'Đã chép DoT Host: ${u.nextdnsDotHost || (u.username + '.dns.locketvip.online')}')" title="Sao chép Android Private DNS">
              <i class="fa-brands fa-android"></i> Android
            </button>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td style="text-align:right;">
          <div style="display:flex; gap:6px; justify-content:flex-end;">
            <button type="button" class="btn-action-sm btn-action-success" onclick="openExtendModal('${u.username}')" title="Gia hạn thời gian sử dụng">
              <i class="fa-solid fa-clock"></i> Gia Hạn
            </button>
            <button type="button" class="btn-action-sm btn-action-danger" onclick="confirmDeleteUser('${u.username}')" title="Thu hồi DNS & làm rụng Gold ngay">
              <i class="fa-solid fa-trash-can"></i> Xóa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterUserTable() {
  const q = document.getElementById('user-search-input')?.value.toLowerCase().trim() || '';
  const filtered = currentAdminData.users.filter(u => {
    return (u.username && u.username.toLowerCase().includes(q)) || (u.uid && u.uid.toLowerCase().includes(q));
  });
  renderUsersTable(filtered);
}

// Xóa User và gỡ blocklist (làm rụng Gold)
async function confirmDeleteUser(username) {
  if (!confirm(`⚠️ BẠN CÓ CHẮC CHẮN MUỐN XÓA @${username}?\n\nHệ thống sẽ thu hồi DNS và gỡ chặn RevenueCat ngay lập tức, tài khoản của khách sẽ bị RỤNG GOLD về bản FREE!`)) {
    return;
  }

  try {
    const res = await fetch('/api/admin/user/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ ${data.message}`);
      loadAdminData();
    } else {
      alert(`❌ Lỗi: ${data.error}`);
    }
  } catch (e) {
    alert('Lỗi kết nối: ' + e.message);
  }
}

// Mở modal gia hạn
function openExtendModal(username) {
  const duration = prompt(`Nhập gói gia hạn cho @${username}:\n- 5m (Test 5 phút)\n- 1d (1 ngày)\n- month6 (6 tháng)\n- yearly (1 năm)\n- lifetime (Vĩnh viễn)`, 'lifetime');
  if (!duration) return;

  fetch('/api/admin/user/extend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken
    },
    body: JSON.stringify({ username, duration })
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        alert(d.message);
        loadAdminData();
      } else {
        alert('Lỗi: ' + d.error);
      }
    })
    .catch(e => alert('Lỗi: ' + e.message));
}

// Render Form Bảng Giá
function renderPlansForm(plans) {
  const container = document.getElementById('plans-form-container');
  if (!container) return;

  const planKeys = Object.keys(plans);
  container.innerHTML = planKeys.map(key => {
    const p = plans[key];
    return `
      <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <b style="color:#F59E0B; font-size:14px;">Mã Gói: ${key.toUpperCase()}</b>
          <span style="background:rgba(245,158,11,0.15); color:#F59E0B; font-size:11px; padding:2px 8px; border-radius:99px; font-weight:700;">${p.badge || 'VIP'}</span>
        </div>

        <div class="form-group">
          <label class="form-label">Tên Hiển Thị:</label>
          <input type="text" name="name_${key}" value="${p.name || ''}" class="form-input" required>
        </div>

        <div class="form-group">
          <label class="form-label">Giá Tiền (VNĐ):</label>
          <input type="number" name="price_${key}" value="${p.price || 0}" class="form-input" required>
        </div>

        <div class="form-group">
          <label class="form-label">Đơn Vị Thời Gian (VD: /năm, /trọn đời):</label>
          <input type="text" name="unit_${key}" value="${p.unit || ''}" class="form-input" required>
        </div>

        <div class="form-group">
          <label class="form-label">Mô Tả Gói:</label>
          <input type="text" name="desc_${key}" value="${p.description || ''}" class="form-input">
        </div>
      </div>
    `;
  }).join('');
}

// Lưu Cài đặt Giá bán
async function savePlansSettings(event) {
  event.preventDefault();
  const form = event.target;
  const currentPlans = currentAdminData.settings?.plans || {};
  const updatedPlans = { ...currentPlans };

  for (const key of Object.keys(currentPlans)) {
    const name = form[`name_${key}`]?.value;
    const price = parseInt(form[`price_${key}`]?.value || '0', 10);
    const unit = form[`unit_${key}`]?.value;
    const desc = form[`desc_${key}`]?.value;

    updatedPlans[key] = {
      ...currentPlans[key],
      name,
      price,
      formattedPrice: Number(price).toLocaleString('vi-VN') + 'đ',
      unit,
      description: desc
    };
  }

  const btn = document.getElementById('btn-save-plans');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
  }

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ plans: updatedPlans })
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ Đã lưu bảng giá thành công!');
      loadAdminData();
    } else {
      alert('❌ Lỗi: ' + data.error);
    }
  } catch (e) {
    alert('Lỗi lưu: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Bảng Giá Toàn Hệ Thống';
    }
  }
}

// Fill Form Cài đặt Ngân hàng & Facebook
function fillBankSettingsForm(settings) {
  const bank = settings.bank || {};
  document.getElementById('cfg-bank-name-input').value = bank.bankName || 'MBBank (Ngân hàng TMCP Quân Đội)';
  document.getElementById('cfg-bank-id-input').value = bank.bankId || 'MB';
  document.getElementById('cfg-bank-acc-input').value = bank.accountNumber || '11223344557766';
  document.getElementById('cfg-bank-holder-input').value = bank.accountHolder || 'HOANG NGOC NGUYEN';

  document.getElementById('cfg-mbbank-token-input').value = settings.mbbankToken || '2q5YDTrQAmVbm9cWKPaoVgFgn2t4';
  document.getElementById('cfg-fb-url-input').value = settings.facebookUrl || 'https://www.facebook.com/messages/t/nguyendzok';
  document.getElementById('cfg-fb-name-input').value = settings.facebookName || 'Facebook CSKH 24/7';
}

// Lưu Cài đặt Ngân hàng & Facebook
async function saveBankSettings(event) {
  event.preventDefault();
  const bankName = document.getElementById('cfg-bank-name-input').value.trim();
  const bankId = document.getElementById('cfg-bank-id-input').value.trim();
  const accountNumber = document.getElementById('cfg-bank-acc-input').value.trim();
  const accountHolder = document.getElementById('cfg-bank-holder-input').value.trim();

  const mbbankToken = document.getElementById('cfg-mbbank-token-input').value.trim();
  const facebookUrl = document.getElementById('cfg-fb-url-input').value.trim();
  const facebookName = document.getElementById('cfg-fb-name-input').value.trim();
  const newPass = document.getElementById('cfg-admin-new-pass').value.trim();

  const payload = {
    bank: { bankName, bankId, accountNumber, accountHolder },
    mbbankToken,
    facebookUrl,
    facebookName
  };

  if (newPass) {
    payload.adminPassword = newPass;
  }

  const btn = document.getElementById('btn-save-bank');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
  }

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      if (newPass) {
        adminToken = newPass;
        localStorage.setItem('locket_admin_token', newPass);
      }
      alert('✅ Đã lưu cấu hình Ngân hàng MBBank & Facebook thành công!');
      loadAdminData();
    } else {
      alert('❌ Lỗi: ' + data.error);
    }
  } catch (e) {
    alert('Lỗi lưu: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình Ngân Hàng &amp; Facebook';
    }
  }
}

// Test kết nối MBBank API
async function testMbbankConnection() {
  const token = document.getElementById('cfg-mbbank-token-input')?.value.trim();
  if (!token) return alert('Vui lòng nhập Token MBBank!');

  alert('Đang kiểm tra kết nối tới MBBank API...');
  try {
    const res = await fetch('/api/admin/mbbank-live', {
      headers: { 'x-admin-token': adminToken }
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Kết nối MBBank API thành công 100%!\n\nLấy được ${data.count} giao dịch gần nhất từ tài khoản.`);
    } else {
      alert(`❌ Lỗi kết nối MBBank: ${data.error}`);
    }
  } catch (e) {
    alert('Lỗi gọi API: ' + e.message);
  }
}

// TAB 4: Load MBBank Realtime
async function loadMbbankLive() {
  const tbody = document.getElementById('mbbank-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:30px; color:#94a3b8;">
          <i class="fa-solid fa-spinner fa-spin"></i> Đang truy vấn dữ liệu từ API MBBank...
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch('/api/admin/mbbank-live', {
      headers: { 'x-admin-token': adminToken }
    });
    const data = await res.json();
    if (data.success) {
      liveMbbankTxs = data.transactions || [];
      renderMbbankTable(liveMbbankTxs);
    } else {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#EF4444;">Lỗi: ${data.error}</td></tr>`;
    }
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#EF4444;">Không thể kết nối MBBank: ${e.message}</td></tr>`;
  }
}

function renderMbbankTable(txs) {
  const tbody = document.getElementById('mbbank-tbody');
  if (!tbody) return;

  if (txs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#94a3b8;">Không có giao dịch nào được ghi nhận.</td></tr>`;
    return;
  }

  tbody.innerHTML = txs.map(tx => {
    const isCredit = tx.creditDebitIndicator === 'CRDT';
    const amountClass = isCredit ? '#10B981' : '#94a3b8';
    const amountPrefix = isCredit ? '+' : '-';
    const desc = tx.description || '';

    // Tìm kiếm xem có khớp với username nào không
    let matchedUser = null;
    const cleanDesc = desc.toLowerCase().replace(/[@\s]/g, '');
    for (const u of currentAdminData.users) {
      if (cleanDesc.includes(u.username.toLowerCase())) {
        matchedUser = u.username;
        break;
      }
    }

    return `
      <tr>
        <td style="color:#94a3b8; font-size:12px; white-space:nowrap;">
          ${tx.bookingDate || tx.valueDate || 'Vừa xong'}
        </td>
        <td>
          <code style="color:#38BDF8; font-size:11.5px;">${tx.id || tx.reference || tx.xref || '--'}</code>
        </td>
        <td style="color:${amountClass}; font-weight:800; font-size:14px; white-space:nowrap;">
          ${amountPrefix}${Number(tx.amount || 0).toLocaleString('vi-VN')} ${tx.currency || 'VND'}
        </td>
        <td style="max-width:320px; font-size:12.5px; line-height:1.4;">
          ${desc}
          ${matchedUser ? `<div style="margin-top:4px;"><span style="background:rgba(56,189,248,0.2); color:#38BDF8; border:1px solid #38BDF8; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700;"><i class="fa-solid fa-user-check"></i> Khách: @${matchedUser}</span></div>` : ''}
        </td>
        <td style="color:#cbd5e1; font-size:12.5px; white-space:nowrap;">
          ${Number(tx.runningBalance || 0).toLocaleString('vi-VN')}
        </td>
        <td style="text-align:right;">
          ${matchedUser ? `
            <button type="button" class="btn-action-sm btn-action-success" onclick="openExtendModal('${matchedUser}')">
              <i class="fa-solid fa-bolt"></i> Gia Hạn
            </button>
          ` : `
            <button type="button" class="btn-action-sm btn-action-primary" onclick="quickActivatePrompt('${encodeURIComponent(desc)}')">
              <i class="fa-solid fa-plus"></i> Kích Hoạt
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function filterMbbankTable() {
  const q = document.getElementById('mbb-search-input')?.value.toLowerCase().trim() || '';
  const filtered = liveMbbankTxs.filter(tx => {
    return (tx.description && tx.description.toLowerCase().includes(q)) || (tx.id && tx.id.toLowerCase().includes(q));
  });
  renderMbbankTable(filtered);
}

function quickActivatePrompt(desc) {
  const decoded = decodeURIComponent(desc);
  const u = prompt(`Nhập Username Locket cần kích hoạt cho giao dịch:\n"${decoded}"`, '');
  if (!u) return;

  fetch('/api/admin/user/activate-manual', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken
    },
    body: JSON.stringify({ username: u, duration: 'lifetime' })
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        alert(d.message);
        loadAdminData();
      } else {
        alert('Lỗi: ' + d.error);
      }
    })
    .catch(e => alert('Lỗi: ' + e.message));
}

// Modal Kích Hoạt Thủ Công
function openAddUserModal() {
  document.getElementById('modal-add-user').style.display = 'flex';
}

function closeAddUserModal() {
  document.getElementById('modal-add-user').style.display = 'none';
}

async function submitManualActivation(event) {
  event.preventDefault();
  const uInput = document.getElementById('manual-user-input');
  const planSelect = document.getElementById('manual-plan-select');
  const btn = document.getElementById('btn-manual-submit');

  const username = uInput?.value.trim();
  const duration = planSelect?.value;

  if (!username) return alert('Vui lòng nhập Username Locket!');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nạp StoreKit & tạo DNS...';
  }

  try {
    const res = await fetch('/api/admin/user/activate-manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ username, duration })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🎉 ${data.message}`);
      closeAddUserModal();
      loadAdminData();
    } else {
      alert(`❌ Lỗi: ${data.error}`);
    }
  } catch (e) {
    alert('Lỗi kích hoạt: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Nạp Gold &amp; Tạo DNS Ngay';
    }
  }
}

function copyText(text, msg = 'Đã sao chép thành công!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => alert(msg));
  } else {
    prompt('Sao chép liên kết:', text);
  }
}
