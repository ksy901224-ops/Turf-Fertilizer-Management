import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { Fertilizer, LogEntry, User } from './types';
import { NUTRIENTS, FERTILIZER_GUIDE, USAGE_CATEGORIES, MONTHLY_DISTRIBUTION } from './constants';
import * as api from './api';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart, Line } from 'recharts';
import { Chatbot } from './Chatbot';
import { ChatIcon, LogoutIcon, CalculatorIcon, TrashIcon, ClipboardListIcon, PencilIcon, SparklesIcon, ChevronDownIcon, ChevronUpIcon, UploadIcon, DownloadIcon } from './icons';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { getApplicationDetails, parseRateValue } from './utils';
import { FertilizerDetailModal } from './FertilizerDetailModal';

const LoadingSpinner = () => (
    <div className="flex justify-center items-center min-h-screen bg-slate-100">
        <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
            <p className="mt-4 text-lg text-slate-700 font-semibold">데이터를 불러오는 중...</p>
        </div>
    </div>
);

export default function TurfFertilizerApp() {
  const [user, setUser] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Data States
  const [adminFertilizers, setAdminFertilizers] = useState<Fertilizer[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  
  // Settings States
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
  const [fairwayGuideType, setFairwayGuideType] = useState<'KBG' | 'Zoysia'>('KBG');

  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);

  // UI States
  const [activePlanTab, setActivePlanTab] = useState<string>('그린');
  const [showLastYearComparison, setShowLastYearComparison] = useState(false);
  const planFileInputRef = useRef<HTMLInputElement>(null);
  const logSectionRef = useRef<HTMLElement>(null);

  const [selectedProduct, setSelectedProduct] = useState<Fertilizer | null>(null);
  const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
  
  // Fertilizer List Filter State
  const [filterUsage, setFilterUsage] = useState<string>('전체');
  const [filterType, setFilterType] = useState<string>('전체');
  const [isFertilizerListOpen, setIsFertilizerListOpen] = useState(false);
  
  // Log entry form states
  const [activeLogTab, setActiveLogTab] = useState<'그린' | '티' | '페어웨이'>('그린');
  const [logGreenArea, setLogGreenArea] = useState('');
  const [logTeeArea, setLogTeeArea] = useState('');
  const [logFairwayArea, setLogFairwayArea] = useState('');
  const [date, setDate] = useState('');
  const [applicationRate, setApplicationRate] = useState('');
  const [topdressing, setTopdressing] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logFilterType, setLogFilterType] = useState<string>('전체');
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
  
  // Reverse Calculator State
  const [isReverseCalcOpen, setIsReverseCalcOpen] = useState(false);
  const [targetNutrientType, setTargetNutrientType] = useState<'N'|'P'|'K'>('N');
  const [targetNutrientAmount, setTargetNutrientAmount] = useState('');

  // Analysis States
  const [analysisCategory, setAnalysisCategory] = useState<'all' | '그린' | '티' | '페어웨이'>('all');
  const [analysisFairwayType, setAnalysisFairwayType] = useState<'KBG' | 'Zoysia'>('KBG');
  const [isCumulative, setIsCumulative] = useState(false);

  // AI & Chat
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<{productName: string, targetArea: string, rate: number, reason: string} | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Calculator
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calculatorProduct, setCalculatorProduct] = useState<Fertilizer | null>(null);
  const [calculatorArea, setCalculatorArea] = useState('');
  const [calculatorRate, setCalculatorRate] = useState('');
  const [calculatorResults, setCalculatorResults] = useState<{
    totalAmount: number;
    totalCost: number;
    nutrients: any;
    nutrientsPerM2: any;
    unit: 'kg' | 'L';
  } | null>(null);

  // Log Sorting and Filtering
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // --- Authentication ---
  useEffect(() => {
    const checkUser = async () => {
        const loggedInUser = localStorage.getItem('turf_user');
        if (loggedInUser) {
            const userData = await api.getUser(loggedInUser);
            setCurrentUser(userData);
            if (loggedInUser === 'admin') {
                setIsAdmin(true);
            }
            setUser(loggedInUser);
        } else {
            setIsInitialDataLoading(false); 
        }
    };
    checkUser();
  }, []);

  // --- Data Loading (Real-time Subscriptions) ---
  useEffect(() => {
    if (!user) return;

    // Load Admin Fertilizers (Master List)
    const unsubscribeAdmin = api.subscribeToAppData('admin', (data) => {
        if (data && data.fertilizers) {
            setAdminFertilizers(data.fertilizers);
        }
    });

    let unsubscribeUser: () => void = () => {};

    if (user !== 'admin') {
        unsubscribeUser = api.subscribeToAppData(user, (data) => {
            if (data) {
                if (data.logs) setLog(data.logs);
                if (data.settings) {
                    setGreenArea(data.settings.greenArea || '');
                    setTeeArea(data.settings.teeArea || '');
                    setFairwayArea(data.settings.fairwayArea || '');
                    setSelectedGuide(data.settings.selectedGuide || Object.keys(FERTILIZER_GUIDE)[0]);
                    setManualPlanMode(data.settings.manualPlanMode || false);
                    if (data.settings.manualTargets) setManualTargets(data.settings.manualTargets);
                    if (data.settings.fairwayGuideType) setFairwayGuideType(data.settings.fairwayGuideType);
                }
            }
            setIsInitialDataLoading(false);
        });
    } else {
        setIsInitialDataLoading(false);
    }

    return () => {
        unsubscribeAdmin();
        unsubscribeUser();
    };
  }, [user]);

  // --- Derived State ---
  const fertilizers = useMemo(() => adminFertilizers, [adminFertilizers]);

  const uniqueTypes = useMemo(() => {
      const types = new Set(fertilizers.map(f => f.type));
      return Array.from(types).sort();
  }, [fertilizers]);

  const filteredFertilizersList = useMemo(() => {
    return fertilizers.filter(f => {
        const matchUsage = filterUsage === '전체' || f.usage === filterUsage;
        const matchType = filterType === '전체' || f.type === filterType;
        return matchUsage && matchType;
    });
  }, [fertilizers, filterUsage, filterType]);

  // --- Handlers ---

  const handleSaveSettings = async () => {
      if (!user || user === 'admin') return;
      await api.saveSettings(user, {
          greenArea,
          teeArea,
          fairwayArea,
          selectedGuide,
          manualPlanMode,
          manualTargets,
          fairwayGuideType
      });
  };

  const handleLogin = async (username: string) => {
    localStorage.setItem('turf_user', username);
    const userData = await api.getUser(username);
    setCurrentUser(userData);
    if (username === 'admin') setIsAdmin(true);
    setUser(username);
  };

  const handleLogout = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('turf_user');
        setUser(null);
        setCurrentUser(null);
        setIsAdmin(false);
        // Reset states
        setLog([]);
        setGreenArea('');
        setTeeArea('');
        setFairwayArea('');
    }
  };

  // Sync log area inputs when tabs change or settings load
  useEffect(() => {
      if (activeLogTab === '그린') setLogGreenArea(greenArea);
      else if (activeLogTab === '티') setLogTeeArea(teeArea);
      else if (activeLogTab === '페어웨이') setLogFairwayArea(fairwayArea);
  }, [activeLogTab, greenArea, teeArea, fairwayArea]);

  const handleAddLog = async () => {
    if (!selectedProduct) { alert('선택 필요: 비료를 선택하세요.'); return; }
    if (!date || !applicationRate) { alert('입력 필요: 날짜와 사용량을 입력하세요.'); return; }
    if (!user) return;

    const areaStr = activeLogTab === '그린' ? logGreenArea : activeLogTab === '티' ? logTeeArea : logFairwayArea;
    const usage = activeLogTab;
    const parsedArea = parseFloat(areaStr);
    const parsedRate = parseFloat(applicationRate);

    if (isNaN(parsedRate) || parsedRate < 0) { alert('입력 오류: 사용량은 0 이상이어야 합니다.'); return; }
    if (isNaN(parsedArea) || parsedArea <= 0) { alert('입력 필요: 0보다 큰 면적을 입력하세요.'); return; }

    const parsedTopdressing = topdressing ? parseFloat(topdressing) : undefined;
    const { totalCost, nutrients, nutrientCosts } = getApplicationDetails(selectedProduct, parsedArea, parsedRate);
    const rateUnit = selectedProduct.type === '액상' ? 'ml/㎡' : 'g/㎡';

    const entry: LogEntry = {
        id: `${Date.now()}-${usage}-${Math.random()}`,
        date,
        product: selectedProduct.name,
        area: parsedArea,
        totalCost: Number(totalCost.toFixed(2)),
        nutrients, 
        applicationRate: parsedRate,
        applicationUnit: rateUnit,
        usage,
        nutrientCosts,
        topdressing: parsedTopdressing
    };

    const newLog = [entry, ...log];
    // Optimistic update not needed as subscription handles it, but saving to DB
    await api.saveLog(user, newLog);
    
    alert(`완료: ${usage} 구역에 시비 기록이 추가되었습니다.`);
    setIsProductSelectOpen(false);
    setLogSearchTerm('');
    setLogFilterType('전체');
    setTopdressing('');
  };

  const removeLogEntry = async (idToRemove: string) => {
    if (!user) return;
    if (window.confirm('해당 일지를 삭제하시겠습니까?')) {
      const newLog = log.filter(entry => entry.id !== idToRemove);
      await api.saveLog(user, newLog);
    }
  };

  // Manual Target Change - triggers save
  const handleManualTargetChange = async (monthIndex: number, nutrient: 'N' | 'P' | 'K', value: string) => {
      const currentAreaTargets = [...manualTargets[activePlanTab]];
      currentAreaTargets[monthIndex] = { 
          ...currentAreaTargets[monthIndex], 
          [nutrient]: parseFloat(value) || 0 
      };
      
      const newTargets = { ...manualTargets, [activePlanTab]: currentAreaTargets };
      setManualTargets(newTargets);
  };
  
  // Specific handler for saving manual targets (e.g. onBlur)
  const saveManualTargets = async () => {
      if (user && user !== 'admin') {
          await api.saveSettings(user, {
              greenArea, teeArea, fairwayArea, selectedGuide, manualPlanMode, manualTargets, fairwayGuideType
          });
      }
  };

  // --- Calculations & Analysis (Memoized) ---
  
  const estimatedCost = useMemo(() => {
        const parsedApplicationRate = parseFloat(applicationRate);
        const areaStr = activeLogTab === '그린' ? logGreenArea : activeLogTab === '티' ? logTeeArea : logFairwayArea;
        const area = parseFloat(areaStr) || 0;
        return getApplicationDetails(selectedProduct, area, parsedApplicationRate).totalCost;
  }, [selectedProduct, activeLogTab, logGreenArea, logTeeArea, logFairwayArea, applicationRate]);

  const nutrientPreview = useMemo(() => {
        if (!selectedProduct || !applicationRate) return null;
        const rate = parseFloat(applicationRate);
        if (isNaN(rate) || rate <= 0) return null;
        return getApplicationDetails(selectedProduct, 1, rate).nutrients;
  }, [selectedProduct, applicationRate]);

  const groupedFertilizers = useMemo(() => {
      let filtered = fertilizers;
      if (logSearchTerm) filtered = filtered.filter(f => f.name.toLowerCase().includes(logSearchTerm.toLowerCase()));
      if (logFilterType !== '전체') filtered = filtered.filter(f => f.type === logFilterType);
      
      const groups: Record<string, Fertilizer[]> = { '그린': [], '티': [], '페어웨이': [], '기타': [] };
      filtered.forEach(f => {
          if (groups[f.usage]) groups[f.usage].push(f);
          else groups['기타'].push(f);
      });
      return groups;
  }, [fertilizers, logSearchTerm, logFilterType]);

  const monthlyNutrientChartData = useMemo<any[]>(() => {
      const data: any = {};
      let guideKey = '';
      let usingManualTarget = manualPlanMode && analysisCategory !== 'all';
      
      if (!usingManualTarget) {
           if (analysisCategory === '그린') guideKey = '한지형잔디 (벤트그라스)';
           else if (analysisCategory === '티') guideKey = '한지형잔디 (켄터키블루그라스)';
           else if (analysisCategory === '페어웨이') guideKey = analysisFairwayType === 'KBG' ? '한지형잔디 (켄터키블루그라스)' : '난지형잔디 (한국잔디)';
      }

      for(let i=0; i<12; i++) {
          const currentYear = new Date().getFullYear();
          const monthKey = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
          let gN = 0, gP = 0, gK = 0;
          
          if (usingManualTarget) {
               const targets = manualTargets[analysisCategory];
               if (targets && targets[i]) { gN = targets[i].N; gP = targets[i].P; gK = targets[i].K; }
          } else if (guideKey && FERTILIZER_GUIDE[guideKey] && MONTHLY_DISTRIBUTION[guideKey]) {
              const guide = FERTILIZER_GUIDE[guideKey];
              const dist = MONTHLY_DISTRIBUTION[guideKey];
              gN = guide.N * dist.N[i]; gP = guide.P * dist.P[i]; gK = guide.K * dist.K[i];
          }
          data[monthKey] = { month: monthKey, N: 0, P: 0, K: 0, guideN: parseFloat(gN.toFixed(2)), guideP: parseFloat(gP.toFixed(2)), guideK: parseFloat(gK.toFixed(2)) };
      }

      const filteredLog = analysisCategory === 'all' ? log : log.filter(e => e.usage === analysisCategory);
      filteredLog.forEach(entry => {
          const d = new Date(entry.date);
          if (d.getFullYear() === new Date().getFullYear()) {
              const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              const product = fertilizers.find(f => f.name === entry.product);
              if (data[monthKey] && product) {
                  const nutrientsPerM2 = getApplicationDetails(product, 1, entry.applicationRate).nutrients;
                  data[monthKey].N += nutrientsPerM2.N || 0;
                  data[monthKey].P += nutrientsPerM2.P || 0;
                  data[monthKey].K += nutrientsPerM2.K || 0;
              }
          }
      });
      return Object.values(data).sort((a:any, b:any) => a.month.localeCompare(b.month));
  }, [log, analysisCategory, analysisFairwayType, manualPlanMode, manualTargets, fertilizers]);

  const finalAnalysisData = useMemo<any[]>(() => {
      if (!isCumulative) return monthlyNutrientChartData;
      let cumN = 0, cumP = 0, cumK = 0, cumGuideN = 0, cumGuideP = 0, cumGuideK = 0;
      return (monthlyNutrientChartData as any[]).map(item => {
          cumN += item.N; cumP += item.P; cumK += item.K;
          cumGuideN += item.guideN; cumGuideP += item.guideP; cumGuideK += item.guideK;
          return { ...item, N: Number(cumN.toFixed(2)), P: Number(cumP.toFixed(2)), K: Number(cumK.toFixed(2)), guideN: Number(cumGuideN.toFixed(2)), guideP: Number(cumGuideP.toFixed(2)), guideK: Number(cumGuideK.toFixed(2)) };
      });
  }, [monthlyNutrientChartData, isCumulative]);

  // --- AI Functions ---
  const handleGetRecommendation = async () => {
    setIsLoadingAI(true);
    setAiResponse(''); setAiError(null); setAiAction(null);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `
            Analyze turf data: 
            Area: Green ${greenArea}, Tee ${teeArea}, FW ${fairwayArea}.
            Current Log: ${JSON.stringify(log.slice(0,5))}
            Stock: ${JSON.stringify(fertilizers.slice(0,10))}
            Provide fertilizer recommendation in Korean Markdown.
            At end, provide JSON action: {"productName": string, "targetArea": string, "rate": number, "reason": string}
        `;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const text = response.text || '';
        
        let jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) || text.match(/(\{[\s\S]*"productName"[\s\S]*\})/);
        if (jsonMatch) {
            try {
                const action = JSON.parse(jsonMatch[1]);
                if (action.productName) {
                    setAiAction(action);
                    setAiResponse(text.replace(jsonMatch[0], ''));
                } else setAiResponse(text);
            } catch { setAiResponse(text); }
        } else {
            setAiResponse(text);
        }
    } catch (e) {
        console.error(e);
        setAiError("AI 호출 중 오류가 발생했습니다.");
    } finally {
        setIsLoadingAI(false);
    }
  };

  const handleApplyAiAction = () => {
        if(!aiAction) return;
        const product = fertilizers.find(f => f.name === aiAction.productName);
        if(product) {
            setSelectedProduct(product);
            setApplicationRate(aiAction.rate.toString());
            setDate(new Date().toISOString().split('T')[0]);
            if (['그린', '티', '페어웨이'].includes(aiAction.targetArea)) {
                setActiveLogTab(aiAction.targetArea as any);
            }
            logSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
  };

  // --- Render ---

  if (!user) return <Login onLogin={handleLogin} />;
  if (isInitialDataLoading) return <LoadingSpinner />;
  if (isAdmin) return <AdminDashboard user={user} onLogout={handleLogout} />;

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center relative py-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800">잔디 비료 관리 앱</h1>
          <p className="text-slate-600 mt-2">Turf Fertilizer Management</p>
           <div className="absolute top-4 right-0 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600 hidden sm:inline">
                {currentUser?.golfCourse}님
              </span>
              <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 bg-slate-200 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-300 transition-colors">
                  <LogoutIcon />
              </button>
          </div>
        </header>

        {/* Settings / Guide Section */}
        <section className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-slate-700">📘 연간 계획 설정</h2>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-slate-600">수동 계획 모드</label>
                    <input 
                        type="checkbox" 
                        checked={manualPlanMode} 
                        onChange={(e) => {
                            setManualPlanMode(e.target.checked);
                            handleSaveSettings();
                        }}
                        className="toggle-checkbox"
                    />
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-green-800 mb-1">그린 면적 (㎡)</label>
                    <input 
                        type="number" 
                        value={greenArea} 
                        onChange={(e) => setGreenArea(e.target.value)}
                        onBlur={handleSaveSettings}
                        className="w-full p-2 border rounded"
                        placeholder="면적 입력"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-blue-800 mb-1">티 면적 (㎡)</label>
                    <input 
                        type="number" 
                        value={teeArea} 
                        onChange={(e) => setTeeArea(e.target.value)}
                        onBlur={handleSaveSettings}
                        className="w-full p-2 border rounded"
                        placeholder="면적 입력"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-orange-800 mb-1">페어웨이 면적 (㎡)</label>
                    <input 
                        type="number" 
                        value={fairwayArea} 
                        onChange={(e) => setFairwayArea(e.target.value)}
                        onBlur={handleSaveSettings}
                        className="w-full p-2 border rounded"
                        placeholder="면적 입력"
                    />
                </div>
            </div>

            {manualPlanMode && (
                <div className="mt-4">
                    <div className="flex border-b mb-2">
                        {['그린', '티', '페어웨이'].map(tab => (
                            <button 
                                key={tab} 
                                onClick={() => setActivePlanTab(tab)}
                                className={`px-4 py-2 font-bold text-sm ${activePlanTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-center">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="p-2">월</th>
                                    <th className="p-2 text-green-700">N</th>
                                    <th className="p-2 text-blue-700">P</th>
                                    <th className="p-2 text-orange-700">K</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(manualTargets[activePlanTab] || []).map((target, i) => (
                                    <tr key={i} className="border-b">
                                        <td className="p-1 font-medium bg-slate-50">{i+1}월</td>
                                        <td className="p-1"><input type="number" step="0.1" className="w-full text-center border rounded" value={target.N || ''} onChange={e => handleManualTargetChange(i, 'N', e.target.value)} onBlur={saveManualTargets} /></td>
                                        <td className="p-1"><input type="number" step="0.1" className="w-full text-center border rounded" value={target.P || ''} onChange={e => handleManualTargetChange(i, 'P', e.target.value)} onBlur={saveManualTargets} /></td>
                                        <td className="p-1"><input type="number" step="0.1" className="w-full text-center border rounded" value={target.K || ''} onChange={e => handleManualTargetChange(i, 'K', e.target.value)} onBlur={saveManualTargets} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </section>

        {/* Log Entry Section */}
        <section ref={logSectionRef} className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <PencilIcon /> 시비 기록 작성
            </h2>
            
            <div className="space-y-4">
                <div className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1">비료 선택</label>
                    <div 
                        className="w-full p-3 border rounded-md cursor-pointer bg-slate-50 flex justify-between items-center"
                        onClick={() => setIsProductSelectOpen(!isProductSelectOpen)}
                    >
                        <span className={selectedProduct ? 'font-bold text-slate-800' : 'text-slate-400'}>
                            {selectedProduct ? `${selectedProduct.name} (${selectedProduct.N}-${selectedProduct.P}-${selectedProduct.K})` : '제품을 선택하세요'}
                        </span>
                        <ChevronDownIcon className="w-4 h-4 text-slate-500" />
                    </div>
                    {isProductSelectOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                            <input 
                                type="text" 
                                className="w-full p-2 border-b sticky top-0 bg-white" 
                                placeholder="검색..." 
                                value={logSearchTerm}
                                onChange={e => setLogSearchTerm(e.target.value)}
                                onClick={e => e.stopPropagation()}
                            />
                            {Object.entries(groupedFertilizers).map(([grp, items]: [string, Fertilizer[]]) => (
                                items.length > 0 && (
                                    <div key={grp}>
                                        <div className="px-3 py-1 bg-slate-100 text-xs font-bold text-slate-500">{grp}</div>
                                        {items.map(f => (
                                            <div 
                                                key={f.name} 
                                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                                                onClick={() => {
                                                    setSelectedProduct(f);
                                                    setApplicationRate(parseRateValue(f.rate).toString());
                                                    setDate(new Date().toISOString().split('T')[0]);
                                                    setIsProductSelectOpen(false);
                                                }}
                                            >
                                                {f.name} <span className="text-xs text-slate-400">({f.type})</span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">날짜</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">사용량 ({selectedProduct?.type === '액상' ? 'ml' : 'g'}/㎡)</label>
                        <input type="number" value={applicationRate} onChange={e => setApplicationRate(e.target.value)} className="w-full p-2 border rounded" placeholder="0" />
                    </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border">
                    <div className="flex gap-2 mb-3">
                        {['그린', '티', '페어웨이'].map(tab => (
                            <button 
                                key={tab} 
                                onClick={() => setActiveLogTab(tab as any)}
                                className={`flex-1 py-1 text-sm font-bold rounded ${activeLogTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">{activeLogTab} 면적 (㎡)</label>
                    <input 
                        type="number" 
                        value={activeLogTab === '그린' ? logGreenArea : activeLogTab === '티' ? logTeeArea : logFairwayArea}
                        onChange={e => {
                            const val = e.target.value;
                            if (activeLogTab === '그린') setLogGreenArea(val);
                            else if (activeLogTab === '티') setLogTeeArea(val);
                            else setLogFairwayArea(val);
                        }}
                        className="w-full p-2 border rounded font-mono"
                    />
                    <div className="mt-2 text-right text-xs text-slate-500">
                        예상 비용: <strong>{Math.round(estimatedCost).toLocaleString()}원</strong>
                    </div>
                </div>

                <button onClick={handleAddLog} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors">
                    기록 추가
                </button>
            </div>
        </section>

        {/* Analysis Chart */}
        <section className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-slate-700 mb-4">📊 투입 현황 분석</h2>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={finalAnalysisData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tickFormatter={v => v.split('-')[1] + '월'} fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="N" name="질소(N)" fill="#22c55e" stackId="a" />
                        <Bar dataKey="P" name="인산(P)" fill="#3b82f6" stackId="a" />
                        <Bar dataKey="K" name="칼륨(K)" fill="#f97316" stackId="a" />
                        {!isCumulative && <Line type="monotone" dataKey="guideN" name="가이드 N" stroke="#15803d" strokeDasharray="3 3" />}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-4">
                <button onClick={() => setIsCumulative(false)} className={`px-3 py-1 rounded text-sm ${!isCumulative ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-500'}`}>월별 보기</button>
                <button onClick={() => setIsCumulative(true)} className={`px-3 py-1 rounded text-sm ${isCumulative ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-500'}`}>누적 보기</button>
            </div>
        </section>

        {/* AI & Chat */}
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
            <button onClick={() => setIsChatOpen(true)} className="bg-purple-600 p-4 rounded-full text-white shadow-lg hover:bg-purple-700 transition-transform hover:scale-110">
                <ChatIcon />
            </button>
        </div>
        <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

        {/* Detail Modal */}
        {detailModalFertilizer && (
            <FertilizerDetailModal fertilizer={detailModalFertilizer} onClose={() => setDetailModalFertilizer(null)} />
        )}
      </div>
    </div>
  );
}