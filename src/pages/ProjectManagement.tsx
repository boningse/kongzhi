import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, Save, X, ChevronLeft } from 'lucide-react';

interface Project {
  id: string;
  code: string;
  name: string;
  details: string;
  level: number;
  children: Project[];
}

const ProjectManagement: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('全部');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parentProject, setParentProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    details: ''
  });

  const fetchProjects = () => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setProjects(res.data);
        }
      })
      .catch(err => console.error('Error fetching projects:', err));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleAddClick = (parent: Project | null = null) => {
    setParentProject(parent);
    setEditingId(null);
    setFormData({ code: '', name: '', details: '' });
    setIsModalOpen(true);
  };

  const handleEditClick = (project: Project) => {
    setParentProject(null); // Not used during edit
    setEditingId(project.id);
    setFormData({
      code: project.code,
      name: project.name,
      details: project.details
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该项目及其所有子项目吗？')) return;

    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        fetchProjects();
      } else {
        alert(result.error || '删除失败');
      }
    } catch (e) {
      console.error('Error deleting project:', e);
      alert('删除出错');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      // Edit existing
      try {
        const res = await fetch(`/api/projects/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formData.code,
            name: formData.name,
            details: formData.details
          })
        });
        const result = await res.json();
        if (result.success) {
          fetchProjects();
          setIsModalOpen(false);
        } else {
          alert(result.error || '修改失败');
        }
      } catch (e) {
        console.error('Error updating project:', e);
        alert('修改出错');
      }
    } else {
      // Add new
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent_id: parentProject ? parentProject.id : null,
            code: formData.code,
            name: formData.name,
            details: formData.details,
            level: parentProject ? parentProject.level + 1 : 1
          })
        });
        const result = await res.json();
        if (result.success) {
          fetchProjects();
          setIsModalOpen(false);
          // Auto expand parent
          if (parentProject && !expandedIds.has(parentProject.id)) {
            toggleExpand(parentProject.id);
          }
        } else {
          alert(result.error || '添加失败');
        }
      } catch (e) {
        console.error('Error creating project:', e);
        alert('添加出错');
      }
    }
  };

  // Reset pagination when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterLevel]);

  // Recursively filter projects based on search query and level
  const filterProjects = (list: Project[]): Project[] => {
    return list.reduce((acc: Project[], project) => {
      const matchSearch = searchQuery === '' || 
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (project.code && project.code.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchLevel = filterLevel === '全部' || project.level.toString() === filterLevel;

      // Filter children recursively
      const filteredChildren = filterProjects(project.children);

      // Include this project if it matches OR if any of its children match
      if ((matchSearch && matchLevel) || filteredChildren.length > 0) {
        acc.push({
          ...project,
          children: filteredChildren
        });
      }
      
      return acc;
    }, []);
  };

  const filteredProjects = useMemo(() => filterProjects(projects), [projects, searchQuery, filterLevel]);

  // We only paginate the top-level projects to maintain tree structure sanity
  const totalPages = Math.ceil(filteredProjects.length / pageSize) || 1;
  const paginatedProjects = useMemo(() => {
    return filteredProjects.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredProjects, currentPage, pageSize]);

  const renderProjectTree = (list: Project[]) => {
    if (list.length === 0) return null;

    return (
      <div className="space-y-2 mt-2">
        {list.map(project => {
          const isExpanded = expandedIds.has(project.id);
          const hasChildren = project.children.length > 0;
          const canAddChild = project.level < 3;

          return (
            <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              <div 
                className={`flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${isExpanded ? 'border-b border-gray-100' : ''}`}
              >
                <div className="flex items-center space-x-3 flex-1">
                  <button 
                    onClick={() => toggleExpand(project.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                  >
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </button>
                  
                  {isExpanded ? <FolderOpen className="w-5 h-5 text-blue-500" /> : <Folder className="w-5 h-5 text-blue-500" />}
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-gray-900">{project.name}</span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">编号: {project.code || '无'}</span>
                      <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">{project.level}级项目</span>
                    </div>
                    {project.details && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">{project.details}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {canAddChild && (
                    <button
                      onClick={() => handleAddClick(project)}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>添加子项目</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleEditClick(project)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="编辑项目"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="删除项目"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isExpanded && hasChildren && (
                <div className="p-4 pt-2 pl-12 bg-gray-50/50">
                  {renderProjectTree(project.children)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">项目管理</h2>
          <p className="text-sm text-gray-500 mt-1">管理系统中的项目及子项目层级关系，最多支持三级</p>
        </div>
        <div className="flex space-x-4">
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 项目名称 / 编号"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64 transition-all"
          />
          <select 
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-700"
          >
            <option value="全部">全部分级</option>
            <option value="1">一级项目</option>
            <option value="2">二级项目</option>
            <option value="3">三级项目</option>
          </select>
          <button 
            onClick={() => handleAddClick(null)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>添加一级项目</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 flex-1 min-h-[500px]">
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Folder className="w-16 h-16 mb-4 text-gray-200" />
              <p>{projects.length === 0 ? '暂无项目数据，请点击右上角添加' : '没有找到匹配的项目'}</p>
            </div>
          ) : (
            renderProjectTree(paginatedProjects)
          )}
        </div>

        {/* Pagination Controls */}
        {filteredProjects.length > 0 && (
          <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 bg-gray-50">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  显示第 <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> 到 <span className="font-medium">{Math.min(currentPage * pageSize, filteredProjects.length)}</span> 个一级项目，共 <span className="font-medium">{filteredProjects.length}</span> 个
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">每页显示</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 p-1 outline-none border"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span className="text-sm text-gray-700">条</span>
                </div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">上一页</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">下一页</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md transform transition-all">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingId ? '编辑项目' : (parentProject ? `添加子项目 (至: ${parentProject.name})` : '添加一级项目')}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="请输入项目名称"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  项目编号
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value})}
                  placeholder="例如: PRJ-2023-001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  项目基本详情
                </label>
                <textarea
                  value={formData.details}
                  onChange={(e) => setFormData({...formData, details: e.target.value})}
                  placeholder="请输入项目详情描述..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>保存</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManagement;
