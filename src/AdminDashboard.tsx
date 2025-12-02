import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { UserDataSummary, Fertilizer, LogEntry } from './types';
import { LogoutIcon, DashboardIcon, UsersIcon, PlusIcon, TrashIcon, CloseIcon, ClipboardListIcon, CameraIcon, DocumentSearchIcon, UploadIcon, SparklesIcon, DownloadIcon, PencilIcon } from './icons';
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
    const [statsView, setStatsView] = useState<'monthly' | 'daily' | 'yearly'>('monthly');
    const [selectedYear, setSelectedYear] = useState<string>('all');

    // 1. Calculate Product Statistics (Most used, Cost share, Quantity)
    const productStats = useMemo(() => {
        const stats: Record<string, { count: number, totalCost: number, totalAmount: number, unitHint: string, name: string }> = {};
        userData.logs.forEach(log => {
            if (!stats[log.product]) {
                stats[log.product] = { count: 0, totalCost: 0, totalAmount: 0, unitHint: '', name: log.product };
            }
            stats[log.product].count += 1;
            stats[log.product].totalCost += log.totalCost;
            
            // Estimate amount (kg or L) based on area * rate / 1000
            // This assumes rate is g/m2 or ml/m2
            const amount = (log.area * log.applicationRate) / 1000;
            stats[log.product].totalAmount += amount;
            
            if (!stats[log.product].unitHint) {
                stats[log.product].unitHint = log.applicationUnit.includes('ml') ? 'L' : 'kg';
            }
        });
        return Object.values(stats).sort((a, b) => b.totalCost - a.totalCost);
    }, [userData.logs]);

    const mostFrequentProduct = useMemo(() => {
        if (productStats.length === 0) return null;
        return [...productStats].sort((a, b) => b.count - a.count)[0];
    }, [productStats]);

    const chartDataProductCost = useMemo(() => {
        return productStats.slice(0, 5).map(p => ({ name: p.name, value: p.totalCost }));
    }, [productStats]);

    // 2. Calculate Time-based Statistics
    const timeStats = useMemo(() => {
        const monthly: Record<string, number> = {};
        const yearly: Record<string, number> = {};
        const daily: Record<string, number> = {};

        userData.logs.forEach(log => {
            // Apply Year Filter if selected
            const date = new Date(log.date);
            const y = date.getFullYear().toString();
            
            if (selectedYear !== 'all' && y !== selectedYear) return;

            const m = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const d = log.date; // YYYY-MM-DD

            yearly[y] = (yearly[y] || 0) + log.totalCost;
            monthly[m] = (monthly[m] || 0) + log.totalCost;
            daily[d] = (daily[d] || 0) + log.totalCost;
        });

        // Convert to arrays for charts/tables
        const monthlyArr = Object.entries(monthly).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period));
        const yearlyArr = Object.entries(yearly).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period));
        const dailyArr = Object.entries(daily).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period)); // Sort daily ascending for chart

        return { monthly: monthlyArr, yearly: yearlyArr, daily: dailyArr };
    }, [userData.logs, selectedYear]);

    // 3. Annual Usage Stats (New Feature for Growth Pattern)
    const annualUsageStats = useMemo(() => {
        const stats: Record<string, { totalAmount: number, unit: string, cost: number, count: number }> = {};
        
        userData.logs.forEach(log => {
            const date = new Date(log.date);
            const y = date.getFullYear().toString();
            
            if (selectedYear !== 'all' && y !== selectedYear) return;

            if (!stats[log.product]) {
                const unit = log.applicationUnit.includes('ml') ? 'L' : 'kg';
                stats[log.product] = { totalAmount: 0, unit, cost: 0, count: 0 };
            }
            
            const amount = (log.area * log.applicationRate) / 1000;
            stats[log.product].totalAmount += amount;
            stats[log.product].cost += log.totalCost;
            stats[log.product].count += 1;
        });

        return Object.entries(stats)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
    }, [userData.logs, selectedYear]);

    const availableYears = useMemo(() => {
        const years = new Set(userData.logs.map(l => new Date(l.date).getFullYear().toString()));
        return Array.from(years).sort().reverse();
    }, [userData.logs]);

    const formatXAxis = (tickItem: string) => {
        if (statsView === 'monthly') return tickItem.slice(5); // 2023-05 -> 05
        if (statsView === 'daily') return tickItem.slice(5); // 2023-05-20 -> 05-20
        return tickItem; // 2023
    };

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
                        <p className="text-slate-500 text-sm mt-1">총 기록: {userData.logCount}건 | 가입일: {userData.isApproved ? '승인됨' : '대기중'}</p>
                    </div>
                    <div className="flex gap-2">
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
                            <h4 className="text-blue-800 text-xs font-bold uppercase mb-1">총 누적 비용</h4>
                            <p className="text-2xl font-bold text-blue-900">{Math.round(userData.totalCost).toLocaleString()}원</p>
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

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Cost Chart */}
                        <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700">📊 기간별 비용 추이</h3>
                                <div className="flex gap-2">
                                    <select 
                                        value={selectedYear} 
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="text-xs p-1 border rounded bg-slate-50"
                                    >
                                        <option value="all">전체 연도</option>
                                        {availableYears.map(y => <option key={y} value={y}>{y}년</option>)}
                                    </select>
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
                            </div>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timeStats[statsView]}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="period" fontSize={12} tickFormatter={formatXAxis} />
                                        <YAxis fontSize={12} />
                                        <Tooltip 
                                            formatter={(val: number) => `${Math.round(val).toLocaleString()}원`} 
                                            labelFormatter={(label) => label}
                                        />
                                        <Bar dataKey="cost" name="비용" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
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

                    {/* NEW SECTION: Annual Total Fertilizer Usage */}
                    <div className="bg-white border rounded-lg overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">📅 연간 비료 총 사용량 및 생육 자재 투입 현황</h3>
                            <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded border">
                                {selectedYear === 'all' ? '전체 기간' : `${selectedYear}년도 데이터`}
                            </span>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3">제품명</th>
                                        <th className="p-3 text-right">총 사용량 (kg/L)</th>
                                        <th className="p-3 text-right">사용 횟수</th>
                                        <th className="p-3 text-right">총 비용</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {annualUsageStats.length > 0 ? (
                                        annualUsageStats.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-3 text-slate-700 font-medium">{item.name}</td>
                                                <td className="p-3 text-right font-bold text-blue-800">
                                                    {item.totalAmount.toFixed(1)} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                                                </td>
                                                <td className="p-3 text-right text-slate-600">{item.count}회</td>
                                                <td className="p-3 text-right font-mono text-slate-800">{Math.round(item.cost).toLocaleString()}원</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={4} className="p-6 text-center text-slate-400">해당 연도의 데이터가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
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
    const [editingFertilizerIndex, setEditingFertilizerIndex] = useState<number | null>(null); // Track index for editing
    const [newFertilizer, setNewFertilizer] = useState<Partial<Fertilizer>>({
        type: '완효성',
        usage: '그린'
    });

    // Bulk Upload State
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkPreviewData, setBulkPreviewData] = useState<Fertilizer[]>([]);

    // Sorting and Filtering State for Approved Users
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [userSortField, setUserSortField] = useState<keyof UserDataSummary>('lastActivity');
    const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');
    
    // AI Smart Input State
    const [aiInputText, setAiInputText] = useState('');
    const [isAiFillLoading, setIsAiFillLoading] = useState(false);
    const [aiSmartTab, setAiSmartTab] = useState<'text' | 'file'>('text');
    const [aiError, setAiError] = useState<string | null>(null);
    const [autoSaveAfterAi, setAutoSaveAfterAi] = useState(false);

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

    // Pre-fill AI Input with current fertilizer data when editing
    useEffect(() => {
        if (editingFertilizerIndex !== null) {
            const fertilizerToEdit = newFertilizer;
            // Create a readable text representation for the AI context
            const fertilizerContext = `
                [Current Product Info to Edit]
                Name: ${fertilizerToEdit.name}
                Usage: ${fertilizerToEdit.usage}
                Type: ${fertilizerToEdit.type}
                NPK: ${fertilizerToEdit.N}-${fertilizerToEdit.P}-${fertilizerToEdit.K}
                Rate: ${fertilizerToEdit.rate}
                Description: ${fertilizerToEdit.description || ''}
            `;
            setAiInputText(fertilizerContext);
        } else {
            setAiInputText('');
        }
    }, [editingFertilizerIndex, newFertilizer]);

    const pendingUsersList = useMemo(() => allUsersData.filter(u => !u.isApproved), [allUsersData]);
    const approvedUsersList = useMemo(() => allUsersData.filter(u => u.isApproved), [allUsersData]);

    const processedUsers = useMemo(() => {
        let data = [...approvedUsersList];

        // Filter
        if (userSearchTerm) {
            const lowerTerm = userSearchTerm.toLowerCase();
            data = data.filter(u => 
                u.username.toLowerCase().includes(lowerTerm) || 
                u.golfCourse.toLowerCase().includes(lowerTerm)
            );
        }

        // Sort
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
            // Clear from selection if present
            setSelectedPendingUsers(prev => {
                const next = new Set(prev);
                next.delete(username);
                return next;
            });
            await loadData();
        }
    };

    const handleDeleteUser = async (username: string) => {
        if (window.confirm(`${username} 님을 삭제(거절)하시겠습니까? 관련된 모든 데이터가 삭제됩니다.`)) {
            await api.deleteUser(username);
            // Clear from selection if present
            setSelectedPendingUsers(prev => {
                const next = new Set(prev);
                next.delete(username);
                return next;
            });
            if (selectedUserForDetail?.username === username) setSelectedUserForDetail(null);
            await loadData();
        }
    };

    const togglePendingUserSelection = (username: string) => {
        const newSet = new Set(selectedPendingUsers);
        if (newSet.has(username)) {
            newSet.delete(username);
        } else {
            newSet.add(username);
        }
        setSelectedPendingUsers(newSet);
    };

    const toggleSelectAllPending = () => {
        if (selectedPendingUsers.size === pendingUsersList.length) {
            setSelectedPendingUsers(new Set());
        } else {
            const allUsernames = pendingUsersList.map(u => u.username);
            setSelectedPendingUsers(new Set(allUsernames));
        }
    };

    const handleBulkApprove = async () => {
        if (selectedPendingUsers.size === 0) return;
        if (window.confirm(`선택한 ${selectedPendingUsers.size}명의 사용자를 일괄 승인하시겠습니까?`)) {
            for (const username of Array.from(selectedPendingUsers)) {
                await api.approveUser(username);
            }
            setSelectedPendingUsers(new Set());
            await loadData();
        }
    };

    const handleBulkReject = async () => {
        if (selectedPendingUsers.size === 0) return;
        if (window.confirm(`선택한 ${selectedPendingUsers.size}명의 사용자를 일괄 거절(삭제)하시겠습니까?`)) {
            for (const username of Array.from(selectedPendingUsers)) {
                await api.deleteUser(username);
            }
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

    const openAddModal = () => {
        setEditingFertilizerIndex(null);
        setNewFertilizer({ type: '완효성', usage: '그린' });
        setIsAddFertilizerModalOpen(true);
    };

    const openEditModal = (index: number, fertilizer: Fertilizer) => {
        setEditingFertilizerIndex(index);
        setNewFertilizer({ ...fertilizer });
        setIsAddFertilizerModalOpen(true);
    };

    const handleSaveFertilizer = async (dataOverride?: Partial<Fertilizer>) => {
        // Use override data if provided (for auto-save), otherwise use state
        const dataToSave = dataOverride || newFertilizer;

        if (!dataToSave.name || !dataToSave.unit || !dataToSave.rate) {
            // Only alert if manual save, skip if automated call might be incomplete
            if (!dataOverride) alert('필수 정보를 모두 입력해주세요.');
            return;
        }

        const fertilizerData: Fertilizer = {
            name: dataToSave.name || '',
            usage: (dataToSave.usage || '그린') as '그린' | '티' | '페어웨이',
            type: (dataToSave.type || '완효성') as string,
            N: Number(dataToSave.N || 0),
            P: Number(dataToSave.P || 0),
            K: Number(dataToSave.K || 0),
            Ca: Number(dataToSave.Ca || 0),
            Mg: Number(dataToSave.Mg || 0),
            S: Number(dataToSave.S || 0),
            Fe: Number(dataToSave.Fe || 0),
            Mn: Number(dataToSave.Mn || 0),
            Zn: Number(dataToSave.Zn || 0),
            Cu: Number(dataToSave.Cu || 0),
            B: Number(dataToSave.B || 0),
            Mo: Number(dataToSave.Mo || 0),
            Cl: Number(dataToSave.Cl || 0),
            Na: Number(dataToSave.Na || 0),
            Si: Number(dataToSave.Si || 0),
            Ni: Number(dataToSave.Ni || 0),
            Co: Number(dataToSave.Co || 0),
            V: Number(dataToSave.V || 0),
            aminoAcid: Number(dataToSave.aminoAcid || 0),
            price: Number(dataToSave.price || 0),
            unit: dataToSave.unit || '',
            rate: dataToSave.rate || '',
            // Preserve existing stock/image/alert if editing and not provided in update
            stock: dataToSave.stock ?? (editingFertilizerIndex !== null ? masterFertilizers[editingFertilizerIndex].stock : 0),
            imageUrl: dataToSave.imageUrl ?? (editingFertilizerIndex !== null ? masterFertilizers[editingFertilizerIndex].imageUrl : ''),
            lowStockAlertEnabled: dataToSave.lowStockAlertEnabled ?? (editingFertilizerIndex !== null ? masterFertilizers[editingFertilizerIndex].lowStockAlertEnabled : false),
            description: dataToSave.description || '', // New Description Field
        };

        const newList = [...masterFertilizers];
        if (editingFertilizerIndex !== null) {
            newList[editingFertilizerIndex] = fertilizerData;
        } else {
            newList.push(fertilizerData);
        }

        await api.saveFertilizers('admin', newList);
        setMasterFertilizers(newList);
        setIsAddFertilizerModalOpen(false);
        setNewFertilizer({ type: '완효성', usage: '그린' });
        setEditingFertilizerIndex(null);
        if (dataOverride) {
            // console.log('Auto-saved fertilizer via AI');
        }
    };

    const handleBulkSave = async () => {
        if (bulkPreviewData.length === 0) return;
        
        // Merge bulk data into current list
        const newList = [...masterFertilizers, ...bulkPreviewData];
        await api.saveFertilizers('admin', newList);
        setMasterFertilizers(newList);
        
        setBulkPreviewData([]);
        setIsBulkModalOpen(false);
        alert(`${bulkPreviewData.length}개의 비료가 추가되었습니다.`);
    };

    // --- AI Smart Fill Logic ---

    const processAiRequest = async (promptText: string, inlineDataParts: any[] = []) => {
        setIsAiFillLoading(true);
        setAiError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY as string) });
            const groupsJSON = JSON.stringify(FERTILIZER_TYPE_GROUPS);
            
            const prompt = `
                Analyze the provided fertilizer information (Text, Image, Excel, PDF, or CSV).
                
                **Task:**
                If the input contains MULTIPLE fertilizer products (e.g. a list, table, or catalog), output a JSON ARRAY of objects.
                If it contains only ONE product, output a SINGLE JSON object.
                
                **Extraction Schema (for each item):**
                {
                    "name": "Product Name",
                    "usage": "One of ['그린', '티', '페어웨이']",
                    "type": "The exact sub-category string found in this hierarchy: ${groupsJSON}. If no perfect match, use '기타'.",
                    "unit": "Packaging Unit (e.g., '20kg', '10L')",
                    "price": Number (approximate or 0 if unknown),
                    "rate": "Recommended Rate (e.g., '20g/㎡')",
                    "description": "A detailed description of the product features, active ingredients, and effects in Korean",
                    "N": Number (Percentage),
                    "P": Number (Percentage),
                    "K": Number (Percentage),
                    "Ca": Number, "Mg": Number, "S": Number, "Fe": Number, "Mn": Number, 
                    "Zn": Number, "Cu": Number, "B": Number, "Mo": Number, 
                    "Cl": Number, "Na": Number, "Si": Number, "Ni": Number, "Co": Number, "V": Number,
                    "aminoAcid": Number (Percentage of Amino Acids if present)
                }
                
                **Important Rules:**
                1. **Usage Inference:** If 'usage' is not explicitly stated, infer it from context keywords (e.g., 'Bentgrass'/'Putting Green' -> '그린', 'Zoysia' -> '페어웨이'). Default to '그린' if unsure.
                2. **Type Matching:** You MUST choose the "type" field from the specific strings in the provided JSON hierarchy.
                3. **Description:** Extract a good summary (2-3 sentences) for the description field.
                4. Ensure all nutrient values are numbers (percentages). If not found, use 0. Extract micronutrients and amino acid % carefully.
                5. Do NOT include any markdown formatting or explanations. Just the raw JSON.
                
                Input Data:
                ${promptText}
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { text: prompt },
                        ...inlineDataParts
                    ]
                }
            });

            let text = response.text;
            if (!text) {
                throw new Error("AI response text is empty or invalid.");
            }
            // Clean up code blocks if present
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(text);

            if (Array.isArray(data)) {
                // Handle Bulk Import List
                const validList: Fertilizer[] = data.map(item => ({
                     name: item.name || 'Unknown Product',
                     usage: ['그린', '티', '페어웨이'].includes(item.usage) ? item.usage : '그린',
                     type: item.type || '기타',
                     N: Number(item.N || 0), P: Number(item.P || 0), K: Number(item.K || 0),
                     Ca: Number(item.Ca || 0), Mg: Number(item.Mg || 0), S: Number(item.S || 0),
                     Fe: Number(item.Fe || 0), Mn: Number(item.Mn || 0), Zn: Number(item.Zn || 0),
                     Cu: Number(item.Cu || 0), B: Number(item.B || 0), Mo: Number(item.Mo || 0),
                     Cl: Number(item.Cl || 0), Na: Number(item.Na || 0), Si: Number(item.Si || 0),
                     Ni: Number(item.Ni || 0), Co: Number(item.Co || 0), V: Number(item.V || 0),
                     aminoAcid: Number(item.aminoAcid || 0),
                     price: Number(item.price || 0),
                     unit: item.unit || '20kg',
                     rate: item.rate || '20g/㎡',
                     stock: 0,
                     lowStockAlertEnabled: false,
                     description: item.description || ''
                }));
                
                setBulkPreviewData(validList);
                setIsBulkModalOpen(true);
                // Close single add modal if open
                setIsAddFertilizerModalOpen(false);
                
            } else {
                // Single Item Update
                const parsedData = {
                    ...newFertilizer,
                    ...data,
                    // Ensure usage is valid
                    usage: ['그린', '티', '페어웨이'].includes(data.usage) ? data.usage : '그린',
                    // Keep type as string, validation happens via UI selection mostly
                };
    
                setNewFertilizer(parsedData);
                
                // Auto Save Logic
                if (autoSaveAfterAi) {
                    // Must call save with the parsed data directly, as state update is async
                    await handleSaveFertilizer(parsedData);
                }
            }
            
        } catch (e: unknown) {
            console.error("AI Fill Error:", e);
            const errorMessage = e instanceof Error ? e.message : "분석에 실패했습니다. 올바른 데이터인지 확인해주세요.";
            setAiError(errorMessage);
        } finally {
            setIsAiFillLoading(false);
        }
    };

    const handleAiSmartFillText = async () => {
        if (!aiInputText.trim()) return;
        await processAiRequest(aiInputText);
    };

    const handle