/* Analytics — salvaged from Lanthorn. COMPLETELY INERT until a measurement ID is
   set (greybox ships with none). Event names follow Firebase conventions so a
   later native iOS port reports apples-to-apples.
   Events: board_start {board, par} · board_win {board, par, swipes, beatPar}
           board_reset {board} */
(function (root) {
  "use strict";
  const GA_MEASUREMENT_ID = "";   // ← paste "G-XXXXXXXXXX" to go live
  const CAP_NATIVE = !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform());
  const WEB_ENABLED = !!GA_MEASUREMENT_ID && !CAP_NATIVE;
  const Track = { enabled: CAP_NATIVE || WEB_ENABLED };

  if (WEB_ENABLED) {
    root.dataLayer = root.dataLayer || [];
    root.gtag = function () { root.dataLayer.push(arguments); };
    root.gtag("js", new Date());
    root.gtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
    s.onerror = () => { Track.enabled = CAP_NATIVE; };
    document.head.appendChild(s);
  }

  Track.ev = function (name, params) {
    if (!Track.enabled) return;
    try {
      if (CAP_NATIVE) root.Capacitor.Plugins.NativeFX.track({ name, params: params || {} });
      else root.gtag("event", name, params || {});
    } catch (e) {}
  };

  root.Track = Track;
})(typeof globalThis !== "undefined" ? globalThis : this);
