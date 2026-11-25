# O.S. Rápido — instalação

Pasta `extensao\` = código-fonte. Para instalar no navegador, use a pasta `extensao` direto
(navegadores Chromium) ou gere os pacotes com `empacotar.ps1`.

## Navegadores baseados em Chromium (mesma pasta serve para todos)
Ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta `extensao`:

| Navegador | Endereço da página de extensões |
|---|---|
| Google Chrome | `chrome://extensions` |
| Microsoft Edge | `edge://extensions` |
| Opera / Opera GX | `opera://extensions` |
| Brave | `brave://extensions` |
| Vivaldi | `vivaldi://extensions` |

Requisito: versão 111 ou mais nova do motor (todos os acima, desde 2023).
No Opera, se o ícone não aparecer na barra, clique no cubo de extensões e fixe "O.S. Rápido - MK".

## Firefox (128 ou mais novo)
Rode `empacotar.ps1` e use a pasta `dist\firefox`:
1. Abra `about:debugging#/runtime/this-firefox`.
2. **Carregar extensão temporária…** e escolha `dist\firefox\manifest.json`.
3. Em `about:addons` > O.S. Rápido > **Permissões**, conceda o acesso aos sites (o Firefox não concede sozinho).

A carga temporária some ao fechar o Firefox. Para instalação permanente o Firefox exige extensão **assinada**
(envio ao addons.mozilla.org como "não listada") ou o Firefox Developer Edition/Nightly.

## Safari
Não é compatível sem converter o projeto no Xcode (Mac).

## Atalho de teclado
`Alt+Shift+O` abre a extensão (já na aba O.S., com o botão "Gerar O.S." selecionado: aperte Enter).
Para trocar a tecla: engrenagem no topo do popup > "editar", que abre a página de atalhos do navegador
(`chrome://extensions/shortcuts`, `edge://extensions/shortcuts`, `opera://extensions/shortcuts`...).
Se a tecla não funcionar, ela pode estar em uso por outro programa ou extensão: escolha outra lá.

## Depois de instalar
1. Recarregue a aba do MK (F5).
2. Abra um atendimento: o checklist aparece no canto da tela.
3. Clique no ícone da extensão: aba **O.S.** (gerar o texto) e aba **Rota** (técnico por região/endereço).
