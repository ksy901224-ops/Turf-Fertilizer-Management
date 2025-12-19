
import React, { useState, useEffect, useMemo } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { UserDataSummary, Fertilizer, LogEntry } from './types';
import { LogoutIcon, DashboardIcon, UsersIcon, PlusIcon, TrashIcon, CloseIcon, ClipboardListIcon, UploadIcon, SparklesIcon, DownloadIcon, PencilIcon, BellIcon } from './icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FERTILIZER_TYPE_GROUPS } from './constants';
import { LoadingSpinner } from './LoadingSpinner';

interface AdminDashboardProps {
    user: string;
    onLogout: () => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// --- User Detail Modal ---
interface UserDetailModalProps {
    userData: UserDataSummary;
    onClose: () => void;
    onDataUpdate: () => void;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ userData, onClose, onDataUpdate }) => {
    const [activeTab, setActiveTab] = useState<'analytics' | 'logs'>('analytics');
    const [statsView, setStatsView] = useState<'monthly' | 'daily'>('monthly');

    const productStats = useMemo(() => {
        const stats: Record<string, { count: number, totalCost: number, name: string }> = {};
        userData.logs.forEach(log => {
            if (!stats[log.product]) stats[log.product] = { count: 0, totalCost: 0, name: log.product };
            stats[log.product].count += 1;
            stats[log.product].totalCost += log.totalCost;
        });
        return Object.values(stats).sort((a, b) => b.totalCost - a.totalCost);
    }, [userData.logs]);

    const timeData = useMemo(() => {
        const monthly: Record<string, number> = {};
        userData.logs.forEach(log => {
            const m = log.date.slice(0, 7);
            monthly[m] = (monthly[m] || 0) + log.totalCost;
        });
        return Object.entries(monthly).map(([period, cost]) => ({ period, cost })).sort((a, b) => a.period.localeCompare(b.period));
    }, [userData.logs]);

    const handleDeleteLog = async (logId: string) => {
        if (window.confirm('기록을 삭제하시겠습니까?')) {
            const updated = userData.logs.filter(l => l.id !== logId);
            await api.saveLog(userData.username, updated);
            onDataUpdate();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{userData.golfCourse} 상세 데이터</h2>
                        <p className="text-sm text-slate-500">{userData.username}님의 활동 요약</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><CloseIcon /></button>
                </header>

                <div className="flex border-b">
                    <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-3 font-bold text-sm ${activeTab === 'analytics' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>통계 분석</button>
                    <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3 font-bold text-sm ${activeTab === 'logs' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-400'}`}>기록 관리</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'analytics' ? (
                        <div className="space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <span className="text-[10px] font-bold text-blue-600 block uppercase">총 시비 비용</span>
                                    <span className="text-xl font-bold text-blue-900">{Math.round(userData.totalCost).toLocaleString()}원</span>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                    <span className="text-[10px] font-bold text-purple-600 block uppercase">누적 기록 수</span>
                                    <span className="text-xl font-bold text-purple-900">{userData.logCount}건</span>
                                </div>
                            </div>
                            <div className="h-64 w-full">
                                <h3 className="text-sm font-bold text-slate-700 mb-4">월별 지출 추이</h3>
                                <ResponsiveContainer>
                                    <BarChart data={timeData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="period" fontSize={12} />
                                        <YAxis fontSize={12} />
                                        <Tooltip formatter={(v: number) => v.toLocaleString() + '원'} />
                                        <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                                    <tr>
                                        <th className="p-3">날짜</th>
                                        <th className="p-3">제품</th>
                                        <th className="p-3 text-right">비용</th>
                                        <th className="p-3 text-center">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {userData.logs.map(log => (
                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3 font-medium">{log.date}</td>
                                            <td className="p-3 text-slate-700">{log.product}</td>
                                            <td className="p-3 text-right font-mono">{Math.round(log.totalCost).toLocaleString()}</td>
                                            <td className="p-3 text-center">
                                                <button onClick={() => handleDeleteLog(log.id)} className="text-red-400 hover:text-red-600 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                                            </td>
                                        </tr>
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

// --- Main Dashboard ---
export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    const [allUsersData, setAllUsersData] = useState<UserDataSummary[]>([]);
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'users' | 'fertilizers'>('users');
    const [selectedUser, setSelectedUser] = useState<UserDataSummary | null>(null);

    // Fertilizer Form State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [newFert, setNewFert] = useState<Partial<Fertilizer>>({ usage: '그린', type: '완효성 비료', N: 0, P: 0, K: 0 });
    const [aiInput, setAiInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [users, fertilizers] = await Promise.all([api.getAllUsersData(), api.getFertilizers('admin')]);
            setAllUsersData(users);
            setMasterFertilizers(fertilizers);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const pendingUsers = useMemo(() => allUsersData.filter(u => !u.isApproved), [allUsersData]);
    const approvedUsers = useMemo(() => allUsersData.filter(u => u.isApproved), [allUsersData]);

    const handleSaveFertilizer = async () => {
        if (!newFert.name || !newFert.unit) return alert('제품명과 단위를 입력하세요.');
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
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: `비료 정보를 JSON 형식으로 추출하세요: ${aiInput}. N, P, K는 숫자(%)여야 합니다.`
            });
            const text = response.text.replace(/```json|```/g, '').trim();
            const data = JSON.parse(text);
            setNewFert(prev => ({ ...prev, ...data }));
        } catch (e) {
            alert('AI 분석 중 오류가 발생했습니다.');
        } finally {
            setIsAiLoading(false);
        }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DashboardIcon /> Admin Panel</h1>
                        <p className="text-sm text-slate-500 font-medium">전체 사용자 및 마스터 데이터 관리</p>
                    </div>
                    <button onClick={onLogout} className="px-5 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all">로그아웃</button>
                </header>

                {pendingUsers.length > 0 && (
                    <section className="bg-amber-50 p-6 rounded-2xl border-l-4 border-amber-500 shadow-md">
                        <h2 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2"><BellIcon /> 승인 대기 중 ({pendingUsers.length})</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingUsers.map(u => (
                                <div key={u.username} className="bg-white p-4 rounded-xl border border-amber-200 flex justify-between items-center shadow-sm">
                                    <div>
                                        <div className="font-bold text-slate-800">{u.username}</div>
                                        <div className="text-xs text-slate-500">{u.golfCourse}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={async () => { await api.approveUser(u.username); loadData(); }} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700">승인</button>
                                        <button onClick={async () => { if(window.confirm('거절하시겠습니까?')) { await api.deleteUser(u.username); loadData(); } }} className="bg-white border border-red-200 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50">거절</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex border-b">
                        <button onClick={() => setActiveTab('users')} className={`flex-1 py-4 font-bold text-sm transition-all ${activeTab === 'users' ? 'text-blue-600 bg-blue-50/50 border-b-2 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}>사용자 목록</button>
                        <button onClick={() => setActiveTab('fertilizers')} className={`flex-1 py-4 font-bold text-sm transition-all ${activeTab === 'fertilizers' ? 'text-green-600 bg-green-50/50 border-b-2 border-green-600' : 'text-slate-400 hover:bg-slate-50'}`}>마스터 비료</button>
                    </div>

                    <div className="p-6">
                        {activeTab === 'users' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                                        <tr>
                                            <th className="p-4">골프장</th>
                                            <th className="p-4">사용자</th>
                                            <th className="p-4 text-right">기록</th>
                                            <th className="p-4 text-right">총 비용</th>
                                            <th className="p-4 text-center">상세</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {approvedUsers.map(u => (
                                            <tr key={u.username} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 font-bold text-slate-700">{u.golfCourse}</td>
                                                <td className="p-4 text-slate-600">{u.username}</td>
                                                <td className="p-4 text-right">{u.logCount}건</td>
                                                <td className="p-4 text-right font-mono font-bold text-blue-600">{Math.round(u.totalCost).toLocaleString()}원</td>
                                                <td className="p-4 text-center">
                                                    <button onClick={() => setSelectedUser(u)} className="p-2 text-slate-400 hover:text-blue-600"><UsersIcon className="w-5 h-5" /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-slate-700">등록된 비료 ({masterFertilizers.length})</h3>
                                    <button onClick={() => { setEditingIdx(null); setNewFert({ usage: '그린', type: '완효성 비료', N:0, P:0, K:0 }); setIsAddModalOpen(true); }} className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 transition-all"><PlusIcon /> 추가</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {masterFertilizers.map((f, i) => (
                                        <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm group hover:border-green-300 transition-all relative">
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                                <button onClick={() => { setEditingIdx(i); setNewFert(f); setIsAddModalOpen(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><PencilIcon className="w-4 h-4" /></button>
                                                <button onClick={async () => { if(window.confirm('삭제?')) { const n = [...masterFertilizers]; n.splice(i,1); await api.saveFertilizers('admin', n); setMasterFertilizers(n); }}} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">{f.usage} | {f.type}</div>
                                            <div className="font-bold text-slate-800 truncate mb-2">{f.name}</div>
                                            <div className="flex gap-3 text-xs font-mono text-slate-500 bg-slate-50 p-2 rounded-lg">
                                                <span>N:{f.N}%</span><span>P:{f.P}%</span><span>K:{f.K}%</span>
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
                <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-fadeIn overflow-y-auto max-h-[95vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800">{editingIdx !== null ? '비료 수정' : '새 비료 등록'}</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400"><CloseIcon /></button>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-purple-700 flex items-center gap-1"><SparklesIcon className="w-3 h-3"/> AI 스마트 입력</span>
                                </div>
                                <textarea className="w-full p-2 text-xs border rounded-lg h-20 outline-none" placeholder="비료 이름, 함량 정보를 여기에 붙여넣으세요..." value={aiInput} onChange={e => setAiInput(e.target.value)} />
                                <button onClick={handleAiSmartFill} disabled={isAiLoading} className="w-full py-2 bg-purple-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-purple-700 disabled:opacity-50">{isAiLoading ? '분석 중...' : 'AI로 자동 채우기'}</button>
                            </div>

                            <div className="space-y-3 pt-2">
                                <input className="w-full p-3 border rounded-xl" placeholder="제품명 (필수)" value={newFert.name || ''} onChange={e => setNewFert({...newFert, name: e.target.value})} />
                                <div className="grid grid-cols-2 gap-3">
                                    <select className="p-3 border rounded-xl" value={newFert.usage} onChange={e => setNewFert({...newFert, usage: e.target.value as any})}>
                                        <option value="그린">그린</option><option value="티">티</option><option value="페어웨이">페어웨이</option>
                                    </select>
                                    <input className="p-3 border rounded-xl" placeholder="포장단위 (예: 20kg)" value={newFert.unit || ''} onChange={e => setNewFert({...newFert, unit: e.target.value})} />
                                </div>
                                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl">
                                    <div><label className="text-[10px] font-bold text-slate-400">N (%)</label><input type="number" className="w-full p-1 border rounded" value={newFert.N} onChange={e => setNewFert({...newFert, N: Number(e.target.value)})} /></div>
                                    <div><label className="text-[10px] font-bold text-slate-400">P (%)</label><input type="number" className="w-full p-1 border rounded" value={newFert.P} onChange={e => setNewFert({...newFert, P: Number(e.target.value)})} /></div>
                                    <div><label className="text-[10px] font-bold text-slate-400">K (%)</label><input type="number" className="w-full p-1 border rounded" value={newFert.K} onChange={e => setNewFert({...newFert, K: Number(e.target.value)})} /></div>
                                </div>
                                <input type="number" className="w-full p-3 border rounded-xl" placeholder="가격 (원)" value={newFert.price || ''} onChange={e => setNewFert({...newFert, price: Number(e.target.value)})} />
                                <input className="w-full p-3 border rounded-xl" placeholder="권장 시비량 (예: 15g/㎡)" value={newFert.rate || ''} onChange={e => setNewFert({...newFert, rate: e.target.value})} />
                            </div>
                            <button onClick={handleSaveFertilizer} className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all text-lg mt-4">저장 완료</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
