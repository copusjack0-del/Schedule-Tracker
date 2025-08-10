/* Minimal Gmail auth + fetch (read-only). Pure frontend using Google Identity Services */
const Gmail = (() => {
  let accessToken = null;
  let tokenClient = null;

  function init() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.APP_CONFIG?.GMAIL_CLIENT_ID || '',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      callback: (resp) => {
        if (resp.error) { status('Auth error: ' + resp.error); return; }
        accessToken = resp.access_token;
        onAuthChange(true);
      },
    });
  }

  function connect() {
    if (!window.APP_CONFIG?.GMAIL_CLIENT_ID) {
      alert('Add your Google OAuth Web Client ID in config.js first.');
      return;
    }
    tokenClient.requestAccessToken({prompt: 'consent'});
  }

  function disconnect() {
    if (!accessToken) return onAuthChange(false);
    google.accounts.oauth2.revoke(accessToken, () => onAuthChange(false));
    accessToken = null;
  }

  function isAuthed() { return !!accessToken; }

  async function fetchMessages({query, daysBack=30, max=50}) {
    if (!isAuthed()) throw new Error('Not authed');
    const after = new Date(); after.setDate(after.getDate() - daysBack);
    const q = `${query || ''} newer_than:${daysBack}d`.trim();
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('q', q);
    listUrl.searchParams.set('maxResults', String(max));

    const list = await http(listUrl);
    const ids = (list.messages || []).map(m => m.id);

    const bodies = await Promise.all(ids.map(id => http(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`)));
    return bodies.map(toReadableEmail);
  }

  function toReadableEmail(msg) {
    const headers = Object.fromEntries((msg.payload.headers||[]).map(h => [h.name.toLowerCase(), h.value]));
    const body = extractBody(msg.payload);
    return {
      id: msg.id,
      date: headers['date'] || '',
      from: headers['from'] || '',
      subject: headers['subject'] || '',
      text: body,
    };
  }

  function extractBody(payload) {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return atob(payload.body.data.replace(/-/g,'+').replace(/_/g,'/'));
    }
    if (payload.parts && payload.parts.length) {
      for (const p of payload.parts) {
        const t = extractBody(p);
        if (t) return t;
      }
    }
    // fallback: decode any body
    if (payload.body?.data) return atob(payload.body.data.replace(/-/g,'+').replace(/_/g,'/'));
    return '';
  }

  async function http(url, init={}) {
    const u = typeof url === 'string' ? url : url.toString();
    const res = await fetch(u, { ...init, headers: { ...(init.headers||{}), Authorization: `Bearer ${accessToken}` }});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function onAuthChange(authed) {
    const status = document.getElementById('gmailStatus');
    const btnC = document.getElementById('gmailConnect');
    const btnD = document.getElementById('gmailDisconnect');
    const btnF = document.getElementById('gmailFetch');
    btnC.classList.toggle('hidden', authed);
    btnD.classList.toggle('hidden', !authed);
    btnF.disabled = !authed;
    if (status) status.textContent = authed ? 'Connected to Gmail (read-only).' : 'Disconnected.';
  }

  function status(msg){ const s = document.getElementById('gmailStatus'); if(s) s.textContent = msg; }

  window.addEventListener('load', () => {
    if (window.google?.accounts?.oauth2) init();
    else window.addEventListener('google-loaded', init, {once:true});
  });

  return { connect, disconnect, fetchMessages, isAuthed };
})();
