import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { Fertilizer, LogEntry, NewFertilizerForm, NutrientLog, User } from './types';
import { NUTRIENTS, FERTILIZER_GUIDE, USAGE_CATEGORIES, TYPE_CATEGORIES, MONTHLY_DISTRIBUTION, FERTILIZER_TYPE_GROUPS } from './constants';
import * as api from './api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ComposedChart } from 'recharts';
import { Chatbot } from './Chatbot';
import { ChatIcon, LogoutIcon, CalculatorIcon, TrashIcon, CalendarIcon, ClipboardListIcon, CloseIcon, PencilIcon, PlusIcon, SparklesIcon, ChevronDownIcon, ChevronUpIcon, CameraIcon, DocumentSearchIcon, UploadIcon, DownloadIcon } from './icons';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { parseRateValue, getApplicationDetails } from './utils';
import { FertilizerDetailModal } from './FertilizerDetailModal';
import { LoadingSpinner } from './LoadingSpinner';

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
  const [showLastYearComparison, setShowLastYearComparison] = useState(false); // Toggle for chart comparison

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logSectionRef = useRef<HTMLElement>(null);
  const planFileInputRef = useRef<HTMLInputElement>(null);

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
  const [topdressing, setTopdressing] = useState(''); // New Topdressing state
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logFilterType, setLogFilterType] = useState<string>('전체');
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
  
  // Reverse Calculator State
  const [isReverseCalcOpen, setIsReverseCalcOpen] = useState(false);
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
        setTopdressing('');
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
        setTopdressing('');
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

    setLog(prev => [entry, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    
    alert(`완료: ${usage} 구역에 시비 기록이 추가되었습니다.`);
    setIsProductSelectOpen(false); // Close product select if open
    setLogSearchTerm('');
    setLogFilterType('전체');
    setTopdressing(''); // Reset topdressing field
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

  const filteredLogForAnalysis = useMemo(() => {
    if (analysisCategory === 'all') return log;
    return log.filter(entry => entry.usage === analysisCategory);
  }, [log, analysisCategory]);

  // Calculate Last Year's Actuals for Chart Comparison
  const lastYearActualNutrients = useMemo(() => {
      const lastYear = new Date().getFullYear() - 1;
      const data: { [monthIdx: number]: { N: number, P: number, K: number } } = {};
      for(let i=0; i<12; i++) data[i] = { N: 0, P: 0, K: 0 };

      // Filter logs for last year and current active area
      log.forEach(entry => {
          const entryDate = new Date(entry.date);
          if (entryDate.getFullYear() === lastYear && entry.usage === activePlanTab) {
              const month = entryDate.getMonth();
              const product = fertilizers.find(f => f.name === entry.product);
              if (product) {
                  // Re-calculate nutrients per m2 based on recorded rate
                  const n = getApplicationDetails(product, 1, entry.applicationRate).nutrients;
                  data[month].N += n.N || 0;
                  data[month].P += n.P || 0;
                  data[month].K += n.K || 0;
              }
          }
      });
      return data;
  }, [log, activePlanTab, fertilizers]);

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
                const product = fertilizers