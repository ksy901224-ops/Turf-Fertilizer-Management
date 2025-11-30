import React, { useState } from 'react';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { Chatbot } from './Chatbot';
import * as api from './api';
import { Fertilizer } from './types';
import { ChatIcon, CloseIcon } from './icons'; 
import { USAGE_CATEGORIES } from './constants';

const App = () => {
    const [user, setUser] = useState<string | null>(null);
    const [fertilizers, setFertilizers] = useState<Fertilizer[]>([]);
    const [activeFertilizerListTab, setActiveFertilizerListTab] = useState<string>('전체');
    const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const handleLogin = async (username: string) => {
        setUser(username);
        if (username !== 'admin') {
            const data = await api.getFertilizers(username);
            setFertilizers(data);
        }
    };

    const handleLogout = () => {
        setUser(null);
        setFertilizers([]);
        setDetailModalFertilizer(null);
    };

    if (!user) {
        return <Login onLogin={handleLogin} />;
    }

    if (user === 'admin') {
        return <AdminDashboard user={user} onLogout={handleLogout} />;
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-20 px-4 py-3 flex justify-between items-center shadow-sm">
                <h1 className="font-bold text-lg text-slate-800">Turf Manager <span className="text-xs font-normal text-slate-500 ml-2">{user}</span></h1>
                <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-red-500 transition-colors">로그아웃</button>
            </header>

            <main className="max-w-5xl mx-auto p-4 pb-24">
                {/* Tabs */}
                <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
                    <button 
                        onClick={() => setActiveFertilizerListTab('전체')}
                        className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeFertilizerListTab === '전체' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border hover:bg-slate-50'}`}
                    >
                        전체
                    </button>
                    {USAGE_CATEGORIES.map(cat => (
                        <button 
                            key={cat}
                            onClick={() => setActiveFertilizerListTab(cat)}
                            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeFertilizerListTab === cat ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border hover:bg-slate-50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Fertilizer Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {fertilizers
                        .filter(f => activeFertilizerListTab === '전체' || f.usage === activeFertilizerListTab)
                        .map(fertilizer => (
                        <div 
                            key={fertilizer.name} 
                            onClick={() => setDetailModalFertilizer(fertilizer)}
                            className="group relative p-3 rounded-lg bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-center items-center h-20"
                        >
                            {/* Usage Dot Indicator */}
                            <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                                fertilizer.usage === '그린' ? 'bg-green-500' : 
                                fertilizer.usage === '티' ? 'bg-blue-500' : 
                                'bg-orange-500'
                            }`} title={fertilizer.usage} />
                            
                            <h3 className="font-bold text-sm text-slate-700 group-hover:text-blue-600 text-center leading-tight line-clamp-2 px-1">
                                {fertilizer.name}
                            </h3>
                        </div>
                    ))}
                    {fertilizers.filter(f => activeFertilizerListTab === '전체' || f.usage === activeFertilizerListTab).length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed">
                            <p>등록된 비료가 없습니다.</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Chatbot Button & Component */}
            <div className="fixed bottom-6 right-6 z-40">
                <button 
                    onClick={() => setIsChatOpen(true)}
                    className="p-4 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-all hover:scale-105 active:scale-95"
                >
                    <ChatIcon />
                </button>
            </div>
            <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

            {/* Detail Modal */}
            {detailModalFertilizer && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={() => setDetailModalFertilizer(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fadeIn" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800 truncate pr-4">{detailModalFertilizer.name}</h3>
                            <button onClick={() => setDetailModalFertilizer(null)} className="text-slate-400 hover:text-slate-600"><CloseIcon /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between items-center">
                                <span className={`px-2 py-1 text-xs font-bold rounded-md ${
                                    detailModalFertilizer.usage === '그린' ? 'bg-green-100 text-green-800' : 
                                    detailModalFertilizer.usage === '티' ? 'bg-blue-100 text-blue-800' : 
                                    'bg-orange-100 text-orange-800'
                                }`}>{detailModalFertilizer.usage}</span>
                                <span className="text-xs text-slate-500 border px-2 py-1 rounded bg-slate-50">{detailModalFertilizer.type}</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 p-3 rounded border">
                                    <span className="block text-[10px] text-slate-500 mb-1">성분 (N-P-K)</span>
                                    <span className="font-mono font-bold text-slate-700">{detailModalFertilizer.N}-{detailModalFertilizer.P}-{detailModalFertilizer.K}</span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded border">
                                    <span className="block text-[10px] text-slate-500 mb-1">가격</span>
                                    <span className="font-mono font-bold text-slate-700">{detailModalFertilizer.price.toLocaleString()}원</span>
                                </div>
                            </div>
                            
                            <div>
                                <span className="block text-xs font-bold text-slate-700 mb-1">상세 정보</span>
                                <ul className="text-sm text-slate-600 space-y-1 list-disc pl-4">
                                    <li>포장 단위: {detailModalFertilizer.unit}</li>
                                    <li>권장 사용량: {detailModalFertilizer.rate}</li>
                                    {detailModalFertilizer.description && <li>{detailModalFertilizer.description}</li>}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;