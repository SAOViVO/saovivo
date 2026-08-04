!include "LogicLib.nsh"

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Vas a instalar SAOViVO"
  !define MUI_WELCOMEPAGE_TEXT "El programa prepara links de YouTube y archivos locales para transmitirlos como un stream continuo.$\r$\n$\r$\nCómo funciona$\r$\n$\r$\n01 · Elegí tus videos$\r$\n$\r$\n02 · Prepará tu canal$\r$\n$\r$\n03 · Transmití"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Instalando SAOViVO"
  !define MUI_PAGE_HEADER_SUBTEXT "Copiando archivos y preparando los accesos directos."
!macroend

!macro customInstall
  SetDetailsPrint textonly
  DetailPrint "Finalizando la instalación..."
  SetDetailsPrint none
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "SAOViVO está listo"
  !define MUI_FINISHPAGE_TEXT "La instalación terminó correctamente."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_RUN_TEXT "Abrir SAOViVO"
  !insertmacro MUI_PAGE_FINISH
!macroend
