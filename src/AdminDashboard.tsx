
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { UserDataSummary, Fertilizer, LogEntry } from './types';
import { LogoutIcon, DashboardIcon, UsersIcon, PlusIcon, TrashIcon, CloseIcon, ClipboardListIcon, CameraIcon, DocumentSearchIcon, UploadIcon, SparklesIcon, DownloadIcon, CalendarIcon } from './icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FERTILIZER_TYPE_GROUPS } from './constants';

interface AdminDashboardProps {
    user: string;
    onLogout: () => void;
}

// --- Helper for Excel Export ---
const exportUserLogsToExcel = (userData: UserDataSummary) => {
    if (!userData.logs || userData.logs.length === 0) {
        alert(`${userData.username}님의 기록된 데이터가 없습니다.`);
        return;
    }

    const dataToExport = userData.logs.map(log => {
        const row: any = {
            '날짜': log.date,
            '사용자': userData.username,
            '골프장': userData.golfCourse,
            '제품명': log.product,
            '구분': log.usage,
            '면적(㎡)': log.area,
            '사용량': `${log.applicationRate}${log.applicationUnit}`,
            '총 비용(원)': Math.round(log.totalCost),
        };
        
        // Add nutrients
        const NUTRIENTS = ['N','P','K','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo','Cl','Na','Si','Ni','Co','V'];
        NUTRIENTS.forEach(n => {
            if (log.nutrients && log.nutrients[n] > 0) {
                row[`${n} (g)`] = log.nutrients[n];
            }
        });
        
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '시비 일지');
    
    // Auto-width for columns (simple estimation)
    const wscols = Object.keys(dataToExport[0]).map(k => ({ wch: Math.max(k.length * 2, 10) }));
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `${userData.username}_${userData.golfCourse}_시비일지.xlsx`);
};

// --- User Detail Modal for Analytics ---
interface UserDetailModalProps {
    userData: UserDataSummary;
    onClose: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const UserDetailModal: React.FC<UserDetailModalProps> = ({ userData, onClose }) => {
    // Determine available years from logs
    const availableYears = useMemo(() => {
        const years = new Set(userData.logs.map(l => l.date.split('-')[0]));
        return Array.from(years).sort().reverse();
    }, [userData.logs]);

    const [selectedYear, setSelectedYear] = useState<string>(
        availableYears.length > 0 ? availableYears[0] : new Date().getFullYear().toString()
    );
    const [statsView, setStatsView] = useState<'monthly' | 'daily' | 'yearly'>('monthly');
    const [chartMetric, setChartMetric] = useState<'cost' | 'count'>('cost'); // 'cost' or 'count'

    // Filter logs based on selected year (or all)
    const filteredLogs = useMemo(() => {
        if (selectedYear === 'all') return userData.logs;
        return userData.logs.filter(l => l.date.startsWith(selectedYear));
    }, [userData.logs, selectedYear]);

    // Automatically switch chart view based on selection
    useEffect(() => {
        if (selectedYear === 'all') setStatsView('yearly');
        else setStatsView('monthly');
    }, [selectedYear]);

    // 1. Calculate Product Statistics (Filtered by Year)
    const productStats = useMemo(() => {
        const stats: Record<string, { count: number, totalCost: number, totalAmount: number, unitHint: string, name: string, usage: string }> = {};
        filteredLogs.forEach(log => {
            if (!stats[log.product]) {
                stats[log.product] = { count: 0, totalCost: 0, totalAmount: 0, unitHint: '', name: log.product, usage: log.usage };
            }
            stats[log.product].count += 1;
            stats[log.product].totalCost += log.totalCost;
            
            // Estimate amount (kg or L) based on area * rate / 1000
            const amount = (log.area * log.applicationRate) / 1000;
            stats[log.product].totalAmount += amount;
            
            if (!stats[log.product].unitHint) {
                stats[log.product].unitHint = log.applicationUnit.includes('ml') ? 'L' : 'kg';
            }
        });
        return Object.values(stats).sort((a, b) => b.totalCost - a.totalCost);
    }, [filteredLogs]);

    const mostFrequentProduct = useMemo(() => {
        if (productStats.length === 0) return null;
        return [...productStats].sort((a, b) => b.count - a.count)[0];
    }, [productStats]);

    const chartDataProductCost = useMemo(() => {
        return productStats.slice(0, 5).map(p => ({ name: p.name, value: p.totalCost }));
    }, [productStats]);

    // 2. Calculate Time-based Statistics (Filtered by Year)
    const timeStats = useMemo(() => {
        const monthly: Record<string, { cost: number, count: number }> = {};
        const yearly: Record<string, { cost: number, count: number }> = {};
        const daily: Record<string, { cost: number, count: number }> = {};

        filteredLogs.forEach(log => {
            const date = new Date(log.date);
            const y = date.getFullYear().toString();
            const m = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const d = log.date; // YYYY-MM-DD

            if (!yearly[y]) yearly[y] = { cost: 0, count: 0 };
            yearly[y].cost += log.totalCost;
            yearly[y].count += 1;

            if (!monthly[m]) monthly[m] = { cost: 0, count: 0 };
            monthly[m].cost += log.totalCost;
            monthly[m].count += 1;

            if (!daily[d]) daily[d] = { cost: 0, count: 0 };
            daily[d].cost += log.totalCost;
            daily[d].count += 1;
        });

        const monthlyArr = Object.entries(monthly).map(([k, v]) => ({ period: k, cost: v.cost, count: v.count })).sort((a, b) => a.period.localeCompare(b.period));
        const yearlyArr = Object.entries(yearly).map(([k, v]) => ({ period: k, cost: v.cost, count: v.count })).sort((a, b) => a.period.localeCompare(b.period));
        const dailyArr = Object.entries(daily).map(([k, v]) => ({ period: k, cost: v.cost, count: v.count })).sort((a, b) => a.period.localeCompare(b.period));

        return { monthly: monthlyArr, yearly: yearlyArr, daily: dailyArr };
    }, [filteredLogs]);

    const formatXAxis = (tickItem: string) => {
        if (statsView === 'monthly') return tickItem.slice(5); 
        if (statsView === 'daily') return tickItem.slice(5);
        return tickItem;
    };

    // Calculate Totals for Summary Cards
    const currentTotalCost = filteredLogs.reduce((acc, log) => acc + log.totalCost, 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">사용자 상세 분석</span>
                            {userData.username} ({userData.golfCourse})
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">
                            {selectedYear === 'all' ? '전체 기간' : `${selectedYear}년`} 데이터 분석 | 총 기록: {filteredLogs.length}건
                        </p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 mr-2 shadow-sm"
                        >
                            {availableYears.map(year => <option key={year} value={year}>{year}년</option>)}
                            <option value="all">전체 기간</option>
                        </select>
                        <button 
                            onClick={() => exportUserLogsToExcel(userData)}
                            className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded shadow transition-colors"
                        >
                            <DownloadIcon className="w-4 h-4" /> 엑셀 저장
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><CloseIcon /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h4 className="text-blue-800 text-xs font-bold uppercase mb-1">{selectedYear === 'all' ? '총 누적 비용' : `${selectedYear}년 총 비용`}</h4>
                            <p className="text-2xl font-bold text-blue-900">{Math.round(currentTotalCost).toLocaleString()}원</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                            <h4 className="text-green-800 text-xs font-bold uppercase mb-1">최다 사용 (빈도)</h4>
                            <p className="text-lg font-bold text-green-900 truncate" title={mostFrequentProduct?.name}>{mostFrequentProduct ? mostFrequentProduct.name : '-'}</p>
                            <p className="text-xs text-green-700">{mostFrequentProduct ? `${mostFrequentProduct.count}회 사용` : ''}</p>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                            <h4 className="text-orange-800 text-xs font-bold uppercase mb-1">최고 지출 비료</h4>
                            <p className="text-lg font-bold text-orange-900 truncate" title={productStats[0]?.name}>{productStats[0] ? productStats[0].name : '-'}</p>
                            <p className="text-xs text-orange-700">{productStats[0] ? `${Math.round(productStats[0].totalCost).toLocaleString()}원` : ''}</p>
                        </div>
                         <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                            <h4 className="text-purple-800 text-xs font-bold uppercase mb-1">사용 제품 수</h4>
                            <p className="text-2xl font-bold text-purple-900">{productStats.length}종</p>
                        </div>
                    </div>

                    {/* Annual Usage Table Section */}
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-slate-500" /> 
                                {selectedYear === 'all' ? '전체 기간' : `${selectedYear}년`} 비료 총 사용량 및 생육 패턴 분석
                            </h3>
                            <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded border">생육 패턴 파악용</span>
                        </div>
                        <div className="p-4 bg-blue-50/50 border-b border-blue-100 text-xs text-blue-800">
                            * 본 섹션은 선택된 기간({selectedYear === 'all' ? '전체' : `${selectedYear}년`}) 동안 투입된 비료의 <strong>총 물량(kg/L)</strong>을 집계하여, 골프장의 자재 투입 강도와 패턴을 파악하는 데 도움을 줍니다.
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 pl-4">제품명</th>
                                        <th className="p-3 text-center">구분</th>
                                        <th className="p-3 text-right">사용 횟수</th>
                                        <th className="p-3 text-right">총 투입 물량 (kg/L)</th>
                                        <th className="p-3 text-right pr-4">총 비용</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {productStats.length > 0 ? (
                                        productStats.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 pl-4 font-medium text-slate-700">{item.name}</td>
                                                <td className="p-3 text-center">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                                        item.usage === '그린' ? 'bg-green-100 text-green-800' :
                                                        item.usage === '티' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                                                    }`}>
                                                        {item.usage}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right text-slate-600">{item.count}회</td>
                                                <td className="p-3 text-right font-bold text-slate-800 bg-slate-50/50">
                                                    {item.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}
                                                    <span className="text-xs font-normal text-slate-500 ml-1">{item.unitHint}</span>
                                                </td>
                                                <td className="p-3 text-right pr-4 font-mono text-slate-600">
                                                    {Math.round(item.totalCost).toLocaleString()}원
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5} className="p-8 text-center text-slate-400">해당 기간의 데이터가 없습니다.</td></tr>
                                    )}
                                </tbody>
                                {productStats.length > 0 && (
                                    <tfoot className="bg-slate-50 font-bold text-slate-700 border-t-2 border-slate-200">
                                        <tr>
                                            <td colSpan={2} className="p-3 pl-4 text-right">합계</td>
                                            <td className="p-3 text-right">{productStats.reduce((a,b)=>a+b.count,0)}회</td>
                                            <td className="p-3 text-center text-xs text-slate-400 font-normal">(단위 혼합)</td>
                                            <td className="p-3 text-right pr-4 text-blue-700">{Math.round(currentTotalCost).toLocaleString()}원</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Cost/Count Chart */}
                        <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col">
                            <div className="flex flex-col gap-3 mb-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700">📊 기간별 활동 추이</h3>
                                    <div className="flex bg-slate-100 rounded p-1">
                                        {(['daily', 'monthly', 'yearly'] as const).map(view => (
                                            <button
                                                key={view}
                                                onClick={() => setStatsView(view)}
                                                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${statsView === view ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                {view === 'daily' ? '일별' : view === 'monthly' ? '월별' : '연간'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex bg-slate-100 rounded p-1 self-start">
                                    <button 
                                        onClick={() => setChartMetric('cost')}
                                        className={`px-3 py-1 text-xs font-bold rounded transition-colors ${chartMetric === 'cost' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        비용 (원)
                                    </button>
                                    <button 
                                        onClick={() => setChartMetric('count')}
                                        className={`px-3 py-1 text-xs font-bold rounded transition-colors ${chartMetric === 'count' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        사용 횟수 (건)
                                    </button>
                                </div>
                            </div>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timeStats[statsView]}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="period" fontSize={12} tickFormatter={formatXAxis} />
                                        <YAxis fontSize={12} />
                                        <Tooltip 
                                            formatter={(val: number) => chartMetric === 'cost' ? `${Math.round(val).toLocaleString()}원` : `${val}회`} 
                                            labelFormatter={(label) => label}
                                        />
                                        <Bar 
                                            dataKey={chartMetric} 
                                            name={chartMetric === 'cost' ? "비용" : "사용 횟수"} 
                                            fill={chartMetric === 'cost' ? "#3b82f6" : "#22c55e"} 
                                            radius={[4, 4, 0, 0]} 
                                            maxBarSize={50} 
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Product Cost Distribution */}
                        <div className="bg-white p-4 rounded-lg border shadow-sm">
                            <h3 className="font-bold text-slate-700 mb-4">🍰 제품별 비용 점유율 (Top 5)</h3>
                            <div className="h-64 flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartDataProductCost}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={40}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartDataProductCost.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(val: number) => `${Math.round(val).toLocaleString()}원`} />
                                        <Legend wrapperStyle={{fontSize: '11px'}} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    const [allUsersData, setAllUsersData] = useState<UserDataSummary[]>([]);
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Pending Approvals State
    const [selectedPendingUsers, setSelectedPendingUsers] = useState<Set<string>>(new Set());
    
    const [activeTab, setActiveTab] = useState<'users' | 'fertilizers'>('users');
    
    // User Detail Modal State
    const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserDataSummary | null>(null);
    
    // New Fertilizer Form State
    const [isAddFertilizerModalOpen, setIsAddFertilizerModalOpen] = useState(false);
    const [newFertilizer, setNewFertilizer] = useState<Partial<Fertilizer>>({
        type: '완효성',
        usage: '그린'
    });

    // Sorting and Filtering State for Approved Users
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [userSortField, setUserSortField] = useState<keyof UserDataSummary>('lastActivity');
    const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');
    
    // AI Smart Input State
    const [aiInputText, setAiInputText] = useState('');
    const [isAiFillLoading, setIsAiFillLoading] = useState(false);
    const [aiSmartTab, setAiSmartTab] = useState<'text' | 'file'>('text');
    const [aiError, setAiError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersData, fertilizers] = await Promise.all([
                api.getAllUsersData(),
                api.getFertilizers('admin')
            ]);
            setAllUsersData(usersData);
            setMasterFertilizers(fertilizers);
        } catch (error) {
            console.error("Failed to load admin data", error);
        } finally {
            setIsLoading(false);
        }
    };

    const pendingUsersList = useMemo(() => allUsersData.filter(u => !u.isApproved), [allUsersData]);
    const approvedUsersList = useMemo(() => allUsersData.filter(u => u.isApproved), [allUsersData]);

    const processedUsers = useMemo(() => {
        let data = [...approvedUsersList];
        if (userSearchTerm) {
            const lowerTerm = userSearchTerm.toLowerCase();
            data = data.filter(u => 
                u.username.toLowerCase().includes(lowerTerm) || 
                u.golfCourse.toLowerCase().includes(lowerTerm)
            );
        }
        data.sort((a, b) => {
            let comparison = 0;
            switch (userSortField) {
                case 'totalCost':
                case 'logCount':
                    comparison = (a[userSortField] || 0) - (b[userSortField] || 0);
                    break;
                case 'lastActivity':
                    const dateA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
                    const dateB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
                    comparison = dateA - dateB;
                    break;
                default:
                    const valA = String(a[userSortField] || '').toLowerCase();
                    const valB = String(b[userSortField] || '').toLowerCase();
                    comparison = valA.localeCompare(valB);
            }
            return userSortOrder === 'asc' ? comparison : -comparison;
        });
        return data;
    }, [approvedUsersList, userSearchTerm, userSortField, userSortOrder]);

    const handleSort = (field: keyof UserDataSummary) => {
        if (userSortField === field) {
            setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setUserSortField(field);
            setUserSortOrder('desc');
        }
    };

    const handleApproveUser = async (username: string) => {
        if (window.confirm(`${username} 님의 가입을 승인하시겠습니까?`)) {
            await api.approveUser(username);
            setSelectedPendingUsers(prev => { const next = new Set(prev); next.delete(username); return next; });
            await loadData();
        }
    };

    const handleDeleteUser = async (username: string) => {
        if (window.confirm(`${username} 님을 삭제(거절)하시겠습니까? 관련된 모든 데이터가 삭제됩니다.`)) {
            await api.deleteUser(username);
            setSelectedPendingUsers(prev => { const next = new Set(prev); next.delete(username); return next; });
            if (selectedUserForDetail?.username === username) setSelectedUserForDetail(null);
            await loadData();
        }
    };

    const togglePendingUserSelection = (username: string) => {
        const newSet = new Set(selectedPendingUsers);
        if (newSet.has(username)) newSet.delete(username); else newSet.add(username);
        setSelectedPendingUsers(newSet);
    };

    const toggleSelectAllPending = () => {
        if (selectedPendingUsers.size === pendingUsersList.length) setSelectedPendingUsers(new Set());
        else setSelectedPendingUsers(new Set(pendingUsersList.map(u => u.username)));
    };

    const handleBulkApprove = async () => {
        if (selectedPendingUsers.size === 0) return;
        if (window.confirm(`선택한 ${selectedPendingUsers.size}명의 사용자를 일괄 승인하시겠습니까?`)) {
            for (const username of Array.from(selectedPendingUsers)) await api.approveUser(username);
            setSelectedPendingUsers(new Set());
            await loadData();
        }
    };

    const handleBulkReject = async () => {
        if (selectedPendingUsers.size === 0) return;
        if (window.confirm(`선택한 ${selectedPendingUsers.size}명의 사용자를 일괄 거절(삭제)하시겠습니까?`)) {
            for (const username of Array.from(selectedPendingUsers)) await api.deleteUser(username);
            setSelectedPendingUsers(new Set());
            await loadData();
        }
    };

    const handleRemoveFertilizer = async (index: number) => {
        const target = masterFertilizers[index];
        if (window.confirm(`'${target.name}' 비료를 마스터 목록에서 삭제하시겠습니까?`)) {
            const newList = [...masterFertilizers];
            newList.splice(index, 1);
            await api.saveFertilizers('admin', newList);
            setMasterFertilizers(newList);
        }
    };

    const handleAddFertilizer = async () => {
        if (!newFertilizer.name || !newFertilizer.unit || !newFertilizer.rate) {
            alert('필수 정보를 모두 입력해주세요.');
            return;
        }
        const fertilizerToAdd: Fertilizer = {
            name: newFertilizer.name,
            usage: newFertilizer.usage as any,
            type: newFertilizer.type as any,
            N: Number(newFertilizer.N || 0), P: Number(newFertilizer.P || 0), K: Number(newFertilizer.K || 0),
            Ca: Number(newFertilizer.Ca || 0), Mg: Number(newFertilizer.Mg || 0), S: Number(newFertilizer.S || 0),
            Fe: Number(newFertilizer.Fe || 0), Mn: Number(newFertilizer.Mn || 0), Zn: Number(newFertilizer.Zn || 0),
            Cu: Number(newFertilizer.Cu || 0), B: Number(newFertilizer.B || 0), Mo: Number(newFertilizer.Mo || 0),
            Cl: Number(newFertilizer.Cl || 0), Na: Number(newFertilizer.Na || 0), Si: Number(newFertilizer.Si || 0),
            Ni: Number(newFertilizer.Ni || 0), Co: Number(newFertilizer.Co || 0), V: Number(newFertilizer.V || 0),
            aminoAcid: Number(newFertilizer.aminoAcid || 0), price: Number(newFertilizer.price || 0),
            unit: newFertilizer.unit, rate: newFertilizer.rate, stock: 0, imageUrl: '', lowStockAlertEnabled: false,
        };
        const newList = [...masterFertilizers, fertilizerToAdd];
        await api.saveFertilizers('admin', newList);
        setMasterFertilizers(newList);
        setIsAddFertilizerModalOpen(false);
        setNewFertilizer({ type: '완효성', usage: '그린' });
    };

    // --- AI Smart Fill Logic ---
    const processAiRequest = async (promptText: string, inlineDataParts: any[] = []) => {
        setIsAiFillLoading(true);
        setAiError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            const prompt = `
                Analyze the provided fertilizer information (Text, Image, Excel, PDF, or CSV).
                Extract the following details and return ONLY a JSON object:
                {
                    "name": "Product Name",
                    "usage": "One of ['그린', '티', '페어웨이']",
                    "type": "One of ['완효성', '액상', '수용성', '4종복합비료', '기능성제제', '토양개량제']",
                    "unit": "Packaging Unit (e.g., '20kg')",
                    "price": Number (approximate or 0 if unknown),
                    "rate": "Recommended Rate (e.g., '20g/㎡')",
                    "N": Number (Percentage), "P": Number, "K": Number, "Ca": Number, "Mg": Number, "S": Number, 
                    "Fe": Number, "Mn": Number, "Zn": Number, "Cu": Number, "B": Number, "Mo": Number,
                    "aminoAcid": Number (Percentage)
                }
                
                Important Rules:
                1. Infer usage and type if unknown. Default usage '그린', type '완효성'.
                2. Ensure all values are raw JSON without markdown.
                
                Input Data:
                ${promptText}
            `;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }, ...inlineDataParts] }
            });
            let text = response.text;
            if (!text) throw new Error("AI response text is empty or invalid.");
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(text);
            setNewFertilizer(prev => ({
                ...prev, ...data,
                usage: ['그린', '티', '페어웨이'].includes(data.usage) ? data.usage : '그린',
                type: ['완효성', '액상', '수용성', '4종복합비료', '기능성제제', '토양개량제'].includes(data.type) ? data.type : '완효성',
            }));
        } catch (e) {
            console.error("AI Fill Error:", e);
            setAiError("분석에 실패했습니다. 올바른 데이터인지 확인해주세요.");
        } finally {
            setIsAiFillLoading(false);
        }
    };

    const handleAiSmartFillText = async () => {
        if (!aiInputText.trim()) return;
        await processAiRequest(aiInputText);
    };

    const handleAiSmartFillFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
            const reader = new FileReader();
            reader.onload = async (event: ProgressEvent<FileReader>) => {
                const target = event.target;
                if (!target) return;
                const data = target.result;
                if (!data || typeof data === 'string') return; // Expecting ArrayBuffer for 'array' type read
                
                const wb = XLSX.read(data, { type: 'array' });
                const wsname = wb.SheetNames[0];
                if (!wsname) return;
                const ws = wb.Sheets[wsname];
                if (!ws) return;
                
                // Explicitly cast to unknown then string to satisfy compiler if types are loose
                const csvData = (XLSX.utils.sheet_to_csv(ws) as unknown) as string;
                await processAiRequest(`Extracted Spreadsheet Data:\n${csvData}`);
            };
            reader.readAsArrayBuffer(file);
        } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onloadend = async (event: ProgressEvent<FileReader>) => {
                const target = event.target;
                if (!target) return;
                const result = target.result;
                if (typeof result !== 'string') return;
                
                const base64Data = result.split(',')[1];
                const mimeType = file.type;
                
                await processAiRequest("Analyze this document/image.", [{
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                }]);
            };
            reader.readAsDataURL(file);
        } else {
             // Treat as text file
            const reader = new FileReader();
            reader.onload = async (event: ProgressEvent<FileReader>) => {
                const target = event.target;
                if (!target) return;
                const text = target.result;
                if (typeof text !== 'string') return;
                await processAiRequest(`File Content:\n${text}`);
            }
            reader.readAsText(file);
        }
    };

    const SortIcon = ({ field }: { field: keyof UserDataSummary }) => {
        if (userSortField !== field) return <span className="text-slate-300 ml-1">↕</span>;
        return <span className="text-blue-600 ml-1">{userSortOrder === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <DashboardIcon /> 관리자 대시보드
                        </h1>
                        <p className="text-slate-500 text-sm">전체 사용자 및 마스터 데이터 관리</p>
                    </div>
                    <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-md hover:bg-slate-300 transition-colors">
                        <LogoutIcon /> 로그아웃
                    </button>
                </header>

                {/* Pending Approvals Section */}
                {pendingUsersList.length > 0 && (
                    <section className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-lg shadow-md animate-fadeIn">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                            <h2 className="text-xl font-bold text-amber-800 flex items-center gap-2">
                                ⏳ 승인 대기 중인 사용자 ({pendingUsersList.length})
                            </h2>
                            
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <label className="flex items-center gap-2 text-sm font-semibold text-amber-900 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={pendingUsersList.length > 0 && selectedPendingUsers.size === pendingUsersList.length}
                                        onChange={toggleSelectAllPending}
                                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                                    />
                                    전체 선택
                                </label>
                                {selectedPendingUsers.size > 0 && (
                                    <div className="flex gap-2 ml-auto sm:ml-0">
                                        <button 
                                            onClick={handleBulkApprove}
                                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow-sm hover:bg-green-700 transition-colors"
                                        >
                                            선택 승인 ({selectedPendingUsers.size})
                                        </button>
                                        <button 
                                            onClick={handleBulkReject}
                                            className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded shadow-sm hover:bg-red-600 transition-colors"
                                        >
                                            선택 거절
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingUsersList.map(user => (
                                <div 
                                    key={user.username} 
                                    className={`bg-white p-4 rounded-lg shadow-sm border flex flex-col justify-between h-full transition-all ${selectedPendingUsers.has(user.username) ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200'}`}
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedPendingUsers.has(user.username)}
                                                    onChange={() => togglePendingUserSelection(user.username)}
                                                    className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
                                                />
                                                <h3 className="font-bold text-lg text-slate-800">{user.username}</h3>
                                            </div>
                                            <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full border border-red-200 whitespace-nowrap">
                                                대기 중
                                            </span>
                                        </div>
                                        <div className="pl-8">
                                            <p className="text-sm text-slate-600 mb-1">
                                                <span className="font-semibold">골프장:</span> {user.golfCourse}
                                            </p>
                                            <p className="text-xs text-slate-500 mb-4">
                                                가입 요청 승인이 필요합니다.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-auto pl-8">
                                        <button 
                                            onClick={() => handleApproveUser(user.username)}
                                            className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded shadow-sm transition-colors"
                                        >
                                            승인
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteUser(user.username)}
                                            className="flex-1 py-2 bg-white border border-red-200 text-red-500 hover:bg-red-50 text-sm font-bold rounded shadow-sm transition-colors"
                                        >
                                            거절
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Tabs */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="flex border-b">
                        <button 
                            className={`flex-1 py-4 text-center font-bold transition-colors ${activeTab === 'users' ? 'bg-slate-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                            onClick={() => setActiveTab('users')}
                        >
                            <span className="flex items-center justify-center gap-2"><UsersIcon /> 사용자 관리</span>
                        </button>
                        <button 
                            className={`flex-1 py-4 text-center font-bold transition-colors ${activeTab === 'fertilizers' ? 'bg-slate-50 text-green-600 border-b-2 border-green-600' : 'text-slate-500 hover:bg-slate-50'}`}
                            onClick={() => setActiveTab('fertilizers')}
                        >
                            <span className="flex items-center justify-center gap-2"><ClipboardListIcon /> 마스터 비료 목록 관리</span>
                        </button>
                    </div>

                    <div className="p-6">
                        {activeTab === 'users' ? (
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                                    <h3 className="font-bold text-slate-700">승인된 사용자 목록 ({processedUsers.length})</h3>
                                    <div className="w-full sm:w-64">
                                        <input 
                                            type="text" 
                                            placeholder="골프장 또는 사용자명 검색..." 
                                            value={userSearchTerm}
                                            onChange={(e) => setUserSearchTerm(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead className="bg-slate-100 text-slate-600 uppercase">
                                            <tr>
                                                <th className="p-3 border-b cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleSort('golfCourse')}>
                                                    골프장 <SortIcon field="golfCourse" />
                                                </th>
                                                <th className="p-3 border-b cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleSort('username')}>
                                                    사용자명 <SortIcon field="username" />
                                                </th>
                                                <th className="p-3 border-b cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleSort('lastActivity')}>
                                                    최근 활동 <SortIcon field="lastActivity" />
                                                </th>
                                                <th className="p-3 border-b cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleSort('logCount')}>
                                                    기록 수 <SortIcon field="logCount" />
                                                </th>
                                                <th className="p-3 border-b cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleSort('totalCost')}>
                                                    총 비용 <SortIcon field="totalCost" />
                                                </th>
                                                <th className="p-3 border-b text-center">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {processedUsers.map(u => (
                                                <tr key={u.username} className="hover:bg-slate-50">
                                                    <td className="p-3 font-semibold text-slate-700">{u.golfCourse}</td>
                                                    <td className="p-3 text-slate-600">{u.username}</td>
                                                    <td className="p-3 text-slate-500">{u.lastActivity || '-'}</td>
                                                    <td className="p-3 text-slate-500">{u.logCount}건</td>
                                                    <td className="p-3 text-slate-600 font-mono">{Math.round(u.totalCost).toLocaleString()}원</td>
                                                    <td className="p-3 text-center flex justify-center gap-2">
                                                        <button
                                                            onClick={() => setSelectedUserForDetail(u)}
                                                            className="text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors text-xs border border-blue-200"
                                                        >
                                                            상세
                                                        </button>
                                                        <button
                                                            onClick={() => exportUserLogsToExcel(u)}
                                                            className="text-green-500 hover:text-green-700 p-1.5 rounded hover:bg-green-50 transition-colors text-xs border border-green-200"
                                                            title="엑셀 내보내기"
                                                        >
                                                            <DownloadIcon className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteUser(u.username)}
                                                            className="text-red-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                            title="사용자 삭제"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {processedUsers.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="p-8 text-center text-slate-400">
                                                        {approvedUsersList.length === 0 ? '승인된 사용자가 없습니다.' : '검색 결과가 없습니다.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-700">등록된 마스터 비료 목록 ({masterFertilizers.length})</h3>
                                    <button 
                                        onClick={() => setIsAddFertilizerModalOpen(true)}
                                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-bold rounded-md hover:bg-green-700 transition-colors"
                                    >
                                        <PlusIcon /> 새 비료 추가
                                    </button>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {masterFertilizers.map((f, idx) => (
                                        <div key={`${f.name}-${idx}`} className="border rounded-lg p-4 hover:shadow-md transition-shadow relative group">
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleRemoveFertilizer(idx)} className="p-1 text-slate-400 hover:text-red-500 bg-white rounded-full shadow-sm border">
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                                    f.usage === '그린' ? 'bg-green-100 text-green-800' :
                                                    f.usage === '티' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-orange-100 text-orange-800'
                                                }`}>{f.usage}</span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{f.type}</span>
                                                <h4 className="font-bold text-slate-800">{f.name}</h4>
                                            </div>
                                            <div className="text-xs text-slate-600 space-y-1">
                                                <p>성분(NPK): {f.N}-{f.P}-{f.K}</p>
                                                <p>포장: {f.unit} / 가격: {f.price.toLocaleString()}원</p>
                                                <p>권장량: {f.rate}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* User Detail Modal */}
            {selectedUserForDetail && (
                <UserDetailModal 
                    userData={selectedUserForDetail} 
                    onClose={() => setSelectedUserForDetail(null)} 
                />
            )}

            {/* Add Fertilizer Modal */}
            {isAddFertilizerModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={() => setIsAddFertilizerModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800">새 비료 추가</h3>
                            <button onClick={() => setIsAddFertilizerModalOpen(false)}><CloseIcon /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* AI Smart Input Section */}
                            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                                <h4 className="font-bold text-purple-900 flex items-center gap-2 mb-3 text-sm">
                                    <SparklesIcon /> AI 스마트 입력
                                </h4>
                                <div className="flex gap-2 mb-3">
                                    <button 
                                        onClick={() => setAiSmartTab('text')}
                                        className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${aiSmartTab === 'text' ? 'bg-purple-600 text-white shadow' : 'bg-white text-purple-600 border border-purple-200'}`}
                                    >
                                        텍스트 직접 입력
                                    </button>
                                    <button 
                                        onClick={() => setAiSmartTab('file')}
                                        className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${aiSmartTab === 'file' ? 'bg-purple-600 text-white shadow' : 'bg-white text-purple-600 border border-purple-200'}`}
                                    >
                                        파일 업로드 (이미지/엑셀/PDF)
                                    </button>
                                </div>

                                {aiSmartTab === 'text' ? (
                                    <div className="space-y-2">
                                        <textarea
                                            value={aiInputText}
                                            onChange={e => setAiInputText(e.target.value)}
                                            placeholder="제품 설명, 성분표 등을 복사해서 붙여넣으세요..."
                                            className="w-full p-2 border border-purple-200 rounded text-sm h-24 focus:ring-2 focus:ring-purple-400 focus:outline-none"
                                        />
                                        <button 
                                            onClick={handleAiSmartFillText}
                                            disabled={isAiFillLoading || !aiInputText.trim()}
                                            className="w-full py-2 bg-purple-600 text-white font-bold rounded text-xs hover:bg-purple-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                                        >
                                            {isAiFillLoading ? <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div> : <SparklesIcon />}
                                            분석하여 자동 채우기
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="border-2 border-dashed border-purple-300 rounded-lg p-6 text-center bg-white hover:bg-purple-50 transition-colors relative">
                                            <input 
                                                type="file" 
                                                onChange={handleAiSmartFillFile}
                                                accept="image/*,.xlsx,.xls,.csv,.pdf"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                disabled={isAiFillLoading}
                                            />
                                            <div className="flex flex-col items-center justify-center pointer-events-none">
                                                {isAiFillLoading ? (
                                                    <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mb-2"></div>
                                                ) : (
                                                    <UploadIcon className="h-8 w-8 text-purple-400 mb-2" />
                                                )}
                                                <p className="text-xs font-bold text-purple-700">
                                                    {isAiFillLoading ? '파일 분석 중...' : '클릭 또는 드래그하여 파일 업로드'}
                                                </p>
                                                <p className="text-[10px] text-purple-400 mt-1">
                                                    지원: 이미지, Excel, PDF, CSV
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {aiError && (
                                    <p className="text-xs text-red-500 mt-2 text-center">{aiError}</p>
                                )}
                            </div>

                            <div className="border-t pt-4">
                                <h4 className="font-bold text-slate-700 mb-3 text-sm">상세 정보 입력</h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">제품명</label>
                                        <input type="text" className="w-full border p-2 rounded" value={newFertilizer.name || ''} onChange={e => setNewFertilizer({...newFertilizer, name: e.target.value})} placeholder="예: HPG-Special" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">용도</label>
                                            <select className="w-full border p-2 rounded" value={newFertilizer.usage} onChange={e => setNewFertilizer({...newFertilizer, usage: e.target.value as any})}>
                                                <option value="그린">그린</option>
                                                <option value="티">티</option>
                                                <option value="페어웨이">페어웨이</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">타입</label>
                                            <select className="w-full border p-2 rounded" value={newFertilizer.type} onChange={e => setNewFertilizer({...newFertilizer, type: e.target.value as any})}>
                                                {Object.entries(FERTILIZER_TYPE_GROUPS).map(([group, types]) => (
                                                    <optgroup key={group} label={group}>
                                                        {types.map(t => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded border">
                                        <p className="text-xs font-bold text-slate-500 mb-2">성분 함량 (%)</p>
                                        <div className="grid grid-cols-3 gap-2 mb-2">
                                            <div><label className="text-[10px]">N (질소)</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.N} onChange={e => setNewFertilizer({...newFertilizer, N: Number(e.target.value)})} /></div>
                                            <div><label className="text-[10px]">P (인산)</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.P} onChange={e => setNewFertilizer({...newFertilizer, P: Number(e.target.value)})} /></div>
                                            <div><label className="text-[10px]">K (칼륨)</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.K} onChange={e => setNewFertilizer({...newFertilizer, K: Number(e.target.value)})} /></div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                             <div><label className="text-[10px]">Ca</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.Ca} onChange={e => setNewFertilizer({...newFertilizer, Ca: Number(e.target.value)})} /></div>
                                             <div><label className="text-[10px]">Mg</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.Mg} onChange={e => setNewFertilizer({...newFertilizer, Mg: Number(e.target.value)})} /></div>
                                             <div><label className="text-[10px]">S</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.S} onChange={e => setNewFertilizer({...newFertilizer, S: Number(e.target.value)})} /></div>
                                             <div><label className="text-[10px]">Fe</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.Fe} onChange={e => setNewFertilizer({...newFertilizer, Fe: Number(e.target.value)})} /></div>
                                        </div>
                                    </div>
                                    {/* Micronutrients and Others Section */}
                                    <div className="bg-orange-50 p-3 rounded border border-orange-100">
                                        <p className="text-xs font-bold text-orange-800 mb-2">미량요소 및 기타 (%)</p>
                                        <div className="grid grid-cols-5 gap-2 mb-2">
                                            <div><label className="text-[10px]">Mn</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.Mn} onChange={e => setNewFertilizer({...newFertilizer, Mn: Number(e.target.value)})} /></div>
                                            <div><label className="text-[10px]">Zn</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.Zn} onChange={e => setNewFertilizer({...newFertilizer, Zn: Number(e.target.value)})} /></div>
                                            <div><label className="text-[10px]">Cu</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.Cu} onChange={e => setNewFertilizer({...newFertilizer, Cu: Number(e.target.value)})} /></div>
                                            <div><label className="text-[10px]">B</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.B} onChange={e => setNewFertilizer({...newFertilizer, B: Number(e.target.value)})} /></div>
                                            <div><label className="text-[10px]">Mo</label><input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.Mo} onChange={e => setNewFertilizer({...newFertilizer, Mo: Number(e.target.value)})} /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-700">아미노산</label>
                                                <input type="number" className="w-full border p-1 rounded text-sm" value={newFertilizer.aminoAcid} onChange={e => setNewFertilizer({...newFertilizer, aminoAcid: Number(e.target.value)})} placeholder="%" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">포장단위</label>
                                            <input type="text" className="w-full border p-2 rounded" value={newFertilizer.unit || ''} onChange={e => setNewFertilizer({...newFertilizer, unit: e.target.value})} placeholder="예: 20kg" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">가격</label>
                                            <input type="number" className="w-full border p-2 rounded" value={newFertilizer.price} onChange={e => setNewFertilizer({...newFertilizer, price: Number(e.target.value)})} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">권장사용량</label>
                                        <input type="text" className="w-full border p-2 rounded" value={newFertilizer.rate || ''} onChange={e => setNewFertilizer({...newFertilizer, rate: e.target.value})} placeholder="예: 20g/㎡" />
                                    </div>
                                    <button onClick={handleAddFertilizer} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 shadow-md">추가하기</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
