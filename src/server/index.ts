import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { ArenaServer } from './RoomManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createArenaHttpServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const arena = new ArenaServer(server);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ARENA STRIKE Authoritative Server',
      rooms: arena.getPublicRoomList().length,
      timestamp: Date.now(),
    });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({
      rooms: arena.getPublicRoomList(),
    });
  });

  // Serve built static frontend in production
  const distPath = path.resolve(__dirname, '../../dist');
  app.use(express.static(distPath));

  return { app, server, arena };
}

// Run server if executed directly
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isMain) {
  const PORT = Number(process.env.PORT || 3001);
  const { server } = createArenaHttpServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[ARENA STRIKE] Servidor Autoritativo rodando em http://0.0.0.0:${PORT} (WebSocket: /ws)`);
  });
}
