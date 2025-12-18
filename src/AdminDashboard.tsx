
import React, { useState, useEffect, useMemo } from 'react';
import * as api from './api';
import { UserDataSummary, Fertilizer } from './types';
import { LogoutIcon, DashboardIcon, PlusIcon, TrashIcon, CloseIcon, SparklesIcon, BellIcon } from './icons';
import { LoadingSpinner } from './LoadingSpinner';
import { GoogleGenAI } from '@google/genai';

interface AdminDashboardProps {
    user: string;
    onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    const [allUsersData, setAllUsersData] = useState<UserDataSummary[]>([]);
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'users' | 'fertilizers'>('users');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newFert, setNewFert] = useState<Partial<Fertilizer>>({ usage: '그린', type: '완효성', N:0, P:0, K:0 });
    const [aiInsight, setAiInsight] = useState<string>('');
    const [isAiLoading, setIsAiLoading] = useState(false);

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
            console.error("Load admin data error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const pendingUsers = useMemo(() => allUsersData.filter(u => !u.isApproved), [allUsersData]);
    const approvedUsers = useMemo(() => allUsersData.filter(u => u.isApproved), [allUsersData]);

    const handleApprove = async (username: string) => {
        if (window.confirm(`${username}님을 승인하시겠습니까?`)) {
            await api.approveUser(username);
            loadData();
        }
    };

    const handleDeleteUser = async (username: string) => {
        if (window.confirm(`${username}님을 삭제하시겠습니까?`)) {
            await api.deleteUser(username);
            loadData();
        }
    };

    const handleAddFertilizer = async () => {
        if (!newFert.name) return alert('제품명을 입력하세요.');
        const updatedList = [...masterFertilizers, newFert as Fertilizer];
        await api.saveFertilizers('admin', updatedList);
        setMasterFertilizers(updatedList);
        setIsAddModalOpen(false);
        setNewFert({ usage: '그린', type: '완효성', N:0, P:0, K:0 });
    };

    const handleAiAnalysis = async () => {
        setIsAiLoading(true);
        setAiInsight('');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const userSummaries = approvedUsers.map(u => ({ course: u.golfCourse, logCount: u.logCount, totalCost: u.totalCost }));
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `전체 사용자 시비 데이터 통계 분석 리포트를 작성해주세요.
                데이터: ${JSON.stringify(userSummaries)}`
            });
            setAiInsight(response.text || '분석 결과를 생성하지 못했습니다.');
        } catch (e) {
            console.error(e);
            setAiInsight('분석 중 오류가 발생했습니다.');
        } finally {
            setIsAiLoading(false);
        }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DashboardIcon /> Admin Dashboard</h1>
                        <p className="text-sm text-slate-500 font-medium">관리자 전용 대시보드</p>
                    </div>
                    <button onClick={onLogout} className="px-5 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all border border-slate-200">로그아웃</button>
                </header>

                {pendingUsers.length > 0 && (
                    <section className="bg-amber-50 p-6 rounded-2xl border-l-4 border-amber-500 shadow-md">
                        <h2 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2"><BellIcon /> 승인 대기 ({pendingUsers.length})</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingUsers.map(u => (
                                <div key={u.username} className="bg-white p-4 rounded-xl border border-amber-200 flex justify-between items-center shadow-sm">
                                    <div>
                                        <div className="font-bold text-slate-800">{u.username}</div>
                                        <div className="text-xs text-slate-500">{u.golfCourse}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleApprove(u.username)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700">승인</button>
                                        <button onClick={() => handleDeleteUser(u.username)} className="bg-white border border-red-200 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50">거절</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
                    <div className="flex border-b border-slate-100">
                        <button onClick={() => setActiveTab('users')} className={`flex-1 py-4 font-bold text-sm transition-all ${activeTab === 'users' ? 'text-indigo-600 bg-indigo-50 border-b-2 border-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}>사용자 관리</button>
                        <button onClick={() => setActiveTab('fertilizers')} className={`flex-1 py-4 font-bold text-sm transition-all ${activeTab === 'fertilizers' ? 'text-green-600 bg-green-50 border-b-2 border-green-600' : 'text-slate-400 hover:bg-slate-50'}`}>마스터 비료 관리</button>
                    </div>

                    <div className="p-6">
                        {activeTab === 'users' ? (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700">승인된 사용자 ({approvedUsers.length})</h3>
                                    <button onClick={handleAiAnalysis} disabled={isAiLoading} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                                        <SparklesIcon className="w-4 h-4" /> {isAiLoading ? '분석 중...' : '전체 데이터 AI 분석'}
                                    </button>
                                </div>
                                {aiInsight && (
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-sm text-indigo-900 leading-relaxed whitespace-pre-wrap animate-fadeIn">
                                        <div className="font-bold mb-1 flex items-center gap-2"><SparklesIcon className="w-4 h-4" /> AI 통계 리포트</div>
                                        {aiInsight}
                                    </div>
                                )}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[11px]">
                                            <tr>
                                                <th className="p-4">골프장</th>
                                                <th className="p-4">사용자</th>
                                                <th className="p-4 text-right">기록수</th>
                                                <th className="p-4 text-right">총 비용</th>
                                                <th className="p-4 text-center">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {approvedUsers.map(u => (
                                                <tr key={u.username} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 font-bold text-slate-700">{u.golfCourse}</td>
                                                    <td className="p-4 text-slate-600">{u.username}</td>
                                                    <td className="p-4 text-right font-medium">{u.logCount}건</td>
                                                    <td className="p-4 text-right font-mono text-indigo-600">{Math.round(u.totalCost).toLocaleString()}원</td>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => handleDeleteUser(u.username)} className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"><TrashIcon /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-700">마스터 비료 데이터 ({masterFertilizers.length})</h3>
                                    <button onClick={() => setIsAddModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-sm shadow-md hover:bg-green-700"><PlusIcon /> 비료 추가</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {masterFertilizers.map((f, i) => (
                                        <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm relative group hover:border-green-300 transition-all">
                                            <button onClick={async () => { if(window.confirm('삭제?')) { const n = [...masterFertilizers]; n.splice(i,1); await api.saveFertilizers('admin', n); setMasterFertilizers(n); }}} className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><TrashIcon className="w-4 h-4" /></button>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">{f.usage} | {f.type}</div>
                                            <div className="font-bold text-slate-800 truncate">{f.name}</div>
                                            <div className="text-xs text-slate-500 mt-2">N-P-K: {f.N}-{f.P}-{f.K}</div>
                                            <div className="text-xs font-bold text-indigo-600 mt-1">{f.price.toLocaleString()}원 / {f.unit}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fadeIn">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800">새 비료 등록</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><CloseIcon /></button>
                        </div>
                        <div className="space-y-4">
                            <input className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-green-500 outline-none" placeholder="비료 이름 입력" onChange={e => setNewFert({...newFert, name: e.target.value})} />
                            <div className="grid grid-cols-3 gap-2">
                                <input type="number" className="w-full p-3 border rounded-xl text-center" placeholder="N" onChange={e => setNewFert({...newFert, N: Number(e.target.value)})} />
                                <input type="number" className="w-full p-3 border rounded-xl text-center" placeholder="P" onChange={e => setNewFert({...newFert, P: Number(e.target.value)})} />
                                <input type="number" className="w-full p-3 border rounded-xl text-center" placeholder="K" onChange={e => setNewFert({...newFert, K: Number(e.target.value)})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input className="w-full p-3 border rounded-xl" placeholder="포장 단위 (20kg)" onChange={e => setNewFert({...newFert, unit: e.target.value})} />
                                <input type="number" className="w-full p-3 border rounded-xl" placeholder="가격" onChange={e => setNewFert({...newFert, price: Number(e.target.value)})} />
                            </div>
                            <button onClick={handleAddFertilizer} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all text-lg mt-4">비료 등록 완료</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
