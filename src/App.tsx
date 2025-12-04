
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
  
  // AI Plan Import State
  const [isPlanImportLoading, setIsPlanImportLoading] = useState(false);

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
  const [topdressing, setTopdressing] = useState(''); // NEW: Topdressing State (mm)
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);

  // Reverse Calculator State
  const [targetNutrientType, setTargetNutrientType] = useState<'N'|'P'|'K'>('N');
  const [targetNutrientAmount, setTargetNutrientAmount] = useState('');


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
        setTargetNutrientAmount('');
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

  // Reverse Calculator Logic
  const handleReverseCalculate = () => {
      if (!selectedProduct || !targetNutrientAmount) return;
      
      const target = parseFloat(targetNutrientAmount);
      if (isNaN(target) || target <= 0) {
          alert("목표 성분량을 올바르게 입력해주세요.");
          return;
      }

      // Percentage of selected nutrient
      const percentage = (selectedProduct as any)[targetNutrientType] || 0;
      
      if (percentage <= 0) {
          alert(`${selectedProduct.name}에는 ${targetNutrientType} 성분이 포함되어 있지 않습니다.`);
          return;
      }

      // Formula: Required Rate (g/m2) = Target (g/m2) * 100 / Percentage
      // Note: This calculates 'product amount'. 
      // If liquid and concentration is involved, getApplicationDetails logic is needed, but usually percentage is final.
      // Assuming standard % w/w or w/v. 
      // rate = target / (percentage / 100)
      
      const requiredRate = target * 100 / percentage;
      
      // If liquid, requiredRate is grams. If unit is ml, convert via density.
      // Assuming density ~ 1 if not specified, or just stick to 'rate' value as entered.
      // The app treats rate input as 'g' or 'ml' directly.
      
      let finalRate = requiredRate;
      
      // If product uses liquid rate (ml), we might need density adjustment if the percentage is w/w.
      // Simple assumption: input rate matches the unit of the product. 
      // If type is liquid, usually rate is ml. 
      if (selectedProduct.type === '액상' && selectedProduct.density && selectedProduct.density > 0) {
          // If percentage is w/w, then 100g product has X g nutrient. 
          // We need Y g product -> Y / density = ml.
          finalRate = requiredRate / selectedProduct.density;
      }
      
      setApplicationRate(finalRate.toFixed(1));
  };


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
    
    const parsedTopdressing = topdressing ? parseFloat(topdressing) : undefined;

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

    setLog(prev => [entry, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    
    alert(`완료: ${usage} 구역에 시비 기록이 추가되었습니다.`);
    setIsProductSelectOpen(false); // Close product select if open
    setLogSearchTerm('');
    setTopdressing(''); // Reset topdressing
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
  const aggregatedProductQuantity = useMemo((): [string, { totalAmount: number, unit: string, cost: number }][] => {
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

  // NEW: Calculate Annual Topdressing Total
  const annualTopdressingTotal = useMemo(() => {
      let total = 0;
      filteredLogForAnalysis.forEach(entry => {
          if (entry.topdressing) {
              total += entry.topdressing;
          }
      });
      return total;
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
        }));
    }, [manualTargets, activePlanTab, selectedGuide, fairwayGuideType]);


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
        
        // Add Topdressing
        if (entry.topdressing) {
            row['배토(mm)'] = entry.topdressing;
        }

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
  
  // AI Plan Import Handler
  const handleImportPlan = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsPlanImportLoading(true);
      
      try {
          const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY as string) });
          let promptContext = "";
          let inlineDataParts: any[] = [];

          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
                const data = await file.arrayBuffer();
                const wb = XLSX.read(data, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const csvData = XLSX.utils.sheet_to_csv(ws);
                promptContext = `Extracted Spreadsheet Data:\n${csvData}`;
          } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
               const reader = new FileReader();
               const result = await new Promise<string>((resolve) => {
                   reader.onloadend = () => resolve(reader.result as string);
                   reader.readAsDataURL(file);
               });
               
               const base64Data = result.split(',')[1];
               inlineDataParts = [{
                   inlineData: {
                       data: base64Data,
                       mimeType: file.type
                   }
               }];
               promptContext = "Analyze this document/image.";
          } else {
               // Text
               const text = await file.text();
               promptContext = `File Content:\n${text}`;
          }

          const prompt = `
            Analyze the attached turf management plan data. 
            Extract the monthly N, P, K application targets (g/m²) for ALL zones present ('그린', '티', '페어웨이').
            
            Return ONLY a JSON object with this EXACT structure:
            {
              "그린": [{"N": number, "P": number, "K": number}, ... (array of 12 objects for Jan-Dec)],
              "티": [{"N": number, "P": number, "K": number}, ...],
              "페어웨이": [{"N": number, "P": number, "K": number}, ...]
            }
            
            Rules:
            1. If a zone is missing in the file, return an empty array for it.
            2. If a specific month or nutrient is missing, use 0.
            3. Ensure the arrays have exactly 12 items (Jan to Dec).
            4. Do not include markdown formatting like \`\`\`json.
            
            Input:
            ${promptContext}
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: {
                  parts: [
                      { text: prompt },
                      ...inlineDataParts
                  ]
              }
          });
          
          let text = response.text || "{}";
          text = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const data = JSON.parse(text);
          
          // Merge with existing
          const newTargets = { ...manualTargets };
          if(Array.isArray(data['그린']) && data['그린'].length === 12) newTargets['그린'] = data['그린'];
          if(Array.isArray(data['티']) && data['티'].length === 12) newTargets['티'] = data['티'];
          if(Array.isArray(data['페어웨이']) && data['페어웨이'].length === 12) newTargets['페어웨이'] = data['페어웨이'];
          
          setManualTargets(newTargets);
          alert("AI가 연간 계획을 성공적으로 불러왔습니다. 내용을 확인해주세요.");

      } catch (error) {
          console.error("AI Import Error", error);
          alert("파일 분석 중 오류가 발생했습니다.");
      } finally {
          setIsPlanImportLoading(false);
          // Reset file input
          if(fileInputRef.current) fileInputRef.current.value = '';
      }
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

      let text = response.text || "";
      
      // Parse JSON Action with robust regex
      // Tries to find ```json ... ``` first, then falls back to finding the first { ... } block
      let jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (!jsonMatch) {
          jsonMatch = text.match(/(\{[\s\S]*"productName"[\s\S]*\})/);
      }

      if (jsonMatch) {
          try {
              const actionData = JSON.parse(jsonMatch[1]);
              if(actionData.productName && actionData.targetArea && actionData.rate) {
                  setAiAction(actionData);
                  // Remove the JSON block from display text if it was inside code blocks
                  if (text.includes('```json')) {
                       text = text.replace(/```json\s*\{[\s\S]*?\}\s*```/, '');
                  }
              }
          } catch (e) {
              console.error("Failed to parse AI action JSON", e);
          }
      }

      setAiResponse(text);
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

  const formattedAiResponse = useMemo(() => {
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
                  <p className="font-bold mb-2 text-slate-700">{label}</p>
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
                <button onClick={() => setManualPlanMode(!manualPlanMode)} className={`text-sm px-3 py-1 rounded transition-colors ${manualPlanMode ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {manualPlanMode ? '가이드 보기' : '직접 계획 수립하기'}
                </button>
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

                            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                                <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                                    <h3 className="font-semibold text-slate-700">📅 월별 표준 시비 스케줄 (g/㎡)</h3>
                                    <div className="text-xs flex gap-3">
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-sm"></span> 질소(N)</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm"></span> 인산(P)</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded-sm"></span> 칼륨(K)</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-center border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-700 text-xs uppercase">
                                                <th className="p-2 border-r border-b w-16">월</th>
                                                <th className="p-2 border-b w-1/3">질소 (N)</th>
                                                <th className="p-2 border-b w-1/3">인산 (P)</th>
                                                <th className="p-2 border-b w-1/3">칼륨 (K)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {Array.from({length: 12}, (_, i) => {
                                                const dist = MONTHLY_DISTRIBUTION[selectedGuide];
                                                const guide = FERTILIZER_GUIDE[selectedGuide];
                                                const n = parseFloat((guide.N * dist.N[i]).toFixed(2));
                                                const p = parseFloat((guide.P * dist.P[i]).toFixed(2));
                                                const k = parseFloat((guide.K * dist.K[i]).toFixed(2));
                                                
                                                // Max Value for Heatmap intensity (approx 3g as max monthly input)
                                                const maxVal = 3; 

                                                return (
                                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-2 font-bold text-slate-600 border-r bg-slate-50/50">{i + 1}월</td>
                                                        <td className="p-0 border-r relative h-10 align-middle">
                                                            <div className="absolute inset-0 bg-green-500 transition-all" style={{ opacity: Math.min(n / maxVal, 1) * 0.5 }}></div>
                                                            <span className="relative z-10 font-mono font-semibold text-slate-700">{n > 0 ? `${n}` : ''}</span>
                                                        </td>
                                                        <td className="p-0 border-r relative h-10 align-middle">
                                                            <div className="absolute inset-0 bg-blue-500 transition-all" style={{ opacity: Math.min(p / maxVal, 1) * 0.5 }}></div>
                                                            <span className="relative z-10 font-mono font-semibold text-slate-700">{p > 0 ? `${p}` : ''}</span>
                                                        </td>
                                                        <td className="p-0 relative h-10 align-middle">
                                                            <div className="absolute inset-0 bg-orange-500 transition-all" style={{ opacity: Math.min(k / maxVal, 1) * 0.5 }}></div>
                                                            <span className="relative z-10 font-mono font-semibold text-slate-700">{k > 0 ? `${k}` : ''}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="animate-fadeIn">
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-3">
                                    <p className="text-sm text-blue-800 font-medium">나만의 월별 목표 시비량을 구역별로 설정하여 연간 계획을 수립하세요. (단위: g/㎡)</p>
                                    
                                    {/* AI Import Button */}
                                    <div className="relative">
                                        <input 
                                            type="file" 
                                            ref={fileInputRef}
                                            onChange={handleImportPlan}
                                            accept=".xlsx,.xls,.csv,.pdf,image/*"
                                            className="hidden"
                                        />
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isPlanImportLoading}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 transition shadow-sm whitespace-nowrap disabled:opacity-50"
                                        >
                                            {isPlanImportLoading ? (
                                                <>
                                                    <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
                                                    분석 중...
                                                </>
                                            ) : (
                                                <>
                                                    <SparklesIcon /> 엑셀/PDF 계획 불러오기 (AI)
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Area Tab Selector */}
                                <div className="flex border-b border-blue-300 mb-3">
                                    {(['그린', '티', '페어웨이'] as const).map(tab => (
                                        <button 
                                            key={tab}
                                            onClick={() => setActivePlanTab(tab)}
                                            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${
                                                activePlanTab === tab 
                                                    ? 'bg-white text-blue-700 border-t border-l border-r border-blue-300 -mb-px' 
                                                    : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                            }`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>

                                {activePlanTab === '페어웨이' && (
                                    <div className="flex items-center gap-2 mb-2 px-2">
                                        <span className="text-xs font-bold text-slate-600">참고 가이드 기준:</span>
                                        <button onClick={() => setFairwayGuideType('KBG')} className={`px-2 py-1 text-xs rounded border transition-colors ${fairwayGuideType === 'KBG' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}>켄터키블루그라스</button>
                                        <button onClick={() => setFairwayGuideType('Zoysia')} className={`px-2 py-1 text-xs rounded border transition-colors ${fairwayGuideType === 'Zoysia' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-300'}`}>한국잔디</button>
                                    </div>
                                )}

                                <div className="overflow-x-auto bg-white rounded-b-lg border border-t-0 border-blue-300 p-2">
                                    <table className="w-full text-sm text-center border-collapse bg-white">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-700">
                                                <th className="p-2 border w-16">월</th>
                                                <th className="p-2 border text-green-700">목표 N</th>
                                                <th className="p-2 border text-blue-700">목표 P</th>
                                                <th className="p-2 border text-orange-700">목표 K</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(manualTargets[activePlanTab] || []).map((target, i) => {
                                                // LOGIC CHANGE: Determine guide based on active tab
                                                let manualGuideKey = selectedGuide;
                                                if (activePlanTab === '그린') manualGuideKey = '한지형잔디 (벤트그라스)';
                                                else if (activePlanTab === '티') manualGuideKey = '한지형잔디 (켄터키블루그라스)';
                                                else if (activePlanTab === '페어웨이') manualGuideKey = fairwayGuideType === 'KBG' ? '한지형잔디 (켄터키블루그라스)' : '난지형잔디 (한국잔디)';

                                                const dist = MONTHLY_DISTRIBUTION[manualGuideKey];
                                                const guide = FERTILIZER_GUIDE[manualGuideKey];
                                                const stdN = dist ? (guide.N * dist.N[i]).toFixed(1) : '0';
                                                const stdP = dist ? (guide.P * dist.P[i]).toFixed(1) : '0';
                                                const stdK = dist ? (guide.K * dist.K[i]).toFixed(1) : '0';

                                                return (
                                                <tr key={i} className="border-b">
                                                    <td className="p-2 font-medium bg-slate-50">{i + 1}월</td>
                                                    <td className="p-1 border relative group">
                                                        <input type="number" step="0.1" min="0" value={target.N || ''} onChange={(e) => handleManualTargetChange(i, 'N', e.target.value)} className="w-full text-center p-1 border-gray-300 rounded focus:ring-green-500 focus:border-green-500" placeholder={stdN} />
                                                        <div className="text-[10px] text-slate-400 text-right pr-1 pointer-events-none">표준:{stdN}</div>
                                                    </td>
                                                    <td className="p-1 border relative group">
                                                        <input type="number" step="0.1" min="0" value={target.P || ''} onChange={(e) => handleManualTargetChange(i, 'P', e.target.value)} className="w-full text-center p-1 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500" placeholder={stdP} />
                                                        <div className="text-[10px] text-slate-400 text-right pr-1 pointer-events-none">표준:{stdP}</div>
                                                    </td>
                                                    <td className="p-1 border relative group">
                                                        <input type="number" step="0.1" min="0" value={target.K || ''} onChange={(e) => handleManualTargetChange(i, 'K', e.target.value)} className="w-full text-center p-1 border-gray-300 rounded focus:ring-orange-500 focus:border-orange-500" placeholder={stdK} />
                                                        <div className="text-[10px] text-slate-400 text-right pr-1 pointer-events-none">표준:{stdK}</div>
                                                    </td>
                                                </tr>
                                            )})}
                                            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                                <td className="p-2">계획 합계</td>
                                                <td className="p-2 text-green-800">{manualPlanTotal.N.toFixed(1)}</td>
                                                <td className="p-2 text-blue-800">{manualPlanTotal.P.toFixed(1)}</td>
                                                <td className="p-2 text-orange-800">{manualPlanTotal.K.toFixed(1)}</td>
                                            </tr>
                                            {/* NEW: Comparison Rows */}
                                            <tr className="bg-slate-50 text-xs border-t border-slate-200">
                                                <td className="p-2 font-semibold text-slate-600">표준 합계</td>
                                                <td className="p-2 font-mono text-slate-600">{standardGuideTotal.N}</td>
                                                <td className="p-2 font-mono text-slate-600">{standardGuideTotal.P}</td>
                                                <td className="p-2 font-mono text-slate-600">{standardGuideTotal.K}</td>
                                            </tr>
                                            <tr className="bg-slate-50 text-xs border-t border-slate-200">
                                                <td className="p-2 font-semibold text-slate-600">표준 대비</td>
                                                <td className={`p-2 font-bold ${getRatioColor(manualPlanTotal.N, standardGuideTotal.N)}`}>
                                                    {standardGuideTotal.N > 0 ? Math.round((manualPlanTotal.N / standardGuideTotal.N) * 100) : 0}%
                                                </td>
                                                <td className={`p-2 font-bold ${getRatioColor(manualPlanTotal.P, standardGuideTotal.P)}`}>
                                                    {standardGuideTotal.P > 0 ? Math.round((manualPlanTotal.P / standardGuideTotal.P) * 100) : 0}%
                                                </td>
                                                <td className={`p-2 font-bold ${getRatioColor(manualPlanTotal.K, standardGuideTotal.K)}`}>
                                                    {standardGuideTotal.K > 0 ? Math.round((manualPlanTotal.K / standardGuideTotal.K) * 100) : 0}%
                                                </td>
                                            </tr>
                                            {/* NEW ROW: Difference (Plan - Standard) */}
                                            <tr className="bg-slate-50 text-xs border-t border-slate-200">
                                                <td className="p-2 font-semibold text-slate-600">차이 (±g)</td>
                                                <td className={`p-2 font-bold font-mono ${manualPlanDifference.N > 0 ? 'text-red-500' : manualPlanDifference.N < 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                                    {manualPlanDifference.N > 0 ? '+' : ''}{manualPlanDifference.N.toFixed(1)}
                                                </td>
                                                <td className={`p-2 font-bold font-mono ${manualPlanDifference.P > 0 ? 'text-red-500' : manualPlanDifference.P < 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                                    {manualPlanDifference.P > 0 ? '+' : ''}{manualPlanDifference.P.toFixed(1)}
                                                </td>
                                                <td className={`p-2 font-bold font-mono ${manualPlanDifference.K > 0 ? 'text-red-500' : manualPlanDifference.K < 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                                    {manualPlanDifference.K > 0 ? '+' : ''}{manualPlanDifference.K.toFixed(1)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            {/* Comparison Chart Section */}
                            <div className="mt-6 bg-white p-4 rounded-lg border shadow-sm">
                                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    📊 계획 vs 표준 가이드 비교
                                </h3>
                                <div className="h-64">
                                     <ResponsiveContainer width="100%" height="100%">
                                         <ComposedChart data={manualPlanComparisonData} margin={{top: 5, right: 20, left: 0, bottom: 5}}>
                                             <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                             <XAxis dataKey="month" fontSize={12} />
                                             <YAxis fontSize={12} label={{ value: 'g/㎡', angle: -90, position: 'insideLeft' }} />
                                             <Tooltip contentStyle={{fontSize: '12px'}} />
                                             <Legend wrapperStyle={{fontSize: "12px"}}/>
                                             
                                             <Bar dataKey="planN" name="질소(계획)" fill="#16a34a" barSize={8} />
                                             <Line type="monotone" dataKey="stdN" name="질소(표준)" stroke="#15803d" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                                             
                                             <Bar dataKey="planP" name="인산(계획)" fill="#3b82f6" barSize={8} />
                                             <Line type="monotone" dataKey="stdP" name="인산(표준)" stroke="#1d4ed8" strokeWidth={2} strokeDasharray="3 3" dot={false} />

                                             <Bar dataKey="planK" name="칼륨(계획)" fill="#f97316" barSize={8} />
                                             <Line type="monotone" dataKey="stdK" name="칼륨(표준)" stroke="#c2410c" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                                         </ComposedChart>
                                     </ResponsiveContainer>
                                </div>
                                <p className="text-xs text-slate-400 mt-2 text-center">* 막대는 사용자 계획, 점선은 표준 가이드라인입니다.</p>
                            </div>
                        </div>
                    )}
                </div>
            </details>
        </section>

        {/* Fertilizer List Section */}
        <section className="bg-white rounded-lg shadow-md overflow-hidden">
            <div 
                onClick={() => setIsFertilizerListOpen(!isFertilizerListOpen)} 
                className="p-6 flex justify-between items-center cursor-pointer bg-white hover:bg-slate-50 transition-colors"
            >
                <h2 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                    🌱 보유 비료 목록
                </h2>
                <button className="text-slate-500">
                    {isFertilizerListOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </button>
            </div>

            {isFertilizerListOpen && (
                <div className="p-6 pt-0 border-t animate-fadeIn">
                    <div className="mb-4 mt-4 flex flex-col sm:flex-row justify-end items-end sm:items-center gap-4">
                        {/* Filters */}
                        <div className="flex gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:w-32">
                                <select 
                                    value={filterUsage}
                                    onChange={(e) => setFilterUsage(e.target.value)}
                                    className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-3 pr-8 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-slate-100 transition-colors"
                                >
                                    <option value="전체">전체 용도</option>
                                    <option value="그린">그린</option>
                                    <option value="티">티</option>
                                    <option value="페어웨이">페어웨이</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                    <ChevronDownIcon className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="relative flex-1 sm:w-32">
                                <select 
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-3 pr-8 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-slate-100 transition-colors"
                                >
                                    <option value="전체">전체 타입</option>
                                    {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                    <ChevronDownIcon className="h-4 w-4" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredFertilizersList.map(fertilizer => (
                            <div 
                                key={fertilizer.name} 
                                onClick={() => setDetailModalFertilizer(fertilizer)}
                                className={`
                                    group relative bg-white rounded-lg border border-slate-200 shadow-sm 
                                    hover:shadow-md hover:border-blue-400 transition-all cursor-pointer 
                                    flex flex-col p-3
                                `}
                            >
                                {/* Top Row: Name and Price */}
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {/* Usage Indicator Dot */}
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                            fertilizer.usage === '그린' ? 'bg-green-500' : 
                                            fertilizer.usage === '티' ? 'bg-blue-500' : 
                                            'bg-orange-500'
                                        }`} title={fertilizer.usage}></div>
                                        
                                        <h3 className="font-bold text-slate-800 text-sm truncate">
                                            {fertilizer.name}
                                        </h3>
                                        
                                        {/* NPK Badge */}
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono border border-slate-200 flex-shrink-0">
                                            {fertilizer.N}-{fertilizer.P}-{fertilizer.K}
                                        </span>
                                    </div>
                                    
                                    <div className="text-right pl-2 flex-shrink-0">
                                        <span className="font-bold text-slate-700 text-sm">{fertilizer.price.toLocaleString()}</span>
                                        <span className="text-[10px] text-slate-400 font-normal">원/{fertilizer.unit}</span>
                                    </div>
                                </div>

                                {/* Middle: Description */}
                                <p className="text-xs text-slate-500 leading-snug line-clamp-2 mb-2 min-h-[2.5em]">
                                    {fertilizer.description || "상세 설명 없음"}
                                </p>

                                {/* Bottom: Type and Action */}
                                <div className="mt-auto flex justify-between items-center pt-2 border-t border-slate-50">
                                    <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                                        {fertilizer.type}
                                    </span>
                                    <span className="text-[10px] text-blue-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                        상세보기 <ChevronDownIcon className="w-3 h-3 -rotate-90"/>
                                    </span>
                                </div>
                            </div>
                        ))}
                        {filteredFertilizersList.length === 0 && (
                            <div className="col-span-full py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                <p className="text-slate-400 text-sm">조건에 맞는 비료가 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>

        {/* Collapsible Calculator Section */}
        <section className="bg-white rounded-lg shadow-md overflow-hidden">
            <div 
                onClick={() => setIsCalculatorOpen(!isCalculatorOpen)} 
                className="p-6 flex justify-between items-center cursor-pointer bg-white hover:bg-slate-50 transition-colors"
            >
                <h2 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                    <CalculatorIcon /> 비료 필요량 계산기
                </h2>
                <button className="text-slate-500">
                    {isCalculatorOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </button>
            </div>
            
            {isCalculatorOpen && (
                <div className="p-6 pt-0 border-t animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">비료 선택</label>
                                <select 
                                    value={calculatorProduct?.name || ''} 
                                    onChange={(e) => setCalculatorProduct(fertilizers.find(f => f.name === e.target.value) || null)}
                                    className="w-full p-2 border border-slate-300 rounded-md"
                                >
                                    <option value="">비료를 선택하세요</option>
                                    {fertilizers.map(f => (
                                        <option key={f.name} value={f.name}>{f.name} (N-P-K: {f.N}-{f.P}-{f.K})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">시비 면적 (㎡)</label>
                                <input 
                                    type="number" 
                                    value={calculatorArea}
                                    onChange={(e) => setCalculatorArea(e.target.value)}
                                    placeholder="예: 500"
                                    className="w-full p-2 border border-slate-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">사용량 ({calculatorProduct?.type === '액상' ? 'ml/㎡' : 'g/㎡'})</label>
                                <input 
                                    type="number" 
                                    value={calculatorRate}
                                    onChange={(e) => setCalculatorRate(e.target.value)}
                                    placeholder={calculatorProduct ? parseRateValue(calculatorProduct.rate).toString() : ''}
                                    className="w-full p-2 border border-slate-300 rounded-md"
                                />
                            </div>
                            <button 
                                onClick={handleCalculate}
                                className="w-full bg-green-600 text-white font-semibold py-2 rounded-md hover:bg-green-700 transition-colors"
                            >
                                계산하기
                            </button>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            {calculatorResults ? (
                                <div className="space-y-4 h-full flex flex-col justify-center">
                                    <div className="text-center">
                                        <p className="text-sm text-slate-500 mb-1">총 필요 제품량</p>
                                        <p className="text-3xl font-bold text-slate-800">
                                            {calculatorResults.totalAmount.toFixed(1)}
                                            <span className="text-lg font-normal ml-1 text-slate-600">{calculatorResults.unit}</span>
                                        </p>
                                    </div>
                                    <div className="border-t border-slate-200 my-2"></div>
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 text-center">1㎡당 투입 성분량</p>
                                        <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                            <div className="bg-white p-2 rounded border">
                                                <span className="block text-xs text-slate-400">질소(N)</span>
                                                <span className="font-bold text-green-600">{calculatorResults.nutrientsPerM2.N.toFixed(2)}g</span>
                                            </div>
                                            <div className="bg-white p-2 rounded border">
                                                <span className="block text-xs text-slate-400">인산(P)</span>
                                                <span className="font-bold text-blue-600">{calculatorResults.nutrientsPerM2.P.toFixed(2)}g</span>
                                            </div>
                                            <div className="bg-white p-2 rounded border">
                                                <span className="block text-xs text-slate-400">칼륨(K)</span>
                                                <span className="font-bold text-orange-600">{calculatorResults.nutrientsPerM2.K.toFixed(2)}g</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-center mt-auto">
                                        <p className="text-xs text-slate-400">총 예상 비용</p>
                                        <p className="text-xl font-bold text-slate-700">{Math.round(calculatorResults.totalCost).toLocaleString()}원</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <CalculatorIcon />
                                    <p className="mt-2 text-sm">정보를 입력하고 계산하기를 누르세요.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>

        {/* Tabbed Log Input Section */}
        <section ref={logSectionRef} className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <PencilIcon /> 시비 기록 작성
            </h2>
            
            <div className="space-y-6">
                 {/* IMPROVED PRODUCT SELECTION */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="relative">
                        <label className="block text-sm font-medium text-slate-700 mb-1">비료 제품 선택</label>
                        <div 
                            className="w-full p-2 border border-slate-300 rounded-md cursor-pointer flex justify-between items-center bg-white"
                            onClick={() => setIsProductSelectOpen(!isProductSelectOpen)}
                        >
                            <span className={selectedProduct ? 'text-slate-800' : 'text-slate-400'}>
                                {selectedProduct ? `${selectedProduct.name} (${selectedProduct.usage})` : '비료를 선택하세요'}
                            </span>
                            <ChevronDownIcon className="text-slate-400 w-4 h-4" />
                        </div>
                        
                        {isProductSelectOpen && (
                            <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 flex flex-col">
                                <div className="p-2 border-b bg-slate-50 sticky top-0 z-10">
                                    <input 
                                        type="text" 
                                        placeholder="비료명 검색..." 
                                        value={logSearchTerm}
                                        onChange={(e) => setLogSearchTerm(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        autoFocus
                                        className="w-full p-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="overflow-y-auto flex-1">
                                    {['그린', '티', '페어웨이', '기타'].map(group => {
                                        const items = groupedFertilizers[group] || [];
                                        if (items.length === 0) return null;
                                        return (
                                            <div key={group}>
                                                <div className="px-3 py-1 bg-slate-100 text-xs font-bold text-slate-500 uppercase">{group}</div>
                                                {items.map(f => (
                                                    <div 
                                                        key={f.name}
                                                        onClick={() => {
                                                            setSelectedProduct(f);
                                                            const rateVal = parseRateValue(f.rate);
                                                            setApplicationRate(rateVal > 0 ? rateVal.toString() : '');
                                                            setDate(new Date().toISOString().split('T')[0]);
                                                            setIsProductSelectOpen(false);
                                                            setLogSearchTerm('');
                                                        }}
                                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center"
                                                    >
                                                        <span className="font-medium text-slate-700">{f.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] bg-slate-100 px-1.5 rounded text-slate-500">{f.type}</span>
                                                            <span className="text-xs text-slate-400">{f.N}-{f.P}-{f.K}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    {Object.keys(groupedFertilizers).every(k => groupedFertilizers[k].length === 0) && (
                                        <div className="p-4 text-center text-slate-400 text-sm">검색 결과가 없습니다.</div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {/* Selected Product Info */}
                        {selectedProduct && (
                            <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded border flex gap-3">
                                <span>성분: <strong>{selectedProduct.N}-{selectedProduct.P}-{selectedProduct.K}</strong></span>
                                <span>권장량: <strong>{selectedProduct.rate}</strong></span>
                                {selectedProduct.stock !== undefined && (
                                    <span>재고: <strong className={selectedProduct.stock <= 5 ? 'text-red-500' : 'text-slate-700'}>{selectedProduct.stock}</strong></span>
                                )}
                            </div>
                        )}
                        
                        {/* Frequent Combinations */}
                        {frequentCombinations.length > 0 && !selectedProduct && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                <span className="text-xs text-slate-500 self-center">자주 사용:</span>
                                {frequentCombinations.map((combo, idx) => (
                                    <button 
                                        key={idx}
                                        onClick={() => handleQuickAdd(combo.name, combo.rate)}
                                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-full border transition-colors"
                                    >
                                        {combo.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">날짜</label>
                                <input 
                                    type="date" 
                                    value={date} 
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    사용량 ({selectedProduct?.type === '액상' ? 'ml/㎡' : 'g/㎡'})
                                </label>
                                <input 
                                    type="number" 
                                    value={applicationRate} 
                                    onChange={(e) => setApplicationRate(e.target.value)}
                                    placeholder={selectedProduct ? parseRateValue(selectedProduct.rate).toString() : '0'}
                                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* NEW: Reverse Nutrient Calculator */}
                        {selectedProduct && (
                            <div className="bg-orange-50 p-2 rounded-lg border border-orange-100 text-xs">
                                <p className="font-bold text-orange-800 mb-2">⚡ 역산 계산기: 목표 순성분량으로 사용량 계산</p>
                                <div className="flex gap-2 items-center">
                                    <span>원하는</span>
                                    <select 
                                        value={targetNutrientType} 
                                        onChange={(e) => setTargetNutrientType(e.target.value as 'N'|'P'|'K')}
                                        className="p-1 border rounded bg-white"
                                    >
                                        <option value="N">질소(N)</option>
                                        <option value="P">인산(P)</option>
                                        <option value="K">칼륨(K)</option>
                                    </select>
                                    <span>양:</span>
                                    <input 
                                        type="number" 
                                        placeholder="g/㎡" 
                                        value={targetNutrientAmount}
                                        onChange={(e) => setTargetNutrientAmount(e.target.value)}
                                        className="w-16 p-1 border rounded"
                                    />
                                    <span>g</span>
                                    <button 
                                        onClick={handleReverseCalculate}
                                        className="ml-auto bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700 transition-colors"
                                    >
                                        계산 적용
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* NEW: Topdressing Input */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                <span>배토 작업 (선택사항)</span>
                                <span className="text-[10px] bg-slate-200 px-1 rounded text-slate-600">Topdressing</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    step="0.1"
                                    value={topdressing} 
                                    onChange={(e) => setTopdressing(e.target.value)}
                                    placeholder="두께 입력"
                                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                                <span className="text-sm font-semibold text-slate-600">mm</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* NUTRIENT PREVIEW CARD */}
                {nutrientPreview && (
                    <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-center justify-between animate-fadeIn">
                        <span className="text-xs font-bold text-indigo-800">✨ 순성분비 미리보기 (1㎡당 투입량)</span>
                        <div className="flex gap-3 text-sm font-mono">
                            <span className="text-green-700 font-bold">N: {nutrientPreview.N.toFixed(2)}g</span>
                            <span className="text-blue-700 font-bold">P: {nutrientPreview.P.toFixed(2)}g</span>
                            <span className="text-orange-700 font-bold">K: {nutrientPreview.K.toFixed(2)}g</span>
                        </div>
                    </div>
                )}

                {/* Area Input Tabs */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <p className="text-sm font-medium text-slate-700 mb-3">시비 구역 선택 및 면적 입력</p>
                    
                    <div className="flex gap-2 mb-4">
                        {(['그린', '티', '페어웨이'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveLogTab(tab)}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all ${
                                    activeLogTab === tab 
                                    ? tab === '그린' ? 'bg-green-600 text-white border-green-600 shadow-md' 
                                      : tab === '티' ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                      : 'bg-orange-600 text-white border-orange-600 shadow-md'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="animate-fadeIn">
                         {activeLogTab === '그린' && (
                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-semibold text-green-800">그린 면적 (㎡)</label>
                                    <button onClick={() => setLogGreenArea(greenArea)} className="text-[10px] text-blue-600 hover:underline">기본값({greenArea}) 불러오기</button>
                                </div>
                                <input 
                                    type="number" 
                                    placeholder="그린 면적 입력" 
                                    value={logGreenArea} 
                                    onChange={(e) => setLogGreenArea(e.target.value)}
                                    className="w-full p-3 border border-green-200 rounded-md text-lg font-mono focus:ring-2 focus:ring-green-500 outline-none" 
                                    autoFocus
                                />
                            </div>
                        )}
                        {activeLogTab === '티' && (
                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-semibold text-blue-800">티 면적 (㎡)</label>
                                    <button onClick={() => setLogTeeArea(teeArea)} className="text-[10px] text-blue-600 hover:underline">기본값({teeArea}) 불러오기</button>
                                </div>
                                <input 
                                    type="number" 
                                    placeholder="티 면적 입력" 
                                    value={logTeeArea} 
                                    onChange={(e) => setLogTeeArea(e.target.value)}
                                    className="w-full p-3 border border-blue-200 rounded-md text-lg font-mono focus:ring-2 focus:ring-blue-500 outline-none" 
                                    autoFocus
                                />
                            </div>
                        )}
                        {activeLogTab === '페어웨이' && (
                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-semibold text-orange-800">페어웨이 면적 (㎡)</label>
                                    <button onClick={() => setLogFairwayArea(fairwayArea)} className="text-[10px] text-blue-600 hover:underline">기본값({fairwayArea}) 불러오기</button>
                                </div>
                                <input 
                                    type="number" 
                                    placeholder="페어웨이 면적 입력" 
                                    value={logFairwayArea} 
                                    onChange={(e) => setLogFairwayArea(e.target.value)}
                                    className="w-full p-3 border border-orange-200 rounded-md text-lg font-mono focus:ring-2 focus:ring-orange-500 outline-none" 
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-3 text-right">
                         <p className="text-xs text-slate-500">예상 총 비용: <span className="font-bold text-slate-700">{Math.round(estimatedCost).toLocaleString()}원</span></p>
                    </div>
                </div>
                
                <button 
                    onClick={handleAddLog} 
                    className={`w-full py-3 text-white font-bold rounded-md shadow-sm transition-all transform hover:-translate-y-0.5 ${
                         activeLogTab === '그린' ? 'bg-green-600 hover:bg-green-700' :
                         activeLogTab === '티' ? 'bg-blue-600 hover:bg-blue-700' :
                         'bg-orange-600 hover:bg-orange-700'
                    }`}
                >
                    {activeLogTab} 시비 일지 추가하기
                </button>
            </div>
        </section>

        {/* Analysis Section - Charts & Tables */}
        <section className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-slate-700 mb-4">📊 비료 투입 현황 및 분석</h2>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                     {['all', '그린', '티', '페어웨이'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setAnalysisCategory(cat as any)}
                            className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                                analysisCategory === cat 
                                    ? 'bg-slate-800 text-white' 
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {cat === 'all' ? '전체 구역' : cat}
                        </button>
                     ))}
                </div>

                {analysisCategory === '페어웨이' && (
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                        <span className="text-xs font-bold text-slate-500 pl-2">비교 기준:</span>
                        <button 
                            onClick={() => setAnalysisFairwayType('KBG')} 
                            className={`px-2 py-1 text-xs rounded transition-colors ${analysisFairwayType === 'KBG' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            켄터키블루그라스
                        </button>
                        <button 
                            onClick={() => setAnalysisFairwayType('Zoysia')} 
                            className={`px-2 py-1 text-xs rounded transition-colors ${analysisFairwayType === 'Zoysia' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            한국잔디(중지)
                        </button>
                    </div>
                )}
            </div>
            
            {/* Comparison Guide Info */}
            {analysisCategory !== 'all' && (
                <div className="mb-4 text-xs text-slate-500 bg-slate-50 p-2 rounded flex items-center gap-2">
                    <span className="font-bold">💡 비교 가이드:</span>
                    {analysisCategory === '그린' && <span>한지형잔디 (벤트그라스) 표준 시비량과 비교합니다.</span>}
                    {analysisCategory === '티' && <span>한지형잔디 (켄터키블루그라스) 표준 시비량과 비교합니다.</span>}
                    {analysisCategory === '페어웨이' && <span>{analysisFairwayType === 'KBG' ? '켄터키블루그라스' : '한국잔디'} 표준 시비량과 비교합니다.</span>}
                </div>
            )}
            
            {/* NEW: Total Product Quantity Summary */}
            {analysisCategory !== 'all' && (
                <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h4 className="font-bold text-slate-700 text-sm mb-3">📦 제품 투입 총량 (Top 5)</h4>
                        <div className="space-y-2">
                            {aggregatedProductQuantity.length > 0 ? aggregatedProductQuantity.map(([name, data]) => (
                                <div key={name} className="flex justify-between items-center text-sm p-2 bg-white rounded border border-slate-100">
                                    <span className="text-slate-700 font-medium truncate flex-1">{name}</span>
                                    <div className="text-right">
                                        <span className="font-bold text-slate-900">{data.totalAmount.toFixed(1)} {data.unit}</span>
                                        <div className="text-right">
                                            <span className="text-[10px] text-slate-400">{Math.round(data.cost).toLocaleString()}원</span>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-xs text-slate-400 text-center py-2">데이터가 없습니다.</p>
                            )}
                        </div>
                    </div>
                    {/* Summary and Topdressing */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                         <div className="text-center mb-4">
                             <p className="text-sm font-bold text-slate-700 mb-1">총 누적 투입 순성분 (연간)</p>
                             <div className="flex gap-4 mt-2 justify-center">
                                 <div>
                                     <span className="text-xs text-slate-500 block">N (질소)</span>
                                     <span className="text-xl font-bold text-green-600">
                                         {monthlyNutrientChartData.reduce((acc, cur) => acc + cur.N, 0).toFixed(1)}g
                                     </span>
                                 </div>
                                 <div>
                                     <span className="text-xs text-slate-500 block">P (인산)</span>
                                     <span className="text-xl font-bold text-blue-600">
                                         {monthlyNutrientChartData.reduce((acc, cur) => acc + cur.P, 0).toFixed(1)}g
                                     </span>
                                 </div>
                                 <div>
                                     <span className="text-xs text-slate-500 block">K (칼륨)</span>
                                     <span className="text-xl font-bold text-orange-600">
                                         {monthlyNutrientChartData.reduce((acc, cur) => acc + cur.K, 0).toFixed(1)}g
                                     </span>
                                 </div>
                             </div>
                         </div>
                         {/* Topdressing Total */}
                         <div className="border-t pt-3 text-center">
                             <p className="text-xs font-bold text-slate-500 mb-1">연간 총 배토량 (Topdressing)</p>
                             <p className="text-2xl font-bold text-amber-700">
                                 {annualTopdressingTotal.toFixed(1)} <span className="text-sm font-normal text-slate-600">mm</span>
                             </p>
                         </div>
                    </div>
                </div>
            )}
            
            {/* --- NEW CHART VISUALIZATION (Consolidated N/P/K) --- */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-700 text-lg">{isCumulative ? '📈 1㎡당 누적 순성분 투입 현황' : '📊 1㎡당 월별 순성분 투입 현황'}</h3>
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        <button 
                            onClick={() => setIsCumulative(false)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${!isCumulative ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            월별 보기
                        </button>
                        <button 
                            onClick={() => setIsCumulative(true)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${isCumulative ? 'bg-white shadow text-purple-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            누적 보기
                        </button>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={finalAnalysisData} margin={{top: 10, right: 10, left: 0, bottom: 0}}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="month" fontSize={12} tickFormatter={(val) => `${parseInt(val.split('-')[1])}월`} />
                                <YAxis fontSize={12} label={{ value: isCumulative ? '1㎡당 누적량 (g/㎡)' : '1㎡당 투입량 (g/㎡)', angle: -90, position: 'insideLeft' }} />
                                <Tooltip content={<CustomChartTooltip />} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                                <Legend wrapperStyle={{fontSize: '12px'}} />
                                
                                {/* Actual Inputs (Bars) */}
                                <Bar dataKey="N" name="질소(N) 순성분" fill="#22c55e" fillOpacity={0.8} barSize={15} />
                                <Bar dataKey="P" name="인산(P) 순성분" fill="#3b82f6" fillOpacity={0.8} barSize={15} />
                                <Bar dataKey="K" name="칼륨(K) 순성분" fill="#f97316" fillOpacity={0.8} barSize={15} />

                                {/* Guides (Lines) - Only show if specific category is selected */}
                                {analysisCategory !== 'all' && (
                                    <>
                                        <Line type="monotone" dataKey="guideN" name={isCumulative ? "누적 권장 N" : "권장 N"} stroke="#15803d" strokeWidth={3} strokeDasharray="5 5" dot={{r: 4}} />
                                        <Line type="monotone" dataKey="guideP" name={isCumulative ? "누적 권장 P" : "권장 P"} stroke="#1d4ed8" strokeWidth={3} strokeDasharray="5 5" dot={{r: 4}} />
                                        <Line type="monotone" dataKey="guideK" name={isCumulative ? "누적 권장 K" : "권장 K"} stroke="#c2410c" strokeWidth={3} strokeDasharray="5 5" dot={{r: 4}} />
                                    </>
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-center">* 막대는 실제 투입량(순성분), 점선은 권장/목표량입니다. 그래프에 마우스를 올리면 총 투입량을 확인할 수 있습니다.</p>
                </div>
            </div>
            
            {/* Detailed Data Table */}
            <details className="group border rounded-lg">
                <summary className="p-4 cursor-pointer font-semibold text-slate-600 bg-slate-50 flex items-center justify-between">
                    <span>📋 상세 데이터 표 보기 ({isCumulative ? '누적' : '월별'}) - 1㎡당 기준</span>
                    <span className="transition-transform group-open:rotate-180"><ChevronDownIcon /></span>
                </summary>
                <div className="p-4 overflow-x-auto animate-fadeIn">
                    <table className="w-full text-sm text-center border-collapse">
                        <thead className="bg-slate-100 text-slate-700">
                            <tr>
                                <th className="p-2 border sticky left-0 bg-slate-100">월</th>
                                <th className="p-2 border text-green-700 bg-green-50">질소 (N)</th>
                                <th className="p-2 border text-blue-700 bg-blue-50">인산 (P)</th>
                                <th className="p-2 border text-orange-700 bg-orange-50">칼륨 (K)</th>
                                <th className="p-2 border text-slate-700 bg-slate-200">성분 합계 (g/㎡)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {finalAnalysisData.map((data) => {
                                const isZero = data.N === 0 && data.P === 0 && data.K === 0;
                                const monthlyTotal = data.N + data.P + data.K;
                                return (
                                    <tr key={data.month} className={`hover:bg-slate-50 border-b ${isZero ? 'text-slate-300' : 'text-slate-700'}`}>
                                        <td className="p-2 border sticky left-0 bg-white font-medium">{data.month}</td>
                                        <td className="p-2 border bg-green-50/30">
                                            <div>{data.N > 0 ? data.N.toFixed(2) : '-'}</div>
                                            {analysisCategory !== 'all' && <div className="text-[10px] text-slate-400">목표: {data.guideN.toFixed(2)}</div>}
                                        </td>
                                        <td className="p-2 border bg-blue-50/30">
                                            <div>{data.P > 0 ? data.P.toFixed(2) : '-'}</div>
                                            {analysisCategory !== 'all' && <div className="text-[10px] text-slate-400">목표: {data.guideP.toFixed(2)}</div>}
                                        </td>
                                        <td className="p-2 border bg-orange-50/30">
                                            <div>{data.K > 0 ? data.K.toFixed(2) : '-'}</div>
                                            {analysisCategory !== 'all' && <div className="text-[10px] text-slate-400">목표: {data.guideK.toFixed(2)}</div>}
                                        </td>
                                        <td className="p-2 border bg-slate-50 font-semibold text-slate-800">
                                            {monthlyTotal > 0 ? monthlyTotal.toFixed(2) : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                <td className="p-2 sticky left-0 bg-slate-100">{isCumulative ? '최종 누적 (12월)' : '연간 총계'} (g/㎡)</td>
                                <td className="p-2 text-green-800">
                                    {finalAnalysisData.length > 0 ? finalAnalysisData[finalAnalysisData.length-1].N.toFixed(2) : '0.00'}
                                </td>
                                <td className="p-2 text-blue-800">
                                    {finalAnalysisData.length > 0 ? finalAnalysisData[finalAnalysisData.length-1].P.toFixed(2) : '0.00'}
                                </td>
                                <td className="p-2 text-orange-800">
                                    {finalAnalysisData.length > 0 ? finalAnalysisData[finalAnalysisData.length-1].K.toFixed(2) : '0.00'}
                                </td>
                                <td className="p-2 text-slate-900 bg-slate-200">
                                    {finalAnalysisData.length > 0 
                                        ? (finalAnalysisData[finalAnalysisData.length-1].N + finalAnalysisData[finalAnalysisData.length-1].P + finalAnalysisData[finalAnalysisData.length-1].K).toFixed(2) 
                                        : '0.00'}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </details>
        </section>
        
        <section className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center text-center space-y-4">
            <h2 className="text-xl font-bold text-slate-800">🤖 AI 전문가 분석 및 추천</h2>
            <p className="text-slate-600 max-w-lg">
                현재 잔디 상태와 시비 기록, 그리고 선택된 관리 가이드를 바탕으로<br/>
                AI가 최적의 시비 계획을 분석하고 제안해드립니다.
            </p>
            
            <button 
                onClick={handleGetRecommendation} 
                disabled={isLoadingAI}
                className={`w-full bg-purple-600 text-white font-semibold p-3 rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 shadow-md ${isLoadingAI ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
                {isLoadingAI ? (
                    <>
                         <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                         <span>AI가 데이터를 분석 중입니다...</span>
                    </>
                ) : (
                    <>
                        <SparklesIcon /> AI 추천 받기
                    </>
                )}
            </button>

            {aiError && (
                <div className="w-full p-4 bg-red-50 text-red-600 rounded-md border border-red-200 text-sm">
                    {aiError}
                </div>
            )}

            {aiResponse && (
                <div className="w-full text-left mt-6 animate-fadeIn">
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 shadow-sm">
                        <div className="prose prose-sm sm:prose max-w-none text-slate-700 mb-6" dangerouslySetInnerHTML={{ __html: formattedAiResponse }} />
                        
                        {aiAction && (
                            <div className="bg-white border-l-4 border-purple-600 p-4 rounded-r-lg shadow-sm">
                                <h4 className="font-bold text-purple-800 mb-2 flex items-center gap-2">
                                    🚀 AI 빠른 실행 제안
                                </h4>
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div>
                                        <p className="text-sm text-slate-600 mb-1">
                                            <span className="font-semibold text-slate-800">{aiAction.targetArea}</span> 구역에 
                                            <span className="font-semibold text-slate-800 mx-1">{aiAction.productName}</span>을(를) 
                                            <span className="font-bold text-purple-600 mx-1">{aiAction.rate}g/㎡</span> 시비하세요.
                                        </p>
                                        <p className="text-xs text-slate-500">{aiAction.reason}</p>
                                    </div>
                                    <button 
                                        onClick={handleApplyAiAction}
                                        className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition shadow-sm whitespace-nowrap"
                                    >
                                        일지에 적용하기
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>

        {/* Log List Section */}
        <section className="space-y-4">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                    <ClipboardListIcon /> 시비 일지 기록 ({sortedAndFilteredLog.length})
                </h2>
                <div className="flex gap-2">
                    <button onClick={handleExportToExcel} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 transition-colors shadow-sm">
                        <DownloadIcon /> 엑셀 다운로드
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex flex-col sm:flex-row gap-4 text-sm">
                    <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-1">날짜 범위</label>
                        <div className="flex gap-2 items-center">
                            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="p-2 border rounded w-full" />
                            <span>~</span>
                            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="p-2 border rounded w-full" />
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-1">제품명 검색</label>
                        <input type="text" placeholder="제품명..." value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)} className="p-2 border rounded w-full" />
                    </div>
                    <div className="flex-1">
                         <label className="block text-xs text-slate-500 mb-1">정렬</label>
                         <div className="flex gap-2">
                            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="p-2 border rounded w-full bg-white">
                                <option value="date-desc">최신순</option>
                                <option value="date-asc">오래된순</option>
                                <option value="area">면적순</option>
                                <option value="product">제품명순</option>
                            </select>
                            <button onClick={handleResetFilters} className="px-3 py-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">초기화</button>
                         </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {sortedAndFilteredLog.length > 0 ? (
                    sortedAndFilteredLog.map((entry) => (
                    <div key={entry.id} className="bg-white p-5 rounded-lg shadow-md border-l-4 border-indigo-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-lg transition-shadow">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-500">{entry.date}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                    entry.usage === '그린' ? 'bg-green-100 text-green-800' :
                                    entry.usage === '티' ? 'bg-blue-100 text-blue-800' :
                                    'bg-orange-100 text-orange-800'
                                }`}>{entry.usage}</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">{entry.product}</h3>
                            <div className="text-sm text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                <span>면적: <span className="font-semibold">{entry.area}㎡</span></span>
                                <span>사용량: <span className="font-semibold">{entry.applicationRate}{entry.applicationUnit}</span></span>
                                <span>총 비용: <span className="font-semibold text-indigo-600">{Math.round(entry.totalCost).toLocaleString()}원</span></span>
                                {entry.topdressing && (
                                    <span className="text-amber-700 bg-amber-50 px-1 rounded">배토: <strong>{entry.topdressing}mm</strong></span>
                                )}
                            </div>
                        </div>
                        
                        {/* Mini Nutrient Badge */}
                        <div className="flex gap-2 text-xs font-mono bg-slate-50 p-2 rounded border">
                            {NUTRIENTS.slice(0, 3).map(n => (
                                <div key={n} className="text-center px-1">
                                    <span className="block text-slate-400 text-[10px]">{n}</span>
                                    <span className={`font-bold ${n==='N'?'text-green-600':n==='P'?'text-blue-600':'text-orange-600'}`}>
                                        {entry.nutrients[n]?.toFixed(1)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={() => removeLogEntry(entry.id)} 
                            className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                            title="삭제"
                        >
                            <TrashIcon />
                        </button>
                    </div>
                ))
                ) : (
                    <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-dashed">
                        <ClipboardListIcon className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-500">기록된 시비 일지가 없습니다.</p>
                    </div>
                )}
            </div>
        </section>

        {/* Floating Chat Button */}
        <button
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-110 z-50"
            aria-label="Open Chatbot"
        >
            <ChatIcon />
        </button>
        
        {/* Chatbot Modal */}
        <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>
      
      {/* Fertilizer Detail Modal */}
      {detailModalFertilizer && (
        <FertilizerDetailModal 
            fertilizer={detailModalFertilizer} 
            onClose={() => setDetailModalFertilizer(null)} 
        />
      )}
      
    </div>
  );
}