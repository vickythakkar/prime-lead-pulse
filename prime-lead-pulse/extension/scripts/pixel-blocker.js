// ============================================================
// Prime Lead Pulse — Pre-Fetch Pixel Blocker (MAIN World, document_start)
// Stops Chrome from loading Google-proxied tracking pixels
// (ci*.googleusercontent.com/...#.../api/track/pixel/<id>) when the sender
// views their own sent emails in Gmail.
// ============================================================
(function () {
  if (window.__plpPixelBlockerInstalled) return;
  window.__plpPixelBlockerInstalled = true;

  const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const OWN_MAP_KEY = '__plp_own_email_map';
  const BROWSER_SENDERS_KEY = '__plp_browser_senders';

  // Match proxied Google URLs containing /api/track/pixel/<id>
  const PROXIED_PIXEL_URL_RE = /https?:\/\/[^"'\s<>]*?(?:googleusercontent\.com|ggpht\.com)\/[^"'\s<>]*?\/api\/track\/pixel\/([a-zA-Z0-9_-]+)[^"'\s<>]*/gi;
  // Match any /api/track/pixel/<id>
  const ANY_PIXEL_ID_RE = /\/api\/track\/pixel\/([a-zA-Z0-9_-]+)/i;

  let ownEmailMap = {};
  let browserSenders = new Set();

  function loadState() {
    try {
      const rawMap = window.localStorage.getItem(OWN_MAP_KEY);
      if (rawMap) {
        const parsed = JSON.parse(rawMap);
        if (parsed && typeof parsed === 'object') {
          ownEmailMap = parsed;
        }
      }
    } catch (_) {}

    try {
      const nextSenders = new Set();
      const rawSenders = window.localStorage.getItem(BROWSER_SENDERS_KEY);
      if (rawSenders) {
        const parsed = JSON.parse(rawSenders);
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            if (typeof s === 'string' && s.includes('@')) {
              nextSenders.add(s.toLowerCase().trim());
            }
          }
        }
      }
      // Fallback: extract Gmail account from page title if available
      if (typeof document !== 'undefined' && document.title) {
        const m = document.title.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
        if (m) nextSenders.add(m[1].toLowerCase().trim());
      }
      browserSenders = nextSenders;
    } catch (_) {}
  }

  loadState();

  try {
    window.addEventListener('plp-sync-self-state', loadState);
    window.addEventListener('storage', function (e) {
      if (!e || e.key === OWN_MAP_KEY || e.key === BROWSER_SENDERS_KEY) {
        loadState();
      }
    });
  } catch (_) {}

  function isInsideCompose(el) {
    if (!el || typeof el.closest !== 'function') return false;
    if (el.isContentEditable) return true;
    return Boolean(el.closest('[contenteditable="true"], [g_editable="true"], div[role="dialog"], .M9'));
  }

  function shouldBlockId(emailId, el) {
    if (!emailId) return false;

    // 1. Check DOM message card sender if attached
    if (el && typeof el.closest === 'function') {
      const card = el.closest('.adn');
      if (card) {
        const senderEl = card.querySelector('.gD');
        const cardSender = senderEl ? (senderEl.getAttribute('email') || '').toLowerCase().trim() : '';
        if (cardSender && browserSenders.has(cardSender)) {
          return true;
        }
      }
    }

    // 2. Check synced ownEmailMap
    if (Object.prototype.hasOwnProperty.call(ownEmailMap, emailId)) {
      const sender = (ownEmailMap[emailId] || '').toLowerCase().trim();
      if (browserSenders.size === 0 || !sender || sender === 'unknown' || browserSenders.has(sender)) {
        return true;
      }
      return false;
    }

    return false;
  }

  function shouldBlockUrl(urlStr, el) {
    if (typeof urlStr !== 'string' || !urlStr.includes('/api/track/pixel/')) return false;
    const match = urlStr.match(ANY_PIXEL_ID_RE);
    if (!match) return false;
    return shouldBlockId(match[1], el);
  }

  function scrubProxiedHtmlString(html) {
    if (typeof html !== 'string' || !html.includes('/api/track/pixel/')) return html;
    if (!html.includes('googleusercontent.com') && !html.includes('ggpht.com')) return html;

    return html.replace(PROXIED_PIXEL_URL_RE, function (fullUrl, emailId) {
      return shouldBlockId(emailId, null) ? TRANSPARENT_GIF : fullUrl;
    });
  }

  function scrubPixelsInNode(root, proxiedOnly) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    if (!proxiedOnly && isInsideCompose(root)) return;

    const imgs = root.querySelectorAll('img[src*="/api/track/pixel/"], img[data-surl*="/api/track/pixel/"]');
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (isInsideCompose(img)) continue;
      const src = img.getAttribute('src') || '';
      const surl = img.getAttribute('data-surl') || '';
      const checkUrl = src.includes('/api/track/pixel/') ? src : surl;
      if (proxiedOnly && !checkUrl.includes('googleusercontent.com') && !checkUrl.includes('ggpht.com')) {
        continue;
      }
      if (shouldBlockUrl(checkUrl, img)) {
        img.setAttribute('src', TRANSPARENT_GIF);
        if (surl) img.removeAttribute('data-surl');
        img.dataset.plpSelfBlocked = '1';
      }
    }
  }

  // 1. Wrap Trusted Types policy creation (Gmail requires TrustedHTML for all HTML rendering)
  try {
    if (window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
      const origCreatePolicy = window.trustedTypes.createPolicy;
      window.trustedTypes.createPolicy = function (policyName, policyRules) {
        if (policyRules && typeof policyRules.createHTML === 'function') {
          const origCreateHTML = policyRules.createHTML;
          const wrappedRules = Object.assign({}, policyRules, {
            createHTML: function (input) {
              const cleaned = typeof input === 'string' ? scrubProxiedHtmlString(input) : input;
              const args = Array.prototype.slice.call(arguments);
              args[0] = cleaned;
              return origCreateHTML.apply(this, args);
            }
          });
          return origCreatePolicy.call(this, policyName, wrappedRules);
        }
        return origCreatePolicy.apply(this, arguments);
      };
    }
  } catch (_) {}

  // 2. Wrap Element.prototype.innerHTML setter
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
            ? scrubProxiedHtmlString(value)
            : value;
          origSet.call(this, nextVal);
          scrubPixelsInNode(this, false);
        }
      });
    }
  } catch (_) {}

  // 3. Wrap Element.prototype.insertAdjacentHTML
  try {
    const origInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
    if (typeof origInsertAdjacentHTML === 'function') {
      Element.prototype.insertAdjacentHTML = function (position, html) {
        const nextHtml = typeof html === 'string' && !isInsideCompose(this)
          ? scrubProxiedHtmlString(html)
          : html;
        origInsertAdjacentHTML.call(this, position, nextHtml);
        scrubPixelsInNode(this.parentElement || this, false);
      };
    }
  } catch (_) {}

  // 4. Wrap HTMLImageElement.prototype.src setter
  try {
    const imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (imgSrcDesc && imgSrcDesc.set) {
      const origImgSrcSet = imgSrcDesc.set;
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: imgSrcDesc.enumerable,
        get: imgSrcDesc.get,
        set: function (value) {
          if (typeof value === 'string' && value.includes('/api/track/pixel/') && !isInsideCompose(this)) {
            if (shouldBlockUrl(value, this)) {
              this.dataset.plpSelfBlocked = '1';
              return origImgSrcSet.call(this, TRANSPARENT_GIF);
            }
          }
          return origImgSrcSet.call(this, value);
        }
      });
    }
  } catch (_) {}

  // 5. Wrap Element.prototype.setAttribute for <img> src / data-surl
  try {
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this.tagName === 'IMG' && typeof name === 'string') {
        const lname = name.toLowerCase();
        if ((lname === 'src' || lname === 'data-surl') && typeof value === 'string' && value.includes('/api/track/pixel/')) {
          if (!isInsideCompose(this) && shouldBlockUrl(value, this)) {
            this.dataset.plpSelfBlocked = '1';
            return origSetAttribute.call(this, name, TRANSPARENT_GIF);
          }
        }
      }
      return origSetAttribute.call(this, name, value);
    };
  } catch (_) {}

  // 6. Wrap DOMParser.prototype.parseFromString
  try {
    const origParseFromString = DOMParser.prototype.parseFromString;
    DOMParser.prototype.parseFromString = function (str, type) {
      const doc = origParseFromString.apply(this, arguments);
      if (doc && typeof str === 'string' && str.includes('/api/track/pixel/')) {
        scrubPixelsInNode(doc, true);
      }
      return doc;
    };
  } catch (_) {}
})();
