import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Activity, Database, Users, FolderTree, LogOut, Radio, Send, Settings2 } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const navigation = [
    { name: '信息总览', href: '/', icon: LayoutDashboard },
    { name: '项目管理', href: '/projects', icon: FolderTree },
    { name: '设备配置', href: '/devices', icon: Settings },
    { name: '数据采集', href: '/realtime', icon: Activity },
    { name: '设备属性', href: '/device-types', icon: Settings2 },
    { name: '数据分发', href: '/data-distribution', icon: Send },
    ...(currentUser.role === 'ADMIN' ? [{ name: '接口管理', href: '/api-config', icon: Database }] : []),
    ...(currentUser.role === 'ADMIN' ? [{ name: '系统管理', href: '/system', icon: Users }] : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-blue-900 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 text-xl font-bold border-b border-blue-800">
          BN网关管理系统
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-800 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white shadow-sm flex items-center px-8 justify-between">
          <h1 className="text-xl font-semibold text-gray-800">
            {navigation.find(n => n.href === location.pathname)?.name || '系统'}
          </h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">{currentUser.username} ({currentUser.role === 'ADMIN' ? '管理员' : '用户'})</span>
            <button 
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-600 transition-colors"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
