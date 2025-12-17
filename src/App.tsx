
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { Fertilizer, LogEntry, NutrientLog, User } from './types';
import { NUTRIENTS, FERTILIZER_GUIDE, USAGE_CATEGORIES, MONTHLY_DISTRIBUTION, FERTILIZER_TYPE_GROUPS, TYPE_CATEGORIES } from './constants';
import * as api from './api';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart, Line } from 'recharts';
import { Chatbot } from './Chatbot';
import { ChatIcon, LogoutIcon, CalculatorIcon, TrashIcon, ClipboardListIcon, PencilIcon, SparklesIcon, ChevronDownIcon, ChevronUpIcon, UploadIcon, DownloadIcon } from './icons';
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
  const [showLastYearComparison, setShowLastYearComparison] = useState(false);

  const logSectionRef = useRef<HTMLElement>(null);
  const planFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedProduct, setSelectedProduct] = useState<Fertilizer | null>(null);
  const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
  
  // Fertilizer List Filter State
  const [filterUsage, setFilterUsage] = useState<string>('전체');
  const [filterType, setFilterType] = useState<string>('전체');
  const [isFertilizerListOpen, setIsFertilizerListOpen] = useState(false);
  
  // Log entry form states (Tabbed)
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

  const [analysisCategory, setAnalysisCategory] = useState<'all' | '그린' | '티' | '페어웨이'>('all');
  const [analysisFairwayType, setAnalysisFairwayType] = useState<'KBG' | 'Zoysia'>('KBG');
  
  // Cumulative View Toggle State
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
    setIsProductSelectOpen(false); 
    setLogSearchTerm('');
    setLogFilterType('전체');
    setTopdressing('');
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
        return getApplicationDetails(selectedProduct, 1, rate).nutrients; 
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

  const lastYearActualNutrients = useMemo(() => {
      const lastYear = new Date().getFullYear() - 1;
      const data: { [monthIdx: number]: { N: number, P: number, K: number } } = {};
      for(let i=0; i<12; i++) data[i] = { N: 0, P: 0, K: 0 };

      log.forEach(entry => {
          const entryDate = new Date(entry.date);
          if (entryDate.getFullYear() === lastYear && entry.usage === activePlanTab) {
              const month = entryDate.getMonth();
              const product = fertilizers.find(f => f.name === entry.product);
              if (product) {
                  const n = getApplicationDetails(product, 1, entry.applicationRate).nutrients;
                  data[month].N += n.N || 0;
                  data[month].P += n.P || 0;
                  data[month].K += n.K || 0;
              }
          }
      });
      return data;
  }, [log, activePlanTab, fertilizers]);

  const aggregatedProductQuantity = useMemo(() => {
    const data: Record<string, { totalAmount: number, unit: string, cost: number }> = {};
    let filtered = filteredLogForAnalysis;
    
    filtered.forEach(entry => {
        const product = fertilizers.find(f => f.name === entry.product);
        const isLiquid = product?.type === '액상' || entry.applicationUnit.includes('ml');
        const amount = (entry.area * entry.applicationRate) / 1000;
        
        if (!data[entry.product]) {
            data[entry.product] = { totalAmount: 0, unit: isLiquid ? 'L' : 'kg', cost: 0 };
        }
        data[entry.product].totalAmount += amount;
        data[entry.product].cost += entry.totalCost;
    });
    
    return Object.entries(data)
        .sort((a,b) => b[1].totalAmount - a[1].totalAmount)
        .slice(0, 5); 
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

    const monthlyNutrientChartData = useMemo(() => {
        const data: Record<string, { 
            month: string, 
            N: number, P: number, K: number,
            guideN: number, guideP: number, guideK: number
        }> = {};
        
        let guideKey = '';
        let usingManualTarget = false;
        
        if (manualPlanMode && analysisCategory !== 'all') {
            usingManualTarget = true;
        } else {
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

        filteredLogForAnalysis.forEach(entry => {
            const date = new Date(entry.date);
            if (date.getFullYear() === new Date().getFullYear()) {
                const monthIndex = date.getMonth();
                const monthKey = `${date.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}`;
                
                const product = fertilizers.find(f => f.name === entry.product);
                
                if (data[monthKey] && product) {
                    const nutrientsPerM2 = getApplicationDetails(product, 1, entry.applicationRate).nutrients;

                    data[monthKey].N += nutrientsPerM2.N || 0;
                    data[monthKey].P += nutrientsPerM2.P || 0;
                    data[monthKey].K += nutrientsPerM2.K || 0;
                }
            }
        });
        
        Object.values(data).forEach(item => {
            item.N = parseFloat(item.N.toFixed(2));
            item.P = parseFloat(item.P.toFixed(2));
            item.K = parseFloat(item.K.toFixed(2));
        });
        
        if (analysisCategory === 'all') {
            Object.values(data).forEach(item => {
                item.guideN = 0; item.guideP = 0; item.guideK = 0;
            });
        }
        
        return Object.values(data).sort((a, b) => a.month.localeCompare(b.month));
    }, [filteredLogForAnalysis, analysisCategory, analysisFairwayType, greenArea, teeArea, fairwayArea, manualPlanMode, manualTargets, fertilizers]);
    
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

    const manualPlanComparisonData = useMemo(() => {
        let guideKey = selectedGuide;
        if (activePlanTab === '그린') guideKey = '한지형잔디 (벤트그라스)';
        else if (activePlanTab === '티') guideKey = '한지형잔디 (켄터키블루그라스)';
        else if (activePlanTab === '페어웨이') guideKey = fairwayGuideType === 'KBG' ? '한지형잔디 (켄터키블루그라스)' : '난지형잔디 (한국잔디)';

        const guide = FERTILIZER_GUIDE[guideKey];
        const dist = MONTHLY_DISTRIBUTION[guideKey];
        
        return (manualTargets[activePlanTab] || []).map((target, i) => {
            const actualLastYear = lastYearActualNutrients[i];
            return {
                month: `${i + 1}월`,
                planN: target.N,
                planP: target.P,
                planK: target.K,
                stdN: dist ? parseFloat((guide.N * dist.N[i]).toFixed(2)) : 0,
                stdP: dist ? parseFloat((guide.P * dist.P[i]).toFixed(2)) : 0,
                stdK: dist ? parseFloat((guide.K * dist.K[i]).toFixed(2)) : 0,
                lastYearN: parseFloat(actualLastYear.N.toFixed(2)),
                lastYearP: parseFloat(actualLastYear.P.toFixed(2)),
                lastYearK: parseFloat(actualLastYear.K.toFixed(2)),
            };
        });
    }, [manualTargets, activePlanTab, selectedGuide, fairwayGuideType, lastYearActualNutrients]);


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
            '배토(mm)': entry.topdressing || 0,
            '총 비용(원)': Math.round(entry.totalCost),
        };
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

  const handleReverseCalculation = () => {
      if (!selectedProduct) {
          alert('비료 제품을 먼저 선택해주세요.');
          return;
      }
      
      const target = parseFloat(targetNutrientAmount);
      if (isNaN(target) || target <= 0) {
          alert('올바른 목표 성분량을 입력해주세요.');
          return;
      }

      const nutrientContent = (selectedProduct as any)[targetNutrientType] || 0;
      if (nutrientContent <= 0) {
          alert(`선택한 제품에는 ${targetNutrientType} 성분이 없습니다.`);
          return;
      }

      const calculatedRate = target / (nutrientContent / 100);
      setApplicationRate(calculatedRate.toFixed(2));
      alert(`목표 ${targetNutrientType} ${target}g/㎡ 달성을 위해\n약 ${calculatedRate.toFixed(1)} ${selectedProduct.type === '액상' ? 'ml' : 'g'}/㎡ 살포가 필요합니다.`);
      setIsReverseCalcOpen(false);
  };
  
  const manualPlanTotal = useMemo(() => {
      const currentTargets = manualTargets[activePlanTab] || [];
      return currentTargets.reduce((acc, curr) => ({
          N: acc.N + curr.N,
          P: acc.P + curr.P,
          K: acc.K + curr.K
      }), { N: 0, P: 0, K: 0 });
  }, [manualTargets, activePlanTab]);
  
  const standardGuideTotal = useMemo(() => {
      let guideKey = '';
      if (activePlanTab === '그린') guideKey = '한지형잔디 (벤트그라스)';
      else if (activePlanTab === '티') guideKey = '한지형잔디 (켄터키블루그라스)';
      else if (activePlanTab === '페어웨이') guideKey = fairwayGuideType === 'KBG' ? '한지형잔디 (켄터키블루그라스)' : '난지형잔디 (한국잔디)';
      
      const guide = FERTILIZER_GUIDE[guideKey];
      return guide || { N: 0, P: 0, K: 0 };
  }, [activePlanTab, fairwayGuideType]);

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
          - 현재 누적 시비량과 연간 목표를 비교 분석.
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

      let text = response.text || '';
      
      let jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (!jsonMatch) {
          jsonMatch = text.match(/(\{[\s\S]*"productName"[\s\S]*\})/);
      }

      if (jsonMatch) {
          try {
              const actionData = JSON.parse(jsonMatch[1]);
              if(actionData.productName && actionData.targetArea && actionData.rate) {
                  setAiAction(actionData);
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
            if (aiAction.targetArea === '그린') setActiveLogTab('그린');
            else if (aiAction.targetArea === '티') setActiveLogTab('티');
            else if (aiAction.targetArea === '페어웨이') setActiveLogTab('페어웨이');
            
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
    const totalAmount = (areaNum * rateNum) / 1000;

    setCalculatorResults({
      totalAmount,
      totalCost,
      nutrients,
      nutrientsPerM2,
      unit: isLiquid ? 'L' : 'kg',
    });
  };

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
    return html;
  }, [aiResponse]);
  
  const CustomChartTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
          const n = payload.find((p:any) => p.dataKey === 'planN')?.value || 0;
          const lastN = payload.find((p:any) => p.dataKey === 'lastYearN')?.value || 0;

          return (
              <div className="bg-white p-3 border shadow-lg rounded text-xs">
                  <p className="font-bold mb-2 text-slate-700">{label}</p>
                  <div className="space-y-1">
                      <p className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          <span className="text-slate-600">계획 질소(N):</span>
                          <span className="font-bold text-green-700">{n.toFixed(2)} g/㎡</span>
                      </p>
                      {lastN > 0 && (
                          <p className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                              <span className="text-slate-500">작년 질소(N):</span>
                              <span className="font-bold text-slate-600">{lastN.toFixed(2)} g/㎡</span>
                          </p>
                      )}
                  </div>
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
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800">AI Turf Management</h1>
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
                        <>
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6">
                                <div className="flex justify-between items-start mb-3">
                                    <p className="text-sm text-amber-800 font-medium">관리 중인 잔디 종류를 선택하여 연간 표준 시비량을 확인하세요.</p>
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
                        </>
                    ) : (
                        <div className="animate-fadeIn">
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                                <p className="text-sm text-blue-800 mb-3 font-medium">나만의 월별 목표 시비량을 구역별로 설정하여 연간 계획을 수립하세요.</p>
                                <div className="flex border-b border-blue-300 mb-3 items-end">
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
                                    <div className="ml-auto flex gap-2 pb-1">
                                        <label className="flex items-center gap-1 bg-white px-2 py-1 rounded text-xs border cursor-pointer hover:bg-slate-50">
                                            <UploadIcon className="w-3 h-3 text-slate-500" />
                                            <span className="text-slate-600 font-semibold">엑셀 계획 불러오기</span>
                                            <input 
                                                type="file" 
                                                ref={planFileInputRef}
                                                onChange={handleImportPlan} 
                                                accept=".xlsx, .xls" 
                                                className="hidden" 
                                            />
                                        </label>
                                    </div>
                                </div>

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
                                            {(manualTargets[activePlanTab] || []).map((target, i) => (
                                                <tr key={i} className="border-b">
                                                    <td className="p-2 font-medium bg-slate-50">{i + 1}월</td>
                                                    <td className="p-1 border"><input type="number" step="0.1" min="0" value={target.N || ''} onChange={(e) => handleManualTargetChange(i, 'N', e.target.value)} className="w-full text-center p-1 rounded" /></td>
                                                    <td className="p-1 border"><input type="number" step="0.1" min="0" value={target.P || ''} onChange={(e) => handleManualTargetChange(i, 'P', e.target.value)} className="w-full text-center p-1 rounded" /></td>
                                                    <td className="p-1 border"><input type="number" step="0.1" min="0" value={target.K || ''} onChange={(e) => handleManualTargetChange(i, 'K', e.target.value)} className="w-full text-center p-1 rounded" /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <div className="mt-6 bg-white p-4 rounded-lg border shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-bold text-slate-700">📊 계획 vs 표준 가이드 비교</h3>
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                        <input type="checkbox" checked={showLastYearComparison} onChange={(e) => setShowLastYearComparison(e.target.checked)} />
                                        작년 실적 비교
                                    </label>
                                </div>
                                <div className="h-64">
                                     <ResponsiveContainer width="100%" height="100%">
                                         <ComposedChart data={manualPlanComparisonData}>
                                             <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                             <XAxis dataKey="month" fontSize={12} />
                                             <YAxis fontSize={12} />
                                             <Tooltip content={<CustomChartTooltip />} />
                                             <Legend />
                                             <Bar dataKey="planN" name="질소(계획)" fill="#16a34a" barSize={8} />
                                             {showLastYearComparison && <Line type="step" dataKey="lastYearN" name="질소(작년)" stroke="#94a3b8" dot={false} />}
                                             <Line type="monotone" dataKey="stdN" name="질소(표준)" stroke="#15803d" strokeDasharray="3 3" dot={false} />
                                         </ComposedChart>
                                     </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </details>
        </section>

        <section ref={logSectionRef} className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <PencilIcon /> 시비 기록 작성
            </h2>
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="relative">
                        <label className="block text-sm font-medium text-slate-700 mb-1">비료 제품 선택</label>
                        <div 
                            className="w-full p-2 border border-slate-300 rounded-md cursor-pointer flex justify-between items-center bg-white"
                            onClick={() => setIsProductSelectOpen(!isProductSelectOpen)}
                        >
                            <span className={selectedProduct ? 'text-slate-800' : 'text-slate-400'}>
                                {selectedProduct ? `${selectedProduct.name}` : '비료를 선택하세요'}
                            </span>
                            <ChevronDownIcon className="text-slate-400 w-4 h-4" />
                        </div>
                        {isProductSelectOpen && (
                            <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 flex flex-col">
                                <div className="p-2 border-b bg-slate-50 sticky top-0 z-10 space-y-2">
                                    <input 
                                        type="text" 
                                        placeholder="비료명 검색..." 
                                        value={logSearchTerm}
                                        onChange={(e) => setLogSearchTerm(e.target.value)}
                                        className="w-full p-2 text-sm border rounded"
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
                                                        }}
                                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center"
                                                    >
                                                        <span className="font-medium text-slate-700">{f.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">날짜</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">사용량</label>
                            <input type="number" value={applicationRate} onChange={(e) => setApplicationRate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md" />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex gap-2 mb-4">
                        {(['그린', '티', '페어웨이'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveLogTab(tab)}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg border ${activeLogTab === tab ? 'bg-green-600 text-white' : 'bg-white text-slate-500'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    {activeLogTab === '그린' && <input type="number" value={logGreenArea} onChange={(e) => setLogGreenArea(e.target.value)} className="w-full p-3 border rounded-md" placeholder="그린 면적" />}
                    {activeLogTab === '티' && <input type="number" value={logTeeArea} onChange={(e) => setLogTeeArea(e.target.value)} className="w-full p-3 border rounded-md" placeholder="티 면적" />}
                    {activeLogTab === '페어웨이' && <input type="number" value={logFairwayArea} onChange={(e) => setLogFairwayArea(e.target.value)} className="w-full p-3 border rounded-md" placeholder="페어웨이 면적" />}
                </div>
                
                <button onClick={handleAddLog} className="w-full py-3 bg-green-600 text-white font-bold rounded-md shadow-sm hover:bg-green-700">일지 추가하기</button>
            </div>
        </section>

        <section className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-slate-700 mb-4">📊 비료 투입 현황 및 분석</h2>
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-700 text-lg">{isCumulative ? '📈 누적 투입 현황' : '📊 월별 투입 현황'}</h3>
                <div className="flex bg-slate-100 rounded-lg p-1">
                    <button onClick={() => setIsCumulative(false)} className={`px-3 py-1.5 text-xs font-bold rounded-md ${!isCumulative ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>월별</button>
                    <button onClick={() => setIsCumulative(true)} className={`px-3 py-1.5 text-xs font-bold rounded-md ${isCumulative ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>누적</button>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={finalAnalysisData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" fontSize={12} tickFormatter={(val) => `${parseInt(val.split('-')[1])}월`} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="N" name="질소(N)" fill="#22c55e" barSize={15} />
                            <Bar dataKey="P" name="인산(P)" fill="#3b82f6" barSize={15} />
                            <Bar dataKey="K" name="칼륨(K)" fill="#f97316" barSize={15} />
                            {analysisCategory !== 'all' && <Line type="monotone" dataKey="guideN" stroke="#15803d" strokeDasharray="5 5" />}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </section>
        
        <section className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center text-center space-y-4">
            <h2 className="text-xl font-bold text-slate-800">🤖 AI 전문가 분석 및 추천</h2>
            <button 
                onClick={handleGetRecommendation} 
                disabled={isLoadingAI}
                className="w-full bg-purple-600 text-white font-semibold p-3 rounded-md hover:bg-purple-700 flex items-center justify-center gap-2"
            >
                {isLoadingAI ? '분석 중...' : <><SparklesIcon /> AI 추천 받기</>}
            </button>
            {aiResponse && (
                <div className="w-full text-left mt-6 animate-fadeIn">
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 shadow-sm">
                        <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: formattedAiResponse }} />
                        {aiAction && (
                            <div className="bg-white border-l-4 border-purple-600 p-4 rounded-r-lg shadow-sm mt-4 flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{aiAction.productName} ({aiAction.targetArea})</p>
                                    <p className="text-xs text-slate-500">추천량: {aiAction.rate}g/㎡</p>
                                </div>
                                <button onClick={handleApplyAiAction} className="bg-purple-600 text-white px-3 py-1 rounded text-sm">적용</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>

        <section className="space-y-4">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                    <ClipboardListIcon /> 시비 일지 기록 ({sortedAndFilteredLog.length})
                </h2>
                <button onClick={handleExportToExcel} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-md">
                    <DownloadIcon /> 엑셀 다운로드
                </button>
            </div>

            <div className="space-y-4">
                {sortedAndFilteredLog.length > 0 ? (
                    sortedAndFilteredLog.map((entry) => (
                    <div key={entry.id} className="bg-white p-5 rounded-lg shadow-md border-l-4 border-indigo-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-500">{entry.date}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-800">{entry.usage}</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">{entry.product}</h3>
                            <div className="text-sm text-slate-600 mt-1">
                                {entry.area}㎡ / {entry.applicationRate}{entry.applicationUnit} / {Math.round(entry.totalCost).toLocaleString()}원
                            </div>
                        </div>
                        <button onClick={() => removeLogEntry(entry.id)} className="text-slate-400 hover:text-red-500"><TrashIcon /></button>
                    </div>
                ))
                ) : (
                    <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-dashed text-slate-500">
                        기록된 시비 일지가 없습니다.
                    </div>
                )}
            </div>
        </section>

        <button
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg z-50"
        >
            <ChatIcon />
        </button>
        
        <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>
      
      {detailModalFertilizer && (
        <FertilizerDetailModal 
            fertilizer={detailModalFertilizer} 
            onClose={() => setDetailModalFertilizer(null)} 
        />
      )}
    </div>
  );
}
