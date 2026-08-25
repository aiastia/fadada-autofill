// 蛙蛙平台作者·签约一键填充 — content script
// 内置蛙蛙平台通过法大大发起的《个人作品著作权转让协议》模板；
// 其他合同模板可通过弹窗"学习"扩展（支持自定义字段，控件数量不限）。
// 页面是 Vue2 + Element UI：直接改 input.value 不会进模型，
// 必须用原生 value setter 赋值再派发 input 事件（已实测写入 Vue widgets 模型）。

(() => {
  const PATH_PREFIX = '/application/task/sign/';

  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  let settings = fddNormalizeState(null);

  function loadSettings(cb) {
    if (!hasChrome) return cb && cb();
    chrome.storage.local.get(null, (raw) => {
      settings = fddNormalizeState(raw);
      if (cb) cb();
    });
  }
  if (hasChrome && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      loadSettings(() => { ensureFab(settings.showFab); });
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

  // 模板指纹 = 待处理控件名称序列（同一合同模板稳定，不同模板几乎不撞）
  function fingerprint(inputs) {
    return (inputs || getFillInputs()).map(x => x.label).join(',');
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

  function activeValues() {
    const p = settings.profiles[settings.activeProfileId] || Object.values(settings.profiles)[0];
    return p ? p.values : {};
  }

  /**
   * 按语义字段值填充：先识别模板，再把 key 映射到控件顺序。
   * @param {Object} values  语义 key -> 值
   * @param {Object} opts    { skipFilled } 自动填充时跳过已有内容的框
   */
  function fillWith(values, opts = {}) {
    const inputs = getFillInputs();
    if (!inputs.length) return { ok: false, reason: 'no-inputs' };
    const fp = fingerprint(inputs);
    const tpl = fddFindTemplate(settings, fp);
    if (!tpl) return { ok: false, reason: 'no-template', fingerprint: fp, count: inputs.length };
    const results = inputs.map((x, i) => {
      const key = tpl.keys[i];
      if (!key) return { i, action: 'skipped-no-key' };
      const v = (values[key] || '').trim();
      if (!v) return { i, key, action: 'skipped-empty-value' };
      if (opts.skipFilled && x.input.value.trim() !== '') return { i, key, action: 'skipped-filled' };
      setNativeValue(x.input, v);
      return { i, key, action: 'filled' };
    });
    return {
      ok: true,
      template: tpl.name,
      filled: results.filter(r => r.action === 'filled').length,
      total: inputs.length,
      results,
    };
  }

  // 用当前激活资料填充
  function fillByTemplate(opts) {
    return fillWith(activeValues(), opts);
  }

  // 读取页面：控件清单 + 指纹 + 模板匹配情况 + 每个控件的字段猜测（学习模式用）
  function readPage() {
    const inputs = getFillInputs();
    const fp = fingerprint(inputs);
    const tpl = fddFindTemplate(settings, fp);
    const pv = activeValues();
    return {
      fingerprint: fp,
      matched: tpl ? tpl.name : null,
      keys: tpl ? tpl.keys : null,
      controls: inputs.map((x, i) => ({
        i, name: x.label, value: x.input.value, guess: fddGuessKey(x.input.value, pv),
      })),
    };
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
        const r = fillByTemplate();
        if (!r.ok && r.reason === 'no-template') {
          fab.textContent = '模板未识别·点图标学习';
          setTimeout(() => { fab.textContent = '⚡ 填充'; }, 2500);
          return;
        }
        fab.textContent = `已填 ${r.filled}/${r.total} 项`;
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
      if (settings.autoFill) fillByTemplate({ skipFilled: true });
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
          // 每次现读 storage，避免与 popup 保存竞态
          loadSettings(() => sendResponse(fillByTemplate()));
          return true; // 异步响应
        } else if (msg.cmd === 'read') {
          sendResponse({ ok: true, page: readPage() });
        } else if (msg.cmd === 'ping') {
          const inputs = getFillInputs();
          sendResponse({
            ok: true,
            inputs: inputs.length,
            matched: inputs.length ? (fddFindTemplate(settings, fingerprint(inputs)) || {}).name || null : null,
          });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
  }

  // 供控制台/测试注入使用（CDP eval 场景下 chrome.* 不存在也能跑）
  window.__FDD_FILL__ = { fillWith, fillByTemplate, readPage, getFillInputs, fingerprint };
})();
