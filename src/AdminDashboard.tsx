
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { UserDataSummary, Fertilizer, LogEntry, User } from './types';
import { LogoutIcon, DashboardIcon, UsersIcon, PlusIcon, TrashIcon, CloseIcon, ClipboardListIcon, CameraIcon, DocumentSearchIcon, UploadIcon, SparklesIcon, DownloadIcon, PencilIcon } from './icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FERTILIZER_TYPE_GROUPS } from './constants';
import { LoadingSpinner } from './LoadingSpinner';

interface AdminDashboardProps {
    user: string;
    onLogout: () => void;
}

// ... (Helper for Excel Export - same as before) ...
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

// ... (UserDetailModal - same logic, updated typing if needed) ...
// Included directly to ensure file completeness
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface UserDetailModalProps {
    userData: UserDataSummary;
    onClose: () => void;
    onDataUpdate: () => void; // Keeps the signature, even if real-time makes manual refresh less critical
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ userData, onClose }) => {
    // ... (Detail Modal Logic remains mostly display-only, handling logs) ...
    const [activeTab, setActiveTab] = useState<'analytics' | 'logs'>('analytics');
    const [statsView, setStatsView] = useState<'monthly' | 'daily' | 'yearly'>('monthly');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [logs, setLogs] = useState<LogEntry[]>(userData.logs || []);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<Partial<LogEntry>>({});

    useEffect(() => { setLogs(userData.logs || []); }, [userData]);

    // ... (Calculations: productStats, timeStats, etc. - Identical logic) ...
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
    const availableYears = useMemo(() => Array.from(new Set(logs.map(l => new Date(l.date).getFullYear().toString()))).sort().reverse(), [logs]);
    const formatXAxis = (tick: string) => statsView === 'monthly' || statsView === 'daily' ? tick.slice(5) : tick;

    // Log Editing
    const handleDeleteLog = async (logId: string) => {
        if(window.confirm('삭제하시겠습니까?')) {
            const updatedLogs = logs.filter(l => l.id !== logId);
            await api.saveLog(userData.username, updatedLogs);
            // Real-time listener in parent will update 'userData', triggering useEffect above
        }
    };
    const startEditingLog = (log: LogEntry) => { setEditingLogId(log.id); setEditFormData({ ...log }); };
    const saveEditedLog = async () => {
        if (!editingLogId) return;
        const updatedLogs = logs.map(l => l.id === editingLogId ? { ...l, ...editFormData } as LogEntry : l);
        await api.saveLog(userData.username, updatedLogs);
        setEditingLogId(null); setEditFormData({});
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div><h2 className="text-xl font-bold text-slate-800">{userData.username} ({userData.golfCourse})</h2></div>
                    <div className="flex gap-2"><button onClick={onClose}><CloseIcon /></button></div>
                </div>
                <div className="flex border-b bg-white">
                    <button className={`flex-1 py-3 ${activeTab==='analytics'?'text-blue-600 border-b-2 border-blue-600':''}`} onClick={()=>setActiveTab('analytics')}>분석</button>
                    <button className={`flex-1 py-3 ${activeTab==='logs'?'text-purple-600 border-b-2 border-purple-600':''}`} onClick={()=>setActiveTab('logs')}>일지 관리</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'analytics' ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-blue-50 p-4 rounded border-blue-100"><h4 className="text-xs font-bold">비용</h4><p className="text-xl font-bold">{Math.round(userData.totalCost).toLocaleString()}</p></div>
                                <div className="bg-green-50 p-4 rounded border-green-100"><h4 className="text-xs font-bold">최빈 사용</h4><p className="truncate font-bold">{mostFrequentProduct?.name}</p></div>
                            </div>
                            <div className="h-64"><ResponsiveContainer><BarChart data={timeStats[statsView]}><XAxis dataKey="period" tickFormatter={formatXAxis}/><YAxis/><Tooltip/><Bar dataKey="cost" fill="#3b82f6"/></BarChart></ResponsiveContainer></div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr><th className="p-2 text-left">날짜</th><th className="p-2 text-left">제품</th><th className="p-2 text-right">관리</th></tr></thead>
                                <tbody>{logs.map(log => (
                                    <tr key={log.id} className="border-b">
                                        {editingLogId === log.id ? (
                                            <>
                                                <td className="p-2"><input type="date" value={editFormData.date} onChange={e=>setEditFormData({...editFormData, date:e.target.value})} className="border p-1"/></td>
                                                <td className="p-2"><input value={editFormData.product} onChange={e=>setEditFormData({...editFormData, product:e.target.value})} className="border p-1 w-full"/></td>
                                                <td className="p-2 text-right"><button onClick={saveEditedLog} className="text-green-600 mr-2">저장</button><button onClick={()=>setEditingLogId(null)}>취소</button></td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="p-2">{log.date}</td><td className="p-2">{log.product}</td>
                                                <td className="p-2 text-right"><button onClick={()=>startEditingLog(log)} className="mr-2"><PencilIcon className="w-4 h-4 text-blue-500"/></button><button onClick={()=>handleDeleteLog(log.id)}><TrashIcon className="w-4 h-4 text-red-500"/></button></td>
                                            </>
                                        )}
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    // State
    const [users, setUsers] = useState<User[]>([]);
    const [appDataMap, setAppDataMap] = useState<Record<string, any>>({});
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [selectedPendingUsers, setSelectedPendingUsers] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<'users' | 'fertilizers'>('users');
    const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserDataSummary | null>(null);
    
    // Fertilizer Mgmt State
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

    // --- Real-time Subscription Setup ---
    useEffect(() => {
        setIsLoading(true);
        // Subscribe to Users
        const unsubUsers = api.subscribeToUsers((updatedUsers) => {
            setUsers(updatedUsers);
        });

        // Subscribe to All App Data
        const unsubAppData = api.subscribeToAllAppData((updatedData) => {
            setAppDataMap(updatedData);
            
            // Extract Master Fertilizers from admin's data
            const adminData = updatedData['admin'];
            if (adminData && adminData.fertilizers) {
                setMasterFertilizers(adminData.fertilizers);
            }
            setIsLoading(false);
        });

        return () => {
            unsubUsers();
            unsubAppData();
        };
    }, []);

    // Combine Users and AppData into Summary
    const allUsersData: UserDataSummary[] = useMemo(() => {
        return users
            .filter(u => u.username !== 'admin')
            .map(u => {
                const data = appDataMap[u.username] || { logs: [], fertilizers: [] };
                const logs = data.logs || [];
                const totalCost = logs.reduce((sum: number, l: LogEntry) => sum + (l.totalCost || 0), 0);
                const lastActivity = logs.length > 0 ? [...logs].sort((a: LogEntry, b: LogEntry) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : null;
                
                return {
                    username: u.username,
                    golfCourse: u.golfCourse,
                    isApproved: u.isApproved,
                    role: u.role,
                    logCount: logs.length,
                    totalCost,
                    lastActivity,
                    logs: logs.sort((a: LogEntry, b: LogEntry) => new Date(b.date).getTime() - new Date(a.date).getTime()),
                    fertilizers: data.fertilizers || []
                };
            });
    }, [users, appDataMap]);

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

    // --- Actions ---
    const handleApproveUser = async (username: string) => {
        if (window.confirm(`${username} 승인?`)) await api.approveUser(username);
    };
    const handleDeleteUser = async (username: string) => {
        if (window.confirm(`${username} 삭제?`)) await api.deleteUser(username);
    };
    const handleSort = (field: keyof UserDataSummary) => {
        if (userSortField === field) setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
        else { setUserSortField(field); setUserSortOrder('desc'); }
    };
    
    // --- Fertilizer Actions (Same as before, using api.saveFertilizers) ---
    const handleSaveFertilizer = async (dataOverride?: Partial<Fertilizer>) => {
        const dataToSave = dataOverride || newFertilizer;
        if (!dataToSave.name) return;
        const fertilizerData: Fertilizer = { ...dataToSave } as Fertilizer; // Simplified for brevity
        // Ensure default fields
        fertilizerData.usage = fertilizerData.usage || '그린';
        fertilizerData.type = fertilizerData.type || '완효성';
        
        const newList = [...masterFertilizers];
        if (editingFertilizerIndex !== null) newList[editingFertilizerIndex] = fertilizerData;
        else newList.push(fertilizerData);
        
        await api.saveFertilizers('admin', newList);
        setIsAddFertilizerModalOpen(false);
        setNewFertilizer({ type: '완효성', usage: '그린' });
        setEditingFertilizerIndex(null);
    };

    const handleRemoveFertilizer = async (index: number) => {
        if (window.confirm('삭제하시겠습니까?')) {
            const newList = [...masterFertilizers];
            newList.splice(index, 1);
            await api.saveFertilizers('admin', newList);
        }
    };

    // AI Logic (Condensed)
    const processAiRequest = async (promptText: string) => {
        setIsAiFillLoading(true); setAiError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Analyze fertilizer info and return JSON array/object. Schema: {name, usage, type, unit, price, rate, description, N, P, K...}. Input: ${promptText}`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }] } });
            const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
            if(text) {
                const data = JSON.parse(text);
                if (Array.isArray(data)) { setBulkPreviewData(data); setIsBulkModalOpen(true); setIsAddFertilizerModalOpen(false); }
                else { setNewFertilizer({...newFertilizer, ...data}); if(autoSaveAfterAi) await handleSaveFertilizer({...newFertilizer, ...data}); }
            }
        } catch(e) { setAiError('AI Error'); } finally { setIsAiFillLoading(false); }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
                    <div><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DashboardIcon /> 관리자 대시보드</h1></div>
                    <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300"><LogoutIcon /> 로그아웃</button>
                </header>

                {/* Pending List */}
                {pendingUsersList.length > 0 && (
                    <section className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-lg shadow-md animate-fadeIn">
                        <h2 className="text-xl font-bold text-amber-800 mb-4">⏳ 승인 대기 중인 사용자 ({pendingUsersList.length})</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingUsersList.map(u => (
                                <div key={u.username} className="bg-white p-4 rounded-lg shadow-sm border border-amber-200">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg">{u.username}</h3>
                                        <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">대기 중</span>
                                    </div>
                                    <p className="text-sm text-slate-600 mb-4">골프장: {u.golfCourse}</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleApproveUser(u.username)} className="flex-1 bg-green-500 text-white py-1 rounded text-sm">승인</button>
                                        <button onClick={() => handleDeleteUser(u.username)} className="flex-1 border border-red-200 text-red-500 py-1 rounded text-sm">거절</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Tabs */}
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
                                                <th className="p-3 cursor-pointer" onClick={() => handleSort('golfCourse')}>골프장</th>
                                                <th className="p-3 cursor-pointer" onClick={() => handleSort('username')}>이름</th>
                                                <th className="p-3 cursor-pointer" onClick={() => handleSort('lastActivity')}>최근 활동</th>
                                                <th className="p-3 cursor-pointer" onClick={() => handleSort('logCount')}>기록 수</th>
                                                <th className="p-3 cursor-pointer" onClick={() => handleSort('totalCost')}>총 비용</th>
                                                <th className="p-3 text-center">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {processedUsers.map(u => (
                                                <tr key={u.username} className="hover:bg-slate-50 border-b">
                                                    <td className="p-3 font-semibold">{u.golfCourse}</td>
                                                    <td className="p-3">{u.username}</td>
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
            
            {/* Modals */}
            {selectedUserForDetail && <UserDetailModal userData={selectedUserForDetail} onClose={() => setSelectedUserForDetail(null)} onDataUpdate={() => {}} />}
            
            {isAddFertilizerModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={() => setIsAddFertilizerModalOpen(false)}>
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold mb-4">{editingFertilizerIndex!==null ? '수정' : '추가'}</h3>
                        
                        {/* AI Input Block */}
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
