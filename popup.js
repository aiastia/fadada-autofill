// popup：编辑 13 项资料，保存到 chrome.storage.local，向 content script 发填充指令

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

const ALL_SLOTS = GROUPS.flatMap(g => g.slots);
const $ = (id) => document.getElementById(id);

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
      input.addEventListener('input', () => input.classList.toggle('filled', !!input.value.trim()));
      row.append(label, input);
      wrap.appendChild(row);
    }
  }
}

function getValues() {
  const values = {};
  for (const s of ALL_SLOTS) values[s.key] = $('slot-' + s.key).value.trim();
  return values;
}

function setValues(values) {
  for (const s of ALL_SLOTS) {
    const el = $('slot-' + s.key);
    el.value = values[s.key] || '';
    el.classList.toggle('filled', !!el.value.trim());
  }
}

function setStatus(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = cls || '';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendToContent(msg) {
  return new Promise(async (resolve) => {
    const tab = await getActiveTab();
    if (!tab || tab.id === undefined) {
      resolve({ ok: false, error: '找不到当前标签页' });
      return;
    }
    // 不依赖 tab.url（无 tabs 权限时为 undefined）：直接向页面发消息，以响应结果判断
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

// ---- 初始化 ----
buildRows();
chrome.storage.local.get({ values: {}, autoFill: true, showFab: true }, ({ values, autoFill, showFab }) => {
  setValues(values);
  $('autoFill').checked = autoFill;
  $('showFab').checked = showFab;
});

// 授权书字段 = 个人信息
$('copyToAuth').onclick = () => {
  $('slot-name2').value = $('slot-name').value;
  $('slot-idNo2').value = $('slot-idNo').value;
  $('slot-penName2').value = $('slot-penName').value;
  ALL_SLOTS.forEach(s => $('slot-' + s.key).classList.toggle('filled', !!$('slot-' + s.key).value.trim()));
  setStatus('已复制，记得点「保存」', 'ok');
};

$('save').onclick = () => {
  chrome.storage.local.set({ values: getValues(), autoFill: $('autoFill').checked, showFab: $('showFab').checked }, () => {
    setStatus('已保存 ✓', 'ok');
  });
};

$('fillNow').onclick = async () => {
  const values = getValues();
  chrome.storage.local.set({ values, autoFill: $('autoFill').checked, showFab: $('showFab').checked });
  const resp = await sendToContent({ cmd: 'fill', values });
  if (!resp.ok) { setStatus(resp.error, 'err'); return; }
  const n = resp.results.filter(r => r.action === 'filled').length;
  const missing = resp.results.filter(r => r.action === 'no-mapping').length;
  setStatus(`已填充 ${n}/13 项${missing ? `（${missing} 项未匹配到控件）` : ''} ✓`, 'ok');
};

$('readPage').onclick = async () => {
  const resp = await sendToContent({ cmd: 'read' });
  if (!resp.ok) { setStatus(resp.error, 'err'); return; }
  setValues(resp.values || {});
  setStatus('已读取页面当前值，记得点「保存」', 'ok');
};

$('autoFill').addEventListener('change', () => {
  chrome.storage.local.set({ autoFill: $('autoFill').checked, showFab: $('showFab').checked, values: getValues() });
});
$('showFab').addEventListener('change', () => {
  chrome.storage.local.set({ autoFill: $('autoFill').checked, showFab: $('showFab').checked, values: getValues() });
});
