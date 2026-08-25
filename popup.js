// popup：多资料管理 + 模板学习 + 自定义字段 + 填充指令

const GROUPS = [
  {
    mount: 'personal',
    slots: [
      { key: 'name', label: '真实姓名' },
      { key: 'penName', label: '笔名' },
      { key: 'idNo', label: '身份证号' },
      { key: 'address', label: '联系地址' },
      { key: 'phone', label: '手机号' },
      { key: 'email', label: '邮箱' },
    ],
  },
  {
    mount: 'bank',
    slots: [
      { key: 'acctName', label: '开户名称' },
      { key: 'bank', label: '开户行' },
      { key: 'bankBranch', label: '开户支行' },
      { key: 'bankAccount', label: '银行账号' },
    ],
  },
  {
    mount: 'auth',
    slots: [
      { key: 'name2', label: '姓名' },
      { key: 'idNo2', label: '身份证号' },
      { key: 'penName2', label: '笔名' },
    ],
  },
];

const FIXED_SLOTS = GROUPS.flatMap(g => g.slots);
const $ = (id) => document.getElementById(id);

let state = null;   // fddNormalizeState 后的全量状态

// 固定字段 + 自定义字段 = 全部可用字段
function allFields() {
  return FDD_FIELDS.concat(state.customFields || []);
}

// ---------- 基础 ----------
function saveState(cb) {
  chrome.storage.local.set({
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    templates: state.templates,
    customFields: state.customFields,
    autoFill: $('autoFill').checked,
    showFab: $('showFab').checked,
  }, () => cb && cb());
}

function setStatus(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = cls || '';
}

function activeProfile() {
  return state.profiles[state.activeProfileId] || Object.values(state.profiles)[0];
}

// ---------- 固定字段网格 ----------
function buildRows() {
  for (const g of GROUPS) {
    const wrap = $(g.mount);
    for (const s of g.slots) {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = s.label;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'slot-' + s.key;
      input.placeholder = s.label;
      row.append(label, input);
      wrap.appendChild(row);
    }
  }
}

function renderFields() {
  const values = activeProfile().values || {};
  for (const s of FIXED_SLOTS) {
    const el = $('slot-' + s.key);
    el.value = values[s.key] || '';
    el.classList.toggle('filled', !!el.value.trim());
  }
  $('profileName').value = activeProfile().name || '';
}

function collectFields() {
  activeProfile().values = activeProfile().values || {};
  for (const s of FIXED_SLOTS) {
    activeProfile().values[s.key] = $('slot-' + s.key).value.trim();
  }
  // 自定义字段：label + 值
  for (const f of (state.customFields || [])) {
    const nameEl = $('cfield-name-' + f.key);
    const valEl = $('cfield-val-' + f.key);
    if (nameEl) f.label = nameEl.value.trim() || f.label;
    if (valEl) activeProfile().values[f.key] = valEl.value.trim();
  }
  activeProfile().name = $('profileName').value.trim() || activeProfile().name;
}

// ---------- 自定义字段 ----------
function renderCustomFields() {
  const wrap = $('custom');
  wrap.innerHTML = '';
  for (const f of (state.customFields || [])) {
    const row = document.createElement('div');
    row.className = 'crow';
    const name = document.createElement('input');
    name.className = 'cname';
    name.id = 'cfield-name-' + f.key;
    name.value = f.label;
    name.title = '字段名';
    const val = document.createElement('input');
    val.className = 'cval';
    val.id = 'cfield-val-' + f.key;
    val.placeholder = f.label;
    val.value = (activeProfile().values || {})[f.key] || '';
    const del = document.createElement('button');
    del.className = 'mini-btn danger';
    del.textContent = '删';
    del.title = '删除此自定义字段（所有资料里的值一并删除）';
    del.onclick = () => {
      if (!confirm('删除自定义字段「' + f.label + '」？')) return;
      state.customFields = state.customFields.filter(x => x.key !== f.key);
      for (const p of Object.values(state.profiles)) {
        if (p.values) delete p.values[f.key];
      }
      saveState(() => { renderCustomFields(); setStatus('字段已删除 ✓', 'ok'); });
    };
    row.append(name, val, del);
    wrap.appendChild(row);
  }
}

$('addField').onclick = () => {
  collectFields();
  const key = 'c' + Date.now();
  state.customFields.push({ key, label: '新字段' });
  renderCustomFields();
  saveState(() => {
    const el = $('cfield-name-' + key);
    if (el) { el.focus(); el.select(); }
    setStatus('已添加字段，改名并填值后记得「保存」', 'ok');
  });
};

// ---------- 资料切换 ----------
function renderProfiles() {
  const sel = $('profileSelect');
  sel.innerHTML = '';
  for (const p of Object.values(state.profiles)) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name || '未命名资料';
    if (p.id === state.activeProfileId) opt.selected = true;
    sel.appendChild(opt);
  }
}

$('profileSelect').onchange = () => {
  collectFields(); // 先收住当前编辑
  state.activeProfileId = $('profileSelect').value;
  renderProfiles();
  renderFields();
  renderCustomFields();
  saveState();
};

$('profileName').onchange = () => {
  collectFields();
  renderProfiles();
  saveState();
};

$('newProfile').onclick = () => {
  collectFields();
  const id = 'p' + Date.now();
  state.profiles[id] = { id, name: '新资料', values: {} };
  state.activeProfileId = id;
  renderProfiles();
  renderFields();
  renderCustomFields();
  saveState(() => setStatus('已新建资料 ✓', 'ok'));
};

$('dupProfile').onclick = () => {
  collectFields();
  const src = activeProfile();
  const id = 'p' + Date.now();
  state.profiles[id] = { id, name: src.name + ' 副本', values: Object.assign({}, src.values) };
  state.activeProfileId = id;
  renderProfiles();
  renderFields();
  renderCustomFields();
  saveState(() => setStatus('已复制资料 ✓', 'ok'));
};

$('delProfile').onclick = () => {
  const ids = Object.keys(state.profiles);
  if (ids.length <= 1) { setStatus('至少保留一套资料', 'err'); return; }
  if (!confirm('删除当前资料「' + (activeProfile().name || '') + '」？')) return;
  delete state.profiles[state.activeProfileId];
  state.activeProfileId = Object.keys(state.profiles)[0];
  renderProfiles();
  renderFields();
  renderCustomFields();
  saveState(() => setStatus('已删除 ✓', 'ok'));
};

// 授权书字段 = 个人信息
$('copyToAuth').onclick = () => {
  $('slot-name2').value = $('slot-name').value;
  $('slot-idNo2').value = $('slot-idNo').value;
  $('slot-penName2').value = $('slot-penName').value;
  FIXED_SLOTS.forEach(s => $('slot-' + s.key).classList.toggle('filled', !!$('slot-' + s.key).value.trim()));
  setStatus('已复制，记得点「保存」', 'ok');
};

// ---------- 与页面通信 ----------
function sendToContent(msg) {
  return new Promise(async (resolve) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) { resolve({ ok: false, error: '找不到当前标签页' }); return; }
    chrome.tabs.sendMessage(tab.id, msg, (resp) => {
      if (chrome.runtime.lastError) {
        const url = tab.url || tab.pendingUrl || '';
        resolve({
          ok: false,
          error: url.includes('cloud.fadada.com') || !url
            ? '页面脚本未就绪：请在签署页按 F5 刷新后重试'
            : '请先切换到法大大签署页再操作',
        });
        return;
      }
      resolve(resp || { ok: false, error: '页面无响应' });
    });
  });
}

// ---------- 模板区 ----------
async function refreshTplStatus() {
  const el = $('tplStatus');
  const resp = await sendToContent({ cmd: 'ping' });
  if (!resp.ok) {
    el.className = 'tpl-status warn';
    el.innerHTML = '页面未连接（<b>请打开签署页</b>）';
    return;
  }
  if (!resp.inputs) {
    el.className = 'tpl-status warn';
    el.innerHTML = '页面上没有待处理控件';
    return;
  }
  if (resp.matched) {
    el.className = 'tpl-status';
    el.innerHTML = '已识别：<b>' + escapeHtml(resp.matched) + '</b>（' + resp.inputs + ' 个控件）';
  } else {
    el.className = 'tpl-status warn';
    el.innerHTML = '未识别的模板（' + resp.inputs + ' 个控件）——<b>点下方「学习此模板」</b>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let learning = null; // {fingerprint, controls}

$('learnBtn').onclick = async () => {
  const resp = await sendToContent({ cmd: 'read' });
  if (!resp.ok) { setStatus(resp.error, 'err'); return; }
  const page = resp.page;
  learning = page;
  const rows = $('learnRows');
  rows.innerHTML = '';
  const fieldOptions = allFields(); // 固定 + 自定义字段
  page.controls.forEach(c => {
    const row = document.createElement('div');
    row.className = 'row';
    const nm = document.createElement('span');
    nm.className = 'ctrl-name';
    nm.textContent = '#' + (c.i + 1) + ' ' + c.name;
    const val = document.createElement('span');
    val.className = 'ctrl-val';
    val.title = c.value;
    val.textContent = c.value || '（空）';
    const sel = document.createElement('select');
    sel.dataset.idx = c.i;
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '— 忽略 —';
    sel.appendChild(optNone);
    for (const f of fieldOptions) {
      const o = document.createElement('option');
      o.value = f.key;
      o.textContent = f.label;
      if (c.guess === f.key) o.selected = true;
      sel.appendChild(o);
    }
    row.append(nm, val, sel);
    rows.appendChild(row);
  });
  $('tplName').value = page.matched || ('模板 ' + new Date().toLocaleDateString('zh-CN'));
  $('learnPanel').style.display = 'block';
  setStatus('为每个控件选择对应字段后保存（字段不够可先添加自定义字段）', 'ok');
};

$('cancelTpl').onclick = () => {
  $('learnPanel').style.display = 'none';
  learning = null;
};

$('saveTpl').onclick = () => {
  if (!learning) return;
  const keys = [];
  document.querySelectorAll('#learnRows select').forEach(sel => {
    keys[Number(sel.dataset.idx)] = sel.value || null;
  });
  state.templates[learning.fingerprint] = {
    name: $('tplName').value.trim() || '未命名模板',
    keys,
  };
  saveState(() => {
    $('learnPanel').style.display = 'none';
    learning = null;
    renderTplList();
    refreshTplStatus();
    setStatus('模板已保存，以后该模板自动套用 ✓', 'ok');
  });
};

function renderTplList() {
  const wrap = $('tplList');
  wrap.innerHTML = '';
  const learned = Object.values(state.templates || {});
  if (!learned.length) return;
  const title = document.createElement('div');
  title.style.cssText = 'color:#909399;font-size:11px;margin-top:4px';
  title.textContent = '已学习模板：';
  wrap.appendChild(title);
  for (const t of learned) {
    const item = document.createElement('div');
    item.className = 'item';
    const nm = document.createElement('span');
    nm.textContent = t.name + '（' + t.keys.filter(Boolean).length + ' 项）';
    const del = document.createElement('button');
    del.className = 'mini-btn danger';
    del.textContent = '删除';
    del.onclick = () => {
      delete state.templates[t.fingerprint];
      saveState(() => { renderTplList(); refreshTplStatus(); setStatus('模板已删除', 'ok'); });
    };
    item.append(nm, del);
    wrap.appendChild(item);
  }
}

// ---------- 主按钮 ----------
$('save').onclick = () => {
  collectFields();
  saveState(() => setStatus('已保存 ✓', 'ok'));
};

$('fillNow').onclick = async () => {
  collectFields();
  saveState();
  const resp = await sendToContent({ cmd: 'fill' });
  if (!resp.ok) {
    if (resp.reason === 'no-template') {
      setStatus('当前合同模板未识别，请先「学习此模板」', 'err');
    } else {
      setStatus(resp.error || '填充失败', 'err');
    }
    return;
  }
  setStatus('按模板「' + resp.template + '」填充 ' + resp.filled + '/' + resp.total + ' 项 ✓', 'ok');
};

$('readPage').onclick = async () => {
  const resp = await sendToContent({ cmd: 'read' });
  if (!resp.ok) { setStatus(resp.error, 'err'); return; }
  const page = resp.page;
  if (!page.keys) { setStatus('当前模板未识别，无法映射到资料字段', 'err'); return; }
  let n = 0;
  page.controls.forEach(c => {
    const key = page.keys[c.i];
    if (key && c.value) {
      const fixed = $('slot-' + key);
      const custom = $('cfield-val-' + key);
      if (fixed) fixed.value = c.value;
      else if (custom) custom.value = c.value;
      else return;
      n++;
    }
  });
  FIXED_SLOTS.forEach(s => $('slot-' + s.key).classList.toggle('filled', !!$('slot-' + s.key).value.trim()));
  setStatus('已读取 ' + n + ' 项到表单，记得点「保存」', 'ok');
};

$('autoFill').addEventListener('change', () => { collectFields(); saveState(); });
$('showFab').addEventListener('change', () => { collectFields(); saveState(); });

// ---------- 初始化 ----------
buildRows();
chrome.storage.local.get(null, (raw) => {
  state = fddNormalizeState(raw);
  renderProfiles();
  renderFields();
  renderCustomFields();
  $('autoFill').checked = state.autoFill;
  $('showFab').checked = state.showFab;
  renderTplList();
  refreshTplStatus();
});
