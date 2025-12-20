
import React, { useState, useEffect, useMemo } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { UserDataSummary, Fertilizer, LogEntry } from './types';
import { 
  LogoutIcon, 
  DashboardIcon, 
  UsersIcon, 
  PlusIcon, 
  TrashIcon, 
  CloseIcon, 
  ClipboardListIcon, 
  SparklesIcon, 
  PencilIcon, 
  BellIcon,
  DownloadIcon
} from './icons';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { LoadingSpinner } from './LoadingSpinner';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const UserDetailModal: React.FC<{ userData: UserDataSummary; onClose: () => void; onDataUpdate: () => void }> = ({ userData, onClose, onDataUpdate }) => {
    const [activeTab, setActiveTab] = useState<'analytics' | 'logs'>('analytics');

    const timeData = useMemo(() => {
        const monthly: Record<string, number> = {};
        userData.logs.forEach(log => {
            const m = log.date.slice(0, 7);
            monthly[m] = (monthly[m] || 0) + log.totalCost;
        });
        return Object.entries(monthly).map(([period, cost]) => ({ period, cost })).sort((a, b) => a.period.localeCompare(b.period));
    }, [userData.logs]);

    const productPieData = useMemo(() => {
        const stats: Record<string, number> = {};
        userData.logs.forEach(log => {
            stats[log.product] = (stats[log.product] || 0) + log.totalCost;
        });
        return Object.entries(stats)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [userData.logs]);

    const handleExport = () => {
        if (!userData.logs.length) return alert('데이터가 없습니다.');
        const worksheet = XLSX.utils.json_to_sheet(userData.logs.map(l => ({
            날짜: l.date, 
            제품: l.product, 
            용도: l.usage,
            면적: l.area, 
            비용: Math.round(l.totalCost)
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '시비 기록');
        XLSX.writeFile(workbook, `${userData.golfCourse}_logs.xlsx`);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{userData.golfCourse} 상세</h2>
                        <p className="text-sm text-slate-500">{userData.username}님의 활동</p>
                    </div>
                    <div className="flex gap-2 text-slate-500">
                         <button onClick={handleExport} className="p-2 hover:bg-green-50 hover:text-green-600 rounded-full transition-colors"><DownloadIcon /></button>
                         <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><CloseIcon /></button>
                    </div>
                </header>
                <div className="flex border-b bg-white">
                    <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-3 font-bold text-sm ${activeTab === 'analytics' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>통계</button>
                    <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3 font-bold text-sm ${activeTab === 'logs' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-400'}`}>기록</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {activeTab === 'analytics' ? (
                        <div className="space-y-8">
                            <div className="h-64"><ResponsiveContainer><BarChart data={timeData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Bar dataKey="cost" fill="#3b82f6" /></BarChart></ResponsiveContainer></div>
                            <div className="h-64"><ResponsiveContainer><PieChart><Pie data={productPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{productPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="p-4">날짜</th><th className="p-4">제품</th><th className="p-4 text-right">비용</th><th className="p-4 text-center">작업</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {userData.logs.map(log => (
                                        <tr key={log.id}><td className="p-4">{log.date}</td><td className="p-4 font-bold">{log.product}</td><td className="p-4 text-right">{Math.round(log.totalCost).toLocaleString()}</td><td className="p-4 text-center">
                                            <button onClick={async () => { if(window.confirm('삭제하시겠습니까?')) { await api.saveLog(userData.username, userData.logs.filter(l => l.id !== log.id)); onDataUpdate(); } }} className="text-red-400 hover:text-red-600 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                                        </td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<{ user: string; onLogout: () => void }> = ({ onLogout }) => {
    const [allUsersData, setAllUsersData] = useState<UserDataSummary[]>([]);
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'users' | 'fertilizers'>('users');
    const [selectedUser, setSelectedUser] = useState<UserDataSummary | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [newFert, setNewFert] = useState<Partial<Fertilizer>>({ name: '', usage: '그린', N: 0, P: 0, K: 0, price: 0, unit: '20kg', rate: '20g' });
    const [aiInput, setAiInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [users, fertilizers] = await Promise.all([api.getAllUsersData(), api.getFertilizers('admin')]);
            setAllUsersData(users);
            setMasterFertilizers(fertilizers);
        } catch (e) { console.error("Admin Load Error:", e); } finally { setIsLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const handleSaveFertilizer = async () => {
        if (!newFert.name) return alert('제품명을 입력하세요.');
        const updated = [...masterFertilizers];
        if (editingIdx !== null) updated[editingIdx] = newFert as Fertilizer;
        else updated.push(newFert as Fertilizer);
        await api.saveFertilizers('admin', updated);
        setMasterFertilizers(updated);
        setIsAddModalOpen(false);
        setEditingIdx(null);
    };

    const handleAiSmartFill = async () => {
        if (!aiInput.trim()) return;
        setIsAiLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Extract fertilizer data (name, N, P, K, price, unit, rate) as JSON from: "${aiInput}". Response only JSON.`
            });
            const text = response.text.replace(/```json|```/g, '').trim();
            const data = JSON.parse(text);
            setNewFert(prev => ({ ...prev, ...data }));
        } catch (e) { console.error(e); alert('AI 분석 실패'); } finally { setIsAiLoading(false); }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <DashboardIcon className="text-blue-600" /> Admin Dashboard
                    </h1>
                    <button onClick={onLogout} className="px-6 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 hover:text-red-600 flex items-center gap-2 transition-all">
                        <LogoutIcon /> 로그아웃
                    </button>
                </header>

                <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                    <div className="flex border-b bg-slate-50">
                        <button onClick={() => setActiveTab('users')} className={`flex-1 py-4 font-bold text-sm ${activeTab === 'users' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-slate-400'}`}>
                            <UsersIcon className="inline mr-2" /> 사용자 현황
                        </button>
                        <button onClick={() => setActiveTab('fertilizers')} className={`flex-1 py-4 font-bold text-sm ${activeTab === 'fertilizers' ? 'text-green-600 bg-white border-b-2 border-green-600' : 'text-slate-400'}`}>
                            <ClipboardListIcon className="inline mr-2" /> 비료 마스터 관리
                        </button>
                    </div>
                    <div className="p-6">
                        {activeTab === 'users' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="p-4">골프장</th><th className="p-4">사용자</th><th className="p-4 text-right">누적 비용</th><th className="p-4 text-center">작업</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {allUsersData.map(u => (
                                            <tr key={u.username} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 font-bold">{u.golfCourse}</td>
                                                <td className="p-4">{u.username}</td>
                                                <td className="p-4 text-right font-bold text-blue-600">{Math.round(u.totalCost).toLocaleString()}원</td>
                                                <td className="p-4 text-center">
                                                    <button onClick={() => setSelectedUser(u)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"><DashboardIcon className="w-5 h-5" /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-slate-700">전체 비료 라이브러리 ({masterFertilizers.length})</h3>
                                    <button onClick={() => { setEditingIdx(null); setNewFert({ name: '', usage: '그린', N:0, P:0, K:0, price: 0, unit: '20kg', rate: '20g' }); setIsAddModalOpen(true); }} className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 shadow-lg transition-all">
                                        <PlusIcon /> 추가
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {masterFertilizers.map((f, i) => (
                                        <div key={i} className="p-5 bg-white border border-slate-200 rounded-2xl group relative hover:border-green-400 transition-all shadow-sm">
                                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 flex gap-2">
                                                <button onClick={() => { setEditingIdx(i); setNewFert(f); setIsAddModalOpen(true); }} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"><PencilIcon className="w-4 h-4" /></button>
                                                <button onClick={async () => { if(window.confirm('삭제하시겠습니까?')) { const n = [...masterFertilizers]; n.splice(i,1); await api.saveFertilizers('admin', n); setMasterFertilizers(n); }}} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{f.usage}</div>
                                            <div className="font-bold text-slate-800 text-lg mb-3 truncate pr-12">{f.name}</div>
                                            <div className="flex gap-2">
                                                <div className="flex-1 bg-slate-50 p-2 rounded text-center text-xs font-bold text-green-600">N {f.N}%</div>
                                                <div className="flex-1 bg-slate-50 p-2 rounded text-center text-xs font-bold text-blue-600">P {f.P}%</div>
                                                <div className="flex-1 bg-slate-50 p-2 rounded text-center text-xs font-bold text-orange-600">K {f.K}%</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedUser && <UserDetailModal userData={selectedUser} onClose={() => setSelectedUser(null)} onDataUpdate={loadData} />}

            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4" onClick={() => setIsAddModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold mb-6 text-slate-800">{editingIdx !== null ? '비료 수정' : '새 비료 등록'}</h2>
                        <div className="space-y-6">
                            <div className="bg-purple-50 p-5 rounded-2xl space-y-3">
                                <label className="text-xs font-bold text-purple-600 block">AI 스마트 추출</label>
                                <textarea className="w-full p-4 border rounded-2xl h-24 focus:ring-2 focus:ring-purple-400 outline-none" placeholder="비료 정보를 붙여넣으세요..." value={aiInput} onChange={e => setAiInput(e.target.value)} />
                                <button onClick={handleAiSmartFill} disabled={isAiLoading} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all disabled:opacity-50">
                                    {isAiLoading ? '분석 중...' : 'AI 자동 채우기'}
                                </button>
                            </div>
                            <div className="space-y-4">
                                <input className="w-full p-4 border rounded-2xl focus:ring-2 focus:ring-blue-400 outline-none" placeholder="제품명" value={newFert.name} onChange={e => setNewFert({...newFert, name: e.target.value})} />
                                <div className="grid grid-cols-3 gap-3">
                                    <div><label className="text-xs text-slate-500 block mb-1">N (%)</label><input type="number" className="w-full p-2 border rounded-xl" value={newFert.N} onChange={e => setNewFert({...newFert, N: Number(e.target.value)})} /></div>
                                    <div><label className="text-xs text-slate-500 block mb-1">P (%)</label><input type="number" className="w-full p-2 border rounded-xl" value={newFert.P} onChange={e => setNewFert({...newFert, P: Number(e.target.value)})} /></div>
                                    <div><label className="text-xs text-slate-500 block mb-1">K (%)</label><input type="number" className="w-full p-2 border rounded-xl" value={newFert.K} onChange={e => setNewFert({...newFert, K: Number(e.target.value)})} /></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs text-slate-500 block mb-1">가격 (원)</label><input type="number" className="w-full p-4 border rounded-2xl" value={newFert.price} onChange={e => setNewFert({...newFert, price: Number(e.target.value)})} /></div>
                                    <div><label className="text-xs text-slate-500 block mb-1">단위</label><input className="w-full p-4 border rounded-2xl" value={newFert.unit} onChange={e => setNewFert({...newFert, unit: e.target.value})} /></div>
                                </div>
                            </div>
                            <button onClick={handleSaveFertilizer} className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl shadow-xl hover:bg-blue-700 transition-all">저장하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
