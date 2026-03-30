import React, { useEffect, useState } from 'react';
import { Key, Plus, Copy, Trash2, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';

interface ApiToken {
  id: string;
  name: string;
  token: string;
  project_ids: number[];
  status: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  level: number;
  children: Project[];
}

const ApiConfig: React.FC = () => {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', project_ids: [] as number[] });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchTokens();
    fetchProjects();
  }, []);

  const fetchTokens = () => {
    fetch('/api/tokens')
      .then(res => res.json())
      .then(res => { if (res.success) setTokens(res.data); })
      .catch(console.error);
  };

  const fetchProjects = () => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(res => { if (res.success) setProjects(res.data); })
      .catch(console.error);
  };

  const flattenProjects = (list: Project[], depth = 0): {id: number, name: string, depth: number, level: number}[] => {
    let result: {id: number, name: string, depth: number, level: number}[] = [];
    list.forEach(p => {
      result.push({ id: parseInt(p.id, 10), name: p.name, depth, level: p.level });
      if (p.children && p.children.length > 0) {
        result = result.concat(flattenProjects(p.children, depth + 1));
      }
    });
    return result;
  };
  const flatProjects = flattenProjects(projects);
  // 只获取一级项目用于表单选择
  const rootProjects = flatProjects.filter(p => p.level === 1);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return alert('请输入接口名称');
    
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      if (result.success) {
        setIsModalOpen(false);
        setFormData({ name: '', project_ids: [] });
        fetchTokens();
      } else {
        alert(result.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该接口令牌吗？删除后正在使用该令牌的应用将无法获取数据。')) return;
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) fetchTokens();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = (token: string, id: string) => {
    navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleProjectToggle = (projectId: number) => {
    setFormData(prev => ({
      ...prev,
      project_ids: prev.project_ids.includes(projectId)
        ? prev.project_ids.filter(id => id !== projectId)
        : [...prev.project_ids, projectId]
    }));
  };

  const getProjectNames = (ids: number[]) => {
    if (!ids || ids.length === 0) return '所有项目 (全局权限)';
    return ids.map(id => flatProjects.find(p => p.id === id)?.name || id).join('、');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">接口管理 (数据共享 API)</h2>
          <p className="text-sm text-gray-500 mt-1">生成访问令牌，配置项目权限，以便第三方系统通过 API 读取实时遥测数据</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => setIsGuideOpen(true)}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
          >
            <BookOpen className="w-4 h-4" />
            <span>使用说明</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>新建令牌</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">接口名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">访问令牌 (Token)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">权限范围</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>暂无 API 令牌，请点击右上角新建</p>
                </td>
              </tr>
            ) : (
              tokens.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{token.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    <div className="flex items-center space-x-2">
                      <span>{token.token.substring(0, 8)}...{token.token.substring(token.token.length - 8)}</span>
                      <button 
                        onClick={() => handleCopy(token.token, token.id)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="复制完整 Token"
                      >
                        {copiedId === token.id ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={getProjectNames(token.project_ids)}>
                    {getProjectNames(token.project_ids)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {token.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(token.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleDelete(token.id)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Guide Modal */}
      {isGuideOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <BookOpen className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <h3 className="text-xl font-semibold text-gray-800">第三方系统接口调用指南</h3>
              </div>
              <button 
                onClick={() => setIsGuideOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="text-sm text-gray-700 space-y-6 leading-relaxed">
                <p className="text-base text-gray-600">
                  本系统提供标准的 RESTful API 供第三方系统直接调用和集成。当您创建一个访问令牌（Token）后，即可通过该令牌获取授权范围内的网关遥测数据。
                </p>

                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center"><span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm mr-2">1</span>接口基础信息</h4>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-2">
                    <p><strong>请求路径:</strong> <code className="bg-white border border-gray-200 px-2 py-1 rounded text-pink-600 font-mono">GET /api/shared/telemetry</code></p>
                    <p><strong>请求方式:</strong> <code className="bg-white border border-gray-200 px-2 py-1 rounded text-blue-600 font-mono">GET</code></p>
                    <p><strong>鉴权方式:</strong> 在 HTTP Header 中添加 <code className="bg-white border border-gray-200 px-2 py-1 rounded font-mono">Authorization: Bearer &lt;您的Token&gt;</code></p>
                  </div>
                </div>

                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center"><span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm mr-2">2</span>数据查询说明（含跨月说明）</h4>
                  <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
                    <p className="mb-2">
                      系统底层采用<strong>按月动态分表</strong>存储机制以应对海量数据。但在调用此接口时，第三方系统<strong>完全不需要关心分表逻辑</strong>。
                    </p>
                    <p>
                      该接口会自动执行跨表聚合查询，返回授权项目中最新的遥测数据。默认按时间倒序（最新的在前）返回。
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center"><span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm mr-2">3</span>调用代码示例 (cURL)</h4>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    curl -X GET http://&lt;服务器IP&gt;:&lt;端口&gt;/api/shared/telemetry \<br/>
                    &nbsp;&nbsp;-H "Authorization: Bearer YOUR_GENERATED_TOKEN_HERE" \<br/>
                    &nbsp;&nbsp;-H "Accept: application/json"
                  </div>
                </div>

                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center"><span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm mr-2">4</span>响应数据结构示例</h4>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre">
{`{
  "success": true,
  "data": [
    {
      "id": "10023",
      "gateway_sncode": "1211692AF4224BF6",
      "device_code": "",
      "point_name": "",
      "insname": "3702152601",
      "propertyno": "231",
      "paraname": "",
      "quality": 0,
      "value": "24.5",
      "ts": "2024-08-15T08:30:00.000Z",
      "project_code": "PRJ-001",
      "project_name": "山东伯宁项目"
    }
  ]
}`}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end rounded-b-xl">
              <button 
                onClick={() => setIsGuideOpen(false)}
                className="px-6 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium shadow-sm transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">新建 API 令牌</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <AlertCircle className="w-6 h-6 opacity-0 hidden" /> {/* spacer */}
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    接口用途名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如: 大屏展示系统接入"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
                    required
                  />
                </div>

                <div className="flex-1 flex flex-col">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    授权访问的一级项目 (可多选，不选则为全局权限，选择后自动包含其下所有子项目)
                  </label>
                  <div className="flex-1 border border-gray-200 rounded-lg p-4 bg-gray-50 overflow-y-auto min-h-[300px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {rootProjects.map(project => (
                        <label key={project.id} className="flex items-center space-x-3 p-2.5 bg-white border border-gray-100 hover:border-blue-300 hover:shadow-sm rounded-lg cursor-pointer transition-all">
                          <input 
                            type="checkbox"
                            checked={formData.project_ids.includes(project.id)}
                            onChange={() => handleProjectToggle(project.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 font-medium truncate" title={project.name}>
                            {project.name}
                          </span>
                        </label>
                      ))}
                      {rootProjects.length === 0 && (
                        <div className="col-span-full text-center text-gray-400 py-8">
                          暂无可选的一级项目，请先在“项目管理”中添加
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-4 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-sm transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                >
                  生成令牌
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiConfig;
