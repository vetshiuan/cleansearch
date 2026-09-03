// ==UserScript==
// @name         净搜 CleanSearch
// @author       VeT_SHIUAN
// @namespace    https://github.com/vetshiuan/cleansearch
// @version      0.2.2
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
// @connect      baidu.com
// @run-at       document-end
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* =====================================================================
   * 净搜 CleanSearch Ver 0.2.2  |  作者：VeT_SHIUAN  |  License: MIT
   *
   * 本脚本为完全重写版，不含任何第三方推广、跳转或外部脚本依赖。
   *
   * 结构索引：
   *   §1 配置与存储          §2 旧脚本数据迁移
   *   §3 通用工具            §4 通用广告判定器
   *   §5 百度（PC/移动/子站） §6 谷歌 / 必应 / 360
   *   §7 知乎 / B站 / 豆瓣 / 微博 / CSDN
   *   §8 调度与监听          §9 内置设置面板
   *
   * 广告识别优先级（误杀率从低到高）：
   *   1. 结构化属性  data-tuiguang / data-module="ad" / data-placeid / cmatchid
   *   2. 广告专用类名  .ec-tuiguang .cos-pc-ad-container 等
   *   3. 角标文本  叶子节点的文本恰好是「广告/推广/商业推广/Sponsored」
   *   4. 用户自定义  关键词（标题+摘要）/ 网址（域名片段）
   * ===================================================================== */

  const SCRIPT_VERSION = "0.2.2";
  const CONFIG_KEY = 'cs_config';
  const MIGRATED_KEY = 'cs_migrated_v0';

  /* =====================================================================
   * §1 配置与存储
   * ===================================================================== */

  const DEFAULT_CONFIG = {
    enabled: true,          // 总开关
    badgeText: true,        // 角标文本识别（「广告」等叶子节点）
    resolveLinks: true,     // 解析百度跳转链接（网址屏蔽依赖此功能）
    hotList: true,          // 去除百度热搜/右栏广告块
    sites: {                // 各站点开关
      baidu: true,          // 百度搜索（PC + 移动）
      baiduSub: true,       // 百度系子站（贴吧/文库/百科/知道等）
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
      kwFilter: true,       // 自定义关键词屏蔽
      urlFilter: true,      // 自定义网址屏蔽
    },
    keywords: [],           // 屏蔽关键词（标题或摘要包含即删）
    urls: [],               // 屏蔽网址（链接包含即删，填域名片段）
    whitelist: [],          // 白名单（当前页地址包含其中之一时本脚本不工作）
    /* ---- 0.2.0 护航模块：官网置顶 / 下载站警示 ---- */
    guardian: {
      enabled: true,        // 护航总开关
      pinOfficial: true,    // 官网结果置顶 + 绿色「官方」徽章
      warnDownload: true,   // 下载站结果置灰 + 黄色警示徽章
      banner: true,         // 页面顶部提示条（找到官网提示置顶 / 未找到则警示慎下）
    },
    officialSites: [        // 官网库：[域名片段, 软件名]（命中 href 含该域名即官方）
      ['weixin.qq.com', '微信'], ['im.qq.com', 'QQ'], ['work.weixin.qq.com', '企业微信'],
      ['docs.qq.com', '腾讯文档'], ['meeting.tencent.com', '腾讯会议'],
      ['dingtalk.com', '钉钉'], ['feishu.cn', '飞书'], ['wps.cn', 'WPS Office'],
      ['kdocs.cn', '金山文档'], ['alipay.com', '支付宝'], ['taobao.com', '淘宝'],
      ['tmall.com', '天猫'], ['jd.com', '京东'], ['pinduoduo.com', '拼多多'],
      ['douyin.com', '抖音'], ['kuaishou.com', '快手'], ['xiaohongshu.com', '小红书'],
      ['iqiyi.com', '爱奇艺'], ['v.qq.com', '腾讯视频'], ['youku.com', '优酷'],
      ['music.163.com', '网易云音乐'], ['y.qq.com', 'QQ音乐'], ['kugou.com', '酷狗'],
      ['kuwo.cn', '酷我'], ['bilibili.com', '哔哩哔哩'], ['ximalaya.com', '喜马拉雅'],
      ['keep.com', 'Keep'], ['weibo.com', '微博'], ['zhihu.com', '知乎'],
      ['csdn.net', 'CSDN'], ['github.com', 'GitHub'], ['gitee.com', 'Gitee'],
      ['pan.baidu.com', '百度网盘'], ['xunlei.com', '迅雷'],
      ['google.cn/chrome', '谷歌浏览器'], ['microsoftedge.microsoft.com', 'Edge浏览器'],
      ['mozilla.org', 'Firefox浏览器'], ['se.360.cn', '360安全浏览器'],
      ['360.cn', '360安全卫士'], ['huorong.cn', '火绒安全'], ['pc.qq.com', '腾讯电脑管家'],
      ['duba.net', '金山毒霸'], ['ludashi.com', '鲁大师'], ['drivergenius.com', '驱动精灵'],
      ['160.com', '驱动人生'], ['cpuid.com', 'CPU-Z'], ['techpowerup.com', 'GPU-Z'],
      ['rarlab.com', 'WinRAR'], ['7-zip.org', '7-Zip'], ['bandisoft.com', 'Bandizip'],
      ['notepad-plus-plus.org', 'Notepad++'], ['code.visualstudio.com', 'VS Code'],
      ['obsproject.com', 'OBS Studio'], ['videolan.org', 'VLC'],
      ['potplayer.daum.net', 'PotPlayer'], ['sunlogin.com', '向日葵远程'],
      ['todesk.com', 'ToDesk'], ['teamviewer.com', 'TeamViewer'], ['anydesk.com', 'AnyDesk'],
      ['ldmnq.com', '雷电模拟器'], ['mumu.163.com', 'MuMu模拟器'], ['yeshen.com', '夜神模拟器'],
      ['bluestacks.com', '蓝叠模拟器'], ['yuque.com', '语雀'], ['weread.qq.com', '微信读书'],
      ['shurufa.baidu.com', '百度输入法'], ['pinyin.sogou.com', '搜狗输入法'],
      ['capcut.cn', '剪映'], ['ulikecam.com', '剪映专业版'], ['pcfreetime.com', '格式工厂'],
      ['obsproject.com', 'OBS'], ['aliyun.com', '阿里云'], ['cloud.tencent.com', '腾讯云'],
      ['youzhiyun.com', '优志愿'], ['qidian.com', '起点中文网'], ['fanqienovel.com', '番茄小说'],
      ['doubao.com', '豆包'], ['kimi.moonshot.cn', 'Kimi'], ['tongyi.aliyun.com', '通义千问'], ['deepseek.com', 'DeepSeek'],
    ],
    downloadSites: [        // 下载站警示库：知名聚合下载站域名片段（命中即警示）
      'pc6.com', 'onlinedown.net', 'downxia.com', 'duote.com', 'cr173.com',
      'xiazaiba.com', 'yxdown.com', 'uzzf.com', 'downcc.com', 'skycn.com',
      'software.com.cn', 'dl.pconline.com.cn', 'xiazai.zol.com.cn', 'winwin7.com',
      'winwin10.com', 'xp510.com', '2265.com', '2345.com', 'mydrivers.com',
      'ali213.net', '3dmgame.com', 'gamersky.com', 'youxia.com', 'pchome.net',
      'downxia.com', 'woaidownload.com', 'pk38.com', '8510.com', 'down55.com',
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

  function loadConfig() {
    let saved = null;
    try { saved = GM_getValue(CONFIG_KEY); } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') {
      return deepMerge(clone(DEFAULT_CONFIG), saved);
    }
    return clone(DEFAULT_CONFIG);
  }

  let cfg = loadConfig();
  function saveConfig() {
    try { GM_setValue(CONFIG_KEY, cfg); } catch (e) { console.error('[净搜] 保存配置失败', e); }
  }

  /* =====================================================================
   * §2 旧脚本数据迁移
   * 把旧脚本（v4.805）存储里的屏蔽关键词/网址/白名单搬过来，只执行一次
   * ===================================================================== */

  function migrateOldConfig() {
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
  }

  /* =====================================================================
   * §3 通用工具
   * ===================================================================== */

  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function textOf(el) { return (el && el.textContent || '').trim(); }
  function isLeaf(el) { return el.children.length === 0; }

  // 白名单命中：当前页地址包含白名单任一片段 → 不工作
  function inWhitelist() {
    if (!cfg.whitelist.length) return false;
    const cur = location.hostname + location.pathname;
    return cfg.whitelist.some(s => s && cur.indexOf(s) >= 0);
  }

  // 删除某节点并向上寻找最近的结果级容器（防止只删掉角标小标签）
  function removeAdEl(el, containerSel) {
    const box = containerSel ? el.closest(containerSel) : null;
    (box || el).remove();
  }

  // 批量按选择器删除（选择器失效时静默 no-op，不会伤页面）
  function removeBySelectors(list) {
    let n = 0;
    for (const s of list) {
      let nodes = null;
      try { nodes = $$(s); } catch (e) { continue; } // 非法选择器跳过
      for (const el of nodes) { el.remove(); n++; }
    }
    return n;
  }

  let removedCount = 0; // 单轮统计

  /* =====================================================================
   * §4 通用广告判定器
   * ===================================================================== */

  // 百度/360 等站点的广告结构化标记（调研交叉印证，2026 可用度高）
  const AD_ATTR_SEL = [
    '[data-tuiguang]',
    '[data-module="ad"]',
    '[data-placeid]',
    '[cmatchid]',
  ].join(',');

  // 百度商业广告容器类名（含历史类名，失效即 no-op）
  const AD_CLASS_SEL = [
    '.ec-tuiguang', '.ecfc-tuiguang', '.ec_ad_results', '.ecom-result',
    '.ec_wise_ad', '.ec-ad', '.ec-ad-container', '[class*="EC_result"]',
    '.cos-pc-ad-container', '.c-result-ad', '.tuiguang',
  ].join(',');

  // 角标文本（新版角标常为「图标 + 文字」混排，兼容：剥离装饰后精确匹配）
  const BADGE_TEXTS = ['广告', '商业推广', '推广', 'Sponsored', '赞助商广告', '赞助商链接', 'Ad', 'AD'];

  /**
   * 判断元素是否为「广告角标」。
   * 放宽了纯叶子节点的限制：新版百度/Bing 的角标常包含 svg/图标 子元素
   * （如 Bing「地球图标 + 广告」）。做法：克隆节点、剥掉装饰元素、
   * 再比对剥完后的纯文本是否精确等于角标词。
   * 安全约束：元素必须是短文本（<=12 字）、不含正文链接，避免误杀摘要。
   */
  function badgeTextPure(el) {
    let text = el.textContent || '';
    if (!text) return '';
    const clone = el.cloneNode(true);
    const deco = clone.querySelectorAll('svg, img, i, em, b, u, s, video, canvas');
    for (const d of deco) d.remove();
    return (clone.textContent || '').replace(/\s+/g, '').trim();
  }

  function hasAdBadge(el) {
    const scope = el.querySelectorAll('span, i, em, cite, div, strong, a');
    for (const b of scope) {
      // 角标允许是 a 链接（百度新版角标即 <a>广告</a>），靠下面的文本长度约束防误杀
      if (b.querySelector('h2, h3, p, article')) continue;          // 正文块跳过
      if (b.tagName === 'A' && (b.parentElement && b.parentElement.matches('h2,h3'))) continue; // 标题链接跳过
      const t = (b.textContent || '').trim();
      if (t.length > 14) continue;                                  // 长文本不可能是角标
      if (t.length < 2) continue;
      const pure = badgeTextPure(b);
      if (!pure || pure.length > 8) continue;                       // 剥完仍很长 = 摘要碎片
      if (BADGE_TEXTS.indexOf(pure) >= 0) return b;
    }
    return null;
  }

  // CSS 伪元素角标检测：部分站点用 ::before/::after 的 content 渲染「广告」二字，
  // DOM 里没有文本节点，只能查计算样式。按「容器自身 + 首尾直接子元素」低成本抽查。
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

  /**
   * 判定一个结果容器是否为广告
   * @returns {null|'attr'|'class'|'badge'} 命中类型
   */
  function hitAdMarker(el) {
    if (el.matches(AD_ATTR_SEL) || el.querySelector(AD_ATTR_SEL)) return 'attr';
    if (el.matches(AD_CLASS_SEL) || el.querySelector(AD_CLASS_SEL)) return 'class';
    if (cfg.badgeText && (hasAdBadge(el) || hasPseudoBadge(el))) return 'badge';
    return null;
  }

  // 自定义关键词：标题或摘要包含即命中
  function hitKeyword(text) {
    if (!cfg.filters.kwFilter || !cfg.keywords.length) return false;
    return cfg.keywords.some(k => text.indexOf(k) >= 0);
  }

  // 自定义网址：链接包含片段即命中
  function hitUrl(url) {
    if (!cfg.filters.urlFilter || !cfg.urls.length || !url) return false;
    return cfg.urls.some(u => url.indexOf(u) >= 0);
  }

  /* ---------------------------------------------------------------------
   * 百度跳转链接解析（限并发 + 缓存）
   * 百度搜索结果的 href 形如 https://www.baidu.com/link?url=...，
   * 需要解析出真实网址才能做网址屏蔽。缓存整个会话有效。
   * ------------------------------------------------------------------- */

  const linkCache = new Map();   // href -> 真实网址（解析失败为 ''）
  const resolveQueue = [];       // 待解析任务 [href, callback]
  let activeResolve = 0;
  const MAX_CONCURRENT = 4;

  function parseRealUrl(html) {
    if (!html) return '';
    // 百度跳转中转页格式：window.location.replace("URL='http://...'")
    const m = html.match(/URL='([^']+)'/i);
    return m ? m[1] : '';
  }

  function queueResolve(href, cb) {
    if (!href) return cb('');
    if (linkCache.has(href)) return cb(linkCache.get(href));
    resolveQueue.push([href, cb]);
    pumpResolve();
  }

  function pumpResolve() {
    while (activeResolve < MAX_CONCURRENT && resolveQueue.length) {
      const [href, cb] = resolveQueue.shift();
      // 队列里可能重复出现同一 href
      if (linkCache.has(href)) { cb(linkCache.get(href)); continue; }
      activeResolve++;
      GM_xmlhttpRequest({
        method: 'GET',
        url: href,
        timeout: 4000,
        onload: (res) => {
          const real = parseRealUrl(res.responseText);
          linkCache.set(href, real);
          activeResolve--; cb(real); pumpResolve();
        },
        onerror: () => { linkCache.set(href, ''); activeResolve--; cb(''); pumpResolve(); },
        ontimeout: () => { linkCache.set(href, ''); activeResolve--; cb(''); pumpResolve(); },
      });
    }
  }

  /* =====================================================================
   * §5 百度
   * ===================================================================== */

  let adCssInjected = false;
  // 注入补充 CSS 隐藏（借鉴 AC-baidu v27.20 现行方案）：
  // 把带 cmatchid / 老式广告 id 的块移出视口，即使 JS 删除被页面重渲染覆盖也有兜底
  function ensureAdCSS() {
    if (adCssInjected) return;
    adCssInjected = true;
    try {
      const st = document.createElement('style');
      st.id = 'cs-adblock-style';
      st.textContent =
        '#bottomads{display:none!important;}' +
        '#content_left>div:not([id])>div[cmatchid],#content_left>div[id*="300"]:not([class*="result"]){position:absolute!important;top:-6666px!important;}' +
        '#content_right td>div:not([id]),#content_right>br{display:none!important;}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { /* 忽略 */ }
  }

  // PC 搜索结果页
  function cleanBaiduPC() {
    ensureAdCSS(); // 注入 css 隐藏（与删除互补，AJAX 重渲染的广告也会被挡住）

    // 顶部横幅/品牌广告等整块容器（含历史选择器，失效即 no-op）
    removedCount += removeBySelectors([
      '[cmatchid]',
      '#top-ad',
      '.res_top_banner',
      '.ec-pc_mat_c_banner__cc_banner_background_b',
      '#bottomads',
    ]);

    // 顶部「为您推荐」推广流（AC-baidu v27.20 现行规则，class 含 _rs）
    removedCount += removeBySelectors(['#content_left div[class*="_rs"]']);

    // 结果级判定：兼容多种容器结构（老版 #content_left > div / 新版 data-srcid 等）
    const seen = new Set();
    const items = $$('#content_left > div, #content_left [data-srcid], #content_left > .result, .cos-row');
    items.forEach(item => {
      if (seen.has(item)) return;
      seen.add(item);
      // 1) 结构化标记 / 类名 / 角标
      const marker = hitAdMarker(item);
      if (marker) { item.remove(); removedCount++; return; }

      // 2) 自定义关键词（标题 + 摘要整体文本）
      if (hitKeyword(textOf(item))) { item.remove(); removedCount++; return; }

      // 3) 自定义网址（百度跳转链接需先解析）
      const a = item.querySelector('h3 a[href]') || item.querySelector('a[href]');
      if (a && cfg.filters.urlFilter && cfg.urls.length) {
        const href = a.href || '';
        if (hitUrl(href)) { item.remove(); removedCount++; return; }
        if (cfg.resolveLinks && /baidu\.com\/(link|bh)/.test(href)) {
          // 异步解析真实网址后再判定
          queueResolve(href, real => {
            if (real && hitUrl(real)) { item.remove(); removedCount++; }
          });
        }
      }
    });

    // 热搜/右栏：hotList 开=更彻底地清理；关=只删广告块，保留相关搜索等正常栏目
    if (cfg.hotList) {
      removedCount += removeBySelectors(['#s-hotsearch-wrapper', '.hot-news-wrapper', '#con-ar', '#content_right > br']);
      // 右侧栏裸 div（无 id）与「广告」开头的块，跟随 AC-baidu 现行规则
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

  // 移动端搜索 m.baidu.com
  function cleanBaiduMobile() {
    removedCount += removeBySelectors([
      '.ec_wise_ad', '.ec_youxuan_card', '.page-banner',
      '.ec-result-inner', '[data-module="b"]', '.na-like-container',
    ]);
    // 容器候选：不同版本百度移动端结构不同，逐个尝试（互不冲突）
    const containers = $$('#results > div, #content_left > div, div.c-result');
    containers.forEach(item => {
      if (hitAdMarker(item)) { item.remove(); removedCount++; return; }
      if (hitKeyword(textOf(item))) { item.remove(); removedCount++; }
    });
  }

  // 百度首页（www.baidu.com）：热搜卡片
  function cleanBaiduHome() {
    if (cfg.hotList) {
      removedCount += removeBySelectors(['#s-hotsearch-wrapper', '.hot-news-wrapper']);
    }
  }

  // 百度系子站：贴吧/文库/百科/知道/经验/图片/视频等
  // 说明：子站 DOM 三年来变动大，此处保留「高价值经典选择器 + 结构化属性」，
  //       失效即 no-op；后续可在 SITE_SELECTORS 中按实测补充。
  function cleanBaiduSub() {
    removedCount += removeBySelectors([
      // 贴吧
      "[id*='mediago-tb-']", '.fengchao-wrap', '.fengchao-wrap-box', 'div[ad-dom-img]',
      '#aside-ad-wrapper', '#branding_ads', '.bus-top-activity-wrap',
      // 文库
      '.ad-box', '.banner-ad', '.union-ad-bottom', '.wgt-ads', '#ggbtm',
      '.vip-card', '.zsj-topbar', '.zsj-toppos', '#banurl', '.lastcell-dialog',
      // 百科
      '.lemmaWgt-promotion-vbaike', '.lemmaWgt-promotion-slide', '#side_box_unionAd',
      '.topA', '.right-ad', '.configModuleBanner', '#navbarAdNew', '.userbar_mall',
      // 知道
      '.wgt-iknow-special-business', '.shop-entrance', '.activity-entry', '.bannerdown',
      '.aside.fixheight', '#wgt-ecom-banner', '#wgt-ecom-right',
      // 通用（各子站）
      '[data-placeid]', '.ec-ad', '.ec-tuiguang',
    ]);
  }

  /* =====================================================================
   * §6 谷歌 / 必应 / 360
   * ===================================================================== */

  function cleanGoogle() {
    // 历史广告单元容器 + aria-label 标记（后者为 AC-baidu v27.20 现行规则）
    removedCount += removeBySelectors([
      '#tads', '#tadsb', '#bottomads',
      'div[aria-label="广告"]', 'div[aria-label="Ads"]', 'div[aria-label="Sponsored"]',
    ]);

    if (!cfg.badgeText) return;
    // Sponsored 文本法：Google 各语言的广告角标（叶子节点精确文本）
    // 删除时向上找到最近的结果块（data-hveid 是 Google 结果块的通用标记）
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
    // 独立广告块（调研确认 .b_ad 仍是主力容器）+ 新版 ad_fls 容器
    removedCount += removeBySelectors(['li.b_ad', 'div.b_ad', '.b_ad_bottom', '#b_context .b_ad', 'li:has(div.ad_fls)']);

    // 混在自然结果里的广告（b_algo 是正常容器，必须先判定再删）
    $$('li.b_algo').forEach(li => {
      const slug = li.querySelector('.b_adSlug, [class*="adSlug"], [class*="acf-badge"]');
      if (slug) { li.remove(); removedCount++; return; }
      if (cfg.badgeText && hitAdMarker(li)) { li.remove(); removedCount++; return; }
      if (hitKeyword(textOf(li))) { li.remove(); removedCount++; }
      // 网址过滤（Bing 无跳转中转，href 即真实网址）
      const a = li.querySelector('h2 a[href]');
      if (a && hitUrl(a.href)) { li.remove(); removedCount++; return; }
      // Bing 广告追踪跳转特征：aclick / go.msn.com / r.bing.com / adservice
      // 自然结果不经过这些中转，命中即可判广告
      const trackAd = a && /bing\.com\/aclick|go\.msn\.com|r\.bing\.com|adservice|microsoftazurewebsites\.net/.test(a.href);
      if (trackAd) { li.remove(); removedCount++; }
    });
  }

  // 360 搜索：选择器未实机核实（调研标注低可信），保守策略 + 角标判定
  function cleanSo360() {
    removedCount += removeBySelectors([
      '#e_idea_pp', '#right_show_top', '#right_show', '#so_kw-ad',
      '.res-mediav-right', '#res-mediav-right', '#lm-rightbottom',
      'div[data-so-biz-type]', "ul[class*='mh-sdk-sad']", '.open-screen__ad',
      '#__lawnImageContainer', 'li[data-from="ad"]', '.g-ad-card',
    ]);
    // 结果条目角标判定（res-list 为 360 结果容器，只判定不盲删）
    $$('.res-list, #res_news_flow li').forEach(li => {
      if (hasAdBadge(li)) { li.remove(); removedCount++; return; }
      if (hitKeyword(textOf(li))) { li.remove(); removedCount++; }
    });
  }

  /* =====================================================================
   * §7 知乎 / B站 / 豆瓣 / 微博 / CSDN
   * ===================================================================== */

  function cleanZhihu() {
    removedCount += removeBySelectors([
      '.Pc-feedAd', '.Pc-word', '.Banner-adsense',
      '.MBannerAd', '.MHotFeedAd',
      // 动态 class 易变，以下为历史选择器（no-op 安全）
      '.Pc-card',
    ]);
    // 角标图片广告（img alt="广告"）
    $$('img[alt="广告"]').forEach(img => {
      removeAdEl(img, '.Card, .ContentItem');
      removedCount++;
    });
    // 强制登录弹窗：点关闭按钮（class 可能变，多写几个候选）
    const closeBtn = document.querySelector('.Modal-closeButton, .signFlowModal-container ~ .Button');
    if (closeBtn) closeBtn.click();
  }

  function cleanBilibili() {
    // cm.bilibili.com 是 B 站联盟广告专用跳转域名
    $$('a[href*="cm.bilibili.com"]').forEach(a => {
      removeAdEl(a, '.bili-video-card, .bili-feed-card, .feed-card, .video-card');
      removedCount++;
    });
  }

  function cleanDouban() {
    // 豆瓣动态插入的广告标记（历史可靠，失效即 no-op）
    $$('div[ad-status="appended"]').forEach(d => { d.remove(); removedCount++; });
  }

  // 微博：广告卡片选择器调研未核实（待实测补充），先做保守处理
  function cleanWeibo() {
    removedCount += removeBySelectors(['div[adcode]', '[data-adcode]']);
  }

  function cleanCSDN() {
    // 选择器来自 uBlock 规则（2026-06，中高可信）
    removedCount += removeBySelectors([
      '#recommend-right', '#csdn-plugin-vip', '.blog-detail-ai-container', '.toolbar-advert',
    ]);
  }

  /* =====================================================================
   * §7.5 护航模块（0.2.0）
   * 面向小白用户：在「下载意图」搜索结果里识别并置顶官网（绿标），
   * 对知名聚合下载站打警示（置灰+黄标），防被流氓软件捆绑坑害。
   * ===================================================================== */

  const DOWNLOAD_INTENT_WORDS = ['官网', '官方', '官方下载', '官方app', 'app下载', '下载',
    '软件下载', '电脑版', '电脑端', '客户端', 'pc版', 'pc端', '下载中心', '下载站'];

  // 当前搜索词/页面标题是否含下载意图
  function hasDownloadIntent() {
    const m = location.search.match(/[?&](?:wd|word|q|query|kw)=([^&]+)/);
    const q = m ? decodeURIComponent(m[1]) : '';
    const text = q + ' ' + document.title;
    return DOWNLOAD_INTENT_WORDS.some(w => text.indexOf(w) >= 0);
  }

  // 各引擎结果容器
  function getResultCtx() {
    const host = location.hostname;
    if (host === 'www.baidu.com' || host === 'm.baidu.com') return { list: '#content_left, #results', items: '#content_left > div, #results > div' };
    if (/\.google\./.test(host)) return { list: '#search', items: '#search div[data-hveid]' };
    if (host.indexOf('bing.com') >= 0) return { list: '#b_results', items: '#b_results li.b_algo' };
    if (host.indexOf('so.com') >= 0) return { list: '#main', items: '.res-list' };
    return null;
  }

  function siteOfficialName(href) {
    for (const o of cfg.officialSites) {
      if (href && href.indexOf(o[0]) >= 0) return o[1];
    }
    return null;
  }

  function isDownloadSite(href) {
    return cfg.downloadSites.some(d => href && href.indexOf(d) >= 0);
  }

  /**
   * 提取结果的真实链接（部分引擎用跳转链包住真实 URL）：
   * - 必应 bing.com/ck/a?  → u 参数为 base64url(真实地址)
   * - 谷歌 google.com/url? → q 参数明文
   * - 百度 baidu.com/link? → 读已解析缓存，未解析则入队并安排重扫
   */
  function effectiveHref(a) {
    let href = a && a.href ? a.href : '';
    if (!href) return '';
    const host = location.hostname;
    if (host.indexOf('bing.com') >= 0) {
      const m = href.match(/[?&]u=a1([A-Za-z0-9_-]+)/);
      if (m) {
        try {
          const b = atob('a1' + m[1].replace(/-/g, '+').replace(/_/g, '/'));
          return new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))) || href;
        } catch (e) { /* 解码失败回落原链接 */ }
      }
    } else if (/\.google\./.test(host)) {
      const m = href.match(/[?&]q=([^&]+)/);
      if (m) { try { return decodeURIComponent(m[1]) || href; } catch (e) {} }
    } else if (host.indexOf('baidu.com') >= 0 && /baidu\.com\/(link|bh)/.test(href)) {
      if (linkCache.has(href)) return linkCache.get(href) || href;
      queueResolve(href, () => scheduleRun(150)); // 异步解析完成后自动重扫护航
      return '';
    }
    return href;
  }

  function guardBadgeStyle(kind) {
    return 'display:inline-block;margin-right:8px;padding:1px 8px;line-height:20px;font-size:12px;border-radius:4px;' +
      (kind === 'official'
        ? 'background:#16a34a;color:#fff;font-weight:700;vertical-align:middle;'
        : 'background:#d97706;color:#fff;font-weight:700;vertical-align:middle;');
  }

  function showGuardBanner(kind, name) {
    if (!cfg.guardian.banner || document.querySelector('#cs-guard-banner')) return;
    const ctx = getResultCtx();
    const list = ctx && document.querySelector(ctx.list.split(',')[0]);
    if (!list) return;
    const banner = document.createElement('div');
    banner.id = 'cs-guard-banner';
    if (kind === 'official') {
      banner.textContent = '净搜护航：已识别并置顶官方站点（' + (name || '官方') + '），请认准绿色「官方」标识 ✔';
      banner.style.cssText = 'margin:0 0 10px;padding:10px 14px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:8px;font-size:13px;';
    } else {
      banner.textContent = '⚠ 净搜护航：本页未识别到可信官网，出现多个非官方下载站结果，下载前请核实站点，谨防捆绑流氓软件';
      banner.style.cssText = 'margin:0 0 10px;padding:10px 14px;background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:8px;font-size:13px;';
    }
    list.insertBefore(banner, list.firstChild);
  }

  function runGuardian() {
    if (!cfg.guardian.enabled || inWhitelist()) return;
    if (!hasDownloadIntent()) return;
    const ctx = getResultCtx();
    if (!ctx) return;
    const items = $$(ctx.items);
    if (!items.length) return;

    let officialItem = null, officialName = '', dangerCount = 0;

    // ① 分类（已处理过的跳过，保证幂等）
    items.forEach(item => {
      if (item.dataset.csGuard) return;
      const a = item.querySelector('h2 a[href], h3 a[href], a[href]');
      let href = effectiveHref(a);
      // 百度结果 fallback：.c-showurl 直接显示真实域名，无需异步解析
      if (!href && location.hostname.indexOf('baidu.com') >= 0) {
        const cite = item.querySelector('.c-showurl, [class*="c-showurl"], cite, .c-color-gray');
        if (cite) {
          const m = (cite.textContent || '').match(/([a-z0-9-]+\.[a-z0-9.-]+)/i);
          if (m) href = m[1];
        }
      }
      if (!href) return;   // 必应 ck/a 或谷歌 /url 待用户重试
      const name = siteOfficialName(href);
      if (name) {
        item.dataset.csGuard = 'official';
        if (!officialItem) { officialItem = item; officialName = name; }
      } else if (isDownloadSite(href)) {
        item.dataset.csGuard = 'danger';
        dangerCount++;
      }
    });

    // ② 加徽章（官方绿标 / 下载站黄标）
    const flag = (cfg.guardian.pinOfficial || cfg.guardian.warnDownload);
    if (flag) {
      items.forEach(item => {
        const kind = item.dataset.csGuard;
        if (kind !== 'official' && kind !== 'danger') return;
        const show = kind === 'official' ? cfg.guardian.pinOfficial : cfg.guardian.warnDownload;
        if (!show) return;
        const title = item.querySelector('h2, h3') || item;
        if (!title || title.querySelector('.cs-guard-badge')) return;
        const badge = document.createElement('span');
        badge.className = 'cs-guard-badge';
        badge.textContent = kind === 'official' ? '官方' : '⚠ 下载站';
        badge.style.cssText = guardBadgeStyle(kind);
        title.insertBefore(badge, title.firstChild);
        if (kind === 'danger') item.style.opacity = '0.6';
      });
    }

    // ③ 官网置顶
    if (officialItem && cfg.guardian.pinOfficial) {
      const list = document.querySelector(ctx.list.split(',')[0]);
      if (list && list.firstElementChild !== officialItem) {
        list.insertBefore(officialItem, list.firstChild);
      }
    }

    // ④ 顶部提示条：找到官网 → 绿色确认；找不到但有下载站 → 黄色警告
    if (officialItem) showGuardBanner('official', officialName);
    else if (dangerCount > 0) showGuardBanner('warn');
  }

  /* =====================================================================
   * §8 调度与监听
   * MutationObserver 增量触发（250ms 去抖）+ SPA 路由轻量轮询，
   * 替代旧脚本「每秒全页重扫 600 次」。
   * ===================================================================== */

  let debounceTimer = null;
  function scheduleRun(delay) {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => { debounceTimer = null; runAll(); }, delay || 250);
  }

  function dispatch() {
    const host = location.hostname;
    if (host.indexOf('baidu.com') >= 0) {
      if (host === 'www.baidu.com') {
        if (cfg.sites.baidu) {
          if (location.pathname === '/' ) cleanBaiduHome();
          else if (/^\/(s|sf)\b/.test(location.pathname + location.search) || location.search.indexOf('wd=') >= 0) cleanBaiduPC();
          else if (cfg.sites.baiduSub) cleanBaiduSub();
        }
      } else if (host === 'm.baidu.com') {
        if (cfg.sites.baidu) {
          if (location.search.indexOf('word=') >= 0 || location.search.indexOf('wd=') >= 0 || location.pathname.indexOf('/s') === 0) cleanBaiduMobile();
          else if (cfg.sites.baiduSub) cleanBaiduSub();
        }
      } else if (cfg.sites.baiduSub) {
        cleanBaiduSub(); // tieba/wenku/baike/zhidao/...
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
  function runAll() {
    if (!cfg.enabled || inWhitelist()) return;
    removedCount = 0;
    try { dispatch(); } catch (e) { console.error('[净搜] 运行异常', e); }
    if (removedCount > 0) console.log('[净搜] 本轮移除 ' + removedCount + ' 个广告/推广节点');
    try { runGuardian(); } catch (e) { console.error('[净搜] 护航异常', e); }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => scheduleRun());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // SPA 路由监听（百度/知乎/B站等站内跳转不改 DOM 结构时兜底）
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleRun(80);
      }
    }, 800);
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  /* =====================================================================
   * §9 内置设置面板（无外部依赖，Shadow DOM 隔离站点样式）
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
  const FILTER_LABELS = {
    kwFilter: '启用关键词屏蔽',
    urlFilter: '启用网址屏蔽',
  };
  const GUARD_LABELS = {
    enabled: '护航总开关',
    pinOfficial: '官网置顶 + 绿色「官方」标',
    warnDownload: '下载站警示（置灰 + 黄标）',
    banner: '页面顶部提示条',
  };

  let panelHost = null;

  function openPanel() {
    if (panelHost) { closePanel(); return; }
    stopObserver(); // 面板打开期间暂停净化，避免自我触发

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
    startObserver();
  }

  function buildPanelHTML() {
    const chk = (key, label, on) =>
      '<label class="chk"><input type="checkbox" data-key="' + key + '"' + (on ? ' checked' : '') + '>' + label + '</label>';

    const sitesChk = Object.keys(SITE_LABELS)
      .map(k => chk('sites.' + k, SITE_LABELS[k], !!cfg.sites[k])).join('');
    const funcChk = Object.keys(FUNC_LABELS)
      .map(k => chk(k, FUNC_LABELS[k], !!cfg[k])).join('');
    const filterChk = Object.keys(FILTER_LABELS)
      .map(k => chk('filters.' + k, FILTER_LABELS[k], !!cfg.filters[k])).join('');
    const guardChk = Object.keys(GUARD_LABELS)
      .map(k => chk('guardian.' + k, GUARD_LABELS[k], !!cfg.guardian[k])).join('');

    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const officialText = esc(cfg.officialSites.map(o => o.join(' ')).join('\n'));
    const dlText = esc(cfg.downloadSites.join('\n'));

    const ta = (key, rows, placeholder) =>
      '<textarea data-key="' + key + '" rows="' + rows + '" placeholder="' + placeholder + '">' +
      (cfg[key] || []).join('\n') + '</textarea>';

    return `
    <style>
      .mask { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center;
              font-family:"Microsoft YaHei", system-ui, sans-serif; }
      .card { width:620px; max-height:86vh; overflow-y:auto; background:#fff; border-radius:12px;
              padding:20px 26px; color:#222; box-shadow:0 8px 40px rgba(0,0,0,.3); box-sizing:border-box; }
      h2 { margin:0; font-size:18px; }
      .ver { color:#999; font-size:12px; font-weight:normal; }
      .sub { color:#888; font-size:12px; margin:4px 0 6px; }
      h3 { font-size:14px; margin:14px 0 8px; padding-bottom:4px; border-bottom:1px solid #eee; }
      .row { display:flex; flex-wrap:wrap; gap:8px 18px; }
      label.chk { display:inline-flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; user-select:none; }
      textarea { width:100%; min-height:60px; box-sizing:border-box; font-size:12px; line-height:1.5;
                 padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-family:Consolas, monospace; resize:vertical; }
      .hint { color:#999; font-size:11px; margin-top:2px; }
      .btns { margin-top:18px; display:flex; gap:10px; justify-content:flex-end; align-items:center; }
      button { padding:7px 16px; border-radius:6px; border:1px solid #ddd; background:#f5f5f5; cursor:pointer; font-size:13px; }
      button:hover { background:#eee; }
      button.primary { background:#3b82f6; border-color:#3b82f6; color:#fff; }
      button.primary:hover { background:#2f74e8; }
      button.danger { color:#c0392b; }
      .toast { position:fixed; left:50%; top:16%; transform:translateX(-50%); background:rgba(0,0,0,.78);
               color:#fff; padding:8px 20px; border-radius:8px; font-size:13px; pointer-events:none; }
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
      // checkbox（支持 sites.xxx / filters.xxx 前缀与顶层键）
      $$('input[type="checkbox"][data-key]', root).forEach(ck => {
        const path = ck.dataset.key.split('.');
        let obj = cfg;
        for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
        obj[path[path.length - 1]] = ck.checked;
      });
      // textarea（关键词/网址/白名单：按行切分、去空、去重；护航库下方单独解析）
      $$('textarea[data-key]', root).forEach(ta => {
        const key = ta.dataset.key;
        if (key === 'officialSitesText' || key === 'downloadSitesText') return;
        const arr = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
        cfg[key] = Array.from(new Set(arr));
      });
      // 护航：官网库 / 下载站库
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
      t.className = 'toast'; t.textContent = msg;
      root.appendChild(t);
      setTimeout(() => t.remove(), 1500);
    };

    root.getElementById('cs-mask').addEventListener('click', e => {
      if (e.target.id === 'cs-mask') closePanel();
    });
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
      // 重绘面板
      root.innerHTML = buildPanelHTML();
      bindPanelEvents(root);
    });
    root.getElementById('cs-export').addEventListener('click', () => {
      collect();
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cleansearch-config.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    root.getElementById('cs-import').addEventListener('click', () => root.getElementById('cs-file').click());
    root.getElementById('cs-file').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          cfg = deepMerge(clone(DEFAULT_CONFIG), data);
          saveConfig();
          toast('导入成功');
          root.innerHTML = buildPanelHTML();
          bindPanelEvents(root);
        } catch (err) { toast('导入失败：不是有效的配置文件'); }
      };
      reader.readAsText(file);
    });
  }

  /* =====================================================================
   * 启动
   * ===================================================================== */

  GM_registerMenuCommand('⚙ 净搜 · 设置', openPanel);
  GM_registerMenuCommand('▶ 立即重新净化', () => { runAll(); scheduleRun(600); });

  // 控制台接口：window.__CleanSearch.openPanel() / runAll() / runGuardian() / cfg() / version
  try {
    window.__CleanSearch = {
      version: SCRIPT_VERSION,
      openPanel: openPanel,
      runAll: runAll,
      runGuardian: runGuardian,
      cfg: () => cfg,
      probe: {
        hasDownloadIntent: hasDownloadIntent,
        getResultCtx: getResultCtx,
        siteOfficialName: siteOfficialName,
        isDownloadSite: isDownloadSite,
        effectiveHref: effectiveHref,
      },
    };
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
