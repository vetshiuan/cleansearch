#!/usr/bin/env node
/* 净搜 CleanSearch 回归测试（Node ≥ 16，无外部依赖）
 *
 * 覆盖 Issue 合集建议的回归用例：
 *  - 护航分类互斥性：同一结果不得同时具备 official / danger 两态
 *  - 标题含品牌词 + 域名命中下载站 → 必须为 danger
 *  - 弱意图词：应触发 / 不应触发正反用例集
 *  - 开关联动：关闭总开关后样式立即移除（I3）
 *  - 附带：域名边界 / 品牌词 token 边界 / 必应 u 参数解码 / 跳转中转页解析（B2）
 *
 * 运行：node tests/regression.test.mjs
 * 原理：在 vm 沙箱中桩替换 GM_* / document / location 等全局后加载 userscript，
 *       通过 window.__CleanSearch 暴露的 probe API 断言纯逻辑行为。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, '..', 'cleansearch.user.js'), 'utf8');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.error('  ✘ ' + name); }
}
function section(title) { console.log('\n== ' + title + ' =='); }

function makeEnv({ hostname = 'www.bing.com', pathname = '/search', search = '' } = {}) {
  const store = new Map();
  const styleRegistry = new Map();   // 模拟带 id 的已注入节点（#cs-adblock-style）
  const mkEl = () => ({
    id: '', className: '', dataset: {}, textContent: '', style: {},
    children: [],
    appendChild() {},
    insertBefore() {},
    addEventListener() {},
    remove() { if (this.id) styleRegistry.delete(this.id); },
  });
  const sandbox = {
    console: { log() {}, warn() {}, error: console.error },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    TextDecoder,
    Uint8Array,
    setTimeout: () => 0,
    clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() {} },
    Blob: class {},
    GM_getValue: (k) => store.get(k),
    GM_setValue: (k, v) => { store.set(k, v); },
    GM_deleteValue: (k) => { store.delete(k); },
    GM_registerMenuCommand: () => {},
    GM_xmlhttpRequest: () => {},
    location: { hostname, pathname, search, href: 'https://' + hostname + pathname + search },
    document: {
      readyState: 'complete',
      documentElement: { appendChild(el) { if (el && el.id) styleRegistry.set(el.id, el); } },
      head: null,
      body: { appendChild() {} },
      createElement: mkEl,
      getElementById: (id) => styleRegistry.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { sandbox, api: sandbox.window.__CleanSearch, styleRegistry };
}

/** 构造一条"搜索结果"假节点 */
function fakeItem({ href, title = '', text = '', cite = '', closestFn = null }) {
  const link = href ? { href } : null;
  const titleEl = { textContent: title, firstChild: null, querySelector: () => null, insertBefore() {} };
  return {
    dataset: {}, style: {},
    textContent: text || title,
    closest: closestFn || (() => null),
    querySelector(sel) {
      if (sel === 'h2 a[href], h3 a[href], a[href]') return link;
      if (sel === 'h2, h3') return title ? titleEl : null;
      if (sel.indexOf('c-showurl') >= 0 || sel === 'cite' || sel === '.c-color-gray') {
        return cite ? { textContent: cite } : null;
      }
      return null;
    },
    querySelectorAll: () => [],
  };
}

const enc = (s) => Buffer.from(s, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ===================================================================== *
 * A. 弱意图词（Issue 2）：应触发 / 不应触发
 * ===================================================================== */
section('A. 弱意图词正反用例（Issue 2）');
{
  const { sandbox, api } = makeEnv();
  const intent = (q) => {
    sandbox.location.search = '?q=' + encodeURIComponent(q);
    return api.probe.hasDownloadIntent();
  };
  check('强意图：微信下载 → 触发', intent('微信下载') === true);
  check('强意图：chrome 官方下载 → 触发', intent('chrome 官方下载') === true);
  check('弱意图：微信 官方 → 触发（前缀=官网库品牌）', intent('微信 官方') === true);
  check('弱意图：potplayer 电脑版 → 触发（前缀含 ≥3 位字母 token）', intent('potplayer 电脑版') === true);
  check('弱意图：wps 官方 → 触发（前缀=官网库品牌）', intent('wps 官方') === true);
  check('弱意图：QQ 客户端 → 触发（品牌位于串首，验证 B1 边界）', intent('QQ 客户端') === true);
  check('弱意图：微信官方版 → 触发', intent('微信官方版') === true);

  check('仅弱词本身：官方 → 不触发', intent('官方') === false);
  check('仅弱词本身：电脑版 → 不触发', intent('电脑版') === false);
  check('疑问句：这是官方吗 → 不触发', intent('这是官方吗') === false);
  check('非软件实体：信用卡官方 → 不触发（Issue 2 原始案例）', intent('信用卡官方') === false);
  check('非软件实体：招行信用卡官方 → 不触发', intent('招行信用卡官方') === false);
  check('口语前缀：pc 端 电脑版 → 不触发（token 不足 3 位）', intent('pc 端 电脑版') === false);
  check('资讯排除：苹果官方回应发布会 → 不触发', intent('苹果官方回应发布会') === false);
  check('无意图词：微信 → 不触发', intent('微信') === false);
}

/* ===================================================================== *
 * B. 护航分类（Issue 1）：三态互斥 + 域名优先
 * ===================================================================== */
section('B. 护航分类三态互斥（Issue 1）');
{
  const { sandbox, api } = makeEnv({ search: '?q=' + encodeURIComponent('微信下载') });
  const run = (items) => {
    sandbox.document.querySelectorAll = () => items;
    items.forEach(i => { delete i.dataset.csGuard; i.style.opacity = ''; });
    api.runGuardian();
    return items.map(i => i.dataset.csGuard || 'unknown');
  };

  // 1. 官网域名 → official
  const official = fakeItem({
    href: 'https://weixin.qq.com/cgi-bin/readtemplate?t=winDownload',
    title: '微信 - 官方网站',
    text: '微信 Windows 版官网下载页面 weixin.qq.com',
  });
  check('官网域名 → official', run([official])[0] === 'official');

  // 2. Issue 回归用例：标题含品牌词 + 域名命中下载站 → danger
  const fakeDl = fakeItem({
    href: 'https://www.pc6.com/soft/3886.html',
    title: '微信官方下载_PC6下载站',
    text: '微信官方下载，pc6.com 提供安全下载',
  });
  check('标题品牌词+下载站域名 → danger（Issue 回归用例）', run([fakeDl])[0] === 'danger');

  // 3. 品牌词 + 非官网域名（未收录的小站）→ danger
  const fakeSmall = fakeItem({
    href: 'https://www.xzy12345.com/weixin-setup.exe',
    title: '微信官方下载 - 小小下载网',
    text: '微信官方下载 假站聚合',
  });
  check('标题品牌词+陌生域名 → danger', run([fakeSmall])[0] === 'danger');

  // 4. 无品牌词的普通结果 → unknown
  const normal = fakeItem({
    href: 'https://help.example.com/question/999',
    title: '如何安全地下载软件？',
    text: '如何安全地下载软件的一些经验分享',
  });
  check('无品牌普通结果 → unknown', run([normal])[0] === 'unknown');

  // 5. Issue 1 核心回归：仅文本含品牌名（无任何域名）→ 不得判 official
  const textOnly = fakeItem({
    href: null, cite: '',
    title: '微信 频道页介绍',
    text: '微信 频道页介绍 微信 微信',
  });
  const kind5 = run([textOnly])[0];
  check('仅文本品牌名（无域名）→ 不判 official（Issue 1 核心用例）', kind5 !== 'official');

  // 6. 混合场景互斥性：同一批结果中单条结果只能有一个状态
  const batch = [
    fakeItem({ href: 'https://weixin.qq.com/dl', title: '微信官方站', text: '微信官方下载 weixin.qq.com pc6.com 不该出现' }),
    fakeItem({ href: 'https://www.pc6.com/soft/1', title: '微信下载pc6', text: 'pc6 微信下载' }),
    fakeItem({ href: 'https://help.example.com/q', title: '如何下载软件', text: '经验分享' }),
  ];
  const kinds = run(batch);
  check('混合批次三态返回均为单值', kinds.every(k => ['official', 'danger', 'unknown'].includes(k)));
  check('混合批次：官网为 official', kinds[0] === 'official');
  check('混合批次：下载站为 danger', kinds[1] === 'danger');
  check('混合批次：普通结果为 unknown', kinds[2] === 'unknown');
  check('official 结果未叠加 danger（互斥）', !(batch[0].dataset.csGuard === 'official' && batch[0].style.opacity === '0.6'));
}

/* ===================================================================== *
 * C. 谷歌嵌套 data-hveid 去重（B3）
 * ===================================================================== */
section('C. 谷歌嵌套结果去重（B3）');
{
  const { sandbox, api } = makeEnv({ hostname: 'www.google.com', search: '?q=' + encodeURIComponent('微信下载') });
  const top = fakeItem({ href: 'https://weixin.qq.com/dl', title: '微信官网', text: '微信官网' });
  const nested = fakeItem({ href: 'https://weixin.qq.com/dl', title: '微信官网子链接', text: '子区块', closestFn: () => top });
  sandbox.document.querySelectorAll = () => [top, nested];
  api.runGuardian();
  check('顶层结果已分类', top.dataset.csGuard === 'official');
  check('嵌套节点不重复分类', nested.dataset.csGuard === undefined);
}

/* ===================================================================== *
 * D. 官方判定只认域名（Issue 1，siteOfficialName 语义）
 * ===================================================================== */
section('D. 官方判定只认域名（Issue 1）');
{
  const { api } = makeEnv();
  check('域名命中官网库 → 返回品牌名', api.probe.siteOfficialName('https://weixin.qq.com/xx 微信') === '微信');
  check('仅文本品牌名 → 返回 null（不再判官方）', api.probe.siteOfficialName('随便一句话提到微信也返回空') === null);
  check('品牌名命中仅用于 danger 甄别', api.probe.brandNameHit('微信官方下载 小站') === '微信');
  check('brandNameHit 不含品牌 → null', api.probe.brandNameHit('普通内容') === null);
}

/* ===================================================================== *
 * E. nameTokenHit 边界（B1）与 domainHit 边界（Fix6 回归）
 * ===================================================================== */
section('E. token / 域名边界（B1 / Fix6）');
{
  const { api } = makeEnv();
  const nt = api.probe.nameTokenHit;
  check('品牌位于串首（后随空格）→ 命中（B1 修复前串首永不命中）', nt('QQ 电脑版', 'QQ') === true);
  check('品牌位于串尾 → 命中', nt('下载 微信', '微信') === true);
  check('品牌夹在汉字中 → 不命中', nt('我爱豆包子', '豆包') === false);
  check('品牌是更长词的一部分 → 不命中', nt('企业微信', '微信') === false);
  check('整体相等 → 命中', nt('微信', '微信') === true);

  const dh = api.probe.domainHit;
  check('domainHit 子域名命中', dh('https://a.jd.com/x', 'jd.com') === true);
  check('domainHit 边界防误伤（jd.com.cn）', dh('https://www.jd.com.cn/', 'jd.com') === false);
  check('domainHit 前缀伪装防误伤（evil-jd.com）', dh('https://evil-jd.com/', 'jd.com') === false);
  check('domainHit 后缀伪装防误伤（jd.com.evil.com）', dh('https://jd.com.evil.com/', 'jd.com') === false);
}

/* ===================================================================== *
 * F. 开关联动（Issue 3）：样式移除
 * ===================================================================== */
section('F. 关闭开关样式立即移除（Issue 3）');
{
  const { api, styleRegistry } = makeEnv({ hostname: 'www.baidu.com', pathname: '/s', search: '?wd=' + encodeURIComponent('微信下载') });
  check('boot 后 cs-adblock-style 已注入', styleRegistry.has('cs-adblock-style'));
  api.cfg().enabled = false;
  api.probe.refreshAdStyleState();
  check('关闭总开关 → 样式已移除', !styleRegistry.has('cs-adblock-style'));
}
{
  const { api, styleRegistry } = makeEnv({ hostname: 'www.baidu.com', pathname: '/s', search: '?wd=' + encodeURIComponent('微信下载') });
  api.cfg().sites.baidu = false;
  api.probe.refreshAdStyleState();
  check('关闭百度开关 → 样式已移除', !styleRegistry.has('cs-adblock-style'));
}

/* ===================================================================== *
 * G. 链接解析（B2 / Fix3 / Fix5）
 * ===================================================================== */
section('G. 链接解析（B2 / Fix3）');
{
  const { api } = makeEnv();
  check('decodeBingU 正常解码', api.probe.decodeBingU('a1' + enc('https://example.com/x')) === 'https://example.com/x');
  check('decodeBingU 非 http 结果 → 空', api.probe.decodeBingU('a2' + enc('这不是链接')) === '');
  check('decodeBingU 垃圾输入 → 空', api.probe.decodeBingU('###') === '');

  const pr = api.probe.parseRealUrl;
  check('parseRealUrl meta refresh', pr('<meta http-equiv="refresh" content="0;url=https://x.example.com/a">') === 'https://x.example.com/a');
  check('parseRealUrl location.replace', pr('<script>window.location.replace("https://y.example.com/b")</script>') === 'https://y.example.com/b');
  check('parseRealUrl 空输入 → 空', pr('') === '');
  check('parseRealUrl 普通文本 → 空', pr('plain text no link') === '');
}

/* ===================================================================== *
 * H. effectiveHref（Fix5 回归）
 * ===================================================================== */
section('H. effectiveHref（Fix5）');
{
  const { sandbox, api } = makeEnv({ hostname: 'www.google.com' });
  check('谷歌 /url? 解码', api.probe.effectiveHref({ href: 'https://www.google.com/url?q=' + encodeURIComponent('https://example.com/') }) === 'https://example.com/');
  check('谷歌普通直链原样返回', api.probe.effectiveHref({ href: 'https://example.com/direct' }) === 'https://example.com/direct');
  sandbox.location.hostname = 'www.bing.com';
  check('必应普通直链原样返回', api.probe.effectiveHref({ href: 'https://example.com/direct2' }) === 'https://example.com/direct2');
}

/* ===================================================================== *
 * I. 顶部提示条第二轮不消失（P1-1）+ 置顶后横幅保持首位（P1-2）
 * ---------------------------------------------------------------------
 * 0.2.7 的真实行为：①分类阶段跳过已定性项 → officialItem / dangerCount 第二轮归零
 * → ④ 立刻把刚插入的横幅删掉。表现为横幅闪现一下就消失。
 * ================================================================== */
section('I. 提示条状态机（P1-1 / P1-2 / P1-3）');

/** 带双向链表的结果容器，模拟 insertBefore / nextElementSibling */
function makeDomList(initial) {
  const kids = (initial || []).slice();
  const sync = () => kids.forEach((k, i) => {
    k.nextElementSibling = kids[i + 1] || null;
    k.previousElementSibling = kids[i - 1] || null;
  });
  sync();
  return {
    kids,
    get firstChild() { return kids[0] || null; },
    get firstElementChild() { return kids[0] || null; },
    insertBefore(node, ref) {
      const i = ref ? kids.indexOf(ref) : kids.length;
      kids.splice(i < 0 ? kids.length : i, 0, node);
      sync();
    },
    appendChild(node) { kids.push(node); sync(); },
  };
}

function makeGuardEnv(items) {
  const { sandbox, api } = makeEnv({ hostname: 'www.bing.com', search: '?q=' + encodeURIComponent('微信下载') });
  const byId = new Map();
  const created = [];
  const list = makeDomList(items);
  const baseCreate = sandbox.document.createElement;

  sandbox.document.createElement = (tag) => {
    const el = baseCreate(tag);
    created.push(el);
    Object.defineProperty(el, 'id', {
      configurable: true,
      get() { return el._id || ''; },
      set(v) { el._id = v; if (v) byId.set(v, el); },
    });
    el.remove = () => {
      if (el._id) byId.delete(el._id);
      const i = created.indexOf(el);
      if (i >= 0) created.splice(i, 1);
    };
    return el;
  };
  sandbox.document.querySelectorAll = (sel) => {
    if (sel.indexOf('b_algo') >= 0 || sel === '[data-cs-guard]') return items.slice();
    if (sel.indexOf('cs-guard-badge') >= 0) return created.filter(e => e.className === 'cs-guard-badge');
    return [];
  };
  sandbox.document.querySelector = (sel) => {
    if (sel === '#cs-guard-banner') return byId.get('cs-guard-banner') || null;
    if (sel === '#b_results') return list;
    return null;
  };
  sandbox.document.getElementById = (id) => byId.get(id) || null;

  // 让 fakeItem 支持 removeAttribute（清理分类标记时用到）
  items.forEach(it => {
    it.removeAttribute = (a) => {
      if (a === 'data-cs-guard') delete it.dataset.csGuard;
      if (a === 'data-cs-guard-name') delete it.dataset.csGuardName;
    };
  });
  return { sandbox, api, list, byId, created, items };
}
{
  const off = fakeItem({ href: 'https://weixin.qq.com/dl', title: '微信官网', text: '微信官网' });
  const normal = fakeItem({ href: 'https://help.example.com/q', title: '如何下载软件', text: '经验分享' });
  const env = makeGuardEnv([normal, off]);

  env.api.runGuardian();                       // 第一轮
  const banner1 = env.byId.get('cs-guard-banner');
  check('第一轮：横幅已插入', !!banner1);
  check('第一轮：横幅位于结果区首位（P1-2）', env.list.kids[0] === banner1);
  check('第一轮：官网已置顶到横幅之后', env.list.kids[1] === off);

  env.api.runGuardian();                       // 第二轮（MutationObserver 会不断触发）
  const banner2 = env.byId.get('cs-guard-banner');
  check('第二轮：横幅仍在，未闪现即消失（P1-1）', !!banner2);
  check('第二轮：横幅仍是第一个子节点（P1-2）', env.list.kids[0] === banner2);
  check('第二轮：横幅未被重复插入', env.list.kids.filter(k => k === banner2).length === 1);
}
{
  // 【P1-3】横幅自身是结果容器的直接子 div：不得被当成搜索结果分类/打标
  const off = fakeItem({ href: 'https://weixin.qq.com/dl', title: '微信官网', text: '微信官网' });
  const env = makeGuardEnv([off]);
  env.api.runGuardian();
  const banner = env.byId.get('cs-guard-banner');
  // 把横幅塞进结果列表（真实页面里它就是 #content_left 的直接子 div）
  env.list.appendChild(banner);
  env.api.runGuardian();
  check('横幅不会被当成搜索结果分类（P1-3）', banner.dataset === undefined || banner.dataset.csGuard === undefined);
}

/* ===================================================================== *
 * J. 关闭护航后的痕迹清理（P1-4）
 * ================================================================== */
section('J. 关闭护航后痕迹清理（P1-4）');
{
  const off = fakeItem({ href: 'https://weixin.qq.com/dl', title: '微信官网', text: '微信官网' });
  const dl = fakeItem({ href: 'https://www.pc6.com/soft/1', title: '微信下载 pc6', text: 'pc6 微信下载' });
  const env = makeGuardEnv([off, dl]);
  env.api.runGuardian();
  check('清理前：徽章已注入', env.created.filter(e => e.className === 'cs-guard-badge').length === 2);
  check('清理前：下载站已置灰', dl.style.opacity === '0.6');

  env.api.cfg().guardian.enabled = false;
  env.api.runGuardian();
  check('关闭护航 → 徽章已移除', env.created.filter(e => e.className === 'cs-guard-badge').length === 0);
  check('关闭护航 → 置灰已还原', dl.style.opacity === '');
  check('关闭护航 → 分类标记已清除', off.dataset.csGuard === undefined && dl.dataset.csGuard === undefined);
  check('关闭护航 → 横幅已移除', !env.byId.has('cs-guard-banner'));
}
{
  // 只关「下载站警示」开关：黄标与置灰要撤掉，绿标保留
  const off = fakeItem({ href: 'https://weixin.qq.com/dl', title: '微信官网', text: '微信官网' });
  const dl = fakeItem({ href: 'https://www.pc6.com/soft/1', title: '微信下载 pc6', text: 'pc6 微信下载' });
  const env = makeGuardEnv([off, dl]);
  env.api.runGuardian();
  env.api.cfg().guardian.warnDownload = false;
  env.api.runGuardian();
  check('关闭下载站警示 → 置灰还原', dl.style.opacity === '');
  check('关闭下载站警示 → 官网绿标不受影响', off.dataset.csGuard === 'official');
}

/* ===================================================================== *
 * K. 护航分类纯逻辑（P1-5 域名优先 / P1-6 仿冒站 / 防误伤）
 * ================================================================== */
section('K. 护航分类逻辑（P1-5 / P1-6）');
{
  const { api } = makeEnv();
  const cl = (href, text, q) => api.probe.classifyItem(href, text, q || '微信下载').kind;

  check('官网域名 → official', cl('https://weixin.qq.com/x', '微信官网') === 'official');
  check('下载站域名 → danger', cl('https://www.pc6.com/1', '微信下载') === 'danger');
  check('仿冒站：品牌词 + 陌生域名 + 诱导下载 → danger（P1-6）',
    cl('https://www.xzy12345.com/weixin-setup.exe', '微信官方下载 高速下载') === 'danger');
  check('正文提到下载站但域名是官网 → 仍为 official（P1-5）',
    cl('https://weixin.qq.com/x', '微信官网 pc6.com 也有') === 'official');
  check('百科结果不被误判为下载站（无误伤）',
    cl('https://baike.baidu.com/item/微信', '微信百科 介绍') === 'candidate');
  check('无关官网域名不抢官方（知乎谈微信下载）',
    cl('https://www.zhihu.com/p/1', '微信怎么下载？- 知乎') === 'candidate');
  check('陌生域名且无品牌词 → unknown',
    cl('https://help.example.com/q', '如何下载软件') === '');
  check('无域名时仅文本品牌名 → candidate（不判 official）',
    cl('', '微信 频道页介绍') === 'candidate');
}

/* ===================================================================== *
 * L. 配置净化（P2-5）
 * ================================================================== */
section('L. 配置净化（P2-5）');
{
  const { api } = makeEnv();
  const nc = api.probe.normalizeConfig;
  check('keywords 去空白去重并剔除非字符串',
    JSON.stringify(nc({ keywords: [' 广告 ', 1, null, '广告', ''] }).keywords) === '["广告"]');
  check('officialSites 类型损坏 → 回落内置库',
    nc({ officialSites: ['weixin.qq.com'] }).officialSites.length > 50);
  check('officialSites 可主动清空', nc({ officialSites: [] }).officialSites.length === 0);
  check('officialSites 二元组缺名 → 用域名兜底',
    JSON.stringify(nc({ officialSites: [['a.example.com']] }).officialSites) === '[["a.example.com","a.example.com"]]');
  check('sites 非布尔 → 回落默认', nc({ sites: { baidu: 'yes' } }).sites.baidu === true);
  check('guardian 非布尔 → 回落默认', nc({ guardian: { enabled: 0 } }).guardian.enabled === true);
  check('null 配置 → 默认关键词为空数组', JSON.stringify(nc(null).keywords) === '[]');
  check('downloadSites 保留用户清空', JSON.stringify(nc({ downloadSites: [] }).downloadSites) === '[]');
}

/* ===================================================================== *
 * M. domainOf（P1-5 配套）
 * ================================================================== */
section('M. domainOf 域名提取');
{
  const { api } = makeEnv();
  const d = api.probe.domainOf;
  check('带协议与端口', d('https://WeiXin.QQ.com:8080/a?b=1') === 'weixin.qq.com');
  check('裸域名（c-showurl）', d('weixin.qq.com') === 'weixin.qq.com');
  check('带 userinfo', d('http://u:p@x.example.com/y') === 'x.example.com');
  check('空输入', d('') === '');
  check('非法输入不抛异常', d('::::') === '');
}

/* ===================================================================== *
 * N. 360 角标识别开关联动（P2-1）
 * ================================================================== */
section('N. 360 角标开关联动（P2-1）');
{
  const mkAd = () => {
    const badge = {
      tagName: 'SPAN', textContent: '广告',
      querySelector: () => null,
      cloneNode: () => ({ textContent: '广告', querySelectorAll: () => [] }),
    };
    const el = {
      _removed: false, dataset: {}, style: {}, textContent: '广告 结果',
      querySelectorAll: () => [badge],
      querySelector: () => null,
      matches: () => false,
      remove() { el._removed = true; },
    };
    return el;
  };
  {
    const { sandbox, api } = makeEnv({ hostname: 'www.so.com' });
    const el = mkAd();
    sandbox.document.querySelectorAll = (sel) => (sel.indexOf('res-list') >= 0 ? [el] : []);
    api.cfg().badgeText = true;
    api.runAll();
    check('开启角标识别 → 360 广告结果被移除', el._removed === true);
  }
  {
    const { sandbox, api } = makeEnv({ hostname: 'www.so.com' });
    const el = mkAd();
    sandbox.document.querySelectorAll = (sel) => (sel.indexOf('res-list') >= 0 ? [el] : []);
    api.cfg().badgeText = false;
    api.runAll();
    check('关闭角标识别 → 360 广告结果保留（P2-1）', el._removed === false);
  }
}

console.log('\n---------------------------------------------');
console.log('通过 ' + passed + ' / 失败 ' + failed);
process.exit(failed ? 1 : 0);
