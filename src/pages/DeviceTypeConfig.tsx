import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, List, ArrowLeft, Settings2 } from 'lucide-react';

interface DeviceType {
  id: string;
  name: string;
  code: string;
  description: string;
  function_count: string;
  created_at: string;
}

interface DeviceTypeFunction {
  id: string;
  device_type_id: number;
  function_code: string;
  function_name: string;
  data_type: string;
  unit: string;
  description: string;
  created_at: string;
}

const DeviceTypeConfig: React.FC = () => {
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<DeviceType | null>(null);
  const [typeFormData, setTypeFormData] = useState({ name: '', code: '', description: '' });

  // For sub-view: managing functions
  const [activeType, setActiveType] = useState<DeviceType | null>(null);
  const [functions, setFunctions] = useState<DeviceTypeFunction[]>([]);
  const [isFuncModalOpen, setIsFuncModalOpen] = useState(false);
  const [editingFunc, setEditingFunc] = useState<DeviceTypeFunction | null>(null);
  const [funcFormData, setFuncFormData] = useState({ function_code: '', function_name: '', data_type: '', unit: '', description: '' });

  useEffect(() => {
    fetchDeviceTypes();
  }, []);

  const fetchDeviceTypes = () => {
    fetch('/api/device-types', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(res => { if (res.success) setDeviceTypes(res.data); })
      .catch(console.error);
  };

  const fetchFunctions = (typeId: string) => {
    fetch(`/api/device-types/${typeId}/functions`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(res => { if (res.success) setFunctions(res.data); })
      .catch(console.error);
  };

  const handleTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingType ? `/api/device-types/${editingType.id}` : '/api/device-types';
      const method = editingType ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(typeFormData)
      });
      const result = await res.json();
      if (result.success) {
        setIsTypeModalOpen(false);
        fetchDeviceTypes();
      } else {
        alert(result.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTypeDelete = async (id: string) => {
    if (!confirm('确定要删除该设备类型吗？这将同时删除其下所有的功能码定义！')) return;
    try {
      const res = await fetch(`/api/device-types/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const result = await res.json();
      if (result.success) fetchDeviceTypes();
    } catch (e) {
      console.error(e);
    }
  };

  const handleFuncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeType) return;
    try {
      const url = editingFunc 
        ? `/api/device-types/${activeType.id}/functions/${editingFunc.id}` 
        : `/api/device-types/${activeType.id}/functions`;
      const method = editingFunc ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(funcFormData)
      });
      const result = await res.json();
      if (result.success) {
        setIsFuncModalOpen(false);
        fetchFunctions(activeType.id);
        fetchDeviceTypes(); // update function count
      } else {
        alert(result.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFuncDelete = async (funcId: string) => {
    if (!activeType || !confirm('确定要删除该功能码吗？')) return;
    try {
      const res = await fetch(`/api/device-types/${activeType.id}/functions/${funcId}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const result = await res.json();
      if (result.success) {
        fetchFunctions(activeType.id);
        fetchDeviceTypes(); // update count
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (activeType) {
    // Functions View
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setActiveType(null)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">功能码管理: {activeType.name}</h2>
              <p className="text-sm text-gray-500 mt-1">管理该设备类型（{activeType.code}）下的所有功能码</p>
            </div>
          </div>
          <button 
            onClick={() => {
              setEditingFunc(null);
              setFuncFormData({ function_code: '', function_name: '', data_type: '', unit: '', description: '' });
              setIsFuncModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>新增功能码</span>
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">功能码</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">功能名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数据类型</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">单位</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {functions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p>暂无功能码数据，请点击右上角新增</p>
                  </td>
                </tr>
              ) : (
                functions.map((func) => (
                  <tr key={func.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{func.function_code}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{func.function_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{func.data_type || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{func.unit || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{func.description || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setEditingFunc(func);
                          setFuncFormData({
                            function_code: func.function_code,
                            function_name: func.function_name,
                            data_type: func.data_type || '',
                            unit: func.unit || '',
                            description: func.description || ''
                          });
                          setIsFuncModalOpen(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3 transition-colors"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleFuncDelete(func.id)}
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

        {isFuncModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-800">{editingFunc ? '编辑功能码' : '新增功能码'}</h3>
                <button onClick={() => setIsFuncModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <span className="text-2xl leading-none">&times;</span>
                </button>
              </div>
              <form onSubmit={handleFuncSubmit}>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">功能码 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={funcFormData.function_code}
                      onChange={e => setFuncFormData({ ...funcFormData, function_code: e.target.value })}
                      placeholder="如: TEMP"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">功能名称 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={funcFormData.function_name}
                      onChange={e => setFuncFormData({ ...funcFormData, function_name: e.target.value })}
                      placeholder="如: 温度"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">数据类型</label>
                      <input
                        type="text"
                        value={funcFormData.data_type}
                        onChange={e => setFuncFormData({ ...funcFormData, data_type: e.target.value })}
                        placeholder="如: Float"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">单位</label>
                      <input
                        type="text"
                        value={funcFormData.unit}
                        onChange={e => setFuncFormData({ ...funcFormData, unit: e.target.value })}
                        placeholder="如: ℃"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                    <textarea
                      value={funcFormData.description}
                      onChange={e => setFuncFormData({ ...funcFormData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-20"
                    />
                  </div>
                </div>
                <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-4 rounded-b-xl">
                  <button type="button" onClick={() => setIsFuncModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">
                    取消
                  </button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                    保存
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Device Types View
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">设备属性</h2>
          <p className="text-sm text-gray-500 mt-1">管理设备类型及每个类型下的功能码属性</p>
        </div>
        <button 
          onClick={() => {
            setEditingType(null);
            setTypeFormData({ name: '', code: '', description: '' });
            setIsTypeModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>新增设备类型</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型编码</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">功能码数量</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {deviceTypes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <Settings2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>暂无设备类型数据，请点击右上角新增</p>
                </td>
              </tr>
            ) : (
              deviceTypes.map((type) => (
                <tr key={type.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{type.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{type.code}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {type.function_count} 个功能
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-[200px]">{type.description || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(type.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setActiveType(type);
                        fetchFunctions(type.id);
                      }}
                      className="text-green-600 hover:text-green-900 mr-3 transition-colors font-medium"
                      title="管理功能码"
                    >
                      <List className="w-5 h-5 inline mr-1" /> 管理功能码
                    </button>
                    <button
                      onClick={() => {
                        setEditingType(type);
                        setTypeFormData({ name: type.name, code: type.code, description: type.description || '' });
                        setIsTypeModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3 transition-colors"
                      title="编辑"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleTypeDelete(type.id)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                      title="删除"
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

      {isTypeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">{editingType ? '编辑设备类型' : '新增设备类型'}</h3>
              <button onClick={() => setIsTypeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <form onSubmit={handleTypeSubmit}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">类型名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={typeFormData.name}
                    onChange={e => setTypeFormData({ ...typeFormData, name: e.target.value })}
                    placeholder="如: 温湿度传感器"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">类型编码 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={typeFormData.code}
                    onChange={e => setTypeFormData({ ...typeFormData, code: e.target.value })}
                    placeholder="如: SENSOR_TH"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    value={typeFormData.description}
                    onChange={e => setTypeFormData({ ...typeFormData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-20"
                  />
                </div>
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-4 rounded-b-xl">
                <button type="button" onClick={() => setIsTypeModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceTypeConfig;
