# Interface d'installation d'AnimeList.
#
# electron-builder greffe ce fichier (nsis.include) AVANT MUI2 et avant la
# déclaration des pages : on garde donc le moteur NSIS — et avec lui la mise à
# jour automatique, qui relance ce même installeur en silence — mais on redessine
# ce que l'on voit.
#
# Le parcours se réduit à trois écrans, tous sombres et sans assistant :
#
#   1. notre page : titre, dossier d'installation, bouton « Installer »
#   2. la page INSTFILES de MUI, rhabillée (même en-tête, barre teintée)
#   3. notre page de fin : « Lancer AnimeList »
#
# Les pages de MUI restent celles de Windows : on masque leur en-tête gris, leurs
# trois boutons du bas et leur pied de page, on étire la boîte de dialogue
# intérieure sur toute la fenêtre, puis on pose nos propres contrôles dessus.
#
# Deux pièges, payés comptant :
#
#   - Les boutons sont des libellés (STATIC), pas de vrais boutons : Windows
#     n'envoie jamais WM_CTLCOLORBTN à un bouton poussoir, qui resterait donc
#     gris quoi qu'on fasse. Un STATIC avec SS_NOTIFY se clique aussi bien.
#   - Les System::Call sont délimités par des accents graves. Avec des
#     apostrophes, le premier « d'installation » venu coupe la chaîne en deux et
#     l'installeur meurt sans un mot.

!ifndef BUILD_UNINSTALLER

!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

# « Installation de AnimeList » : le nom seul suffit.
Caption "${PRODUCT_NAME}"

# Les jetons du thème Nébuleuse (src/renderer/src/styles.css)
!define ND_BG      0x05060C
!define ND_PANEL   0x141829
!define ND_TEXT    0xECEDF2
!define ND_DIM     0x8C90A3
!define ND_ACCENT  0x7C5CFF
!define ND_ON_ACC  0xFFFFFF
!define ND_ACCENT_HI 0x9279FF
!define ND_PANEL_HI  0x1F2540

# Journal sombre (il reste masqué) et barre lisse. Surtout pas « colored » :
# NSIS repeindrait la barre à chaque fichier et écraserait nos couleurs.
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_INSTFILESPAGE_COLORS "ECEDF2 05060C"

# Styles de fenêtre, absents des en-têtes de NSIS
!define ND_WS_CHILD_VISIBLE 0x50000000
!define ND_SWP_QUIET 0x0014

# Les mêmes couleurs vues par Windows, qui les lit à l'envers (COLORREF = BGR)
!define ND_BGR_BG     0x0C0605
!define ND_BGR_PANEL  0x291814
!define ND_BGR_TEXT   0xF2EDEC
!define ND_BGR_ACCENT 0xFF5C7C

!define /ifndef PBM_SETBARCOLOR 0x0409
!define /ifndef PBM_SETBKCOLOR 0x2001

# La fenêtre de NSIS fait environ 497 x 361 pixels : les marges sont à cette
# échelle, et tout ce qui dépend de la largeur se calcule à l'affichage.
!define ND_PAD 24
!define ND_ICON 32
!define ND_TEXT_X 68
!define ND_ROW_Y 112

# Un contrôle STATIC posé sur n'importe quelle boîte de dialogue — y compris
# celles de MUI, que nsDialogs ne sait pas remplir.
!macro ndStatic PARENT STYLE X Y W H TEXT OUT
  System::Call `user32::CreateWindowExW(i 0, w "STATIC", w "${TEXT}", i ${ND_WS_CHILD_VISIBLE}|${STYLE}, i ${X}, i ${Y}, i ${W}, i ${H}, i ${PARENT}, i 0, i 0, i 0) i .s`
  Pop ${OUT}
!macroend

!macro ndFont HWND FONT
  SendMessage ${HWND} ${WM_SETFONT} ${FONT} 1
!macroend

!macro ndHide PARENT ID VAR
  GetDlgItem ${VAR} ${PARENT} ${ID}
  ShowWindow ${VAR} ${SW_HIDE}
!macroend

# Une seule installation possible : celle de l'utilisateur courant, sans droits
# administrateur. Sans ça, MUI ouvre d'abord une page « pour qui installer ? ».
# Les options /allusers et /currentuser continuent de passer avant.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

# Tout le reste vit dans les macros de pages : elles sont insérées plus bas dans
# le script d'electron-builder, là où $launchLink et consorts existent enfin.
!macro customPageAfterChangeDir
  Var ndW
  Var ndH
  Var ndDlg
  Var ndPath
  Var ndBtnBrowse
  Var ndBtnInstall
  Var ndBtnA
  Var ndBtnB
  Var ndHover
  Var ndHandCursor
  Var ndFontTitle
  Var ndFontSub
  Var ndFontBody
  Var ndFontBtn

  # Déshabille la fenêtre de MUI et rend la boîte intérieure (sur la pile)
  # maîtresse de toute la surface. Renseigne $ndW et $ndH au passage.
  Function ndChrome
    Exch $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5

    !insertmacro ndHide $HWNDPARENT 1034 $1 # fond de l'en-tête
    !insertmacro ndHide $HWNDPARENT 1035 $1 # trait sous l'en-tête
    !insertmacro ndHide $HWNDPARENT 1036 $1
    !insertmacro ndHide $HWNDPARENT 1037 $1 # titre de l'en-tête
    !insertmacro ndHide $HWNDPARENT 1038 $1 # sous-titre
    !insertmacro ndHide $HWNDPARENT 1039 $1 # icône
    !insertmacro ndHide $HWNDPARENT 1045 $1 # trait pleine largeur
    !insertmacro ndHide $HWNDPARENT 1046 $1 # image d'en-tête
    !insertmacro ndHide $HWNDPARENT 1028 $1 # fond du pied
    !insertmacro ndHide $HWNDPARENT 1256 $1 # texte de marque
    !insertmacro ndHide $HWNDPARENT 1 $1    # Suivant
    !insertmacro ndHide $HWNDPARENT 2 $1    # Annuler
    !insertmacro ndHide $HWNDPARENT 3 $1    # Précédent

    SetCtlColors $HWNDPARENT ${ND_TEXT} ${ND_BG}
    SetCtlColors $0 ${ND_TEXT} ${ND_BG}

    # Un membre de structure laissé vide se sert sur la pile de NSIS : on lit
    # les quatre coins, même si seuls les deux derniers servent.
    System::Alloc 16
    Pop $1
    System::Call `user32::GetClientRect(i $HWNDPARENT, i $1)`
    System::Call `*$1(i .r4, i .r5, i .r2, i .r3)`
    System::Free $1
    StrCpy $ndW $2
    StrCpy $ndH $3

    System::Call `user32::SetWindowPos(i $0, i 0, i 0, i 0, i $2, i $3, i ${ND_SWP_QUIET})`
    System::Call `user32::InvalidateRect(i $HWNDPARENT, i 0, i 1)`

    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd

  Function ndFonts
    ${If} $ndFontTitle == ""
      CreateFont $ndFontTitle "Segoe UI" 16 400
      CreateFont $ndFontSub "Segoe UI" 9 400
      CreateFont $ndFontBody "Segoe UI" 8 400
      CreateFont $ndFontBtn "Segoe UI" 10 600
    ${EndIf}
  FunctionEnd

  # L'icône, le nom et une ligne de contexte, aux mêmes pixels sur les trois
  # pages : passer de l'une à l'autre ne doit rien déplacer.
  # Pile : boîte de dialogue, sous-titre.
  Function ndHeader
    Exch $0 # sous-titre
    Exch
    Exch $1 # boîte
    Push $2
    Push $3
    Push $4

    System::Call `kernel32::GetModuleHandleW(i 0) i .r2`
    System::Call `user32::LoadImageW(i r2, t "#103", i 1, i ${ND_ICON}, i ${ND_ICON}, i 0) i .r3`
    !insertmacro ndStatic $1 ${SS_ICON} ${ND_PAD} 26 ${ND_ICON} ${ND_ICON} "" $4
    SendMessage $4 ${STM_SETICON} $3 0

    IntOp $2 $ndW - ${ND_TEXT_X}
    IntOp $2 $2 - ${ND_PAD}

    !insertmacro ndStatic $1 ${SS_LEFTNOWORDWRAP}|${SS_CENTERIMAGE} ${ND_TEXT_X} 22 $2 26 "${PRODUCT_NAME}" $4
    !insertmacro ndFont $4 $ndFontTitle
    SetCtlColors $4 ${ND_TEXT} ${ND_BG}

    !insertmacro ndStatic $1 ${SS_LEFTNOWORDWRAP}|${SS_CENTERIMAGE} ${ND_TEXT_X} 48 $2 18 "$0" $4
    !insertmacro ndFont $4 $ndFontSub
    SetCtlColors $4 ${ND_DIM} ${ND_BG}

    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd

  # Un STATIC ne sait pas dire « la souris est sur moi » : pas de WM_MOUSEHOVER,
  # pas de WM_MOUSELEAVE tant que personne ne les a demandés. On regarde donc
  # nous-mêmes, quarante fois par seconde, et on ne repeint qu'au changement.
  Function ndHoverTick
    Push $0
    Push $1
    Push $2
    Push $3

    System::Alloc 8
    Pop $3
    System::Call `user32::GetCursorPos(i $3)`
    System::Call `*$3(i .r1, i .r2)`
    System::Free $3
    System::Call `user32::WindowFromPoint(i r1, i r2) i .r0`

    ${If} $0 != $ndHover
      ${If} $ndHover == $ndBtnA
        SetCtlColors $ndHover ${ND_ON_ACC} ${ND_ACCENT}
        System::Call `user32::InvalidateRect(i $ndHover, i 0, i 1)`
      ${ElseIf} $ndHover == $ndBtnB
        SetCtlColors $ndHover ${ND_TEXT} ${ND_PANEL}
        System::Call `user32::InvalidateRect(i $ndHover, i 0, i 1)`
      ${EndIf}

      ${If} $0 == $ndBtnA
        SetCtlColors $0 ${ND_ON_ACC} ${ND_ACCENT_HI}
        System::Call `user32::InvalidateRect(i $0, i 0, i 1)`
      ${ElseIf} $0 == $ndBtnB
        SetCtlColors $0 ${ND_TEXT} ${ND_PANEL_HI}
        System::Call `user32::InvalidateRect(i $0, i 0, i 1)`
      ${EndIf}

      StrCpy $ndHover $0
    ${EndIf}

    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd

  # $ndBtnA : le bouton d'accent de la page ; $ndBtnB : le secondaire.
  Function ndHoverStart
    StrCpy $ndHover ""
    ${If} $ndHandCursor == ""
      System::Call `user32::LoadCursorW(i 0, i 32649) i .r0`
      StrCpy $ndHandCursor $0
    ${EndIf}

    # -12 : le curseur de la classe STATIC. Seuls nos boutons le verront : un
    # libellé sans SS_NOTIFY est transparent au pointage, et c'est le dialogue
    # qui répond à sa place.
    System::Call `user32::SetClassLongW(i $ndBtnA, i -12, i $ndHandCursor)`
    ${NSD_CreateTimer} ndHoverTick 40
  FunctionEnd

  Function ndHoverStop
    ${NSD_KillTimer} ndHoverTick
  FunctionEnd

  Function ndOnBrowse
    Pop $0
    ${If} $0 != $ndBtnBrowse
      Return
    ${EndIf}
    nsDialogs::SelectFolderDialog "Où installer ${PRODUCT_NAME} ?" "$INSTDIR"
    Pop $0
    ${If} $0 == error
      Return
    ${EndIf}

    # Toujours finir par un dossier au nom de l'app : on ne déverse pas les
    # fichiers dans le dossier choisi s'il s'appelle autrement.
    StrLen $1 "${APP_FILENAME}"
    StrCpy $2 $0 "" -$1
    ${If} $2 != "${APP_FILENAME}"
      StrCpy $0 "$0\${APP_FILENAME}"
    ${EndIf}

    StrCpy $INSTDIR $0
    SendMessage $ndPath ${WM_SETTEXT} 0 "STR:  $INSTDIR"
  FunctionEnd

  Function ndOnInstall
    Pop $0
    ${If} $0 != $ndBtnInstall
      Return
    ${EndIf}
    SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
  FunctionEnd

  Function ndInstallPage
    # Une mise à jour automatique ne pose aucune question.
    ${If} ${isUpdated}
      Abort
    ${EndIf}

    Call ndFonts
    nsDialogs::Create 1018
    Pop $ndDlg
    ${If} $ndDlg == error
      Abort
    ${EndIf}

    Push $ndDlg
    Call ndChrome

    Push $ndDlg
    Push "Version ${VERSION} · installation dans votre compte Windows"
    Call ndHeader

    !insertmacro ndStatic $ndDlg ${SS_LEFTNOWORDWRAP}|${SS_CENTERIMAGE} ${ND_PAD} ${ND_ROW_Y} 240 16 "Dossier d’installation" $0
    !insertmacro ndFont $0 $ndFontBody
    SetCtlColors $0 ${ND_DIM} ${ND_BG}

    # Le chemin, dans un bandeau plus clair. Les deux espaces tiennent lieu de
    # marge intérieure : un STATIC n'en a pas.
    IntOp $1 $ndW - 166
    !insertmacro ndStatic $ndDlg ${SS_PATHELLIPSIS}|${SS_CENTERIMAGE} ${ND_PAD} 132 $1 28 "  $INSTDIR" $ndPath
    !insertmacro ndFont $ndPath $ndFontBody
    SetCtlColors $ndPath ${ND_TEXT} ${ND_PANEL}

    IntOp $2 $ndW - 134
    nsDialogs::CreateControl STATIC ${ND_WS_CHILD_VISIBLE}|${SS_NOTIFY}|${SS_CENTER}|${SS_CENTERIMAGE} 0 $2 132 110 28 "Changer…"
    Pop $ndBtnBrowse
    !insertmacro ndFont $ndBtnBrowse $ndFontBody
    SetCtlColors $ndBtnBrowse ${ND_TEXT} ${ND_PANEL}
    ${NSD_OnClick} $ndBtnBrowse ndOnBrowse

    IntOp $1 $ndW - 48
    !insertmacro ndStatic $ndDlg ${SS_LEFTNOWORDWRAP}|${SS_CENTERIMAGE} ${ND_PAD} 172 $1 16 "Aucun droit administrateur n’est demandé." $0
    !insertmacro ndFont $0 $ndFontBody
    SetCtlColors $0 ${ND_DIM} ${ND_BG}

    !insertmacro ndStatic $ndDlg ${SS_LEFTNOWORDWRAP}|${SS_CENTERIMAGE} ${ND_PAD} 196 $1 16 "Raccourcis sur le bureau et dans le menu Démarrer." $0
    !insertmacro ndFont $0 $ndFontBody
    SetCtlColors $0 ${ND_DIM} ${ND_BG}

    !insertmacro ndStatic $ndDlg ${SS_LEFTNOWORDWRAP}|${SS_CENTERIMAGE} ${ND_PAD} 220 $1 16 "Votre bibliothèque et vos réglages restent où ils sont." $0
    !insertmacro ndFont $0 $ndFontBody
    SetCtlColors $0 ${ND_DIM} ${ND_BG}

    IntOp $2 $ndW - 174
    IntOp $3 $ndH - 64
    nsDialogs::CreateControl STATIC ${ND_WS_CHILD_VISIBLE}|${SS_NOTIFY}|${SS_CENTER}|${SS_CENTERIMAGE} 0 $2 $3 150 40 "Installer"
    Pop $ndBtnInstall
    !insertmacro ndFont $ndBtnInstall $ndFontBtn
    SetCtlColors $ndBtnInstall ${ND_ON_ACC} ${ND_ACCENT}
    ${NSD_OnClick} $ndBtnInstall ndOnInstall

    StrCpy $ndBtnA $ndBtnInstall
    StrCpy $ndBtnB $ndBtnBrowse
    Call ndHoverStart

    nsDialogs::Show
  FunctionEnd

  # La page de MUI qui installe vraiment. On ne la remplace pas — elle porte la
  # barre de progression — on la rhabille quand elle s'affiche, en reprenant
  # l'en-tête de la page précédente.
  Function ndProgressShow
    Call ndFonts
    FindWindow $0 "#32770" "" $HWNDPARENT
    Push $0
    Call ndChrome

    Push $0
    Push "Installation en cours…"
    Call ndHeader

    # 1006 : le texte d'état ; 1004 : la barre ; 1027 et 1016 : le bouton
    # « Afficher les détails » et son journal, dont on ne veut pas.
    !insertmacro ndHide $0 1027 $1
    !insertmacro ndHide $0 1016 $1

    IntOp $2 $ndW - 48

    GetDlgItem $1 $0 1006
    System::Call `user32::SetWindowPos(i $1, i 0, i ${ND_PAD}, i ${ND_ROW_Y}, i $2, i 16, i ${ND_SWP_QUIET})`
    !insertmacro ndFont $1 $ndFontBody
    SetCtlColors $1 ${ND_DIM} ${ND_BG}

    # Une barre à thème visuel reste vert Windows et sa gouttière reste blanche.
    # Il faut la déshabiller ET lui retirer ses deux liserés (WS_EX_CLIENTEDGE
    # 0x200 et WS_EX_STATICEDGE 0x20000) : tant qu'il reste le second, la
    # gouttière ignore sa couleur. Le 0x20 du SetWindowPos redemande le cadre.
    GetDlgItem $1 $0 1004
    System::Call `uxtheme::SetWindowTheme(i $1, w " ", w " ")`
    System::Call `user32::GetWindowLongW(i $1, i -20) i .r3`
    IntOp $3 $3 & 0xFFFDFDFF
    System::Call `user32::SetWindowLongW(i $1, i -20, i $3)`
    System::Call `user32::SetWindowPos(i $1, i 0, i ${ND_PAD}, i 136, i $2, i 8, i 0x0034)`
    SendMessage $1 ${PBM_SETBARCOLOR} 0 ${ND_BGR_ACCENT}
    SendMessage $1 ${PBM_SETBKCOLOR} 0 ${ND_BGR_PANEL}
    System::Call `user32::InvalidateRect(i $1, i 0, i 1)`
  FunctionEnd

  Page custom ndInstallPage ndHoverStop

  # Consommé par le !insertmacro MUI_PAGE_INSTFILES qui suit immédiatement.
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW ndProgressShow
!macroend

# Arrivé au bout de la section, on passe la main à notre page de fin : les trois
# boutons de MUI étant masqués, personne ne peut cliquer « Suivant ».
!macro customInstall
  # PostMessage et non SendMessage : la section tourne dans son propre fil, et
  # attendre que le fil de l'interface change de page les bloque tous les deux
  # (l'installeur reste figé à un quart de la barre).
  ${IfNot} ${Silent}
    System::Call `user32::PostMessageW(i $HWNDPARENT, i 0x408, i 1, i 0)`
  ${EndIf}
!macroend

!macro customFinishPage
  Var ndBtnRun
  Var ndBtnClose

  Function ndOnRun
    Pop $0
    ${If} $0 != $ndBtnRun
      Return
    ${EndIf}
    HideWindow
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${EndIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
  FunctionEnd

  Function ndOnClose
    Pop $0
    ${If} $0 != $ndBtnClose
      Return
    ${EndIf}
    SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
  FunctionEnd

  Function ndFinishPage
    Call ndFonts
    nsDialogs::Create 1018
    Pop $ndDlg
    ${If} $ndDlg == error
      Abort
    ${EndIf}

    Push $ndDlg
    Call ndChrome

    Push $ndDlg
    Push "Version ${VERSION} installée. Bon visionnage."
    Call ndHeader

    IntOp $1 $ndW - 48
    !insertmacro ndStatic $ndDlg ${SS_LEFTNOWORDWRAP}|${SS_CENTERIMAGE} ${ND_PAD} ${ND_ROW_Y} $1 16 "Un raccourci vous attend sur le bureau et dans le menu Démarrer." $0
    !insertmacro ndFont $0 $ndFontBody
    SetCtlColors $0 ${ND_DIM} ${ND_BG}

    IntOp $3 $ndH - 64

    IntOp $2 $ndW - 296
    nsDialogs::CreateControl STATIC ${ND_WS_CHILD_VISIBLE}|${SS_NOTIFY}|${SS_CENTER}|${SS_CENTERIMAGE} 0 $2 $3 110 40 "Fermer"
    Pop $ndBtnClose
    !insertmacro ndFont $ndBtnClose $ndFontBtn
    SetCtlColors $ndBtnClose ${ND_TEXT} ${ND_PANEL}
    ${NSD_OnClick} $ndBtnClose ndOnClose

    IntOp $2 $ndW - 174
    nsDialogs::CreateControl STATIC ${ND_WS_CHILD_VISIBLE}|${SS_NOTIFY}|${SS_CENTER}|${SS_CENTERIMAGE} 0 $2 $3 150 40 "Lancer AnimeList"
    Pop $ndBtnRun
    !insertmacro ndFont $ndBtnRun $ndFontBtn
    SetCtlColors $ndBtnRun ${ND_ON_ACC} ${ND_ACCENT}
    ${NSD_OnClick} $ndBtnRun ndOnRun

    StrCpy $ndBtnA $ndBtnRun
    StrCpy $ndBtnB $ndBtnClose
    Call ndHoverStart

    nsDialogs::Show
  FunctionEnd

  Page custom ndFinishPage ndHoverStop
!macroend

# Barre de titre sombre, sur Windows 10 2004 et au-delà. L'attribut 20 est
# ignoré ailleurs : pas besoin de tester la version.
Function ndGuiInit
  System::Call `dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 20, *i 1, i 4)`
  # 35, 36, 34 : fond, texte et contour de la barre de titre (Windows 11).
  System::Call `dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 35, *i ${ND_BGR_BG}, i 4)`
  System::Call `dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 36, *i ${ND_BGR_TEXT}, i 4)`
  System::Call `dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 34, *i ${ND_BGR_PANEL}, i 4)`
FunctionEnd

!define MUI_CUSTOMFUNCTION_GUIINIT ndGuiInit

!endif
