/**
 * CAPFIT — Google Analytics 4 (GA4) Integration & Telemetry Module (Landing)
 * Handles non-blocking async initialization of gtag.js, page views, and custom event tracking.
 */
(function() {
  'use strict';

  // ID de Medición de Google Analytics 4
  const DEFAULT_GA_ID = 'G-RJFGW1349J';
  let activeMeasurementId = window.CAPFIT_GA_MEASUREMENT_ID || DEFAULT_GA_ID;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  gtag('js', new Date());

  function configureGtag(id) {
    if (!id || id === 'G-XXXXXXXXXX') return;
    activeMeasurementId = id;

    gtag('config', id, {
      anonymize_ip: true,
      send_page_view: true
    });

    const scriptId = 'google-analytics-gtag';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
      document.head.appendChild(script);
    }
  }

  if (activeMeasurementId && activeMeasurementId !== 'G-XXXXXXXXXX') {
    configureGtag(activeMeasurementId);
  } else {
    if (typeof fetch === 'function') {
      fetch('/api/analytics-config')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && data.measurementId && data.measurementId !== 'G-XXXXXXXXXX') {
            configureGtag(data.measurementId);
          }
        })
        .catch(() => {});
    }
  }

  window.capfitTrack = function(eventName, eventParams) {
    try {
      const sanitizedParams = Object.assign({}, eventParams || {}, {
        timestamp: new Date().toISOString(),
        host: window.location.hostname
      });
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, sanitizedParams);
      }
    } catch (_) {}
  };
})();
