
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
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><CloseIcon /></button>
                </header>

                <div className="flex border-b">
                    <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-3 font-bold text-sm ${activeTab === 'analytics' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-slate-400 hover:bg-slate-50'}`}>통계 분석</button>
                    <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3 font-bold text-sm ${activeTab === 'logs' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/30' : 'text-slate-400 hover:bg-slate-50'}`}>기록 관리</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'analytics' ? (
                        <div className="space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <span className="text-[10px] font-bold text-blue-600 block uppercase mb-1">총 시비 비용</span>
                                    <span className="text-xl font-bold text-blue-900">{Math.round(userData.totalCost).toLocaleString()}원</span>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                    <span className="text-[10px] font-bold text-purple-600 block uppercase mb-1">누적 기록 수</span>
                                    <span className="text-xl font-bold text-purple-900">{userData.logCount}건</span>
                                </div>
                            </div>
                            <div className="h-72 w-full">
                                <h3 className="text-sm font-bold text-slate-700 mb-4">월별 지출 추이 (누적)</h3>
                                <ResponsiveContainer>
                                    <BarChart data={timeData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="period" fontSize={11} tick={{fill: '#64748b'}} />
                                        <YAxis fontSize={11} tick={{fill: '#64748b'}} />
                                        <Tooltip 
                                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                                            formatter={(v: number) => [v.toLocaleString() + '원', '비용']} 
                                        />
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
                                        <th className="p-4">날짜</th>
                                        <th className="p-4">제품</th>
                                        <th className="p-4 text-right">비용</th>
                                        <th className="p-4 text-center">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {userData.logs.map(log => (
                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-medium text-slate-600">{log.date}</td>
                                            <td className="p-4 text-slate-800 font-semibold">{log.product}</td>
                                            <td className="p-4 text-right font-mono font-bold text-blue-600">{Math.round(log.totalCost).toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => handleDeleteLog(log.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {userData.logs.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-12 text-center text-slate-400 italic">기록된 일지가 없습니다.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Main Admin Dashboard ---
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
            const [users, fertilizers] = await Promise.all([
                api.getAllUsersData(),
                api.getFertilizers('admin')
            ]);
            setAllUsersData(users);
            setMasterFertilizers(fertilizers);
        } catch (e) {
            console.error("Data load failed", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const pendingUsers = useMemo(() => allUsersData.filter(u => !u.isApproved), [allUsersData]);
    const approvedUsers = useMemo(() => allUsersData.filter(u => u.isApproved), [allUsersData]);

    const handleSaveFertilizer = async () => {
        if (!newFert.name || !newFert.unit) {
            alert('제품명과 단위를 입력하세요.');
            return;
        }
        const updated = [...masterFertilizers];
        if (editingIdx !== null) updated[editingIdx] = newFert as Fertilizer;
        else updated.push(newFert as Fertilizer);
        
        await api.saveFertilizers('admin', updated);
        setMasterFertilizers(updated);
        setIsAddModalOpen(false);
        setEditingIdx(null);
        setNewFert({ usage: '그린', type: '완효성 비료', N: 0, P: 0, K: 0 });
    };

    const handleAiSmartFill = async () => {
        if (!aiInput.trim()) return;
        setIsAiLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `비료 성분표 텍스트에서 데이터를 추출하여 JSON으로 변환하세요.
                텍스트: "${aiInput}"
                추출 형식: {"name": "제품명", "N": 질소숫자, "P": 인산숫자, "K": 칼륨숫자, "price": 가격숫자, "unit": "단위", "rate": "권장사용량", "description": "특징 요약"}
                * N, P, K는 숫자(%)여야 함.
                * JSON 외 설명 없이 결과만 출력할 것.`
            });
            const text = response.text.replace(/```json|```/g, '').trim();
            const data = JSON.parse(text);
            setNewFert(prev => ({ ...prev, ...data }));
            alert('AI가 비료 정보를 자동으로 추출했습니다.');
        } catch (e) {
            console.error(e);
            alert('AI 분석 중 오류가 발생했습니다. 텍스트를 확인해주세요.');
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
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <DashboardIcon className="text-blue-600" /> Admin Control Panel
                        </h1>
                        <p className="text-sm text-slate-500 font-medium">서비스 통합 관리 및 데이터 모니터링</p>
                    </div>
                    <button onClick={onLogout} className="px-6 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 border border-slate-200 transition-all flex items-center gap-2">
                        <LogoutIcon /> 로그아웃
                    </button>
                </header>

                {pendingUsers.length > 0 && (
                    <section className="bg-amber-50 p-6 rounded-2xl border-l-4 border-amber-500 shadow-md animate-fadeIn">
                        <h2 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
                            <BellIcon className="animate-bounce" /> 신규 가입 승인 대기 ({pendingUsers.length})
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingUsers.map(u => (
                                <div key={u.username} className="bg-white p-4 rounded-xl border border-amber-200 flex justify-between items-center shadow-sm">
                                    <div>
                                        <div className="font-bold text-slate-800">{u.username}</div>
                                        <div className="text-xs text-slate-500">{u.golfCourse}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={async () => { await api.approveUser(u.username); loadData(); }} className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-green-700 transition-colors">승인</button>
                                        <button onClick={async () => { if(window.confirm('가입을 거절하시겠습니까?')) { await api.deleteUser(u.username); loadData(); } }} className="bg-white border border-red-200 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors">거절</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex border-b bg-slate-50/50">
                        <button 
                            onClick={() => setActiveTab('users')} 
                            className={`flex-1 py-4 font-bold text-sm transition-all border-r last:border-r-0 ${activeTab === 'users' ? 'text-blue-600 bg-white border-b-2 border-b-blue-600' : 'text-slate-400 hover:bg-white'}`}
                        >
                            <UsersIcon className="inline mr-2" /> 사용자 현황
                        </button>
                        <button 
                            onClick={() => setActiveTab('fertilizers')} 
                            className={`flex-1 py-4 font-bold text-sm transition-all ${activeTab === 'fertilizers' ? 'text-green-600 bg-white border-b-2 border-b-green-600' : 'text-slate-400 hover:bg-white'}`}
                        >
                            <ClipboardListIcon className="inline mr-2" /> 마스터 비료 데이터
                        </button>
                    </div>

                    <div className="p-6">
                        {activeTab === 'users' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                                        <tr>
                                            <th className="p-4">골프장 명</th>
                                            <th className="p-4">사용자 ID</th>
                                            <th className="p-4 text-right">시비 기록</th>
                                            <th className="p-4 text-right">누적 비용</th>
                                            <th className="p-4 text-center">작업</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {approvedUsers.map(u => (
                                            <tr key={u.username} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 font-bold text-slate-700">{u.golfCourse}</td>
                                                <td className="p-4 text-slate-600">{u.username}</td>
                                                <td className="p-4 text-right font-medium">{u.logCount}건</td>
                                                <td className="p-4 text-right font-mono font-bold text-blue-600">{Math.round(u.totalCost).toLocaleString()}원</td>
                                                <td className="p-4 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <button 
                                                            onClick={() => setSelectedUser(u)} 
                                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                            title="상세 데이터"
                                                        >
                                                            <DashboardIcon className="w-5 h-5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => { if(window.confirm('해당 사용자를 삭제하시겠습니까? 데이터가 모두 소실됩니다.')) { api.deleteUser(u.username).then(loadData); }}} 
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            title="사용자 삭제"
                                                        >
                                                            <TrashIcon className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {approvedUsers.length === 0 && (
                                            <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic font-medium">등록된 사용자가 없습니다.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div>
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                                        <div className="w-2 h-6 bg-green-500 rounded-full"></div>
                                        전체 비료 라이브러리 ({masterFertilizers.length})
                                    </h3>
                                    <button 
                                        onClick={() => { setEditingIdx(null); setNewFert({ usage: '그린', type: '완효성 비료', N:0, P:0, K:0 }); setIsAddModalOpen(true); }} 
                                        className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 shadow-lg shadow-green-200 transition-all"
                                    >
                                        <PlusIcon /> 비료 마스터 추가
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {masterFertilizers.map((f, i) => (
                                        <div key={i} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm group hover:border-green-400 hover:shadow-md transition-all relative overflow-hidden">
                                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 flex gap-2 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                <button 
                                                    onClick={() => { setEditingIdx(i); setNewFert(f); setIsAddModalOpen(true); }} 
                                                    className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"
                                                >
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={async () => { if(window.confirm('이 비료를 삭제하시겠습니까?')) { const n = [...masterFertilizers]; n.splice(i,1); await api.saveFertilizers('admin', n); setMasterFertilizers(n); }}} 
                                                    className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{f.usage} | {f.type}</div>
                                            <div className="font-bold text-slate-800 text-lg mb-3 truncate pr-16">{f.name}</div>
                                            <div className="flex gap-4 mb-4">
                                                <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center">
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">N</div>
                                                    <div className="font-mono font-bold text-green-600">{f.N}%</div>
                                                </div>
                                                <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center">
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">P</div>
                                                    <div className="font-mono font-bold text-blue-600">{f.P}%</div>
                                                </div>
                                                <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center">
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">K</div>
                                                    <div className="font-mono font-bold text-orange-600">{f.K}%</div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                                                <span className="text-xs font-bold text-slate-600">{f.unit} 당</span>
                                                <span className="text-sm font-extrabold text-blue-600">{f.price.toLocaleString()}원</span>
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
                <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 backdrop-blur-md" onClick={() => setIsAddModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl animate-fadeIn overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-bold text-slate-800">{editingIdx !== null ? '비료 정보 수정' : '새 비료 라이브러리 추가'}</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-colors"><CloseIcon /></button>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-purple-700 flex items-center gap-2">
                                        <SparklesIcon className="w-4 h-4" /> AI 스마트 데이터 추출
                                    </span>
                                    {isAiLoading && <div className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full"></div>}
                                </div>
                                <textarea 
                                    className="w-full p-4 text-sm border rounded-2xl h-24 outline-none focus:ring-2 focus:ring-purple-500 bg-white" 
                                    placeholder="제품 홍보 문구나 성분표 텍스트를 여기에 붙여넣으세요. NPK, 가격, 단위를 자동으로 추출합니다." 
                                    value={aiInput} 
                                    onChange={e => setAiInput(e.target.value)} 
                                />
                                <button 
                                    onClick={handleAiSmartFill} 
                                    disabled={isAiLoading || !aiInput.trim()} 
                                    className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-200 hover:bg-purple-700 disabled:opacity-50 transition-all"
                                >
                                    {isAiLoading ? 'AI 데이터 분석 중...' : '텍스트에서 정보 추출하기'}
                                </button>
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 ml-1">제품 이름</label>
                                    <input className="w-full p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 font-semibold" placeholder="예: 한아름 복합비료" value={newFert.name || ''} onChange={e => setNewFert({...newFert, name: e.target.value})} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 ml-1">주 용도</label>
                                        <select className="w-full p-4 border rounded-2xl bg-white outline-none focus:ring-2 focus:ring-blue-500" value={newFert.usage} onChange={e => setNewFert({...newFert, usage: e.target.value as any})}>
                                            <option value="그린">그린</option><option value="티">티</option><option value="페어웨이">페어웨이</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 ml-1">포장 단위</label>
                                        <input className="w-full p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="예: 20kg 또는 10L" value={newFert.unit || ''} onChange={e => setNewFert({...newFert, unit: e.target.value})} />
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-5 rounded-2xl">
                                    <label className="text-xs font-bold text-slate-500 mb-4 block">성분 비율 (N-P-K %)</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div><input type="number" className="w-full p-4 border rounded-2xl text-center font-bold" placeholder="N" value={newFert.N} onChange={e => setNewFert({...newFert, N: Number(e.target.value)})} /></div>
                                        <div><input type="number" className="w-full p-4 border rounded-2xl text-center font-bold" placeholder="P" value={newFert.P} onChange={e => setNewFert({...newFert, P: Number(e.target.value)})} /></div>
                                        <div><input type="number" className="w-full p-4 border rounded-2xl text-center font-bold" placeholder="K" value={newFert.K} onChange={e => setNewFert({...newFert, K: Number(e.target.value)})} /></div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 ml-1">제품 가격 (원)</label>
                                        <input type="number" className="w-full p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-600" placeholder="0" value={newFert.price || ''} onChange={e => setNewFert({...newFert, price: Number(e.target.value)})} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 ml-1">권장 시비량</label>
                                        <input className="w-full p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="예: 15g/㎡" value={newFert.rate || ''} onChange={e => setNewFert({...newFert, rate: e.target.value})} />
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleSaveFertilizer} className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all text-lg mt-4">
                                {editingIdx !== null ? '수정 내용 저장하기' : '마스터 라이브러리에 등록'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
