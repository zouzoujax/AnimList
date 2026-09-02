/**
 * La page servie au téléphone.
 *
 * Une seule page, sans dépendance et sans build : elle doit s'ouvrir sur un
 * navigateur mobile quelconque, hors ligne côté internet, en une requête.
 *
 * Le mot de passe arrive par l'adresse — c'est le seul moyen de le donner
 * quand on recopie un lien — puis est rangé dans le stockage local et retiré
 * de la barre d'adresse : il n'a pas à rester dans l'historique du téléphone
 * ni à repartir dans l'en-tête « Referer » d'un lien suivant.
 *
 * Les gestes sont volontairement gros : ça se pilote au pouce, dans le noir,
 * une main occupée ailleurs.
 */

const STYLE = `
  :root { color-scheme: dark; --bg:#07080f; --panel:#12141f; --line:#232637; --text:#e8eaf2; --muted:#9aa1b8; --accent:#7c5cff; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:16px 14px 40px; }
  h1 { font-size:1.35rem; margin:0 0 2px; letter-spacing:-.02em; }
  p.sub { margin:0 0 18px; color:var(--muted); font-size:.85rem; }
  .row { display:flex; gap:12px; align-items:center; background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:10px; margin-bottom:10px; }
  .row img { width:52px; height:74px; object-fit:cover; border-radius:10px; flex:none; background:#1c1f2e; }
  .info { flex:1; min-width:0; }
  .title { font-weight:600; font-size:.95rem; line-height:1.25; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .meta { color:var(--muted); font-size:.78rem; margin-top:3px; }
  .acts { display:flex; flex-direction:column; gap:6px; flex:none; }
  button { font:inherit; border:0; border-radius:12px; padding:11px 14px; font-weight:600; font-size:.82rem; color:#fff; background:var(--accent); }
  button.ghost { background:#1c1f2e; color:var(--muted); }
  button:active { transform:scale(.96); }
  button[disabled] { opacity:.4; }
  .empty, .err { text-align:center; color:var(--muted); padding:40px 10px; font-size:.9rem; line-height:1.6; }
  .err { color:#ff8f8f; }
  form { display:flex; gap:8px; margin-top:20px; }
  input { flex:1; font:inherit; padding:11px 12px; border-radius:12px; border:1px solid var(--line); background:var(--panel); color:var(--text); }
  .flash { position:fixed; left:50%; bottom:20px; transform:translateX(-50%); background:var(--accent); color:#fff; padding:10px 16px; border-radius:999px; font-size:.85rem; font-weight:600; opacity:0; transition:opacity .2s; pointer-events:none; }
  .flash.on { opacity:1; }
`

const SCRIPT = `
  const KEY = 'animelist-remote-token'
  const url = new URL(location.href)
  const fromUrl = url.searchParams.get('t')
  if (fromUrl) {
    localStorage.setItem(KEY, fromUrl)
    // Retiré de la barre d'adresse : sinon le mot de passe reste dans
    // l'historique du téléphone et part dans le « Referer » du lien suivant.
    url.searchParams.delete('t')
    history.replaceState(null, '', url.pathname)
  }
  let token = localStorage.getItem(KEY) || ''

  const app = document.getElementById('app')
  const flash = document.getElementById('flash')

  function say(text) {
    flash.textContent = text
    flash.classList.add('on')
    setTimeout(() => flash.classList.remove('on'), 1600)
  }

  async function call(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    })
    if (res.status === 401) throw new Error('unauthorized')
    if (!res.ok) throw new Error('Le PC a répondu ' + res.status)
    return res.json()
  }

  function askToken(message) {
    app.innerHTML =
      '<div class="err">' + message + '</div>' +
      '<form id="f"><input id="t" placeholder="mot de passe" autocapitalize="off" autocomplete="off" spellcheck="false"><button>Entrer</button></form>'
    document.getElementById('f').onsubmit = (e) => {
      e.preventDefault()
      token = document.getElementById('t').value.trim()
      localStorage.setItem(KEY, token)
      load()
    }
  }

  // Les titres viennent d'AniList et finissent dans du HTML : « Fate/stay
  // night: Unlimited Blade Works » ne pose pas de problème, mais rien ne
  // garantit qu'aucun n'en portera jamais.
  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))
  }

  function render(state) {
    if (!state.series.length) {
      app.innerHTML = '<div class="empty">Rien en cours.<br>Commence une série sur le PC, elle apparaîtra ici.</div>'
      return
    }
    app.innerHTML = state.series.map((s) => {
      const total = s.total ? ' sur ' + s.total : ''
      return '<div class="row">' +
        '<img src="' + esc(s.cover) + '" alt="" loading="lazy">' +
        '<div class="info">' +
          '<div class="title">' + esc(s.title) + '</div>' +
          '<div class="meta">Épisode ' + s.episode + total + ' · ' + s.seen + ' vus</div>' +
        '</div>' +
        '<div class="acts">' +
          '<button onclick="tick(' + s.id + ',' + s.episode + ')">Vu</button>' +
          '<button class="ghost" onclick="open_(' + s.id + ')">Ouvrir</button>' +
        '</div>' +
      '</div>'
    }).join('')
  }

  async function load() {
    try {
      render(await call('/api/state'))
    } catch (err) {
      if (err.message === 'unauthorized') askToken('Mot de passe demandé.')
      else app.innerHTML = '<div class="err">' + err.message + '</div>'
    }
  }

  window.tick = async function (id, episode) {
    try {
      render(await call('/api/tick', { id: id, episode: episode }))
      say('Épisode ' + episode + ' coché')
    } catch (err) {
      say('Raté : ' + err.message)
    }
  }

  window.open_ = async function (id) {
    try {
      await call('/api/open', { id: id })
      say('Ouvert sur le PC')
    } catch (err) {
      say('Raté : ' + err.message)
    }
  }

  load()
  // La bibliothèque bouge aussi depuis le PC : on relit de temps en temps.
  setInterval(load, 20000)
`

/** Le HTML complet, monté d'un bloc. */
export function page(): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<title>AnimeList — télécommande</title>
<style>${STYLE}</style>
</head>
<body>
<h1>AnimeList</h1>
<p class="sub">Ce qu'il te reste à reprendre</p>
<div id="app"><div class="empty">Chargement…</div></div>
<div class="flash" id="flash"></div>
<script>${SCRIPT}</script>
</body>
</html>`
}
