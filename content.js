// 蛙蛙平台作者·签约一键填充 — content script
// 仅适用于蛙蛙平台（124678.xyz）通过法大大发起的《个人作品著作权转让协议》签署页。
// 页面是 Vue2 + Element UI：直接改 input.value 不会进模型，
// 必须用原生 value setter 赋值再派发 input 事件（已实测写入 Vue widgets 模型）。

(() => {
  const PATH_PREFIX = '/application/task/sign/';

  // 13 个待填控件按「待处理控件」面板 DOM 顺序排列（蛙蛙平台模板）
  // 单行文本1×6(第1页个人信息) + 单行文本3×4(第5页收款账户) + 单行文本4/5/6(第10页授权书)
  const SLOTS = [
    { key: 'name',        label: '真实姓名' },
    { key: 'penName',     label: '笔名' },
    { key: 'idNo',        label: '身份证号' },
    { key: 'address',     label: '联系地址' },
    { key: 'phone',       label: '手机号' },
    { key: 'email',       label: '邮箱' },
    { key: 'acctName',    label: '开户名称' },
    { key: 'bank',        label: '开户行' },
    { key: 'bankBranch',  label: '开户支行' },
    { key: 'bankAccount', label: '银行账号' },
    { key: 'name2',       label: '姓名（授权书）' },
    { key: 'idNo2',       label: '身份证号（授权书）' },
    { key: 'penName2',    label: '笔名（授权书）' },
  ];

  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  const settings = { values: {}, autoFill: true, showFab: true };
  function loadSettings(cb) {
    if (!hasChrome) return cb && cb();
    chrome.storage.local.get({ values: {}, autoFill: true, showFab: true }, (s) => {
      Object.assign(settings, s);
      if (cb) cb();
    });
  }
  if (hasChrome && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.values) settings.values = changes.values.newValue || {};
      if (changes.autoFill) settings.autoFill = changes.autoFill.newValue;
      if (changes.showFab) { settings.showFab = changes.showFab.newValue; ensureFab(settings.showFab); }
    });
  }

  const onSignPage = () => location.pathname.startsWith(PATH_PREFIX);

  // 待处理控件面板里的表单项（每个都带 widget-id 属性）
  function getFillInputs() {
    const items = [...document.querySelectorAll('.fa-widget-fill .el-form-item[widget-id]')];
    return items.map((item) => {
      const labelEl = item.querySelector('.fa-widget-fill-item__label');
      return {
        widgetId: item.getAttribute('widget-id'),
        label: labelEl ? labelEl.textContent.trim() : '',
        input: item.querySelector('input.el-input__inner, textarea'),
      };
    }).filter(x => x.input);
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur'));
  }

  /**
   * @param {Object} values  { name: '...', penName: '...', ... }
   * @param {Object} opts    { skipFilled }  自动填充时跳过已有内容的框
   * @returns {Array<{slot, label, action}>} action: filled | skipped-empty-value | skipped-filled | no-mapping
   */
  function fillAll(values, opts = {}) {
    const inputs = getFillInputs();
    const results = [];
    SLOTS.forEach((slot, i) => {
      const value = (values[slot.key] || '').trim();
      const target = inputs[i];
      if (!value) {
        results.push({ slot: slot.key, label: slot.label, action: 'skipped-empty-value' });
        return;
      }
      if (!target) {
        results.push({ slot: slot.key, label: slot.label, action: 'no-mapping' });
        return;
      }
      if (opts.skipFilled && target.input.value.trim() !== '') {
        results.push({ slot: slot.key, label: slot.label, action: 'skipped-filled' });
        return;
      }
      setNativeValue(target.input, value);
      results.push({ slot: slot.key, label: slot.label, action: 'filled' });
    });
    return results;
  }

  function readCurrent() {
    const inputs = getFillInputs();
    const out = {};
    SLOTS.forEach((slot, i) => {
      if (inputs[i]) out[slot.key] = inputs[i].input.value;
    });
    return out;
  }

  // ---- 悬浮按钮 ----
  let fab = null;
  function ensureFab(show) {
    if (!show) {
      if (fab) { fab.remove(); fab = null; }
      return;
    }
    if (fab || !onSignPage() || !document.body) return;
    fab = document.createElement('div');
    fab.id = 'fdd-autofill-fab';
    fab.textContent = '⚡ 填充';
    Object.assign(fab.style, {
      position: 'fixed', right: '16px', bottom: '90px', zIndex: 99999,
      padding: '8px 14px', borderRadius: '18px', cursor: 'pointer',
      background: '#409eff', color: '#fff', fontSize: '13px',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)', userSelect: 'none',
    });
    fab.onclick = () => {
      loadSettings(() => {
        const results = fillAll(settings.values);
        const n = results.filter(r => r.action === 'filled').length;
        fab.textContent = `已填 ${n} 项`;
        setTimeout(() => { fab.textContent = '⚡ 填充'; }, 1500);
      });
    };
    document.body.appendChild(fab);
  }

  // ---- 自动填充（表单出现后触发一次）----
  let autoFilled = false;
  function tryAutoFill() {
    if (autoFilled || !onSignPage() || !getFillInputs().length) return;
    autoFilled = true;
    loadSettings(() => {
      ensureFab(settings.showFab);
      if (settings.autoFill) fillAll(settings.values, { skipFilled: true });
    });
  }

  const poller = setInterval(() => {
    if (autoFilled) { clearInterval(poller); return; }
    tryAutoFill();
  }, 1200);
  setTimeout(() => clearInterval(poller), 120000);

  const observer = new MutationObserver(() => {
    if (!onSignPage()) return;
    tryAutoFill();
    if (fab === null && settings.showFab && autoFilled) ensureFab(true);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  loadSettings();

  // ---- popup 消息 ----
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!onSignPage()) { sendResponse({ ok: false, error: '当前页面不是法大大签署页' }); return; }
      try {
        if (msg.cmd === 'fill') {
          sendResponse({ ok: true, results: fillAll(msg.values || {}) });
        } else if (msg.cmd === 'read') {
          sendResponse({ ok: true, values: readCurrent() });
        } else if (msg.cmd === 'ping') {
          sendResponse({ ok: true, inputs: getFillInputs().length });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
  }

  // 供控制台/测试注入使用（CDP eval 场景下 chrome.* 不存在也能跑）
  window.__FDD_FILL__ = { fillAll, readCurrent, getFillInputs, SLOTS };
})();
