NexStream — atualização de séries, filtros e navegação

Inclui:
- cards de séries clicáveis;
- detalhes, temporadas e episódios via get_series_info;
- reprodução de episódios;
- botão Voltar na página da série e no player;
- restauração de categoria, busca, página e rolagem;
- filtros completos com nomes reais e contagem por categoria;
- barra lateral de categorias semelhante às referências;
- seção Adicionados recentemente;
- início restaurado com Hero, Continue assistindo, TV, filmes e séries.

Instalação:
1. Extraia a pasta nexstream-series-update dentro da raiz do projeto.
2. Abra PowerShell na raiz do projeto.
3. Execute:
   Set-ExecutionPolicy -Scope Process Bypass -Force
   .\nexstream-series-update\aplicar-atualizacao.ps1
4. Rode os dois typechecks mostrados pelo script.
5. Reinicie api e web.

Um backup dos arquivos substituídos será criado em .nexstream-backups.
