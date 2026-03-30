import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Download, FileJson, ArrowUpDown, ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';

interface TelemetryData {
  id: string;
  gateway_sncode: string;
  device_code: string;
  point_name: string;
  insname?: string;
  propertyno?: string;
  paraname?: string;
  quality: number;
  value: string;
  ts: string;
  project_code?: string;
  project_name?: string;
}

interface RawMqttLog {
  id: string;
  gateway_sncode: string;
  topic: string;
  payload: any;
  received_at: string;
}

const RealtimeData: React.FC = () => {
  const [data, setData] = useState<TelemetryData[]>([]);
  const [rawLogs, setRawLogs] = useState<RawMqttLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'parsed' | 'raw'>('parsed');
  
  // Sort state: 'desc' (default) or 'asc'
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination when view mode or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, searchQuery]);

  const fetchData = () => {
    setLoading(true);
    // Fetch parsed telemetry
    fetch('/api/gateways/telemetry')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setData(res.data);
        }
      })
      .catch(err => console.error('Error fetching telemetry:', err));

    // Fetch raw MQTT logs
    fetch('/api/gateways/raw-logs')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setRawLogs(res.data);
        }
      })
      .catch(err => console.error('Error fetching raw logs:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const toggleSortOrder = () => {
    setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const search = searchQuery.toLowerCase();
      return (
        item.gateway_sncode.toLowerCase().includes(search) ||
        (item.project_code && item.project_code.toLowerCase().includes(search)) ||
        (item.project_name && item.project_name.toLowerCase().includes(search))
      );
    });
  }, [data, searchQuery]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const timeA = new Date(a.ts).getTime();
      const timeB = new Date(b.ts).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [filteredData, sortOrder]);

  const paginatedData = useMemo(() => {
    return sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sortedData, currentPage, pageSize]);

  const filteredRawLogs = useMemo(() => {
    return rawLogs.filter(log => {
      const search = searchQuery.toLowerCase();
      return (log.gateway_sncode || '').toLowerCase().includes(search);
    });
  }, [rawLogs, searchQuery]);

  const sortedRawLogs = useMemo(() => {
    return [...filteredRawLogs].sort((a, b) => {
      const timeA = new Date(a.received_at).getTime();
      const timeB = new Date(b.received_at).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [filteredRawLogs, sortOrder]);

  const paginatedRawLogs = useMemo(() => {
    return sortedRawLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sortedRawLogs, currentPage, pageSize]);

  const totalPages = viewMode === 'parsed' 
    ? Math.ceil(sortedData.length / pageSize) || 1
    : Math.ceil(sortedRawLogs.length / pageSize) || 1;

  const currentTotal = viewMode === 'parsed' ? sortedData.length : sortedRawLogs.length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">实时数据</h2>
        <div className="flex space-x-3">
          <div className="flex bg-gray-100 p-1 rounded-lg mr-4">
            <button
              onClick={() => setViewMode('parsed')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                viewMode === 'parsed' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              解析后数据
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center space-x-1 ${
                viewMode === 'raw' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileJson className="w-4 h-4" />
              <span>原始报文日志</span>
            </button>
          </div>
          
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 网关SN / 项目编号 / 项目名称"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-72 transition-all mr-2"
          />

          <button 
            onClick={fetchData}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>导出数据</span>
          </button>
        </div>
      </div>

      {viewMode === 'parsed' ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={toggleSortOrder}
                >
                  <div className="flex items-center space-x-1">
                    <span>时间</span>
                    {sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">网关SN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">项目编号</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">项目名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">点位名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">实体编号</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">属性列</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数值</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">质量</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    暂无实时数据
                  </td>
                </tr>
              ) : (
                paginatedData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(row.ts).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.gateway_sncode}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {row.project_code ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-xs">{row.project_code}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.project_name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.paraname || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.insname || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.propertyno || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">{row.value}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        row.quality === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {row.quality === 1 ? 'Good' : 'Bad'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={toggleSortOrder}
                >
                  <div className="flex items-center space-x-1">
                    <span>接收时间</span>
                    {sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">网关SN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">MQTT主题</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">原始JSON报文</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedRawLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    暂无原始报文日志
                  </td>
                </tr>
              ) : (
                paginatedRawLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.received_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {log.gateway_sncode || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {log.topic}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <pre className="bg-gray-50 p-3 rounded-lg overflow-x-auto text-xs border border-gray-100 max-h-48 overflow-y-auto">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 bg-white rounded-xl shadow-sm mt-4">
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
              显示第 <span className="font-medium">{currentTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> 到 <span className="font-medium">{Math.min(currentPage * pageSize, currentTotal)}</span> 条结果，共 <span className="font-medium">{currentTotal}</span> 条
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
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
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
    </div>
  );
};

export default RealtimeData;
