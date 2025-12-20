
import React, { useState, useMemo, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Fertilizer, LogEntry, User } from './types';
import { FERTILIZER_GUIDE, DEFAULT_USER_SETTINGS, UserSettings } from './constants';
import * as api from './api';
import { Chatbot } from './Chatbot';
import { ChatIcon, LogoutIcon, TrashIcon, ClipboardListIcon, PlusIcon, ChevronDownIcon } from './icons';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { LoadingSpinner } from './LoadingSpinner';
import { FertilizerDetailModal } from './FertilizerDetailModal';
import { getApplicationDetails } from './utils';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebase';

const PendingApprovalScreen = ({ username, onLogout }: { username: string, onLogout: () => void }) => (
    <div className="flex flex-col justify-center items-center min-h-screen bg-slate-100 p-4 font-sans text-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border-t-4 border-amber-500">
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4 text-3xl">⏳</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">가입 승인 대기 중</h1>
            <p className="text-slate-600 mb-6">안녕하세요, <strong>{username}</strong>님.<br/>관리자의 승인을 기다리고 있습니다. 승인이 완료되면 서비스를 이용하실 수 있습니다.</p>
            <button onClick={onLogout} className="text-sm text-blue-600 hover:underline font-bold">다른 계정으로 로그인</button>
        </div>
    </div>
);

export default function TurfFertilizerApp() {
  const [user, setUser] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  
  const [adminFertilizers, setAdminFertilizers] = useState<Fertilizer[]>([]);
  const [userFertilizers, setUserFertilizers] = useState<Fertilizer[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);

  // UI States
  const [selectedProduct, setSelectedProduct] = useState<Fertilizer | null>(null);
  const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
  const [activeLogTab, setActiveLogTab] = useState<'그린' | '티' | '페어웨이'>('그린');
  const [logArea, setLogArea] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [applicationRate, setApplicationRate] = useState('');
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    const loggedInUsername = localStorage.getItem('turf_user');
    if (loggedInUsername) {
      const unsubscribe = onSnapshot(doc(db, "users", loggedInUsername), (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data() as User;
          setCurrentUser(userData);
          setUser(loggedInUsername);
          setIsAdmin(userData.role === 'admin');
          setIsPendingApproval(userData.role !== 'admin' && !userData.isApproved);
        } else {
          localStorage.removeItem('turf_user');
          setUser(null);
        }
        setIsInitialDataLoading(false);
      }, (error) => {
        console.error("Auth snapshot error:", error);
        setIsInitialDataLoading(false);
      });
      return () => unsubscribe();
    } else {
      setIsInitialDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || isPendingApproval || isAdmin) return;
    const unsub = api.subscribeToAppData(user, (data) => {
      if (data) {
        if (data.fertilizers) setUserFertilizers(data.fertilizers);
        if (data.logs) setLog(data.logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        if (data.settings) setUserSettings({ ...DEFAULT_USER_SETTINGS, ...data.settings });
      }
    });
    return () => unsub();
  }, [user, isPendingApproval, isAdmin]);

  useEffect(() => {
    if (user && !isPendingApproval) {
        api.getFertilizers('admin').then(setAdminFertilizers);
    }
  }, [user, isPendingApproval]);

  useEffect(() => {
    // Set default area based on settings when tab changes
    if (activeLogTab === '그린') setLogArea(userSettings.greenArea);
    else if (activeLogTab === '티') setLogArea(userSettings.teeArea);
    else if (activeLogTab === '페어웨이') setLogArea(userSettings.fairwayArea);
  }, [activeLogTab, userSettings]);

  const fertilizers = useMemo(() => [...adminFertilizers, ...userFertilizers], [adminFertilizers, userFertilizers]);

  const handleLogout = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem('turf_user');
      window.location.reload();
    }
  };

  const handleAddLog = async () => {
    const parsedArea = parseFloat(logArea);
    const parsedRate = parseFloat(applicationRate);
    if (!selectedProduct || !date || isNaN(parsedArea) || isNaN(parsedRate)) {
      alert('모든 정보를 정확히 입력해주세요.'); return;
    }
    const details = getApplicationDetails(selectedProduct, parsedArea, parsedRate);
    const entry: LogEntry = {
      id: Date.now().toString(),
      date,
      product: selectedProduct.name,
      area: parsedArea,
      totalCost: details.totalCost,
      nutrients: details.nutrients,
      applicationRate: parsedRate,
      applicationUnit: selectedProduct.type === '액상' ? 'ml/㎡' : 'g/㎡',
      usage: activeLogTab,
    };
    const newLogs = [entry, ...log];
    setLog(newLogs);
    await api.saveLog(user!, newLogs);
    alert('기록이 저장되었습니다.');
    setApplicationRate('');
  };

  const handleGetRecommendation = async () => {
    if (!log.length) return alert('기록이 없습니다.');
    setIsLoadingAI(true);
    setAiResponse('');
    try {
      // Strictly use process.env.API_KEY for initializing GoogleGenAI
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `잔디 관리 전문가로서 다음 시비 데이터를 분석하여 향후 최적 시비 처방을 작성하세요: ${JSON.stringify(log.slice(0, 5))}. 한글로 답변하세요.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiResponse(response.text || '분석 결과가 없습니다.');
    } catch (e) {
      console.error(e);
      setAiResponse('AI 분석 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  if (isInitialDataLoading) return <LoadingSpinner />;
  if (!user) return <Login onLogin={(u) => { localStorage.setItem('turf_user', u); window.location.reload(); }} />;
  if (isPendingApproval) return <PendingApprovalScreen username={user} onLogout={handleLogout} />;
  if (isAdmin) return <AdminDashboard user={user} onLogout={handleLogout} />;

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        <header className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">E&L Turf Management</h1>
            <p className="text-sm text-slate-500 font-medium">{currentUser?.golfCourse} | {user}님</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all font-bold">
            <LogoutIcon /> <span>로그아웃</span>
          </button>
        </header>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2"><PlusIcon /> 시비 기록 작성</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="relative">
                    <button 
                        onClick={() => setIsProductSelectOpen(!isProductSelectOpen)}
                        className="w-full text-left p-3 border border-slate-300 rounded-lg bg-slate-50 flex justify-between items-center font-medium"
                    >
                        <span>{selectedProduct?.name || '비료 제품 선택'}</span>
                        <ChevronDownIcon />
                    </button>
                    {isProductSelectOpen && (
                        <div className="absolute top-full left-0 w-full z-50 mt-1 bg-white border border-slate-200 shadow-xl rounded-lg max-h-60 overflow-y-auto">
                            {fertilizers.map(f => (
                                <div key={f.name} onClick={() => { setSelectedProduct(f); setIsProductSelectOpen(false); }} className="p-3 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0 font-medium">
                                    {f.name} ({f.usage})
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="p-3 border rounded-lg outline-none focus:ring-2 focus:ring-green-500" />
                    <input type="number" value={applicationRate} onChange={e=>setApplicationRate(e.target.value)} placeholder="사용량" className="p-3 border rounded-lg outline-none focus:ring-2 focus:ring-green-500" />
                </div>
            </div>
            <div className="flex gap-2 mb-4">
                {['그린', '티', '페어웨이'].map(t => (
                    <button key={t} onClick={() => setActiveLogTab(t as any)} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${activeLogTab === t ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{t}</button>
                ))}
            </div>
            <input type="number" value={logArea} onChange={e=>setLogArea(e.target.value)} placeholder={`${activeLogTab} 면적 (㎡)`} className="w-full p-3 border rounded-lg mb-4 outline-none focus:ring-2 focus:ring-green-500" />
            <button onClick={handleAddLog} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition-all text-lg">기록 저장하기</button>
        </section>

        <section className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-2xl shadow-xl text-white">
          <div className="flex flex-col items-center text-center space-y-4">
            <h2 className="text-xl font-bold">AI 전문가 데이터 분석</h2>
            <p className="text-indigo-100 text-sm max-w-md">현재 시비 기록을 바탕으로 잔디 건강 상태를 체크합니다.</p>
            <button 
              onClick={handleGetRecommendation}
              disabled={isLoadingAI}
              className="px-8 py-3 bg-white text-indigo-700 font-extrabold rounded-full hover:bg-indigo-50 shadow-lg flex items-center gap-2 disabled:opacity-50"
            >
              {isLoadingAI ? '분석 중...' : '맞춤 리포트 생성'}
            </button>
          </div>
          {aiResponse && (
            <div className="mt-6 p-6 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 text-sm whitespace-pre-wrap leading-relaxed animate-fadeIn">
                {aiResponse}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2"><ClipboardListIcon /> 최근 시비 기록</h2>
          {log.length > 0 ? log.slice(0, 10).map(entry => (
            <div key={entry.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center group hover:border-blue-300 transition-colors">
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">{entry.date} | <span className="text-blue-500">{entry.usage}</span></div>
                <h3 className="font-bold text-slate-800">{entry.product}</h3>
                <div className="text-xs text-slate-500">{entry.area}㎡ | {entry.applicationRate}{entry.applicationUnit}</div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="text-right">
                   <div className="text-sm font-extrabold text-blue-600">{Math.round(entry.totalCost).toLocaleString()}원</div>
                 </div>
                 <button onClick={() => { if(window.confirm('삭제하시겠습니까?')) { const n = log.filter(l=>l.id!==entry.id); setLog(n); api.saveLog(user!, n); } }} className="p-2 text-slate-300 hover:text-red-500 transition-all"><TrashIcon /></button>
              </div>
            </div>
          )) : <div className="p-12 text-center bg-white rounded-xl border border-dashed text-slate-400">최근 시비 기록이 없습니다.</div>}
        </section>
        
        <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all z-40">
           <ChatIcon className="w-7 h-7" />
        </button>
      </div>
      {detailModalFertilizer && <FertilizerDetailModal fertilizer={detailModalFertilizer} onClose={() => setDetailModalFertilizer(null)} />}
    </div>
  );
}
