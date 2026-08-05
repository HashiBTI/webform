/**
 * config.js
 * Single place that decides where the browser sends API requests.
 *
 * - On the website and the installable PWA (served by server/server.js),
 *   leave API_BASE_URL as '' — requests go to relative paths like
 *   '/api/chat', which resolve against the same server that served the page.
 *
 * - Inside the native app shell (Capacitor, see mobile-app/), the WebView
 *   has no localhost server to call, so this file is swapped for a copy
 *   with API_BASE_URL pointing at your deployed backend, e.g.:
 *     API_BASE_URL: 'https://cff.example.com'
 *   See mobile-app/README.md for exactly where that copy lives.
 *
 * Loaded as a classic script, before storage.js/api.js/app.js/ai-widget.js,
 * so window.CFF_CONFIG is already defined by the time they run.
 */
window.CFF_CONFIG = {
  API_BASE_URL: ''
};
