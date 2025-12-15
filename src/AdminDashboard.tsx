import React, { useState, useEffect, useMemo } from 'react';
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
        
        if (log.topdressing) {
            row['배토(mm)'] = log.topdressing;
        }

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
    
    // Auto-width for columns
    const wscols = Object.keys(dataToExport[0]).map(k => ({ wch: Math.max(k.length * 2, 10) }));
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `${userData.username}_${userData.golfCourse}_시비일지.xlsx`);
};

// --- User Detail Modal ---
interface UserDetailModalProps {
    userData: UserDataSummary;
    onClose: () => void;
    onDataUpdate?: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const UserDetailModal: React.FC<UserDetailModalProps> = ({ userData, onClose, onDataUpdate }) => {
    const [activeTab, setActiveTab] = useState<'analytics' | 'logs'>('analytics');
    const [statsView, setStatsView] = useState<'monthly' | 'daily' | 'yearly'>('monthly');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    
    // Log Management State
    const [logs, setLogs] = useState<LogEntry[]>(userData.logs || []);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<Partial<LogEntry>>({});

    useEffect(() => {
        setLogs(userData.logs || []);
    }, [userData]);

    // 1. Product Statistics
    const productStats = useMemo(() => {
        const stats: Record<string, { count: number, totalCost: number, totalAmount: number, unitHint: string, name: string }> = {};
        logs.forEach(log => {
            if (!stats[log.product]) {
                stats[log.product] = { count: 0, totalCost: 0, totalAmount: 0, unitHint: '', name: log.product };
            }
            stats[log.product].count += 1;
            stats[log.product].totalCost += log.totalCost;
            const amount = (log.area * log.applicationRate) / 1000;
            stats[log.product].totalAmount += amount;
            if (!stats[log.product].unitHint) {
                stats[log.product].unitHint = log.applicationUnit.includes('ml') ? 'L' : 'kg';
            }
        });
        return Object.values(stats).sort((a, b) => b.totalCost - a.totalCost);
    }, [logs]);

    const mostFrequentProduct = useMemo(() => {
        if (productStats.length === 0) return null;
        return [...productStats].sort((a, b) => b.count - a.count)[0];
    }, [productStats]);

    const chartDataProductCost = useMemo(() => {
        return productStats.slice(0, 5).map(p => ({ name: p.name, value: p.totalCost }));
    }, [productStats]);

    // 2. Time-based Statistics
    const timeStats = useMemo(() => {
        const monthly: Record<string, number> = {};
        const yearly: Record<string, number> = {};
        const daily: Record<string, number> = {};

        logs.forEach(log => {
            const date = new Date(log.date);
            const y = date.getFullYear().toString();
            if (selectedYear !== 'all' && y !== selectedYear) return;
            const m = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const d = log.date; 
            yearly[y] = (yearly[y] || 0) + log.totalCost;
            monthly[m] = (monthly[m] || 0) + log.totalCost;
            daily[d] = (daily[d] || 0) + log.totalCost;
        });

        const monthlyArr = Object.entries(monthly).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period));
        const yearlyArr = Object.entries(yearly).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period));
        const dailyArr = Object.entries(daily).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period));

        return { monthly: monthlyArr, yearly: yearlyArr, daily: dailyArr };
    }, [logs, selectedYear]);

    // 3. Annual Usage Stats
    const annualUsageStats = useMemo(() => {
        const stats: Record<string, { totalAmount: number, unit: string, cost: number, count: number }> = {};
        logs.forEach(log => {
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
        return Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [logs, selectedYear]);

    const availableYears = useMemo(() => {
        const years = new Set(logs.map(l => new Date(l.date).getFullYear().toString()));
        return Array.from(years).sort().reverse();
    }, [logs]);

    const formatXAxis = (tickItem: string) => {
        if (statsView === 'monthly') return tickItem.slice(5); 
        if (statsView === 'daily') return tickItem.slice(5); 
        return tickItem; 
    };

    const handleDeleteLog = async (logId: string) => {
        if(window.confirm('이 시비 기록을 정말 삭제하시겠습니까?')) {
            const updatedLogs = logs.filter(l => l.id !== logId);
            setLogs(updatedLogs);
            await api.saveLog(userData.username, updatedLogs);
            if (onDataUpdate) onDataUpdate();
        }
    };

    const startEditingLog = (log: LogEntry) => {
        setEditingLogId(log.id);
        setEditFormData({ ...log });
    };

    const cancelEditing = () => {
        setEditingLogId(null);
        setEditFormData({});
    };

    const saveEditedLog = async () => {
        if (!editingLogId) return;
        const updatedLogs = logs.map(l => {
            if (l.id === editingLogId) {
                return { ...l, ...editFormData } as LogEntry;
            }
            return l;
        });
        setLogs(updatedLogs);
        await api.saveLog(userData.username, updatedLogs);
        setEditingLogId(null);
        setEditFormData({});
        if (onDataUpdate) onDataUpdate();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">사용자 관리</span>
                            {userData.username} ({userData.golfCourse})
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">총 기록: {logs.length}건 | 가입일: {userData.isApproved ? '승인됨' : '대기중'}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => exportUserLogsToExcel({ ...userData, logs })} className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded shadow transition-colors">
                            <DownloadIcon className="w-4 h-4" /> 엑셀 저장
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><CloseIcon /></button>
                    </div>
                </div>
                <div className="flex border-b bg-white">
                    <button className={`flex-1 py-3 text-sm font-bold ${activeTab === 'analytics' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`} onClick={() => setActiveTab('analytics')}>📊 데이터 분석</button>
                    <button className={`flex-1 py-3 text-sm font-bold ${activeTab === 'logs' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-500 hover:bg-slate-50'}`} onClick={() => setActiveTab('logs')}>📝 일지 관리 (수정/삭제)</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'analytics' ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100"><h4 className="text-blue-800 text-xs font-bold uppercase mb-1">총 누적 비용</h4><p className="text-2xl font-bold text-blue-900">{Math.round(userData.totalCost).toLocaleString()}원</p></div>
                                <div className="bg-green-50 p-4 rounded-lg border border-green-100"><h4 className="text-green-800 text-xs font-bold uppercase mb-1">최다 사용 (빈도)</h4><p className="text-lg font-bold text-green-900 truncate">{mostFrequentProduct ? mostFrequentProduct.name : '-'}</p></div>
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100"><h4 className="text-orange-800 text-xs font-bold uppercase mb-1">최고 지출 비료</h4><p className="text-lg font-bold text-orange-900 truncate">{productStats[0] ? productStats[0].name : '-'}</p></div>
                                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100"><h4 className="text-purple-800 text-xs font-bold uppercase mb-1">사용 제품 수</h4><p className="text-2xl font-bold text-purple-900">{productStats.length}종</p></div>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-slate-700">📊 기간별 비용 추이</h3>
                                        <div className="flex gap-2">
                                            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="text-xs p-1 border rounded bg-slate-50"><option value="all">전체 연도</option>{availableYears.map(y => <option key={y} value={y}>{y}년</option>)}</select>
                                            <div className="flex bg-slate-100 rounded p-1">
                                                {(['daily', 'monthly', 'yearly'] as const).map(view => (<button key={view} onClick={() => setStatsView(view)} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${statsView === view ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{view === 'daily' ? '일별' : view === 'monthly' ? '월별' : '연간'}</button>))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeStats[statsView]}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" fontSize={12} tickFormatter={formatXAxis} /><YAxis fontSize={12} /><Tooltip formatter={(val: number) => `${Math.round(val).toLocaleString()}원`} labelFormatter={(label) => label} /><Bar dataKey="cost" name="비용" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} /></BarChart></ResponsiveContainer></div>
                                </div>
                                <div className="bg-white p-4 rounded-lg border shadow-sm"><h3 className="font-bold text-slate-700 mb-4">🍰 제품별 비용 점유율 (Top 5)</h3><div className="h-64 flex items-center justify-center"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartDataProductCost} cx="50%" cy="50%" innerRadius={40} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">{chartDataProductCost.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip formatter={(val: number) => `${Math.round(val).toLocaleString()}원`} /><Legend wrapperStyle={{fontSize: '11px'}} /></PieChart></ResponsiveContainer></div></div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-lg border shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0"><tr><th className="p-3 border-b">날짜</th><th className="p-3 border-b">구분</th><th className="p-3 border-b">제품명</th><th className="p-3 border-b text-right">면적(㎡)</th><th className="p-3 border-b text-right">사용량</th><th className="p-3 border-b text-right">비용</th><th className="p-3 border-b text-center">관리</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((log) => (<tr key={log.id} className="hover:bg-slate-50">{editingLogId === log.id ? (<><td className="p-2"><input type="date" className="border p-1 rounded w-full" value={editFormData.date} onChange={e => setEditFormData({...editFormData, date: e.target.value})} /></td><td className="p-2"><select className="border p-1 rounded w-full" value={editFormData.usage} onChange={e => setEditFormData({...editFormData, usage: e.target.value as any})}><option value="그린">그린</option><option value="티">티</option><option value="페어웨이">페어웨이</option></select></td><td className="p-2"><input type="text" className="border p-1 rounded w-full" value={editFormData.product} onChange={e => setEditFormData({...editFormData, product: e.target.value})} /></td><td className="p-2"><input type="number" className="border p-1 rounded w-full text-right" value={editFormData.area} onChange={e => setEditFormData({...editFormData, area: Number(e.target.value)})} /></td><td className="p-2"><div className="flex gap-1"><input type="number" className="border p-1 rounded w-20 text-right" value={editFormData.applicationRate} onChange={e => setEditFormData({...editFormData, applicationRate: Number(e.target.value)})} /><span className="text-xs self-center">{log.applicationUnit}</span></div></td><td className="p-2 text-right"><input type="number" className="border p-1 rounded w-full text-right" value={editFormData.totalCost} onChange={e => setEditFormData({...editFormData, totalCost: Number(e.target.value)})} /></td><td className="p-2 text-center"><div className="flex justify-center gap-1"><button onClick={saveEditedLog} className="bg-green-600 text-white px-2 py-1 rounded text-xs">저장</button><button onClick={cancelEditing} className="bg-slate-400 text-white px-2 py-1 rounded text-xs">취소</button></div></td></>) : (<><td className="p-3">{log.date}</td><td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${log.usage === '그린' ? 'bg-green-100 text-green-800' : log.usage === '티' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>{log.usage}</span></td><td className="p-3 font-medium">{log.product}</td><td className="p-3 text-right">{log.area}</td><td className="p-3 text-right">{log.applicationRate}{log.applicationUnit}</td><td className="p-3 text-right font-mono">{Math.round(log.totalCost).toLocaleString()}</td><td className="p-3 text-center"><div className="flex justify-center gap-2"><button onClick={() => startEditingLog(log)} className="text-blue-500 hover:text-blue-700 p-1"><PencilIcon className="w-4 h-4" /></button><button onClick={() => handleDeleteLog(log.id)} className="text-red-400 hover:text-red-600 p-1"><TrashIcon className="w-4 h-4" /></button></div></td></>)}</tr>))}{logs.length === 0 && (<tr><td colSpan={7} className="p-8 text-center text-slate-400">기록된 일지가 없습니다.</td></tr>)}</tbody></table></div></div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    const [allUsersData, setAllUsersData] = useState<UserDataSummary[]>([]);
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPendingUsers, setSelectedPendingUsers] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<'users' | 'fertilizers'>('users');
    const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserDataSummary | null>(null);
    const [isAddFertilizerModalOpen, setIsAddFertilizerModalOpen] = useState(false);
    const [editingFertilizerIndex, setEditingFertilizerIndex] = useState<number | null>(null);
    const [newFertilizer, setNewFertilizer] = useState<Partial<Fertilizer>>({ type: '완효성', usage: '그린' });
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkPreviewData, setBulkPreviewData] = useState<Fertilizer[]>([]);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [userSortField, setUserSortField] = useState<keyof UserDataSummary>('lastActivity');
    const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');
    const [aiInputText, setAiInputText] = useState('');
    const [isAiFillLoading, setIsAiFillLoading] = useState(false);
    const [aiSmartTab, setAiSmartTab] = useState<'text' | 'file'>('text');
    const [aiError, setAiError] = useState<string | null>(null);
    const [autoSaveAfterAi, setAutoSaveAfterAi] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersData, fertilizers] = await Promise.all([
                api.getAllUsersData(),
                api.getFertilizers('admin')
            ]);
            setAllUsersData(usersData);
            setMasterFertilizers(fertilizers);
        } catch (error) { console.error("Failed to load admin data", error); } finally { setIsLoading(false); }
    };

    useEffect(() => {
        if (editingFertilizerIndex !== null) {
            const fertilizerToEdit = newFertilizer;
            setAiInputText(`[Current Product] Name: ${fertilizerToEdit.name}, Usage: ${fertilizerToEdit.usage}, Type: ${fertilizerToEdit.type}, NPK: ${fertilizerToEdit.N}-${fertilizerToEdit.P}-${fertilizerToEdit.K}`);
        } else { setAiInputText(''); }
    }, [editingFertilizerIndex, newFertilizer]);

    const pendingUsersList = useMemo(() => allUsersData.filter(u => !u.isApproved), [allUsersData]);
    const approvedUsersList = useMemo(() => allUsersData.filter(u => u.isApproved), [allUsersData]);

    const processedUsers = useMemo(() => {
        let data = [...approvedUsersList];
        if (userSearchTerm) {
            const lowerTerm = userSearchTerm.toLowerCase();
            data = data.filter(u => u.username.toLowerCase().includes(lowerTerm) || u.golfCourse.toLowerCase().includes(lowerTerm));
        }
        data.sort((a, b) => {
            let comparison = 0;
            switch (userSortField) {
                case 'totalCost': case 'logCount': comparison = (a[userSortField] || 0) - (b[userSortField] || 0); break;
                case 'lastActivity':
                    const dateA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
                    const dateB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
                    comparison = dateA - dateB; break;
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
        if (userSortField === field) { setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc'); } else { setUserSortField(field); setUserSortOrder('desc'); }
    };

    const handleApproveUser = async (username: string) => { if (window.confirm(`${username} 승인?`)) { await api.approveUser(username); await loadData(); } };
    const handleDeleteUser = async (username: string) => { if (window.confirm(`${username} 삭제?`)) { await api.deleteUser(username); await loadData(); } };
    
    const handleBulkApprove = async () => { if (window.confirm(`${selectedPendingUsers.size}명 승인?`)) { for(const u of Array.from(selectedPendingUsers)) await api.approveUser(u as string); setSelectedPendingUsers(new Set()); await loadData(); } };
    const handleBulkReject = async () => { if (window.confirm(`${selectedPendingUsers.size}명 거절?`)) { for(const u of Array.from(selectedPendingUsers)) await api.deleteUser(u as string); setSelectedPendingUsers(new Set()); await loadData(); } };

    const handleRemoveFertilizer = async (index: number) => {
        if (window.confirm('삭제하시겠습니까?')) {
            const newList = [...masterFertilizers];
            newList.splice(index, 1);
            await api.saveFertilizers('admin', newList);
            setMasterFertilizers(newList);
        }
    };

    const openAddModal = () => { setEditingFertilizerIndex(null); setNewFertilizer({ type: '완효성', usage: '그린' }); setIsAddFertilizerModalOpen(true); };
    const openEditModal = (index: number, fertilizer: Fertilizer) => { setEditingFertilizerIndex(index); setNewFertilizer({ ...fertilizer }); setIsAddFertilizerModalOpen(true); };

    const handleSaveFertilizer = async (dataOverride?: Partial<Fertilizer>) => {
        const dataToSave = dataOverride || newFertilizer;
        if (!dataToSave.name || !dataToSave.unit || !dataToSave.rate) { if (!dataOverride) alert('필수 정보 입력 필요'); return; }
        const fertilizerData: Fertilizer = {
            name: dataToSave.name || '', usage: (dataToSave.usage || '그린') as any, type: dataToSave.type || '완효성',
            N: Number(dataToSave.N || 0), P: Number(dataToSave.P || 0), K: Number(dataToSave.K || 0),
            Ca: Number(dataToSave.Ca || 0), Mg: Number(dataToSave.Mg || 0), S: Number(dataToSave.S || 0),
            Fe: Number(dataToSave.Fe || 0), Mn: Number(dataToSave.Mn || 0), Zn: Number(dataToSave.Zn || 0),
            Cu: Number(dataToSave.Cu || 0), B: Number(dataToSave.B || 0), Mo: Number(dataToSave.Mo || 0),
            Cl: Number(dataToSave.Cl || 0), Na: Number(dataToSave.Na || 0), Si: Number(dataToSave.Si || 0),
            Ni: Number(dataToSave.Ni || 0), Co: Number(dataToSave.Co || 0), V: Number(dataToSave.V || 0),
            aminoAcid: Number(dataToSave.aminoAcid || 0), price: Number(dataToSave.price || 0), unit: dataToSave.unit || '', rate: dataToSave.rate || '',
            stock: dataToSave.stock || 0, imageUrl: dataToSave.imageUrl, lowStockAlertEnabled: dataToSave.lowStockAlertEnabled, description: dataToSave.description
        };
        const newList = [...masterFertilizers];
        if (editingFertilizerIndex !== null) newList[editingFertilizerIndex] = fertilizerData; else newList.push(fertilizerData);
        await api.saveFertilizers('admin', newList);
        setMasterFertilizers(newList);
        if(!dataOverride) setIsAddFertilizerModalOpen(false);
    };

    const handleBulkSave = async () => {
        const newList = [...masterFertilizers, ...bulkPreviewData];
        await api.saveFertilizers('admin', newList);
        setMasterFertilizers(newList);
        setBulkPreviewData([]);
        setIsBulkModalOpen(false);
    };

    const processAiRequest = async (promptText: string, inlineDataParts: any[] = []) => {
        setIsAiFillLoading(true); setAiError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY as string) });
            const prompt = `Analyze fertilizer info. Output JSON array or object. Schema: {name, usage: '그린'|'티'|'페어웨이', type, unit, price, rate, description, N, P, K, Ca, Mg, S, Fe, Mn, Zn, Cu, B, Mo, Cl, Na, Si, Ni, Co, V, aminoAcid}. Input: ${promptText}`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }, ...inlineDataParts] } });
            let text = response.text || '';
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(text);
            
            if (Array.isArray(data)) {
                setBulkPreviewData(data.map((item:any) => ({...item, N:Number(item.N||0), P:Number(item.P||0), K:Number(item.K||0), price:Number(item.price||0)})));
                setIsBulkModalOpen(true); setIsAddFertilizerModalOpen(false);
            } else {
                const parsed = { ...newFertilizer, ...data, N:Number(data.N||0), P:Number(data.P||0), K:Number(data.K||0) };
                setNewFertilizer(parsed);
                if (autoSaveAfterAi) await handleSaveFertilizer(parsed);
            }
        } catch (e: any) { setAiError(e.message); } finally { setIsAiFillLoading(false); }
    };

    const SortIcon = ({ field }: { field: keyof UserDataSummary }) => {
        if (userSortField !== field) return <span className="text-slate-300 ml-1">↕</span>;
        return <span className="text-blue-600 ml-1">{userSortOrder === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
                    <div><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DashboardIcon /> 관리자 대시보드</h1></div>
                    <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-md hover:bg-slate-300"><LogoutIcon /> 로그아웃</button>
                </header>
                {/* Pending Users */}
                {pendingUsersList.length > 0 && (
                    <section className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-lg shadow-md">
                        <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold text-amber-800">⏳ 승인 대기 ({pendingUsersList.length})</h2></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{pendingUsersList.map(u => (<div key={u.username} className="bg-white p-4 rounded-lg shadow-sm border"><h3 className="font-bold">{u.username}</h3><p>{u.golfCourse}</p><div className="flex gap-2 mt-2"><button onClick={() => handleApproveUser(u.username)} className="flex-1 bg-green-500 text-white py-1 rounded">승인</button><button onClick={() => handleDeleteUser(u.username)} className="flex-1 bg-white border border-red-200 text-red-500 py-1 rounded">거절</button></div></div>))}</div>
                    </section>
                )}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="flex border-b"><button className={`flex-1 py-4 font-bold ${activeTab === 'users' ? 'bg-slate-50 text-blue-600' : 'text-slate-500'}`} onClick={() => setActiveTab('users')}>사용자 관리</button><button className={`flex-1 py-4 font-bold ${activeTab === 'fertilizers' ? 'bg-slate-50 text-green-600' : 'text-slate-500'}`} onClick={() => setActiveTab('fertilizers')}>비료 관리</button></div>
                    <div className="p-6">
                        {activeTab === 'users' ? (
                            <div><table className="w-full text-sm text-left"><thead className="bg-slate-100"><tr><th className="p-3" onClick={() => handleSort('golfCourse')}>골프장 <SortIcon field="golfCourse" /></th><th className="p-3" onClick={() => handleSort('username')}>이름 <SortIcon field="username" /></th><th className="p-3">활동</th><th className="p-3">관리</th></tr></thead><tbody>{processedUsers.map(u => (<tr key={u.username} className="hover:bg-slate-50"><td className="p-3">{u.golfCourse}</td><td className="p-3">{u.username}</td><td className="p-3">{u.lastActivity}</td><td className="p-3 flex gap-2"><button onClick={() => setSelectedUserForDetail(u)} className="text-blue-500 border px-2 rounded">상세</button><button onClick={() => handleDeleteUser(u.username)} className="text-red-500"><TrashIcon /></button></td></tr>))}</tbody></table></div>
                        ) : (
                            <div>
                                <div className="flex justify-between mb-4"><h3 className="font-bold">목록 ({masterFertilizers.length})</h3><button onClick={openAddModal} className="bg-green-600 text-white px-3 py-2 rounded flex items-center gap-2"><PlusIcon /> 추가</button></div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{masterFertilizers.map((f, idx) => (<div key={idx} className="border p-4 rounded bg-white relative group"><div className="absolute top-2 right-2 hidden group-hover:flex gap-1"><button onClick={() => openEditModal(idx, f)} className="p-1 text-blue-500"><PencilIcon /></button><button onClick={() => handleRemoveFertilizer(idx)} className="p-1 text-red-500"><TrashIcon /></button></div><h4 className="font-bold">{f.name}</h4><p className="text-xs text-slate-500">{f.usage} | {f.type}</p><p className="text-xs">{f.N}-{f.P}-{f.K}</p></div>))}</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {selectedUserForDetail && <UserDetailModal userData={selectedUserForDetail} onClose={() => setSelectedUserForDetail(null)} onDataUpdate={loadData} />}
            {isAddFertilizerModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between mb-4"><h3 className="font-bold">{editingFertilizerIndex !== null ? '수정' : '추가'}</h3><button onClick={() => setIsAddFertilizerModalOpen(false)}><CloseIcon /></button></div>
                        {/* AI Input */}
                        <div className="bg-purple-50 p-4 rounded mb-4">
                            <div className="flex gap-2 mb-2"><button onClick={() => setAiSmartTab('text')} className="text-xs font-bold text-purple-700">텍스트</button><button onClick={() => setAiSmartTab('file')} className="text-xs font-bold text-purple-700">파일</button></div>
                            {aiSmartTab === 'text' ? <div className="flex gap-2"><input type="text" className="border w-full p-2 text-sm" value={aiInputText} onChange={e => setAiInputText(e.target.value)} placeholder="AI 자동 입력..." /><button onClick={() => processAiRequest(aiInputText)} disabled={isAiFillLoading} className="bg-purple-600 text-white px-2 rounded text-xs">{isAiFillLoading ? '...' : <SparklesIcon />}</button></div> : <input type="file" onChange={(e) => { /* Handle file */ }} />}
                        </div>
                        <div className="space-y-2">
                            <input type="text" className="border w-full p-2" placeholder="제품명" value={newFertilizer.name} onChange={e => setNewFertilizer({...newFertilizer, name: e.target.value})} />
                            <div className="grid grid-cols-2 gap-2">
                                <select className="border p-2" value={newFertilizer.usage} onChange={e => setNewFertilizer({...newFertilizer, usage: e.target.value as any})}><option value="그린">그린</option><option value="티">티</option><option value="페어웨이">페어웨이</option></select>
                                <input type="text" className="border p-2" placeholder="타입" value={newFertilizer.type} onChange={e => setNewFertilizer({...newFertilizer, type: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-3 gap-2"><input type="number" className="border p-2" placeholder="N" value={newFertilizer.N} onChange={e => setNewFertilizer({...newFertilizer, N: Number(e.target.value)})} /><input type="number" className="border p-2" placeholder="P" value={newFertilizer.P} onChange={e => setNewFertilizer({...newFertilizer, P: Number(e.target.value)})} /><input type="number" className="border p-2" placeholder="K" value={newFertilizer.K} onChange={e => setNewFertilizer({...newFertilizer, K: Number(e.target.value)})} /></div>
                            <input type="text" className="border w-full p-2" placeholder="권장량 (예: 20g/㎡)" value={newFertilizer.rate} onChange={e => setNewFertilizer({...newFertilizer, rate: e.target.value})} />
                            <input type="text" className="border w-full p-2" placeholder="포장 (예: 20kg)" value={newFertilizer.unit} onChange={e => setNewFertilizer({...newFertilizer, unit: e.target.value})} />
                            <input type="number" className="border w-full p-2" placeholder="가격" value={newFertilizer.price} onChange={e => setNewFertilizer({...newFertilizer, price: Number(e.target.value)})} />
                            <button onClick={() => handleSaveFertilizer()} className="w-full bg-blue-600 text-white py-2 rounded font-bold">저장</button>
                        </div>
                    </div>
                </div>
            )}
            {isBulkModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold mb-4">대량 등록 미리보기 ({bulkPreviewData.length})</h3>
                        <table className="w-full text-sm mb-4"><thead className="bg-slate-100"><tr><th>이름</th><th>용도</th><th>NPK</th></tr></thead><tbody>{bulkPreviewData.map((d,i)=>(<tr key={i}><td>{d.name}</td><td>{d.usage}</td><td>{d.N}-{d.P}-{d.K}</td></tr>))}</tbody></table>
                        <div className="flex justify-end gap-2"><button onClick={() => setIsBulkModalOpen(false)} className="border px-4 py-2 rounded">취소</button><button onClick={handleBulkSave} className="bg-blue-600 text-white px-4 py-2 rounded">일괄 등록</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};