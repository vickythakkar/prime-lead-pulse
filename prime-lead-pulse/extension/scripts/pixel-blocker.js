// ============================================================
// Prime Lead Pulse — Pre-Fetch Pixel Blocker (MAIN World, document_start)
// Blocks Google-proxied tracking pixels (ci*.googleusercontent.com/meips/...)
// for Prime Lead Pulse across:
//   1. Gmail XHR & fetch sync responses (including prefetched adjacent threads #2, #3, #4)
//   2. Trusted Types createPolicy / createHTML (including Gmail's about:blank js_frame)
//   3. DOM insertion sinks (innerHTML, insertAdjacentHTML, createContextualFragment, DOMParser)
//   4. Image / Link preload setters (img.src, setAttribute, link.href)
//   5. Dynamic chrome.declarativeNetRequest session block rules for extracted meips/proxy tokens
// Never mutates unproxied outgoing Compose pixels so recipient tracking stays 100% intact.
// ============================================================
(function () {
  if (window.__plpPixelBlockerInstalled) return;
  window.__plpPixelBlockerInstalled = true;

  const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const BLOCKED_PATHS_KEY = '__plp_blocked_proxy_paths';

  // Matches Google-proxied Prime Lead Pulse pixel URLs in raw HTML, JSON-escaped (\/), or Unicode-escaped (\u003d / \u0023) text.
  // Never crosses quotes, angle brackets, whitespace, or unrelated backslash escapes.
  const PROXIED_PLP_PIXEL_RE = /https?:(?:\/|\\\/){2}[a-zA-Z0-9.-]*?(?:googleusercontent\.com|ggpht\.com)(?:\/|\\\/)(?:[^"'<>\s\\]|\\\/|\\u00(?:23|26|3d|3f|2f))*?(?:prime-lead-pulse-sigma\.vercel\.app|localhost:3000)(?:\/|\\\/)api(?:\/|\\\/)track(?:\/|\\\/)pixel(?:\/|\\\/)[a-zA-Z0-9_-]+(?:[^"'<>\s\\]|\\\/|\\u00(?:23|26|3d|3f|2f))*/gi;

  // Matches direct or proxied PLP pixel URL in live DOM attributes (outside compose editors)
  const PLP_PIXEL_URL_RE = /(?:prime-lead-pulse-sigma\.vercel\.app|localhost:3000)\/api\/track\/pixel\/[a-zA-Z0-9_-]+/i;

  // Extracts Google proxy path (meips/... or proxy/...) before #fragment
  const GOOGLE_PROXY_PATH_RE = /(?:googleusercontent\.com|ggpht\.com)\/((?:meips|proxy)\/[^"'<>\s#?\\]+)/i;

  const blockedProxyPaths = new Set();

  function loadPersistedProxyPaths() {
    try {
      const raw = window.localStorage.getItem(BLOCKED_PATHS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const p of arr) {
            if (typeof p === 'string' && p.length > 8) blockedProxyPaths.add(p);
          }
        }
      }
    } catch (_) {}
  }
  loadPersistedProxyPaths();

  function unescapeMatchedUrl(raw) {
    return raw
      .replace(/\\\//g, '/')
      .replace(/\\u0023/gi, '#')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/\\u003f/gi, '?')
      .replace(/\\u002f/gi, '/');
  }

  function recordBlockedProxyPaths(newPaths) {
    if (!newPaths || newPaths.length === 0) return;
    const added = [];
    for (const p of newPaths) {
      if (p && !blockedProxyPaths.has(p)) {
        blockedProxyPaths.add(p);
        added.push(p);
      }
    }
    if (added.length === 0) return;

    // Persist rolling window of last 250 proxy paths in localStorage
    try {
      const arr = Array.from(blockedProxyPaths);
      const trimmed = arr.length > 250 ? arr.slice(arr.length - 250) : arr;
      window.localStorage.setItem(BLOCKED_PATHS_KEY, JSON.stringify(trimmed));
    } catch (_) {}

    // Notify content.js -> background.js to add declarativeNetRequest session block rules
    try {
      const targetWin = window.top || window;
      targetWin.postMessage({ type: 'PLP_BLOCK_PROXY_PATHS', paths: added }, '*');
    } catch (_) {}
  }

  function makeSameLengthGifUrl(origLen) {
    if (origLen > TRANSPARENT_GIF.length) {
      return TRANSPARENT_GIF + '#' + '0'.repeat(origLen - TRANSPARENT_GIF.length - 1);
    }
    return TRANSPARENT_GIF;
  }

  function isInsideCompose(el) {
    if (!el || typeof el.closest !== 'function') return false;
    if (el.isContentEditable) return true;
    return Boolean(el.closest('[contenteditable="true"], [g_editable="true"], div[role="dialog"], .M9'));
  }

  function matchesBlockedProxyPath(urlStr) {
    if (typeof urlStr !== 'string') return false;
    if (!urlStr.includes('googleusercontent.com') && !urlStr.includes('ggpht.com')) return false;
    const m = urlStr.match(GOOGLE_PROXY_PATH_RE);
    if (m && blockedProxyPaths.has(m[1])) return true;
    return false;
  }

  function shouldBlockDomImageUrl(urlStr, el) {
    if (typeof urlStr !== 'string' || !urlStr) return false;
    if (isInsideCompose(el)) return false;
    if (PLP_PIXEL_URL_RE.test(urlStr)) {
      // Extract and remember proxy token if present
      const m = urlStr.match(GOOGLE_PROXY_PATH_RE);
      if (m) recordBlockedProxyPaths([m[1]]);
      return true;
    }
    if (matchesBlockedProxyPath(urlStr)) return true;
    return false;
  }

  function scrubPayloadText(text, preserveLength) {
    if (typeof text !== 'string') return text;
    if (!text.includes('track/pixel') && !text.includes('track\\/pixel')) return text;
    if (!text.includes('googleusercontent.com') && !text.includes('ggpht.com')) return text;

    const extractedPaths = [];
    const replaced = text.replace(PROXIED_PLP_PIXEL_RE, function (match) {
      const unescaped = unescapeMatchedUrl(match);
      const pathMatch = unescaped.match(GOOGLE_PROXY_PATH_RE);
      if (pathMatch && pathMatch[1]) {
        extractedPaths.push(pathMatch[1]);
      }
      return preserveLength ? makeSameLengthGifUrl(match.length) : TRANSPARENT_GIF;
    });

    if (extractedPaths.length > 0) {
      recordBlockedProxyPaths(extractedPaths);
    }
    return replaced;
  }

  function scrubPixelsInNode(root, proxiedOnly) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    if (!proxiedOnly && isInsideCompose(root)) return;

    const imgs = root.querySelectorAll('img[src], img[data-surl]');
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (isInsideCompose(img)) continue;
      const src = img.getAttribute('src') || '';
      const surl = img.getAttribute('data-surl') || '';
      const checkUrl = (PLP_PIXEL_URL_RE.test(src) || matchesBlockedProxyPath(src)) ? src : surl;
      if (!checkUrl) continue;
      if (proxiedOnly && !checkUrl.includes('googleusercontent.com') && !checkUrl.includes('ggpht.com')) {
        continue;
      }
      if (shouldBlockDomImageUrl(checkUrl, img)) {
        img.setAttribute('src', TRANSPARENT_GIF);
        if (surl) img.removeAttribute('data-surl');
        img.dataset.plpSelfBlocked = '1';
      }
    }
  }

  // ==========================================================
  // 1. Intercept Gmail XHR responses (sync/u/0/i/fd, mail/u/0/...)
  //    Neutralizes pixels in current email AND Gmail's prefetched
  //    adjacent threads (#2, #3, #4) BEFORE Gmail parses or preloads them.
  // ==========================================================
  try {
    const xhrTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    const xhrRespDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
    const scrubbedXhrCache = new WeakMap();

    function getScrubbedXhrText(xhr, rawText) {
      if (typeof rawText !== 'string' || !rawText) return rawText;
      const cached = scrubbedXhrCache.get(xhr);
      if (cached && cached.raw === rawText) return cached.out;
      const out = scrubPayloadText(rawText, true);
      scrubbedXhrCache.set(xhr, { raw: rawText, out });
      return out;
    }

    if (xhrTextDesc && xhrTextDesc.get) {
      Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        configurable: true,
        enumerable: xhrTextDesc.enumerable,
        get: function () {
          const raw = xhrTextDesc.get.call(this);
          if (this.responseURL && this.responseURL.includes('mail.google.com')) {
            return getScrubbedXhrText(this, raw);
          }
          return raw;
        }
      });
    }

    if (xhrRespDesc && xhrRespDesc.get) {
      Object.defineProperty(XMLHttpRequest.prototype, 'response', {
        configurable: true,
        enumerable: xhrRespDesc.enumerable,
        get: function () {
          const raw = xhrRespDesc.get.call(this);
          if (typeof raw === 'string' && this.responseURL && this.responseURL.includes('mail.google.com')) {
            return getScrubbedXhrText(this, raw);
          }
          return raw;
        }
      });
    }
  } catch (_) {}

  // ==========================================================
  // 2. Intercept Gmail fetch() responses (sync/u/0/i/fd, etc.)
  // ==========================================================
  try {
    if (typeof window.fetch === 'function') {
      const origFetch = window.fetch;
      window.fetch = function (input, init) {
        const reqUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        const promise = origFetch.apply(this, arguments);
        if (!reqUrl || (!reqUrl.includes('mail.google.com') && !reqUrl.startsWith('/'))) {
          return promise;
        }
        return promise.then(function (response) {
          try {
            const respUrl = response && response.url ? response.url : reqUrl;
            if (!respUrl.includes('mail.google.com')) return response;

            const origText = response.text.bind(response);
            const origJson = response.json.bind(response);

            response.text = function () {
              return origText().then(function (txt) {
                return scrubPayloadText(txt, true);
              });
            };
            response.json = function () {
              return origText().then(function (txt) {
                return JSON.parse(scrubPayloadText(txt, true));
              });
            };
          } catch (_) {}
          return response;
        });
      };
    }
  } catch (_) {}

  // ==========================================================
  // 3. Wrap Trusted Types policy creation & createHTML
  // ==========================================================
  try {
    const factoryProto = window.TrustedTypePolicyFactory && window.TrustedTypePolicyFactory.prototype;
    if (factoryProto && typeof factoryProto.createPolicy === 'function') {
      const origProtoCreatePolicy = factoryProto.createPolicy;
      factoryProto.createPolicy = function (policyName, policyRules) {
        if (policyRules && typeof policyRules.createHTML === 'function') {
          const origCreateHTML = policyRules.createHTML;
          const wrappedRules = Object.assign({}, policyRules, {
            createHTML: function (input) {
              const cleaned = typeof input === 'string' ? scrubPayloadText(input, false) : input;
              const args = Array.prototype.slice.call(arguments);
              args[0] = cleaned;
              return origCreateHTML.apply(this, args);
            }
          });
          return origProtoCreatePolicy.call(this, policyName, wrappedRules);
        }
        return origProtoCreatePolicy.apply(this, arguments);
      };
    }
  } catch (_) {}

  try {
    const policyProto = window.TrustedTypePolicy && window.TrustedTypePolicy.prototype;
    if (policyProto && typeof policyProto.createHTML === 'function') {
      const origPolicyCreateHTML = policyProto.createHTML;
      policyProto.createHTML = function (input) {
        const cleaned = typeof input === 'string' ? scrubPayloadText(input, false) : input;
        const args = Array.prototype.slice.call(arguments);
        args[0] = cleaned;
        return origPolicyCreateHTML.apply(this, args);
      };
    }
  } catch (_) {}

  // ==========================================================
  // 4. Wrap DOM HTML sinks (innerHTML, insertAdjacentHTML, createContextualFragment, DOMParser)
  // ==========================================================
  try {
    const innerHtmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (innerHtmlDesc && innerHtmlDesc.set) {
      const origSet = innerHtmlDesc.set;
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: innerHtmlDesc.enumerable,
        get: innerHtmlDesc.get,
        set: function (value) {
          const nextVal = typeof value === 'string' && !isInsideCompose(this)
            ? scrubPayloadText(value, false)
            : value;
          origSet.call(this, nextVal);
          scrubPixelsInNode(this, false);
        }
      });
    }
  } catch (_) {}

  try {
    const origInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
    if (typeof origInsertAdjacentHTML === 'function') {
      Element.prototype.insertAdjacentHTML = function (position, html) {
        const nextHtml = typeof html === 'string' && !isInsideCompose(this)
          ? scrubPayloadText(html, false)
          : html;
        origInsertAdjacentHTML.call(this, position, nextHtml);
        scrubPixelsInNode(this.parentElement || this, false);
      };
    }
  } catch (_) {}

  try {
    if (window.Range && Range.prototype && typeof Range.prototype.createContextualFragment === 'function') {
      const origCCF = Range.prototype.createContextualFragment;
      Range.prototype.createContextualFragment = function (fragment) {
        const nextFrag = typeof fragment === 'string' ? scrubPayloadText(fragment, false) : fragment;
        const res = origCCF.call(this, nextFrag);
        scrubPixelsInNode(res, true);
        return res;
      };
    }
  } catch (_) {}

  try {
    const origParseFromString = DOMParser.prototype.parseFromString;
    DOMParser.prototype.parseFromString = function (str, type) {
      const cleaned = typeof str === 'string' ? scrubPayloadText(str, false) : str;
      const doc = origParseFromString.call(this, cleaned, type);
      if (doc) scrubPixelsInNode(doc, true);
      return doc;
    };
  } catch (_) {}

  // ==========================================================
  // 5. Wrap <img> src, <link> href, and setAttribute
  // ==========================================================
  try {
    const imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (imgSrcDesc && imgSrcDesc.set) {
      const origImgSrcSet = imgSrcDesc.set;
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: imgSrcDesc.enumerable,
        get: imgSrcDesc.get,
        set: function (value) {
          if (typeof value === 'string' && shouldBlockDomImageUrl(value, this)) {
            this.dataset.plpSelfBlocked = '1';
            return origImgSrcSet.call(this, TRANSPARENT_GIF);
          }
          return origImgSrcSet.call(this, value);
        }
      });
    }
  } catch (_) {}

  try {
    const linkHrefDesc = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
    if (linkHrefDesc && linkHrefDesc.set) {
      const origLinkHrefSet = linkHrefDesc.set;
      Object.defineProperty(HTMLLinkElement.prototype, 'href', {
        configurable: true,
        enumerable: linkHrefDesc.enumerable,
        get: linkHrefDesc.get,
        set: function (value) {
          if (typeof value === 'string' && (PLP_PIXEL_URL_RE.test(value) || matchesBlockedProxyPath(value))) {
            return origLinkHrefSet.call(this, TRANSPARENT_GIF);
          }
          return origLinkHrefSet.call(this, value);
        }
      });
    }
  } catch (_) {}

  try {
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (typeof name === 'string' && typeof value === 'string') {
        const lname = name.toLowerCase();
        if (this.tagName === 'IMG' && (lname === 'src' || lname === 'data-surl')) {
          if (shouldBlockDomImageUrl(value, this)) {
            this.dataset.plpSelfBlocked = '1';
            return origSetAttribute.call(this, name, TRANSPARENT_GIF);
          }
        } else if (this.tagName === 'LINK' && lname === 'href') {
          if (PLP_PIXEL_URL_RE.test(value) || matchesBlockedProxyPath(value)) {
            return origSetAttribute.call(this, name, TRANSPARENT_GIF);
          }
        }
      }
      return origSetAttribute.call(this, name, value);
    };
  } catch (_) {}
})();
