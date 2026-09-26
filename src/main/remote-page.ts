import { BRANCH_LABELS } from '@shared/franchise'

/**
 * La page servie à la télécommande : téléphone, tablette, écran de bureau, TV.
 *
 * Une seule page, sans dépendance et sans build : elle doit s'ouvrir sur un
 * navigateur quelconque, en une requête, sans rien charger d'ailleurs.
 *
 * **Une page, quatre écrans.** Elle a d'abord été dessinée pour un pouce, et
 * bornée à une colonne de téléphone partout ailleurs — ouverte sur une
 * tablette ou un ordinateur, elle laissait les deux tiers de l'écran vides.
 * Elle se déplie désormais selon la place :
 *
 * - téléphone : une colonne, les onglets en bas sous le pouce, le lecteur collé
 *   en haut ;
 * - tablette (700 px) : les onglets passent en rail sur le côté ;
 * - bureau (1000 px) : la fiche d'une série s'ouvre dans une colonne à droite,
 *   avec le lecteur, sans quitter la liste qu'on parcourt ;
 * - grand écran et TV : le texte grandit avec l'écran, et les flèches du
 *   clavier ou de la télécommande de la TV vont d'un bouton à son voisin.
 *
 * **La frise d'épisodes** est la signature, reprise du nouveau design de
 * l'app : un trait par épisode — vu, sorti sans toi, à venir, le suivant —,
 * teinté de la couleur de la jaquette. Elle dit d'un coup d'œil où l'on en
 * est, ce qu'une barre de progression ne dit pas : un trou au milieu, trois
 * épisodes sortis cette semaine.
 *
 * Le mot de passe arrive par l'adresse — seul moyen de le donner quand on
 * scanne un lien — puis est rangé dans le stockage local et retiré de la barre
 * d'adresse : il n'a pas à rester dans l'historique ni à repartir dans le
 * « Referer » d'un lien suivant.
 *
 * Tout passe par un seul écouteur de clic et des attributs `data-`. Les
 * gestionnaires en ligne obligeaient à imbriquer des guillemets dans un gabarit
 * qui les mange — une faute invisible jusqu'au téléphone, et qui empêche le
 * script entier de se parser. Pour la même raison, le script n'emploie ni
 * accent grave ni barre oblique inverse : le gabarit TypeScript les
 * interpréterait.
 */

const STYLE = `
  :root {
    color-scheme: dark;
    --bg: #07080f;
    --panel: #11131d;
    --panel-2: #181b28;
    --line: #22263a;
    --text: #e9ebf3;
    --muted: #9aa1b8;
    --faint: #6b7392;
    --accent: #7c5cff;
    --accent-soft: rgba(124,92,255,.16);
    --accent-line: rgba(124,92,255,.45);
    --amber: #ffb038;
    --danger: #ff9b9b;
    --gutter: 16px;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  /*
   * Le texte suit l'écran : 15 px sur un téléphone, 16 à 17 sur un portable,
   * jusqu'à 22 sur une TV vue du canapé. Tout le reste est en rem et suit.
   */
  html { font-size: clamp(15px, calc(10px + .42vw), 22px); -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 1rem/1.5 "Segoe UI Variable Text", "SF Pro Text", system-ui, -apple-system, Roboto, sans-serif;
    min-height: 100vh;
  }
  button, input { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }

  /* ---------------------------------------------------------------- charpente */

  .shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "player" "main";
    max-width: 40rem;
    margin: 0 auto;
    padding: 0 var(--gutter) calc(6rem + env(safe-area-inset-bottom));
  }
  /* Sur un téléphone la colonne de droite n'existe pas : ses enfants
     rejoignent la grille, le lecteur en tête. */
  .col { display: contents; }
  #player { grid-area: player; position: sticky; top: 0; z-index: 5; padding-top: .5rem; }
  #player:empty { padding: 0; }
  main { grid-area: main; min-width: 0; }
  #side { display: none; }

  header { padding: calc(1.2rem + env(safe-area-inset-top)) 0 1rem; }
  .brand { margin: 0; font-size: 1rem; font-weight: 650; letter-spacing: -.01em; color: var(--muted); }
  .lede { margin: .25rem 0 0; font-size: 1.45rem; line-height: 1.2; font-weight: 650; letter-spacing: -.025em; max-width: 30ch; }
  /* Hors ligne : ce qu'on voit reste lisible, et la ligne dit de quand il date. */
  .offline {
    display: flex; align-items: center; gap: .5rem; margin: .75rem 0 0; padding: .55rem .8rem;
    border: 1px solid var(--line); border-radius: 12px; background: var(--panel);
    color: var(--muted); font-size: .85rem; line-height: 1.4; max-width: 34rem;
  }
  .offline::before { content: ''; flex: none; width: .5rem; height: .5rem; border-radius: 50%; background: var(--amber); }
  .offline[hidden] { display: none; }

  /* Onglets : en bas, là où le pouce arrive sans changer la prise en main. */
  nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    display: flex; gap: 4px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    background: rgba(9,10,18,.94); backdrop-filter: blur(14px);
    border-top: 1px solid var(--line);
  }
  nav button {
    /* La hauteur fait la cible, pas la largeur : cinq onglets doivent tenir. */
    flex: 1; min-width: 0; min-height: 3.2rem; border: 0; border-radius: 12px; background: none;
    color: var(--faint); font-size: .7rem; font-weight: 600;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer;
  }
  nav button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  nav button[aria-current='true'] { color: var(--text); background: var(--accent-soft); }
  nav svg { width: 1.25rem; height: 1.25rem; }

  /* Tablette : le rail. La page gagne sa largeur, les onglets leur place. */
  @media (min-width: 700px) {
    .shell {
      max-width: none;
      grid-template-columns: 5.5rem minmax(0, 1fr);
      grid-template-areas: "nav player" "nav main";
      grid-template-rows: auto 1fr;
      column-gap: 1.75rem;
      /* Pas de marge sous la grille : le rail fait déjà toute la hauteur, et
         elle ajoutait une barre de défilement à une page qui tient. */
      padding: 0 1.75rem 0 0;
    }
    main { padding-bottom: 2rem; }
    nav {
      grid-area: nav; grid-row: 1 / span 2;
      position: sticky; top: 0; left: auto; right: auto; bottom: auto;
      height: 100vh; height: 100dvh;
      flex-direction: column; justify-content: flex-start; gap: .4rem;
      padding: 1.25rem .6rem; background: none; backdrop-filter: none;
      border-top: 0; border-right: 1px solid var(--line);
    }
    nav button { flex: none; min-height: 4.2rem; }
    header { padding-top: 1.75rem; }
    .lede { font-size: 1.75rem; }
  }

  /* Bureau : la fiche et le lecteur dans leur colonne, la liste reste là. */
  @media (min-width: 1000px) {
    .shell {
      grid-template-columns: 5.5rem minmax(0, 1fr) minmax(21rem, 27rem);
      grid-template-areas: "nav main col";
      grid-template-rows: auto;
    }
    nav { grid-row: auto; }
    .col {
      grid-area: col; display: flex; flex-direction: column; gap: 1rem;
      position: sticky; top: 0; max-height: 100vh; max-height: 100dvh; overflow-y: auto;
      padding: 1.75rem 0 1.5rem; scrollbar-width: thin;
    }
    #player { position: static; padding: 0; }
    #side { display: block; }
    /* Sans fiche possible ni vidéo en cours, la colonne s'efface et rend sa
       place : un programme ou un catalogue n'ont rien à y mettre. */
    .shell[data-col='off'] { grid-template-columns: 5.5rem minmax(0, 1fr); grid-template-areas: "nav main"; }
    .shell[data-col='off'] .col { display: none; }
  }
  @media (min-width: 1700px) {
    .shell { grid-template-columns: 6rem minmax(0, 1fr) minmax(24rem, 31rem); column-gap: 2.5rem; }
  }

  /* ---------------------------------------------------------------- la frise */

  /*
   * Un trait par épisode. La couleur de la série pour ce qui est vu, l'ambre
   * pour ce qui est sorti sans toi, un trait éteint pour ce qui n'est pas
   * diffusé, et un contour clair pour le suivant.
   */
  .frise { display: flex; align-items: stretch; gap: 2px; height: .7rem; margin-top: .55rem; }
  .frise i { flex: 1 1 0; min-width: 2px; max-width: .7rem; border-radius: 2px; background: var(--line); }
  .frise i.s { background: var(--c, var(--accent)); }
  .frise i.a { background: var(--amber); }
  .frise i.n { box-shadow: 0 0 0 1.5px var(--text); }
  .frise.big { height: 1.1rem; gap: 3px; margin-top: 1rem; }
  .frise.big i { max-width: 1rem; border-radius: 3px; }
  /* Quarante-huit traits à 2 px, écarts compris, demandaient 190 px : sur un
     téléphone de 360 px, la carte d'une longue série débordait de l'écran et
     toute la page glissait de côté. */
  @media (max-width: 420px) {
    .frise:not(.big) { gap: 1px; }
    .frise i { min-width: 1px; }
  }
  .legend { display: flex; flex-wrap: wrap; gap: .35rem 1rem; margin-top: .55rem; color: var(--muted); font-size: .76rem; }
  .legend span { display: inline-flex; align-items: center; gap: .4rem; }
  .legend i { width: .55rem; height: .75rem; border-radius: 2px; background: var(--line); display: inline-block; }
  .legend i.s { background: var(--c, var(--accent)); }
  .legend i.a { background: var(--amber); }
  .legend i.n { box-shadow: 0 0 0 1.5px var(--text); }

  /* ---------------------------------------------------------------- séries */

  .group { margin: 0 0 1.75rem; }
  .group h2 { margin: 0 0 .15rem; font-size: 1.05rem; font-weight: 650; letter-spacing: -.01em; }
  .group > p { margin: 0 0 .8rem; color: var(--muted); font-size: .84rem; }

  /* Une série en cours : de quoi choisir, et les deux gestes du soir. */
  .rows { display: grid; gap: .6rem; }
  @media (min-width: 1300px) { .rows { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .srow {
    display: flex; align-items: center; gap: .75rem; padding: .6rem;
    border-radius: 16px; background: var(--panel); border: 1px solid var(--line);
  }
  .srow[aria-current='true'] { border-color: var(--accent-line); background: var(--panel-2); }
  .srow .pick {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: .8rem;
    background: none; border: 0; padding: 0; text-align: left; cursor: pointer; border-radius: 10px;
  }
  .srow img { width: 3.2rem; height: 4.5rem; border-radius: 9px; object-fit: cover; flex: none; background: var(--panel-2); }
  .srow .info { min-width: 0; flex: 1; }
  .title { font-weight: 650; font-size: .95rem; line-height: 1.28; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .meta { color: var(--muted); font-size: .8rem; margin-top: .2rem; }
  .meta b { color: var(--text); font-weight: 650; }
  .soon { color: var(--amber); }
  .quick { display: flex; gap: .4rem; flex: none; }

  /* Un bouton rond pour un geste sans libellé : cocher, lancer. */
  .round {
    width: 2.9rem; height: 2.9rem; border-radius: 50%; flex: none; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
  }
  .round.go { background: var(--accent); border-color: var(--accent); color: #fff; }
  .round svg { width: 1.15rem; height: 1.15rem; }
  .round:active, .btn:active { transform: scale(.96); }
  .round[disabled], .btn[disabled] { opacity: .45; }

  /* ---------------------------------------------------------------- grilles */

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.9rem, 1fr)); gap: 1rem .8rem; }
  /*
   * Une colonne calée en haut, pas un bloc : un bouton centre verticalement son
   * contenu quand la rangée est plus haute que lui. Une case voisine au titre
   * sur deux lignes faisait descendre toutes les jaquettes de sa rangée.
   */
  .tile {
    position: relative; display: flex; flex-direction: column; justify-content: flex-start;
    width: 100%; padding: 0; text-align: left;
    background: none; border: 0; cursor: pointer; border-radius: 12px;
  }
  .tile img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 12px; background: var(--panel-2); display: block; }
  .tile[aria-current='true'] img { outline: 2px solid var(--accent); outline-offset: 2px; }
  .tile .title { font-size: .8rem; margin-top: .45rem; }
  .tile .meta { font-size: .72rem; margin-top: .1rem; }
  .tile .frise { height: .45rem; margin-top: .4rem; gap: 1px; }
  /* Le retard sur la jaquette : c'est ce qu'on vient chercher depuis le canapé. */
  .tile .late {
    position: absolute; top: .4rem; right: .4rem; padding: .1rem .45rem; border-radius: 99px;
    font-size: .7rem; font-weight: 700; color: #1a1204; background: var(--amber);
  }
  /* Le bouton au pied de la case, aligné d'une case à l'autre quel que soit
     le nombre de lignes du titre. */
  .tile-wrap { display: flex; flex-direction: column; gap: .45rem; }
  .tile-wrap .btn { margin-top: auto; min-height: 2.3rem; font-size: .76rem; }
  .owned { color: var(--muted); font-size: .74rem; margin-top: auto; min-height: 2.3rem; display: flex; align-items: center; justify-content: center; }

  /* ---------------------------------------------------------------- boutons */

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
    min-height: 2.75rem; padding: 0 1rem; border-radius: 12px; cursor: pointer;
    font-size: .85rem; font-weight: 600; border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
  }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn svg { width: 1rem; height: 1rem; flex: none; }
  .acts { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
  .acts .btn { flex: 1 1 auto; }

  .chips { display: flex; gap: .4rem; overflow-x: auto; padding-bottom: .9rem; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    flex: none; min-height: 2.3rem; padding: 0 .9rem; border-radius: 99px; cursor: pointer;
    background: var(--panel); border: 1px solid var(--line); color: var(--muted);
    font-size: .8rem; font-weight: 600; display: inline-flex; align-items: center; gap: .35rem;
  }
  .chip small { opacity: .7; font-weight: 500; }
  .chip[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent-line); color: var(--text); }
  .chip[disabled] { opacity: .4; }
  .chip.back { margin-bottom: 1rem; }

  /* ---------------------------------------------------------------- fiche */

  .sheet {
    position: relative; overflow: hidden;
    border-radius: 20px; background: var(--panel); border: 1px solid var(--line); padding: 1rem;
  }
  /* La couleur de la série en halo, derrière la jaquette : discret, mais on
     sait de qui on parle avant d'avoir lu le titre. */
  .sheet::before {
    content: ''; position: absolute; inset: 0 0 auto; height: 9rem; pointer-events: none;
    background: radial-gradient(90% 100% at 0% 0%, color-mix(in srgb, var(--c, var(--accent)) 26%, transparent), transparent 75%);
  }
  .sheet > * { position: relative; }
  .sheet .top { display: flex; gap: 1rem; align-items: flex-end; }
  .sheet .top img { width: 5.4rem; height: 7.6rem; border-radius: 12px; object-fit: cover; flex: none; background: var(--panel-2); }
  .sheet h2 { margin: 0; font-size: 1.2rem; line-height: 1.2; letter-spacing: -.02em; }
  .sheet .meta { font-size: .84rem; }
  .part { margin-top: 1.1rem; padding-top: 1rem; border-top: 1px solid var(--line); }
  .part h3 { margin: 0 0 .6rem; font-size: .88rem; font-weight: 650; }
  .note { color: var(--muted); font-size: .78rem; margin-top: .55rem; line-height: 1.45; }
  .note.alerte { color: var(--amber); }

  /* Le statut : cinq cases d'un même choix, pas cinq boutons. */
  .seg { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr)); gap: .35rem; }
  .seg .chip { justify-content: center; }

  /* Le choix de l'épisode : des cases carrées, assez grandes pour un pouce. */
  .modes { display: flex; gap: .35rem; margin-bottom: .7rem; }
  .modes .chip { flex: 1; justify-content: center; }
  .nums { display: grid; grid-template-columns: repeat(auto-fill, minmax(2.9rem, 1fr)); gap: .35rem; }
  .num {
    min-width: 0; min-height: 2.9rem; border-radius: 10px; border: 1px solid var(--line); cursor: pointer;
    background: var(--panel-2); color: var(--muted); font-size: .84rem; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .num[data-seen='true'] { background: color-mix(in srgb, var(--c, var(--accent)) 24%, var(--panel-2)); border-color: color-mix(in srgb, var(--c, var(--accent)) 60%, transparent); color: var(--text); }
  .num[data-off='true'] { opacity: .3; }

  /* L'arbre d'une franchise : les saisons s'empilent, ce qui pousse sur l'une
     se range dessous, en retrait. */
  .tsea { margin-bottom: .6rem; }
  .tline {
    display: flex; align-items: center; gap: .6rem; width: 100%; min-height: 2.6rem; cursor: pointer;
    padding: .4rem .6rem; border-radius: 11px; text-align: left;
    background: var(--panel-2); border: 1px solid var(--line);
  }
  .tline[data-on='true'] { border-color: var(--accent-line); }
  .tnum { flex: none; min-width: 2.1rem; padding: .1rem .35rem; border-radius: 7px; text-align: center; font-size: .72rem; font-weight: 700; background: var(--bg); color: var(--muted); }
  .ttit { flex: 1; min-width: 0; font-size: .85rem; line-height: 1.3; }
  .tprog { flex: none; font-size: .74rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .tbr { margin: .4rem 0 0 .9rem; padding-left: .7rem; border-left: 1px solid var(--line); }
  .tbrn { display: block; font-size: .74rem; color: var(--muted); margin-bottom: .25rem; }
  .tleaf {
    display: block; width: 100%; min-height: 2.3rem; margin-bottom: .25rem; cursor: pointer;
    padding: .4rem .6rem; border-radius: 9px; text-align: left; font-size: .8rem; line-height: 1.3;
    background: transparent; border: 1px solid var(--line);
  }
  .tleaf[data-on='true'] { border-color: var(--accent-line); }
  .tline[aria-expanded='true'], .tleaf[aria-expanded='true'] { background: var(--accent-soft); border-color: var(--accent-line); }
  /* La mini-fiche du titre touché : l'affiche, puis ce qu'on veut savoir avant de lancer. */
  .tcard {
    display: flex; gap: .75rem; margin: .35rem 0 0; padding: .65rem; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line);
  }
  .tcard img { flex: none; width: 4.6rem; height: 6.5rem; border-radius: 9px; object-fit: cover; background: var(--panel-2); }
  .tcard .tinfo { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: .25rem; }
  .tcard b { font-size: .88rem; line-height: 1.25; }
  .tcard .tfacts { font-size: .76rem; color: var(--text); line-height: 1.4; }
  .tcard .tmeta { font-size: .72rem; color: var(--muted); line-height: 1.4; }
  .tcard .tsyn {
    font-size: .74rem; color: var(--muted); line-height: 1.45; margin-top: .15rem;
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }
  .tcard.wait { min-height: 7.8rem; animation: pulse 1.4s ease-in-out infinite; }
  /* Sous le titre touché : ce qu'on peut en faire sans se lever. */
  .tacts { display: flex; flex-wrap: wrap; gap: .4rem; margin: .35rem 0 .5rem; }
  .tacts .btn { flex: 1 1 auto; min-height: 2.5rem; padding: 0 .8rem; font-size: .8rem; }
  .tacts .owned { min-height: 2.5rem; margin: 0; padding: 0 .6rem; }

  /* ---------------------------------------------------------------- lecteur */

  .player {
    border-radius: 18px; padding: .8rem;
    background: linear-gradient(180deg, #1b1a33, #14141f);
    border: 1px solid var(--accent-line);
    box-shadow: 0 10px 30px -12px rgba(0,0,0,.9);
  }
  .player .top { display: flex; gap: .75rem; align-items: center; }
  .player img { width: 2.8rem; height: 3.9rem; border-radius: 8px; object-fit: cover; flex: none; background: var(--panel-2); }
  .grow { min-width: 0; flex: 1; }
  .kind { font-size: .74rem; color: var(--muted); }
  .player .name { font-weight: 650; font-size: .95rem; line-height: 1.25; }
  .seekline, .volline { display: flex; align-items: center; gap: .6rem; margin-top: .6rem; }
  .volline svg { flex: none; color: var(--faint); width: 1rem; height: 1rem; }
  .time { color: var(--muted); font-size: .74rem; font-variant-numeric: tabular-nums; flex: none; min-width: 2.6rem; }
  .time.right { text-align: right; }
  input[type=range] { flex: 1; -webkit-appearance: none; appearance: none; height: 1.9rem; background: none; margin: 0; }
  input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 99px; background: #2b2f45; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -8px; border-radius: 50%; background: var(--accent); border: 2px solid #14141f; }
  input[type=range]::-moz-range-track { height: 6px; border-radius: 99px; background: #2b2f45; }
  input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border: 2px solid #14141f; border-radius: 50%; background: var(--accent); }
  .lecteurs { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin-top: .75rem; }
  .lecteurs .lab { color: var(--muted); font-size: .8rem; margin-right: .2rem; }
  .lecteurs .chip { min-width: 2.6rem; justify-content: center; }
  .opt {
    display: flex; align-items: center; gap: .6rem; margin-top: .75rem; cursor: pointer;
    padding: .55rem .75rem; border-radius: 12px; background: rgba(0,0,0,.2); border: 1px solid var(--line);
    font-size: .84rem; font-weight: 600;
  }
  .opt input { width: 1.2rem; height: 1.2rem; margin: 0; flex: none; accent-color: var(--accent); }
  .opt small { display: block; color: var(--faint); font-size: .74rem; font-weight: 500; }

  /* ---------------------------------------------------------------- calendrier */

  /* Jour par jour : une colonne par jour dès qu'il y a la place, comme un
     programme ; sur un téléphone, les jours s'empilent. */
  .days { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 1.4rem 1.2rem; align-items: start; }
  .day h2 { margin: 0 0 .6rem; font-size: 1rem; font-weight: 650; }
  .day h2 small { color: var(--muted); font-weight: 500; font-size: .8rem; margin-left: .4rem; }
  .slot {
    display: flex; gap: .7rem; align-items: center; width: 100%; margin-bottom: .45rem; cursor: pointer;
    padding: .45rem; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); text-align: left;
  }
  .slot img { width: 2.4rem; height: 3.3rem; border-radius: 7px; object-fit: cover; flex: none; background: var(--panel-2); }
  /* L'heure sur un fond teinté de la couleur de la série : on reconnaît la
     série sans que sa couleur ne touche au texte. */
  .slot .hour {
    font-variant-numeric: tabular-nums; font-weight: 650; font-size: .85rem; flex: none; min-width: 3.9rem;
    padding: .25rem .45rem; border-radius: 8px; text-align: center;
    background: color-mix(in srgb, var(--c, var(--accent)) 20%, transparent);
  }
  .ics {
    display: block; margin-top: 1.5rem; padding: .9rem 1rem; border-radius: 14px; max-width: 34rem;
    font-size: .88rem; font-weight: 600; color: var(--text); text-decoration: none;
    background: var(--panel); border: 1px solid var(--line);
  }
  .ics span { display: block; margin-top: .2rem; font-weight: 400; font-size: .8rem; color: var(--muted); }

  /* ---------------------------------------------------------------- bilan */

  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: .6rem; margin-bottom: 1.4rem; }
  .kpi { border-radius: 16px; padding: .9rem 1rem; background: var(--panel); border: 1px solid var(--line); }
  .kpi b { display: block; font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; letter-spacing: -.02em; }
  .kpi span { color: var(--muted); font-size: .8rem; }
  .bars { display: grid; gap: .5rem; max-width: 34rem; }
  .bar-row { display: grid; grid-template-columns: 8rem 1fr 2.5rem; align-items: center; gap: .6rem; font-size: .85rem; }
  .bar-row .track { height: .55rem; border-radius: 99px; background: var(--panel-2); overflow: hidden; }
  .bar-row .track i { display: block; height: 100%; border-radius: 99px; background: var(--accent); }
  .bar-row .n { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

  /* ---------------------------------------------------------------- divers */

  .search { display: flex; gap: .5rem; margin-bottom: .9rem; max-width: 36rem; }
  input[type=text] {
    flex: 1; min-width: 0; min-height: 2.75rem; padding: 0 .9rem; border-radius: 12px;
    border: 1px solid var(--line); background: var(--panel); color: var(--text);
  }
  input[type=text]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  form { display: flex; gap: .5rem; margin-top: 1rem; max-width: 26rem; }

  .empty, .err { color: var(--muted); padding: 2.5rem 0; font-size: .95rem; line-height: 1.6; max-width: 34rem; }
  .err { color: var(--danger); }
  .skel { height: 5.8rem; border-radius: 16px; background: var(--panel); margin-bottom: .6rem; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .5 } }

  .flash {
    position: fixed; left: 50%; transform: translate(-50%, 12px); z-index: 30;
    bottom: calc(5.5rem + env(safe-area-inset-bottom));
    background: var(--text); color: var(--bg); padding: .7rem 1.1rem; border-radius: 999px;
    font-size: .88rem; font-weight: 600; opacity: 0; pointer-events: none; max-width: calc(100vw - 32px);
    transition: opacity .2s, transform .2s; box-shadow: 0 8px 24px -8px rgba(0,0,0,.8);
  }
  .flash.on { opacity: 1; transform: translate(-50%, 0); }
  @media (min-width: 700px) { .flash { bottom: 1.5rem; } }
`

const SCRIPT = `
  var KEY = 'animelist-remote-token'
  var url = new URL(location.href)
  var fromUrl = url.searchParams.get('t')
  if (fromUrl) {
    localStorage.setItem(KEY, fromUrl)
    // Retiré de la barre d'adresse : sinon le mot de passe reste dans
    // l'historique et part dans le « Referer » du lien suivant.
    url.searchParams.delete('t')
    history.replaceState(null, '', url.pathname)
  }
  var token = localStorage.getItem(KEY) || ''

  var appEl = document.getElementById('app')
  var sideEl = document.getElementById('side')
  var playerEl = document.getElementById('player')
  var countEl = document.getElementById('count')
  var flashEl = document.getElementById('flash')
  var offlineEl = document.getElementById('offline')

  // Vrai pendant qu'on fait glisser : sinon le rafraîchissement remettrait le
  // curseur là où la vidéo en est, et il sauterait sous le doigt.
  var dragging = false
  var flashTimer = null

  /**
   * Assez de place pour ouvrir la fiche à côté de la liste plutôt qu'à sa
   * place. Le seuil est celui de la colonne de droite dans la feuille de style.
   */
  var wideQuery = window.matchMedia('(min-width: 1000px)')
  function isWide() { return wideQuery.matches }

  /**
   * La colonne de droite n'existe que lorsqu'elle a quelque chose à montrer :
   * une fiche ouverte, ou une vidéo en cours.
   *
   * Réservée en permanence, elle prenait un tiers de l'écran pour dire
   * « choisis une série » — la liste, elle, se serrait dans le reste.
   */
  var shellEl = document.querySelector('.shell')
  function layout() {
    var utile = !!sideEl.innerHTML || !!playerEl.innerHTML
    shellEl.setAttribute('data-col', utile ? 'on' : 'off')
  }

  // ---------------------------------------------------------------- outils

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one) }

  function mmss(total) {
    total = Math.max(0, Math.floor(total || 0))
    var s = total % 60, m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600)
    var mm = h > 0 ? String(m).padStart(2, '0') : String(m)
    return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
  }

  // « dans 2 j », « dans 5 h » : de quoi savoir s'il faut attendre ce soir ou
  // la semaine prochaine.
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

  /**
   * La couleur d'une série, rendue lisible sur le fond de nuit.
   *
   * AniList donne la teinte dominante de la jaquette, parfois presque noire :
   * un trait « vu » de cette couleur disparaîtrait. On l'éclaircit alors
   * jusqu'à ce qu'elle se voie, sans changer sa teinte.
   */
  function tone(hex) {
    if (!hex || hex.charAt(0) !== '#' || hex.length !== 7) return ''
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16)
    var l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    if (l >= 0.45) return hex
    var k = (0.45 - l) / (1 - l)
    function mix(c) { return Math.round(c + (255 - c) * k) }
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')'
  }
  function colorStyle(hex) {
    var c = tone(hex)
    return c ? ' style="--c:' + c + '"' : ''
  }

  // Des icônes en ligne : une police d'icônes serait une requête vers
  // l'extérieur, et cette page doit tenir en une seule.
  var PATHS = {
    check: 'M20 6 9 17l-5-5',
    play: 'M6 3l14 9-14 9z',
    film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16',
    info: 'M12 8h.01M11 12h1v4h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
    skip: 'M5 4l10 8-10 8zM19 5v14',
    next: 'M4 5v14l9-7zM13 5v14l9-7',
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
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    calendar: 'M8 3v4M16 3v4M4 8h16M5 5h14v16H5z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9'
  }
  function icon(name) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
      PATHS[name] + '"/></svg>'
  }

  function btn(attrs, label, name, klass) {
    return '<button class="btn ' + (klass || '') + '" ' + attrs + '>' + (name ? icon(name) : '') + label + '</button>'
  }

  function say(text) {
    flashEl.textContent = text
    flashEl.classList.add('on')
    clearTimeout(flashTimer)
    flashTimer = setTimeout(function () { flashEl.classList.remove('on') }, 1800)
  }

  // ---------------------------------------------------------------- hors ligne

  /**
   * Ce que la page a déjà vu, gardé sur le téléphone.
   *
   * Loin du wifi de la maison, ou le PC en veille, la page ouverte remplaçait
   * toutes les vingt secondes ce qu'elle montrait par « Failed to fetch ». Les
   * lectures réussies sont désormais gardées, et resservies quand le PC ne
   * répond plus, avec l'heure à laquelle elles datent. Pas les écritures : une
   * coche qui n'est pas partie ne se rejoue pas plus tard dans le dos de
   * quelqu'un, elle se refait à la main.
   *
   * Ni le lecteur, qui ne vaut que pour l'instant présent, ni Découvrir, qui
   * vient d'AniList. Un service worker aurait permis d'ouvrir la page PC
   * éteint, mais un navigateur n'en accepte pas sur une adresse http du réseau
   * local : c'est la page déjà ouverte qui tient bon, pas davantage.
   */
  var CACHE = 'animelist-remote-cache:'
  var CACHE_MAX = 40

  function keepable(path) {
    return path.indexOf('/api/player') !== 0 && path.indexOf('/api/discover') !== 0
  }

  function remember(path, data) {
    try {
      localStorage.setItem(CACHE + path, JSON.stringify({ at: Date.now(), data: data }))
      // Les fiches s'accumulent au fil des séries ouvertes : on ne garde que
      // les plus récentes, sans jamais toucher au mot de passe.
      var keys = []
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i)
        if (k && k.indexOf(CACHE) === 0) keys.push(k)
      }
      if (keys.length > CACHE_MAX) {
        keys.sort(function (a, b) { return recalled(a).at - recalled(b).at })
        for (var j = 0; j < keys.length - CACHE_MAX; j++) localStorage.removeItem(keys[j])
      }
    } catch (err) { /* plein, ou refusé : la page marche sans */ }
  }

  function recalled(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || { at: 0 } } catch (err) { return { at: 0 } }
  }

  function hour(at) {
    var d = new Date(at)
    var same = d.toDateString() === new Date().toDateString()
    var h = d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0')
    return same ? h : d.toLocaleDateString('fr-FR', { weekday: 'long' }) + ' à ' + h
  }

  var shownAt = 0
  function offline(at) {
    // La plus ancienne des données montrées : un chiffre rassurant qui ne vaut
    // que pour un écran sur trois serait un mensonge par omission.
    shownAt = shownAt ? Math.min(shownAt, at) : at
    offlineEl.textContent = 'Hors ligne : le PC ne répond pas. Ce que tu vois date de ' + hour(shownAt) + '.'
    offlineEl.hidden = false
  }
  function online() {
    shownAt = 0
    offlineEl.hidden = true
  }

  async function call(path, sent) {
    var res
    try {
      res = await fetch(path, {
        method: sent ? 'POST' : 'GET',
        headers: sent
          ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
          : { Authorization: 'Bearer ' + token },
        body: sent ? JSON.stringify(sent) : undefined
      })
    } catch (err) {
      // Le réseau, pas un refus : le navigateur n'a jamais atteint le PC.
      if (sent) throw new Error('Le PC ne répond pas : rien n’a été envoyé.')
      var kept = keepable(path) ? recalled(CACHE + path) : null
      if (kept && kept.data !== undefined) {
        offline(kept.at)
        return kept.data
      }
      throw new Error('Le PC ne répond pas. Il doit être allumé, et le téléphone sur le même wifi.')
    }
    online()
    if (res.status === 401) throw new Error('unauthorized')
    // Le nom doit rester distinct du paramètre : redéclarer un identifiant
    // empêche tout le script de se parser, et la page ne démarre jamais.
    var answer = await res.json().catch(function () { return null })
    // Le serveur explique ses refus : « pas encore sorti » vaut mieux que 409.
    if (!res.ok) throw new Error((answer && answer.error) || 'Le PC a répondu ' + res.status)
    if (!sent && keepable(path)) remember(path, answer)
    return answer
  }

  // ---------------------------------------------------------------- la frise

  /**
   * La frise d'une série, un trait par épisode.
   *
   * Au-delà d'une cinquantaine d'épisodes, un trait en regroupe plusieurs :
   * sorti sans toi s'il en manque un, à venir si aucun n'est vu, vu sinon. Le
   * suivant garde son contour, où qu'il tombe.
   */
  function frise(s, big) {
    var strip = s.strip || ''
    if (!strip) return ''
    var per = Math.max(1, Math.ceil(strip.length / (big ? 90 : 48)))
    var next = s.episode ? s.episode - 1 : -1
    var counts = { s: 0, a: 0, u: 0 }
    for (var k = 0; k < strip.length; k++) counts[strip.charAt(k)] = (counts[strip.charAt(k)] || 0) + 1
    var html = ''
    for (var i = 0; i < strip.length; i += per) {
      var part = strip.substr(i, per)
      var st = part.indexOf('a') >= 0 ? 'a' : part.indexOf('s') < 0 ? 'u' : 's'
      var isNext = next >= i && next < i + per
      html += '<i class="' + st + (isNext ? ' n' : '') + '"></i>'
    }
    var label = plural(counts.s, 'épisode vu', 'épisodes vus') +
      (counts.a ? ', ' + plural(counts.a, 'sorti sans toi', 'sortis sans toi') : '') +
      (counts.u ? ', ' + counts.u + ' à venir' : '')
    return '<span class="frise' + (big ? ' big' : '') + '" role="img" aria-label="' + esc(label) + '">' + html + '</span>'
  }

  function legend() {
    return '<div class="legend">' +
      '<span><i class="s"></i>Vu</span><span><i class="a"></i>Sorti sans toi</span>' +
      '<span><i></i>À venir</span><span><i class="n"></i>Le suivant</span></div>'
  }

  // ---------------------------------------------------------------- rendu

  function askToken(message) {
    playerEl.innerHTML = ''
    sideEl.innerHTML = ''
    countEl.textContent = 'Mot de passe'
    appEl.innerHTML =
      '<div class="err">' + esc(message) + ' Il est affiché sous le QR code, dans les réglages de l’app sur le PC.</div>' +
      '<form id="f"><input type="text" id="t" placeholder="Mot de passe" autocapitalize="off" ' +
      'autocomplete="off" spellcheck="false" aria-label="Mot de passe"><button class="btn primary">Entrer</button></form>'
    document.getElementById('f').onsubmit = function (e) {
      e.preventDefault()
      token = document.getElementById('t').value.trim()
      localStorage.setItem(KEY, token)
      load()
    }
  }

  function renderPlayer(p) {
    if (!p) { playerEl.innerHTML = ''; layout(); return }
    if (dragging) return

    var cover = p.cover ? '<img src="' + esc(p.cover) + '" alt="">' : ''
    var label = p.kind === 'trailer' ? 'Bande-annonce sur le PC' : 'En lecture sur le PC'
    var sub = p.episode ? '<div class="kind">Épisode ' + p.episode + '</div>' : ''
    // Tant qu'aucune vidéo n'a été trouvée dans la page, il n'y a rien à
    // piloter : le lecteur charge encore, ou la page n'en contient pas.
    var limit = p.canSeek
      ? ''
      : '<div class="note">Le lecteur charge : les commandes apparaîtront dès que la vidéo démarre.</div>'

    // Passer le générique : le libellé est le leur — c'est ce qui est écrit
    // sur l'écran d'en face, et deux formulations pour un même bouton feraient
    // douter de ce qu'on presse.
    var skipBtn = p.skip ? '<button class="btn primary" data-act="skip">' + icon('skip') + esc(p.skip) + '</button>' : ''
    // Enchaîner : un bouton et pas un départ automatique — le PC ne décide pas
    // à la place du canapé.
    var nextBtn = p.offerNext
      ? '<button class="btn primary" data-act="next" data-id="' + Number(p.animeId) + '" data-ep="' + Number(p.offerNext) + '">' +
        icon('next') + 'Épisode ' + Number(p.offerNext) + '</button>'
      : ''
    var offers = skipBtn || nextBtn ? '<div class="acts">' + skipBtn + nextBtn + '</div>' : ''

    // Changer de lecteur chez eux : même épisode, autre hébergeur.
    var pl = p.players
    var lecteurs = pl
      ? '<div class="lecteurs"><span class="lab">Lecteur</span>' +
          pl.labels.map(function (name, i) {
            return '<button class="chip" data-act="lecteur" data-n="' + i + '" aria-pressed="' + (i === pl.current) +
              '" aria-label="' + esc(name) + '">' + (i + 1) + '</button>'
          }).join('') +
        '</div>' +
        (p.canSeek ? '' : '<div class="note">La vidéo ne vient pas ? Essaie un autre lecteur.</div>')
      : ''

    var sk = p.autoSkip
    var autoSkip = sk
      ? '<label class="opt"><input type="checkbox" data-act="autoskip"' + (sk.on ? ' checked' : '') + '>' +
          '<span class="grow">Passer l’intro et l’ending tout seul' +
            '<small>' + (sk.session ? 'Pour cette séance seulement, les réglages ne changent pas' : 'Comme dans les réglages') +
            '</small>' +
          '</span>' +
        '</label>'
      : ''

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
      '<section class="player" aria-label="Lecture en cours">' +
        '<div class="top">' + cover +
          '<div class="grow">' +
            '<div class="kind">' + label + '</div>' +
            '<div class="name">' + esc(p.title) + '</div>' + sub +
          '</div>' +
        '</div>' +
        limit + seek + offers +
        '<div class="acts">' +
          (p.canSeek
            ? '<button class="btn primary" data-act="' + (p.playing ? 'pause' : 'play') + '">' +
              icon(p.playing ? 'pause' : 'play') + (p.playing ? 'Pause' : 'Lecture') + '</button>'
            : '') +
          '<button class="btn" data-act="' + (p.fullscreen ? 'windowed' : 'fullscreen') + '">' +
            icon(p.fullscreen ? 'shrink' : 'expand') + (p.fullscreen ? 'Fenêtre' : 'Plein écran') + '</button>' +
          btn('data-act="close"', 'Fermer', 'close', '') +
        '</div>' +
        lecteurs +
        autoSkip +
      '</section>'

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
    layout()
  }

  /**
   * Le choix d'épisode, déplié dans la fiche.
   *
   * Une seule grille à la fois : deux ouvertes, on ne sait plus laquelle on
   * touche.
   */
  var eps = { id: 0, data: null, mode: 'watch' }

  function renderEpisodes(s) {
    if (eps.id !== s.id) return ''
    if (!eps.data) return '<div class="part"><div class="note">Chargement des épisodes…</div></div>'

    var seen = {}
    eps.data.watched.forEach(function (n) { seen[n] = true })
    var total = eps.data.total || eps.data.lastAired || 0
    if (!total) return '<div class="part"><div class="note">Aucun épisode connu pour cette série.</div></div>'

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

    return '<div class="part">' +
      '<h3>Épisodes</h3>' +
      '<div class="modes">' + modes + '</div>' +
      '<div class="nums">' + nums + '</div>' +
      '<div class="note">' + hint + '</div>' +
    '</div>'
  }

  /** Les noms des branches, pris à l'app : deux listes auraient divergé. */
  var BRANCHES = ${JSON.stringify(BRANCH_LABELS)}

  /**
   * L'arbre d'une franchise, déplié dans la fiche — ESSAI, comme sur le PC.
   *
   * Le PC dessine un rail et accroche les branches à droite. Ici il n'y a pas
   * toujours de droite : les saisons s'empilent, et ce qui pousse sur l'une se
   * range dessous, en retrait. Toucher un titre l'ouvre sur le PC — y compris
   * un film qui n'est pas dans la bibliothèque.
   */
  /**
   * Les gestes sur un titre de l'arbre, sous le titre touché.
   *
   * Toucher un film ouvrait sa fiche sur le PC, et il fallait ensuite aller
   * jusqu'à la souris pour l'ajouter ou le lancer. Le toucher le sélectionne
   * désormais : regarder, ajouter, ou ouvrir la fiche comme avant, au choix.
   * « Regarder » vise le premier épisode pas vu — un film n'en a qu'un.
   */
  /**
   * La mini-fiche : format, date, durée, diffusion. Lue chez AniList au
   * premier toucher — la plupart de ces titres ne sont pas dans la liste —,
   * un bloc qui pulse le temps de la réponse.
   */
  function nodeCard(n, card) {
    if (!card) return '<div class="tcard wait" aria-label="Lecture de la fiche"></div>'
    if (card.error) return ''
    var etat = card.status || ''
    if (card.nextAiring) etat += (etat ? ', ' : '') + 'épisode ' + card.nextAiring.episode + ' ' + when(card.nextAiring.at / 1000)
    if (card.score) etat += (etat ? ' · ' : '') + card.score + ' %'
    var autour = [card.studio].concat(card.genres || []).filter(Boolean).join(' · ')
    return '<div class="tcard"' + colorStyle(card.color) + '>' +
      (card.cover ? '<img src="' + esc(card.cover) + '" alt="">' : '') +
      '<div class="tinfo">' +
        '<b>' + esc(card.title) + '</b>' +
        (card.facts.length ? '<div class="tfacts">' + esc(card.facts.join(' · ')) + '</div>' : '') +
        (etat ? '<div class="tmeta">' + esc(etat) + '</div>' : '') +
        (autour ? '<div class="tmeta">' + esc(autour) + '</div>' : '') +
        (card.synopsis ? '<div class="tsyn">' + esc(card.synopsis) + '</div>' : '') +
      '</div>' +
    '</div>'
  }

  function nodeActs(n) {
    if (tree.pick !== n.id) return ''
    var fini = n.total > 0 && n.seen >= n.total
    var ep = fini || !n.seen ? 1 : n.seen + 1
    var label = ep > 1 ? 'Reprendre ép. ' + ep : 'Regarder'
    var card = tree.info && tree.info.id === n.id ? tree.info.data : null
    return nodeCard(n, card) + '<div class="tacts">' +
      btn('data-act="watch" data-id="' + n.id + '" data-ep="' + ep + '"', label, 'play', 'primary') +
      (card && card.trailer ? btn('data-act="trailer" data-id="' + n.id + '"', 'Bande-annonce', 'film', '') : '') +
      (n.tracked
        ? '<span class="owned">Dans ta liste</span>'
        : btn('data-act="add" data-id="' + n.id + '"', 'Ajouter à ma liste', 'plus', '')) +
      btn('data-act="open" data-id="' + n.id + '"', 'Ouvrir sur le PC', 'info', '') +
    '</div>'
  }

  function renderTree(s) {
    if (tree.id !== s.id) return ''
    if (!tree.data) {
      return '<div class="part"><div class="note">Lecture de la franchise… ' +
        'plusieurs requêtes, cela peut prendre quelques secondes.</div></div>'
    }

    var t = tree.data
    if (!t.trunk || !t.trunk.length) {
      return '<div class="part"><div class="note">Aucune franchise trouvée pour cette série.</div></div>'
    }

    var tete = plural(t.count, 'série', 'séries') + ', dont ' + t.tracked + ' dans ta liste' +
      (t.total ? '. ' + t.seen + ' épisodes vus sur ' + t.total + '.' : '.')

    var corps = t.trunk.map(function (saison) {
      var num = 'S' + saison.number + (saison.part ? '.' + saison.part : '')
      var prog = saison.total ? saison.seen + ' / ' + saison.total : ''
      var fini = saison.total > 0 && saison.seen >= saison.total
      var ligne = '<button class="tline" data-act="tnode" data-id="' + saison.id + '" data-on="' + fini + '"' +
        ' aria-expanded="' + (tree.pick === saison.id) + '">' +
        '<span class="tnum">' + num + '</span>' +
        '<span class="ttit">' + esc(saison.title) + '</span>' +
        '<span class="tprog">' + prog + '</span>' +
      '</button>' + nodeActs(saison)

      var branches = (saison.branches || []).map(function (b) {
        var feuilles = b.nodes.map(function (n) {
          var p = n.total ? ' (' + n.seen + '/' + n.total + ')' : ''
          var complet = n.total > 0 && n.seen >= n.total
          return '<button class="tleaf" data-act="tnode" data-id="' + n.id + '" data-on="' + complet + '"' +
            ' aria-expanded="' + (tree.pick === n.id) + '">' + esc(n.title) + p + '</button>' + nodeActs(n)
        }).join('')
        return '<div class="tbr"><span class="tbrn">' + esc(BRANCHES[b.kind] || b.kind) + '</span>' + feuilles + '</div>'
      }).join('')

      return '<div class="tsea">' + ligne + branches + '</div>'
    }).join('')

    return '<div class="part">' +
      '<h3>Franchise</h3>' +
      '<div class="note">' + tete + '</div>' +
      (t.partial ? '<div class="note alerte">Une partie n’a pas pu être lue : l’arbre est peut-être incomplet.</div>' : '') +
      '<div style="margin-top:.7rem">' + corps + '</div>' +
      '<div class="note">Touche un titre pour le regarder, l’ajouter à ta liste ou l’ouvrir sur le PC.</div>' +
    '</div>'
  }

  /** Les mots de l'app pour chaque statut, employés par la fiche et par les filtres. */
  var STATUS = {
    watching: 'En cours',
    planned: 'À voir',
    completed: 'Terminé',
    paused: 'En pause',
    dropped: 'Abandonné'
  }

  /** Ce que dit une série en une ligne : où l'on en est, et ce qui attend. */
  function metaLine(s) {
    var total = s.total || 0
    if (s.episode === null) return STATUS[s.status] + ', ' + plural(s.seen, 'épisode vu', 'épisodes vus')
    if (s.unaired) return '<span class="soon">Épisode ' + s.episode + ' ' + when(s.airingAt) + '</span>'
    var rest = s.behind > 1 ? ', ' + s.behind + ' sortis sans toi' : total ? ' sur ' + total : ''
    return '<b>Épisode ' + s.episode + '</b>' + rest
  }

  /**
   * Le statut, changé d'un geste : mettre en pause, abandonner, reprendre.
   *
   * « Terminé » s'éteint tant que la série paraît — la règle de l'app, que le
   * PC vérifie de toute façon. Le dire vaut mieux que laisser essayer.
   */
  function statusRow(s) {
    var chips = Object.keys(STATUS).map(function (k) {
      var off = k === 'completed' && !s.finishable
      return '<button class="chip" data-act="status" data-id="' + s.id + '" data-status="' + k + '" aria-pressed="' +
        (s.status === k) + '"' + (off ? ' disabled' : '') + '>' + STATUS[k] + '</button>'
    }).join('')
    return '<div class="part"><h3>Statut</h3><div class="seg" role="group" aria-label="Statut">' + chips + '</div>' +
      (s.finishable ? '' : '<div class="note">« Terminé » attend la fin de la diffusion.</div>') + '</div>'
  }

  /** La fiche d'une série : tout ce qu'on peut en faire depuis le canapé. */
  function card(s) {
    var total = s.total || 0
    // Un épisode à venir ne se coche pas : la place du bouton dit pourquoi.
    var lancable = s.episode !== null && !s.unaired
    var first = lancable
      ? btn('data-act="tick" data-id="' + s.id + '" data-ep="' + s.episode + '"', 'Cocher l’épisode ' + s.episode, 'check', 'primary')
      : ''
    // « Regarder » lance le suivant ; sans suivant, il ouvre la liste : c'est
    // exactement le moment où l'on veut choisir soi-même.
    var regarder = lancable
      ? btn('data-act="watch" data-id="' + s.id + '" data-ep="' + s.episode + '"', 'Regarder sur le PC', 'play', '')
      : total
        ? btn('data-act="eps" data-id="' + s.id + '"', 'Choisir un épisode', 'play', '')
        : ''
    var ba = s.trailer ? btn('data-act="trailer" data-id="' + s.id + '"', 'Bande-annonce', 'film', '') : ''

    return '<article class="sheet"' + colorStyle(s.color) + '>' +
      '<div class="top">' +
        '<img src="' + esc(s.cover) + '" alt="">' +
        '<div class="grow">' +
          '<h2>' + esc(s.title) + '</h2>' +
          '<div class="meta">' + metaLine(s) + '</div>' +
        '</div>' +
      '</div>' +
      frise(s, true) + legend() +
      (first || regarder ? '<div class="acts">' + first + regarder + '</div>' : '') +
      '<div class="acts">' + ba +
        btn('data-act="open" data-id="' + s.id + '"', 'Fiche sur le PC', 'info', '') +
        (lancable && total ? btn('data-act="eps" data-id="' + s.id + '"', 'Épisodes', 'list', '') : '') +
        btn('data-act="tree" data-id="' + s.id + '"', 'Franchise', 'branch', '') +
      '</div>' +
      statusRow(s) +
      renderEpisodes(s) +
      renderTree(s) +
    '</article>'
  }

  /**
   * La fiche de la série choisie.
   *
   * Sur un grand écran elle va dans la colonne de droite et la liste reste
   * là ; ailleurs elle prend la place de la liste, avec un retour. Rend vrai
   * quand elle a pris la place — l'appelant n'a alors plus rien à dessiner.
   */
  function renderSheet(rows, retour) {
    var seule = sheet ? rows.filter(function (r) { return r.id === sheet })[0] : null
    if (sheet && !seule) sheet = 0
    if (isWide()) {
      // Refermer rend la largeur à la liste.
      sideEl.innerHTML = seule ? '<button class="chip back" data-act="back">× Fermer la fiche</button>' + card(seule) : ''
      layout()
      return false
    }
    sideEl.innerHTML = ''
    layout()
    if (!seule) return false
    countEl.textContent = STATUS[seule.status] || ''
    appEl.innerHTML = '<button class="chip back" data-act="back">← ' + retour + '</button>' + card(seule)
    return true
  }

  /** Une série en cours : la choisir, ou la cocher et la lancer sans détour. */
  function seriesRow(s) {
    var lancable = s.episode !== null && !s.unaired
    var quick = lancable
      ? '<div class="quick">' +
          '<button class="round" data-act="tick" data-id="' + s.id + '" data-ep="' + s.episode + '" aria-label="Cocher l’épisode ' + s.episode + '">' + icon('check') + '</button>' +
          '<button class="round go" data-act="watch" data-id="' + s.id + '" data-ep="' + s.episode + '" aria-label="Regarder l’épisode ' + s.episode + ' sur le PC">' + icon('play') + '</button>' +
        '</div>'
      : ''
    return '<article class="srow"' + colorStyle(s.color) + ' aria-current="' + (sheet === s.id) + '">' +
      '<button class="pick" data-act="pick" data-id="' + s.id + '">' +
        '<img src="' + esc(s.cover) + '" alt="" loading="lazy">' +
        '<span class="info">' +
          '<span class="title">' + esc(s.title) + '</span>' +
          '<span class="meta" style="display:block">' + metaLine(s) + '</span>' +
          frise(s, false) +
        '</span>' +
      '</button>' + quick +
    '</article>'
  }

  function render(state) {
    renderPlayer(state.player)
    if (tab !== 'home') return
    if (renderSheet(state.series, 'Tout ce qui est en cours')) return

    var n = state.series.length
    if (!n) {
      countEl.textContent = 'Rien en cours'
      appEl.innerHTML = '<div class="empty">Commence une série sur le PC : elle apparaîtra ici, prête à reprendre.</div>'
      return
    }

    /*
     * Deux groupes, et le retard d'abord : « qu'est-ce qui est sorti que je
     * n'ai pas vu ? » est la question qu'on pose depuis le canapé. Une liste
     * rangée par dernière séance y répondait de travers.
     */
    var retard = state.series.filter(function (s) { return s.behind > 1 })
      .sort(function (a, b) { return b.behind - a.behind })
    var reste = state.series.filter(function (s) { return s.behind <= 1 })
    var total = retard.reduce(function (sum, s) { return sum + s.behind }, 0)

    countEl.textContent = total
      ? plural(total, 'épisode sorti t’attend', 'épisodes sortis t’attendent') + '.'
      : 'Tout est à jour. Voici ce que tu suis.'

    var html = ''
    if (retard.length) {
      html += '<section class="group"><h2>À rattraper</h2>' +
        '<p>Les séries où plusieurs épisodes sont sortis sans toi, la plus en retard d’abord.</p>' +
        '<div class="rows">' + retard.map(seriesRow).join('') + '</div></section>'
    }
    if (reste.length) {
      html += '<section class="group">' +
        (retard.length ? '<h2>Le reste</h2><p>À jour, ou presque.</p>' : '') +
        '<div class="rows">' + reste.map(seriesRow).join('') + '</div></section>'
    }
    appEl.innerHTML = html
  }

  // ---------------------------------------------------------------- onglets

  var tab = 'home'
  var filter = 'all'
  /**
   * La série ouverte, à l'accueil comme dans « Ma liste ». La liste sert à
   * choisir, la fiche à agir : cinq boutons sous chacune des cent séries
   * feraient un mur où plus rien ne se distingue.
   */
  var sheet = 0
  /** La franchise dépliée, et son arbre une fois arrivé. Voir renderTree. */
  var tree = { id: 0, data: null }
  var query = ''
  var discoverTab = 'trending'

  var TABS = [
    { id: 'home', label: 'Accueil', icon: 'home' },
    { id: 'library', label: 'Ma liste', icon: 'books' },
    { id: 'calendar', label: 'Calendrier', icon: 'calendar' },
    { id: 'stats', label: 'Bilan', icon: 'chart' },
    { id: 'discover', label: 'Découvrir', icon: 'compass' }
  ]

  function renderNav() {
    document.getElementById('nav').innerHTML = TABS.map(function (t) {
      return '<button data-act="tab" data-tab="' + t.id + '" aria-current="' + (tab === t.id) + '">' +
        icon(t.icon) + '<span>' + t.label + '</span></button>'
    }).join('')
  }

  /** Une jaquette, sa frise, rien d'autre : on est en train de choisir. */
  function seriesTile(s) {
    var total = s.total || 0
    // Un seul épisode en attente est le cours normal d'une série qu'on suit.
    // Au-delà, ça s'accumule, et ça se dit.
    // Seulement pour une série en cours : sur une série « à voir », tout est
    // sorti sans toi par définition, et le chiffre ne dirait rien.
    var late = s.behind > 1 && s.status === 'watching' ? '<span class="late">' + s.behind + '</span>' : ''
    return '<button class="tile" data-act="pick" data-id="' + s.id + '"' + colorStyle(s.color) +
      ' aria-current="' + (sheet === s.id) + '">' +
      '<img src="' + esc(s.cover) + '" alt="" loading="lazy">' + late +
      '<span class="title">' + esc(s.title) + '</span>' +
      '<span class="meta" style="display:block">' + (total ? s.seen + ' / ' + total : STATUS[s.status]) + '</span>' +
      frise(s, false) +
    '</button>'
  }

  function renderLibrary(rows) {
    if (renderSheet(rows, 'Toutes les séries')) return

    var counts = {}
    rows.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1 })

    var chips = '<button class="chip" data-act="filter" data-filter="all" aria-pressed="' + (filter === 'all') + '">' +
      'Tout <small>' + rows.length + '</small></button>' +
      Object.keys(STATUS).filter(function (k) { return counts[k] }).map(function (k) {
        return '<button class="chip" data-act="filter" data-filter="' + k + '" aria-pressed="' + (filter === k) + '">' +
          STATUS[k] + ' <small>' + counts[k] + '</small></button>'
      }).join('')

    var shown = filter === 'all' ? rows : rows.filter(function (r) { return r.status === filter })
    countEl.textContent = plural(rows.length, 'série suivie', 'séries suivies') + '.'
    appEl.innerHTML = '<div class="chips" role="group" aria-label="Filtrer par statut">' + chips + '</div>' +
      (shown.length
        ? '<div class="grid">' + shown.map(seriesTile).join('') + '</div>'
        : '<div class="empty">Aucune série avec ce statut.</div>')
  }

  /** « 3 h 04 », comme la barre latérale de l'app. */
  function heures(minutes) {
    var h = Math.floor(minutes / 60)
    var m = minutes % 60
    return h ? h + ' h ' + (m < 10 ? '0' : '') + m : m + ' min'
  }

  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

  /**
   * « Aujourd'hui », « Demain », « Jeudi », puis la date au-delà d'une
   * semaine : le jour se comprend d'un coup d'œil, une date demande de compter.
   */
  function jour(ms) {
    var d = new Date(ms)
    var n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000)
    if (n <= 0) return "Aujourd'hui"
    if (n === 1) return 'Demain'
    var nom = JOURS[d.getDay()]
    nom = nom.charAt(0).toUpperCase() + nom.slice(1)
    if (n < 7) return nom
    return nom + ' ' + d.getDate() + '/' + (d.getMonth() + 1)
  }

  /** « 18 h 15 ». Le jour est déjà dit par l'intertitre. */
  function heure(ms) {
    var d = new Date(ms)
    return d.getHours() + ' h ' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes()
  }

  function renderCalendar(airing) {
    sideEl.innerHTML = ''
    countEl.textContent = airing.length
      ? plural(airing.length, 'épisode annoncé', 'épisodes annoncés') + ' dans les deux semaines.'
      : 'Rien d’annoncé pour l’instant.'
    var abonnement = '<a class="ics" href="/calendrier.ics?t=' + encodeURIComponent(token) + '">' +
      'Mettre ces sorties dans mon agenda' +
      '<span>Ouvre le calendrier au format .ics, avec une alarme par épisode. À garder en favori pour s’y abonner.</span></a>'
    if (!airing.length) {
      appEl.innerHTML = '<div class="empty">Aucun épisode annoncé dans les deux semaines qui viennent, ' +
        'parmi les séries que tu suis.</div>' + abonnement
      return
    }
    /*
     * La semaine, jour par jour : le jour s'annonce une fois, et ce qui suit
     * lui appartient. Sur un grand écran, une colonne par jour, comme un
     * programme télé.
     */
    var jours = []
    var parJour = {}
    airing.forEach(function (a) {
      var d = new Date(a.airingAt)
      var cle = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
      if (!parJour[cle]) {
        parJour[cle] = []
        jours.push({ cle: cle, at: a.airingAt })
      }
      parJour[cle].push(a)
    })

    appEl.innerHTML = '<div class="days">' + jours.map(function (j) {
      var n = parJour[j.cle].length
      return '<section class="day"><h2>' + esc(jour(j.at)) + '<small>' + plural(n, 'épisode', 'épisodes') + '</small></h2>' +
        parJour[j.cle].map(function (a) {
          return '<button class="slot" data-act="open" data-id="' + a.animeId + '"' + colorStyle(a.color) + '>' +
            '<img src="' + esc(a.cover) + '" alt="" loading="lazy">' +
            '<span class="hour">' + esc(heure(a.airingAt)) + '</span>' +
            '<span class="grow"><span class="title">' + esc(a.title) + '</span>' +
            '<span class="meta" style="display:block">Épisode ' + a.episode + '</span></span>' +
          '</button>'
        }).join('') + '</section>'
    }).join('') + '</div>' + abonnement
  }

  function renderStats(s) {
    sideEl.innerHTML = ''
    countEl.textContent = s.week.episodes
      ? plural(s.week.episodes, 'épisode vu', 'épisodes vus') + ' ces 7 jours, soit ' + heures(s.week.minutes) + '.'
      : 'Rien de vu ces 7 derniers jours.'

    var kpis = [
      [s.episodes, 'épisodes vus en tout'],
      [heures(s.minutes), 'de visionnage'],
      [s.finished, 'séries finies'],
      [s.watching, 'séries en cours']
    ].map(function (k) {
      return '<div class="kpi"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'
    }).join('')

    // Les genres en barres : des chiffres qu'on compare, pas des filtres.
    var top = s.genres.length ? s.genres[0].count : 0
    var genres = s.genres.length
      ? '<section class="group"><h2>Tes genres</h2><p>Comptés en épisodes vus.</p><div class="bars">' +
        s.genres.map(function (g) {
          return '<div class="bar-row"><span>' + esc(g.name) + '</span>' +
            '<span class="track"><i style="width:' + Math.max(4, Math.round((g.count / top) * 100)) + '%"></i></span>' +
            '<span class="n">' + g.count + '</span></div>'
        }).join('') + '</div></section>'
      : ''

    appEl.innerHTML = '<div class="kpis">' + kpis + '</div>' + genres
  }

  function tile(m) {
    var meta = [m.year, m.episodes ? m.episodes + ' ép.' : '', m.score ? m.score + ' %' : ''].filter(Boolean).join(', ')
    // Une série déjà suivie le dit, plutôt que d'offrir un doublon.
    var action = m.owned
      ? '<span class="owned">Déjà dans ta liste</span>'
      : btn('data-act="add" data-id="' + m.id + '"', 'Ajouter', 'plus', '')
    return '<div class="tile-wrap"' + colorStyle(m.color) + '>' +
      '<button class="tile" data-act="open" data-id="' + m.id + '" aria-label="Ouvrir ' + esc(m.title) + ' sur le PC">' +
        '<img src="' + esc(m.cover) + '" alt="" loading="lazy">' +
        '<span class="title">' + esc(m.title) + '</span>' +
        (meta ? '<span class="meta" style="display:block">' + meta + '</span>' : '') +
      '</button>' +
      action +
    '</div>'
  }

  function renderDiscover(items) {
    sideEl.innerHTML = ''
    var tabs = [['trending', 'Tendances'], ['season', 'Cette saison']].map(function (t) {
      return '<button class="chip" data-act="dtab" data-tab="' + t[0] + '" aria-pressed="' +
        (!query && discoverTab === t[0]) + '">' + t[1] + '</button>'
    }).join('')

    countEl.textContent = query ? 'Résultats pour « ' + query + ' ».' : 'Le catalogue AniList. Choisis une jaquette pour l’ouvrir sur le PC.'
    appEl.innerHTML =
      '<div class="search">' +
        '<input type="text" id="q" placeholder="Rechercher un titre" value="' + esc(query) + '" ' +
        'autocapitalize="off" autocomplete="off" aria-label="Rechercher un titre">' +
        btn('data-act="search" aria-label="Rechercher"', '', 'search', '') +
      '</div>' +
      '<div class="chips">' + tabs + '</div>' +
      (items.length ? '<div class="grid">' + items.map(tile).join('') + '</div>'
                    : '<div class="empty">Aucun titre ne correspond. Essaie le titre anglais ou japonais.</div>')

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
      if (answer.player) renderPlayer(answer.player)
    } catch (err) {
      say(err.message)
      load()
    }
  }

  function control(action, value) {
    return send(action, { value: value })
  }

  var CONTROLS = ['play', 'pause', 'fullscreen', 'windowed', 'close', 'skip']

  // Un seul écouteur pour toute la page : les boutons portent leur intention
  // en attributs, et rien n'a besoin d'exister dans l'espace global.
  document.addEventListener('click', async function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null
    if (!el) return
    var action = el.getAttribute('data-act')
    var id = Number(el.getAttribute('data-id'))
    var ep = Number(el.getAttribute('data-ep'))

    // Ouvrir une série de la liste, et en revenir.
    if (action === 'pick') {
      sheet = id
      eps = { id: 0, data: null, mode: eps.mode }
      tree = { id: 0, data: null }
      await load()
      // Sur un téléphone la fiche remplace la liste : on remonte la voir.
      if (!isWide()) window.scrollTo(0, 0)
      // Ouverte au clavier ou à la télécommande d'une TV (un clic sans
      // pointeur a un « detail » nul) : le focus suit dans la fiche, sinon il
      // retombe au début de la page à chaque série ouverte.
      if (e.detail === 0) {
        var premier = (isWide() ? sideEl : appEl).querySelector('.sheet button, .back')
        if (premier) premier.focus()
      }
      return
    }
    if (action === 'back') { sheet = 0; tree = { id: 0, data: null }; return load() }

    if (action === 'tab') {
      tab = el.getAttribute('data-tab')
      sheet = 0
      appEl.innerHTML = '<div class="skel"></div><div class="skel"></div>'
      return load()
    }
    if (action === 'filter') { filter = el.getAttribute('data-filter'); return load() }

    // Déplier, ou replier si c'était déjà celle-là.
    if (action === 'eps') {
      if (eps.id === id) { eps = { id: 0, data: null, mode: eps.mode }; return load() }
      eps = { id: id, data: null, mode: eps.mode }
      load()
      try {
        var got = await call('/api/episodes?id=' + id)
        // La grille a pu être refermée, ou une autre ouverte, pendant l'attente.
        if (eps.id === id) { eps.data = got; load() }
      } catch (err) {
        say(err.message)
      }
      return
    }

    if (action === 'epmode') { eps.mode = el.getAttribute('data-mode'); return load() }

    // L'arbre d'une franchise : plusieurs requêtes chez AniList, donc on le
    // demande une fois et on le garde tant que la fiche reste ouverte.
    if (action === 'tree') {
      if (tree.id === id) { tree = { id: 0, data: null }; return load() }
      tree = { id: id, data: null }
      load()
      try {
        var arbre = await call('/api/franchise?id=' + id)
        if (tree.id === id) { tree.data = arbre; load() }
      } catch (err) {
        if (tree.id === id) tree = { id: 0, data: null }
        say(err.message)
        load()
      }
      return
    }

    // Un titre de l'arbre : le sélectionner, ou le replier s'il l'était.
    if (action === 'tnode') {
      tree.pick = tree.pick === id ? 0 : id
      if (!tree.pick || (tree.info && tree.info.id === id)) return load()
      tree.info = { id: id, data: null }
      load()
      var fiche
      try {
        fiche = await call('/api/media?id=' + id)
      } catch (err) {
        // Sans fiche, les boutons restent : on peut toujours lancer ou ajouter.
        fiche = { error: err.message }
      }
      // Un autre titre a pu être touché pendant l'attente.
      if (tree.info && tree.info.id === id) { tree.info.data = fiche; load() }
      return
    }

    if (action === 'ep') {
      el.disabled = true
      try {
        if (eps.mode === 'watch') {
          renderPlayer((await call('/api/watch', { id: id, episode: ep })).player)
          say('Épisode ' + ep + ' ouvert sur le PC')
          // La grille se replie : le choix est fait.
          eps = { id: 0, data: null, mode: eps.mode }
        } else {
          var isSeen = el.getAttribute('data-seen') === 'true'
          await call('/api/tick', {
            id: id,
            episode: ep,
            // En mode « cocher », toucher un épisode déjà vu le retire : c'est
            // le seul moyen de corriger une erreur depuis le téléphone.
            watched: eps.mode === 'upto' ? true : !isSeen,
            upTo: eps.mode === 'upto'
          })
          say(eps.mode === 'upto' ? 'Vus jusqu’à l’épisode ' + ep : (isSeen ? 'Épisode ' + ep + ' décoché' : 'Épisode ' + ep + ' coché'))
          eps.data = await call('/api/episodes?id=' + id)
        }
      } catch (err) {
        say(err.message)
      } finally {
        el.disabled = false
      }
      return load()
    }

    if (action === 'status') {
      var voulu = el.getAttribute('data-status')
      el.disabled = true
      try {
        await call('/api/status', { id: id, status: voulu })
        say('Passée en « ' + STATUS[voulu] + ' »')
      } catch (err) {
        say(err.message)
      }
      el.disabled = false
      return load()
    }
    if (action === 'dtab') { discoverTab = el.getAttribute('data-tab'); query = ''; return load() }
    if (action === 'search') { query = ((document.getElementById('q') || {}).value || '').trim(); return load() }

    // Enchaîner sur le suivant. La fenêtre est déjà ouverte sur la bonne
    // saison : le PC change d'épisode dans son menu, sans tout recharger.
    if (action === 'next') {
      el.disabled = true
      try {
        renderPlayer((await call('/api/watch', { id: id, episode: ep })).player)
        say('Épisode ' + ep + ' lancé sur le PC')
      } catch (err) {
        say(err.message)
      }
      el.disabled = false
      return
    }

    // Un autre hébergeur pour le même épisode. Retoucher celui qui est chargé
    // le recharge : parfois, c'est tout ce qu'il fallait.
    if (action === 'lecteur') {
      var numero = Number(el.getAttribute('data-n'))
      el.disabled = true
      try {
        renderPlayer((await call('/api/control', { action: 'lecteur', value: numero })).player)
        say('Lecteur ' + (numero + 1) + ' chargé sur le PC')
      } catch (err) {
        el.disabled = false
        say(err.message)
      }
      return
    }

    // Une case : son nouvel état est déjà posé quand le clic arrive. La
    // réponse redessine la carte avec ce que le PC applique vraiment.
    if (action === 'autoskip') {
      var coche = el.checked
      el.disabled = true
      try {
        renderPlayer((await call('/api/control', { action: 'autoskip', value: coche ? 1 : 0 })).player)
        say(coche ? 'Intro et ending passés tout seuls' : 'Plus de saut automatique')
      } catch (err) {
        el.checked = !coche
        el.disabled = false
        say(err.message)
      }
      return
    }

    if (CONTROLS.indexOf(action) >= 0) {
      el.disabled = true
      await control(action, 0)
      el.disabled = false
      return
    }

    // Le bouton s'éteint le temps de la réponse : « Regarder » interroge
    // Anime-Sama et prend parfois deux secondes ; sans retour, on tape trois fois.
    el.disabled = true
    el.setAttribute('aria-busy', 'true')
    try {
      if (action === 'tick') {
        await call('/api/tick', { id: id, episode: ep })
        say('Épisode ' + ep + ' coché')
        return load()
      }
      if (action === 'add') {
        await call('/api/add', { id: id })
        say('Ajoutée à ta liste')
        // Ajoutée depuis l'arbre : il se relit pour dire « Dans ta liste ».
        // Sa structure est gardée par le PC, la relecture ne coûte presque rien.
        if (tree.id && tree.data) {
          var relu = await call('/api/franchise?id=' + tree.id).catch(function () { return null })
          if (relu && tree.data) tree.data = relu
        }
        return load()
      }
      if (action === 'watch') {
        renderPlayer((await call('/api/watch', { id: id, episode: ep })).player)
        say('Épisode ' + ep + ' lancé sur le PC')
      } else if (action === 'trailer') {
        renderPlayer((await call('/api/trailer', { id: id })).player)
        say('Bande-annonce lancée sur le PC')
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
      el.removeAttribute('aria-busy')
    }
  })

  /**
   * Les flèches, pour une TV ou un clavier.
   *
   * La télécommande d'une TV n'a pas de pointeur : ses flèches vont d'un
   * élément à son voisin dans la direction pressée — le plus proche dans
   * l'axe, en pénalisant l'écart de travers. Les champs et les curseurs
   * gardent leurs flèches.
   */
  var DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  document.addEventListener('keydown', function (e) {
    var dir = DIRS[e.key]
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return
    var here = document.activeElement
    if (here && (here.tagName === 'INPUT' || here.tagName === 'TEXTAREA' || here.tagName === 'SELECT')) return
    var all = [].slice.call(document.querySelectorAll('button:not([disabled]), a[href], input'))
      .filter(function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    if (!here || here === document.body) {
      if (all[0]) { e.preventDefault(); all[0].focus() }
      return
    }
    var from = here.getBoundingClientRect()
    var cx = from.left + from.width / 2, cy = from.top + from.height / 2
    var best = null, score = Infinity
    all.forEach(function (el) {
      if (el === here) return
      var r = el.getBoundingClientRect()
      var dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy
      var along = dx * dir[0] + dy * dir[1]
      if (along <= 1) return
      var across = Math.abs(dir[0] ? dy : dx)
      var s = along + across * 2
      if (s < score) { score = s; best = el }
    })
    if (best) {
      e.preventDefault()
      best.focus()
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  })

  async function load() {
    renderNav()
    layout()
    try {
      if (tab === 'library') return renderLibrary((await call('/api/library')).rows)
      if (tab === 'calendar') return renderCalendar((await call('/api/calendar')).airing)
      if (tab === 'stats') return renderStats(await call('/api/stats'))
      if (tab === 'discover') {
        appEl.innerHTML = '<div class="skel"></div><div class="skel"></div>'
        var q = query ? '&q=' + encodeURIComponent(query) : ''
        return renderDiscover((await call('/api/discover?kind=' + discoverTab + q)).items)
      }
      render(await call('/api/state'))
    } catch (err) {
      if (err.message === 'unauthorized') askToken('Mot de passe demandé.')
      else appEl.innerHTML = '<div class="err">' + esc(err.message) + '</div>'
    } finally {
      // Chaque onglet a vidé ou rempli la colonne : elle suit.
      layout()
    }
  }

  // Passer d'un écran étroit à large — tablette qu'on tourne, fenêtre qu'on
  // élargit — déplace la fiche : on redessine.
  if (wideQuery.addEventListener) wideQuery.addEventListener('change', function () { load() })

  load()
  // La bibliothèque bouge lentement ; une vidéo qui joue, non. Deux rythmes,
  // et le second passe par une adresse légère. Le rafraîchissement de fond ne
  // touche que l'accueil sans fiche ouverte : reconstruire sous les doigts
  // ferait sauter le défilement et replierait la grille qu'on consultait.
  setInterval(function () { if (tab === 'home' && !sheet) load() }, 20000)
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
<link rel="icon" href="data:,">
<title>AnimeList, télécommande</title>
<style>${STYLE}</style>
</head>
<body>
<div class="shell">
  <nav id="nav" aria-label="Onglets"></nav>
  <main>
    <header>
      <h1 class="brand">AnimeList</h1>
      <p class="lede" id="count" aria-live="polite">Chargement…</p>
      <p class="offline" id="offline" role="status" hidden></p>
    </header>
    <div id="app"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
  </main>
  <div class="col">
    <div id="player"></div>
    <aside id="side" aria-label="Fiche de la série"></aside>
  </div>
</div>
<div class="flash" id="flash" role="status"></div>
<script>${SCRIPT}</script>
</body>
</html>`
}
