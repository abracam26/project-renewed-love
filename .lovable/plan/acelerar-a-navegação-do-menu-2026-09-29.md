# Acelerar a navegação do menu

## Objetivo
Reduzir a espera percebida ao abrir as páginas pelo menu lateral, sem alterar regras ou dados do sistema.

## Alterações
- Pré-carregar as páginas do menu assim que o usuário demonstrar intenção de acessá-las.
- Manter consultas recentes em memória por um curto período para evitar recargas desnecessárias ao voltar a uma página.
- Exibir uma indicação discreta e imediata de carregamento durante a troca de tela.
- Conferir a navegação nas opções principais e validar a compilação.

## Detalhes técnicos
- Configurar o roteador para preload por intenção com atraso mínimo.
- Definir cache padrão curto no cliente de consultas, preservando invalidações explícitas após alterações.
- Usar o estado de navegação do próprio roteador para o indicador visual.
