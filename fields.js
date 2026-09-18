// 共享常量与纯函数：字段注册表、内置模板、storage 规范化
// 同时被 content script（isolated world）与 popup 加载，请保持无副作用。
// 用 var 声明：便于调试注入时重复执行不报错。

var FDD_FIELDS = [
  { key: 'address',  label: '地址' },
  { key: 'email',    label: '邮箱' },
  { key: 'fillDate', label: '填写日期2' },
];

// 内置模板：蛙蛙平台·个人作品著作权转让协议（2026-09 改版，签署页只剩 3 个控件）
var FDD_BUILTIN_TEMPLATES = [
  {
    id: 'builtin-wawa-transfer-v2',
    name: '蛙蛙平台·个人作品著作权转让协议',
    fingerprint: '地址,邮箱,填写日期2',
    keys: ['address', 'email', 'fillDate'],
  },
];

// 填写日期默认值：当天，格式与签署页日期控件占位符 YYYY年MM月DD日 一致
function fddTodayCn() {
  var d = new Date();
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '年' + p(d.getMonth() + 1) + '月' + p(d.getDate()) + '日';
}

var FDD_DEFAULT_STATE = {
  profiles: null,          // {id: {id, name, values}}；null 时在规范化时生成默认资料
  activeProfileId: null,
  templates: {},           // 学习到的模板：fingerprint -> {name, keys}
  customFields: [],        // 自定义字段：[{key, label}]
  autoFill: true,
  showFab: true,
};

// 旧版单资料 schema（{values, autoFill, showFab}）迁移到多资料
function fddNormalizeState(raw) {
  raw = raw || {};
  const s = {
    profiles: raw.profiles && Object.keys(raw.profiles).length ? raw.profiles : null,
    activeProfileId: raw.activeProfileId,
    templates: raw.templates || {},
    customFields: Array.isArray(raw.customFields) ? raw.customFields : [],
    autoFill: raw.autoFill !== false,
    showFab: raw.showFab !== false,
  };
  if (!s.profiles) {
    s.profiles = { default: { id: 'default', name: '默认资料', values: raw.values || {} } };
  }
  if (!s.activeProfileId || !s.profiles[s.activeProfileId]) {
    s.activeProfileId = Object.keys(s.profiles)[0];
  }
  return s;
}

// 学习到的模板优先（可覆盖内置），其次内置模板
function fddFindTemplate(state, fingerprint) {
  if (state.templates && state.templates[fingerprint]) return state.templates[fingerprint];
  for (const t of FDD_BUILTIN_TEMPLATES) {
    if (t.fingerprint === fingerprint) return t;
  }
  return null;
}

// 控件值 → 语义字段猜测：先与当前资料精确匹配，再用形状规则兜底
function fddGuessKey(value, profileValues) {
  const v = (value || '').trim();
  if (!v) return null;
  for (const k of Object.keys(profileValues || {})) {
    const pv = profileValues[k];
    if (pv && String(pv).trim() === v) return k;
  }
  if (/^\d{17}[\dXx]$/.test(v)) return 'idNo';
  if (/^1\d{10}$/.test(v)) return 'phone';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'email';
  if (/^\d{16,19}$/.test(v)) return 'bankAccount';
  if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(v)) return 'fillDate';
  return null;
}
