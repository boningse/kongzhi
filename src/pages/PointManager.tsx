import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  level: number;
  children: Project[];
}

interface PointItem {
  id: string;
  project_id: number;
  project_name?: string;
  project_code?: string;
  name: string;
  insname?: string;
  propertyno?: string;
  device_code?: string;
  gateway_sncode?: string;
  status: string;
  created_at: string;
}

const PointManager: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [points, setPoints] = useState<PointItem[]>([]);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const reqIdRef = useRef(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [editing, setEditing] = useState<PointItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    insname: '',
    propertyno: '',
    device_code: '',
    gateway_sncode: '',
    status: 'ACTIVE'
  });
  const [formProjectId, setFormProjectId] = useState<string>('');
  const [importProjectId, setImportProjectId] = useState<string>('');
  const [importText, setImportText] = useState<string>('');

  useEffect(() => {
    fetch('/api/projects', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(r => { if (r.success) setProjects(r.data); });
    // 载入上次选择
    const last = localStorage.getItem('pointmgr_selected_project');
    if (last) setSelectedProject(last);
  }, []);

  useEffect(() => {
    if (selectedProject) loadPoints(selectedProject);
    else loadPoints(undefined, currentPage, pageSize);
  }, [selectedProject]);

  useEffect(() => {
    // 当筛选变化时，从第一页加载
    const handler = setTimeout(() => {
      setCurrentPage(1);
      // 有筛选时进行全局搜索（不限定项目）
      loadPoints(undefined, 1, pageSize, filterQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [filterQuery]);

  const flattenProjects = (list: Project[], depth = 0): { id: number, name: string, depth: number }[] => {
    let res: any[] = [];
    list.forEach(p => {
      res.push({ id: parseInt(p.id, 10), name: p.name, depth });
      if (p.children?.length) res = res.concat(flattenProjects(p.children, depth + 1));
    });
    return res;
  };
  const flatProjects = useMemo(() => flattenProjects(projects), [projects]);

  const loadPoints = (pid?: string, page = currentPage, size = pageSize, q = filterQuery) => {
    const reqId = ++reqIdRef.current;
    const params = new URLSearchParams();
    // 有筛选词时，忽略项目限定，直接全局搜索
    const hasQ = !!(q && q.trim());
    if (pid && !hasQ) params.append('project_id', pid);
    params.append('page', String(page));
    params.append('pageSize', String(size));
    if (hasQ) params.append('q', q.trim());
    fetch(`/api/points?${params.toString()}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(r => {
        if (reqId !== reqIdRef.current) return; // 忽略过期响应
        if (r.success) {
          setPoints(r.data);
          if (r.pagination) {
            setTotal(r.pagination.total || 0);
            setCurrentPage(r.pagination.page || 1);
            setPageSize(r.pagination.pageSize || size);
          }
        }
      });
  };

  const selectProject = (pid: string) => {
    setSelectedProject(pid);
    localStorage.setItem('pointmgr_selected_project', pid);
    setCurrentPage(1);
    loadPoints(pid, 1, pageSize);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProjectId) return alert('请选择项目');
    if (!formData.name) return alert('请输入点位名称');
    const body = { ...formData, project_id: parseInt(formProjectId, 10) };
    const url = editing ? `/api/points/${editing.id}` : '/api/points';
    const method = editing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(body)
    });
    const result = await res.json();
    if (result.success) {
      setIsModalOpen(false);
      setEditing(null);
      setFormData({ name: '', insname: '', propertyno: '', device_code: '', gateway_sncode: '', status: 'ACTIVE' });
      // 如果当前页面选择的项目与新增/编辑的项目一致，则刷新；否则切到新增/编辑的项目并刷新
      if (selectedProject === String(body.project_id)) {
        loadPoints(selectedProject);
      } else {
        selectProject(String(body.project_id));
      }
    } else {
      alert(result.error);
    }
  };

  const del = async (id: string) => {
    if (!confirm('确定删除该点位吗？')) return;
    const res = await fetch(`/api/points/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const r = await res.json();
    if (r.success) loadPoints(selectedProject);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">点位管理</h2>
          <p className="text-sm text-gray-500 mt-1">按项目维护自定义点位名称，采集入库时自动匹配更新 point_name</p>
        </div>
        <div className="flex items-center space-x-3">
          <input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="筛选：项目编号/项目名称/点位名称/实体编号/属性号"
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-96"
          />
          <button onClick={() => setIsExportOpen(true)} className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">导出</button>
          <button
            onClick={() => {
              setImportProjectId(selectedProject || '');
              setImportText('project_code,project_name,name,insname,propertyno,device_code,gateway_sncode,status\n');
              setIsImportOpen(true);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
          >
            导入
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setFormData({ name: '', insname: '', propertyno: '', device_code: '', gateway_sncode: '', status: 'ACTIVE' });
              setFormProjectId(selectedProject || '');
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /><span>新增点位</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">项目编号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">项目名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">点位名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">匹配条件</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {points.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                  {filterQuery.trim() ? '未找到匹配点位，请调整筛选条件' : '暂无点位，请点击右上角新增'}
                </td>
              </tr>
            ) : (
              points.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{p.project_code || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{p.project_name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    <span className="font-mono bg-gray-50 border rounded px-2 py-0.5">
                      insname={p.insname || '*'}; propertyno={p.propertyno || '*'}; dev={p.device_code || '*'}; sn={p.gateway_sncode || '*'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setEditing(p);
                        setFormData({
                          name: p.name,
                          insname: p.insname || '',
                          propertyno: p.propertyno || '',
                          device_code: p.device_code || '',
                          gateway_sncode: p.gateway_sncode || '',
                          status: p.status || 'ACTIVE'
                        });
                        setFormProjectId(String(p.project_id));
                        setIsModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3 transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => del(p.id)} className="text-red-600 hover:text-red-900 transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 bg-white rounded-xl shadow-sm px-4 py-3 border border-gray-200">
        <div className="text-sm text-gray-600">
          共 {total} 条，页码 {currentPage} / {Math.max(1, Math.ceil(total / pageSize))}
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={pageSize}
            onChange={(e) => {
              const size = parseInt(e.target.value, 10);
              setPageSize(size);
              setCurrentPage(1);
              loadPoints(selectedProject || undefined, 1, size);
            }}
            className="px-2 py-1 border border-gray-300 rounded"
          >
            {[10, 20, 50, 100].map(s => <option key={s} value={s}>{s} / 页</option>)}
          </select>
          <button
            onClick={() => {
              const page = Math.max(1, currentPage - 1);
              if (page === currentPage) return;
              loadPoints(selectedProject || undefined, page, pageSize);
            }}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
          >
            上一页
          </button>
          <button
            onClick={() => {
              const maxPage = Math.max(1, Math.ceil(total / pageSize));
              const page = Math.min(maxPage, currentPage + 1);
              if (page === currentPage) return;
              loadPoints(selectedProject || undefined, page, pageSize);
            }}
            disabled={currentPage >= Math.max(1, Math.ceil(total / pageSize))}
            className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
          >
            下一页
          </button>
          <button
            onClick={() => loadPoints(selectedProject || undefined, currentPage, pageSize)}
            className="px-3 py-1 border border-gray-300 rounded"
          >
            刷新
          </button>
        </div>
      </div>

      {/* Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">批量导入点位</h3>
              <button onClick={() => setIsImportOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">导入到项目 <span className="text-red-500">*</span></label>
                  <select
                    value={importProjectId}
                    onChange={(e) => setImportProjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">— 请选择项目 —</option>
                    {flatProjects.map(p => (
                      <option key={`imp-${p.id}`} value={p.id}>{'\u00A0'.repeat(p.depth * 2)}{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-gray-500 self-end">
                  支持 CSV 文本（第一行标题）：project_code,project_name,name,insname,propertyno,device_code,gateway_sncode,status。<br />
                  重复导入时以【项目+insname】作为主键进行更新；此处必须选择项目。
                </div>
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full h-56 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder="在此粘贴 CSV 文本或手动输入"
              />
              <div className="flex justify-end space-x-3">
                <button onClick={() => setIsImportOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">取消</button>
                <button
                  onClick={async () => {
                    const lines = importText.split(/\r?\n/).filter(l => l.trim().length > 0);
                    if (lines.length <= 1) return alert('请粘贴包含表头与数据的 CSV 文本');
                    const header = lines[0].split(',').map(h => h.trim());
                    const idx = (k: string) => header.indexOf(k);
                    const rows = lines.slice(1).map(l => {
                      const cols = l.split(','); // 简易解析：请避免字段内包含逗号
                      return {
                        project_code: cols[idx('project_code')] || '',
                        project_name: cols[idx('project_name')] || '',
                        name: cols[idx('name')] || '',
                        insname: cols[idx('insname')] || '',
                        propertyno: cols[idx('propertyno')] || '',
                        device_code: cols[idx('device_code')] || '',
                        gateway_sncode: cols[idx('gateway_sncode')] || '',
                        status: cols[idx('status')] || 'ACTIVE',
                      };
                    }).filter(r => r.name);
                    if (rows.length === 0) return alert('未解析到有效数据行');
                    if (!importProjectId) return alert('请先选择导入到的项目');
                    const res = await fetch('/api/points/bulk', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                      },
                      body: JSON.stringify({
                        project_id: parseInt(importProjectId, 10),
                        rows
                      })
                    });
                    const r = await res.json();
                    if (r.success) {
                      alert(`导入完成：成功 ${r.data.success} 条，失败 ${r.data.failed} 条`);
                      setIsImportOpen(false);
                      // 刷新列表
                      loadPoints(selectedProject || undefined, currentPage, pageSize, filterQuery);
                    } else {
                      alert(r.error || '导入失败');
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  开始导入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isExportOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">按项目导出点位</h3>
              <button onClick={() => setIsExportOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择项目 <span className="text-red-500">*</span></label>
                <select
                  value={selectedProject}
                  onChange={(e) => selectProject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">— 请选择项目 —</option>
                  {flatProjects.map(p => (
                    <option key={`exp-${p.id}`} value={p.id}>{'\u00A0'.repeat(p.depth * 2)}{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setIsExportOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">取消</button>
                <button
                  onClick={async () => {
                    if (!selectedProject) return alert('请选择要导出的项目');
                    const params = new URLSearchParams();
                    params.append('project_id', selectedProject);
                    const res = await fetch(`/api/points/export?${params.toString()}`, {
                      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                    });
                    if (!res.ok) {
                      const r = await res.json().catch(() => ({}));
                      return alert(r.error || '导出失败');
                    }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'points.csv';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    setIsExportOpen(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  导出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">{editing ? '编辑点位' : '新增点位'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择项目 <span className="text-red-500">*</span></label>
                <select
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                >
                  <option value="">— 请选择项目 —</option>
                  {flatProjects.map(p => (
                    <option key={`modal-${p.id}`} value={p.id}>{'\u00A0'.repeat(p.depth * 2)}{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">点位名称 <span className="text-red-500">*</span></label>
                <input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="例如：进水温度、出水压力"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">insname</label>
                  <input value={formData.insname} onChange={e => setFormData({ ...formData, insname: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">propertyno</label>
                  <input value={formData.propertyno} onChange={e => setFormData({ ...formData, propertyno: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">设备编码 device_code</label>
                  <input value={formData.device_code} onChange={e => setFormData({ ...formData, device_code: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">网关 SN</label>
                  <input value={formData.gateway_sncode} onChange={e => setFormData({ ...formData, gateway_sncode: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PointManager;
