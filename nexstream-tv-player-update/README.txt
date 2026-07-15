ATUALIZAÇÃO NEXSTREAM — FILTROS DA TV E BARRA DE PROGRESSO

Esta atualização adiciona:
- catálogo completo da TV ao vivo, sem limitar aos primeiros 120 canais;
- busca de canais;
- busca de categorias;
- filtros rápidos e categorias clicáveis com contagem;
- paginação dos canais;
- cards próprios para TV ao vivo;
- barra de progresso, tempo atual e duração em filmes e episódios;
- indicação AO VIVO em canais, onde não existe seek normal;
- salvamento de progresso ao pausar, fechar e a cada 15 segundos.

INSTALAÇÃO

1. Extraia a pasta nexstream-tv-player-update na raiz do projeto.
2. Abra o PowerShell na raiz do NexStream.
3. Execute:

Set-ExecutionPolicy -Scope Process Bypass -Force
.\nexstream-tv-player-update\aplicar-atualizacao.ps1

4. Valide:

docker compose -f docker-compose.dev.yml exec api `
    pnpm --filter @nexstream/api typecheck

docker compose -f docker-compose.dev.yml exec web `
    pnpm --filter @nexstream/web typecheck

5. Reinicie:

docker compose -f docker-compose.dev.yml restart api web
Start-Sleep -Seconds 5

6. Limpe o cache do Next, se necessário:

docker compose -f docker-compose.dev.yml stop web
Remove-Item ".\apps\web\.next" -Recurse -Force -ErrorAction SilentlyContinue
docker compose -f docker-compose.dev.yml up -d web

7. Abra com Ctrl+F5:
http://localhost:3000/dashboard/tv
