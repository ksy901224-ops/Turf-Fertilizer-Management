
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { UserDataSummary, Fertilizer, LogEntry, User } from './types';
import { LogoutIcon, DashboardIcon, UsersIcon, PlusIcon, TrashIcon, CloseIcon, ClipboardListIcon, CameraIcon, DocumentSearchIcon, UploadIcon, SparklesIcon, DownloadIcon, PencilIcon, BellIcon } from './icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FERTILIZER_TYPE_GROUPS } from './constants';
import { LoadingSpinner } from './LoadingSpinner';

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
            '날짜': log.date, '사용자': userData.username, '골프장': userData.golfCourse, '제품명': log.product, '구분': log.usage, '면적(㎡)': log.area, '사용량': `${log.applicationRate}${log.applicationUnit}`, '총 비용(원)': Math.round(log.totalCost),
        };
        const NUTRIENTS = ['N','P','K','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo','Cl','Na','Si','Ni','Co','V'];
        NUTRIENTS.forEach(n => { if (log.nutrients && log.nutrients[n] > 0) { row[`${n} (g)`] = log.nutrients[n]; } });
        return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '시비 일지');
    XLSX.writeFile(workbook, `${userData.username}_${userData.golfCourse}_시비일지.xlsx`);
};

// --- User Detail Modal ---
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface UserDetailModalProps {
    userData: UserDataSummary;
    onClose: () => void;
    onDataUpdate: () => void; 
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ userData, onClose, onDataUpdate }) => {
    const [activeTab, setActiveTab] = useState<'analytics' | 'logs'>('analytics');
    const [statsView, setStatsView] = useState<'monthly' | 'daily' | 'yearly'>('monthly');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [logs, setLogs] = useState<LogEntry[]>(userData.logs || []);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<Partial<LogEntry>>({});

    useEffect(() => { setLogs(userData.logs || []); }, [userData]);

    const productStats = useMemo(() => {
        const stats: Record<string, { count: number, totalCost: number, totalAmount: number, unitHint: string, name: string }> = {};
        logs.forEach(log => {
            if (!stats[log.product]) stats[log.product] = { count: 0, totalCost: 0, totalAmount: 0, unitHint: '', name: log.product };
            stats[log.product].count += 1; stats[log.product].totalCost += log.totalCost;
            stats[log.product].totalAmount += (log.area * log.applicationRate) / 1000;
            if (!stats[log.product].unitHint) stats[log.product].unitHint = log.applicationUnit.includes('ml') ? 'L' : 'kg';
        });
        return Object.values(stats).sort((a, b) => b.totalCost - a.totalCost);
    }, [logs]);
    const mostFrequentProduct = useMemo(() => productStats.length === 0 ? null : [...productStats].sort((a, b) => b.count - a.count)[0], [productStats]);
    const chartDataProductCost = useMemo(() => productStats.slice(0, 5).map(p => ({ name: p.name, value: p.totalCost })), [productStats]);
    
    const timeStats = useMemo(() => {
        const monthly: Record<string, number> = {}; const yearly: Record<string, number> = {}; const daily: Record<string, number> = {};
        logs.forEach(log => {
            const date = new Date(log.date); const y = date.getFullYear().toString();
            if (selectedYear !== 'all' && y !== selectedYear) return;
            const m = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            yearly[y] = (yearly[y] || 0) + log.totalCost; monthly[m] = (monthly[m] || 0) + log.totalCost; daily[log.date] = (daily[log.date] || 0) + log.totalCost;
        });
        return { 
            monthly: Object.entries(monthly).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period)),
            yearly: Object.entries(yearly).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period)),
            daily: Object.entries(daily).map(([k, v]) => ({ period: k, cost: v })).sort((a, b) => a.period.localeCompare(b.period))
        };
    }, [logs, selectedYear]);
    const annualUsageStats = useMemo(() => {
        const stats: Record<string, { totalAmount: number, unit: string, cost: number, count: number }> = {};
        logs.forEach(log => {
            const date = new Date(log.date); const y = date.getFullYear().toString();
            if (selectedYear !== 'all' && y !== selectedYear) return;
            if (!stats[log.product]) { const unit = log.applicationUnit.includes('ml') ? 'L' : 'kg'; stats[log.product] = { totalAmount: 0, unit, cost: 0, count: 0 }; }
            const amount = (log.area * log.applicationRate) / 1000;
            stats[log.product].totalAmount += amount; stats[log.product].cost += log.totalCost; stats[log.product].count += 1;
        });
        return Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [logs, selectedYear]);
    const availableYears = useMemo(() => Array.from(new Set(logs.map(l => new Date(l.date).getFullYear().toString()))).sort().reverse(), [logs]);
    const formatXAxis = (tick: string) => statsView === 'monthly' || statsView === 'daily' ? tick.slice(5) : tick;

    const handleDeleteLog = async (logId: string) => {
        if(window.confirm('삭제하시겠습니까?')) {
            const updatedLogs = logs.filter(l => l.id !== logId);
            setLogs(updatedLogs);
            await api.saveLog(userData.username, updatedLogs);
            onDataUpdate();
        }
    };
    const startEditingLog = (log: LogEntry) => { setEditingLogId(log.id); setEditFormData({ ...log }); };
    const saveEditedLog = async () => {
        if (!editingLogId) return;
        const updatedLogs = logs.map(l => l.id === editingLogId ? { ...l, ...editFormData } as LogEntry : l);
        setLogs(updatedLogs);
        await api.saveLog(userData.username, updatedLogs);
        setEditingLogId(null); setEditFormData({});
        onDataUpdate();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{userData.username} ({userData.golfCourse})</h2>
                        <span className={`text-xs px-2 py-1 rounded-full ${userData.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{userData.role === 'admin' ? '관리자' : '사용자'}</span>
                    </div>
                    <div className="flex gap-2"><button onClick={() => exportUserLogsToExcel({ ...userData, logs })} className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded"><DownloadIcon className="w-4 h-4"/> 엑셀 저장</button><button onClick={onClose}><CloseIcon /></button></div>
                </div>
                <div className="flex border-b bg-white">
                    <button className={`flex-1 py-3 font-bold ${activeTab==='analytics'?'text-blue-600 border-b-2 border-blue-600':'text-slate-500'}`} onClick={()=>setActiveTab('analytics')}>📊 데이터 분석</button>
                    <button className={`flex-1 py-3 font-bold ${activeTab==='logs'?'text-purple-600 border-b-2 border-purple-600':'text-slate-500'}`} onClick={()=>setActiveTab('logs')}>📝 일지 관리</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'analytics' ? (
                        <>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-blue-50 p-4 rounded border-blue-100"><h4 className="text-xs font-bold">비용</h4><p className="text-xl font-bold">{Math.round(userData.totalCost).toLocaleString()}</p></div>
                                <div className="bg-green-50 p-4 rounded border-green-100"><h4 className="text-xs font-bold">최빈 사용</h4><p className="truncate font-bold">{mostFrequentProduct?.name}</p></div>
                                <div className="bg-orange-50 p-4 rounded border-orange-100"><h4 className="text-xs font-bold">최고 지출</h4><p className="truncate font-bold">{productStats[0]?.name}</p></div>
                                <div className="bg-purple-50 p-4 rounded border-purple-100"><h4 className="text-xs font-bold">제품 수</h4><p className="text-xl font-bold">{productStats.length}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-white p-4 rounded border"><div className="h-64"><ResponsiveContainer><BarChart data={timeStats[statsView]}><XAxis dataKey="period" tickFormatter={formatXAxis}/><YAxis/><Tooltip/><Bar dataKey="cost" fill="#3b82f6"/></BarChart></ResponsiveContainer></div></div>
                                <div className="bg-white p-4 rounded border"><div className="h-64"><ResponsiveContainer><PieChart><Pie data={chartDataProductCost} cx="50%" cy="50%" innerRadius={40} outerRadius={80} fill="#8884d8" dataKey="value" paddingAngle={5}>{chartDataProductCost.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div></div>
                            </div>
                            <div className="bg-white border rounded overflow-hidden"><div className="p-4 bg-slate-50 font-bold border-b">연간 사용량</div><div className="max-h-60 overflow-y-auto"><table className="w-full text-sm"><thead><tr><th>제품</th><th className="text-right">량</th><th className="text-right">비용</th></tr></thead><tbody>{annualUsageStats.map((i,idx)=><tr key={idx}><td className="p-2">{i.name}</td><td className="p-2 text-right">{i.totalAmount.toFixed(1)}{i.unit}</td><td className="p-2 text-right">{Math.round(i.cost).toLocaleString()}</td></tr>)}</tbody></table></div></div>
                        </>
                    ) : (
                        <div className="bg-white rounded border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 font-bold"><tr><th className="p-3">날짜</th><th className="p-3">제품</th><th className="p-3 text-right">관리</th></tr></thead>
                                    <tbody>{logs.map(log => (
                                        <tr key={log.id} className="border-b hover:bg-slate-50">
                                            {editingLogId === log.id ? (
                                                <><td className="p-2"><input type="date" value={editFormData.date} onChange={e=>setEditFormData({...editFormData, date:e.target.value})} className="border p-1"/></td><td className="p-2"><input value={editFormData.product} onChange={e=>setEditFormData({...editFormData, product:e.target.value})} className="border p-1 w-full"/></td><td className="p-2 text-right"><button onClick={saveEditedLog} className="text-green-600 mr-2">저장</button><button onClick={()=>setEditingLogId(null)}>취소</button></td></>
                                            ) : (
                                                <><td className="p-3">{log.date}</td><td className="p-3">{log.product}</td><td className="p-3 text-right"><button onClick={()=>startEditingLog(log)} className="mr-2"><PencilIcon className="w-4 h-4 text-blue-500"/></button><button onClick={()=>handleDeleteLog(log.id)}><TrashIcon className="w-4 h-4 text-red-500"/></button></td></>
                                            )}
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        </div>
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
    
    // Fertilizer Mgmt
    const [isAddFertilizerModalOpen, setIsAddFertilizerModalOpen] = useState(false);
    const [editingFertilizerIndex, setEditingFertilizerIndex] = useState<number | null>(null);
    const [newFertilizer, setNewFertilizer] = useState<Partial<Fertilizer>>({ type: '완효성', usage: '그린' });
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkPreviewData, setBulkPreviewData] = useState<Fertilizer[]>([]);

    // Search/Sort
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [userSortField, setUserSortField] = useState<keyof UserDataSummary>('lastActivity');
    const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');

    // AI
    const [aiInputText, setAiInputText] = useState('');
    const [isAiFillLoading, setIsAiFillLoading] = useState(false);
    const [aiSmartTab, setAiSmartTab] = useState<'text' | 'file'>('text');
    const [aiError, setAiError] = useState<string | null>(null);
    const [autoSaveAfterAi, setAutoSaveAfterAi] = useState(false);

    // Refs
    const pendingSectionRef = useRef<HTMLElement>(null);

    // --- Real-time Subscription ---
    useEffect(() => {
        setIsLoading(true);
        const unsubUsers = api.subscribeToUsers(async (users) => {
            // We need detailed data for summaries
            const fullData = await api.getAllUsersData();
            setAllUsersData(fullData);
        });
        const unsubAppData = api.subscribeToAllAppData((updatedData) => {
            // When app data changes, refresh master fertilizers if admin data changed
            const adminData = updatedData['admin'];
            if (adminData && adminData.fertilizers) {
                setMasterFertilizers(adminData.fertilizers);
            }
            setIsLoading(false);
        });
        return () => { unsubUsers(); unsubAppData(); };
    }, []);

    // Derived Data
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
                case 'lastActivity': comparison = (a.lastActivity ? new Date(a.lastActivity).getTime() : 0) - (b.lastActivity ? new Date(b.lastActivity).getTime() : 0); break;
                default: comparison = String(a[userSortField] || '').localeCompare(String(b[userSortField] || ''));
            }
            return userSortOrder === 'asc' ? comparison : -comparison;
        });
        return data;
    }, [approvedUsersList, userSearchTerm, userSortField, userSortOrder]);

    // Actions
    const handleApproveUser = async (username: string) => {
        if (window.confirm(`${username} 승인?`)) {
            await api.approveUser(username);
            setSelectedPendingUsers(prev => { const next = new Set(prev); next.delete(username); return next; });
        }
    };
    const handleDeleteUser = async (username: string) => {
        if (window.confirm(`${username} 삭제?`)) {
            await api.deleteUser(username);
            setSelectedPendingUsers(prev => { const next = new Set(prev); next.delete(username); return next; });
        }
    };
    const toggleSelectAllPending = () => {
        if (selectedPendingUsers.size === pendingUsersList.length) setSelectedPendingUsers(new Set());
        else setSelectedPendingUsers(new Set(pendingUsersList.map(u => u.username)));
    };
    const handleBulkApprove = async () => {
        if (window.confirm(`선택한 ${selectedPendingUsers.size}명 승인?`)) {
            for (const username of Array.from(selectedPendingUsers)) await api.approveUser(username);
            setSelectedPendingUsers(new Set());
        }
    };
    const handleBulkReject = async () => {
        if (window.confirm(`선택한 ${selectedPendingUsers.size}명 거절?`)) {
            for (const username of Array.from(selectedPendingUsers)) await api.deleteUser(username);
            setSelectedPendingUsers(new Set());
        }
    };
    const scrollToPending = () => {
        if (pendingSectionRef.current) {
            pendingSectionRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Fertilizer actions...
    const handleSaveFertilizer = async (dataOverride?: Partial<Fertilizer>) => {
        const dataToSave = dataOverride || newFertilizer;
        if (!dataToSave.name) return;
        const fertilizerData: Fertilizer = { 
            name: dataToSave.name || '', usage: dataToSave.usage || '그린', type: dataToSave.type || '완효성',
            N: Number(dataToSave.N||0), P: Number(dataToSave.P||0), K: Number(dataToSave.K||0),
            Ca: Number(dataToSave.Ca||0), Mg: Number(dataToSave.Mg||0), S: Number(dataToSave.S||0), Fe: Number(dataToSave.Fe||0), Mn: Number(dataToSave.Mn||0), Zn: Number(dataToSave.Zn||0), Cu: Number(dataToSave.Cu||0), B: Number(dataToSave.B||0), Mo: Number(dataToSave.Mo||0), Cl: Number(dataToSave.Cl||0), Na: Number(dataToSave.Na||0), Si: Number(dataToSave.Si||0), Ni: Number(dataToSave.Ni||0), Co: Number(dataToSave.Co||0), V: Number(dataToSave.V||0), aminoAcid: Number(dataToSave.aminoAcid||0),
            price: Number(dataToSave.price||0), unit: dataToSave.unit||'', rate: dataToSave.rate||'',
            stock: dataToSave.stock || 0, imageUrl: dataToSave.imageUrl || '', lowStockAlertEnabled: dataToSave.lowStockAlertEnabled || false, description: dataToSave.description || ''
        };
        const newList = [...masterFertilizers];
        if (editingFertilizerIndex !== null) newList[editingFertilizerIndex] = fertilizerData;
        else newList.push(fertilizerData);
        await api.saveFertilizers('admin', newList);
        setIsAddFertilizerModalOpen(false); setNewFertilizer({ type: '완효성', usage: '그린' }); setEditingFertilizerIndex(null);
    };
    const handleRemoveFertilizer = async (index: number) => {
        if (window.confirm('삭제하시겠습니까?')) {
            const newList = [...masterFertilizers];
            newList.splice(index, 1);
            await api.saveFertilizers('admin', newList);
        }
    };
    
    // AI Request Handler
    const processAiRequest = async (promptText: string) => {
        setIsAiFillLoading(true); setAiError(null);
        try {
            // Safely access env var with fallback
            // @ts-ignore
            const apiKey = import.meta.env.VITE_API_KEY || (process.env.API_KEY as string);
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `Analyze fertilizer info and return JSON. Input: ${promptText}`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }] } });
            const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
            if(text) {
                const data = JSON.parse(text);
                if (Array.isArray(data)) { setBulkPreviewData(data); setIsBulkModalOpen(true); setIsAddFertilizerModalOpen(false); }
                else { setNewFertilizer({...newFertilizer, ...data}); if(autoSaveAfterAi) await handleSaveFertilizer({...newFertilizer, ...data}); }
            }
        } catch(e) { 
            console.error(e);
            setAiError('AI Analysis Failed'); 
        } finally { setIsAiFillLoading(false); }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm sticky top-0 z-20">
                    <div><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DashboardIcon /> 관리자 대시보드</h1></div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={scrollToPending}
                            className={`flex items-center gap-2 p-2 rounded-md transition-colors ${pendingUsersList.length > 0 ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'text-slate-400 hover:bg-slate-100'}`}
                            title="승인 대기 알림"
                        >
                            <div className="relative">
                                <BellIcon className="w-6 h-6" />
                                {pendingUsersList.length > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                )}
                            </div>
                            {pendingUsersList.length > 0 && (
                                <span className="text-sm font-bold">
                                    승인 대기: {pendingUsersList.length}명
                                </span>
                            )}
                        </button>
                        <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300"><LogoutIcon /> 로그아웃</button>
                    </div>
                </header>

                {pendingUsersList.length > 0 && (
                    <section ref={pendingSectionRef} className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-lg shadow-md animate-fadeIn scroll-mt-24">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-amber-800">⏳ 승인 대기 중인 사용자 ({pendingUsersList.length})</h2>
                            <div className="flex gap-2">
                                {selectedPendingUsers.size > 0 && (
                                    <>
                                        <button onClick={handleBulkApprove} className="px-3 py-1 bg-green-600 text-white text-xs rounded">선택 승인 ({selectedPendingUsers.size})</button>
                                        <button onClick={handleBulkReject} className="px-3 py-1 bg-red-500 text-white text-xs rounded">선택 거절</button>
                                    </>
                                )}
                                <label className="flex items-center gap-2 text-sm font-semibold text-amber-900 cursor-pointer">
                                    <input type="checkbox" checked={selectedPendingUsers.size === pendingUsersList.length} onChange={toggleSelectAllPending} className="rounded text-amber-600" /> 전체 선택
                                </label>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingUsersList.map(u => (
                                <div key={u.username} className="bg-white p-4 rounded-lg shadow-sm border border-amber-200">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" checked={selectedPendingUsers.has(u.username)} onChange={() => { const s = new Set(selectedPendingUsers); s.has(u.username)?s.delete(u.username):s.add(u.username); setSelectedPendingUsers(s); }} />
                                            <h3 className="font-bold">{u.username}</h3>
                                        </div>
                                        <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">대기 중</span>
                                    </div>
                                    <p className="text-sm text-slate-600 mb-4 ml-6">골프장: {u.golfCourse}</p>
                                    <div className="flex gap-2 ml-6">
                                        <button onClick={() => setSelectedUserForDetail(u)} className="flex-1 bg-blue-50 text-blue-600 py-1 rounded text-sm border border-blue-100 hover:bg-blue-100">상세</button>
                                        <button onClick={() => handleApproveUser(u.username)} className="flex-1 bg-green-500 text-white py-1 rounded text-sm hover:bg-green-600">승인</button>
                                        <button onClick={() => handleDeleteUser(u.username)} className="flex-1 border border-red-200 text-red-500 py-1 rounded text-sm hover:bg-red-50">거절</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="flex border-b">
                        <button className={`flex-1 py-4 font-bold ${activeTab === 'users' ? 'bg-slate-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`} onClick={() => setActiveTab('users')}>사용자 관리</button>
                        <button className={`flex-1 py-4 font-bold ${activeTab === 'fertilizers' ? 'bg-slate-50 text-green-600 border-b-2 border-green-600' : 'text-slate-500'}`} onClick={() => setActiveTab('fertilizers')}>마스터 비료 관리</button>
                    </div>
                    <div className="p-6">
                        {activeTab === 'users' ? (
                            <div className="space-y-4">
                                <div className="flex justify-between gap-4">
                                    <h3 className="font-bold text-slate-700">승인된 사용자 ({processedUsers.length})</h3>
                                    <input type="text" placeholder="검색..." value={userSearchTerm} onChange={e => setUserSearchTerm(e.target.value)} className="border rounded px-3 py-1 text-sm"/>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-100 text-slate-600">
                                            <tr>
                                                <th className="p-3 cursor-pointer" onClick={() => { if(userSortField==='golfCourse') setUserSortOrder(userSortOrder==='asc'?'desc':'asc'); else { setUserSortField('golfCourse'); setUserSortOrder('desc'); } }}>골프장</th>
                                                <th className="p-3 cursor-pointer" onClick={() => { if(userSortField==='username') setUserSortOrder(userSortOrder==='asc'?'desc':'asc'); else { setUserSortField('username'); setUserSortOrder('desc'); } }}>이름</th>
                                                <th className="p-3">권한</th>
                                                <th className="p-3">최근 활동</th>
                                                <th className="p-3">기록 수</th>
                                                <th className="p-3">총 비용</th>
                                                <th className="p-3 text-center">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {processedUsers.map(u => (
                                                <tr key={u.username} className="hover:bg-slate-50 border-b">
                                                    <td className="p-3 font-semibold">{u.golfCourse}</td>
                                                    <td className="p-3">{u.username}</td>
                                                    <td className="p-3">
                                                        <span className={`text-xs px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {u.role === 'admin' ? '관리자' : '사용자'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-500">{u.lastActivity || '-'}</td>
                                                    <td className="p-3">{u.logCount}</td>
                                                    <td className="p-3">{Math.round(u.totalCost).toLocaleString()}</td>
                                                    <td className="p-3 text-center flex justify-center gap-2">
                                                        <button onClick={() => setSelectedUserForDetail(u)} className="text-blue-500 hover:text-blue-700 border border-blue-200 px-2 py-1 rounded text-xs">상세</button>
                                                        <button onClick={() => handleDeleteUser(u.username)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-4 h-4"/></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-700">마스터 비료 ({masterFertilizers.length})</h3>
                                    <button onClick={() => { setEditingFertilizerIndex(null); setIsAddFertilizerModalOpen(true); }} className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded text-sm font-bold"><PlusIcon /> 추가</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {masterFertilizers.map((f, idx) => (
                                        <div key={idx} className="border rounded-lg p-4 bg-white relative group">
                                            <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                                                <button onClick={() => { setEditingFertilizerIndex(idx); setNewFertilizer({...f}); setIsAddFertilizerModalOpen(true); }} className="p-1 hover:text-blue-500"><PencilIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleRemoveFertilizer(idx)} className="p-1 hover:text-red-500"><TrashIcon className="w-4 h-4"/></button>
                                            </div>
                                            <h4 className="font-bold truncate">{f.name}</h4>
                                            <p className="text-xs text-slate-500">{f.usage} | {f.type}</p>
                                            <p className="text-xs mt-1">NPK: {f.N}-{f.P}-{f.K}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {selectedUserForDetail && <UserDetailModal userData={selectedUserForDetail} onClose={() => setSelectedUserForDetail(null)} onDataUpdate={() => {}} />}
            
            {isAddFertilizerModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={() => setIsAddFertilizerModalOpen(false)}>
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold mb-4">{editingFertilizerIndex!==null ? '수정' : '추가'}</h3>
                        <div className="bg-purple-50 p-3 rounded mb-4">
                            <textarea value={aiInputText} onChange={e=>setAiInputText(e.target.value)} placeholder="AI 스마트 입력..." className="w-full border p-2 text-sm h-20 rounded"/>
                            <button onClick={()=>processAiRequest(aiInputText)} disabled={isAiFillLoading} className="mt-2 w-full bg-purple-600 text-white py-1 rounded text-xs">{isAiFillLoading?'분석중...':'AI 자동 채우기'}</button>
                        </div>
                        <div className="space-y-3">
                            <input className="w-full border p-2 rounded" placeholder="제품명" value={newFertilizer.name||''} onChange={e=>setNewFertilizer({...newFertilizer, name:e.target.value})} />
                            <div className="flex gap-2">
                                <select className="border p-2 rounded flex-1" value={newFertilizer.usage} onChange={e=>setNewFertilizer({...newFertilizer, usage:e.target.value as any})}><option>그린</option><option>티</option><option>페어웨이</option></select>
                                <input className="border p-2 rounded flex-1" placeholder="타입" value={newFertilizer.type||''} onChange={e=>setNewFertilizer({...newFertilizer, type:e.target.value})} />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <input type="number" placeholder="N" className="border p-2 rounded" value={newFertilizer.N||0} onChange={e=>setNewFertilizer({...newFertilizer, N:Number(e.target.value)})} />
                                <input type="number" placeholder="P" className="border p-2 rounded" value={newFertilizer.P||0} onChange={e=>setNewFertilizer({...newFertilizer, P:Number(e.target.value)})} />
                                <input type="number" placeholder="K" className="border p-2 rounded" value={newFertilizer.K||0} onChange={e=>setNewFertilizer({...newFertilizer, K:Number(e.target.value)})} />
                            </div>
                            <input className="w-full border p-2 rounded" placeholder="단위 (예: 20kg)" value={newFertilizer.unit||''} onChange={e=>setNewFertilizer({...newFertilizer, unit:e.target.value})} />
                            <input className="w-full border p-2 rounded" placeholder="권장량" value={newFertilizer.rate||''} onChange={e=>setNewFertilizer({...newFertilizer, rate:e.target.value})} />
                            <input type="number" className="w-full border p-2 rounded" placeholder="가격" value={newFertilizer.price||0} onChange={e=>setNewFertilizer({...newFertilizer, price:Number(e.target.value)})} />
                            <button onClick={()=>handleSaveFertilizer()} className="w-full bg-blue-600 text-white py-2 rounded font-bold mt-4">저장</button>
                        </div>
                    </div>
                </div>
            )}
            {isBulkModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={()=>setIsBulkModalOpen(false)}>
                    <div className="bg-white p-6 rounded max-w-xl w-full" onClick={e=>e.stopPropagation()}>
                        <h3>대량 등록 ({bulkPreviewData.length}개)</h3>
                        <div className="max-h-60 overflow-y-auto my-4 border p-2">
                            {bulkPreviewData.map((d,i)=><div key={i} className="text-xs border-b py-1">{d.name} ({d.N}-{d.P}-{d.K})</div>)}
                        </div>
                        <button onClick={async ()=>{ 
                            const newList = [...masterFertilizers, ...bulkPreviewData];
                            await api.saveFertilizers('admin', newList);
                            setIsBulkModalOpen(false); setBulkPreviewData([]);
                        }} className="w-full bg-blue-600 text-white py-2 rounded">확인</button>
                    </div>
                </div>
            )}
        </div>
    );
};
