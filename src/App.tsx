
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { Fertilizer, LogEntry, User, NutrientLog } from './types';
import { NUTRIENTS, FERTILIZER_GUIDE, USAGE_CATEGORIES, MONTHLY_DISTRIBUTION, FERTILIZER_TYPE_GROUPS, TYPE_CATEGORIES } from './constants';
import * as api from './api';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart, Line } from 'recharts';
import { Chatbot } from './Chatbot';
import { ChatIcon, LogoutIcon, CalculatorIcon, TrashIcon, ClipboardListIcon, PencilIcon, SparklesIcon, ChevronDownIcon, ChevronUpIcon, UploadIcon, DownloadIcon } from './icons';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { LoadingSpinner } from './LoadingSpinner';
import { FertilizerDetailModal } from './FertilizerDetailModal';
import { parseRateValue, getApplicationDetails } from './utils';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebase';

// New Component for Pending State
const PendingApprovalScreen = ({ username, onLogout }: { username: string, onLogout: () => void }) => {
    return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-slate-100 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center border-t-4 border-amber-500">
                <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-3xl">⏳</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-800 mb-2">가입 승인 대기 중</h1>
                <p className="text-slate-600 mb-6">
                    안녕하세요, <strong>{username}</strong>님.<br/>
                    관리자의 승인을 기다리고 있습니다. 승인이 완료되면 자동으로 화면이 전환됩니다.
                </p>
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-50 p-2 rounded">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        실시간 상태 확인 중...
                    </div>
                    <button onClick={onLogout} className="text-sm text-slate-500 hover:text-slate-700 underline">
                        다른 계정으로 로그인
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function TurfFertilizerApp() {
  const [user, setUser] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  
  // Data States
  const [adminFertilizers, setAdminFertilizers] = useState<Fertilizer[]>([]);
  const [userFertilizers, setUserFertilizers] = useState<Fertilizer[]>([]);
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
  const logSectionRef = useRef<HTMLElement>(null);
  const planFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<Fertilizer | null>(null);
  const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
  const [filterUsage, setFilterUsage] = useState<string>('전체');
  const [filterType, setFilterType] = useState<string>('전체');
  const [isFertilizerListOpen, setIsFertilizerListOpen] = useState(false);
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
  const [isReverseCalcOpen, setIsReverseCalcOpen] = useState(false);
  const [targetNutrientType, setTargetNutrientType] = useState<'N'|'P'|'K'>('N');
  const [targetNutrientAmount, setTargetNutrientAmount] = useState('');
  const [analysisCategory, setAnalysisCategory] = useState<'all' | '그린' | '티' | '페어웨이'>('all');
  const [analysisFairwayType, setAnalysisFairwayType] = useState<'KBG' | 'Zoysia'>('KBG');
  const [isCumulative, setIsCumulative] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<{productName: string, targetArea: string, rate: number, reason: string} | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calculatorProduct, setCalculatorProduct] = useState<Fertilizer | null>(null);
  const [calculatorArea, setCalculatorArea] = useState('');
  const [calculatorRate, setCalculatorRate] = useState('');
  const [calculatorResults, setCalculatorResults] = useState<{
    totalAmount: number;
    totalCost: number;
    nutrients: NutrientLog;
    nutrientsPerM2: NutrientLog;
    unit: 'kg' | 'L';
  } | null>(null);
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // 1. Auth Check (On Mount)
  useEffect(() => {
    const checkUser = async () => {
        const loggedInUsername = localStorage.getItem('turf_user');
        if (loggedInUsername) {
            // Subscribe to User Doc for real-time approval status
            const unsubscribe = onSnapshot(doc(db, "users", loggedInUsername), (docSnap) => {
                if (docSnap.exists()) {
                    const userData = docSnap.data() as User;
                    setCurrentUser(userData);
                    setUser(loggedInUsername);
                    // Check role field instead of username string
                    const isAdminUser = userData.role === 'admin';
                    setIsAdmin(isAdminUser);
                    
                    if (!isAdminUser && !userData.isApproved) {
                        setIsPendingApproval(true);
                    } else {
                        setIsPendingApproval(false);
                    }
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
    };
    checkUser();
  }, []);

  // 2. Data Subscription (When User is Set and Approved)
  useEffect(() => {
    if (!user || isPendingApproval) {
        return;
    }

    setIsInitialDataLoading(true);

    // If Admin, AdminDashboard handles its own subscriptions
    if (isAdmin) {
        setIsInitialDataLoading(false);
        return;
    }

    // Load Master Fertilizers
    const fetchAdminFertilizers = async () => {
        const fetched = await api.getFertilizers('admin');
        setAdminFertilizers(fetched);
    };
    fetchAdminFertilizers();

    // Subscribe to User's App Data
    const unsubscribe = api.subscribeToAppData(user, (data) => {
        if (data) {
            if (data.fertilizers) setUserFertilizers(data.fertilizers);
            if (data.logs) setLog(data.logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            
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

    return () => unsubscribe();
  }, [user, isAdmin, isPendingApproval]);

  // Combined Fertilizers
  const fertilizers = useMemo(() => {
      return [...adminFertilizers, ...userFertilizers];
  }, [adminFertilizers, userFertilizers]);

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

  // Group Fertilizers for Select
  const groupedFertilizers = useMemo(() => {
      let filtered = fertilizers;
      if (logSearchTerm) {
          filtered = filtered.filter(f => f.name.toLowerCase().includes(logSearchTerm.toLowerCase()));
      }
      if (logFilterType !== '전체') {
          filtered = filtered.filter(f => f.type === logFilterType);
      }
      
      const groups: Record<string, Fertilizer[]> = {
          '그린': [], '티': [], '페어웨이': []
      };
      
      filtered.forEach(f => {
          if (groups[f.usage]) groups[f.usage].push(f);
          else {
              // Fallback or other
              if(!groups['기타']) groups['기타'] = [];
              groups['기타'].push(f);
          }
      });
      return groups;
  }, [fertilizers, logSearchTerm, logFilterType]);

  const handleManualTargetChange = (monthIndex: number, nutrient: 'N' | 'P' | 'K', value: string) => {
      const currentAreaTargets = [...manualTargets[activePlanTab]];
      currentAreaTargets[monthIndex] = { 
          ...currentAreaTargets[monthIndex], 
          [nutrient]: parseFloat(value) || 0 
      };
      
      setManualTargets(prev => ({
          ...prev,
          [activePlanTab]: currentAreaTargets
      }));
  };

  // Plan Import Function
  const handleImportPlan = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          // Expected Format: Month (1-12), N, P, K
          const newTargets = Array(12).fill({ N: 0, P: 0, K: 0 });
          jsonData.forEach((row: any) => {
              const month = parseInt(row['월'] || row['Month']);
              if (month >= 1 && month <= 12) {
                  newTargets[month - 1] = {
                      N: parseFloat(row['N'] || 0),
                      P: parseFloat(row['P'] || 0),
                      K: parseFloat(row['K'] || 0),
                  };
              }
          });

          setManualTargets(prev => ({
              ...prev,
              [activePlanTab]: newTargets
          }));
          alert(`${activePlanTab} 구역의 연간 계획이 불러와졌습니다.`);
          if (planFileInputRef.current) planFileInputRef.current.value = '';
      };
      reader.readAsArrayBuffer(file);
  };

  const handleAddLog = async () => {
    if (!selectedProduct) { alert('선택 필요: 비료를 선택하세요.'); return; }
    if (!date || !applicationRate) { alert('입력 필요: 날짜와 사용량을 입력하세요.'); return; }
    
    // Only log the area for the active tab
    const areaStr = activeLogTab === '그린' ? logGreenArea : activeLogTab === '티' ? logTeeArea : logFairwayArea;
    const usage = activeLogTab;

    const parsedApplicationRate = parseFloat(applicationRate);
    if (isNaN(parsedApplicationRate) || parsedApplicationRate < 0) {
        alert('입력 오류: 사용량은 0 이상인 숫자여야 합니다.'); 
        return;
    }
    
    const parsedArea = parseFloat(areaStr);
    if (isNaN(parsedArea) || parsedArea <= 0) {
         alert('입력 필요: 0보다 큰 면적을 입력하세요.');
         return;
    }
    
    const parsedTopdressing = topdressing ? parseFloat(topdressing) : undefined;
    
    const { totalCost, nutrients, nutrientCosts } = getApplicationDetails(selectedProduct, parsedArea, parsedApplicationRate);
    const rateUnit = selectedProduct.type === '액상' ? 'ml/㎡' : 'g/㎡';

    const entry: LogEntry = {
        id: `${Date.now()}-${usage}-${Math.random()}`,
        date,
        product: selectedProduct.name,
        area: parsedArea,
        totalCost: Number(totalCost.toFixed(2)),
        nutrients: nutrients, 
        applicationRate: parsedApplicationRate,
        applicationUnit: rateUnit,
        usage: usage,
        nutrientCosts: nutrientCosts,
        topdressing: parsedTopdressing
    };

    const newLog = [entry, ...log].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setLog(newLog);
    
    if (user && !isAdmin) {
        await api.saveLog(user, newLog);
    }
    
    alert(`완료: ${usage} 구역에 시비 기록이 추가되었습니다.`);
    setIsProductSelectOpen(false); // Close product select if open
    setLogSearchTerm('');
    setLogFilterType('전체');
    setTopdressing(''); // Reset topdressing field
  };

  // Save changes to Firestore (Debounced or on Effect)
  const saveSettingsToFirestore = async () => {
      if (user && !isAdmin && !isInitialDataLoading && !isPendingApproval) {
          await api.saveSettings(user, { 
              greenArea, 
              teeArea, 
              fairwayArea, 
              selectedGuide, 
              manualPlanMode, 
              manualTargets, 
              fairwayGuideType 
          });
      }
  };

  // Debounced save for settings
  useEffect(() => {
      const handler = setTimeout(() => {
          saveSettingsToFirestore();
      }, 1000);
      return () => clearTimeout(handler);
  }, [greenArea, teeArea, fairwayArea, selectedGuide, manualPlanMode, manualTargets, fairwayGuideType, user, isAdmin, isPendingApproval]);

  
  const handleLogin = async (username: string) => {
    localStorage.setItem('turf_user', username);
    // Force a check immediately
    const userData = await api.getUser(username);
    if(userData) {
        setUser(username);
        setCurrentUser(userData);
        const isAdminUser = userData.role === 'admin';
        setIsAdmin(isAdminUser);
        if (!isAdminUser && !userData.isApproved) {
            setIsPendingApproval(true);
        }
    }
  };

  const handleLogout = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('turf_user');
        setUser(null);
        setCurrentUser(null);
        setIsAdmin(false);
        setIsPendingApproval(false);
        // Reset UI
        setAdminFertilizers([]);
        setUserFertilizers([]);
        setLog([]);
        setManualTargets({
          '그린': Array(12).fill({ N: 0, P: 0, K: 0 }),
          '티': Array(12).fill({ N: 0, P: 0, K: 0 }),
          '페어웨이': Array(12).fill({ N: 0, P: 0, K: 0 }),
        });
        setGreenArea('');
        setTeeArea('');
        setFairwayArea('');
    }
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (isInitialDataLoading) {
    return <LoadingSpinner />;
  }
  
  // Role-based Routing
  if (isPendingApproval && !isAdmin) {
      return <PendingApprovalScreen username={user} onLogout={handleLogout} />;
  }
  
  if (isAdmin) {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  // The rest is the User App View...
  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center relative py-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800">잔디 비료 관리 앱</h1>
          <p className="text-slate-600 mt-2">Turf Fertilizer Management</p>
           <div className="absolute top-4 right-0 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600 hidden sm:inline">
                {currentUser?.golfCourse && currentUser.golfCourse !== '관리자' ? `${currentUser.golfCourse} ` : ''}
                안녕하세요, {user}님
              </span>
              <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 bg-slate-200 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-300 transition-colors" title="로그아웃">
                  <LogoutIcon />
                  <span className="hidden sm:inline">로그아웃</span>
              </button>
          </div>
        </header>
        
        {/* Annual Guide & Selection */}
        <section className="bg-white p-6 rounded-lg shadow-md">
            <div className="border-b pb-3 mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-700">📘 연간 시비 계획 및 가이드</h2>
                <button onClick={() => setManualPlanMode(!manualPlanMode)} className={`text-sm px-3 py-1 rounded transition-colors ${manualPlanMode ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {manualPlanMode ? '가이드 보기' : '직접 계획 수립하기'}
                </button>
            </div>
            <details className="group">
                <summary className="cursor-pointer font-medium text-slate-600 flex items-center gap-2 select-none mb-4">
                     <span className="transition-transform group-open:rotate-90">▶</span> 상세 계획 보기/숨기기
                </summary>
                <div className="animate-fadeIn">
                    {!manualPlanMode ? (
                        // ... Standard Guide ...
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6">
                             <div className="flex border-b border-amber-200 mb-3 flex-wrap">
                                {Object.keys(FERTILIZER_GUIDE).map(grassType => (
                                    <button key={grassType} onClick={() => setSelectedGuide(grassType)} className={`px-3 py-2 text-sm sm:text-base font-semibold transition-colors -mb-px border-b-2 ${ selectedGuide === grassType ? 'text-amber-800 border-amber-600' : 'text-amber-600 border-transparent hover:border-amber-400' }`}>
                                        {grassType}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-center mb-4">
                                {Object.entries(FERTILIZER_GUIDE[selectedGuide]).map(([nutrient, amount]) => (
                                    <div key={nutrient} className="text-sm">
                                        <div className="font-bold text-slate-700 text-base">{nutrient}</div>
                                        <div className="mt-1 font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-800">{amount}g</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // ... Manual Plan ...
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                             <div className="flex border-b border-blue-300 mb-3 items-end">
                                {(['그린', '티', '페어웨이'] as const).map(tab => (
                                    <button key={tab} onClick={() => setActivePlanTab(tab)} className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${ activePlanTab === tab ? 'bg-white text-blue-700 border-t border-l border-r border-blue-300 -mb-px' : 'bg-blue-100 text-blue-600 hover:bg-blue-200' }`}>{tab}</button>
                                ))}
                                <div className="ml-auto flex gap-2 pb-1">
                                    <label className="flex items-center gap-1 bg-white px-2 py-1 rounded text-xs border cursor-pointer hover:bg-slate-50">
                                        <UploadIcon className="w-3 h-3 text-slate-500" /> <span className="text-slate-600 font-semibold">엑셀 계획 불러오기</span>
                                        <input type="file" ref={planFileInputRef} onChange={handleImportPlan} accept=".xlsx, .xls" className="hidden" />
                                    </label>
                                </div>
                            </div>
                            <div className="overflow-x-auto bg-white rounded-b-lg border border-t-0 border-blue-300 p-2">
                                <table className="w-full text-sm text-center border-collapse bg-white">
                                    <thead><tr className="bg-slate-100 text-slate-700"><th className="p-2 border w-16">월</th><th className="p-2 border text-green-700">목표 N</th><th className="p-2 border text-blue-700">목표 P</th><th className="p-2 border text-orange-700">목표 K</th></tr></thead>
                                    <tbody>
                                        {(manualTargets[activePlanTab] || []).map((target, i) => (
                                            <tr key={i} className="border-b">
                                                <td className="p-2 font-medium bg-slate-50">{i + 1}월</td>
                                                <td className="p-1 border"><input type="number" step="0.1" min="0" value={target.N || ''} onChange={(e) => handleManualTargetChange(i, 'N', e.target.value)} className="w-full text-center p-1 border-gray-300 rounded focus:ring-green-500" /></td>
                                                <td className="p-1 border"><input type="number" step="0.1" min="0" value={target.P || ''} onChange={(e) => handleManualTargetChange(i, 'P', e.target.value)} className="w-full text-center p-1 border-gray-300 rounded focus:ring-blue-500" /></td>
                                                <td className="p-1 border"><input type="number" step="0.1" min="0" value={target.K || ''} onChange={(e) => handleManualTargetChange(i, 'K', e.target.value)} className="w-full text-center p-1 border-gray-300 rounded focus:ring-orange-500" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </details>
        </section>

        <section className="bg-white rounded-lg shadow-md overflow-hidden">
            <div onClick={() => setIsFertilizerListOpen(!isFertilizerListOpen)} className="p-6 flex justify-between items-center cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                <h2 className="text-xl font-semibold text-slate-700 flex items-center gap-2">🌱 보유 비료 목록</h2>
                <button className="text-slate-500">{isFertilizerListOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}</button>
            </div>
            {isFertilizerListOpen && (
                <div className="p-6 pt-0 border-t animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        {filteredFertilizersList.map(fertilizer => (
                            <div key={fertilizer.name} onClick={() => setDetailModalFertilizer(fertilizer)} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md cursor-pointer flex flex-col p-3">
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-bold text-slate-800 text-sm truncate">{fertilizer.name}</h3>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">{fertilizer.N}-{fertilizer.P}-{fertilizer.K}</span>
                                </div>
                                <div className="mt-auto flex justify-between items-center pt-2 border-t border-slate-50">
                                    <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{fertilizer.type}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>

        <section ref={logSectionRef} className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-slate-700 mb-4 flex items-center gap-2"><PencilIcon /> 시비 기록 작성</h2>
            <div className="space-y-6">
                <div className="relative">
                    <div className="w-full p-2 border border-slate-300 rounded-md cursor-pointer flex justify-between items-center bg-white" onClick={() => setIsProductSelectOpen(!isProductSelectOpen)}>
                        <span className={selectedProduct ? 'text-slate-800' : 'text-slate-400'}>{selectedProduct ? `${selectedProduct.name} (${selectedProduct.usage})` : '비료를 선택하세요'}</span>
                        <ChevronDownIcon className="text-slate-400 w-4 h-4" />
                    </div>
                    {isProductSelectOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                            {['그린', '티', '페어웨이', '기타'].map(group => (
                                <div key={group}>
                                    <div className="px-3 py-1 bg-slate-100 text-xs font-bold text-slate-500 uppercase">{group}</div>
                                    {groupedFertilizers[group]?.map(f => (
                                        <div key={f.name} onClick={() => { setSelectedProduct(f); setApplicationRate(parseRateValue(f.rate).toString()); setDate(new Date().toISOString().split('T')[0]); setIsProductSelectOpen(false); }} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">{f.name}</div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md" />
                    <input type="number" value={applicationRate} onChange={(e) => setApplicationRate(e.target.value)} placeholder="사용량" className="w-full p-2 border border-slate-300 rounded-md" />
                </div>
                {/* Area Tabs */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex gap-2 mb-4">
                        {(['그린', '티', '페어웨이'] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveLogTab(tab)} className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all ${ activeLogTab === tab ? 'bg-green-600 text-white' : 'bg-white text-slate-500' }`}>{tab}</button>
                        ))}
                    </div>
                    <div>
                        {activeLogTab === '그린' && <input type="number" placeholder="그린 면적" value={logGreenArea} onChange={(e) => setLogGreenArea(e.target.value)} className="w-full p-3 border rounded-md" />}
                        {activeLogTab === '티' && <input type="number" placeholder="티 면적" value={logTeeArea} onChange={(e) => setLogTeeArea(e.target.value)} className="w-full p-3 border rounded-md" />}
                        {activeLogTab === '페어웨이' && <input type="number" placeholder="페어웨이 면적" value={logFairwayArea} onChange={(e) => setLogFairwayArea(e.target.value)} className="w-full p-3 border rounded-md" />}
                    </div>
                </div>
                <button onClick={handleAddLog} className="w-full py-3 bg-green-600 text-white font-bold rounded-md">기록 추가하기</button>
            </div>
        </section>
        
        {/* Chatbot & Modals */}
        <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg z-50"><ChatIcon /></button>
        <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>
      {detailModalFertilizer && <FertilizerDetailModal fertilizer={detailModalFertilizer} onClose={() => setDetailModalFertilizer(null)} />}
    </div>
  );
}
