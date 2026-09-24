/**
 * Les sections des Réglages, dans leur ordre.
 *
 * Partagées avec la palette (`Ctrl+K`) : on y tape « discord » ou « sous-titres »
 * et on arrive sur la bonne carte, sans parcourir la page à la molette. Les mots
 * clés sont ceux qu'on chercherait, pas forcément ceux du titre.
 */
export const SETTINGS_SECTIONS = [
  {
    id: 'apparence',
    title: 'Apparence',
    keywords: 'thème couleur accent disposition mica nouveau design expérience mouvement animation badge son trophée'
  },
  { id: 'affichage', title: 'Affichage', keywords: 'titres langue romaji anglais semaine lundi durée adulte' },
  { id: 'notifications', title: 'Notifications', keywords: 'rappel alerte diffusion délai sortie épisode' },
  {
    id: 'lecture',
    title: 'Lecture',
    keywords: 'lecteur coche automatique enchaîner épisode suivant anime-sama opening générique'
  },
  { id: 'suites', title: 'Suites', keywords: 'saison suivante ajout automatique franchise' },
  {
    id: 'telecommande',
    title: 'Télécommande',
    keywords: 'téléphone qr code mobile mot de passe calendrier ics agenda abonnement diffusions'
  },
  { id: 'discord', title: 'Statut Discord', keywords: 'discord rich presence profil' },
  { id: 'traduction', title: 'Traduction', keywords: 'résumé français traduire deepl' },
  { id: 'suivis', title: 'Ce que tu suis', keywords: 'studio doubleur suivre muets' },
  {
    id: 'donnees',
    title: 'Mes données',
    keywords:
      'import export sauvegarde automatique copie datée rotation restaurer tv time myanimelist anilist kitsu cache santé raccourcis clavier dossier effacer'
  },
  { id: 'a-propos', title: 'À propos', keywords: 'version mise à jour auteur' }
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

/** Sans casse ni accents : « telecommande » doit trouver « Télécommande ». */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
