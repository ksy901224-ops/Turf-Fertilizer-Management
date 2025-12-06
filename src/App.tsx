import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { Fertilizer, LogEntry, NewFertilizerForm, NutrientLog, User } from './types';
import { NUTRIENTS, FERTILIZER_GUIDE, USAGE_CATEGORIES, TYPE_CATEGORIES, MONTHLY_DISTRIBUTION } from './constants';
import * as api from './api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ComposedChart } from 'recharts';
import { Chatbot } from './Chatbot';
import { ChatIcon, LogoutIcon, CalculatorIcon, TrashIcon, CalendarIcon, ClipboardListIcon, CloseIcon, PencilIcon, PlusIcon, SparklesIcon, ChevronDownIcon, ChevronUpIcon, CameraIcon, DocumentSearchIcon, UploadIcon, DownloadIcon } from './icons';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';


const LoadingSpinner = () => (
    <div className="flex justify-center items-center min-h-screen bg-slate-100">
        <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
            <p className="mt-4 text-lg text-slate-700 font-semibold">데이터를 불러오는 중...</p>
        </div>
    </div>
);

// --- Helper Functions (Moved to Module Scope for Reusability) ---

const parseRateValue = (rateStr: string) => {
    if (!rateStr) return 0;
    const m = rateStr.toString().match(/([0-9]+(\.[0-9]+)?)/);
    return m ? parseFloat(m[0]) : 0;
};

const getApplicationDetails = (product: Fertilizer | null, areaNum: number, rateNum: number) => {
    const ZEROS = {
        nutrients: NUTRIENTS.reduce((acc, n) => ({...acc, [n]: 0}), {} as {[key:string]:number}),
        totalCost: 0,
        nutrientCosts: {},
    };

    if (!product || !isFinite(areaNum) || areaNum <= 0 || !isFinite(rateNum) || rateNum < 0) {
        return ZEROS;
    }

    const density = product.density ?? 1;
    const concentration = product.concentration ?? 0;
    const price = product.price || 0;

    const isLiquidRate = (product.rate || '').toLowerCase().includes('ml') || product.type === '액상';
    
    const totalGramsApplied = isLiquidRate
        ? rateNum * areaNum * density
        : rateNum * areaNum;

    if (!isFinite(totalGramsApplied)) return ZEROS;

    const nutrientCarrierGrams = (isLiquidRate && concentration > 0)
        ? totalGramsApplied * (concentration / 100)
        : totalGramsApplied;
    
    if (!isFinite(nutrientCarrierGrams)) return ZEROS;

    const nutrients = NUTRIENTS.reduce((acc, n) => {
        const percentage = (product as any)[n] || 0;
        const nutrientGrams = (percentage / 100) * nutrientCarrierGrams;
        acc[n] = isFinite(nutrientGrams) ? Number(nutrientGrams.toFixed(3)) : 0;
        return acc;
    }, {} as {[key:string]:number});
    
    let totalCost = 0;
    const packageSize = parseFloat((product.unit || '').replace(/[^0-9.]/g, ''));

    if (isFinite(packageSize) && packageSize > 0) {
        const isLiquidUnit = (product.unit || '').toLowerCase().includes('l');
        const packageWeightKg = isLiquidUnit 
            ? packageSize * density
            : packageSize;

        if (isFinite(packageWeightKg) && packageWeightKg > 0) {
            const costPerKg = price / packageWeightKg;
            const totalKgApplied = totalGramsApplied / 1000;
            const finalCost = totalKgApplied * costPerKg;
            totalCost = isFinite(finalCost) ? finalCost : 0;
        }
    }

    const nutrientCosts: {[key: string]: number} = {};
    if (isFinite(price) && price > 0 && isFinite(packageSize) && packageSize > 0) {
        const isLiquidUnit = (product.unit || '').toLowerCase().includes('l');
        const totalPackageGrams = isLiquidUnit 
            ? packageSize * density * 1000 
            : packageSize * 1000;

        if (isFinite(totalPackageGrams) && totalPackageGrams > 0) {
            ['N', 'P', 'K'].forEach(nutrient => {
                const percentage = (product as any)[nutrient] || 0;
                if (percentage > 0) {
                    const totalNutrientGramsInPackage = totalPackageGrams * (percentage / 100);
                    if (totalNutrientGramsInPackage > 0) {
                        nutrientCosts[nutrient] = price / totalNutrientGramsInPackage;
                    }
                }
            });
        }
    }

    return { nutrients, totalCost, nutrientCosts };
};

// --- Fertilizer Detail Modal Component ---

interface FertilizerDetailModalProps {
    fertilizer: Fertilizer;
    onClose: () => void;
}

const FertilizerDetailModal: React.FC<FertilizerDetailModalProps> = ({ fertilizer, onClose }) => {
    const [activeTab, setActiveTab] = useState<'info' | 'calc'>('info');
    const [calcArea, setCalcArea] = useState<string>('');
    const [calcRate, setCalcRate] = useState<string>('');

    useEffect(() => {
        const defaultRate = parseRateValue(fertilizer.rate);
        if (defaultRate > 0) setCalcRate(defaultRate.toString());
    }, [fertilizer]);

    const details = useMemo(() => {
        const defaultRate = parseRateValue(fertilizer.rate);
        return getApplicationDetails(fertilizer, 1, defaultRate); // Per 1m² analysis
    }, [fertilizer]);

    const calcResult = useMemo(() => {
        const area = parseFloat(calcArea);
        const rate = parseFloat(calcRate);
        if (isNaN(area) || area <= 0 || isNaN(rate) || rate < 0) return null;
        
        const result = getApplicationDetails(fertilizer, area, rate);
        const isLiquid = fertilizer.type === '액상';
        
        // Total amount calculation
        let totalAmount = (area * rate) / 1000; // Default to kg or L (assuming input is g or ml)
        
        return {
            totalCost: result.totalCost,
            totalAmount,
            unit: isLiquid ? 'L' : 'kg'
        };
    }, [fertilizer, calcArea, calcRate]);

    const categorizedNutrients = useMemo(() => {
        return {
            primary: ['N', 'P', 'K'],
            secondary: ['Ca', 'Mg', 'S'],
            micro: ['Fe', 'Mn', 'Zn', 'Cu', 'B', 'Mo', 'Cl', 'Na', 'Si', 'Ni', 'Co', 'V']
        };
    }, []);

    const hasNutrient = (n: string) => (fertilizer as any)[n] > 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <header className="bg-slate-50 border-b p-4 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            {fertilizer.name}
                        </h3>
                        <div className="flex gap-2 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                fertilizer.usage === '그린' ? 'bg-green-100 text-green-800' :
                                fertilizer.usage === '티' ? 'bg-blue-100 text-blue-800' :
                                'bg-orange-100 text-orange-800'
                            }`}>
                                {fertilizer.usage}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">{fertilizer.type}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <CloseIcon />
                    </button>
                </header>
                
                <div className="flex border-b">
                    <button 
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                        onClick={() => setActiveTab('info')}
                    >
                        📊 상세 정보
                    </button>
                    <button 
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'calc' ? 'text-green-600 border-b-2 border-green-600 bg-green-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                        onClick={() => setActiveTab('calc')}
                    >
                        🧮 필요량 계산기
                    </button>
                </div>

                <div className="overflow-y-auto p-6 flex-1">
                    {activeTab === 'info' ? (
                        <div className="space-y-6">
                            {/* Description Section */}
                            {fertilizer.description && (
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-700 leading-relaxed shadow-sm">
                                    <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2 text-xs uppercase tracking-wider">
                                        <DocumentSearchIcon className="w-4 h-4"/> 제품 특징
                                    </h4>
                                    <p className="whitespace-pre-line">{fertilizer.description}</p>
                                </div>
                            )}

                            {/* Basic Specs */}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">포장 단위</span>
                                    <span className="font-bold text-slate-800">{fertilizer.unit}</span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">가격</span>
                                    <span className="font-bold text-slate-800">{fertilizer.price.toLocaleString()}원</span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">권장 사용량</span>
                                    <span className="font-bold text-slate-800">{fertilizer.rate}</span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">NPK 비율</span>
                                    <span className="font-bold text-slate-800">{fertilizer.npkRatio || `${fertilizer.N}-${fertilizer.P}-${fertilizer.K}`}</span>
                                </div>
                            </div>

                            {/* Detailed Nutrient Analysis */}
                            <div>
                                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm border-b pb-2">
                                    🌱 성분 함량 및 투입량 <span className="text-[10px] font-normal text-slate-500 ml-auto">권장량 기준</span>
                                </h4>
                                
                                <div className="space-y-4">
                                    {/* Primary */}
                                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                        <p className="text-xs font-bold text-slate-500 mb-2">다량 요소 (Macro)</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {categorizedNutrients.primary.map(n => (
                                                <div key={n} className="bg-white rounded p-2 text-center border shadow-sm">
                                                    <div className={`text-xs font-bold ${n==='N'?'text-green-600':n==='P'?'text-blue-600':'text-orange-600'}`}>{n}</div>
                                                    <div className="text-sm font-bold text-slate-800">{(fertilizer as any)[n]}%</div>
                                                    <div className="text-[10px] text-slate-500 mt-1 pt-1 border-t">{details.nutrients[n]?.toFixed(2)}g/㎡</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Secondary */}
                                    {categorizedNutrients.secondary.some(hasNutrient) && (
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                            <p className="text-xs font-bold text-slate-500 mb-2">2차 요소 (Secondary)</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {categorizedNutrients.secondary.filter(hasNutrient).map(n => (
                                                    <div key={n} className="bg-white rounded p-1.5 text-center border">
                                                        <div className="text-[10px] text-slate-500 font-medium">{n}</div>
                                                        <div className="text-xs font-bold text-slate-800">{(fertilizer as any)[n]}%</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Micro & Others */}
                                    {(categorizedNutrients.micro.some(hasNutrient) || (fertilizer.aminoAcid && fertilizer.aminoAcid > 0)) && (
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                            <p className="text-xs font-bold text-slate-500 mb-2">미량 요소 및 기타 (Micro & Others)</p>
                                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                                {categorizedNutrients.micro.filter(hasNutrient).map(n => (
                                                    <div key={n} className="bg-white rounded p-1.5 text-center border">
                                                        <div className="text-[10px] text-slate-500 font-medium">{n}</div>
                                                        <div className="text-xs font-bold text-slate-800">{(fertilizer as any)[n]}%</div>
                                                    </div>
                                                ))}
                                                {fertilizer.aminoAcid !== undefined && fertilizer.aminoAcid > 0 && (
                                                    <div className="bg-purple-50 rounded p-1.5 text-center border border-purple-100 col-span-2">
                                                        <div className="text-[10px] text-purple-600 font-bold">아미노산</div>
                                                        <div className="text-xs font-bold text-purple-800">{fertilizer.aminoAcid}%</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100 mb-4">
                                <p className="text-sm text-green-800 font-medium mb-2">계산할 면적과 사용량을 입력하세요.</p>
                                <div className="grid gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-green-900 mb-1">시비 면적 (㎡)</label>
                                        <input 
                                            type="number" 
                                            value={calcArea} 
                                            onChange={e => setCalcArea(e.target.value)}
                                            placeholder="예: 500"
                                            className="w-full p-2 border border-green-200 rounded-md focus:ring-2 focus:ring-green-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-green-900 mb-1">사용량 ({fertilizer.type === '액상' ? 'ml' : 'g'}/㎡)</label>
                                        <input 
                                            type="number" 
                                            value={calcRate} 
                                            onChange={e => setCalcRate(e.target.value)}
                                            placeholder={parseRateValue(fertilizer.rate).toString()}
                                            className="w-full p-2 border border-green-200 rounded-md focus:ring-2 focus:ring-green-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {calcResult ? (
                                <div className="space-y-4 animate-fadeIn">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-white border rounded-xl shadow-sm text-center">
                                            <p className="text-xs text-slate-500 mb-1">총 필요 제품량</p>
                                            <p className="text-2xl font-bold text-slate-800">
                                                {calcResult.totalAmount.toFixed(1)}
                                                <span className="text-sm font-normal ml-1 text-slate-600">{calcResult.unit}</span>
                                            </p>
                                        </div>
                                        <div className="p-4 bg-white border rounded-xl shadow-sm text-center">
                                            <p className="text-xs text-slate-500 mb-1">총 예상 비용</p>
                                            <p className="text-2xl font-bold text-blue-600">
                                                {Math.round(calcResult.totalCost).toLocaleString()}
                                                <span className="text-sm font-normal ml-1 text-slate-600">원</span>
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-center text-xs text-slate-400">
                                        * 실제 구매 단위({fertilizer.unit})에 따라 비용은 달라질 수 있습니다.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    <CalculatorIcon />
                                    <p className="mt-2 text-sm">값을 입력하면 결과가 표시됩니다.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function TurfFertilizerApp() {
  const [user, setUser] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminFertilizers, setAdminFertilizers] = useState<Fertilizer[]>([]);
  const [userFertilizers, setUserFertilizers] = useState<Fertilizer[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [greenArea, setGreenArea] = useState<string>('');
  const [teeArea, setTeeArea] = useState<string>('');
  const [fairwayArea, setFairwayArea] = useState<string>('');
  const [selectedGuide, setSelectedGuide] = useState<string>(Object.keys(FERTILIZER_GUIDE)[0]);
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);

  // Manual Plan State
  const [manualPlanMode, setManualPlanMode] = useState(false);
  const [activePlanTab, setActivePlanTab] = useState<string>('그린');
  const [manualTargets, setManualTargets] = useState<{ [area: string]: { N: number, P: number, K: number }[] }>({
      '그린': Array(12).fill({ N: 0, P: 0, K: 0 }),
      '티': Array(12).fill({ N: 0, P: 0, K: 0 }),
      '페어웨이': Array(12).fill({ N: 0, P: 0, K: 0 }),
  });
  const [fairwayGuideType, setFairwayGuideType] = useState<'KBG' | 'Zoysia'>('KBG');
  
  // Plan Import State
  const [isImportingPlan, setIsImportingPlan] = useState(false);
  const planFileInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logSectionRef = useRef<HTMLElement>(null);
  const [activeUsageTab, setActiveUsageTab] = useState(USAGE_CATEGORIES[0]);
  const [selectedProduct, setSelectedProduct] = useState<Fertilizer | null>(null);
  const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
  
  // Fertilizer List Filter State
  const [filterUsage, setFilterUsage] = useState<string>('전체');
  const [filterType, setFilterType] = useState<string>('전체');
  const [isFertilizerListOpen, setIsFertilizerListOpen] = useState(false); // New state to control collapse
  
  // Log entry form states (Tabbed)
  const [activeLogTab, setActiveLogTab] = useState<'그린' | '티' | '페어웨이'>('그린');
  const [logGreenArea, setLogGreenArea] = useState('');
  const [logTeeArea, setLogTeeArea] = useState('');
  const [logFairwayArea, setLogFairwayArea] = useState('');
  const [date, setDate] = useState('');
  const [applicationRate, setApplicationRate] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
  
  // Topdressing State
  const [topdressing, setTopdressing] = useState('');


  // Replaces graphView
  const [tablePeriodView, setTablePeriodView] = useState<'daily' | 'monthly' | 'yearly'>('monthly');
  
  const [visibleNutrients, setVisibleNutrients] = useState({ N: true, P: true, K: true });
  const [analysisCategory, setAnalysisCategory] = useState<'all' | '그린' | '티' | '페어웨이'>('all');
  const [analysisFairwayType, setAnalysisFairwayType] = useState<'KBG' | 'Zoysia'>('KBG');
  
  // NEW: Cumulative View Toggle State
  const [isCumulative, setIsCumulative] = useState(false);

  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<{productName: string, targetArea: string, rate: number, reason: string} | null>(null);
  
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Calculator State
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

  // Log Sorting and Filtering State
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Authentication Check Effect
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

  // Data Loading Effect
  useEffect(() => {
    const loadData = async () => {
        if (!user) {
          setIsInitialDataLoading(false);
          return;
        }
        
        setIsInitialDataLoading(true);
        try {
            if (isAdmin) {
                const fetched = await api.getFertilizers('admin');
                setAdminFertilizers(fetched);
            } else {
                const [fetchedAdminFert, fetchedUserFert, loadedLog, settings] = await Promise.all([
                    api.getFertilizers('admin'), // Master list
                    api.getFertilizers(user),    // User's custom list
                    api.getLog(user),
                    api.getSettings(user),
                ]);

                setAdminFertilizers(fetchedAdminFert);
                setUserFertilizers(fetchedUserFert);
                setLog(loadedLog.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                setGreenArea(settings.greenArea);
                setTeeArea(settings.teeArea);
                setFairwayArea(settings.fairwayArea);
                setSelectedGuide(settings.selectedGuide);
                if (settings.manualPlanMode !== undefined) setManualPlanMode(settings.manualPlanMode);
                if (settings.manualTargets) setManualTargets(settings.manualTargets);
                if (settings.fairwayGuideType) setFairwayGuideType(settings.fairwayGuideType);
            }
        } catch (error) {
            console.error("Failed to load initial data", error);
            alert("데이터를 불러오는 데 실패했습니다.");
        } finally {
            setIsInitialDataLoading(false);
        }
    };
    loadData();
  }, [user, isAdmin]);

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

  // Data Saving Effects
  useEffect(() => {
    if (!isInitialDataLoading && user && !isAdmin) {
      api.saveLog(user, log);
    }
  }, [log, isInitialDataLoading, user, isAdmin]);

  // Persist all settings including new manual plan fields
  useEffect(() => {
    if (!isInitialDataLoading && user && !isAdmin) {
      api.saveSettings(user, { 
          greenArea, 
          teeArea, 
          fairwayArea, 
          selectedGuide, 
          manualPlanMode, 
          manualTargets, 
          fairwayGuideType 
      });
    }
  }, [greenArea, teeArea, fairwayArea, selectedGuide, manualPlanMode, manualTargets, fairwayGuideType, isInitialDataLoading, user, isAdmin]);
  
  const handleLogin = async (username: string) => {
    localStorage.setItem('turf_user', username);
    const userData = await api.getUser(username);
    setCurrentUser(userData);
    if (username === 'admin') {
        setIsAdmin(true);
    }
    setUser(username);
  };

  const handleLogout = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('turf_user');
        setUser(null);
        setCurrentUser(null);
        setIsAdmin(false);
        // Reset temporary UI states
        setSelectedProduct(null);
        setLogGreenArea('');
        setLogTeeArea('');
        setLogFairwayArea('');
        setDate('');
        setApplicationRate('');
        setAiResponse('');
        setAiError(null);
        setAiAction(null);
        setCalculatorResults(null);
        setFilterProduct('');
        setFilterStartDate('');
        setFilterEndDate('');
    }
  };

  // Fixed useEffect to prevent overwriting rate/date when selectedProduct changes due to user action
  useEffect(() => {
    if (!selectedProduct) {
        setApplicationRate('');
        setLogGreenArea('');
        setLogTeeArea('');
        setLogFairwayArea('');
        setDate('');
    }
  }, [selectedProduct]);
  
  // Automatically set area when tab changes
  useEffect(() => {
      if (activeLogTab === '그린') setLogGreenArea(greenArea);
      else if (activeLogTab === '티') setLogTeeArea(teeArea);
      else if (activeLogTab === '페어웨이') setLogFairwayArea(fairwayArea);
  }, [activeLogTab, greenArea, teeArea, fairwayArea]);
  
  useEffect(() => {
    if (calculatorProduct) {
        const rateVal = parseRateValue(calculatorProduct.rate);
        setCalculatorRate(rateVal > 0 ? rateVal.toString() : '');
    } else {
        setCalculatorRate('');
        setCalculatorArea('');
        setCalculatorResults(null);
    }
  }, [calculatorProduct]);

  const handleAddLog = () => {
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
        topdressing: topdressing ? parseFloat(topdressing) : undefined,
    };

    setLog(prev => [entry, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    
    alert(`완료: ${usage} 구역에 시비 기록이 추가되었습니다.`);
    setIsProductSelectOpen(false); // Close product select if open
    setLogSearchTerm('');
    setTopdressing(''); // Reset topdressing
  };
  
    // ... (Plan Import Handler)
    const handlePlanFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImportingPlan(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            let promptParts: any[] = [];
            const basePrompt = `
                Analyze the provided Annual Fertilizer Plan document.
                Extract the monthly target Nitrogen (N), Phosphorous (P), and Potassium (K) amounts in g/m² for "Green" (그린), "Tee" (티), and "Fairway" (페어웨이).
                
                Return ONLY a JSON object with the following structure, no markdown:
                {
                    "그린": [{"N": 0, "P": 0, "K": 0}, ... (12 objects for Jan-Dec)],
                    "티": [{"N": 0, "P": 0, "K": 0}, ... (12 objects)],
                    "페어웨이": [{"N": 0, "P": 0, "K": 0}, ... (12 objects)]
                }
                If specific nutrient data is missing for a month, use 0.
                If the document only contains data for one area (e.g. only Greens), fill the others with 0.
            `;

            // File Processing
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
                const data = await file.arrayBuffer();
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const csv = XLSX.utils.sheet_to_csv(ws);
                promptParts = [
                    { text: basePrompt },
                    { text: `CSV Data:\n${csv}` }
                ];
            } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                 const reader = new FileReader();
                 const base64Promise = new Promise<string>((resolve, reject) => {
                    reader.onload = () => {
                        const result = reader.result as string;
                        resolve(result.split(',')[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                 });
                 const base64Data = await base64Promise;
                 
                 promptParts = [
                     { text: basePrompt },
                     { inlineData: { mimeType: file.type, data: base64Data } }
                 ];
            } else {
                alert('지원하지 않는 파일 형식입니다. (Excel, PDF, 이미지 지원)');
                setIsImportingPlan(false);
                return;
            }

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: promptParts }
            });

            const text = response.text || "{}";
            console.log("AI Raw Response:", text); // Debugging aid

            let jsonStr = text;
            // Attempt to extract JSON from code blocks or curly braces
            const jsonBlockMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            const jsonLooseMatch = text.match(/(\{[\s\S]*\})/);

            if (jsonBlockMatch) {
                jsonStr = jsonBlockMatch[1];
            } else if (jsonLooseMatch) {
                jsonStr = jsonLooseMatch[1];
            } else {
                // Fallback cleanup
                jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            }

            const parsedData = JSON.parse(jsonStr);

            // Validation / Merging
            const newTargets = { ...manualTargets };
            ['그린', '티', '페어웨이'].forEach(area => {
                if (parsedData[area] && Array.isArray(parsedData[area])) {
                     // Ensure 12 months and structure
                     const validArray = parsedData[area].slice(0, 12).map((item: any) => ({
                         N: Number(item.N || 0),
                         P: Number(item.P || 0),
                         K: Number(item.K || 0)
                     }));
                     // Pad if less than 12
                     while(validArray.length < 12) validArray.push({N:0, P:0, K:0});
                     
                     newTargets[area] = validArray;
                }
            });

            setManualTargets(newTargets);
            setManualPlanMode(true); // Switch to manual mode to show results
            alert('계획표를 성공적으로 불러왔습니다.');

        } catch (error) {
            console.error("Plan import failed", error);
            alert("계획표 분석에 실패했습니다. AI가 유효한 데이터 형식을 반환하지 못했습니다.");
        } finally {
            setIsImportingPlan(false);
            if (planFileInputRef.current) planFileInputRef.current.value = '';
        }
    };

  const removeLogEntry = (idToRemove: string) => {
    if (window.confirm('해당 일지를 삭제하시겠습니까?')) {
      setLog(prev => prev.filter(entry => entry.id !== idToRemove));
    }
  };
  
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
        
        return getApplicationDetails(selectedProduct, 1, rate).nutrients; // per 1m^2
    }, [selectedProduct, applicationRate]);

  // Group Fertilizers for Select
  const groupedFertilizers = useMemo(() => {
      let filtered = fertilizers;
      if (logSearchTerm) {
          filtered = filtered.filter(f => f.name.toLowerCase().includes(logSearchTerm.toLowerCase()));
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
  }, [fertilizers, logSearchTerm]);

  const filteredLogForAnalysis = useMemo(() => {
    if (analysisCategory === 'all') return log;
    return log.filter(entry => entry.usage === analysisCategory);
  }, [log, analysisCategory]);

  // Aggregate Product Quantity Data
  const aggregatedProductQuantity = useMemo(() => {
    const data: Record<string, { totalAmount: number, unit: string, cost: number }> = {};
    let filtered = filteredLogForAnalysis; // use declared variable
    
    filtered.forEach(entry => {
        // Find product to check if liquid
        const product = fertilizers.find(f => f.name === entry.product);
        const isLiquid = product?.type === '액상' || entry.applicationUnit.includes('ml');
        const amount = (entry.area * entry.applicationRate) / 1000; // kg or L
        
        if (!data[entry.product]) {
            data[entry.product] = { totalAmount: 0, unit: isLiquid ? 'L' : 'kg', cost: 0 };
        }
        data[entry.product].totalAmount += amount;
        data[entry.product].cost += entry.totalCost;
    });
    
    return Object.entries(data)
        .sort((a,b) => b[1].totalAmount - a[1].totalAmount)
        .slice(0, 5); // Top 5
  }, [filteredLogForAnalysis, fertilizers]);

  const annualTopdressingTotal = useMemo(() => {
      return filteredLogForAnalysis.reduce((sum, entry) => sum + (entry.topdressing || 0), 0);
  }, [filteredLogForAnalysis]);

  const categorySummaries = useMemo(() => {
    const initialSummary = {
      totalCost: 0,
      totalNutrients: NUTRIENTS.reduce((acc, n) => ({...acc, [n]: 0}), {} as { [key: string]: number }),
    };

    const summaries: {[key: string]: typeof initialSummary} = {
      '그린': JSON.parse(JSON.stringify(initialSummary)),
      '티': JSON.parse(JSON.stringify(initialSummary)),
      '페어웨이': JSON.parse(JSON.stringify(initialSummary)),
    };

    log.forEach(entry => {
      const product = fertilizers.find(f => f.name === entry.product);
      const usage = entry.usage || product?.usage;

      if (usage && (usage === '그린' || usage === '티' || usage === '페어웨이')) {
        summaries[usage].totalCost += (entry.totalCost || 0);
        NUTRIENTS.forEach(n => {
          summaries[usage].totalNutrients[n] += (entry.nutrients?.[n] || 0);
        });
      }
    });

    return summaries;
  }, [log, fertilizers]);

  const totalSummary = useMemo(() => {
    const totalCost = categorySummaries['그린'].totalCost + categorySummaries['티'].totalCost + categorySummaries['페어웨이'].totalCost;
    const totalNutrients = NUTRIENTS.reduce((acc, n) => {
      acc[n] = (categorySummaries['그린'].totalNutrients[n] || 0) + (categorySummaries['티'].totalNutrients[n] || 0) + (categorySummaries['페어웨이'].totalNutrients[n] || 0);
      return acc;
    }, {} as { [key: string]: number });
    return { totalCost, totalNutrients };
  }, [categorySummaries]);
  
  const totalManagedArea = useMemo(() => {
      return (parseFloat(greenArea) || 0) + (parseFloat(teeArea) || 0) + (parseFloat(fairwayArea) || 0);
  }, [greenArea, teeArea, fairwayArea]);

  const categorySummariesPerM2 = useMemo(() => {
    const greenAreaNum = parseFloat(greenArea);
    const teeAreaNum = parseFloat(teeArea);
    const fairwayAreaNum = parseFloat(fairwayArea);
    
    const perM2: {[key: string]: {[key: string]: number}} = {
      '그린': NUTRIENTS.reduce((acc, n) => ({ ...acc, [n]: 0 }), {} as { [key: string]: number }),
      '티': NUTRIENTS.reduce((acc, n) => ({ ...acc, [n]: 0 }), {} as { [key: string]: number }),
      '페어웨이': NUTRIENTS.reduce((acc, n) => ({ ...acc, [n]: 0 }), {} as { [key: string]: number }),
    };

    if (greenAreaNum > 0) {
      NUTRIENTS.forEach(n => {
        perM2['그린'][n] = (categorySummaries['그린'].totalNutrients[n] || 0) / greenAreaNum;
      });
    }
    if (teeAreaNum > 0) {
      NUTRIENTS.forEach(n => {
        perM2['티'][n] = (categorySummaries['티'].totalNutrients[n] || 0) / teeAreaNum;
      });
    }
     if (fairwayAreaNum > 0) {
      NUTRIENTS.forEach(n => {
        perM2['페어웨이'][n] = (categorySummaries['페어웨이'].totalNutrients[n] || 0) / fairwayAreaNum;
      });
    }
    
    return perM2;
  }, [categorySummaries, greenArea, teeArea, fairwayArea]);

  const handleNutrientToggle = (nutrient: 'N' | 'P' | 'K') => {
    setVisibleNutrients(prev => {
        const newVisible = { ...prev, [nutrient]: !prev[nutrient] };
        // Prevent unchecking the last nutrient
        if (Object.values(newVisible).every(v => !v)) {
            return prev;
        }
        return newVisible;
    });
  };

    // NEW: Monthly Nutrient Chart Data with Guide Comparison
    const monthlyNutrientChartData = useMemo(() => {
        const data: Record<string, { 
            month: string, 
            N: number, P: number, K: number,
            guideN: number, guideP: number, guideK: number
        }> = {};
        
        // 1. Determine which Guide to use
        let guideKey = '';
        let usingManualTarget = false;
        
        // Logic update: If looking at analysis chart, we want to see Actual vs Target.
        // If Manual Mode is ON for the whole app, the Target is the manual plan.
        if (manualPlanMode && analysisCategory !== 'all') {
            usingManualTarget = true;
        } else {
             if (analysisCategory === '그린') guideKey = '한지형잔디 (벤트그라스)';
             else if (analysisCategory === '티') guideKey = '한지형잔디 (켄터키블루그라스)';
             else if (analysisCategory === '페어웨이') guideKey = analysisFairwayType === 'KBG' ? '한지형잔디 (켄터키블루그라스)' : '난지형잔디 (한국잔디)';
        }
        
        // 2. Initialize Months (1-12)
        for(let i=0; i<12; i++) {
            const currentYear = new Date().getFullYear(); // Use current year for display context
            const monthKey = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
            
            let gN = 0, gP = 0, gK = 0;
            
            if (usingManualTarget) {
                 const targets = manualTargets[analysisCategory];
                 if (targets && targets[i]) {
                     gN = targets[i].N;
                     gP = targets[i].P;
                     gK = targets[i].K;
                 }
            } else if (guideKey && FERTILIZER_GUIDE[guideKey] && MONTHLY_DISTRIBUTION[guideKey]) {
                const guide = FERTILIZER_GUIDE[guideKey];
                const dist = MONTHLY_DISTRIBUTION[guideKey];
                gN = guide.N * dist.N[i];
                gP = guide.P * dist.P[i];
                gK = guide.K * dist.K[i];
            }

            data[monthKey] = { 
                month: monthKey, 
                N: 0, P: 0, K: 0, 
                guideN: parseFloat(gN.toFixed(2)), 
                guideP: parseFloat(gP.toFixed(2)), 
                guideK: parseFloat(gK.toFixed(2)) 
            };
        }

        // 3. Aggregate Actual Data using exact application rate (g/m2)
        // CRITICAL UPDATE: Calculate based on applicationRate * nutrient% directly
        // This avoids distortion from Area division
        filteredLogForAnalysis.forEach(entry => {
            const date = new Date(entry.date);
            if (date.getFullYear() === new Date().getFullYear()) {
                const monthIndex = date.getMonth();
                const monthKey = `${date.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}`;
                
                // Find product definition to get percentages
                const product = fertilizers.find(f => f.name === entry.product);
                
                if (data[monthKey] && product) {
                    // Application Rate is already g/m2 (or ml/m2)
                    // If ml/m2, we should ideally use density, but simpler to assume rate enters formulation
                    // We use getApplicationDetails logic for consistency, but scaled to 1m2
                    
                    // We can reuse getApplicationDetails(product, 1, entry.applicationRate)
                    // But to be super fast and consistent with log input:
                    const nutrientsPerM2 = getApplicationDetails(product, 1, entry.applicationRate).nutrients;

                    data[monthKey].N += nutrientsPerM2.N || 0;
                    data[monthKey].P += nutrientsPerM2.P || 0;
                    data[monthKey].K += nutrientsPerM2.K || 0;
                }
            }
        });
        
        // Round final values
        Object.values(data).forEach(item => {
            item.N = parseFloat(item.N.toFixed(2));
            item.P = parseFloat(item.P.toFixed(2));
            item.K = parseFloat(item.K.toFixed(2));
        });
        
        // If 'all' is selected, we don't show guide because it's mixed
        if (analysisCategory === 'all') {
            Object.values(data).forEach(item => {
                item.guideN = 0; item.guideP = 0; item.guideK = 0;
            });
        }
        
        return Object.values(data).sort((a, b) => a.month.localeCompare(b.month));
    }, [filteredLogForAnalysis, analysisCategory, analysisFairwayType, greenArea, teeArea, fairwayArea, manualPlanMode, manualTargets, fertilizers]);
    
    // NEW: Final Data for Chart/Table (Handles Cumulative toggle)
    const finalAnalysisData = useMemo(() => {
        if (!isCumulative) return monthlyNutrientChartData;
        
        let cumN = 0, cumP = 0, cumK = 0;
        let cumGuideN = 0, cumGuideP = 0, cumGuideK = 0;
        
        return monthlyNutrientChartData.map(item => {
            cumN += item.N;
            cumP += item.P;
            cumK += item.K;
            cumGuideN += item.guideN;
            cumGuideP += item.guideP;
            cumGuideK += item.guideK;
            
            return {
                ...item,
                N: Number(cumN.toFixed(2)),
                P: Number(cumP.toFixed(2)),
                K: Number(cumK.toFixed(2)),
                guideN: Number(cumGuideN.toFixed(2)),
                guideP: Number(cumGuideP.toFixed(2)),
                guideK: Number(cumGuideK.toFixed(2)),
            };
        });
    }, [monthlyNutrientChartData, isCumulative]);

    // NEW: Last Year Data Calculation
    const lastYearMonthlyData = useMemo(() => {
        const lastYear = new Date().getFullYear() - 1;
        const data = Array(12).fill(0).map(() => ({ N: 0, P: 0, K: 0 }));
        
        log.forEach(entry => {
            const d = new Date(entry.date);
            // Match year and active plan tab usage
            if (d.getFullYear() === lastYear && entry.usage === activePlanTab) {
                const m = d.getMonth();
                // Get product to calculate nutrient mass per unit area
                const product = fertilizers.find(f => f.name === entry.product);
                if (product) {
                    const nutrientInfo = getApplicationDetails(product, 1, entry.applicationRate).nutrients;
                    data[m].N += nutrientInfo.N || 0;
                    data[m].P += nutrientInfo.P || 0;
                    data[m].K += nutrientInfo.K || 0;
                }
            }
        });
        return data;
    }, [log, activePlanTab, fertilizers]);

    // New useMemo for Manual Plan Chart
    const manualPlanComparisonData = useMemo(() => {
        let guideKey = selectedGuide;
        if (activePlanTab === '그린') guideKey = '한지형잔디 (벤트그라스)';
        else if (activePlanTab === '티') guideKey = '한지형잔디 (켄터키블루그라스)';
        else if (activePlanTab === '페어웨이') guideKey = fairwayGuideType === 'KBG' ? '한지형잔디 (켄터키블루그라스)' : '난지형잔디 (한국잔디)';

        const guide = FERTILIZER_GUIDE[guideKey];
        const dist = MONTHLY_DISTRIBUTION[guideKey];
        
        return (manualTargets[activePlanTab] || []).map((target, i) => ({
            month: `${i + 1}월`,
            planN: target.N,
            planP: target.P,
            planK: target.K,
            stdN: dist ? parseFloat((guide.N * dist.N[i]).toFixed(2)) : 0,
            stdP: dist ? parseFloat((guide.P * dist.P[i]).toFixed(2)) : 0,
            stdK: dist ? parseFloat((guide.K * dist.K[i]).toFixed(2)) : 0,
            // Add Last Year
            lastN: parseFloat(lastYearMonthlyData[i].N.toFixed(2)),
            lastP: parseFloat(lastYearMonthlyData[i].P.toFixed(2)),
            lastK: parseFloat(lastYearMonthlyData[i].K.toFixed(2)),
        }));
    }, [manualTargets, activePlanTab, selectedGuide, fairwayGuideType, lastYearMonthlyData]);


  const sortedAndFilteredLog = useMemo(() => {
    let filtered = [...log];

    if (filterStartDate) {
      const startDate = new Date(filterStartDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(l => new Date(l.date) >= startDate);
    }
    if (filterEndDate) {
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(l => new Date(l.date) <= endDate);
    }
    if (filterProduct) {
      filtered = filtered.filter(l => l.product.toLowerCase().includes(filterProduct.toLowerCase()));
    }

    switch (sortOrder) {
      case 'date-asc':
        filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        break;
      case 'product':
        filtered.sort((a, b) => a.product.localeCompare(b.product));
        break;
      case 'area':
        filtered.sort((a, b) => b.area - a.area);
        break;
      case 'date-desc':
      default:
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
    }
    return filtered;
  }, [log, sortOrder, filterProduct, filterStartDate, filterEndDate]);
  
  const handleResetFilters = () => {
    setFilterProduct('');
    setFilterStartDate('');
    setFilterEndDate('');
    setSortOrder('date-desc');
  };
  
  const handleExportToExcel = () => {
    if (sortedAndFilteredLog.length === 0) {
        alert('엑셀로 내보낼 데이터가 없습니다.');
        return;
    }

    const dataToExport = sortedAndFilteredLog.map(entry => {
        const row: {[key: string]: any} = {
            '날짜': entry.date,
            '제품명': entry.product,
            '구분': entry.usage,
            '면적(㎡)': entry.area,
            '사용량': `${entry.applicationRate}${entry.applicationUnit}`,
            '총 비용(원)': Math.round(entry.totalCost),
        };
        
        if (entry.topdressing) row['배토(mm)'] = entry.topdressing;

        NUTRIENTS.forEach(n => {
            row[`${n} (g)`] = entry.nutrients[n] || 0;
        });
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '시비 일지');
    XLSX.writeFile(workbook, `Fertilizer_Log_${user}.xlsx`);
  };

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
  
  const manualPlanTotal = useMemo(() => {
      const currentTargets = manualTargets[activePlanTab] || [];
      return currentTargets.reduce((acc, curr) => ({
          N: acc.N + curr.N,
          P: acc.P + curr.P,
          K: acc.K + curr.K
      }), { N: 0, P: 0, K: 0 });
  }, [manualTargets, activePlanTab]);
  
  // NEW: Standard Guide Total for comparison
  const standardGuideTotal = useMemo(() => {
      let guideKey = '';
      if (activePlanTab === '그린') guideKey = '한지형잔디 (벤트그라스)';
      else if (activePlanTab === '티') guideKey = '한지형잔디 (켄터키블루그라스)';
      else if (activePlanTab === '페어웨이') guideKey = fairwayGuideType === 'KBG' ? '한지형잔디 (켄터키블루그라스)' : '난지형잔디 (한국잔디)';
      
      const guide = FERTILIZER_GUIDE[guideKey];
      return guide || { N: 0, P: 0, K: 0 };
  }, [activePlanTab, fairwayGuideType]);

  // NEW: Difference calculation
  const manualPlanDifference = useMemo(() => {
      return {
          N: manualPlanTotal.N - standardGuideTotal.N,
          P: manualPlanTotal.P - standardGuideTotal.P,
          K: manualPlanTotal.K - standardGuideTotal.K
      };
  }, [manualPlanTotal, standardGuideTotal]);

  const getRatioColor = (current: number, standard: number) => {
      if (standard === 0) return 'text-slate-500';
      const ratio = current / standard;
      if (ratio > 1.2) return 'text-red-500';
      if (ratio < 0.8) return 'text-orange-500';
      return 'text-green-600';
  };

  const handleGetRecommendation = async () => {
    setIsLoadingAI(true);
    setAiResponse('');
    setAiError(null);
    setAiAction(null);

    const manualPlanPrompt = manualPlanMode ? `
      **사용자 정의 연간 계획 (구역별, 단위: g/㎡):**
      - 그린 목표 총량: N ${manualTargets['그린'].reduce((a,b)=>a+b.N,0)}, P ${manualTargets['그린'].reduce((a,b)=>a+b.P,0)}, K ${manualTargets['그린'].reduce((a,b)=>a+b.K,0)}
      - 티 목표 총량: N ${manualTargets['티'].reduce((a,b)=>a+b.N,0)}, P ${manualTargets['티'].reduce((a,b)=>a+b.P,0)}, K ${manualTargets['티'].reduce((a,b)=>a+b.K,0)}
      - 페어웨이 목표 총량: N ${manualTargets['페어웨이'].reduce((a,b)=>a+b.N,0)}, P ${manualTargets['페어웨이'].reduce((a,b)=>a+b.P,0)}, K ${manualTargets['페어웨이'].reduce((a,b)=>a+b.K,0)}
    ` : `
      **가이드 권장 총량 (단일 가이드 기준):** N ${FERTILIZER_GUIDE[selectedGuide].N}, P ${FERTILIZER_GUIDE[selectedGuide].P}, K ${FERTILIZER_GUIDE[selectedGuide].K}
    `;

    const fullPrompt = `
      # 잔디 비료 관리 데이터 자동 분석 및 추천 요청

      ## 1. 분석 대상 데이터
      - **총 관리 면적:** ${totalManagedArea || '정보 없음'} ㎡ (그린: ${greenArea || 0}㎡, 티: ${teeArea || 0}㎡, 페어웨이: ${fairwayArea || 0}㎡)
      - **적용 시비 가이드 모드:** ${manualPlanMode ? '사용자 정의 연간 계획(구역별 개별 설정)' : selectedGuide}
      ${manualPlanPrompt}
      - **총 누적 비용:** ${Math.round(totalSummary.totalCost).toLocaleString()}원

      ## 2. 구역별 누적 시비량 (g/㎡)
      ### 그린
      ${NUTRIENTS.filter(n => categorySummariesPerM2['그린'][n] > 0).map(n => `- **${n}:** ${categorySummariesPerM2['그린'][n].toFixed(3)}g`).join('\n') || '- 데이터 없음'}
      ### 티
      ${NUTRIENTS.filter(n => categorySummariesPerM2['티'][n] > 0).map(n => `- **${n}:** ${categorySummariesPerM2['티'][n].toFixed(3)}g`).join('\n') || '- 데이터 없음'}
      ### 페어웨이
      ${NUTRIENTS.filter(n => categorySummariesPerM2['페어웨이'][n] > 0).map(n => `- **${n}:** ${categorySummariesPerM2['페어웨이'][n].toFixed(3)}g`).join('\n') || '- 데이터 없음'}

      ## 3. 최근 시비 기록
      ${log.slice(0, 10).map(l => `- **${l.date} (${l.usage}):** ${l.product} (${l.area}㎡, ${l.applicationRate}${l.applicationUnit})`).join('\n')}

      ## 4. 사용 가능한 비료 목록
      ${fertilizers.map(f => `- **${f.name}** (N-P-K: ${f.N}-${f.P}-${f.K}, 구분: ${f.usage})`).join('\n')}

      ---

      ## 5. AI 전문가 분석 및 실행 계획 제안 요청
      당신은 데이터 기반 잔디 관리 전문가입니다. 위 데이터를 종합적으로 분석하여 다음 내용을 포함한 보고서를 작성해주세요.

      1.  **현재 상황 진단:**
          - 현재 누적 시비량과 연간 목표를 비교 분석. (수동 계획 모드일 경우 각 구역별 목표치와 비교)
          - 영양소 불균형 및 과부족 상태 진단.

      2.  **🚨 가장 시급하고 중요한 다음 시비 계획 (Must-Do):**
          - 이 섹션은 가장 먼저, 눈에 띄게 작성해주세요.
          - **추천 비료:** (보유 목록 중 선택)
          - **시비 대상 구역:** (그린, 티, 페어웨이 중)
          - **정확한 시비량:** (g/㎡ 또는 ml/㎡)
          - **추천 시기:** (예: 향후 1주일 이내, 비 온 직후 등 구체적으로)
          - **선정 이유:** 간략한 근거.

      3.  **📅 향후 12개월 상세 월별 관리 계획:**
          - 현재 시점부터 향후 1년치 계획을 표(Table) 형식으로 작성해주세요.

      4.  **장기 전략 및 조언:** 비용 효율성 및 잔디 품질 향상을 위한 조언.

      5.  **형식:** 답변은 한국어로, 전문가처럼 명확하고 구조화된 형식(마크다운 사용)으로 작성해주세요.
      
      6. **[중요] 시급한 시비 계획 데이터:**
      답변의 맨 마지막에, 추천하는 가장 시급한 시비 계획을 아래 JSON 형식으로 작성해주세요. 코드는 반드시 \`\`\`json ... \`\`\` 블록으로 감싸주세요. 비료 이름은 반드시 위 목록에 있는 정확한 이름을 사용해야 합니다.
      \`\`\`json
      {
        "productName": "비료명",
        "targetArea": "그린" 또는 "티" 또는 "페어웨이",
        "rate": 숫자(단위 제외, 예: 15),
        "reason": "추천 이유 요약"
      }
      \`\`\`
    `;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
      });

      let text = response.text;
      
      // Parse JSON Action with robust regex
      // Tries to find ```json ... ``` first, then falls back to finding the first { ... } block
      let jsonMatch = text?.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (!jsonMatch) {
          jsonMatch = text?.match(/(\{[\s\S]*"productName"[\s\S]*\})/);
      }

      if (jsonMatch) {
          try {
              const actionData = JSON.parse(jsonMatch[1]);
              if(actionData.productName && actionData.targetArea && actionData.rate) {
                  setAiAction(actionData);
                  // Remove the JSON block from display text if it was inside code blocks
                  if (text && text.includes('```json')) {
                       text = text.replace(/```json\s*\{[\s\S]*?\}\s*```/, '');
                  }
              }
          } catch (e) {
              console.error("Failed to parse AI action JSON", e);
          }
      }

      setAiResponse(text || '');
    } catch (error) {
      console.error("Error getting AI recommendation:", error);
      setAiError("AI 추천을 받아오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
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
            
            // Select Tab
            if (aiAction.targetArea === '그린') setActiveLogTab('그린');
            else if (aiAction.targetArea === '티') setActiveLogTab('티');
            else if (aiAction.targetArea === '페어웨이') setActiveLogTab('페어웨이');
            
            // Scroll to log section
            logSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            alert(`추천된 비료 '${aiAction.productName}'를 목록에서 찾을 수 없습니다.`);
        }
    };
  
  const handleCalculate = () => {
    if (!calculatorProduct) { alert('계산할 비료를 선택하세요.'); return; }
    const areaNum = parseFloat(calculatorArea);
    const rateNum = parseFloat(calculatorRate);
    if (isNaN(areaNum) || areaNum <= 0 || isNaN(rateNum) || rateNum < 0) {
      alert('면적과 사용량은 0보다 큰 숫자여야 합니다.');
      return;
    }
    const { nutrients, totalCost } = getApplicationDetails(calculatorProduct, areaNum, rateNum);
    const { nutrients: nutrientsPerM2 } = getApplicationDetails(calculatorProduct, 1, rateNum);
    const isLiquid = calculatorProduct.type === '액상';
    const totalAmount = (areaNum * rateNum) / 1000; // to kg or L

    setCalculatorResults({
      totalAmount,
      totalCost,
      nutrients,
      nutrientsPerM2,
      unit: isLiquid ? 'L' : 'kg',
    });
  };

  // Implement frequentCombinations
  const frequentCombinations = useMemo(() => {
      if (log.length === 0) return [];
      const counts: Record<string, number> = {};
      const details: Record<string, {name: string, rate: number, unit: string}> = {};

      log.forEach(entry => {
          const key = `${entry.product}|${entry.applicationRate}`;
          counts[key] = (counts[key] || 0) + 1;
          if (!details[key]) {
              details[key] = {
                  name: entry.product,
                  rate: entry.applicationRate,
                  unit: entry.applicationUnit
              };
          }
      });

      return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([key]) => details[key]);
  }, [log]);

  // Implement handleQuickAdd
  const handleQuickAdd = (productName: string, rate: number) => {
      const product = fertilizers.find(f => f.name === productName);
      if (product) {
          setSelectedProduct(product);
          setApplicationRate(rate.toString());
          setDate(new Date().toISOString().split('T')[0]);
      }
  };

  const formattedAiResponse = useMemo((): string => {
    if (!aiResponse) return '';
    
    let html = aiResponse
      .replace(/^## (.*$)/gim, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^\s*[-*] (.*$)/gim, '<li>$1</li>');
      
    html = html.replace(/((<li>.*<\/li>\s*)+)/g, '<ul>\n$1</ul>\n');
    html = html.replace(/\n/g, '<br />');
    html = html.replace(/<br \/>\s*<ul>/g, '<ul>');
    html = html.replace(/<\/ul>\s*<br \/>/g, '</ul>');
    
    return html;
  }, [aiResponse]);
  
  // Custom Tooltip for Combined Chart to show Total Amount
  const CustomChartTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
          // Extract data from payload
          const n = payload.find((p:any) => p.dataKey === 'N')?.value || 0;
          const p = payload.find((p:any) => p.dataKey === 'P')?.value || 0;
          const k = payload.find((p:any) => p.dataKey === 'K')?.value || 0;
          const total = n + p + k;

          return (
              <div className="bg-white p-3 border shadow-lg rounded text-xs">
                  <p className="font-bold mb-2 text-slate-700">{String(label)}</p>
                  <div className="space-y-1">
                      <p className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          <span className="text-slate-600">질소(N):</span>
                          <span className="font-bold text-green-700">{n.toFixed(2)} g/㎡</span>
                      </p>
                      <p className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <span className="text-slate-600">인산(P):</span>
                          <span className="font-bold text-blue-700">{p.toFixed(2)} g/㎡</span>
                      </p>
                      <p className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                          <span className="text-slate-600">칼륨(K):</span>
                          <span className="font-bold text-orange-700">{k.toFixed(2)} g/㎡</span>
                      </p>
                  </div>
                  <div className="border-t my-2 border-slate-200"></div>
                  <p className="font-bold text-slate-800 flex justify-between gap-4">
                      <span>{isCumulative ? '누적' : '총'} 투입량 (순성분):</span>
                      <span>{total.toFixed(2)} g/㎡</span>
                  </p>
              </div>
          );
      }
      return null;
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (isInitialDataLoading) {
    return <LoadingSpinner />;
  }
  
  if (isAdmin) {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }


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
                <div className="flex gap-2">
                    {/* NEW: AI Import Button */}
                    <div className="relative">
                        <input 
                            type="file" 
                            ref={planFileInputRef}
                            onChange={handlePlanFileUpload}
                            accept=".xlsx, .xls, .csv, application/pdf, image/*"
                            className="hidden"
                        />
                        <button 
                            onClick={() => planFileInputRef.current?.click()} 
                            disabled={isImportingPlan}
                            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors font-bold ${isImportingPlan ? 'bg-slate-100 text-slate-400' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                        >
                            {isImportingPlan ? <div className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full"></div> : <UploadIcon className="w-4 h-4" />}
                            AI 계획 불러오기
                        </button>
                    </div>

                    <button onClick={() => setManualPlanMode(!manualPlanMode)} className={`text-sm px-3 py-1.5 rounded transition-colors font-bold ${manualPlanMode ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {manualPlanMode ? '가이드 보기' : '직접 계획 수립하기'}
                    </button>
                </div>
            </div>
            
            {/* Removed 'open' attribute to hide by default */}
            <details className="group">
                <summary className="cursor-pointer font-medium text-slate-600 flex items-center gap-2 select-none mb-4">
                     <span className="transition-transform group-open:rotate-90">▶</span> 상세 계획 보기/숨기기
                </summary>
                <div className="animate-fadeIn">
                    {!manualPlanMode ? (
                        <>
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6">
                                <div className="flex justify-between items-start mb-3">
                                    <p className="text-sm text-amber-800 font-medium">관리 중인 잔디 종류를 선택하여 연간 표준 시비량을 확인하세요.</p>
                                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded border border-amber-200">참고: 한국잔디연구소 표준 시비량 응용</span>
                                </div>
                                <div className="flex border-b border-amber-200 mb-3 flex-wrap">
                                    {Object.keys(FERTILIZER_GUIDE).map(grassType