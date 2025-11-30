
import React, { useState, useEffect } from 'react';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { Chatbot } from './Chatbot';
import * as api from './api';
import { Fertilizer } from './types';
import { ChatIcon, LogoutIcon, CloseIcon } from './icons';

export default function App() {
    const [user, setUser] = useState<string | null>(null);
    const [fertilizers, setFertilizers] = useState<Fertilizer[]>([]);
    const [activeFertilizerListTab, setActiveFertilizerListTab] = useState('전체');
    const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user && user !== 'admin') {
            loadUserFertilizers();
        }
    }, [user]);

    const loadUserFertilizers = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await api.getFertilizers(user);
            setFertilizers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!user) {
        return <Login onLogin={setUser} />;
    }

    if (user === 'admin') {
        return <AdminDashboard user={user} onLogout={() => setUser(null)} />;
    }

    return (
        <div className="min-h-screen bg-slate-100 p-4">
            {/* Header */}
            <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm mb-6 max-w-7xl mx-auto">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">나의 잔디 관리</h1>
                    <p className="text-sm text-slate-500">{user}님 환영합니다</p>
                </div>
                <button 
                    onClick={() => setUser(null)} 
                    className="flex items-center gap-1 text-slate-500 hover:text-red-500 transition-colors"
                >
                    <span className="text-sm font-semibold">로그아웃</span>
                    <LogoutIcon />
                </button>
            </header>
            
            <main className="max-w-7xl mx-auto">
                {/* Tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                    {['전체', '그린', '티', '페어웨이'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveFertilizerListTab(tab)}
                            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                                activeFertilizerListTab === tab 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {loading ? (
                        <div className="col-span-full py-12 text-center text-slate-500">로딩 중...</div>
                    ) : fertilizers
                        .filter(f => activeFertilizerListTab === '전체' || f.usage === activeFertilizerListTab)
                        .map(fertilizer => (
                        <div 
                            key={fertilizer.name} 
                            onClick={() => setDetailModalFertilizer(fertilizer)}
                            className="group relative bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden h-24 flex items-center justify-center p-3"
                        >
                            <div className={`absolute top-0 left-0 w-full h-1.5 ${
                                fertilizer.usage === '그린' ? 'bg-green-500' : 
                                fertilizer.usage === '티' ? 'bg-blue-500' : 
                                'bg-orange-500'
                            }`}></div>
                            
                            <h3 className="font-bold text-slate-700 text-sm text-center break-keep leading-snug line-clamp-3 px-1">
                                {fertilizer.name}
                            </h3>
                        </div>
                    ))}
                    {!loading && fertilizers.filter(f => activeFertilizerListTab === '전체' || f.usage === activeFertilizerListTab).length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed">
                            <p>등록된 비료가 없습니다.</p>
                        </div>
                    )}
                </div>
            </main>
            
            {/* Detail Modal */}
            {detailModalFertilizer && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setDetailModalFertilizer(null)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-sm relative" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setDetailModalFertilizer(null)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                        >
                            <CloseIcon />
                        </button>
                        <h3 className="text-lg font-bold mb-1 text-slate-800">{detailModalFertilizer.name}</h3>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-4 ${
                            detailModalFertilizer.usage === '그린' ? 'bg-green-100 text-green-800' :
                            detailModalFertilizer.usage === '티' ? 'bg-blue-100 text-blue-800' :
                            'bg-orange-100 text-orange-800'
                        }`}>
                            {detailModalFertilizer.usage}
                        </span>
                        
                        <div className="space-y-3 text-sm text-slate-600 bg-slate-50 p-4 rounded-lg">
                            <div className="flex justify-between">
                                <span className="font-semibold">타입:</span>
                                <span>{detailModalFertilizer.type}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-semibold">성분(N-P-K):</span>
                                <span>{detailModalFertilizer.N}-{detailModalFertilizer.P}-{detailModalFertilizer.K}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-semibold">포장 단위:</span>
                                <span>{detailModalFertilizer.unit}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-semibold">가격:</span>
                                <span>{detailModalFertilizer.price.toLocaleString()}원</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-semibold">권장 사용량:</span>
                                <span>{detailModalFertilizer.rate}</span>
                            </div>
                        </div>
                        <button 
                            className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm" 
                            onClick={() => setDetailModalFertilizer(null)}
                        >
                            닫기
                        </button>
                    </div>
                    </div>
            )}
            
            {/* Chatbot */}
            <button 
                onClick={() => setIsChatOpen(true)}
                className="fixed bottom-6 right-6 p-4 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-transform hover:scale-105 z-40 flex items-center justify-center"
                aria-label="Open Chatbot"
            >
                <ChatIcon />
            </button>
            <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </div>
    );
}
