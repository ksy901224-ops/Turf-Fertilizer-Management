
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
  const [calculatorTab, setCalculatorTab] = useState<'standard' | 'reverse'>('standard');
  
  // Standard Calc
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

  // Reverse Calc
  const [reverseCalcProduct, setReverseCalcProduct] = useState<Fertilizer | null>(null);
  const [reverseTargetNutrient, setReverseTargetNutrient] = useState<'N' | 'P' | 'K'>('N');
  const [reverseTargetAmount, setReverseTargetAmount] = useState(''); // g/m2
  const [reverseCalcResult, setReverseCalcResult] = useState<{ rate: number, unit: string } | null>(null);

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

  // Reverse Calc Logic
  useEffect(() => {
      if (reverseCalcProduct && reverseTargetAmount) {
          const amount = parseFloat(reverseTargetAmount);
          const pct = (reverseCalcProduct as any)[reverseTargetNutrient] || 0;
          if (amount > 0 && pct > 0) {
              // Rate (g or ml) = Target (g) / (Pct / 100)
              // If liquid, assumes density ~ 1 unless specifically handled, or rate is just ml/m2
              const calculatedRate = amount / (pct / 100);
              const unit = reverseCalcProduct.type === '액상' ? 'ml/㎡' : 'g/㎡';
              setReverseCalcResult({ rate: calculatedRate, unit });
          } else {
              setReverseCalcResult(null);
          }
      } else {
          setReverseCalcResult(null);
      }
  }, [reverseCalcProduct, reverseTargetNutrient, reverseTargetAmount]);

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
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
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

  const handleNutrientToggle = (nutrient: 'N' |