import React, { useEffect, useState, useRef } from 'react';
import { Activity, Send, Trash2, Users, Radio } from 'lucide-react';

interface LogMessage {
  id: number;
  time: string;
  type: 'info' | 'error' | 'receive' | 'send';
  content: any;
}

interface WsClient {
  username: string;
  role: string;
}

const WebSocketConfig: React.FC = () => {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [clients, setClients] = useState<WsClient[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const addLog = (type: LogMessage['type'], content: any) => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString(),
      type,
      content
    }].slice(-100)); // Keep last 100 logs
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // When using Vite proxy, we might need to connect to the backend directly if WS proxy isn't setup perfectly
    // But typically we can just connect to the same host/port. If backend is on 3001, we connect to 3001.
    // Let's use the current host but replace the port with 3001 if in development, or just use the same host.
    // Vite proxy handles ws if configured. Assuming vite.config.ts has ws proxy.
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    addLog('info', `Connecting to ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      addLog('info', 'WebSocket connected. Waiting for authentication...');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'auth_required') {
          // Send auth token
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (data.type === 'auth_success') {
          addLog('info', 'Authentication successful.');
        } else if (data.type === 'clients_info') {
          setClients(data.clients);
        } else if (data.type === 'mqtt_message') {
          addLog('receive', `[MQTT] Topic: ${data.topic} | Payload: ${JSON.stringify(data.payload)}`);
        } else if (data.type === 'message') {
          addLog('receive', `[Broadcast from ${data.from}]: ${data.payload}`);
        } else {
          addLog('receive', data);
        }
      } catch (e) {
        addLog('receive', event.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setClients([]);
      addLog('error', 'WebSocket connection closed. Reconnecting in 5s...');
      setTimeout(connect, 5000);
    };

    ws.onerror = (error) => {
      addLog('error', 'WebSocket error occurred.');
    };

    wsRef.current = ws;
  };

  const handleSend = () => {
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const payload = { type: 'broadcast', payload: inputMsg };
    wsRef.current.send(JSON.stringify(payload));
    addLog('send', inputMsg);
    setInputMsg('');
  };

  const clearLogs = () => setLogs([]);

  if (user.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <Activity className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-medium text-gray-700">无权访问</h2>
        <p className="mt-2">只有系统管理员 (ADMIN) 可以访问 WebSocket 管理功能。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <Radio className="w-5 h-5 mr-2 text-blue-600" />
            WebSocket 管理与实时日志
          </h2>
          <p className="text-sm text-gray-500 mt-1">监控实时连接和系统内部消息流</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-gray-700">
              {isConnected ? '已连接' : '已断开'}
            </span>
          </div>
          <button 
            onClick={clearLogs}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span>清空日志</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 space-x-6 min-h-0">
        {/* Left Column: Logs */}
        <div className="flex-1 bg-gray-900 rounded-xl shadow-sm flex flex-col overflow-hidden border border-gray-800">
          <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-2">
            {logs.length === 0 && (
              <div className="text-gray-500 text-center mt-10">暂无日志数据...</div>
            )}
            {logs.map(log => (
              <div key={log.id} className="break-words">
                <span className="text-gray-500">[{log.time}] </span>
                {log.type === 'info' && <span className="text-blue-400">{log.content}</span>}
                {log.type === 'error' && <span className="text-red-400">{log.content}</span>}
                {log.type === 'send' && <span className="text-green-400">发送: {typeof log.content === 'string' ? log.content : JSON.stringify(log.content)}</span>}
                {log.type === 'receive' && <span className="text-gray-300">{typeof log.content === 'string' ? log.content : JSON.stringify(log.content)}</span>}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
          <div className="p-3 bg-gray-800 border-t border-gray-700 flex space-x-2">
            <input
              type="text"
              value={inputMsg}
              onChange={e => setInputMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="输入广播消息..."
              className="flex-1 bg-gray-900 text-gray-200 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={!isConnected}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Active Clients */}
        <div className="w-80 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <Users className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium text-gray-800">在线客户端 ({clients.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {clients.length === 0 ? (
              <div className="text-sm text-gray-500 text-center mt-6">无在线客户端</div>
            ) : (
              <div className="space-y-1">
                {clients.map((client, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-100 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                        {client.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{client.username}</div>
                        <div className="text-xs text-gray-500">{client.role}</div>
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebSocketConfig;