
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { Fertilizer, LogEntry, User, NutrientLog } from './types';
import { NUTRIENTS, FERTILIZER_GUIDE, MONTHLY_DISTRIBUTION } from './constants';
import * as api from './api';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart, Line } from 'recharts';
import { Chatbot } from './Chatbot';
import { ChatIcon, LogoutIcon, CalculatorIcon, TrashIcon, ClipboardListIcon, PencilIcon, PlusIcon, SparklesIcon, ChevronDownIcon, ChevronUpIcon } from './icons';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { LoadingSpinner } from './LoadingSpinner';
import { FertilizerDetailModal } from './FertilizerDetailModal';
import { parseRateValue, getApplicationDetails } from './utils';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebase';

const PendingApprovalScreen = ({ username, onLogout }: { username: string, onLogout: () => void }) => (
    <div className="flex flex-col justify-center items-center min-h-screen bg-slate-100 p-4 font-sans text-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border-t-4 border-amber-500">
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4 text-3xl">⏳</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">가입 승인 대기 중</h1>
            <p className="text-slate-600 mb-6">안녕하세요, <strong>{username}</strong>님.<br/>관리자의 승인을 기다리고 있습니다. 승인이 완료되면 대시보드를 이용하실 수 있습니다.</p>
            <button onClick={onLogout} className="text-sm text-blue-600 hover:underline font-bold">다른 계정으로 로그인</button>
        </div>
    </div>
);

export default function TurfFertilizerApp() {
  const [user, setUser] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  
  const [adminFertilizers, setAdminFertilizers] = useState<Fertilizer[]>([]);
  const [userFertilizers, setUserFertilizers] = useState<Fertilizer[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  
  const [greenArea, setGreenArea] = useState<string>('');
  const [teeArea, setTeeArea] = useState<string>('');
  const [fairwayArea, setFairwayArea] = useState<string>('');
  const [selectedGuide, setSelectedGuide] = useState<string>(Object.keys(FERTILIZER_GUIDE)[0]);
  const [manualPlanMode, setManualPlanMode] = useState(false);
  const [manualTargets, setManualTargets] = useState<{ [area: string]: { N: number, P: number, K: number }[] }>({
      '그린': Array(12).fill({ N: 0, P: 0, K: 0 }),
      '티': Array(12).fill({ N: 0, P: 0, K: 0 }),
      '페어웨이': Array(12).fill({ N: 0, P: 0, K: 0 }),
  });
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);

  // UI States
  const [selectedProduct, setSelectedProduct] = useState<Fertilizer | null>(null);
  const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
  const [activeLogTab, setActiveLogTab] = useState<'그린' | '티' | '페어웨이'>('그린');
  const [logGreenArea, setLogGreenArea] = useState('');
  const [logTeeArea, setLogTeeArea] = useState('');
  const [logFairwayArea, setLogFairwayArea] = useState('');
  const [date, setDate] = useState('');
  const [applicationRate, setApplicationRate] = useState('');
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // 1. Auth & Approval Status Tracking
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
      });
      return () => unsubscribe();
    } else {
      setIsInitialDataLoading(false);
    }
  }, []);

  // 2. Data Subscription
  useEffect(() => {
    if (!user || isPendingApproval || isAdmin) return;
    const unsub = api.subscribeToAppData(user, (data) => {
      if (data) {
        if (data.fertilizers) setUserFertilizers(data.fertilizers);
        if (data.logs) setLog(data.logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        if (data.settings) {
          setGreenArea(data.settings.greenArea || '');
          setTeeArea(data.settings.teeArea || '');
          setFairwayArea(data.settings.fairwayArea || '');
          setSelectedGuide(data.settings.selectedGuide || '난지형잔디 (한국잔디)');
          setManualPlanMode(!!data.settings.manualPlanMode);
          if (data.settings.manualTargets) setManualTargets(data.settings.manualTargets);
        }
      }
    });
    return () => unsub();
  }, [user, isPendingApproval, isAdmin]);

  useEffect(() => {
    if (user && !isPendingApproval) {
        api.getFertilizers('admin').then(setAdminFertilizers);
    }
  }, [user, isPendingApproval]);

  const fertilizers = useMemo(() => [...adminFertilizers, ...userFertilizers], [adminFertilizers, userFertilizers]);

  const handleLogout = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem('turf_user');
      window.location.reload();
    }
  };

  const handleAddLog = async () => {
    const areaStr = activeLogTab === '그린' ? logGreenArea : activeLogTab === '티' ? logTeeArea : logFairwayArea;
    const parsedArea = parseFloat(areaStr);
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
    setSelectedProduct(null);
    setApplicationRate('');
  };

  const handleGetRecommendation = async () => {
    setIsLoadingAI(true);
    setAiResponse('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `당신은 데이터 기반 잔디 관리 전문가입니다. 다음 시비 기록과 구역 면적 데이터를 분석하여 향후 1개월간의 최적 시비 처방과 관리 조언을 한국어로 전문적으로 작성해주세요.
      데이터 요약:
      - 그린 면적: ${greenArea}㎡, 티 면적: ${teeArea}㎡, 페어웨이 면적: ${fairwayArea}㎡
      - 선택 가이드: ${selectedGuide}
      - 최근 시비 기록: ${JSON.stringify(log.slice(0, 5).map(l => ({ date: l.date, product: l.product, area: l.area, rate: l.applicationRate })))}
      
      답변 내용:
      1. 현재 영양 상태 진단
      2. 구역별 추천 비료 및 시비량 (보유 비료 활용)
      3. 계절적 관리 팁`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiResponse(response.text || '분석 결과를 생성할 수 없습니다.');
    } catch (e) {
      console.error(e);
      setAiResponse('AI 분석 중 오류가 발생했습니다. API 키나 네트워크 상태를 확인해주세요.');
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
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">E&L Turf Management</h1>
            <p className="text-sm text-slate-500 font-medium">{currentUser?.golfCourse} | {user}님 반갑습니다.</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all font-bold">
            <LogoutIcon /> <span>로그아웃</span>
          </button>
        </header>

        {/* 가이드 섹션 */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">📘 시비 가이드 및 계획</h2>
            <button onClick={() => setManualPlanMode(!manualPlanMode)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full font-bold border border-blue-100">
              {manualPlanMode ? '표준 가이드로 전환' : '수동 계획 모드'}
            </button>
          </div>
          <details className="group">
            <summary className="cursor-pointer text-sm text-slate-500 list-none flex items-center gap-2 select-none">
              <ChevronDownIcon className="group-open:rotate-180 transition-transform" />
              <span>상세 가이드 데이터 보기</span>
            </summary>
            <div className="mt-4 pt-4 border-t border-slate-100">
              {manualPlanMode ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['그린', '티', '페어웨이'].map(area => (
                    <div key={area} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <h3 className="font-bold mb-2 text-slate-700 text-sm">{area} 연간 계획</h3>
                      <div className="text-xs text-slate-500">누적 목표 질소(N): <span className="font-bold text-green-600">{manualTargets[area].reduce((a,b)=>a+b.N,0).toFixed(1)}g/㎡</span></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                   <p className="text-sm text-blue-800">현재 <strong>{selectedGuide}</strong> 기준 표준 권장량을 따르고 있습니다.</p>
                   <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white p-2 rounded text-xs font-bold text-green-700">N: {FERTILIZER_GUIDE[selectedGuide].N}g</div>
                      <div className="bg-white p-2 rounded text-xs font-bold text-blue-700">P: {FERTILIZER_GUIDE[selectedGuide].P}g</div>
                      <div className="bg-white p-2 rounded text-xs font-bold text-orange-700">K: {FERTILIZER_GUIDE[selectedGuide].K}g</div>
                   </div>
                </div>
              )}
            </div>
          </details>
        </section>

        {/* 시비 기록 작성 */}
        <section className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500 border-x border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2"><PlusIcon /> 시비 기록 작성</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="relative">
              <label className="text-xs font-bold text-slate-500 mb-1 block">비료 제품 선택</label>
              <button 
                onClick={() => setIsProductSelectOpen(!isProductSelectOpen)}
                className="w-full text-left p-3 border border-slate-300 rounded-lg bg-slate-50 hover:bg-white transition-all flex justify-between items-center font-medium"
              >
                <span className={selectedProduct ? "text-slate-800" : "text-slate-400"}>{selectedProduct?.name || '제품을 선택하세요'}</span>
                <ChevronDownIcon />
              </button>
              {isProductSelectOpen && (
                <div className="absolute top-full left-0 w-full z-50 mt-1 bg-white border border-slate-200 shadow-2xl rounded-lg max-h-60 overflow-y-auto">
                  {fertilizers.map(f => (
                    <div 
                      key={f.name} 
                      onClick={() => { setSelectedProduct(f); setIsProductSelectOpen(false); }}
                      className="p-3 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0 flex justify-between items-center"
                    >
                      <span className="font-bold text-slate-700">{f.name}</span>
                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">{f.usage}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
               <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">시비 날짜</label>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
               </div>
               <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">사용량 ({selectedProduct?.type === '액상' ? 'ml/㎡' : 'g/㎡'})</label>
                <input type="number" value={applicationRate} onChange={e=>setApplicationRate(e.target.value)} placeholder="0.0" className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
               </div>
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-lg mb-4 border border-slate-200">
             <div className="flex gap-2 mb-3">
               {['그린', '티', '페어웨이'].map(t => (
                 <button 
                  key={t} 
                  onClick={() => setActiveLogTab(t as any)} 
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all border ${activeLogTab === t ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}
                 >
                   {t}
                 </button>
               ))}
             </div>
             <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  placeholder={`${activeLogTab} 면적 (㎡)`} 
                  value={activeLogTab === '그린' ? logGreenArea : activeLogTab === '티' ? logTeeArea : logFairwayArea}
                  onChange={e => {
                    if(activeLogTab === '그린') setLogGreenArea(e.target.value);
                    else if(activeLogTab === '티') setLogTeeArea(e.target.value);
                    else setLogFairwayArea(e.target.value);
                  }}
                  className="w-full p-3 border border-slate-300 rounded-lg text-center font-mono text-lg focus:ring-2 focus:ring-green-500 outline-none" 
                />
                <span className="text-slate-500 font-bold">㎡</span>
             </div>
          </div>

          <button onClick={handleAddLog} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition-all flex justify-center items-center gap-2 text-lg">
            <ClipboardListIcon /> 시비 일지 저장하기
          </button>
        </section>

        {/* AI 분석 섹션 */}
        <section className="bg-gradient-to-br from-purple-600 to-indigo-700 p-8 rounded-2xl shadow-xl text-white">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-white/20 rounded-full"><SparklesIcon className="w-8 h-8" /></div>
            <h2 className="text-xl font-bold">AI 데이터 전문가 분석 및 처방</h2>
            <p className="text-purple-100 text-sm max-w-md">누적 시비 데이터를 바탕으로 현재 잔디의 영양 상태를 진단하고 최적의 처방을 제안합니다.</p>
            <button 
              onClick={handleGetRecommendation}
              disabled={isLoadingAI}
              className="px-8 py-3 bg-white text-purple-700 font-extrabold rounded-full hover:bg-purple-50 transition-all disabled:opacity-50 shadow-lg flex items-center gap-2"
            >
              {isLoadingAI ? <span className="animate-pulse">데이터 분석 중...</span> : <><SparklesIcon className="w-5 h-5"/> 맞춤 리포트 생성</>}
            </button>
          </div>
          {aiResponse && (
            <div className="mt-6 p-6 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 text-sm animate-fadeIn leading-relaxed whitespace-pre-wrap">
                {aiResponse}
            </div>
          )}
        </section>

        {/* 기록 목록 */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2"><ClipboardListIcon /> 최근 시비 기록</h2>
          <div className="grid grid-cols-1 gap-3">
            {log.length > 0 ? log.slice(0, 10).map(entry => (
              <div key={entry.id} className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm flex justify-between items-center group border border-slate-200 hover:shadow-md transition-shadow">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">{entry.date} | <span className="text-blue-500">{entry.usage}</span></div>
                  <h3 className="font-bold text-slate-800">{entry.product}</h3>
                  <div className="text-xs text-slate-500 font-medium">{entry.area.toLocaleString()}㎡ | {entry.applicationRate}{entry.applicationUnit}</div>
                </div>
                <div className="flex items-center gap-4">
                   <div className="text-right">
                     <div className="text-sm font-extrabold text-blue-600">{Math.round(entry.totalCost).toLocaleString()}원</div>
                     <div className="text-[10px] text-slate-400 font-bold">N: {entry.nutrients.N?.toFixed(2)}g / P: {entry.nutrients.P?.toFixed(2)}g</div>
                   </div>
                   <button 
                    onClick={() => { if(window.confirm('기록을 삭제하시겠습니까?')) { const n = log.filter(l=>l.id!==entry.id); setLog(n); api.saveLog(user!, n); } }}
                    className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-red-50"
                   >
                     <TrashIcon />
                   </button>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-400 font-medium">기록된 시비 데이터가 없습니다.</div>
            )}
          </div>
        </section>
        
        <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 p-4 bg-purple-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all z-40">
           <ChatIcon className="w-7 h-7" />
        </button>
      </div>
      {detailModalFertilizer && <FertilizerDetailModal fertilizer={detailModalFertilizer} onClose={() => setDetailModalFertilizer(null)} />}
    </div>
  );
}
