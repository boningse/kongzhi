import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  username?: string;
  role?: string;
  isAlive: boolean;
}

let wss: WebSocketServer | null = null;

export const initWebSocket = (server: Server) => {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle Authentication
        if (data.type === 'auth') {
          const token = data.token;
          try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            ws.userId = decoded.id;
            ws.username = decoded.username;
            ws.role = decoded.role;
            ws.send(JSON.stringify({ type: 'auth_success', message: 'Authenticated successfully' }));
            
            // Broadcast connection update
            broadcastClientsInfo();
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
            ws.close();
          }
          return;
        }

        // Only authenticated users can send other messages
        if (!ws.userId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (data.type === 'broadcast') {
          // Admin can broadcast to everyone
          if (ws.role === 'ADMIN') {
            broadcast({ type: 'message', from: ws.username, payload: data.payload });
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      broadcastClientsInfo();
    });
    
    // Request auth immediately
    ws.send(JSON.stringify({ type: 'auth_required' }));
  });

  // Heartbeat to clean up dead connections
  const interval = setInterval(() => {
    wss?.clients.forEach((client) => {
      const ws = client as AuthenticatedWebSocket;
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
  
  console.log('WebSocket server initialized on path /ws');
};

export const broadcast = (data: any) => {
  if (!wss) return;
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

export const broadcastClientsInfo = () => {
  if (!wss) return;
  const clients: any[] = [];
  wss.clients.forEach((client) => {
    const ws = client as AuthenticatedWebSocket;
    if (ws.userId) {
      clients.push({ username: ws.username, role: ws.role });
    }
  });
  broadcast({ type: 'clients_info', clients });
};

export const getWsServer = () => wss;