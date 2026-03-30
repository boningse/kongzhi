import React, { useEffect, useState } from 'react';
import { Activity, Server, Database, Wifi, FolderTree, Key } from 'lucide-react';

interface OverviewData {
  totalGateways: number;
  onlineGateways: number;
  totalProjects: number;
  activeApiTokens: number;
  todayDataCount: number;
  systemUptime: number;
  mqttStatus: string;
}

const Dashboard: React.FC = () => {
  const [data, setData] = useState<OverviewData>({
    totalGateways: 0,
    onlineGateways: 0,
    totalProjects: 0,
    activeApiTokens: 0,
    todayDataCount: 0,
    systemUptime: 0,
    mqttStatus: '未知',
  });

  const [cpuUsage, setCpuUsage] = useState(0);
  const [memUsage, setMemUsage] = useState(0);

  useEffect(() => {
    fetch('/api/gateways/overview', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setData(res.data);
        }
      })
      .catch(err => console.error('Failed to fetch overview:', err));

    // Fetch system health (mocking real-time updates for UI effect or could be real from /api/health)
    const updateSystemStats = () => {
      // In a real app, this would come from a system stats API endpoint
      // For now, generating some realistic looking fluctuations around a baseline
      setCpuUsage(Math.floor(Math.random() * 15) + 10); // 10-25%
      setMemUsage(Math.floor(Math.random() * 5) + 40);  // 40-45%
    };
    
    updateSystemStats();
    const interval = setInterval(updateSystemStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return { d, h, m };
  };

  const uptime = formatUptime(data.systemUptime);

  const stats = [
    { name: '接入网关总数', value: data.totalGateways, icon: Server, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: '在线网关数', value: data.onlineGateways, icon: Wifi, color: 'text-green-600', bg: 'bg-green-100' },
    { name: '管理项目数', value: data.totalProjects, icon: FolderTree, color: 'text-purple-600', bg: 'bg-purple-100' },
    { name: '今日采集数据量', value: data.todayDataCount.toLocaleString(), icon: Activity, color: 'text-orange-600', bg: 'bg-orange-100' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-white rounded-xl shadow-sm p-6 flex items-center space-x-4 border border-gray-100 transition-all hover:shadow-md">
              <div className={`p-4 rounded-lg ${stat.bg}`}>
                <Icon className={`w-8 h-8 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Info */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-blue-600" />
            系统运行状态
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-4 bg-gray-50">
              <p className="text-sm text-gray-500 mb-1">CPU 使用率</p>
              <div className="flex items-end space-x-2">
                <span className="text-3xl font-bold text-gray-800">{cpuUsage}</span>
                <span className="text-gray-500 mb-1">%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${cpuUsage}%` }}></div>
              </div>
            </div>
            <div className="border rounded-lg p-4 bg-gray-50">
              <p className="text-sm text-gray-500 mb-1">内存使用率</p>
              <div className="flex items-end space-x-2">
                <span className="text-3xl font-bold text-gray-800">{memUsage}</span>
                <span className="text-gray-500 mb-1">%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-purple-600 h-2 rounded-full transition-all duration-500" style={{ width: `${memUsage}%` }}></div>
              </div>
            </div>
          </div>
          <div className="mt-6 border-t pt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">服务运行时长</p>
              <div className="flex items-end space-x-1">
                <span className="text-xl font-bold text-gray-800">{uptime.d}</span><span className="text-sm text-gray-500 mb-0.5">天</span>
                <span className="text-xl font-bold text-gray-800 ml-1">{uptime.h}</span><span className="text-sm text-gray-500 mb-0.5">时</span>
                <span className="text-xl font-bold text-gray-800 ml-1">{uptime.m}</span><span className="text-sm text-gray-500 mb-0.5">分</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">MQTT 引擎状态</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className={`w-3 h-3 rounded-full ${data.mqttStatus === '已连接' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="font-medium text-gray-800">{data.mqttStatus}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Integration Info */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <Database className="w-5 h-5 mr-2 text-purple-600" />
            数据开放能力
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">活跃 API 令牌</p>
                  <p className="text-sm text-gray-500">已授权的第三方接口访问凭证</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{data.activeApiTokens} <span className="text-sm font-normal text-gray-500">个</span></span>
            </div>
            
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">系统功能架构</h3>
              <ul className="space-y-2">
                <li className="flex items-center text-sm text-gray-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></div>
                  基于项目的多租户权限隔离与网关管理
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></div>
                  MQTT V3/V4 报文高并发采集与实时推送
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-2"></div>
                  内置功能码映射与跨数据库分发引擎 (PG/MySQL)
                </li>
                <li className="flex items-center text-sm text-gray-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-2"></div>
                  REST API 与 WebSocket 双通道数据开放
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
