// ==UserScript==
// @name         净搜 CleanSearch
// @author       VeT_SHIUAN
// @namespace    https://github.com/vetshiuan/cleansearch
// @version      0.2.8
// @updateURL    https://raw.githubusercontent.com/vetshiuan/cleansearch/main/cleansearch.user.js
// @downloadURL  https://raw.githubusercontent.com/vetshiuan/cleansearch/main/cleansearch.user.js
// @description  搜索引擎去广告净化：屏蔽百度/谷歌/必应/360 竞价排名广告与推广内容，支持知乎/B站/豆瓣/微博/CSDN 广告过滤，自定义关键词与网址屏蔽，设置面板内置（油猴菜单唤起），无任何外部依赖与推广。
// @match        *://*.baidu.com/*
// @match        *://*.google.com/*
// @match        *://*.google.com.hk/*
// @match        *://*.bing.com/*
// @match        *://*.so.com/*
// @match        *://*.zhihu.com/*
// @match        *://*.bilibili.com/*
// @match        *://*.douban.com/*
// @match        *://*.weibo.com/*
// @match        *://*.csdn.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      baidu.com
// @connect      *.baidu.com
// @run-at       document-end
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ===================================================================== *
   * 净搜 CleanSearch Ver 0.2.8 | 作者：VeT_SHIUAN | License: MIT
   *
   * 0.2.8 修复记录（全量代码审查 + 回归测试套件修复）：
   *  [P0-1] parseRealUrl 只调用从未定义 —— 百度跳转链接解析每次 onload 抛 ReferenceError，
   *         finishResolve 永不执行：activeResolve 泄漏（4 次后解析功能彻底停摆）、
   *         linkWaiters 永不回调、linkCache 永不写入 → 「网址屏蔽」在百度上形同虚设。已实现该函数。
   *  [P0-2] _isTokenChar 边界取反（!c 使 undefined 被判为「是 token 字符」），
   *         nameTokenHit 在串首/串尾/整体相等时永远返回 false —— 该函数从未命中过，品牌名兜底判定全废。
   *  [P0-3] 回归测试套件引用 probe.brandNameHit / nameTokenHit / parseRealUrl / refreshAdStyleState，
   *         脚本一个都没暴露 → 测试在 D 段崩溃，F/G/H 段从未执行。已补全 probe API。
   *  [P1-1] 护航提示条第二轮必消失：①分类跳过已定性项，导致 officialItem/dangerCount 第二轮归零，
   *         ④立刻 showGuardBanner(null) 删掉刚插入的横幅 —— 0.2.7 主打功能实为「闪现即消失」。
   *  [P1-2] 官网置顶把横幅挤到第二位：insertBefore(item, list.firstChild) 插到横幅之前。
   *  [P1-3] 横幅自身是 #content_left > div，被当成搜索结果参与分类，会拿到灰标「官方?」并插入徽章。
   *  [P1-4] 关闭护航 / 官网置顶 / 下载站警示 / 总开关 / 白名单后，已插入的徽章、置灰、标记全部残留。
   *  [P1-5] isDownloadSite 用「域名+正文」混合 haystack：正文提到 pc6.com 就把官网误判成下载站。
   *         改为域名优先（域名命中官网库时不看正文），正文仅作无域名时的兜底。
   *  [P1-6] 「品牌词 + 陌生域名」未判 danger：仿冒站（标题写「微信官方下载」、域名是陌生小站）漏网。
   *         增加「域名陌生 + 品牌名 + 下载诱导词 → danger」，并用诱导词约束避免误伤百科/资讯页。
   *  [P1-7] 谷歌嵌套 div[data-hveid] 重复分类，同一结果被打上多个徽章。
   *  [P1-8] GM_xmlhttpRequest 同步抛错 / onload 与 ontimeout 双触发 → activeResolve 泄漏或变负。
   *  [P2-1] cleanSo360 的 hasAdBadge 未受 cfg.badgeText 开关控制，关闭角标识别在 360 上无效。
   *  [P2-2] 知乎弹窗关闭判断取反：找不到 modal 时（!modal）反而强制点击关闭按钮。
   *  [P2-3] migrateOldConfig 无异常保护，GM_getValue 抛错会导致整个脚本不启动。
   *  [P2-4] scheduleRun 名为防抖实为「丢弃」，更小的 delay 请求（如解析完成后的 150ms）被完全吞掉。
   *  [P2-5] 导入配置无类型净化：officialSites 若为字符串数组，domainHit 会用单字符匹配 → 全站误杀。
   *  [P2-6] 导出配置 revokeObjectURL 紧随 click()，下载可能被取消；a 元素未挂载。
   *
   * 0.2.7 修复记录（护航提示条状态机自检）：
   *  [Self1] 顶部提示条跨查询残留：从下载查询切到普通查询/关闭护航后，旧横幅仍挂在结果区 → runGuardian 出口统一清理
   *  [Self2] 提示条只增不换：official 与 warn 无法互相替换、提示条开关关闭后旧横幅不消失 → showGuardBanner 支持同类去重/异类替换/空态删除
   *
   * 0.2.6 修复记录（对应社区 Bug 报告 Issue1-4 + 自检）：
   *  [Issue1] 护航"官方"判定改域名优先：下载站标题蹭品牌词不再绿标置顶；仅品牌名无域名证据时降级灰标"官方?"候选，下载站警示优先于官方判定
   *  [Issue2] 护航弱意图词增加"前邻软件名"校验，杜绝"信用卡官方"/"官方"/"电脑版"等非下载查询误触发
   *  [Issue3] 关闭总开关/百度站点开关后立即移除已注入净化样式，开关语义即时生效
   *  [Issue4] 删除 ensureAdCSS 中只写不读的死代码 adCssInjected
   *  [Self] 护航 candidate 分类允许在真实域名异步解析后升级为 official/danger，避免绿标失效、徽章与提示条按升级结果替换
   *
   * 0.2.5 修复记录：
   *  [Fix1] 面板开关泄漏 800ms 轮询定时器 → 句柄统一保存，stopObserver 清除
   *  [Fix2] 右栏隐藏 CSS 不再看 hotList 开关 → 改为受开关控制的动态样式
   *  [Fix3] 必应 u 参数解码错误回拼 a1 前缀 → 剥前缀+补 padding+校验 http(s)
   *  [Fix4] 护航触发词误伤新闻查询 → 强/弱意图分级 + 资讯词排除 + 不再用标题兜底
   *  [Fix5] 谷歌/必应跳转解析加链接特征限定（/url? 与 /ck/）
   *  [Fix6] 官网/下载站域名匹配改域名级边界（防 jd.com 命中 jd.com.cn 等）
   *  [Fix7] 百度跳转解析并发去重；护航尊重「解析跳转链接」开关；必应 URL 屏蔽用真实网址
   *  [Fix8] 面板 textarea 转义；关面板按需重启监听并触发重扫
   *  [Fix9] 知乎弹窗关闭前校验内容，防误关
   *  [Fix10] .cos-row 限定作用域；移动端横幅容器逐个尝试；官网库去重
   *
   * 结构索引：
   * §1 配置与存储  §2 旧脚本数据迁移  §3 通用工具  §4 通用广告判定器
   * §5 百度（PC/移动/子站）  §6 谷歌 / 必应 / 360
   * §7 知乎 / B站 / 豆瓣 / 微博 / CSDN
   * §7.5 护航模块  §8 调度与监听  §9 内置设置面板
   * ===================================================================== */

  const SCRIPT_VERSION = "0.2.8";
  const CONFIG_KEY = 'cs_config';
  const MIGRATED_KEY = 'cs_migrated_v0';

  /* ===================================================================== *
   * §1 配置与存储
   * ===================================================================== */
  const DEFAULT_CONFIG = {
    enabled: true,        // 总开关
    badgeText: true,      // 角标文本识别（「广告」等叶子节点）
    resolveLinks: true,   // 解析百度跳转链接（网址屏蔽依赖此功能）
    hotList: true,        // 去除百度热搜/右栏广告块
    sites: {
      baidu: true,
      baiduSub: true,
      google: true,
      bing: true,
      so360: true,
      zhihu: true,
      bilibili: true,
      douban: true,
      weibo: true,
      csdn: true,
    },
    filters: {
      kwFilter: true,
      urlFilter: true,
    },
    keywords: [],
    urls: [],
    whitelist: [],
    /* ---- 0.2.0 护航模块：官网置顶 / 下载站警示 ---- */
    guardian: {
      enabled: true,
      pinOfficial: true,
      warnDownload: true,
      banner: true,
    },
    officialSites: [
      ['weixin.qq.com', '微信'], ['im.qq.com', 'QQ'],
      ['work.weixin.qq.com', '企业微信'], ['docs.qq.com', '腾讯文档'],
      ['meeting.tencent.com', '腾讯会议'], ['dingtalk.com', '钉钉'],
      ['feishu.cn', '飞书'], ['wps.cn', 'WPS Office'], ['kdocs.cn', '金山文档'],
      ['alipay.com', '支付宝'], ['taobao.com', '淘宝'], ['tmall.com', '天猫'],
      ['jd.com', '京东'], ['pinduoduo.com', '拼多多'], ['douyin.com', '抖音'],
      ['kuaishou.com', '快手'], ['xiaohongshu.com', '小红书'],
      ['iqiyi.com', '爱奇艺'], ['v.qq.com', '腾讯视频'], ['youku.com', '优酷'],
      ['music.163.com', '网易云音乐'], ['y.qq.com', 'QQ音乐'],
      ['kugou.com', '酷狗'], ['kuwo.cn', '酷我'], ['bilibili.com', '哔哩哔哩'],
      ['ximalaya.com', '喜马拉雅'], ['keep.com', 'Keep'], ['weibo.com', '微博'],
      ['zhihu.com', '知乎'], ['csdn.net', 'CSDN'], ['github.com', 'GitHub'],
      ['gitee.com', 'Gitee'], ['pan.baidu.com', '百度网盘'], ['xunlei.com', '迅雷'],
      ['google.cn/chrome', '谷歌浏览器'], ['microsoftedge.microsoft.com', 'Edge浏览器'],
      ['mozilla.org', 'Firefox浏览器'], ['se.360.cn', '360安全浏览器'],
      ['360.cn', '360安全卫士'], ['huorong.cn', '火绒安全'],
      ['pc.qq.com', '腾讯电脑管家'], ['duba.net', '金山毒霸'],
      ['ludashi.com', '鲁大师'], ['drivergenius.com', '驱动精灵'], ['160.com', '驱动人生'],
      ['cpuid.com', 'CPU-Z'], ['techpowerup.com', 'GPU-Z'],
      ['rarlab.com', 'WinRAR'], ['7-zip.org', '7-Zip'], ['bandisoft.com', 'Bandizip'],
      ['notepad-plus-plus.org', 'Notepad++'], ['code.visualstudio.com', 'VS Code'],
      ['obsproject.com', 'OBS Studio'],  // 【Fix10】原表重复两条，已去重
      ['videolan.org', 'VLC'], ['potplayer.daum.net', 'PotPlayer'],
      ['sunlogin.com', '向日葵远程'], ['todesk.com', 'ToDesk'],
      ['teamviewer.com', 'TeamViewer'], ['anydesk.com', 'AnyDesk'],
      ['ldmnq.com', '雷电模拟器'], ['mumu.163.com', 'MuMu模拟器'],
      ['yeshen.com', '夜神模拟器'], ['bluestacks.com', '蓝叠模拟器'],
      ['yuque.com', '语雀'], ['weread.qq.com', '微信读书'],
      ['shurufa.baidu.com', '百度输入法'], ['pinyin.sogou.com', '搜狗输入法'],
      ['capcut.cn', '剪映'], ['ulikecam.com', '剪映专业版'], ['pcfreetime.com', '格式工厂'],
      ['aliyun.com', '阿里云'], ['cloud.tencent.com', '腾讯云'], ['youzhiyun.com', '优志愿'],
      ['qidian.com', '起点中文网'], ['fanqienovel.com', '番茄小说'],
      ['doubao.com', '豆包'], ['kimi.moonshot.cn', 'Kimi'],
      ['tongyi.aliyun.com', '通义千问'], ['deepseek.com', 'DeepSeek'],
    ],
    downloadSites: [
      'pc6.com', 'onlinedown.net', 'downxia.com', 'duote.com', 'cr173.com',
      'xiazaiba.com', 'yxdown.com', 'uzzf.com', 'downcc.com', 'skycn.com',
      'software.com.cn', 'dl.pconline.com.cn', 'xiazai.zol.com.cn',
      'winwin7.com', 'winwin10.com', 'xp510.com', '2265.com', '2345.com',
      'mydrivers.com', 'ali213.net', '3dmgame.com', 'gamersky.com', 'youxia.com',
      'pchome.net', 'woaidownload.com', 'pk38.com', '8510.com', 'down55.com',
      '688dd.com', 'gxspc.com', 'pc860.com', 'imdown.net', 'xiazaigame.com',
      '7down.com', 'softpedia.com', 'tweaking.com', 'ruan8.com', 'cngrj.com',
      'xiazaigl.com', 'lanzous.com', 'xiaoshuo520.com', 'cscz.com', 'win8xiazai.com',
      'dngs.com', 'pconline.com.cn/download', 'csdown.com', 'ddooo.com', 'bkill.com',
    ],
  };

  // 深合并：数组与普通值以「新值覆盖旧值」处理
  function deepMerge(base, patch) {
    if (patch === null || patch === undefined) return base;
    if (Array.isArray(base) || Array.isArray(patch)) return patch;
    if (typeof base === 'object' && typeof patch === 'object') {
      const out = Object.assign({}, base);
      for (const k of Object.keys(patch)) out[k] = deepMerge(base[k], patch[k]);
      return out;
    }
    return patch;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* --------------------------------------------------------------------- *
   * 【P2-5】配置净化：导入/读取的配置可能来自旧版本、手改文件或第三方，
   * 类型不可信。不做净化时 officialSites 若是字符串数组，domainHit 会拿
   * 单字符去匹配任意域名 → 全站结果被误判官网/下载站。
   * ------------------------------------------------------------------- */
  function normalizeConfig(raw) {
    // 非对象（字符串 / 数字 / 数组）一律视为无配置：否则 deepMerge 会把它原样返回，
    // 后续对原始值赋属性会在 'use strict' 下抛 TypeError
    if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) raw = null;
    const d = clone(DEFAULT_CONFIG);
    const out = deepMerge(d, raw);
    const isBool = (v) => typeof v === 'boolean';
    const boolOf = (v, dv) => (isBool(v) ? v : dv);
    const strArr = (v) => (Array.isArray(v)
      ? Array.from(new Set(v.filter(x => typeof x === 'string').map(s => s.trim()).filter(Boolean)))
      : null);

    out.enabled = boolOf(out.enabled, true);
    out.badgeText = boolOf(out.badgeText, true);
    out.resolveLinks = boolOf(out.resolveLinks, true);
    out.hotList = boolOf(out.hotList, true);

    const sites = {};
    for (const k of Object.keys(d.sites)) sites[k] = boolOf(out.sites && out.sites[k], d.sites[k]);
    out.sites = sites;

    const filters = {};
    for (const k of Object.keys(d.filters)) filters[k] = boolOf(out.filters && out.filters[k], d.filters[k]);
    out.filters = filters;

    const guardian = {};
    for (const k of Object.keys(d.guardian)) guardian[k] = boolOf(out.guardian && out.guardian[k], d.guardian[k]);
    out.guardian = guardian;

    for (const k of ['keywords', 'urls', 'whitelist', 'downloadSites']) {
      const a = strArr(out[k]);
      out[k] = a === null ? d[k] : a;   // 类型错误 → 回落默认（用户主动清空时是 []，保留空）
    }

    if (Array.isArray(out.officialSites)) {
      // 允许被清空（空数组），但每一项必须是 [域名, 名称] 二元组且域名含 "."
      const src = out.officialSites;
      const ok = src
        .filter(o => Array.isArray(o) && typeof o[0] === 'string' && o[0].indexOf('.') > 0)
        .map(o => {
          const dom = String(o[0]).trim();
          const nm = String(o[1] === undefined || o[1] === null ? dom : o[1]).trim();
          return [dom, nm || dom];
        });
      // 有内容却一项都不合法（例如被写成了字符串数组）→ 视为损坏，回落内置库；
      // 空数组视为用户主动清空，予以保留
      out.officialSites = (src.length && !ok.length) ? d.officialSites : ok;
    } else {
      out.officialSites = d.officialSites;   // 类型损坏 → 回落内置官网库
    }
    return out;
  }

  function loadConfig() {
    let saved = null;
    try { saved = GM_getValue(CONFIG_KEY); } catch (e) { saved = null; }
    return normalizeConfig(saved);
  }
  let cfg = loadConfig();
  function saveConfig() {
    try { GM_setValue(CONFIG_KEY, cfg); } catch (e) { console.error('[净搜] 保存配置失败', e); }
  }

  /* ===================================================================== *
   * §2 旧脚本数据迁移
   * ===================================================================== */
  function migrateOldConfig() {
    // 【P2-3】整体 try/catch：本函数在 boot 最前面执行，一旦抛出（存储被禁用 / 配额 /
    // 旧脚本写入了不可解析的数据），后面的 runAll 与 startObserver 都不会执行 —— 脚本彻底不工作。
    try {
      if (GM_getValue(MIGRATED_KEY)) return;
      try {
        const old = GM_getValue('allconfig');
        if (old && typeof old === 'object') {
          const pick = (arr) => Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x.trim()).map(s => s.trim()) : [];
          if (!cfg.keywords.length) cfg.keywords = pick(old.pingbikw);
          if (!cfg.urls.length) cfg.urls = pick(old.pingbiurl);
          if (!cfg.whitelist.length) cfg.whitelist = pick(old.urlwhite);
        }
      } catch (e) { /* 旧数据不存在，忽略 */ }
      GM_setValue(MIGRATED_KEY, 1);
      saveConfig();
    } catch (e) {
      try { console.warn('[净搜] 旧配置迁移跳过', e); } catch (e2) { /* 忽略 */ }
    }
  }

  /* ===================================================================== *
   * §3 通用工具
   * ===================================================================== */
  // 脚本自注入节点的标识（提示条 / 徽章），用于把「自己注入的东西」从搜索结果里排除掉
  const GUARD_BANNER_ID = 'cs-guard-banner';
  const GUARD_BADGE_CLS = 'cs-guard-badge';

  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function textOf(el) { return (el && el.textContent || '').trim(); }
  function isLeaf(el) { return el.children.length === 0; }

  function inWhitelist() {
    if (!cfg.whitelist.length) return false;
    const cur = location.hostname + location.pathname;
    return cfg.whitelist.some(s => s && cur.indexOf(s) >= 0);
  }

  function removeAdEl(el, containerSel) {
    const box = containerSel ? el.closest(containerSel) : null;
    (box || el).remove();
  }

  function removeBySelectors(list) {
    let n = 0;
    for (const s of list) {
      let nodes = null;
      try { nodes = $$(s); } catch (e) { continue; }
      for (const el of nodes) { el.remove(); n++; }
    }
    return n;
  }

  let removedCount = 0;

  /* ===================================================================== *
   * §4 通用广告判定器
   * ===================================================================== */
  const AD_ATTR_SEL = [
    '[data-tuiguang]', '[data-module="ad"]', '[data-placeid]', '[cmatchid]',
  ].join(',');

  const AD_CLASS_SEL = [
    '.ec-tuiguang', '.ecfc-tuiguang', '.ec_ad_results', '.ecom-result',
    '.ec_wise_ad', '.ec-ad', '.ec-ad-container', '[class*="EC_result"]',
    '.cos-pc-ad-container', '.c-result-ad', '.tuiguang',
  ].join(',');

  const BADGE_TEXTS = ['广告', '商业推广', '推广', 'Sponsored', '赞助商广告', '赞助商链接', 'Ad', 'AD'];

  function badgeTextPure(el) {
    let text = el.textContent || '';
    if (!text) return '';
    const node = el.cloneNode(true);  // 【Fix12】原变量名 clone 遮蔽同名工具函数，改名防混淆
    const deco = node.querySelectorAll('svg, img, i, em, b, u, s, video, canvas');
    for (const d of deco) d.remove();
    return (node.textContent || '').replace(/\s+/g, '').trim();
  }

  function hasAdBadge(el) {
    const scope = el.querySelectorAll('span, i, em, cite, div, strong, a');
    for (const b of scope) {
      if (b.querySelector('h2, h3, p, article')) continue;
      if (b.tagName === 'A' && (b.parentElement && b.parentElement.matches('h2,h3'))) continue;
      const t = (b.textContent || '').trim();
      if (t.length > 14) continue;
      if (t.length < 2) continue;
      const pure = badgeTextPure(b);
      if (!pure || pure.length > 8) continue;
      if (BADGE_TEXTS.indexOf(pure) >= 0) return b;
    }
    return null;
  }

  function hasPseudoBadge(el) {
    const cands = [el];
    if (el.firstElementChild) cands.push(el.firstElementChild);
    if (el.lastElementChild && el.lastElementChild !== el.firstElementChild) cands.push(el.lastElementChild);
    for (const c of cands) {
      for (const pe of ['::after', '::before']) {
        try {
          const ct = getComputedStyle(c, pe).content || '';
          if (ct.indexOf('广告') >= 0 || ct.indexOf('推广') >= 0 || ct.indexOf('Sponsored') >= 0) return true;
        } catch (e) { /* 忽略 */ }
      }
    }
    return false;
  }

  function hitAdMarker(el) {
    if (el.matches(AD_ATTR_SEL) || el.querySelector(AD_ATTR_SEL)) return 'attr';
    if (el.matches(AD_CLASS_SEL) || el.querySelector(AD_CLASS_SEL)) return 'class';
    if (cfg.badgeText && (hasAdBadge(el) || hasPseudoBadge(el))) return 'badge';
    return null;
  }

  function hitKeyword(text) {
    if (!cfg.filters.kwFilter || !cfg.keywords.length) return false;
    return cfg.keywords.some(k => text.indexOf(k) >= 0);
  }

  function hitUrl(url) {
    if (!cfg.filters.urlFilter || !cfg.urls.length || !url) return false;
    return cfg.urls.some(u => url.indexOf(u) >= 0);
  }

  /* --------------------------------------------------------------------- *
   * 百度跳转链接解析（限并发 + 缓存 + 并发去重）
   * 【Fix7】同一 href 的并发请求合并为一次（等待者队列），解析完成后统一回调
   * ------------------------------------------------------------------- */
  const linkCache = new Map();
  const linkWaiters = new Map();
  const resolveQueue = [];
  let activeResolve = 0;
  const MAX_CONCURRENT = 4;

  function flushWaiters(href, real) {
    const list = linkWaiters.get(href);
    if (!list) return;
    linkWaiters.delete(href);
    for (const cb of list) { try { cb(real); } catch (e) { /* 忽略 */ } }
  }

  function queueResolve(href, cb) {
    if (!href) { cb(''); return; }
    if (linkCache.has(href)) { cb(linkCache.get(href)); return; }
    let w = linkWaiters.get(href);
    if (!w) { w = []; linkWaiters.set(href, w); resolveQueue.push(href); pumpResolve(); }
    w.push(cb);
  }

  function finishResolve(href, real) {
    // 【P0-1 / P1-8】幂等：onload 与 ontimeout 在某些引擎下会双触发，
    // 不去重会让 activeResolve 变成负数，进而永久放行超过 MAX_CONCURRENT 的请求。
    if (linkCache.has(href)) return;
    linkCache.set(href, real || '');
    if (activeResolve > 0) activeResolve--;
    flushWaiters(href, real || '');
    pumpResolve();
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  }

  /* --------------------------------------------------------------------- *
   * 【P0-1】parseRealUrl —— 0.2.7 及之前只调用、从未定义。
   * 后果链：onload 抛 ReferenceError → finishResolve 不执行 → activeResolve 泄漏
   * （4 次后解析彻底停摆）、linkWaiters 永不回调、linkCache 永不写入 →
   * 「网址屏蔽」在百度搜索结果上完全失效。
   * 用途：手动重定向模式下从跳转中间页里抠出真实地址。
   * ------------------------------------------------------------------- */
  function parseRealUrl(html) {
    if (!html) return '';
    const s = String(html);
    try {
      // ① <meta http-equiv="refresh" content="0;url=...">
      let m = s.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/i);
      if (m) {
        const c = m[0].match(/url\s*=\s*["']?([^"'\s>;]+)/i);
        if (c) return decodeEntities(c[1]);
      }
      // ② window.location.replace(...) / .assign(...) / .href = ...
      m = s.match(/window\.location(?:\.href\s*=|\s*=\s*|\.replace\s*\(|\.assign\s*\(|\s*\[\s*["']href["']\s*\]\s*=)\s*["']([^"']+)["']/i);
      if (m) return decodeEntities(m[1]);
      // ③ location.href = ... / top.location = ...
      m = s.match(/(?:^|[^.\w])(?:top\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']/i);
      if (m) return decodeEntities(m[1]);
      // ④ 兜底：仅在确实是「跳转中间页」时才抓页面里第一个 http(s) 链接，
      //    避免在正常结果页里抓到随机外链
      if (s.length < 20000 && /location|refresh|redirect|跳转|正在跳转|安全验证/i.test(s)) {
        m = s.match(/["'(](https?:\/\/[^"'\s<>)]{6,})["')]/);
        if (m) return decodeEntities(m[1]);
      }
    } catch (e) { /* 忽略解析异常 */ }
    return '';
  }

  function pumpResolve() {
    while (activeResolve < MAX_CONCURRENT && resolveQueue.length) {
      const href = resolveQueue.shift();
      if (linkCache.has(href)) { flushWaiters(href, linkCache.get(href)); continue; }
      activeResolve++;
      let started = false;
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url: href,
          timeout: 4000,
          redirect: 'manual',
          onload: (res) => {
            let real = '';
            try {
              // onload 内任何异常都会吞掉 finishResolve（P0-1 的根因），这里统一兜住
              const hdrs = (res && res.responseHeaders) || '';
              const lm = String(hdrs).match(/(?:^|\r?\n)[Ll]ocation:\s*(\S+)/);
              if (lm) real = lm[1];
              if (!real && res && res.finalUrl && res.finalUrl !== href) real = res.finalUrl;
              if (!real) real = parseRealUrl(res && res.responseText);
            } catch (e) { real = ''; }
            finishResolve(href, real);
          },
          onerror: () => finishResolve(href, ''),
          ontimeout: () => finishResolve(href, ''),
          onabort: () => finishResolve(href, ''),
        });
        started = true;
      } catch (e) {
        // 【P1-8】同步抛出（URL 非法 / GM API 不可用）时也必须归还并发额度，否则队列永久卡死
        if (!started) finishResolve(href, '');
      }
    }
  }

  /* ===================================================================== *
   * §5 百度
   * ===================================================================== */
  // 【Issue3】当前配置下当前页面是否需要百度广告隐藏样式（总开关 / 站点开关联动）
  function needAdCSS() {
    if (!cfg.enabled || inWhitelist()) return false;
    const host = location.hostname;
    if (host.indexOf('baidu.com') < 0) return false;
    if (host === 'www.baidu.com' || host === 'm.baidu.com') return cfg.sites.baidu;
    return cfg.sites.baiduSub;
  }

  // 【Issue3】开关关闭后移除已注入的净化样式，保证"关闭"立即生效
  function syncAdCSS() {
    try {
      const st = document.getElementById('cs-adblock-style');
      if (st && !needAdCSS()) st.remove();
    } catch (e) { /* 忽略 */ }
  }

  function ensureAdCSS() {
    try {
      const base = '#bottomads{display:none!important;}'
        + '#content_left>div:not([id])>div[cmatchid],#content_left>div[id*="300"]:not([class*="result"]){position:absolute!important;top:-6666px!important;}';
      // 【Fix2】右栏隐藏规则受 hotList 开关控制；开关变化时同步更新已注入的样式
      const right = cfg.hotList ? '#content_right td>div:not([id]),#content_right>br{display:none!important;}' : '';
      const css = base + right;
      let st = document.getElementById('cs-adblock-style');
      if (st) {
        if (st.dataset.cs === css) return;
        st.dataset.cs = css;
        st.textContent = css;
        return;
      }
      st = document.createElement('style');
      st.id = 'cs-adblock-style';
      st.dataset.cs = css;
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { /* 忽略 */ }
  }

  function cleanBaiduPC() {
    ensureAdCSS();
    removedCount += removeBySelectors([
      '[cmatchid]', '#top-ad', '.res_top_banner',
      '.ec-pc_mat_c_banner__cc_banner_background_b', '#bottomads',
    ]);
    removedCount += removeBySelectors(['#content_left div[class*="_rs"]']);

    const seen = new Set();
    // 【Fix10】.cos-row 限定在 #content_left，避免误伤非结果区
    // 【P1-3】排除脚本自己注入的提示条：它是 #content_left 的直接子 div，
    // 会被当成一条搜索结果，用户屏蔽词含「下载/官方」时提示条会被自己删掉
    const items = $$('#content_left > div, #content_left [data-srcid], #content_left > .result, #content_left .cos-row')
      .filter(el => el.id !== GUARD_BANNER_ID);
    items.forEach(item => {
      if (seen.has(item)) return;
      seen.add(item);
      const marker = hitAdMarker(item);
      if (marker) { item.remove(); removedCount++; return; }
      if (hitKeyword(textOf(item))) { item.remove(); removedCount++; return; }
      const a = item.querySelector('h3 a[href]') || item.querySelector('a[href]');
      if (a && cfg.filters.urlFilter && cfg.urls.length) {
        const href = a.href || '';
        if (hitUrl(href)) { item.remove(); removedCount++; return; }
        if (cfg.resolveLinks && /baidu\.com\/(link|bh)/.test(href)) {
          queueResolve(href, real => {
            if (real && hitUrl(real)) { item.remove(); removedCount++; }
          });
        }
      }
    });

    if (cfg.hotList) {
      removedCount += removeBySelectors(['#s-hotsearch-wrapper', '.hot-news-wrapper', '#con-ar', '#content_right > br']);
      $$('#content_right > div').forEach(block => {
        if (!block.id) { block.remove(); removedCount++; return; }
        const leafA = Array.from(block.querySelectorAll('a')).find(a => !a.children.length && (a.textContent || '').trim().indexOf('广告') === 0);
        if (leafA) { block.remove(); removedCount++; }
      });
    } else {
      $$('#content_right > div').forEach(block => {
        if (hitAdMarker(block) || hitKeyword(textOf(block))) { block.remove(); removedCount++; }
      });
    }
  }

  function cleanBaiduMobile() {
    removedCount += removeBySelectors([
      '.ec_wise_ad', '.ec_youxuan_card', '.page-banner',
      '.ec-result-inner', '[data-module="b"]', '.na-like-container',
    ]);
    const containers = $$('#results > div, #content_left > div, div.c-result');
    containers.forEach(item => {
      if (hitAdMarker(item)) { item.remove(); removedCount++; return; }
      if (hitKeyword(textOf(item))) { item.remove(); removedCount++; }
    });
  }

  function cleanBaiduHome() {
    if (cfg.hotList) {
      removedCount += removeBySelectors(['#s-hotsearch-wrapper', '.hot-news-wrapper']);
    }
  }

  function cleanBaiduSub() {
    removedCount += removeBySelectors([
      "[id*='mediago-tb-']", '.fengchao-wrap', '.fengchao-wrap-box',
      'div[ad-dom-img]', '#aside-ad-wrapper', '#branding_ads', '.bus-top-activity-wrap',
      '.ad-box', '.banner-ad', '.union-ad-bottom', '.wgt-ads', '#ggbtm',
      '.vip-card', '.zsj-topbar', '.zsj-toppos', '#banurl', '.lastcell-dialog',
      '.lemmaWgt-promotion-vbaike', '.lemmaWgt-promotion-slide', '#side_box_unionAd',
      '.topA', '.right-ad', '.configModuleBanner', '#navbarAdNew', '.userbar_mall',
      '.wgt-iknow-special-business', '.shop-entrance', '.activity-entry', '.bannerdown',
      '.aside.fixheight', '#wgt-ecom-banner', '#wgt-ecom-right',
      '[data-placeid]', '.ec-ad', '.ec-tuiguang',
    ]);
  }

  /* ===================================================================== *
   * §6 谷歌 / 必应 / 360
   * ===================================================================== */
  function cleanGoogle() {
    removedCount += removeBySelectors([
      '#tads', '#tadsb', '#bottomads',
      'div[aria-label="广告"]', 'div[aria-label="Ads"]', 'div[aria-label="Sponsored"]',
    ]);
    if (!cfg.badgeText) return;
    $$('#search span').forEach(sp => {
      if (!isLeaf(sp)) return;
      const t = textOf(sp);
      if (BADGE_TEXTS.indexOf(t) >= 0) {
        const box = sp.closest('div[data-hveid]') || sp.closest('#rso > div');
        if (box) { box.remove(); removedCount++; }
      }
    });
  }

  function cleanBing() {
    removedCount += removeBySelectors(['li.b_ad', 'div.b_ad', '.b_ad_bottom', '#b_context .b_ad', 'li:has(div.ad_fls)']);
    $$('li.b_algo').forEach(li => {
      const slug = li.querySelector('.b_adSlug, [class*="adSlug"], [class*="acf-badge"]');
      if (slug) { li.remove(); removedCount++; return; }
      if (cfg.badgeText && hitAdMarker(li)) { li.remove(); removedCount++; return; }
      if (hitKeyword(textOf(li))) { li.remove(); removedCount++; return; }
      const a = li.querySelector('h2 a[href]');
      if (a) {
        // 【Fix7】用解码后的真实网址做屏蔽判定（原版只看 bing 跳转链，屏蔽网址在必应上等于没用）
        if (hitUrl(a.href) || hitUrl(effectiveHref(a))) { li.remove(); removedCount++; return; }
        const trackAd = /bing\.com\/aclick|go\.msn\.com|r\.bing\.com|adservice|microsoftazurewebsites\.net/.test(a.href);
        if (trackAd) { li.remove(); removedCount++; }
      }
    });
  }

  function cleanSo360() {
    removedCount += removeBySelectors([
      '#e_idea_pp', '#right_show_top', '#right_show', '#so_kw-ad',
      '.res-mediav-right', '#res-mediav-right', '#lm-rightbottom',
      'div[data-so-biz-type]', "ul[class*='mh-sdk-sad']", '.open-screen__ad',
      '#__lawnImageContainer', 'li[data-from="ad"]', '.g-ad-card',
    ]);
    $$('.res-list, #res_news_flow li').forEach(li => {
      // 【P2-1】原版直接调 hasAdBadge，绕过了 cfg.badgeText 开关：
      // 用户在面板里关掉「识别广告角标文本」后，360 上仍然照删不误。
      if (cfg.badgeText && hasAdBadge(li)) { li.remove(); removedCount++; return; }
      if (hitKeyword(textOf(li))) { li.remove(); removedCount++; }
    });
  }

  /* ===================================================================== *
   * §7 知乎 / B站 / 豆瓣 / 微博 / CSDN
   * ===================================================================== */
  function cleanZhihu() {
    removedCount += removeBySelectors([
      '.Pc-feedAd', '.Pc-word', '.Banner-adsense', '.MBannerAd', '.MHotFeedAd',
      '.Pc-card',
    ]);
    $$('img[alt="广告"]').forEach(img => {
      removeAdEl(img, '.Card, .ContentItem');
      removedCount++;
    });
    // 【Fix9】确认是登录/注册/App 推广弹窗才点关闭，避免误关其他弹窗（如退出确认）
    const closeBtn = document.querySelector('.Modal-closeButton, .signFlowModal-container ~ .Button');
    if (closeBtn) {
      const modal = closeBtn.closest('.Modal, [class*="Modal"]');
      const t = modal ? (modal.textContent || '') : '';
      // 【P2-2】原判断 `!modal || ...` 逻辑取反：找不到所属弹窗时反而无条件点击关闭，
      // 与「确认是登录/注册弹窗才关闭」的意图相反，可能误关退出确认等无关弹窗。
      if (modal && /登录|注册|扫码|下载App|打开App|立即登录|短信登录|密码登录/i.test(t)) closeBtn.click();
    }
  }

  function cleanBilibili() {
    $$('a[href*="cm.bilibili.com"]').forEach(a => {
      removeAdEl(a, '.bili-video-card, .bili-feed-card, .feed-card, .video-card');
      removedCount++;
    });
  }

  function cleanDouban() {
    $$('div[ad-status="appended"]').forEach(d => { d.remove(); removedCount++; });
  }

  function cleanWeibo() {
    removedCount += removeBySelectors(['div[adcode]', '[data-adcode]']);
  }

  function cleanCSDN() {
    removedCount += removeBySelectors([
      '#recommend-right', '#csdn-plugin-vip', '.blog-detail-ai-container', '.toolbar-advert',
    ]);
  }

  /* ===================================================================== *
   * §7.5 护航模块（0.2.0）
   * ===================================================================== */

  // 【Fix4】下载意图识别重写：
  //  - 强意图词（下载/安装包/官网）：查询中任意位置出现即算
  //  - 弱意图词（官方/电脑版/客户端…）：只有紧跟软件名、位于查询收尾才算（"微信 官方" ✔ / "苹果官方回应…" ✘）
  //  - 资讯类词（回应/事件/新闻…）：命中即排除整个护航
  //  - 只看搜索词本身，不再用 document.title 兜底（误触发重灾区）
  //  - 【Issue2】弱词命中后二次校验前缀确实像"软件名"，杜绝"信用卡官方"/"官方"这类误触发
  const DL_STRONG_WORDS = ['下载', '安装包', '官网'];
  const DL_WEAK_WORDS = ['官方', '官方版', '电脑版', '电脑端', '客户端', 'pc版', 'pc端'];
  const DL_NEWS_RE = /回应|辟谣|声明|通报|公告|道歉|起诉|申诉|被罚|被黑|被曝|崩了|宕机|打不开|无法访问|下架|事件|新闻|爆料|热搜|发布会/;
  // 这些词是通用实体/机构名，不属于"软件名"，弱词前出现它们不算下载意图
  const DL_GENERIC_RE = /信用卡|银行卡|贷款|基金|保险|股票|证券|医院|学校|大学|公司|企业|网站|平台|服务|客服|电话|热线|手机|宽带|流量|套餐|活动|优惠|新闻|政策|规定|标准|通知|报告|数据|地址|账号|邮箱|渠道|品牌|产品|价格|下载站|资源站|官网$/;

  // 【Issue2】弱意图词命中后：弱词之前的 token 必须像"软件名/品牌名"
  function weakWordPrefixedBySoftware(q, w) {
    const prefix = q.slice(0, -w.length).trim();
    if (!prefix) return false;                                   // "官方" / "电脑版" 单独成查询
    const last = prefix.split(/[\s,，、;；:：]+/).pop().trim();    // 取弱词前最后一个 token
    if (!last || last.length < 2) return false;                  // 实体名至少 2 字符
    if (DL_WEAK_WORDS.indexOf(last) >= 0) return false;          // 前邻仍是弱词（"pc端 电脑版"）
    if (/^[这那哪怎么为什么为何是否啥何如何吗呢吧么的了？?！!]+$/.test(last)) return false;
    if (DL_GENERIC_RE.test(last)) return false;                  // 通用名词不算软件名
    return true;
  }

  // 当前搜索词（已解码、小写）；拿不到时返回空串
  function currentQuery() {
    try {
      const m = location.search.match(/[?&](?:wd|word|q|query|kw)=([^&]*)/);
      if (!m || !m[1]) return '';
      let q = m[1];
      try { q = decodeURIComponent(String(q).replace(/\+/g, ' ')); }
      catch (e) { /* 【Fix6b】畸形编码就用原串，不再抛异常 */ }
      return String(q).toLowerCase();
    } catch (e) { return ''; }
  }

  function hasDownloadIntent() {
    const q = currentQuery();
    if (!q) return false;
    if (DL_NEWS_RE.test(q)) return false;
    if (DL_STRONG_WORDS.some(w => q.indexOf(w) >= 0)) return true;
    return DL_WEAK_WORDS.some(w => q.endsWith(w) && weakWordPrefixedBySoftware(q, w));
  }

  function getResultCtx() {
    const host = location.hostname;
    if (host === 'www.baidu.com' || host === 'm.baidu.com') {
      return { list: '#content_left, #results', items: '#content_left > div, #results > div' };
    }
    if (/\.google\./.test(host)) return { list: '#search', items: '#search div[data-hveid]' };
    if (host.indexOf('bing.com') >= 0) return { list: '#b_results', items: '#b_results li.b_algo' };
    if (host.indexOf('so.com') >= 0) return { list: '#main', items: '.res-list' };
    return null;
  }

  // 【Fix11】按顺序尝试容器选择器（解决移动端百度横幅永远不显示的问题）
  function getListEl(ctx) {
    if (!ctx) return null;
    for (const p of ctx.list.split(',')) {
      const el = document.querySelector(p.trim());
      if (el) return el;
    }
    return null;
  }

  // 【Fix3】必应 u 参数解码：剥 a1/a2 版本前缀 → base64url 转 base64 → 补 padding → 校验结果必须是 http(s) 链接
  function decodeBingU(raw) {
    if (!raw) return '';
    let s = String(raw).replace(/^a\d/i, '');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      const bin = atob(s);
      const out = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
      return /^https?:\/\//i.test(out) ? out : '';
    } catch (e) {
      return '';
    }
  }

  // 提取结果的真实链接
  function effectiveHref(a) {
    let href = a && a.href ? a.href : '';
    if (!href) return '';
    const host = location.hostname;
    if (host.indexOf('bing.com') >= 0) {
      // 【Fix5】只解析必应跳转链接（/ck/），防止误解析带 u= 参数的普通链接
      if (!/bing\.com\/ck\//.test(href)) return href;
      const m = href.match(/[?&]u=([A-Za-z0-9_-]+)/);
      if (m) {
        const real = decodeBingU(m[1]);
        if (real) return real;
      }
    } else if (/\.google\./.test(host)) {
      // 【Fix5】只解析谷歌 /url? 跳转，防止误解析自带 q= 参数的普通链接（如"大家还在搜"）
      if (!/\/url\?/.test(href)) return href;
      const m = href.match(/[?&]q=([^&]+)/);
      if (m) {
        try { return decodeURIComponent(m[1]) || href; } catch (e) { return href; }
      }
    } else if (host.indexOf('baidu.com') >= 0 && /baidu\.com\/(link|bh)/.test(href)) {
      // 【Fix7】尊重「解析跳转链接」开关
      if (!cfg.resolveLinks) return href;
      if (linkCache.has(href)) return linkCache.get(href) || href;
      queueResolve(href, () => scheduleRun(150));
      return '';
    }
    return href;
  }

  // 【Fix6】域名级边界匹配：
  //  - 前面不能紧跟字母数字/连字符（防 evil-jd.com 误命中 jd.com）
  //  - 后面不能再接 "." 标签（防 jd.com 误命中 jd.com.cn / foo.com.evil.com）
  //  - 前面是 "." 视为子域，允许（www.jd.com 命中 jd.com）
  function domainHit(hay, dom) {
    if (!hay || !dom) return false;
    const h = String(hay).toLowerCase(), d = String(dom).toLowerCase();
    let i = 0;
    while ((i = h.indexOf(d, i)) >= 0) {
      const pre = h[i - 1], post = h[i + d.length];
      const preBad = !!pre && /[\w\-]/.test(pre);
      const postBad = post === '.' || (!!post && /[\w\-]/.test(post));
      if (!preBad && !postBad) return true;
      i += d.length;
    }
    return false;
  }

  // 品牌名 token 边界：前后不能是 ASCII 字母数字连字符 或 汉字 CJK
  // 例："豆包"在"我爱豆包子"中前后是汉字 → 不算独立 token → 避免误报
  // 【P0-2】原实现 `!c || ...` 把 undefined（串首/串尾）当成「是 token 字符」，
  // 等价于「边界永远不满足」—— nameTokenHit 在任何位置都返回 false，函数从未命中过。
  // 正确语义：越界（undefined）应视为「不是 token 字符」，即允许匹配。
  const CJK_RE = /[\w一-鿿]/;
  const _isTokenChar = (c) => !!c && CJK_RE.test(c);
  function nameTokenHit(hay, name) {
    if (!hay || !name) return false;
    const h = String(hay), n = String(name);
    let i = 0;
    while ((i = h.indexOf(n, i)) >= 0) {
      const pre = h[i - 1], post = h[i + n.length];
      if (!_isTokenChar(pre) && !_isTokenChar(post)) return true;
      i += n.length;
    }
    return false;
  }

  /* --------------------------------------------------------------------- *
   * 【P1-5】从链接里取出纯域名（小写、去端口、去 userinfo、去路径）。
   * 不依赖 new URL()：某些页面/环境下 URL 构造器被站点脚本改写过，
   * 这里用正则保证零依赖且不会因为非法输入抛异常。
   * ------------------------------------------------------------------- */
  function domainOf(href) {
    if (!href) return '';
    let s = String(href).trim();
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;   // 裸域名（来自 c-showurl）
    const m = s.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@\/?#]*@)?([^\/?#:]+)/i);
    return m ? String(m[1]).toLowerCase() : '';
  }

  // 【Issue1】"官方"判定优先以真实域名为准：只有域名命中官网库才算 official。
  // 品牌名不再参与官方判定，只作为域名无证据时的"候选"兜底，防止下载站标题蹭品牌词获得绿标置顶。
  function siteOfficialName(hay) {
    for (const o of cfg.officialSites) {
      if (domainHit(hay, o[0])) return o[1];
    }
    return null;
  }

  /* --------------------------------------------------------------------- *
   * 【P0-2 配套】宽松品牌匹配。
   * nameTokenHit 的严格边界在中文里过于苛刻："微信官方下载" 里 "微信" 后面紧跟
   * "官"（CJK），严格规则判为不命中 —— 而这恰恰是仿冒站最典型的标题写法。
   * 这里补充一条：品牌名位于文本开头（去掉常见前置标点后）同样算命中。
   * "我爱豆包子 / 豆包" 依旧不命中（豆包不在串首）。
   * ------------------------------------------------------------------- */
  function brandLooseHit(hay, name) {
    if (!hay || !name) return false;
    if (nameTokenHit(hay, name)) return true;
    const h = String(hay).replace(/^[\s　「【（《"'`·、,，.。:：]+/, '');
    return h.toLowerCase().indexOf(String(name).toLowerCase()) === 0;
  }

  // 品牌名兜底：百度新版结果卡片可能只展示品牌名、拿不到可解析域名时使用
  function officialNameCandidate(hay) {
    for (const o of cfg.officialSites) {
      if (brandLooseHit(hay, o[1])) return o[1];
    }
    return null;
  }

  function isDownloadSite(hay) {
    return cfg.downloadSites.some(d => domainHit(hay, d));
  }

  // 【P1-6】下载诱导词：域名陌生但结果文案在诱导下载时，判为危险站点。
  // 必须用诱导词做约束，否则「微信 百度百科」这类资讯页也会被误标成下载站。
  const DL_LURE_RE = /下载|安装包|官方版|绿色版|破解|注册机|激活|特别版|最新版|电脑版|客户端|免费版|中文版|setup|\.exe|\.zip|\.rar|\.msi/i;

  /* --------------------------------------------------------------------- *
   * 【P1-4】护航痕迹清理：徽章 / 置灰 / 分类标记 / 顶部横幅。
   * 关闭护航、关闭置顶或警示开关、关闭总开关、命中白名单时都必须调用，
   * 否则上一轮注入的 DOM 会永久留在页面上（原版完全没有清理路径）。
   * ------------------------------------------------------------------- */
  function resetGuardianArtifacts() {
    const safeRemove = (el) => { try { el.remove(); } catch (e) { /* 忽略 */ } };
    try {
      $$('.' + GUARD_BADGE_CLS).forEach(safeRemove);
      const banner = document.getElementById(GUARD_BANNER_ID);
      if (banner) safeRemove(banner);
      $$('[data-cs-guard]').forEach(el => {
        try {
          el.removeAttribute('data-cs-guard');
          el.removeAttribute('data-cs-guard-name');
          if (el.dataset.csGuardDimmed) { el.style.opacity = ''; delete el.dataset.csGuardDimmed; }
        } catch (e) { /* 忽略 */ }
      });
    } catch (e) { /* 忽略 */ }
  }

  function guardBadgeStyle(kind) {
    const base = 'display:inline-block;margin-right:8px;padding:1px 8px;line-height:20px;font-size:12px;border-radius:4px;font-weight:700;vertical-align:middle;';
    if (kind === 'official') return base + 'background:#16a34a;color:#fff;';
    if (kind === 'danger') return base + 'background:#d97706;color:#fff;';
    return base + 'background:#64748b;color:#fff;'; // candidate：灰标"官方?"待核实
  }

  function showGuardBanner(kind, name) {
    const exist = document.querySelector('#cs-guard-banner');
    // 无需提示（kind 为空）或关闭提示条开关时，移除残留横幅，避免跨查询/关开关后仍挂在页面上
    if (!kind || !cfg.guardian.banner) {
      if (exist) exist.remove();
      return;
    }
    if (exist && exist.dataset.kind === kind) return; // 同类提示不重复重绘
    const ctx = getResultCtx();
    const list = getListEl(ctx);
    if (!list) return;
    const banner = exist || document.createElement('div');
    banner.id = 'cs-guard-banner';
    banner.dataset.kind = kind;
    if (kind === 'official') {
      banner.textContent = '净搜护航：已识别并置顶官方站点（' + (name || '官方') + '），请认准绿色「官方」标识 ✔';
      banner.style.cssText = 'margin:0 0 10px;padding:10px 14px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:8px;font-size:13px;';
    } else {
      banner.textContent = '⚠ 净搜护航：本页未识别到可信官网，出现多个非官方下载站结果，下载前请核实站点，谨防捆绑流氓软件';
      banner.style.cssText = 'margin:0 0 10px;padding:10px 14px;background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:8px;font-size:13px;';
    }
    if (!exist) list.insertBefore(banner, list.firstChild);
  }

  // 单条结果的分类判定（纯逻辑，便于回归测试）
  // 【P1-5】域名优先：拿到真实域名时只看域名，正文里提到 "pc6.com" 之类不再劫持判定
  // 【P1-6】域名陌生 + 品牌名 + 下载诱导词 → danger（防仿冒站），无诱导词只降级为 candidate
  function classifyItem(href, text, query) {
    const host = domainOf(href);
    const body = String(text || '').slice(0, 800);
    const q = String(query || '').toLowerCase();
    if (host) {
      if (isDownloadSite(host)) return { kind: 'danger', name: '' };
      const nm = siteOfficialName(host);
      if (nm) {
        // 域名确实是官网，还要确认它与本次搜索的软件相关：
        // 否则搜「微信下载」时，一条 zhihu.com 的结果会因为「知乎」在官网库里
        // 而被判成官方站点并置顶（误伤）。搜索词是最好的相关性证据。
        const related = !q || brandLooseHit(q, nm);
        return related ? { kind: 'official', name: nm } : { kind: 'candidate', name: nm };
      }
      if (isDownloadSite(body)) return { kind: 'danger', name: '' };
      const brand = officialNameCandidate(body);
      if (brand && DL_LURE_RE.test(body)) return { kind: 'danger', name: brand };
      if (brand) return { kind: 'candidate', name: brand };
      return { kind: '', name: '' };
    }
    // 拿不到域名（百度新版卡片 / 跳转链异步解析中）：只用文本兜底，不作官方判定
    if (isDownloadSite(body)) return { kind: 'danger', name: '' };
    const brand2 = officialNameCandidate(body);
    if (brand2 && DL_LURE_RE.test(body)) return { kind: 'danger', name: brand2 };
    if (brand2) return { kind: 'candidate', name: brand2 };
    return { kind: '', name: '' };
  }

  function runGuardian() {
    // 护航关闭 / 白名单 / 非下载意图：清掉全部护航痕迹（横幅 + 徽章 + 置灰 + 标记）
    if (!cfg.enabled || !cfg.guardian.enabled || inWhitelist() || !hasDownloadIntent()) {
      resetGuardianArtifacts();
      return;
    }
    const ctx = getResultCtx();
    if (!ctx) { resetGuardianArtifacts(); return; }
    // 【P1-3】横幅自己是结果容器的直接子 div，会被选择器当成一条搜索结果：
    // 既可能被打上「官方?」灰标，也可能在关键词屏蔽里被误删。这里显式排除脚本自注入节点。
    const items = $$(ctx.items).filter(el => el.id !== GUARD_BANNER_ID);
    if (!items.length) { resetGuardianArtifacts(); return; }

    // ① 分类（official/danger 已定性则跳过；candidate 允许解析出真实域名后升级重判）
    items.forEach(item => {
      // 【P1-7】谷歌的 div[data-hveid] 会层层嵌套，外层已定性时内层不再重复分类/打标
      try {
        const owner = item.closest && item.closest('[data-cs-guard]');
        if (owner && owner !== item) return;
      } catch (e) { /* 忽略 */ }
      if (item.dataset.csGuard === 'official' || item.dataset.csGuard === 'danger') return;
      const a = item.querySelector('h2 a[href], h3 a[href], a[href]');
      let href = effectiveHref(a);
      if (!href && location.hostname.indexOf('baidu.com') >= 0) {
        const cite = item.querySelector('.c-showurl, [class*="c-showurl"], cite, .c-color-gray');
        if (cite) {
          const m = (cite.textContent || '').match(/([a-z0-9-]+\.[a-z0-9.-]+)/i);
          if (m) href = m[1];
        }
      }
      let kind = '', name = '';
      try {
        const r = classifyItem(href, item.textContent, currentQuery());
        kind = r.kind; name = r.name;
      } catch (e) { kind = ''; }
      if (kind) {
        item.dataset.csGuard = kind;
        item.dataset.csGuardName = name || '';
      } else if (item.dataset.csGuard) {
        delete item.dataset.csGuard;
        delete item.dataset.csGuardName;
      }
    });

    // ② 加徽章（官方绿标 / 下载站黄标）
    // 【P1-4】开关关闭时主动清理上一轮残留的徽章与置灰，而不是简单地 return
    items.forEach(item => {
      const kind = item.dataset.csGuard || '';
      const title = (item.querySelector && item.querySelector('h2, h3')) || item;
      const oldBadge = title && title.querySelector ? title.querySelector('.' + GUARD_BADGE_CLS) : null;
      const show = kind === 'danger'
        ? cfg.guardian.warnDownload
        : (kind === 'official' || kind === 'candidate') ? cfg.guardian.pinOfficial : false;

      if (!show) {
        if (oldBadge) { try { oldBadge.remove(); } catch (e) { /* 忽略 */ } }
        if (item.dataset.csGuardDimmed) { item.style.opacity = ''; delete item.dataset.csGuardDimmed; }
        return;
      }
      if (!title || !title.insertBefore) return;
      if (oldBadge) {
        if (oldBadge.dataset.kind === kind) return;
        try { oldBadge.remove(); } catch (e) { /* 忽略 */ }
      }
      let badge = null;
      try { badge = document.createElement('span'); } catch (e) { return; }
      badge.className = GUARD_BADGE_CLS;
      badge.dataset.kind = kind;
      badge.textContent = kind === 'official' ? '官方'
        : (kind === 'danger' ? '⚠ 下载站' : '官方?');
      badge.style.cssText = guardBadgeStyle(kind);
      title.insertBefore(badge, title.firstChild);
      if (kind === 'danger') {
        item.style.opacity = '0.6';
        item.dataset.csGuardDimmed = '1';
      } else if (item.dataset.csGuardDimmed) {
        item.style.opacity = '';
        delete item.dataset.csGuardDimmed;
      }
    });

    /* ------------------------------------------------------------------- *
     * ③ 统计（【P1-1】关键修复）
     * 原实现在「①分类」里统计 officialItem / dangerCount，而已定性的项第二
     * 轮会被跳过 → 计数归零 → ④ 立刻把刚插入的横幅删掉。表现就是横幅闪现
     * 一下就消失，0.2.7 的提示条功能实际上从未稳定显示过。
     * 改为遍历全部结果的最终状态重新统计，结果才与页面上看到的一致。
     * ----------------------------------------------------------------- */
    let officialItem = null, officialName = '', dangerCount = 0;
    items.forEach(item => {
      const k = item.dataset.csGuard;
      if (k === 'danger') { dangerCount++; return; }
      if (k === 'official' && !officialItem) {
        officialItem = item;
        officialName = item.dataset.csGuardName || '';
      }
    });

    // ④ 官网置顶（【P1-2】不要把提示条挤到第二位：锚点跳过横幅本身）
    if (officialItem && cfg.guardian.pinOfficial) {
      const list = getListEl(ctx);
      if (list && list.firstElementChild !== officialItem) {
        let anchor = list.firstElementChild;
        while (anchor && anchor.id === GUARD_BANNER_ID) anchor = anchor.nextElementSibling;
        if (anchor !== officialItem) {
          try { list.insertBefore(officialItem, anchor); } catch (e) { /* 忽略 */ }
        }
      }
    }

    // ⑤ 顶部提示条（official/warn 可互相替换；两者皆无时清掉残留横幅）
    if (officialItem) showGuardBanner('official', officialName);
    else if (dangerCount > 0) showGuardBanner('warn');
    else showGuardBanner(null);
  }

  /* ===================================================================== *
   * §8 调度与监听
   * ===================================================================== */
  let debounceTimer = null;
  let pendingDelay = 0;

  /* 【P2-4】原实现 `if (debounceTimer) return;` 名为防抖、实为「丢弃」：
   * 已排队时任何新请求都被静默吞掉，包括更紧急的（解析完成后的 150ms 重扫）。
   * 改成：已排队时若新请求更快（delay 更小），重置为更小的延时；否则保持现有排队
   * （不会被吞，最慢也会按原计划执行一次）。 */
  function scheduleRun(delay) {
    const d = delay || 250;
    const fire = () => { debounceTimer = null; pendingDelay = 0; runAll(); };
    if (debounceTimer) {
      if (d < pendingDelay) {
        clearTimeout(debounceTimer);
        pendingDelay = d;
        debounceTimer = setTimeout(fire, d);
      }
      return;
    }
    pendingDelay = d;
    debounceTimer = setTimeout(fire, d);
  }

  function dispatch() {
    const host = location.hostname;
    if (host.indexOf('baidu.com') >= 0) {
      if (host === 'www.baidu.com') {
        if (cfg.sites.baidu) {
          if (location.pathname === '/') cleanBaiduHome();
          else if (/^\/(s|sf)\b/.test(location.pathname + location.search) || location.search.indexOf('wd=') >= 0) cleanBaiduPC();
          else if (cfg.sites.baiduSub) cleanBaiduSub();
        }
      } else if (host === 'm.baidu.com') {
        if (cfg.sites.baidu) {
          if (location.search.indexOf('word=') >= 0 || location.search.indexOf('wd=') >= 0 || location.pathname.indexOf('/s') === 0) cleanBaiduMobile();
          else if (cfg.sites.baiduSub) cleanBaiduSub();
        }
      } else if (cfg.sites.baiduSub) {
        cleanBaiduSub();
      }
    }
    if (cfg.sites.google && (host === 'www.google.com' || host === 'www.google.com.hk' || /\.google\./.test(host))) cleanGoogle();
    if (cfg.sites.bing && host.indexOf('bing.com') >= 0) cleanBing();
    if (cfg.sites.so360 && host.indexOf('so.com') >= 0) cleanSo360();
    if (cfg.sites.zhihu && host.indexOf('zhihu.com') >= 0) cleanZhihu();
    if (cfg.sites.bilibili && host.indexOf('bilibili.com') >= 0) cleanBilibili();
    if (cfg.sites.douban && host.indexOf('douban.com') >= 0) cleanDouban();
    if (cfg.sites.weibo && host.indexOf('weibo.com') >= 0) cleanWeibo();
    if (cfg.sites.csdn && host.indexOf('csdn.net') >= 0) cleanCSDN();
  }

  let observer = null;
  let spaTimer = null;   // 【Fix1】SPA 轮询定时器句柄

  function runAll() {
    // 【P1-4】关闭/白名单时同样要撤掉已注入的样式与护航痕迹，否则「关闭」在当前页面不生效
    if (!cfg.enabled || inWhitelist()) {
      syncAdCSS();
      resetGuardianArtifacts();
      return;
    }
    removedCount = 0;
    try { dispatch(); } catch (e) { console.error('[净搜] 运行异常', e); }
    if (removedCount > 0) console.log('[净搜] 本轮移除 ' + removedCount + ' 个广告/推广节点');
    try { runGuardian(); } catch (e) { console.error('[净搜] 护航异常', e); }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => scheduleRun());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // 【Fix1】SPA 路由监听：句柄统一保存，已存在时不重复创建（修复开面板泄漏定时器）
    if (!spaTimer) {
      let lastUrl = location.href;
      spaTimer = setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          scheduleRun(80);
        }
      }, 800);
    }
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    if (spaTimer) { clearInterval(spaTimer); spaTimer = null; }        // 【Fix1】
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; pendingDelay = 0; }
  }

  /* ===================================================================== *
   * §9 内置设置面板（Shadow DOM 隔离站点样式）
   * ===================================================================== */
  const SITE_LABELS = {
    baidu: '百度搜索', baiduSub: '百度系子站', google: '谷歌', bing: '必应',
    so360: '360搜索', zhihu: '知乎', bilibili: 'B站', douban: '豆瓣',
    weibo: '微博', csdn: 'CSDN',
  };
  const FUNC_LABELS = {
    badgeText: '识别「广告」角标文本',
    resolveLinks: '解析百度跳转链接（网址屏蔽依赖）',
    hotList: '去除百度热搜 / 右栏广告块',
  };
  const FILTER_LABELS = { kwFilter: '启用关键词屏蔽', urlFilter: '启用网址屏蔽' };
  const GUARD_LABELS = {
    enabled: '护航总开关',
    pinOfficial: '官网置顶 + 绿色「官方」标',
    warnDownload: '下载站警示（置灰 + 黄标）',
    banner: '页面顶部提示条',
  };

  let panelHost = null;

  function openPanel() {
    if (panelHost) { closePanel(); return; }
    if (!document.body) return;      // 【P2-3 配套】document-end 之前被唤起时不炸
    stopObserver();
    panelHost = document.createElement('div');
    panelHost.id = 'cs-panel-host';
    panelHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    document.body.appendChild(panelHost);
    const root = panelHost.attachShadow({ mode: 'open' });
    root.innerHTML = buildPanelHTML();
    bindPanelEvents(root);
  }

  function closePanel() {
    if (panelHost) { panelHost.remove(); panelHost = null; }
    // 【Issue3】总开关/站点开关被关闭时，立即移除已注入的净化样式，避免"关闭"在当前页面不生效
    syncAdCSS();
    // 【Fix8】只有启用且不在白名单时才重启监听；并立即重扫一次让新配置生效
    if (cfg.enabled && !inWhitelist()) {
      startObserver();
      scheduleRun(80);
    } else {
      // 【P1-4】关闭状态：清掉本轮之前注入的护航徽章/置灰/横幅
      resetGuardianArtifacts();
    }
  }

  function buildPanelHTML() {
    const chk = (key, label, on) => '<label class="chk"><input type="checkbox" data-key="' + key + '"' + (on ? ' checked' : '') + '>' + label + '</label>';
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const sitesChk = Object.keys(SITE_LABELS).map(k => chk('sites.' + k, SITE_LABELS[k], !!cfg.sites[k])).join('');
    const funcChk = Object.keys(FUNC_LABELS).map(k => chk(k, FUNC_LABELS[k], !!cfg[k])).join('');
    const filterChk = Object.keys(FILTER_LABELS).map(k => chk('filters.' + k, FILTER_LABELS[k], !!cfg.filters[k])).join('');
    const guardChk = Object.keys(GUARD_LABELS).map(k => chk('guardian.' + k, GUARD_LABELS[k], !!cfg.guardian[k])).join('');
    const officialText = esc(cfg.officialSites.map(o => o.join(' ')).join('\n'));
    const dlText = esc(cfg.downloadSites.join('\n'));
    // 【Fix8】textarea 内容同样转义，防止配置中的 HTML 片段破坏面板（导入恶意 JSON 的注入面）
    const ta = (key, rows, placeholder) => '<textarea data-key="' + key + '" rows="' + rows + '" placeholder="' + placeholder + '">' + esc((cfg[key] || []).join('\n')) + '</textarea>';

    return `
      <style>
        .mask { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; font-family:"Microsoft YaHei", system-ui, sans-serif; }
        .card { width:620px; max-height:86vh; overflow-y:auto; background:#fff; border-radius:12px; padding:20px 26px; color:#222; box-shadow:0 8px 40px rgba(0,0,0,.3); box-sizing:border-box; }
        h2 { margin:0; font-size:18px; } .ver { color:#999; font-size:12px; font-weight:normal; }
        .sub { color:#888; font-size:12px; margin:4px 0 6px; }
        h3 { font-size:14px; margin:14px 0 8px; padding-bottom:4px; border-bottom:1px solid #eee; }
        .row { display:flex; flex-wrap:wrap; gap:8px 18px; }
        label.chk { display:inline-flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; user-select:none; }
        textarea { width:100%; min-height:60px; box-sizing:border-box; font-size:12px; line-height:1.5; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-family:Consolas, monospace; resize:vertical; }
        .hint { color:#999; font-size:11px; margin-top:2px; }
        .btns { margin-top:18px; display:flex; gap:10px; justify-content:flex-end; align-items:center; }
        button { padding:7px 16px; border-radius:6px; border:1px solid #ddd; background:#f5f5f5; cursor:pointer; font-size:13px; }
        button:hover { background:#eee; }
        button.primary { background:#3b82f6; border-color:#3b82f6; color:#fff; }
        button.primary:hover { background:#2f74e8; }
        button.danger { color:#c0392b; }
        .toast { position:fixed; left:50%; top:16%; transform:translateX(-50%); background:rgba(0,0,0,.78); color:#fff; padding:8px 20px; border-radius:8px; font-size:13px; pointer-events:none; }
      </style>
      <div class="mask" id="cs-mask">
        <div class="card">
          <h2>净搜 CleanSearch <span class="ver">Ver ${SCRIPT_VERSION}</span></h2>
          <div class="sub">作者 VeT_SHIUAN · 无推广无外部依赖 · 配置保存在油猴本地存储</div>
          <h3>总开关</h3>
          <div class="row">${chk('enabled', '启用净搜（关闭后所有站点不工作）', !!cfg.enabled)}</div>
          <h3>站点</h3>
          <div class="row">${sitesChk}</div>
          <h3>功能</h3>
          <div class="row">${funcChk}${filterChk}</div>
          <h3>护航（下载意图搜索时生效）</h3>
          <div class="row">${guardChk}</div>
          <h3>官网库（每行：域名 软件名）</h3>
          <textarea data-key="officialSitesText" rows="4" placeholder="每行一个：域名 软件名（如：weixin.qq.com 微信）">${officialText}</textarea>
          <h3>下载站警示库（每行一个域名，命中即警示）</h3>
          <textarea data-key="downloadSitesText" rows="4" placeholder="每行一个下载站域名片段（如：pc6.com）">${dlText}</textarea>
          <h3>屏蔽关键词</h3>
          ${ta('keywords', 4, '每行一个关键词，结果标题或摘要包含即被屏蔽（如：装修公司）')}
          <h3>屏蔽网址</h3>
          ${ta('urls', 4, '每行一个网址片段，结果链接包含即被屏蔽（如：example.com）')}
          <h3>白名单</h3>
          ${ta('whitelist', 3, '每行一个域名片段，命中的站点上本脚本不工作（如：localhost）')}
          <div class="btns">
            <button class="danger" id="cs-reset">恢复默认</button>
            <button id="cs-export">导出配置</button>
            <button id="cs-import">导入配置</button>
            <input type="file" id="cs-file" accept=".json" style="display:none">
            <span style="flex:1"></span>
            <button id="cs-cancel">取消</button>
            <button class="primary" id="cs-save">保存并关闭</button>
          </div>
        </div>
      </div>`;
  }

  function bindPanelEvents(root) {
    const collect = () => {
      $$('input[type="checkbox"][data-key]', root).forEach(ck => {
        const path = ck.dataset.key.split('.');
        let obj = cfg;
        for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
        obj[path[path.length - 1]] = ck.checked;
      });
      $$('textarea[data-key]', root).forEach(ta => {
        const key = ta.dataset.key;
        if (key === 'officialSitesText' || key === 'downloadSitesText') return;
        const arr = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
        cfg[key] = Array.from(new Set(arr));
      });
      const ofs = root.querySelector('textarea[data-key="officialSitesText"]');
      if (ofs) {
        cfg.officialSites = ofs.value.split('\n')
          .map(line => line.trim().split(/\s+/))
          .filter(a => a[0] && a[0].indexOf('.') > 0)
          .map(a => [a[0], a.slice(1).join(' ') || a[0]]);
      }
      const ds = root.querySelector('textarea[data-key="downloadSitesText"]');
      if (ds) {
        cfg.downloadSites = ds.value.split('\n').map(s => s.trim()).filter(s => s && s.indexOf('.') > 0);
      }
    };

    const toast = (msg) => {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      root.appendChild(t);
      setTimeout(() => t.remove(), 1500);
    };

    root.getElementById('cs-mask').addEventListener('click', e => { if (e.target.id === 'cs-mask') closePanel(); });
    root.getElementById('cs-cancel').addEventListener('click', closePanel);
    root.getElementById('cs-save').addEventListener('click', () => {
      collect();
      saveConfig();
      toast('已保存');
      setTimeout(closePanel, 400);
    });
    root.getElementById('cs-reset').addEventListener('click', () => {
      cfg = clone(DEFAULT_CONFIG);
      GM_deleteValue(CONFIG_KEY);
      saveConfig();
      toast('已恢复默认');
      root.innerHTML = buildPanelHTML();
      bindPanelEvents(root);
    });
    root.getElementById('cs-export').addEventListener('click', () => {
      collect();
      try {
        const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'cleansearch-config.json';
        a.style.display = 'none';
        root.appendChild(a);                       // 【P2-6】部分浏览器要求 a 在文档里才会触发下载
        a.click();
        // 【P2-6】立刻 revoke 会让下载被取消，延后一帧释放
        setTimeout(() => {
          try { URL.revokeObjectURL(a.href); } catch (e) { /* 忽略 */ }
          try { a.remove(); } catch (e) { /* 忽略 */ }
        }, 0);
      } catch (e) { toast('导出失败：' + (e && e.message ? e.message : e)); }
    });
    root.getElementById('cs-import').addEventListener('click', () => root.getElementById('cs-file').click());
    root.getElementById('cs-file').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          // 【P2-5】导入来源不可信，必须走配置净化，否则类型错误会导致大面积误杀
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad shape');
          cfg = normalizeConfig(data);
          saveConfig();
          toast('导入成功');
          root.innerHTML = buildPanelHTML();
          bindPanelEvents(root);
        } catch (err) {
          toast('导入失败：不是有效的配置文件');
        }
      };
      reader.readAsText(file);
    });
  }

  /* ===================================================================== *
   * 启动
   * ===================================================================== */
  GM_registerMenuCommand('⚙ 净搜 · 设置', openPanel);
  GM_registerMenuCommand('▶ 立即重新净化', () => { runAll(); scheduleRun(600); });

  try {
    const api = {
      version: SCRIPT_VERSION,
      openPanel: openPanel,
      runAll: runAll,
      runGuardian: runGuardian,
      cfg: () => cfg,
      probe: {
        hasDownloadIntent: hasDownloadIntent,
        currentQuery: currentQuery,
        getResultCtx: getResultCtx,
        siteOfficialName: siteOfficialName,
        officialNameCandidate: officialNameCandidate,
        // 【P0-3】回归测试套件引用的 4 个 API 此前一个都没暴露，测试在 D 段即崩溃
        brandNameHit: officialNameCandidate,
        nameTokenHit: nameTokenHit,
        brandLooseHit: brandLooseHit,
        parseRealUrl: parseRealUrl,
        refreshAdStyleState: syncAdCSS,
        isDownloadSite: isDownloadSite,
        effectiveHref: effectiveHref,
        decodeBingU: decodeBingU,
        domainHit: domainHit,
        domainOf: domainOf,
        classifyItem: classifyItem,
        normalizeConfig: normalizeConfig,
        resetGuardianArtifacts: resetGuardianArtifacts,
      },
    };
    if (typeof unsafeWindow !== 'undefined') unsafeWindow.__CleanSearch = api;
    window.__CleanSearch = api;
  } catch (e) { /* 忽略 */ }

  function boot() {
    migrateOldConfig();
    if (cfg.enabled && !inWhitelist()) {
      runAll();
      startObserver();
    }
    if (typeof console !== 'undefined') {
      console.log('[净搜 CleanSearch] Ver ' + SCRIPT_VERSION + ' 已加载（菜单栏可打开设置）');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
