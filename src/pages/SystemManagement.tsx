import React, { useEffect, useState } from 'react';
import { User, Shield, Plus, Edit2, Trash2, X, Save } from 'lucide-react';

interface UserData {
  id: number;
  username: string;
  role: string;
  project_ids: number[];
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  level: number;
  children: Project[];
}

const SystemManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'USER', project_ids: [] as number[] });
  
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchUsers();
    fetchProjects();
  }, []);

  const fetchUsers = () => {
    fetch('/api/users')
      .then(res => res.json())
      .then(res => { if (res.success) setUsers(res.data); })
      .catch(console.error);
  };

  const fetchProjects = () => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(res => { if (res.success) setProjects(res.data); })
      .catch(console.error);
  };

  const flattenProjects = (list: Project[], depth = 0): {id: number, name: string, depth: number}[] => {
    let result: {id: number, name: string, depth: number}[] = [];
    list.forEach(p => {
      result.push({ id: parseInt(p.id, 10), name: p.name, depth });
      if (p.children && p.children.length > 0) {
        result = result.concat(flattenProjects(p.children, depth + 1));
      }
    });
    return result;
  };
  const flatProjects = flattenProjects(projects);

  const handleProjectToggle = (projectId: number) => {
    setFormData(prev => ({
      ...prev,
      project_ids: prev.project_ids.includes(projectId)
        ? prev.project_ids.filter(id => id !== projectId)
        : [...prev.project_ids, projectId]
    }));
  };

  const handleAddClick = () => {
    setEditingId(null);
    setFormData({ username: '', password: '', role: 'USER', project_ids: [] });
    setIsModalOpen(true);
  };

  const handleEditClick = (user: UserData) => {
    setEditingId(user.id);
    setFormData({ username: user.username, password: '', role: user.role, project_ids: user.project_ids || [] });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该用户吗？')) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        fetchUsers();
      } else {
        alert(result.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId && !formData.password) return alert('新建用户必须设置密码');
    
    try {
      const url = editingId ? `/api/users/${editingId}` : '/api/users';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      
      if (result.success) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        alert(result.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getProjectNames = (ids: number[]) => {
    if (!ids || ids.length === 0) return '无项目权限';
    return ids.map(id => flatProjects.find(p => p.id === id)?.name || id).join('、');
  };

  if (currentUser.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <Shield className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-medium text-gray-700">无权访问</h2>
        <p className="mt-2">只有系统管理员 (ADMIN) 可以访问用户管理功能。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">系统管理 (用户与权限)</h2>
          <p className="text-sm text-gray-500 mt-1">管理系统用户，并分配对应的项目查看和管理权限</p>
        </div>
        <button 
          onClick={handleAddClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>新建用户</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">授权项目范围</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center space-x-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{user.username}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                    {user.role === 'ADMIN' ? '超级管理员' : '普通用户'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={user.role === 'ADMIN' ? '所有项目 (管理员权限)' : getProjectNames(user.project_ids)}>
                  {user.role === 'ADMIN' ? '所有项目 (管理员默认全局)' : getProjectNames(user.project_ids)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                  <button
                    onClick={() => handleEditClick(user)}
                    className="text-blue-600 hover:text-blue-900 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {user.id !== currentUser.id && (
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">{editingId ? '编辑用户' : '新建用户'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">用户名 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value })}
                      disabled={!!editingId}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">密码 {editingId && <span className="text-gray-400 text-xs">(不修改请留空)</span>}</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">用户角色</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="USER">普通用户 (受限于分配的项目)</option>
                    <option value="ADMIN">超级管理员 (拥有所有权限)</option>
                  </select>
                </div>

                {formData.role === 'USER' && (
                  <div className="pt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      授权管理的项目范围 (仅普通用户需要配置)
                    </label>
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-60 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {flatProjects.map(project => (
                          <label key={project.id} className="flex items-center space-x-3 p-2 bg-white border border-gray-100 hover:border-blue-300 rounded-lg cursor-pointer transition-all">
                            <input 
                              type="checkbox"
                              checked={formData.project_ids.includes(project.id)}
                              onChange={() => handleProjectToggle(project.id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 truncate" title={project.name}>
                              {'　'.repeat(project.depth)}
                              {project.depth > 0 ? '├─ ' : ''}
                              {project.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3 rounded-b-xl">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-sm">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>保存用户</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemManagement;
