// ==UserScript==
// @name         净搜 CleanSearch
// @author       VeT_SHIUAN
// @namespace    https://github.com/vetshiuan/cleansearch
// @version      0.2.5
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
// @run-at       document-end
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ===================================================================== *
   * 净搜 CleanSearch Ver 0.2.5 | 作者：VeT_SHIUAN | License: MIT
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

  const SCRIPT_VERSION = "0.2.5";
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

  /* ===================================================================== *
   * §2 旧脚本数据迁移
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

  /* ===================================================================== *
   * §3 通用工具
   * ===================================================================== */
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
    linkCache.set(href, real || '');
    activeResolve--;
    flushWaiters(href, real || '');
    pumpResolve();
  }

  function pumpResolve() {
    while (activeResolve < MAX_CONCURRENT && resolveQueue.length) {
      const href = resolveQueue.shift();
      if (linkCache.has(href)) { flushWaiters(href, linkCache.get(href)); continue; }
      activeResolve++;
      GM_xmlhttpRequest({
        method: 'GET',
        url: href,
        timeout: 4000,
        redirect: 'manual',
        onload: (res) => {
          let real = '';
          const hdrs = res.responseHeaders || '';
          const lm = hdrs.match(/(?:^|\r?\n)[Ll]ocation:\s*(\S+)/);
          if (lm) real = lm[1];
          if (!real) real = parseRealUrl(res.responseText);
          finishResolve(href, real);
        },
        onerror: () => finishResolve(href, ''),
        ontimeout: () => finishResolve(href, ''),
      });
    }
  }

  /* ===================================================================== *
   * §5 百度
   * ===================================================================== */
  let adCssInjected = false;

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
      adCssInjected = true;
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
    const items = $$('#content_left > div, #content_left [data-srcid], #content_left > .result, #content_left .cos-row');
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
      if (hasAdBadge(li)) { li.remove(); removedCount++; return; }
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
      if (!modal || /登录|注册|扫码|下载App|打开App/.test(t)) closeBtn.click();
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
  const DL_STRONG_WORDS = ['下载', '安装包', '官网'];
  const DL_WEAK_WORDS = ['官方', '官方版', '电脑版', '电脑端', '客户端', 'pc版', 'pc端'];
  const DL_NEWS_RE = /回应|辟谣|声明|通报|公告|道歉|起诉|申诉|被罚|被黑|被曝|崩了|宕机|打不开|无法访问|下架|事件|新闻|爆料|热搜|发布会/;

  function hasDownloadIntent() {
    const m = location.search.match(/[?&](?:wd|word|q|query|kw)=([^&]*)/);
    if (!m || !m[1]) return false;
    let q = m[1];
    try { q = decodeURIComponent(String(q).replace(/\+/g, ' ')); }
    catch (e) { /* 【Fix6b】畸形编码就用原串，不再抛异常 */ }
    q = String(q).toLowerCase();
    if (!q) return false;
    if (DL_NEWS_RE.test(q)) return false;
    if (DL_STRONG_WORDS.some(w => q.indexOf(w) >= 0)) return true;
    return DL_WEAK_WORDS.some(w => q.endsWith(w));
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
  const _isTokenChar = (c) => !c || /[\w一-鿿]/.test(c);
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

  // 域名 OR 软件名任一命中即视为官方（百度新版卡片只显示品牌名不含域名）
  function siteOfficialName(hay) {
    for (const o of cfg.officialSites) {
      if (domainHit(hay, o[0]) || nameTokenHit(hay, o[1])) return o[1];
    }
    return null;
  }

  function isDownloadSite(hay) {
    return cfg.downloadSites.some(d => domainHit(hay, d));
  }

  function guardBadgeStyle(kind) {
    return 'display:inline-block;margin-right:8px;padding:1px 8px;line-height:20px;font-size:12px;border-radius:4px;'
      + (kind === 'official'
        ? 'background:#16a34a;color:#fff;font-weight:700;vertical-align:middle;'
        : 'background:#d97706;color:#fff;font-weight:700;vertical-align:middle;');
  }

  function showGuardBanner(kind, name) {
    if (!cfg.guardian.banner || document.querySelector('#cs-guard-banner')) return;
    const ctx = getResultCtx();
    const list = getListEl(ctx);
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
      if (!href && location.hostname.indexOf('baidu.com') >= 0) {
        const cite = item.querySelector('.c-showurl, [class*="c-showurl"], cite, .c-color-gray');
        if (cite) {
          const m = (cite.textContent || '').match(/([a-z0-9-]+\.[a-z0-9.-]+)/i);
          if (m) href = m[1];
        }
      }
      const haystack = (href || '') + ' ' + (item.textContent || '').slice(0, 800);
      const name = siteOfficialName(haystack);
      if (name) {
        item.dataset.csGuard = 'official';
        if (!officialItem) { officialItem = item; officialName = name; }
      } else if (isDownloadSite(haystack)) {
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
      const list = getListEl(ctx);
      if (list && list.firstElementChild !== officialItem) {
        list.insertBefore(officialItem, list.firstChild);
      }
    }

    // ④ 顶部提示条
    if (officialItem) showGuardBanner('official', officialName);
    else if (dangerCount > 0) showGuardBanner('warn');
  }

  /* ===================================================================== *
   * §8 调度与监听
   * ===================================================================== */
  let debounceTimer = null;

  function scheduleRun(delay) {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runAll();
    }, delay || 250);
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
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
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
    // 【Fix8】只有启用且不在白名单时才重启监听；并立即重扫一次让新配置生效
    if (cfg.enabled && !inWhitelist()) {
      startObserver();
      scheduleRun(80);
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
        getResultCtx: getResultCtx,
        siteOfficialName: siteOfficialName,
        isDownloadSite: isDownloadSite,
        effectiveHref: effectiveHref,
        decodeBingU: decodeBingU,
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
