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
  .row { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:10px; margin-bottom:10px; }
  .head { display:flex; gap:12px; align-items:center; }
  .row img { width:52px; height:74px; object-fit:cover; border-radius:10px; flex:none; background:#1c1f2e; }
  .info { flex:1; min-width:0; }
  .acts { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
  .acts button { flex:1 1 auto; min-width:76px; }
  .title { font-weight:600; font-size:.95rem; line-height:1.25; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .meta { color:var(--muted); font-size:.78rem; margin-top:3px; }
  button { font:inherit; border:0; border-radius:12px; padding:11px 14px; font-weight:600; font-size:.82rem; color:#fff; background:var(--accent); }
  button.ghost { background:#1c1f2e; color:var(--muted); }
  button:active { transform:scale(.96); }
  button[disabled] { opacity:.35; background:#1c1f2e; color:var(--muted); }
  .wait { color:#ffb038; }
  .empty, .err { text-align:center; color:var(--muted); padding:40px 10px; font-size:.9rem; line-height:1.6; }
  .err { color:#ff8f8f; }
  form { display:flex; gap:8px; margin-top:20px; }
  input { flex:1; font:inherit; padding:11px 12px; border-radius:12px; border:1px solid var(--line); background:var(--panel); color:var(--text); }
  .player { position:sticky; top:0; z-index:5; background:#161927; border:1px solid var(--line); border-radius:16px; padding:12px; margin-bottom:14px; }
  .player .now { font-weight:600; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .player .kind { color:var(--muted); font-size:.72rem; margin-top:2px; }
  .player .line { display:flex; align-items:center; gap:10px; margin-top:10px; }
  .player .time { color:var(--muted); font-size:.72rem; font-variant-numeric:tabular-nums; flex:none; }
  /* Une piste haute : on la vise au pouce, pas à la souris. */
  input[type=range] { flex:1; -webkit-appearance:none; appearance:none; height:26px; background:transparent; }
  input[type=range]::-webkit-slider-runnable-track { height:6px; border-radius:99px; background:#2a2e42; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; margin-top:-7px; border-radius:50%; background:var(--accent); }
  .player .btns { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
  .player .btns button { flex:1 1 auto; min-width:72px; }
  .vol { display:flex; align-items:center; gap:8px; margin-top:4px; }
  .vol span { color:var(--muted); font-size:.72rem; flex:none; }
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
    // Surtout pas « body » : c'est déjà le nom du paramètre, et redéclarer
    // l'identifiant empêchait tout le script de se parser — la page restait
    // sur « Chargement… » sans jamais rien tenter.
    const payload = await res.json().catch(() => null)
    // Le serveur explique ses refus : « pas encore sorti » vaut mieux que 409.
    if (!res.ok) throw new Error((payload && payload.error) || 'Le PC a répondu ' + res.status)
    return payload
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

  // « dans 2 j », « dans 5 h » : de quoi savoir s'il faut attendre ce soir ou
  // la semaine prochaine, sans embarquer de bibliothèque de dates.
  function when(airingAt) {
    if (!airingAt) return 'pas encore sorti'
    const left = airingAt * 1000 - Date.now()
    if (left <= 0) return 'sort maintenant'
    const days = Math.floor(left / 86400000)
    if (days >= 1) return 'dans ' + days + ' j'
    const hours = Math.floor(left / 3600000)
    if (hours >= 1) return 'dans ' + hours + ' h'
    return 'dans ' + Math.max(1, Math.floor(left / 60000)) + ' min'
  }

  var playerEl = document.getElementById('player')
  // Vrai pendant qu'on fait glisser : sinon le rafraîchissement remettrait le
  // curseur là où la vidéo en est, et il sauterait sous le doigt.
  var dragging = false

  function mmss(total) {
    total = Math.max(0, Math.floor(total || 0))
    var s = total % 60, m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600)
    var mm = h > 0 ? String(m).padStart(2, '0') : String(m)
    return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
  }

  function btn(action, label, klass) {
    return '<button class="' + klass + '" data-act="' + action + '">' + label + '</button>'
  }

  // Un seul écouteur pour toute la barre, posé une fois.
  playerEl.addEventListener('click', function (e) {
    var button = e.target.closest ? e.target.closest('[data-act]') : null
    if (!button) return
    button.disabled = true
    send(button.getAttribute('data-act'), 0).then(function () { button.disabled = false })
  })

  function renderPlayer(p) {
    if (!p) { playerEl.innerHTML = ''; return }
    if (dragging) return

    var seek = p.canSeek && p.duration > 0
      ? '<div class="line">' +
          '<span class="time">' + mmss(p.position) + '</span>' +
          '<input type="range" id="seek" min="0" max="' + Math.floor(p.duration) + '" value="' + Math.floor(p.position) + '">' +
          '<span class="time">' + mmss(p.duration) + '</span>' +
        '</div>' +
        '<div class="vol"><span>Volume</span>' +
          '<input type="range" id="vol" min="0" max="100" value="' + Math.round(p.volume) + '"></div>'
      : ''

    // Un lecteur hors d'atteinte le dit, au lieu d'afficher des boutons muets.
    var kind = p.kind === 'trailer'
      ? 'Bande-annonce'
      : 'Anime-Sama · leur lecteur ne se pilote pas d’ici, seulement la fenêtre'

    playerEl.innerHTML =
      '<div class="player">' +
        '<div class="now">' + esc(p.title) + '</div>' +
        '<div class="kind">' + kind + '</div>' +
        seek +
        // Les boutons portent leur commande en attribut et un seul
        // écouteur les sert tous : c'est plus court, et surtout ça évite
        // d'imbriquer des guillemets dans un gabarit qui les mange.
        '<div class="btns">' +
          (p.canSeek ? btn(p.playing ? 'pause' : 'play', p.playing ? 'Pause' : 'Lecture', '') : '') +
          btn(p.fullscreen ? 'windowed' : 'fullscreen', p.fullscreen ? 'Fenêtre' : 'Plein écran', 'ghost') +
          btn('close', 'Fermer', 'ghost') +
        '</div>' +
      '</div>'

    var seekEl = document.getElementById('seek')
    if (seekEl) {
      seekEl.addEventListener('input', function () { dragging = true })
      seekEl.addEventListener('change', function () {
        dragging = false
        send('seek', Number(seekEl.value))
      })
    }
    var volEl = document.getElementById('vol')
    if (volEl) {
      volEl.addEventListener('input', function () { dragging = true })
      volEl.addEventListener('change', function () {
        dragging = false
        send('volume', Number(volEl.value))
      })
    }
  }

  async function send(action, value) {
    try {
      var res = await call('/api/control', { action: action, value: value })
      renderPlayer(res.player)
    } catch (err) {
      say(err.message)
      load()
    }
  }

  function render(state) {
    renderPlayer(state.player)
    if (!state.series.length) {
      app.innerHTML = '<div class="empty">Rien en cours.<br>Commence une série sur le PC, elle apparaîtra ici.</div>'
      return
    }

    app.innerHTML = state.series.map((s) => {
      const total = s.total ? ' sur ' + s.total : ''
      // Un épisode à venir ne se coche pas : le bouton est éteint et la ligne
      // dit pourquoi, plutôt que de laisser essayer et refuser après coup.
      const meta = s.unaired
        ? '<span class="wait">Épisode ' + s.episode + ' ' + when(s.airingAt) + '</span>'
        : 'Épisode ' + s.episode + total + ' · ' + s.seen + ' vus'
      const act = s.unaired
        ? '<button disabled>Vu</button>'
        : '<button onclick="tick(' + s.id + ',' + s.episode + ')">Vu</button>'
      // La bande-annonce n'apparaît que s'il y en a une : un bouton qui
      // répond « pas de bande-annonce » ne valait pas la place qu'il prend.
      const ba = s.trailer
        ? '<button class="ghost" onclick="trailer(this,' + s.id + ')">Bande-annonce</button>'
        : ''
      return '<div class="row">' +
        '<div class="head">' +
          '<img src="' + esc(s.cover) + '" alt="" loading="lazy">' +
          '<div class="info">' +
            '<div class="title">' + esc(s.title) + '</div>' +
            '<div class="meta">' + meta + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="acts">' +
          act +
          '<button class="ghost" onclick="watch(this,' + s.id + ',' + s.episode + ')">Regarder</button>' +
          ba +
          '<button class="ghost" onclick="open_(' + s.id + ')">Fiche</button>' +
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
      say(err.message)
      // Un refus veut souvent dire que la page date : on relit.
      load()
    }
  }

  /**
   * Les actions qui ouvrent une fenêtre sur le PC.
   *
   * Le bouton est éteint le temps de la réponse : « Regarder » interroge
   * Anime-Sama pour trouver l'adresse, ce qui prend parfois deux secondes, et
   * sans retour on tape trois fois.
   */
  async function act(button, path, payload, done) {
    const before = button.textContent
    button.disabled = true
    button.textContent = '…'
    try {
      await call(path, payload)
      say(done)
    } catch (err) {
      say(err.message)
    } finally {
      button.disabled = false
      button.textContent = before
    }
  }

  // Le bouton est passé explicitement : window.event est un vestige, et sa
  // cible n'est plus renseignée une fois la fonction asynchrone reprise.
  window.watch = function (button, id, episode) {
    act(button, '/api/watch', { id: id, episode: episode }, 'Lecteur ouvert sur le PC')
  }

  window.trailer = function (button, id) {
    act(button, '/api/trailer', { id: id }, 'Bande-annonce lancée')
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
  // La bibliothèque bouge lentement ; une vidéo qui joue, non. Deux rythmes :
  // la liste toutes les vingt secondes, la position toutes les deux.
  setInterval(load, 20000)
  setInterval(async function () {
    if (dragging || !playerEl.innerHTML) return
    try { renderPlayer((await call('/api/player')).player) } catch (err) { /* rien à dire */ }
  }, 2000)
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
<div id="player"></div>
<div id="app"><div class="empty">Chargement…</div></div>
<div class="flash" id="flash"></div>
<script>${SCRIPT}</script>
</body>
</html>`
}
