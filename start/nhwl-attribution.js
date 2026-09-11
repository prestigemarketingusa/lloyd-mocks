/* NHWL x PMUSA — Meta attribution + pixel. Single source of truth for every funnel page.
 *
 * Design notes (2026-09-11):
 *  - These pages are served INSIDE a cross-site iframe (github.io inside my.newhopeweightloss.com),
 *    so _fbp/_fbc cookies are subject to storage partitioning and may not set in Safari. We
 *    therefore treat `fbclid` from the URL as the authoritative click identifier — it is a query
 *    parameter, not a cookie, so no browser policy can strip it — and we carry it server-side.
 *  - Browser events and CAPI events share an `event_id` so Meta deduplicates them.
 *  - Attribution is last-click for campaign identifiers (matching Meta's own model) but retains
 *    the first-touch timestamp and landing page.
 */
(function (w, d) {
  var PIXEL_ID = '1441640894483000';
  var STORE = 'nhwl_attr_v1';
  var PARAMS = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                'utm_term', 'campaign_id', 'adset_id', 'ad_id', 'placement', 'site_source_name'];

  function loadStore() { try { return JSON.parse(w.localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } }
  function saveStore(o) { try { w.localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function cookie(n) {
    var m = d.cookie.match('(^|;)\\s*' + n + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m.pop()) : '';
  }
  function uuid() {
    try { if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID(); } catch (e) {}
    return 'e-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  }

  // ---- 1. capture / refresh attribution -------------------------------------------------
  var attr = loadStore();
  var q = new w.URLSearchParams(w.location.search);
  var sawNewClick = false;

  PARAMS.forEach(function (k) {
    var v = q.get(k);
    if (v) { attr[k] = v; if (k === 'fbclid') sawNewClick = true; }
  });

  if (!attr.first_touch_at) {
    attr.first_touch_at = new Date().toISOString();
    attr.landing_page = w.location.href;
    attr.referrer = d.referrer || '';
  }
  if (sawNewClick) { attr.last_click_at = new Date().toISOString(); }

  // _fbc: prefer the real cookie; otherwise synthesise it from fbclid per Meta's documented format.
  if (!attr.fbc) {
    var c = cookie('_fbc');
    if (c) attr.fbc = c;
    else if (attr.fbclid) attr.fbc = 'fb.1.' + Date.now() + '.' + attr.fbclid;
  }
  saveStore(attr);

  // ---- 2. Meta pixel --------------------------------------------------------------------
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
  (w,d,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  w.fbq('init', PIXEL_ID);
  w.fbq('track', 'PageView', {}, { eventID: 'pv-' + uuid() });

  // _fbp only exists after fbevents.js runs; pick it up shortly after and persist it.
  w.setTimeout(function () {
    var fbp = cookie('_fbp');
    if (fbp && attr.fbp !== fbp) { attr.fbp = fbp; saveStore(attr); }
  }, 1200);

  // ---- 3. public surface ----------------------------------------------------------------
  w.NHWLAttr = {
    /* Everything the relay needs to reproduce this event server-side. */
    payload: function () {
      var a = loadStore();
      if (!a.fbp) { var fbp = cookie('_fbp'); if (fbp) { a.fbp = fbp; saveStore(a); } }
      return {
        fbclid: a.fbclid || '', fbp: a.fbp || '', fbc: a.fbc || '',
        utm_source: a.utm_source || '', utm_medium: a.utm_medium || '',
        utm_campaign: a.utm_campaign || '', utm_content: a.utm_content || '',
        utm_term: a.utm_term || '', gclid: a.gclid || '',
        meta_campaign_id: a.campaign_id || '', meta_adset_id: a.adset_id || '',
        meta_ad_id: a.ad_id || '', meta_placement: a.placement || '',
        first_touch_at: a.first_touch_at || '', last_click_at: a.last_click_at || '',
        landing_page: a.landing_page || '', referrer: a.referrer || '',
        page_url: w.location.href
      };
    },
    /* Fire a browser event and return the event_id so the same id can ride the relay POST.
       Meta then collapses the browser and CAPI copies into one event. */
    track: function (name, params) {
      var id = uuid();
      try { w.fbq('track', name, params || {}, { eventID: id }); } catch (e) {}
      return id;
    },
    trackCustom: function (name, params) {
      var id = uuid();
      try { w.fbq('trackCustom', name, params || {}, { eventID: id }); } catch (e) {}
      return id;
    },
    /* Append the click identifiers to an outbound funnel hop so attribution survives the
       navigation even when storage is partitioned away. */
    decorate: function (url) {
      try {
        var a = loadStore(), u = new w.URL(url, w.location.href);
        if (a.fbclid && !u.searchParams.get('fbclid')) u.searchParams.set('fbclid', a.fbclid);
        ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function (k) {
          if (a[k] && !u.searchParams.get(k)) u.searchParams.set(k, a[k]);
        });
        return u.toString();
      } catch (e) { return url; }
    }
  };
})(window, document);
