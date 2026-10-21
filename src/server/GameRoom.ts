import { WebSocket } from 'ws';
import { GameRoomCore, InternalRoomPlayer, RoomCoreOptions } from '../shared/GameRoomCore';
import { ServerMessage } from '../shared/types';

export type RoomOptions = RoomCoreOptions;

export class GameRoom extends GameRoomCore {
  public addOrReconnectWsPlayer(
    playerId: string,
    nickname: string,
    ws: WebSocket,
    reconnectToken: string
  ): { ok: boolean; error?: string; player?: InternalRoomPlayer } {
    const sendFn = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };
    return this.addOrReconnectPlayer(playerId, nickname, sendFn, reconnectToken);
  }
}
