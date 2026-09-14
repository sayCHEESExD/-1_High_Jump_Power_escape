import { createServer, type Server } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { ROOM_NAME } from '@highjump/shared';

/**
 * A plain HTTP server for Colyseus to attach to.
 *
 * One route: `/health`, which reports the matchmaker's own tally of rooms and
 * players. That is what makes the 15-player cap and the empty-room rule
 * checkable from outside the process (`npm run verify:capacity`).
 */
export const createHttpServer = (): Server =>
  createServer((request, response) => {
    const url = (request.url ?? '').split('?')[0];

    if (url === '/health') {
      void matchMaker
        .query({ name: ROOM_NAME })
        .then((rooms) => {
          const players = rooms.reduce((sum, room) => sum + room.clients, 0);
          response.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          response.end(JSON.stringify({ ok: true, room: ROOM_NAME, rooms: rooms.length, players }));
        })
        .catch(() => {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, room: ROOM_NAME }));
        });
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
  });
