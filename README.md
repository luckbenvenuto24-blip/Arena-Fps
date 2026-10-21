# ARENA STRIKE — Jogo FPS 3D Competitivo Multiplayer

**ARENA STRIKE** é um jogo FPS 3D competitivo multiplayer em tempo real executado diretamente no navegador, inspirado nas mecânicas táticas de *Counter-Strike 2 (CS2)*, com servidor Node.js autoritativo via WebSockets, física 3D compartilhada, sistema de hitboxes anatômicas (Cabeça, Tronco, Braços e Pernas), compensação de latência e suporte a partidas **X1**, **Todos contra Todos (até 6 jogadores)**, **2v2** e **3v3**.

---

## 1. Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** 18+ (testado em Node.js v24)
- **npm** 9+

### Instalação e Execução em Desenvolvimento
```bash
# 1. Instalar dependências
npm install

# 2. Iniciar simultaneamente o Servidor Autoritativo (porta 3001) e o Cliente 3D (porta 5173)
npm run dev
```
Após iniciar, abra no navegador:
- **URL Local**: `http://localhost:5173`
- **URL na Rede Local (LAN)**: `http://SEU_IP_LOCAL:5173`

---

## 2. Como Jogar X1 ou Até 6 Jogadores com Amigos pela Internet

### Opção A — Túnel Rápido (Cloudflare Tunnel / ngrok)
Com `npm run dev` em execução, exponha a porta `5173` (o Vite já faz proxy automático do WebSocket `/ws` e da API `/api` para o servidor autoritativo na porta `3001`):
```bash
npx cloudflared tunnel --url http://localhost:5173
```
Envie o link HTTPS gerado para seus amigos! Basta criar uma sala, copiar o **Código da Sala** (ou **Link de Convite**) no Lobby e iniciar a partida.

### Opção B — Hospedagem Persistente em Produção (Render, Railway, Fly.io, VPS)
O servidor Node.js (`src/server/index.ts`) serve tanto o WebSocket autoritativo (`/ws`) quanto o bundle otimizado do cliente (`dist/`):
```bash
# 1. Compilar TypeScript e gerar bundle de produção
npm run build

# 2. Iniciar o servidor persistente de produção (porta definida em PORT ou 3001)
npm start
```

---

## 3. Testes Automatizados

Para executar a suíte de testes automatizados (física, colisão com paredes, raycasting nas hitboxes de cabeça/tronco/braços/pernas, bloqueio de tiro por paredes, duelo X1 multiplayer real via WebSockets, salas de até 6 jogadores e reconexão):
```bash
npm test
```

---

## 4. Controles no Jogo

| Tecla / Mouse | Ação |
|---|---|
| `W`, `A`, `S`, `D` | Movimentação com aceleração e física |
| `Mouse` | Controle da câmera 3D em primeira pessoa |
| `Clique Esquerdo` | Disparar arma equipada |
| `Clique Direito` | Luneta funcional (`AWM-X Titan`) / Mira Tática (`ADS`) |
| `R` | Recarregar arma |
| `Espaço` | Pular (ou alternar jogador no Modo Espectador) |
| `Ctrl` ou `C` | Agachar (reduz altura da câmera, hitbox e dispersão) |
| `Shift` | Andar silenciosamente (sem som de passos e maior precisão) |
| `1`, `2`, `3`, `4`, `5` | Trocar armas (`KR-47 Vandal`, `VX-9 Specter`, `AWM-X Titan`, `P-250 Tactical`, `Karambit Omega`) |
| `Q` / `Scroll` | Alternar arma rápida |
| `Tab` | Exibir Placar Tático completo |
| `Esc` | Abrir menu de pausa / configurações e liberar o cursor |
