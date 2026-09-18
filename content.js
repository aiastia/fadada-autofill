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
        isDate: !!item.querySelector('.el-date-editor'),
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
    // Element 的 currentValue 经异步 watcher 同步：同步派发 blur 会拿旧值触发"必填"误报，
    // 挪到微任务里等 Vue 队列冲刷完再失焦
    Promise.resolve().then(() => el.dispatchEvent(new Event('blur')));
  }

  // Element 日期控件：模拟真人路径提交 —— focus 打开日期面板 → 点目标日的格子。
  // 真实签署页实测：直接给 input 派发 input/change/Enter 只会把文字浮在框上，
  // 表单模型里仍是空值；只有面板选格才会真正提交。
  async function pickDate(input, dateText) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const findPanel = () => [...document.querySelectorAll('.el-picker-panel')].find(
      (p) => p.offsetWidth > 0 && getComputedStyle(p).display !== 'none' && getComputedStyle(p).visibility !== 'hidden'
    ) || null;
    const synthClick = (el) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.click();
    };

    input.focus();
    // 页面刚加载、组件未就绪时 focus 开不了面板——多试几轮（每轮 ~1.2s 等面板 + 重聚焦），
    // 全失败才回退手输（手输在蛙蛙页只浮文字不提交，因此尽量等到面板）
    let panel = null;
    for (let attempt = 0; attempt < 4 && !panel; attempt++) {
      for (let i = 0; i < 24 && !panel; i++) { panel = findPanel(); if (!panel) await sleep(50); }
      if (!panel) { input.blur(); await sleep(900); input.focus(); }
    }
    if (!panel) return typeIntoDate(input, dateText) ? 'typed-no-panel' : 'no-panel';

    let m = dateText.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/) || dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return 'bad-format';
    const y = +m[1], mo = +m[2], d = +m[3];
    const now = new Date();
    const isToday = y === now.getFullYear() && mo === now.getMonth() + 1 && d === now.getDate();

    // 翻月：面板头是「2026年 9月」两个 label，算差几个月点箭头
    const labels = [...panel.querySelectorAll('.el-date-picker__header-label')].map((e) => parseInt(e.textContent, 10) || 0);
    if (labels.length >= 2 && labels[0]) {
      const diff = (y * 12 + mo - 1) - (labels[0] * 12 + labels[1] - 1);
      const btnCls = diff < 0 ? '.el-date-picker__prev-btn.el-icon-arrow-left' : '.el-date-picker__next-btn.el-icon-arrow-right';
      for (let i = 0; i < Math.abs(diff) && i < 36; i++) {
        const btn = panel.querySelector(btnCls);
        if (!btn) break;
        synthClick(btn);
        await sleep(80);
      }
    }

    let cell = isToday ? panel.querySelector('td.today:not(.disabled)') : null;
    if (!cell) {
      cell = [...panel.querySelectorAll('td')].find((td) =>
        !td.classList.contains('disabled') && !td.classList.contains('prev-month') && !td.classList.contains('next-month')
        && td.textContent.trim() === String(d));
    }
    if (!cell) { input.blur(); return 'no-cell'; }
    synthClick(cell.querySelector('span,div') || cell);
    await sleep(150);
    input.blur();
    return input.value.trim() ? 'filled' : 'unconfirmed';
  }

  // 面板打不开时的兜底：手输 + Enter（标准 el-date-picker 上有效）
  function typeIntoDate(el, value) {
    el.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const enter = () => {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
      Object.defineProperty(ev, 'keyCode', { get: () => 13 });
      Object.defineProperty(ev, 'which', { get: () => 13 });
      return ev;
    };
    el.dispatchEvent(enter());
    el.blur();
    return el.value.trim() !== '';
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
  async function fillWith(values, opts = {}) {
    const inputs = getFillInputs();
    if (!inputs.length) return { ok: false, reason: 'no-inputs' };
    const fp = fingerprint(inputs);
    const tpl = fddFindTemplate(settings, fp);
    if (!tpl) return { ok: false, reason: 'no-template', fingerprint: fp, count: inputs.length };
    const eff = Object.assign({}, values);
    if (!(eff.fillDate || '').trim()) eff.fillDate = fddTodayCn(); // 填写日期默认当天
    const results = [];
    for (let i = 0; i < inputs.length; i++) {
      const x = inputs[i];
      const key = tpl.keys[i];
      if (!key) { results.push({ i, action: 'skipped-no-key' }); continue; }
      const v = (eff[key] || '').trim();
      if (!v) { results.push({ i, key, action: 'skipped-empty-value' }); continue; }
      // 日期例外：框里已有的文字可能只是"浮"在 DOM 上未提交（自动填充兜底/页面预显），
      // 与目标同值时重新选格幂等无害；不同值视为用户自己填的，尊重跳过
      const cur = x.input.value.trim();
      if (opts.skipFilled && cur !== '' && !(x.isDate && cur === v)) { results.push({ i, key, action: 'skipped-filled' }); continue; }
      if (x.isDate) {
        const st = await pickDate(x.input, v);
        results.push({ i, key, action: st });
      } else {
        setNativeValue(x.input, v);
        results.push({ i, key, action: 'filled' });
      }
    }
    return {
      ok: true,
      template: tpl.name,
      filled: results.filter((r) => r.action === 'filled' || r.action === 'typed-no-panel').length,
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
      loadSettings(async () => {
        const r = await fillByTemplate();
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
      if (settings.autoFill) fillByTemplate({ skipFilled: true }).catch(() => {});
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
          loadSettings(async () => sendResponse(await fillByTemplate()));
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
