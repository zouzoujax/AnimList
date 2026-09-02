/**
 * La page servie au téléphone.
 *
 * Une seule page, sans dépendance et sans build : elle doit s'ouvrir sur un
 * navigateur mobile quelconque, en une requête, sans rien charger d'ailleurs.
 *
 * Elle est dessinée pour un pouce, pas pour une souris. D'où les cibles larges,
 * la barre de lecture collée en haut, et l'absence de tout geste qui
 * demanderait de viser : on s'en sert d'une main, dans le noir, en regardant
 * autre chose.
 *
 * Le mot de passe arrive par l'adresse — seul moyen de le donner quand on
 * scanne un lien — puis est rangé dans le stockage local et retiré de la barre
 * d'adresse : il n'a pas à rester dans l'historique du téléphone ni à repartir
 * dans le « Referer » d'un lien suivant.
 *
 * Tout passe par un seul écouteur de clic et des attributs `data-`. Les
 * gestionnaires en ligne obligeaient à imbriquer des guillemets dans un gabarit
 * qui les mange — une faute invisible jusqu'au téléphone, et qui empêche le
 * script entier de se parser.
 */

const STYLE = `
  :root {
    color-scheme: dark;
    --bg: #07080f;
    --panel: #12141f;
    --panel-2: #1a1d2b;
    --line: #232637;
    --text: #e8eaf2;
    --muted: #9aa1b8;
    --faint: #6b7392;
    --accent: #7c5cff;
    --accent-soft: rgba(124,92,255,.16);
    --warn: #ffb038;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 0 14px calc(90px + env(safe-area-inset-bottom));
  }

  /* Un halo discret en haut, comme la une de l'app. */
  body::before {
    content: '';
    position: fixed; inset: 0 0 auto; height: 220px; z-index: -1;
    background: radial-gradient(120% 100% at 50% 0%, rgba(124,92,255,.20), transparent 70%);
  }

  header { padding: calc(18px + env(safe-area-inset-top)) 2px 14px; }
  h1 { font-size: 1.5rem; margin: 0; letter-spacing: -.03em; font-weight: 700; }
  h1 span { color: var(--muted); font-weight: 400; }
  .sub { margin: 4px 0 0; color: var(--muted); font-size: .82rem; }

  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 12px;
    margin-bottom: 12px;
  }

  /* ---- ce qui joue sur le PC ---- */
  .player {
    position: sticky; top: 0; z-index: 5;
    margin: 0 0 16px;
    background: linear-gradient(180deg, #1b1a33, #14141f);
    border: 1px solid rgba(124,92,255,.35);
    border-radius: 18px;
    padding: 12px;
    box-shadow: 0 10px 30px -12px rgba(0,0,0,.9);
  }
  .player .top { display: flex; gap: 12px; align-items: center; }
  .player img { width: 44px; height: 62px; border-radius: 9px; object-fit: cover; flex: none; background: var(--panel-2); }
  .grow { min-width: 0; flex: 1; }
  .badge {
    display: inline-block; font-size: .62rem; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; color: var(--accent); background: var(--accent-soft);
    padding: 3px 7px; border-radius: 6px;
  }
  .player .name { font-weight: 650; font-size: .95rem; margin-top: 4px; line-height: 1.25; }
  .note { color: var(--faint); font-size: .72rem; margin-top: 4px; line-height: 1.45; }

  .seekline { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .time { color: var(--muted); font-size: .72rem; font-variant-numeric: tabular-nums; flex: none; min-width: 38px; }
  .time.right { text-align: right; }

  .volline { display: flex; align-items: center; gap: 10px; }
  .volline svg { flex: none; color: var(--faint); }

  /* Piste haute : on la vise au pouce, pas à la souris. */
  input[type=range] { flex: 1; -webkit-appearance: none; appearance: none; height: 30px; background: none; margin: 0; }
  input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 99px; background: #2b2f45; }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 22px; height: 22px; margin-top: -8px;
    border-radius: 50%; background: var(--accent); border: 2px solid #14141f;
  }
  input[type=range]::-moz-range-track { height: 6px; border-radius: 99px; background: #2b2f45; }
  input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border: 2px solid #14141f; border-radius: 50%; background: var(--accent); }

  /* ---- une série ---- */
  .row { display: flex; gap: 12px; }
  .row img { width: 62px; height: 88px; border-radius: 11px; object-fit: cover; flex: none; background: var(--panel-2); }
  .row .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .title { font-weight: 650; font-size: .94rem; line-height: 1.28; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .meta { color: var(--muted); font-size: .76rem; margin-top: 5px; }
  .meta b { color: var(--text); font-weight: 650; }
  .soon { color: var(--warn); }

  .bar { height: 4px; border-radius: 99px; background: #262a3d; margin-top: 8px; overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 99px; background: var(--accent); }

  /* ---- choix de l'épisode ---- */
  .eps { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
  .modes { display: flex; gap: 6px; margin-bottom: 10px; }
  .modes .chip { flex: 1; justify-content: center; }
  .nums { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 6px; }
  /* Une case carrée d'au moins quarante-quatre pixels : c'est la taille en
     dessous de laquelle un pouce vise à côté. */
  .num {
    min-height: 44px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--panel-2); color: var(--muted);
    font-size: .82rem; font-weight: 600; font-variant-numeric: tabular-nums;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .num[data-seen='true'] { background: var(--accent-soft); border-color: rgba(124,92,255,.4); color: var(--accent); }
  .num[data-off='true'] { opacity: .3; }
  .eps .note { margin-top: 10px; }

  /* ---- boutons ---- */
  .acts { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  button {
    font: inherit; font-size: .82rem; font-weight: 600; color: #fff;
    border: 0; border-radius: 12px; padding: 0 14px; min-height: 42px;
    background: var(--accent); display: inline-flex; align-items: center;
    justify-content: center; gap: 7px; flex: 1 1 auto; min-width: 84px;
  }
  button.ghost { background: var(--panel-2); color: var(--muted); border: 1px solid var(--line); }
  button:active { transform: scale(.97); }
  button[disabled] { opacity: .45; }
  button svg { flex: none; }

  .pill {
    flex: 1 1 auto; min-width: 84px; min-height: 42px; border-radius: 12px;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    font-size: .8rem; font-weight: 600; color: var(--warn);
    background: rgba(255,176,56,.12); border: 1px solid rgba(255,176,56,.25);
  }

  /* ---- états ---- */
  .empty, .err { text-align: center; color: var(--muted); padding: 46px 12px; font-size: .9rem; line-height: 1.7; }
  .err { color: #ff9b9b; }
  form { display: flex; gap: 8px; margin-top: 14px; }
  input[type=text] {
    flex: 1; font: inherit; min-height: 44px; padding: 0 13px; border-radius: 12px;
    border: 1px solid var(--line); background: var(--panel); color: var(--text);
  }
  input[type=text]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

  .flash {
    position: fixed; left: 50%; transform: translate(-50%, 12px);
    bottom: calc(86px + env(safe-area-inset-bottom));
    background: var(--accent); color: #fff; padding: 11px 18px; border-radius: 999px;
    font-size: .85rem; font-weight: 600; opacity: 0; pointer-events: none;
    transition: opacity .2s, transform .2s; box-shadow: 0 8px 24px -8px rgba(0,0,0,.8);
  }
  .flash.on { opacity: 1; transform: translate(-50%, 0); }

  /* ---- onglets ---- */
  /* En bas : c'est là que le pouce arrive sans changer la prise en main. */
  nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    display: flex; gap: 4px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    background: rgba(10,11,20,.92); backdrop-filter: blur(14px);
    border-top: 1px solid var(--line);
  }
  nav button {
    flex: 1; min-height: 50px; border-radius: 14px; background: none; border: 0;
    color: var(--faint); font-size: .68rem; font-weight: 600; gap: 3px;
    flex-direction: column; padding: 0;
  }
  nav button[aria-current='true'] { color: var(--accent); background: var(--accent-soft); }
  nav svg { width: 19px; height: 19px; }

  /* ---- filtres de la bibliothèque ---- */
  .filters { display: flex; gap: 6px; overflow-x: auto; padding: 0 0 12px; margin: 0 -14px; padding-inline: 14px; scrollbar-width: none; }
  .filters::-webkit-scrollbar { display: none; }
  .chip {
    flex: none; min-height: 34px; padding: 0 13px; border-radius: 99px;
    background: var(--panel); border: 1px solid var(--line); color: var(--muted);
    font-size: .78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;
  }
  .chip[aria-pressed='true'] { background: var(--accent-soft); border-color: rgba(124,92,255,.4); color: var(--accent); }
  .chip small { opacity: .65; font-size: .92em; }

  /* ---- catalogue ---- */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 12px; }
  .tile img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 12px; background: var(--panel-2); display: block; }
  .tile .title { font-size: .78rem; margin-top: 6px; }
  .tile .meta { font-size: .7rem; margin-top: 2px; }
  .tile button { width: 100%; margin-top: 6px; min-height: 36px; font-size: .74rem; }
  .owned { color: var(--accent); font-size: .7rem; font-weight: 600; margin-top: 6px; display: block; text-align: center; min-height: 36px; line-height: 36px; }

  .search { display: flex; gap: 8px; margin-bottom: 14px; }

  .skel { height: 138px; border-radius: 18px; background: var(--panel); margin-bottom: 12px; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .5 } }
`

const SCRIPT = `
  var KEY = 'animelist-remote-token'
  var url = new URL(location.href)
  var fromUrl = url.searchParams.get('t')
  if (fromUrl) {
    localStorage.setItem(KEY, fromUrl)
    // Retiré de la barre d'adresse : sinon le mot de passe reste dans
    // l'historique du téléphone et part dans le « Referer » du lien suivant.
    url.searchParams.delete('t')
    history.replaceState(null, '', url.pathname)
  }
  var token = localStorage.getItem(KEY) || ''

  var appEl = document.getElementById('app')
  var playerEl = document.getElementById('player')
  var countEl = document.getElementById('count')
  var flashEl = document.getElementById('flash')

  // Vrai pendant qu'on fait glisser : sinon le rafraîchissement remettrait le
  // curseur là où la vidéo en est, et il sauterait sous le doigt.
  var dragging = false
  var flashTimer = null

  // ---------------------------------------------------------------- outils

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function mmss(total) {
    total = Math.max(0, Math.floor(total || 0))
    var s = total % 60, m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600)
    var mm = h > 0 ? String(m).padStart(2, '0') : String(m)
    return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
  }

  // « dans 2 j », « dans 5 h » : de quoi savoir s'il faut attendre ce soir ou
  // la semaine prochaine, sans embarquer de bibliothèque de dates.
  function when(airingAt) {
    if (!airingAt) return 'pas encore sorti'
    var left = airingAt * 1000 - Date.now()
    if (left <= 0) return 'sort maintenant'
    var days = Math.floor(left / 86400000)
    if (days >= 1) return 'dans ' + days + ' j'
    var hours = Math.floor(left / 3600000)
    if (hours >= 1) return 'dans ' + hours + ' h'
    return 'dans ' + Math.max(1, Math.floor(left / 60000)) + ' min'
  }

  // Des icônes en ligne : une police d'icônes serait une requête vers
  // l'extérieur, et cette page doit tenir en une seule.
  var PATHS = {
    check: 'M20 6 9 17l-5-5',
    play: 'M6 3l14 9-14 9z',
    film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16',
    info: 'M12 8h.01M11 12h1v4h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
    expand: 'M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5',
    shrink: 'M3 8h5V3M21 8h-5V3M21 16h-5v5M3 16h5v5',
    close: 'M18 6 6 18M6 6l12 12',
    volume: 'M11 5 6 9H3v6h3l5 4zM16 9a4 4 0 0 1 0 6',
    clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
    books: 'M4 4h5v16H4zM11 4h4v16h-4zM17.5 5l3.2 15',
    compass: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM15.5 8.5l-2 5-5 2 2-5z',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3'
  }
  function icon(name) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
      PATHS[name] + '"/></svg>'
  }

  function btn(attrs, label, name, klass) {
    return '<button class="' + (klass || '') + '" ' + attrs + '>' + (name ? icon(name) : '') + label + '</button>'
  }

  function say(text) {
    flashEl.textContent = text
    flashEl.classList.add('on')
    clearTimeout(flashTimer)
    flashTimer = setTimeout(function () { flashEl.classList.remove('on') }, 1800)
  }

  async function call(path, sent) {
    var res = await fetch(path, {
      method: sent ? 'POST' : 'GET',
      headers: sent
        ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
        : { Authorization: 'Bearer ' + token },
      body: sent ? JSON.stringify(sent) : undefined
    })
    if (res.status === 401) throw new Error('unauthorized')
    // Le nom doit rester distinct du paramètre : redéclarer un identifiant
    // empêche tout le script de se parser, et la page ne démarre jamais.
    var answer = await res.json().catch(function () { return null })
    // Le serveur explique ses refus : « pas encore sorti » vaut mieux que 409.
    if (!res.ok) throw new Error((answer && answer.error) || 'Le PC a répondu ' + res.status)
    return answer
  }

  // ---------------------------------------------------------------- rendu

  function askToken(message) {
    playerEl.innerHTML = ''
    countEl.textContent = ''
    appEl.innerHTML =
      '<div class="err">' + esc(message) + '</div>' +
      '<form id="f"><input type="text" id="t" placeholder="mot de passe" autocapitalize="off" ' +
      'autocomplete="off" spellcheck="false"><button>Entrer</button></form>'
    document.getElementById('f').onsubmit = function (e) {
      e.preventDefault()
      token = document.getElementById('t').value.trim()
      localStorage.setItem(KEY, token)
      load()
    }
  }

  function renderPlayer(p) {
    if (!p) { playerEl.innerHTML = ''; return }
    if (dragging) return

    var cover = p.cover ? '<img src="' + esc(p.cover) + '" alt="">' : ''
    var label = p.kind === 'trailer' ? 'Bande-annonce' : 'Anime-Sama'
    var sub = p.episode ? '<div class="note">Épisode ' + p.episode + '</div>' : ''
    // Un lecteur hors d'atteinte le dit, plutôt que d'afficher des boutons muets.
    // Tant qu'aucune vidéo n'a été trouvée dans la page, il n'y a rien à
    // piloter — le lecteur charge encore, ou la page n'en contient pas.
    var limit = p.canSeek
      ? ''
      : '<div class="note">Lecteur pas encore prêt : les commandes apparaîtront dès que la vidéo démarre.</div>'

    var seek = p.canSeek && p.duration > 0
      ? '<div class="seekline">' +
          '<span class="time">' + mmss(p.position) + '</span>' +
          '<input type="range" id="seek" min="0" max="' + Math.floor(p.duration) + '" ' +
          'value="' + Math.floor(p.position) + '" aria-label="Position">' +
          '<span class="time right">' + mmss(p.duration) + '</span>' +
        '</div>' +
        '<div class="volline">' + icon('volume') +
          '<input type="range" id="vol" min="0" max="100" value="' + Math.round(p.volume) + '" aria-label="Volume">' +
        '</div>'
      : ''

    playerEl.innerHTML = ''
    countEl.textContent = ''
    appEl.innerHTML =
      '<div class="err">' + esc(message) + '</div>' +
      '<form id="f"><input type="text" id="t" placeholder="mot de passe" autocapitalize="off" ' +
      'autocomplete="off" spellcheck="false"><button>Entrer</button></form>'
    document.getElementById('f').onsubmit = function (e) {
      e.preventDefault()
      token = document.getElementById('t').value.trim()
      localStorage.setItem(KEY, token)
      load()
    }
  }

  function renderPlayer(p) {
    if (!p) { playerEl.innerHTML = ''; return }
    if (dragging) return

    var cover = p.cover ? '<img src="' + esc(p.cover) + '" alt="">' : ''
    var label = p.kind === 'trailer' ? 'Bande-annonce' : 'Anime-Sama'
    var sub = p.episode ? '<div class="note">Épisode ' + p.episode + '</div>' : ''
    // Un lecteur hors d'atteinte le dit, plutôt que d'afficher des boutons muets.
    var limit = p.canSeek
      ? ''
      : '<div class="note">Leur lecteur vit dans un cadre d’un autre site : seule la fenêtre se pilote d’ici.</div>'

    var seek = p.canSeek && p.duration > 0
      ? '<div class="seekline">' +
          '<span class="time">' + mmss(p.position) + '</span>' +
          '<input type="range" id="seek" min="0" max="' + Math.floor(p.duration) + '" ' +
          'value="' + Math.floor(p.position) + '" aria-label="Position">' +
          '<span class="time right">' + mmss(p.duration) + '</span>' +
        '</div>' +
        '<div class="volline">' + icon('volume') +
          '<input type="range" id="vol" min="0" max="100" value="' + Math.round(p.volume) + '" aria-label="Volume">' +
        '</div>'
      : ''


    playerEl.innerHTML =
      '<div class="player">' +
        '<div class="top">' + cover +
          '<div class="grow">' +
            '<span class="badge">' + label + '</span>' +
            '<div class="name">' + esc(p.title) + '</div>' + sub +
          '</div>' +
        '</div>' +
        limit + seek +
        '<div class="acts">' +
          (p.canSeek
            ? btn('data-act="' + (p.playing ? 'pause' : 'play') + '"', p.playing ? 'Pause' : 'Lecture',
                  p.playing ? 'pause' : 'play', '')
            : '') +
          btn('data-act="' + (p.fullscreen ? 'windowed' : 'fullscreen') + '"',
              p.fullscreen ? 'Fenêtre' : 'Plein écran', p.fullscreen ? 'shrink' : 'expand', 'ghost') +
          btn('data-act="close"', 'Fermer', 'close', 'ghost') +
        '</div>' +
      '</div>'

    var seekEl = document.getElementById('seek')
    if (seekEl) {
      seekEl.addEventListener('input', function () { dragging = true })
      seekEl.addEventListener('change', function () { dragging = false; control('seek', Number(seekEl.value)) })
    }
    var volEl = document.getElementById('vol')
    if (volEl) {
      volEl.addEventListener('input', function () { dragging = true })
      volEl.addEventListener('change', function () { dragging = false; control('volume', Number(volEl.value)) })
    }
  }

  /**
   * Le choix d'épisode, déplié dans la carte de sa série.
   *
   * Une seule à la fois : deux grilles ouvertes sur un écran de téléphone, on
   * ne sait plus laquelle on touche.
   */
  var eps = { id: 0, data: null, mode: 'watch' }

  function renderEpisodes(s) {
    if (eps.id !== s.id) return ''
    if (!eps.data) return '<div class="eps"><div class="note">Chargement des épisodes…</div></div>'

    var seen = {}
    eps.data.watched.forEach(function (n) { seen[n] = true })
    var total = eps.data.total || eps.data.lastAired || 0
    if (!total) return '<div class="eps"><div class="note">Aucun épisode connu pour cette série.</div></div>'

    var nums = ''
    for (var n = 1; n <= total; n++) {
      // Au-delà du dernier diffusé, il n'y a rien à regarder ni à cocher.
      var off = n > eps.data.lastAired
      nums += '<button class="num" data-act="ep" data-id="' + s.id + '" data-ep="' + n + '" ' +
        'data-seen="' + !!seen[n] + '" data-off="' + off + '"' + (off ? ' disabled' : '') + '>' + n + '</button>'
    }

    // Trois modes annoncés plutôt qu'un appui long : sur un téléphone, un
    // geste caché n'est pas une fonction, c'est un piège.
    var MODES = [
      ['watch', 'Regarder', 'Touche un numéro pour l’ouvrir sur le PC.'],
      ['tick', 'Cocher', 'Touche un numéro pour le cocher, ou le décocher s’il l’est déjà.'],
      ['upto', 'Jusqu’ici', 'Touche un numéro pour marquer vus tous les épisodes jusque-là.']
    ]
    var modes = MODES.map(function (m) {
      return '<button class="chip" data-act="epmode" data-mode="' + m[0] + '" aria-pressed="' +
        (eps.mode === m[0]) + '">' + m[1] + '</button>'
    }).join('')
    var hint = (MODES.find(function (m) { return m[0] === eps.mode }) || MODES[0])[2]

    return '<div class="eps">' +
      '<div class="modes">' + modes + '</div>' +
      '<div class="nums">' + nums + '</div>' +
      '<div class="note">' + hint + '</div>' +
    '</div>'
  }

  /** Les mots de l'app pour chaque statut, employés par la carte et par les filtres. */
  var STATUS = {
    watching: 'En cours',
    planned: 'À voir',
    completed: 'Terminé',
    paused: 'En pause',
    dropped: 'Abandonné'
  }

  function card(s) {
    var total = s.total || 0
    var done = total ? Math.round((s.seen / total) * 100) : 0
    // Trois cas, et le premier n'existe que dans l'onglet Bibliothèque : une
    // série dont tout est vu n'a plus d'épisode suivant. Sans ce cas, la carte
    // annonçait « Épisode null » et offrait un bouton qui partait en erreur.
    var meta = s.episode === null
      ? STATUS[s.status] + ' · ' + s.seen + (s.seen > 1 ? ' épisodes vus' : ' épisode vu')
      : s.unaired
        ? '<span class="soon">Épisode ' + s.episode + ' ' + when(s.airingAt) + '</span>'
        : '<b>Épisode ' + s.episode + '</b>' + (total ? ' sur ' + total : '') + ' · ' + s.seen + ' vus'

    // Un épisode à venir ne se coche pas : la place du bouton dit pourquoi,
    // plutôt que de laisser essayer et refuser après coup.
    var first = s.episode === null
      ? ''
      : s.unaired
        ? '<span class="pill">' + icon('clock') + 'À venir</span>'
        : btn('data-act="tick" data-id="' + s.id + '" data-ep="' + s.episode + '"', 'Vu', 'check', '')

    // La bande-annonce n'apparaît que s'il y en a une : un bouton qui répond
    // « il n'y en a pas » ne valait pas la place qu'il prend.
    var ba = s.trailer
      ? btn('data-act="trailer" data-id="' + s.id + '"', 'Bande-annonce', 'film', 'ghost')
      : ''

    /**
     * « Regarder » lance l'épisode suivant quand il y en a un à lancer.
     *
     * Quand il n'y en a pas — tout est vu, ou le suivant n'est pas encore
     * sorti — le bouton ouvre la liste plutôt que de ne rien faire : c'est
     * exactement le moment où l'on veut choisir soi-même.
     */
    var lancable = s.episode !== null && !s.unaired
    var regarder = lancable
      ? btn('data-act="watch" data-id="' + s.id + '" data-ep="' + s.episode + '"', 'Regarder', 'play', 'ghost')
      : total
        ? btn('data-act="eps" data-id="' + s.id + '"', 'Choisir', 'play', 'ghost')
        : ''

    return '<div class="card">' +
      '<div class="row">' +
        '<img src="' + esc(s.cover) + '" alt="" loading="lazy">' +
        '<div class="info">' +
          '<div class="title">' + esc(s.title) + '</div>' +
          '<div class="meta">' + meta + '</div>' +
          (total ? '<div class="bar"><i style="width:' + done + '%"></i></div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="acts">' + first + regarder + ba +
        btn('data-act="open" data-id="' + s.id + '"', 'Fiche', 'info', 'ghost') +
        (lancable && total ? btn('data-act="eps" data-id="' + s.id + '"', 'Épisodes', 'list', 'ghost') : '') +
      '</div>' +
      renderEpisodes(s) +
    '</div>'
  }

  function render(state) {
    renderPlayer(state.player)
    if (tab !== 'home') return
    var n = state.series.length
    countEl.textContent = n ? n + (n > 1 ? ' séries en cours' : ' série en cours') : 'Rien en cours'
    if (!n) {
      appEl.innerHTML = '<div class="empty">Rien à reprendre.<br>Commence une série sur le PC, elle apparaîtra ici.</div>'
      return
    }
    appEl.innerHTML = state.series.map(card).join('')
  }

  // ---------------------------------------------------------------- onglets

  var tab = 'home'
  var filter = 'all'
  var query = ''
  var discoverTab = 'trending'

  var TABS = [
    { id: 'home', label: 'Accueil', icon: 'home' },
    { id: 'library', label: 'Bibliothèque', icon: 'books' },
    { id: 'discover', label: 'Découvrir', icon: 'compass' }
  ]

  function renderNav() {
    document.getElementById('nav').innerHTML = TABS.map(function (t) {
      return '<button data-act="tab" data-tab="' + t.id + '" aria-current="' + (tab === t.id) + '">' +
        icon(t.icon) + t.label + '</button>'
    }).join('')
  }

  function renderLibrary(rows) {
    var counts = {}
    rows.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1 })

    var chips = '<button class="chip" data-act="filter" data-filter="all" aria-pressed="' + (filter === 'all') + '">' +
      'Tout <small>' + rows.length + '</small></button>' +
      Object.keys(STATUS).filter(function (k) { return counts[k] }).map(function (k) {
        return '<button class="chip" data-act="filter" data-filter="' + k + '" aria-pressed="' + (filter === k) + '">' +
          STATUS[k] + ' <small>' + counts[k] + '</small></button>'
      }).join('')

    var shown = filter === 'all' ? rows : rows.filter(function (r) { return r.status === filter })
    countEl.textContent = rows.length + (rows.length > 1 ? ' séries suivies' : ' série suivie')
    appEl.innerHTML = '<div class="filters">' + chips + '</div>' +
      (shown.length ? shown.map(card).join('') : '<div class="empty">Rien dans cette liste.</div>')
  }

  function tile(m) {
    var meta = [m.year, m.episodes ? m.episodes + ' ép.' : '', m.score ? m.score + ' %' : '']
      .filter(Boolean).join(' · ')
    // Une série déjà suivie le dit, plutôt que d'offrir un bouton qui ferait
    // doublon avec ce qu'on a déjà.
    var action = m.owned
      ? '<span class="owned">Déjà suivie</span>'
      : btn('data-act="add" data-id="' + m.id + '"', 'Ajouter', 'plus', 'ghost')
    return '<div class="tile">' +
      '<img src="' + esc(m.cover) + '" alt="" loading="lazy" data-act="open" data-id="' + m.id + '">' +
      '<div class="title">' + esc(m.title) + '</div>' +
      (meta ? '<div class="meta">' + meta + '</div>' : '') +
      action +
    '</div>'
  }

  function renderDiscover(items) {
    var tabs = [['trending', 'Tendances'], ['season', 'Cette saison']].map(function (t) {
      return '<button class="chip" data-act="dtab" data-tab="' + t[0] + '" aria-pressed="' +
        (!query && discoverTab === t[0]) + '">' + t[1] + '</button>'
    }).join('')

    countEl.textContent = query ? 'Résultats pour « ' + query + ' »' : 'Le catalogue AniList'
    appEl.innerHTML =
      '<div class="search">' +
        '<input type="text" id="q" placeholder="Rechercher un titre…" value="' + esc(query) + '" ' +
        'autocapitalize="off" autocomplete="off">' +
        btn('data-act="search"', '', 'search', 'ghost') +
      '</div>' +
      '<div class="filters">' + tabs + '</div>' +
      (items.length ? '<div class="grid">' + items.map(tile).join('') + '</div>'
                    : '<div class="empty">Aucun titre ne correspond.</div>')

    var q = document.getElementById('q')
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { query = q.value.trim(); load() }
    })
  }

  // ---------------------------------------------------------------- actions

  async function send(action, extra) {
    var payload = { action: action }
    for (var k in extra) payload[k] = extra[k]
    try {
      var answer = await call('/api/control', payload)
      // Un clic ou une touche ne change pas la barre : la redessiner ferait
      // se replier le pavé qu'on est en train d'utiliser.
      if (answer.player && action !== 'click' && action !== 'key') renderPlayer(answer.player)
    } catch (err) {
      say(err.message)
      load()
    }
  }

  function control(action, value) {
    return send(action, { value: value })
  }

  var CONTROLS = ['play', 'pause', 'fullscreen', 'windowed', 'close']

  // Un seul écouteur pour toute la page : les boutons portent leur intention
  // en attributs, et rien n'a besoin d'exister dans l'espace global.
  document.addEventListener('click', async function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null
    if (!el) return
    var action = el.getAttribute('data-act')
    var id = Number(el.getAttribute('data-id'))
    var ep = Number(el.getAttribute('data-ep'))

    // Changer de vue ne demande rien au PC tant qu'on n'a pas les données.
    if (action === 'tab') {
      tab = el.getAttribute('data-tab')
      appEl.innerHTML = '<div class="skel"></div><div class="skel"></div>'
      return load()
    }
    if (action === 'filter') { filter = el.getAttribute('data-filter'); return load() }

    // Déplier, ou replier si c'était déjà celle-là.
    if (action === 'eps') {
      var wanted = Number(el.getAttribute('data-id'))
      if (eps.id === wanted) { eps = { id: 0, data: null, mode: eps.mode }; return load() }
      eps = { id: wanted, data: null, mode: eps.mode }
      load()
      try {
        var got = await call('/api/episodes?id=' + wanted)
        // La grille a pu être refermée, ou une autre ouverte, pendant l'attente.
        if (eps.id === wanted) { eps.data = got; load() }
      } catch (err) {
        say(err.message)
      }
      return
    }

    if (action === 'epmode') { eps.mode = el.getAttribute('data-mode'); return load() }

    if (action === 'ep') {
      var epId = Number(el.getAttribute('data-id'))
      var epNo = Number(el.getAttribute('data-ep'))
      el.disabled = true
      try {
        if (eps.mode === 'watch') {
          renderPlayer((await call('/api/watch', { id: epId, episode: epNo })).player)
          say('Épisode ' + epNo + ' ouvert sur le PC')
          // La grille se replie : le choix est fait, elle n'a plus rien à dire.
          eps = { id: 0, data: null, mode: eps.mode }
        } else {
          var isSeen = el.getAttribute('data-seen') === 'true'
          await call('/api/tick', {
            id: epId,
            episode: epNo,
            // En mode « cocher », toucher un épisode déjà vu le retire : c'est
            // le seul moyen de corriger une erreur depuis le téléphone.
            watched: eps.mode === 'upto' ? true : !isSeen,
            upTo: eps.mode === 'upto'
          })
          say(eps.mode === 'upto' ? 'Vus jusqu’à l’épisode ' + epNo : (isSeen ? 'Épisode ' + epNo + ' décoché' : 'Épisode ' + epNo + ' coché'))
          eps.data = await call('/api/episodes?id=' + epId)
        }
      } catch (err) {
        say(err.message)
      } finally {
        el.disabled = false
      }
      return load()
    }
    if (action === 'dtab') { discoverTab = el.getAttribute('data-tab'); query = ''; return load() }
    if (action === 'search') { query = (document.getElementById('q') || {}).value || ''; return load() }

    if (CONTROLS.indexOf(action) >= 0) {
      el.disabled = true
      await control(action, 0)
      el.disabled = false
      return
    }

    // Le bouton s'éteint le temps de la réponse : « Regarder » interroge
    // Anime-Sama et prend parfois deux secondes ; sans retour, on tape trois fois.
    var before = el.innerHTML
    el.disabled = true
    el.innerHTML = '…'
    try {
      if (action === 'tick') {
        render(await call('/api/tick', { id: id, episode: ep }))
        say('Épisode ' + ep + ' coché')
        return
      }
      if (action === 'add') {
        await call('/api/add', { id: id })
        say('Ajoutée à ta liste')
        return load()
      }
      if (action === 'watch') {
        renderPlayer((await call('/api/watch', { id: id, episode: ep })).player)
        say('Lecteur ouvert sur le PC')
      } else if (action === 'trailer') {
        renderPlayer((await call('/api/trailer', { id: id })).player)
        say('Bande-annonce lancée')
      } else if (action === 'open') {
        await call('/api/open', { id: id })
        say('Fiche ouverte sur le PC')
      }
    } catch (err) {
      say(err.message)
      // Un refus veut souvent dire que la page date : on relit.
      load()
    } finally {
      el.disabled = false
      el.innerHTML = before
    }
  })

  async function load() {
    renderNav()
    try {
      if (tab === 'library') return renderLibrary((await call('/api/library')).rows)
      if (tab === 'discover') {
        appEl.innerHTML = '<div class="skel"></div><div class="skel"></div>'
        var q = query ? '&q=' + encodeURIComponent(query) : ''
        return renderDiscover((await call('/api/discover?kind=' + discoverTab + q)).items)
      }
      render(await call('/api/state'))
    } catch (err) {
      if (err.message === 'unauthorized') askToken('Mot de passe demandé.')
      else appEl.innerHTML = '<div class="err">' + esc(err.message) + '</div>'
    }
  }

  load()
  // La bibliothèque bouge lentement ; une vidéo qui joue, non. Deux rythmes,
  // et le second passe par une adresse légère : relire les entrées, les fiches
  // et le journal entier toutes les deux secondes pour trois nombres serait
  // absurde.
  //
  // Le rafraîchissement de fond ne concerne que l'accueil : recharger le
  // catalogue sous les doigts, ou remettre les filtres à zéro pendant qu'on
  // lit, serait une nuisance.
  setInterval(function () { if (tab === 'home') load() }, 20000)
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
<meta name="theme-color" content="#07080f">
<title>AnimeList — télécommande</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Anime<span>List</span></h1>
  <p class="sub" id="count">Chargement…</p>
</header>
<div id="player"></div>
<div id="app"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
<div class="flash" id="flash"></div>
<nav id="nav"></nav>
<script>${SCRIPT}</script>
</body>
</html>`
}
