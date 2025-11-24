
import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import * as api from './api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LogoutIcon, DashboardIcon, UsersIcon, ClipboardListIcon, CurrencyWonIcon, SparklesIcon, CalendarIcon, PencilIcon, TrashIcon, PlusIcon, BellIcon, CameraIcon, DocumentSearchIcon, UploadIcon, DownloadIcon } from './icons';
import { Fertilizer, NotificationSettings, UserDataSummary } from './types';
import { NUTRIENTS, USAGE_CATEGORIES, TYPE_CATEGORIES } from './constants';
import { GoogleGenAI } from '@google/genai';

const ImageIcon = ({ className = "h-10 w-10" }: { className?: string; }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);

const HelpTooltip = ({ text }: { text: string }) => (
    <div className="group relative flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[250px] p-2 bg-slate-700 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
            {text}
        </div>
    </div>
);

const LoadingSpinner = () => (
    <div className="flex justify-center items-center min-h-screen bg-slate-100">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-500"></div>
    </div>
);


const StatCard = ({ title, value, icon, colorClasses }: { title: string, value: string | number, icon: React.ReactNode, colorClasses: { border: string; bg: string; text: string; } }) => (
    <div className={`bg-white p-6 rounded-2xl shadow-lg flex items-center space-x-4 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 border-l-4 ${colorClasses.border}`}>
        <div className={`p-4 rounded-full ${colorClasses.bg} ${colorClasses.text}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
    </div>
);

// Helper function to find the greatest common divisor
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const calculateNpkRatio = (n: number, p: number, k: number): string => {
    if (isNaN(n) || isNaN(p) || isNaN(k) || (n === 0 && p === 0 && k === 0)) {
        return '';
    }
    const commonDivisor = gcd(n, gcd(p, k));
    if (commonDivisor === 0) return [n, p, k].join('-');
    return `${n / commonDivisor}-${p / commonDivisor}-${k / commonDivisor}`;
};

type SummaryData = { totalCost: number; totalAmount: number; isLiquid: boolean };

export const AdminDashboard = ({ user, onLogout }: { user: string, onLogout: () => void }) => {
    const [allUserData, setAllUserData] = useState<UserDataSummary[]>([]);
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

    // User Data State
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    
    // Fertilizer Management State
    const [isFertilizerModalOpen, setIsFertilizerModalOpen] = useState(false);
    const [editingFertilizer, setEditingFertilizer] = useState<Fertilizer | null>(null);
    const [fertilizerForm, setFertilizerForm] = useState<Partial<Fertilizer>>({});
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [filters, setFilters] = useState({ name: '', usage: '', type: '', minN: '', minP: '', minK: '' });
    const [sortConfig, setSortConfig] = useState<{ key: keyof Fertilizer, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    const [selectedFertilizers, setSelectedFertilizers] = useState<Set<string>>(new Set());
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [bulkEditConfig, setBulkEditConfig] = useState<{
        target: 'price' | 'stock' | 'lowStockAlertEnabled';
        operation: string;
        value: string;
    }>({ target: 'price', operation: 'set', value: '' });

    // AI Auto-Fill State
    const [isAiFillLoading, setIsAiFillLoading] = useState(false);
    const [aiTextInput, setAiTextInput] = useState('');

    // Chart State
    const [costChartStartDate, setCostChartStartDate] = useState('');
    const [costChartEndDate, setCostChartEndDate] = useState('');

    // Rate Calculator State
    const [rateCalcTargetNutrient, setRateCalcTargetNutrient] = useState<'N' | 'P' | 'K'>('N');
    const [rateCalcTargetAmount, setRateCalcTargetAmount] = useState<string>('2');
    
    // Notification State
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({ enabled: false, email: '', threshold: 10 });
    const [triggeredAlerts, setTriggeredAlerts] = useState<Set<string>>(new Set());


    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [userData, fertilizerData, notifications] = await Promise.all([
                    api.getAllUsersData(),
                    api.getFertilizers('admin'),
                    api.getNotificationSettings('admin')
                ]);
                setAllUserData(userData);
                setMasterFertilizers(fertilizerData);
                setNotificationSettings(notifications);
            } catch (err) {
                console.error("Failed to load dashboard data", err);
                setError("데이터를 불러오는 데 실패했습니다.");
            } finally {
                setIsLoading(false);
                setIsInitialLoadComplete(true);
            }
        };
        fetchData();
    }, []);
    
    useEffect(() => {
      if(isInitialLoadComplete) {
        api.saveFertilizers('admin', masterFertilizers);
      }
    }, [masterFertilizers, isInitialLoadComplete])

    useEffect(() => {
      if(isInitialLoadComplete) {
        api.saveNotificationSettings('admin', notificationSettings);
      }
    }, [notificationSettings, isInitialLoadComplete]);
    
    // Effect for checking low stock and triggering simulated alerts
    useEffect(() => {
        if (!isInitialLoadComplete || !notificationSettings.enabled || !notificationSettings.email) {
            return;
        }

        const alertsToTrigger: string[] = [];
        const alertsToReset = new Set(triggeredAlerts);

        masterFertilizers.forEach(fert => {
            const stock = fert.stock ?? 0;
            const isLow = stock < notificationSettings.threshold;
            
            if (fert.lowStockAlertEnabled && isLow) {
                if (!triggeredAlerts.has(fert.name)) {
                    alertsToTrigger.push(
                        `재고 부족 알림: ${fert.name}의 재고(${stock.toFixed(2)}${fert.type === '액상' ? 'L' : 'kg'})가 ` +
                        `설정된 임계값(${notificationSettings.threshold}${fert.type === '액상' ? 'L' : 'kg'})보다 낮습니다. ` +
                        `관리자 이메일(${notificationSettings.email})로 알림을 보냈습니다. (시뮬레이션)`
                    );
                }
            } else if (fert.lowStockAlertEnabled && !isLow) {
                alertsToReset.delete(fert.name);
            }
        });

        if (alertsToTrigger.length > 0) {
            alert(alertsToTrigger.join('\n\n'));
            setTriggeredAlerts(prev => {
                const newSet = new Set(prev);
                alertsToTrigger.forEach(alertMsg => {
                    const nameMatch = alertMsg.match(/:\s(.*?)\s*의/);
                    if (nameMatch && nameMatch[1]) {
                        newSet.add(nameMatch[1]);
                    }
                });
                return newSet;
            });
        }
        
        if (alertsToReset.size !== triggeredAlerts.size) {
            setTriggeredAlerts(alertsToReset);
        }
    }, [masterFertilizers, notificationSettings, isInitialLoadComplete, triggeredAlerts]);

    const summaryStats = useMemo(() => {
        if (allUserData.length === 0) return { totalUsers: 0, totalLogs: 0, totalCost: 0, mostUsedFertilizer: 'N/A' };
        const totalLogs = allUserData.reduce((sum, u) => sum + u.logCount, 0);
        const totalCost = allUserData.reduce((sum, u) => sum + u.totalCost, 0);
        const fertilizerCounts = allUserData.flatMap(u => u.logs).reduce((acc: Record<string, number>, log) => {
                acc[log.product] = (acc[log.product] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
        const mostUsedFertilizer = Object.entries(fertilizerCounts).sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0] || 'N/A';
        return { totalUsers: allUserData.length, totalLogs, totalCost, mostUsedFertilizer };
    }, [allUserData]);
    
    const userCostChartData = useMemo(() => {
        const mappedData: { name: string; '총 비용': number; }[] = allUserData.map(u => ({ name: u.username, '총 비용': Math.round(u.totalCost) }));
        return mappedData.sort((a, b) => b['총 비용'] - a['총 비용']);
    }, [allUserData]);

    const allUsernames = useMemo(() => {
      return allUserData.map(u => u.username).sort();
    }, [allUserData]);

    // Filtered logs used for both monthly charts
    const filteredLogsForCharts = useMemo(() => {
        const allLogs = allUserData.flatMap(u => u.logs.map(log => ({ ...log, username: u.username })));
        return allLogs.filter(log => {
            const logDate = new Date(log.date);
            if (costChartStartDate) {
                const startDate = new Date(costChartStartDate);
                startDate.setHours(0, 0, 0, 0);
                if (logDate < startDate) return false;
            }
            if (costChartEndDate) {
                const endDate = new Date(costChartEndDate);
                endDate.setHours(23, 59, 59, 999);
                if (logDate > endDate) return false;
            }
            return true;
        });
    }, [allUserData, costChartStartDate, costChartEndDate]);

    const monthlyUserCostChartData = useMemo(() => {
      const monthlyData = filteredLogsForCharts.reduce((acc, log) => {
          const month = log.date.substring(0, 7); // Format: YYYY-MM
          if (!acc[month]) {
              acc[month] = { month, costs: {} };
          }
          acc[month].costs[log.username] = (acc[month].costs[log.username] || 0) + log.totalCost;
          return acc;
      }, {} as Record<string, { month: string; costs: Record<string, number> }>);

      return Object.values(monthlyData).map((data: { month: string; costs: Record<string, number> }) => ({month: data.month, ...data.costs})).sort((a, b) => a.month.localeCompare(b.month));
    }, [filteredLogsForCharts]);

    // New: Monthly Cost by Fertilizer Type Chart Data
    const monthlyTypeCostChartData = useMemo(() => {
        const monthlyData: Record<string, Record<string, number>> = {};

        filteredLogsForCharts.forEach(log => {
            const month = log.date.substring(0, 7);
            const product = masterFertilizers.find(f => f.name === log.product);
            const type = product?.type || '기타';

            if (!monthlyData[month]) monthlyData[month] = {};
            monthlyData[month][type] = (monthlyData[month][type] || 0) + log.totalCost;
        });

        return Object.entries(monthlyData)
            .map(([month, types]) => ({ month, ...types }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }, [filteredLogsForCharts, masterFertilizers]);


    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleResetFilters = () => {
        setFilters({ name: '', usage: '', type: '', minN: '', minP: '', minK: '' });
    };

    const requestSort = (key: keyof Fertilizer) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const displayedFertilizers = useMemo(() => {
        return [...masterFertilizers]
            .filter(f => {
                const nameMatch = f.name.toLowerCase().includes(filters.name.toLowerCase());
                const usageMatch = filters.usage ? f.usage === filters.usage : true;
                const typeMatch = filters.type ? f.type === filters.type : true;
                
                const minN = parseFloat(filters.minN) || 0;
                const minP = parseFloat(filters.minP) || 0;
                const minK = parseFloat(filters.minK) || 0;
                
                const nMatch = f.N >= minN;
                const pMatch = f.P >= minP;
                const kMatch = f.K >= minK;

                return nameMatch && usageMatch && typeMatch && nMatch && pMatch && kMatch;
            })
            .sort((a, b) => {
                const key = sortConfig.key;
                const aVal = a[key];
                const bVal = b[key];

                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return 1;
                if (bVal == null) return -1;

                let comparison = 0;
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    comparison = aVal - bVal;
                } else {
                    comparison = String(aVal).localeCompare(String(bVal));
                }
                
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
    }, [masterFertilizers, filters, sortConfig]);
    
    const handleFertilizerFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFertilizerForm(prev => ({ ...prev, [name as keyof Fertilizer]: value }));
        if (formErrors[name]) {
            setFormErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };
    
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                setFormErrors(prev => ({ ...prev, imageUrl: "이미지 파일은 2MB를 초과할 수 없습니다." }));
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setFertilizerForm(prev => ({ ...prev, imageUrl: reader.result as string }));
                if (formErrors.imageUrl) {
                    setFormErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.imageUrl;
                        return newErrors;
                    });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const processAiRequest = async (parts: any[]) => {
        setIsAiFillLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts }
            });
            
            const text = response.text;
            if(!text) throw new Error("No response from AI");
            
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if(jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                setFertilizerForm(prev => ({ ...prev, ...data }));
                alert("AI가 정보를 자동으로 입력했습니다. 내용을 확인해주세요.");
            } else {
                throw new Error("Invalid JSON response");
            }

        } catch (err) {
            console.error(err);
            alert("AI 분석 실패: 내용을 확인하거나 다시 시도해주세요.");
        } finally {
            setIsAiFillLoading(false);
            setAiTextInput('');
        }
    };
    
    // AI Smart Fill (Supports Image, Excel, PDF, Text)
    const handleAiSmartFillFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        let parts: any[] = [];
        const prompt = `
            Analyze the provided input (product image, excel, pdf, or text) and extract fertilizer specifications.
            Return a JSON object with these fields (use 0 for missing numbers, empty string for missing strings):
            {
                "name": "Product Name",
                "usage": "One of ['그린', '티', '페어웨이']",
                "type": "One of ['완효성', '액상', '4종복합비료', '수용성', '기능성제제', '유기농']",
                "unit": "Packaging (e.g., '20kg', '10L')",
                "rate": "Rate (e.g., '20g/㎡', '1.5ml/㎡')",
                "price": Number (price per unit, 0 if unknown),
                "N": Number (%), "P": Number (%), "K": Number (%),
                "Ca": Number, "Mg": Number, "S": Number, "Fe": Number, "Mn": Number, "Zn": Number, "Cu": Number, "B": Number, "Mo": Number,
                "stock": Number (current stock count),
                "density": Number (default 1),
                "concentration": Number (liquid conc %)
            }
            Identify usage and type from context if not explicit.
        `;

        try {
            if (file.name.match(/\.(xlsx|xls)$/i)) {
                 const data = await file.arrayBuffer();
                 const workbook = XLSX.read(data);
                 const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                 const jsonData = XLSX.utils.sheet_to_json(worksheet);
                 parts = [{ text: prompt + `\n\nData:\n${JSON.stringify(jsonData)}` }];
            } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                 const base64Data = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                const base64Content = base64Data.split(',')[1];
                parts = [
                    { inlineData: { data: base64Content, mimeType: file.type } },
                    { text: prompt }
                ];
                // Only set image preview if it's an image
                if (file.type.startsWith('image/')) {
                    setFertilizerForm(prev => ({ ...prev, imageUrl: base64Data as string }));
                }
            } else if (file.type.startsWith('text/') || file.name.endsWith('.csv')) {
                 const textContent = await file.text();
                 parts = [{ text: prompt + `\n\nData:\n${textContent}` }];
            } else {
                 try {
                     const textContent = await file.text();
                     parts = [{ text: prompt + `\n\nData:\n${textContent}` }];
                 } catch {
                    throw new Error("Unsupported file type");
                 }
            }
            await processAiRequest(parts);
        } catch(e) {
            console.error(e);
            alert("파일 처리 중 오류가 발생했습니다.");
        } finally {
            e.target.value = '';
        }
    };

    const handleAiSmartFillText = async () => {
        if (!aiTextInput.trim()) return;
        const prompt = `
            Analyze the provided text input and extract fertilizer specifications.
            Return a JSON object with these fields (use 0 for missing numbers, empty string for missing strings):
            {
                "name": "Product Name",
                "usage": "One of ['그린', '티', '페어웨이']",
                "type": "One of ['완효성', '액상', '4종복합비료', '수용성', '기능성제제', '유기농']",
                "unit": "Packaging (e.g., '20kg', '10L')",
                "rate": "Rate (e.g., '20g/㎡', '1.5ml/㎡')",
                "price": Number (price per unit, 0 if unknown),
                "N": Number (%), "P": Number (%), "K": Number (%),
                "Ca": Number, "Mg": Number, "S": Number, "Fe": Number, "Mn": Number, "Zn": Number, "Cu": Number, "B": Number, "Mo": Number,
                "stock": Number (current stock count),
                "density": Number (default 1),
                "concentration": Number (liquid conc %)
            }
        `;
        const parts = [{ text: prompt + `\n\nInput Text:\n${aiTextInput}` }];
        await processAiRequest(parts);
    };

    const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

            if (jsonData.length === 0) {
                alert("엑셀 파일에 데이터가 없습니다.");
                return;
            }

            // Validate required columns (using first row to check headers)
            const firstRow = jsonData[0];
            const requiredColsKorean = ['제품명', '구분', '종류', '단위', '권장사용량'];
            // Also support English headers for flexibility
            const requiredColsEnglish = ['Name', 'Usage', 'Type', 'Unit', 'Rate'];
            
            const hasKoreanCols = requiredColsKorean.every(col => col in firstRow || Object.keys(firstRow).some(k => k.trim() === col));
            const hasEnglishCols = requiredColsEnglish.every(col => col in firstRow || Object.keys(firstRow).some(k => k.toLowerCase() === col.toLowerCase()));

            if (!hasKoreanCols && !hasEnglishCols) {
                alert(`필수 컬럼이 누락되었습니다.\n필요한 컬럼(한글): ${requiredColsKorean.join(', ')}\n또는 (영문): ${requiredColsEnglish.join(', ')}`);
                return;
            }

            const newFertilizers: Fertilizer[] = jsonData.map((row: any) => ({
                name: row['제품명'] || row['Name'] || `비료-${Math.random().toString(36).substr(2, 5)}`,
                usage: row['구분'] || row['Usage'] || '그린',
                type: row['종류'] || row['Type'] || '완효성',
                N: Number(row['N'] || 0),
                P: Number(row['P'] || 0),
                K: Number(row['K'] || 0),
                price: Number(row['가격'] || row['Price'] || 0),
                unit: row['단위'] || row['Unit'] || '20kg',
                rate: row['권장사용량'] || row['Rate'] || '20g/㎡',
                stock: Number(row['재고'] || row['Stock'] || 0),
                Ca: 0, Mg: 0, S: 0, Fe: 0, Mn: 0, Zn: 0, Cu: 0, B: 0, Mo: 0, Cl: 0, Na: 0, Si: 0, Ni: 0, Co: 0, V: 0,
                density: 1, concentration: 0, lowStockAlertEnabled: false
            }));

            if (newFertilizers.length === 0) {
                alert("엑셀 파일에서 유효한 데이터를 찾을 수 없습니다.");
                return;
            }

            setMasterFertilizers(prev => {
                 const existingNames = new Set(prev.map(f => f.name));
                 const uniqueNew = newFertilizers.filter(f => !existingNames.has(f.name));
                 if (uniqueNew.length < newFertilizers.length) {
                     alert(`${newFertilizers.length - uniqueNew.length}개의 중복된 제품은 건너뛰었습니다.`);
                 }
                 return [...prev, ...uniqueNew];
            });
            alert(`${newFertilizers.length}개의 항목 처리 완료.`);
        } catch (err) {
            console.error(err);
            alert("엑셀 파일을 읽는 중 오류가 발생했습니다. 파일 형식을 확인해주세요.");
        }
        e.target.value = '';
    };

    useEffect(() => {
        const n = parseFloat(String(fertilizerForm.N || 0));
        const p = parseFloat(String(fertilizerForm.P || 0));
        const k = parseFloat(String(fertilizerForm.K || 0));
        
        if (!isNaN(n) && !isNaN(p) && !isNaN(k) && (n > 0 || p > 0 || k > 0)) {
            const ratio = calculateNpkRatio(n, p, k);
            setFertilizerForm(prev => ({ ...prev, npkRatio: ratio }));
        } else {
            setFertilizerForm(prev => ({ ...prev, npkRatio: '' }));
        }
    }, [fertilizerForm.N, fertilizerForm.P, fertilizerForm.K]);

    const costAnalysis = useMemo(() => {
        const price = parseFloat(String(fertilizerForm.price || 0));
        const unit = fertilizerForm.unit || '';
        const density = parseFloat(String(fertilizerForm.density || 1));

        const result = { perKgOrL: 0, unitType: 'kg' as 'kg' | 'l', perN: 0, perP: 0, perK: 0 };

        if (!price || !unit) return result;

        const unitMatch = unit.match(/(\d+(\.\d+)?)\s*(kg|l)/i);
        if (!unitMatch) return result;
        
        const size = parseFloat(unitMatch[1]);
        result.unitType = unitMatch[3].toLowerCase() as 'kg' | 'l';

        if (size <= 0) return result;

        const pricePerKgOrL = price / size;
        result.perKgOrL = pricePerKgOrL;

        const pricePerKg = result.unitType === 'l' ? pricePerKgOrL / density : pricePerKgOrL;

        const n = parseFloat(String(fertilizerForm.N || 0));
        const p = parseFloat(String(fertilizerForm.P || 0));
        const k = parseFloat(String(fertilizerForm.K || 0));

        result.perN = n > 0 ? pricePerKg / (n * 10) : 0;
        result.perP = p > 0 ? pricePerKg / (p * 10) : 0;
        result.perK = k > 0 ? pricePerKg / (k * 10) : 0;

        return result;
    }, [fertilizerForm.price, fertilizerForm.unit, fertilizerForm.density, fertilizerForm.N, fertilizerForm.P, fertilizerForm.K]);
    
    const applicationAnalysis = useMemo(() => {
        const rateStr = fertilizerForm.rate || '';
        const match = rateStr.match(/^([0-9.]+)/);
        if (!match) return null;
        
        const rateVal = parseFloat(match[1]);
        if (isNaN(rateVal) || rateVal <= 0) return null;

        const isLiquid = fertilizerForm.type === '액상';
        const density = Number(fertilizerForm.density || 1);
        
        const weightApplied = isLiquid ? rateVal * density : rateVal;

        const n = Number(fertilizerForm.N || 0);
        const p = Number(fertilizerForm.P || 0);
        const k = Number(fertilizerForm.K || 0);
        
        return {
            rateVal,
            unit: isLiquid ? 'ml/㎡' : 'g/㎡',
            appliedN: (n / 100) * weightApplied,
            appliedP: (p / 100) * weightApplied,
            appliedK: (k / 100) * weightApplied
        };
    }, [fertilizerForm.rate, fertilizerForm.type, fertilizerForm.density, fertilizerForm.N, fertilizerForm.P, fertilizerForm.K]);

    const rateCalculationResult = useMemo(() => {
        const targetAmount = parseFloat(rateCalcTargetAmount);
        if (isNaN(targetAmount) || targetAmount <= 0) return null;

        const nutrientPercent = parseFloat(String(fertilizerForm[rateCalcTargetNutrient] || 0));
        if (isNaN(nutrientPercent) || nutrientPercent <= 0) return null;
        
        const productRate = targetAmount / (nutrientPercent / 100);
        return productRate;
    }, [rateCalcTargetNutrient, rateCalcTargetAmount, fertilizerForm.N, fertilizerForm.P, fertilizerForm.K]);

    const handleApplyCalculatedRate = () => {
        if (rateCalculationResult === null) return;
        const isLiquid = fertilizerForm.type === '액상';
        const unit = isLiquid ? 'ml/㎡' : 'g/㎡';
        setFertilizerForm(prev => ({ ...prev, rate: `${rateCalculationResult.toFixed(2)}${unit}` }));
    };
    
    const validateFertilizerForm = (form: Partial<Fertilizer>): Record<string, string> => {
        const errors: Record<string, string> = {};

        if (!form.name?.trim()) errors.name = "제품명은 필수 항목입니다.";
        if (!form.usage) errors.usage = "구분은 필수 항목입니다.";
        if (!form.type) errors.type = "종류는 필수 항목입니다.";

        if (!form.unit?.trim()) {
            errors.unit = "단위는 필수 항목입니다.";
        } else if (!/^\d+(\.\d+)?\s*(kg|l)$/i.test(form.unit.trim())) {
            errors.unit = "형식 오류 (예: 20kg, 10L)";
        }

        if (!form.rate?.trim()) {
            errors.rate = "권장 사용량은 필수 항목입니다.";
        } else if (!/^\d+(\.\d+)?(g|ml)\/㎡$/i.test(form.rate.trim())) {
            errors.rate = "형식 오류 (예: 15g/㎡, 2ml/㎡)";
        }

        const generalNumericFields: (keyof Fertilizer)[] = ['price', 'stock'];
        generalNumericFields.forEach(field => {
            const value = form[field as keyof Partial<Fertilizer>];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                const numValue = Number(value);
                if (isNaN(numValue) || numValue < 0) {
                    errors[field] = "0 이상의 숫자여야 합니다.";
                }
            }
        });
        
        const percentageFields: (keyof Fertilizer)[] = ['concentration', ...NUTRIENTS as (keyof Fertilizer)[]];
        percentageFields.forEach(field => {
            const value = form[field as keyof Partial<Fertilizer>];
             if (value !== undefined && value !== null && String(value).trim() !== '') {
                const numValue = Number(value);
                if (isNaN(numValue) || numValue < 0 || numValue > 100) {
                    errors[field] = "값은 0과 100 사이여야 합니다.";
                }
            }
        });
        
        if (form.density !== undefined && form.density !== null && String(form.density).trim() !== '') {
            const numDensity = Number(form.density);
            if (isNaN(numDensity) || numDensity <= 0) {
                errors.density = "밀도는 0보다 큰 숫자여야 합니다.";
            } else if (numDensity > 5) {
                errors.density = "밀도 값이 너무 높습니다 (일반적으로 5 이하).";
            }
        }
        
        return errors;
    };


    const handleSaveFertilizer = () => {
        const validationErrors = validateFertilizerForm(fertilizerForm);
        if (Object.keys(validationErrors).length > 0) {
            setFormErrors(validationErrors);
            return;
        }

        const isEditing = !!editingFertilizer;
        const nameExists = masterFertilizers.some(f => f.name === fertilizerForm.name && f.name !== editingFertilizer?.name);
        if (nameExists) {
            setFormErrors({ ...validationErrors, name: '이미 존재하는 제품명입니다.' });
            return;
        }

        const newFertilizer: Fertilizer = {
            ...editingFertilizer,
            ...fertilizerForm,
            name: fertilizerForm.name!,
            usage: fertilizerForm.usage!,
            type: fertilizerForm.type!,
            N: Number(fertilizerForm.N || 0), P: Number(fertilizerForm.P || 0), K: Number(fertilizerForm.K || 0),
            Ca: Number(fertilizerForm.Ca || 0), Mg: Number(fertilizerForm.Mg || 0), S: Number(fertilizerForm.S || 0),
            Fe: Number(fertilizerForm.Fe || 0), Mn: Number(fertilizerForm.Mn || 0), Zn: Number(fertilizerForm.Zn || 0),
            Cu: Number(fertilizerForm.Cu || 0), B: Number(fertilizerForm.B || 0), Mo: Number(fertilizerForm.Mo || 0),
            Cl: Number(fertilizerForm.Cl || 0), Na: Number(fertilizerForm.Na || 0), Si: Number(fertilizerForm.Si || 0),
            Ni: Number(fertilizerForm.Ni || 0), Co: Number(fertilizerForm.Co || 0), V: Number(fertilizerForm.V || 0),
            price: Number(fertilizerForm.price || 0), unit: fertilizerForm.unit || '', rate: fertilizerForm.rate || '',
            density: Number(fertilizerForm.density || 0), concentration: Number(fertilizerForm.concentration || 0),
            npkRatio: fertilizerForm.npkRatio || '', stock: Number(fertilizerForm.stock || 0),
            imageUrl: fertilizerForm.imageUrl || undefined,
            lowStockAlertEnabled: !!fertilizerForm.lowStockAlertEnabled,
        };

        if (isEditing) {
            setMasterFertilizers(prev => prev.map(f => f.name === editingFertilizer!.name ? newFertilizer : f));
        } else {
            setMasterFertilizers(prev => [...prev, newFertilizer]);
        }
        setIsFertilizerModalOpen(false);
    };
    
    const openFertilizerModal = (fert: Fertilizer | null = null) => {
        setEditingFertilizer(fert);
        setFertilizerForm(fert || { name: '', usage: '그린', type: '완효성', lowStockAlertEnabled: false });
        setFormErrors({});
        setIsFertilizerModalOpen(true);
    };

    const handleDeleteFertilizer = (name: string) => {
        if (window.confirm(`'${name}' 비료를 정말 삭제하시겠습니까?`)) {
            setMasterFertilizers(prev => prev.filter(f => f.name !== name));
        }
    };
    
    const handleDeleteUser = async (username: string) => {
        if (window.confirm(`'${username}' 사용자의 모든 데이터(로그, 설정 등)가 영구적으로 삭제됩니다. 정말 삭제하시겠습니까?`)) {
            try {
                await api.deleteUser(username);
                setAllUserData(prev => prev.filter(u => u.username !== username));
                alert("사용자가 삭제되었습니다.");
            } catch (e) {
                console.error(e);
                alert("사용자 삭제 중 오류가 발생했습니다.");
            }
        }
    };

    const handleSelectFertilizer = (name: string) => {
        setSelectedFertilizers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(name)) newSet.delete(name);
            else newSet.add(name);
            return newSet;
        });
    };
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedFertilizers(new Set(displayedFertilizers.map(f => f.name)));
        } else {
            setSelectedFertilizers(new Set());
        }
    };

    const handleApplyBulkEdit = () => {
        const { target, operation, value: rawValue } = bulkEditConfig;

        if (target === 'lowStockAlertEnabled') {
            if (rawValue !== 'true' && rawValue !== 'false') {
                 alert("설정 값을 선택하세요.");
                 return;
            }
            const boolValue = rawValue === 'true';
            setMasterFertilizers(prev => prev.map(fert => {
                if (selectedFertilizers.has(fert.name)) {
                    return { ...fert, lowStockAlertEnabled: boolValue };
                }
                return fert;
            }));
        } else {
            const value = parseFloat(rawValue);

            if (isNaN(value) || rawValue === '') {
                alert("유효한 숫자를 입력하세요.");
                return;
            }

            setMasterFertilizers(prev => prev.map(fert => {
                if (selectedFertilizers.has(fert.name)) {
                    const newFert = { ...fert };
                    let currentValue = (newFert[target as 'price' | 'stock'] as number) || 0;
                    
                    switch(operation) {
                        case 'set': currentValue = value; break;
                        case 'add': currentValue += value; break;
                        case 'subtract': currentValue -= value; break;
                        case 'percent_increase': if(target === 'price') currentValue *= (1 + value / 100); break;
                        case 'percent_decrease': if(target === 'price') currentValue *= (1 - value / 100); break;
                    }

                    const finalValue = target === 'price' ? Math.round(currentValue) : parseFloat(currentValue.toFixed(2));
                    newFert[target as 'price' | 'stock'] = finalValue < 0 ? 0 : finalValue;

                    return newFert;
                }
                return fert;
            }));
        }
        
        setIsBulkEditModalOpen(false);
        setSelectedFertilizers(new Set());
    };

    const handleExportUserToExcel = (userData: UserDataSummary) => {
        if (userData.logs.length === 0) {
            alert(`${userData.username}님의 내보낼 데이터가 없습니다.`);
            return;
        }

        const dataToExport = userData.logs.map(entry => {
            const row: {[key: string]: any} = {
                '날짜': entry.date,
                '제품명': entry.product,
                '구분': entry.usage,
                '면적(㎡)': entry.area,
                '사용량': `${entry.applicationRate}${entry.applicationUnit}`,
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
        XLSX.writeFile(workbook, `Fertilizer_Log_${userData.username}.xlsx`);
    };

    const SortIcon = ({ direction }: { direction: 'asc' | 'desc' | 'none' }) => {
        if (direction === 'none') {
            return (
                <svg className="h-4 w-4 inline-block ml-1 text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
            );
        }
        return (
            <svg className="h-4 w-4 inline-block ml-1 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {direction === 'asc' ? 
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /> : 
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
            </svg>
        );
    };

    const renderSortableHeader = (label: string, sortKey: keyof Fertilizer, align: 'left' | 'center' | 'right' = 'left') => {
        const textAlignClass = `text-${align}`;
        const justifyContentClass = align === 'left' ? 'justify-start' : align === 'center' ? 'justify-center' : 'justify-end';
        return (
            <th className={`p-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-200 group ${textAlignClass}`} onClick={() => requestSort(sortKey)}>
                <div className={`flex items-center ${justifyContentClass}`}>
                    <span>{label}</span>
                    <SortIcon direction={sortConfig.key === sortKey ? sortConfig.direction : 'none'} />
                </div>
            </th>
        );
    };
    
    const handleNotificationSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setNotificationSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };


    if (isLoading) return <LoadingSpinner />;
    if (error) return <div className="text-center text-red-500 mt-10">{error}</div>;

    return (
        <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex flex-wrap justify-between items-center gap-4 py-4">
                    <div className="flex items-center gap-3">
                        <DashboardIcon />
                        <h1 className="text-3xl font-bold text-slate-800">관리자 대시보드</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-600 hidden sm:inline">안녕하세요, {user}님</span>
                        <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 bg-slate-200 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-300 transition-colors" title="로그아웃">
                            <LogoutIcon />
                            <span className="hidden sm:inline">로그아웃</span>
                        </button>
                    </div>
                </header>

                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="총 사용자 수" value={summaryStats.totalUsers} icon={<UsersIcon />} colorClasses={{bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-500'}} />
                    <StatCard title="총 시비 기록 수" value={summaryStats.totalLogs.toLocaleString()} icon={<ClipboardListIcon />} colorClasses={{bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-500'}} />
                    <StatCard title="전체 누적 비용" value={`${Math.round(summaryStats.totalCost).toLocaleString()}원`} icon={<CurrencyWonIcon />} colorClasses={{bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-500'}} />
                    <StatCard title="최다 사용 비료" value={summaryStats.mostUsedFertilizer} icon={<SparklesIcon />} colorClasses={{bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-500'}} />
                </section>
                
                <section className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-slate-700 border-b pb-3 mb-4 flex items-center gap-2">
                        <BellIcon /> ⚙️ 알림 설정
                    </h2>
                    <div className="space-y-4 max-w-2xl">
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                            <label htmlFor="notifications-enabled" className="font-medium text-slate-700">
                                재고 부족 알림 활성화
                            </label>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    id="notifications-enabled"
                                    name="enabled"
                                    checked={notificationSettings.enabled}
                                    onChange={handleNotificationSettingsChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </div>
                        </div>

                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity ${notificationSettings.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <div>
                                <label htmlFor="notification-email" className="block text-sm font-medium text-slate-700 mb-1">알림 받을 이메일</label>
                                <input
                                    id="notification-email"
                                    type="email"
                                    name="email"
                                    value={notificationSettings.email}
                                    onChange={handleNotificationSettingsChange}
                                    placeholder="admin@example.com"
                                    className="p-2 border rounded-md w-full"
                                    disabled={!notificationSettings.enabled}
                                />
                            </div>
                            <div>
                                <label htmlFor="notification-threshold" className="block text-sm font-medium text-slate-700 mb-1">재고 부족 임계값 (kg/L)</label>
                                <input
                                    id="notification-threshold"
                                    type="number"
                                    name="threshold"
                                    value={notificationSettings.threshold}
                                    onChange={handleNotificationSettingsChange}
                                    className="p-2 border rounded-md w-full"
                                    disabled={!notificationSettings.enabled}
                                />
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-4">
                        참고: 실제 이메일 발송은 백엔드 서버가 필요합니다. 현재는 브라우저 알림으로 시뮬레이션됩니다.
                    </p>
                </section>
                
                <section className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-slate-700 border-b pb-3 mb-4">비료 마스터 목록 관리</h2>
                    
                     <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                            <span className="text-xl">💡</span> 엑셀 일괄 업로드 가이드
                        </h4>
                        <p className="text-sm text-blue-800 mb-4">
                            다수의 비료를 한번에 등록하려면 엑셀(.xlsx) 파일을 사용하세요. 아래 양식을 참고하여 파일을 작성해주세요.
                        </p>
                        <div className="overflow-x-auto border rounded-md shadow-sm">
                            <table className="w-full text-xs text-left bg-white border-collapse">
                                <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                                    <tr>
                                        <th className="p-3 border-r w-12 text-center">필수</th>
                                        <th className="p-3 border-r">컬럼명 (한글 / 영문)</th>
                                        <th className="p-3 border-r">입력 규칙 및 데이터 형식</th>
                                        <th className="p-3 bg-slate-50">예시 데이터</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-600">
                                    <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-red-500 font-bold border-r">●</td>
                                        <td className="p-3 font-medium border-r text-blue-800">제품명 / Name</td>
                                        <td className="p-3 text-slate-600 border-r">중복되지 않는 제품 고유 이름 (텍스트)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">성장엔 21</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-red-500 font-bold border-r">●</td>
                                        <td className="p-3 font-medium border-r text-blue-800">구분 / Usage</td>
                                        <td className="p-3 text-slate-600 border-r">'그린', '티', '페어웨이' 중 하나 (텍스트)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">그린</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-red-500 font-bold border-r">●</td>
                                        <td className="p-3 font-medium border-r text-blue-800">종류 / Type</td>
                                        <td className="p-3 text-slate-600 border-r">'완효성', '액상', '4종복합비료' 등 (텍스트)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">완효성</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-red-500 font-bold border-r">●</td>
                                        <td className="p-3 font-medium border-r text-blue-800">단위 / Unit</td>
                                        <td className="p-3 text-slate-600 border-r">숫자 + 단위(kg 또는 L)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">20kg</td>
                                    </tr>
                                     <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-red-500 font-bold border-r">●</td>
                                        <td className="p-3 font-medium border-r text-blue-800">권장사용량 / Rate</td>
                                        <td className="p-3 text-slate-600 border-r">숫자 + 단위(g/㎡ 또는 ml/㎡)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">20g/㎡</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-slate-300 border-r">○</td>
                                        <td className="p-3 font-medium border-r">가격 / Price</td>
                                        <td className="p-3 text-slate-600 border-r">숫자 (원 단위, 콤마 제외)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">45000</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-slate-300 border-r">○</td>
                                        <td className="p-3 font-medium border-r">성분 (N, P, K 등)</td>
                                        <td className="p-3 text-slate-600 border-r">숫자 (백분율 %)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">21</td>
                                    </tr>
                                     <tr className="hover:bg-slate-50">
                                        <td className="p-3 text-center text-slate-300 border-r">○</td>
                                        <td className="p-3 font-medium border-r">재고 / Stock</td>
                                        <td className="p-3 text-slate-600 border-r">숫자 (kg 또는 L)</td>
                                        <td className="p-3 font-mono text-slate-700 bg-slate-50/50">50</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-lg border mb-4 space-y-4 sm:space-y-0">
                        <div className="flex flex-col gap-4">
                             <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">🔍 필터:</span>
                            </div>
                            <div className="flex flex-wrap gap-3 items-center">
                                <input type="text" name="name" placeholder="제품명으로 검색..." value={filters.name} onChange={handleFilterChange} className="p-2 border rounded-md w-full sm:w-auto flex-grow text-sm" />
                                <select name="usage" value={filters.usage} onChange={handleFilterChange} className="p-2 border rounded-md bg-white w-full sm:w-32 text-sm">
                                    <option value="">모든 구분</option>
                                    {USAGE_CATEGORIES.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <select name="type" value={filters.type} onChange={handleFilterChange} className="p-2 border rounded-md bg-white w-full sm:w-32 text-sm">
                                    <option value="">모든 종류</option>
                                    {TYPE_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-wrap gap-3 items-center border-t pt-3 sm:border-t-0 sm:pt-0">
                                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border">
                                    <span className="text-xs font-semibold text-slate-500">N ≥</span>
                                    <input type="number" name="minN" placeholder="%" value={filters.minN} onChange={handleFilterChange} className="w-12 p-1 text-sm border-b focus:border-indigo-500 outline-none text-center" />
                                </div>
                                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border">
                                    <span className="text-xs font-semibold text-slate-500">P ≥</span>
                                    <input type="number" name="minP" placeholder="%" value={filters.minP} onChange={handleFilterChange} className="w-12 p-1 text-sm border-b focus:border-indigo-500 outline-none text-center" />
                                </div>
                                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border">
                                    <span className="text-xs font-semibold text-slate-500">K ≥</span>
                                    <input type="number" name="minK" placeholder="%" value={filters.minK} onChange={handleFilterChange} className="w-12 p-1 text-sm border-b focus:border-indigo-500 outline-none text-center" />
                                </div>
                                <button onClick={handleResetFilters} className="px-3 py-2 bg-slate-200 text-slate-700 font-semibold rounded-md hover:bg-slate-300 transition-colors text-sm whitespace-nowrap ml-auto sm:ml-0">
                                    초기화
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0">
                            {selectedFertilizers.size > 0 && (
                                <button onClick={() => setIsBulkEditModalOpen(true)} className="px-4 py-2 bg-yellow-500 text-white font-semibold rounded-md hover:bg-yellow-600 transition-colors text-sm">
                                    일괄 편집 ({selectedFertilizers.size})
                                </button>
                            )}
                            <button onClick={() => openFertilizerModal()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors text-sm">
                                <PlusIcon /> 새 비료 추가
                            </button>
                             <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors text-sm cursor-pointer">
                                <UploadIcon /> 엑셀 업로드
                                <input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} className="hidden" />
                            </label>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="p-3 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} checked={displayedFertilizers.length > 0 && selectedFertilizers.size === displayedFertilizers.length} className="rounded" /></th>
                                    <th className="p-3 font-semibold text-center">이미지</th>
                                    {renderSortableHeader('제품명', 'name', 'left')}
                                    {renderSortableHeader('구분', 'usage', 'center')}
                                    {renderSortableHeader('종류', 'type', 'center')}
                                    {renderSortableHeader('N (%)', 'N', 'center')}
                                    {renderSortableHeader('P (%)', 'P', 'center')}
                                    {renderSortableHeader('K (%)', 'K', 'center')}
                                    {renderSortableHeader('가격 (원)', 'price', 'right')}
                                    {renderSortableHeader('재고', 'stock', 'right')}
                                    <th className="p-3 font-semibold text-center">알림</th>
                                    <th className="p-3 font-semibold text-center">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedFertilizers.map(f => (
                                    <tr key={f.name} className="border-b hover:bg-slate-50">
                                        <td className="p-3 text-center"><input type="checkbox" onChange={() => handleSelectFertilizer(f.name)} checked={selectedFertilizers.has(f.name)} className="rounded" /></td>
                                        <td className="p-3">
                                            {f.imageUrl ? (
                                                <img src={f.imageUrl} alt={f.name} className="h-12 w-12 object-cover rounded-md mx-auto" />
                                            ) : (
                                                <div className="h-12 w-12 bg-slate-200 rounded-md flex items-center justify-center mx-auto">
                                                    <span className="text-xs text-slate-400">없음</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 font-medium text-slate-800">{f.name}</td>
                                        <td className="p-3 text-center"><span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">{f.usage}</span></td>
                                        <td className="p-3 text-center text-slate-600">{f.type}</td>
                                        <td className="p-3 font-mono text-center text-slate-600">{f.N}</td>
                                        <td className="p-3 font-mono text-center text-slate-600">{f.P}</td>
                                        <td className="p-3 font-mono text-center text-slate-600">{f.K}</td>
                                        <td className="p-3 font-mono text-right text-slate-800">{f.price.toLocaleString()}</td>
                                        <td className="p-3 font-mono text-right text-slate-800">{f.stock?.toFixed(2)}{f.type === '액상' ? 'L' : 'kg'}</td>
                                        <td className="p-3 text-center">
                                            {f.lowStockAlertEnabled ? 
                                                <BellIcon className="h-5 w-5 text-green-500 mx-auto" /> : 
                                                <span className="text-slate-400">-</span>
                                            }
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex justify-center items-center gap-2">
                                                <button onClick={() => openFertilizerModal(f)} className="p-1 text-slate-500 hover:text-blue-600"><PencilIcon className="h-4 w-4" /></button>
                                                <button onClick={() => handleDeleteFertilizer(f.name)} className="p-1 text-slate-500 hover:text-red-600"><TrashIcon className="h-4 w-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {displayedFertilizers.length === 0 && <p className="text-center text-slate-500 py-8">표시할 비료가 없습니다.</p>}
                    </div>
                </section>

                <section className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-slate-700 border-b pb-3 mb-4">사용자별 누적 비용 분석</h2>
                    <div className="w-full h-80">
                        <ResponsiveContainer>
                            <BarChart data={userCostChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" fontSize={12} />
                                <YAxis fontSize={12} tickFormatter={(tick) => tick.toLocaleString()} />
                                <Tooltip formatter={(value: number) => `${value.toLocaleString()}원`} />
                                <Legend wrapperStyle={{fontSize: "12px"}}/>
                                <Bar dataKey="총 비용" fill="#4f46e5" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-semibold text-slate-700 border-b pb-3 mb-4">월별 사용자 비용 분석</h2>
                        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border text-xs sm:text-sm">
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <label className="font-medium text-slate-600 whitespace-nowrap">기간:</label>
                                <input type="date" value={costChartStartDate} onChange={e => setCostChartStartDate(e.target.value)} className="p-1.5 border rounded w-full sm:w-auto" />
                                <span>~</span>
                                <input type="date" value={costChartEndDate} onChange={e => setCostChartEndDate(e.target.value)} className="p-1.5 border rounded w-full sm:w-auto" />
                            </div>
                             <button onClick={() => { setCostChartStartDate(''); setCostChartEndDate(''); }} className="ml-auto px-3 py-1.5 bg-slate-200 text-slate-700 font-semibold rounded hover:bg-slate-300 transition-colors">초기화</button>
                        </div>
                        <div className="w-full h-80">
                            {monthlyUserCostChartData.length > 0 ? (
                                <ResponsiveContainer>
                                    <BarChart data={monthlyUserCostChartData} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" fontSize={12} angle={-25} textAnchor="end" />
                                        <YAxis fontSize={12} tickFormatter={(tick) => tick.toLocaleString()} />
                                        <Tooltip formatter={(value: number) => `${value.toLocaleString()}원`} />
                                        <Legend wrapperStyle={{fontSize: "12px"}}/>
                                        {allUsernames.map((username, index) => {
                                            const COLORS = ['#4f46e5', '#16a34a', '#f97316', '#8b5cf6', '#0ea5e9', '#f59e0b', '#ef4444', '#64748b'];
                                            return (
                                                <Bar key={username} dataKey={username} stackId="a" fill={COLORS[index % COLORS.length]} name={username} />
                                            );
                                        })}
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-500 bg-slate-50 rounded-md">데이터가 없습니다.</div>
                            )}
                        </div>
                    </section>

                    <section className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-semibold text-slate-700 border-b pb-3 mb-4">월별 비료 종류별 비용 분석</h2>
                        <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border text-xs sm:text-sm text-slate-500">
                             <p>💡 위 '월별 사용자 비용 분석'의 날짜 필터가 이 차트에도 적용됩니다.</p>
                        </div>
                         <div className="w-full h-80">
                            {monthlyTypeCostChartData.length > 0 ? (
                                <ResponsiveContainer>
                                    <BarChart data={monthlyTypeCostChartData} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" fontSize={12} angle={-25} textAnchor="end" />
                                        <YAxis fontSize={12} tickFormatter={(tick) => tick.toLocaleString()} />
                                        <Tooltip formatter={(value: number) => `${value.toLocaleString()}원`} />
                                        <Legend wrapperStyle={{fontSize: "12px"}}/>
                                        {TYPE_CATEGORIES.map((type, index) => {
                                            const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#06b6d4', '#8b5cf6', '#64748b'];
                                            return (
                                                <Bar key={type} dataKey={type} stackId="b" fill={COLORS[index % COLORS.length]} name={type} />
                                            );
                                        })}
                                        <Bar dataKey="기타" stackId="b" fill="#94a3b8" name="기타" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-500 bg-slate-50 rounded-md">데이터가 없습니다.</div>
                            )}
                        </div>
                    </section>
                </div>

                <section className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-slate-700 border-b pb-3 mb-4">사용자 데이터 상세</h2>
                     {allUserData.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {allUserData.map(userData => (
                                <div key={userData.username} className="bg-slate-50 border rounded-lg overflow-hidden transition-shadow hover:shadow-md">
                                    <div 
                                        className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" 
                                        onClick={() => setExpandedUser(expandedUser === userData.username ? null : userData.username)}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-baseline gap-3">
                                                <p className="font-bold text-lg text-slate-800">{userData.username}</p>
                                                <p className="font-medium text-sm text-slate-600">{userData.golfCourse}</p>
                                            </div>
                                            <span className="text-indigo-600 text-xs font-semibold flex items-center gap-1">
                                                {expandedUser === userData.username ? '▲ 숨기기' : '▼ 상세보기'}
                                            </span>
                                        </div>
                                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <ClipboardListIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                                                <div>
                                                    <p className="text-xs">기록 수</p>
                                                    <p className="font-semibold text-slate-800">{userData.logCount.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <CurrencyWonIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                                                <div>
                                                    <p className="text-xs">총 비용</p>
                                                    <p className="font-semibold text-slate-800">{Math.round(userData.totalCost).toLocaleString()}원</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <CalendarIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                                                <div>
                                                    <p className="text-xs">마지막 활동</p>
                                                    <p className="font-semibold text-slate-800">{userData.lastActivity || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="px-4 pb-2 flex justify-end border-t border-slate-100 pt-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteUser(userData.username); }}
                                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                        >
                                            <TrashIcon className="h-4 w-4" /> 사용자 삭제
                                        </button>
                                    </div>
                                    {expandedUser === userData.username && (
                                        <div className="p-4 border-t bg-white">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <h4 className="font-semibold text-slate-700">시비 기록</h4>
                                                        <button 
                                                            onClick={() => handleExportUserToExcel(userData)}
                                                            className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-md hover:bg-green-200 transition-colors"
                                                        >
                                                            <DownloadIcon /> Export to Excel
                                                        </button>
                                                    </div>
                                                    {userData.logs.length > 0 ? (
                                                        <div className="max-h-60 overflow-y-auto border rounded-md">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-slate-100 sticky top-0">
                                                                    <tr>
                                                                        <th className="p-2 font-semibold text-left">날짜</th>
                                                                        <th className="p-2 font-semibold text-left">제품</th>
                                                                        <th className="p-2 font-semibold text-right">면적(㎡)</th>
                                                                        <th className="p-2 font-semibold text-right">비용(원)</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {userData.logs.map((log, index) => (
                                                                        <tr key={index} className="border-t">
                                                                            <td className="p-2">{log.date}</td>
                                                                            <td className="p-2">{log.product}</td>
                                                                            <td className="p-2 text-right">{log.area}</td>
                                                                            <td className="p-2 text-right">{Math.round(log.totalCost).toLocaleString()}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        <p className="text-slate-500 text-xs">기록된 시비 일지가 없습니다.</p>
                                                    )}
                                                </div>
                                                <div className="space-y-3">
                                                    <h4 className="font-semibold text-slate-700">비료별 사용 요약</h4>
                                                    {(() => {
                                                        const fertilizerSummary = userData.logs.reduce((acc, log) => {
                                                            const productInfo = masterFertilizers.find(f => f.name === log.product);
                                                            const isLiquid = productInfo?.type === '액상';
                                                            if (!acc[log.product]) {
                                                                acc[log.product] = { totalCost: 0, totalAmount: 0, isLiquid };
                                                            }
                                                            const summary = acc[log.product];
                                                            summary.totalCost += log.totalCost;
                                                            summary.totalAmount += log.applicationRate * log.area; // in g or ml
                                                            return acc;
                                                        }, {} as Record<string, SummaryData>);

                                                        const summaryArray = (Object.entries(fertilizerSummary) as [string, SummaryData][])
                                                            .map(([name, data]) => ({
                                                                name,
                                                                totalCost: data.totalCost,
                                                                totalAmount: data.totalAmount / 1000, // g -> kg, ml -> L
                                                                unit: data.isLiquid ? 'L' : 'kg'
                                                            }))
                                                            .sort((a, b) => b.totalCost - a.totalCost);

                                                        if (summaryArray.length === 0) {
                                                            return <p className="text-slate-500 text-xs">요약할 데이터가 없습니다.</p>;
                                                        }

                                                        return (
                                                            <div className="max-h-60 overflow-y-auto border rounded-md">
                                                                <table className="w-full text-xs">
                                                                    <thead className="bg-slate-100 sticky top-0">
                                                                        <tr>
                                                                            <th className="p-2 font-semibold text-left">제품명</th>
                                                                            <th className="p-2 font-semibold text-right">총 사용량</th>
                                                                            <th className="p-2 font-semibold text-right">총 비용(원)</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {summaryArray.map((item) => (
                                                                            <tr key={item.name} className="border-t">
                                                                                <td className="p-2 font-medium">{item.name}</td>
                                                                                <td className="p-2 text-right font-mono">{item.totalAmount.toFixed(2)} {item.unit}</td>
                                                                                <td className="p-2 text-right font-mono">{Math.round(item.totalCost).toLocaleString()}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-slate-500 py-4">표시할 사용자 데이터가 없습니다.</p>
                    )}
                </section>
            </div>
            {isFertilizerModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b flex justify-between items-center">
                            <h3 className="text-lg font-semibold">{editingFertilizer ? '비료 수정' : '새 비료 추가'}</h3>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6">
                            
                            {!editingFertilizer && (
                                <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <SparklesIcon /> 
                                        <h4 className="font-bold text-indigo-900">AI 스마트 입력</h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* File Upload Zone */}
                                        <div className="relative border-2 border-dashed border-indigo-300 rounded-lg bg-white p-4 flex flex-col items-center justify-center text-center hover:bg-indigo-50 transition-colors h-32">
                                             <input 
                                                type="file" 
                                                accept=".xlsx, .xls, .csv, .pdf, image/*" 
                                                onChange={handleAiSmartFillFile} 
                                                disabled={isAiFillLoading}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                                            />
                                             <UploadIcon className="h-8 w-8 text-indigo-400 mb-2" />
                                             <p className="text-xs font-semibold text-indigo-700">파일 업로드 (이미지/엑셀/PDF)</p>
                                        </div>
                                        
                                        {/* Text Input Zone */}
                                        <div className="flex flex-col h-32">
                                             <textarea 
                                                className="flex-1 p-2 text-xs border border-indigo-200 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-2"
                                                placeholder="제품 정보를 여기에 직접 붙여넣으세요 (예: 제품명, 성분, 가격 등)..."
                                                value={aiTextInput}
                                                onChange={e => setAiTextInput(e.target.value)}
                                             />
                                             <button 
                                                onClick={handleAiSmartFillText}
                                                disabled={isAiFillLoading || !aiTextInput.trim()}
                                                className="bg-indigo-600 text-white text-xs font-bold py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                             >
                                                {isAiFillLoading ? '분석 중...' : '텍스트 분석하기'}
                                             </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                             {/* --- Basic Info & Image --- */}
                             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
                                    <div className="md:col-span-2">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="fert-name" className="text-sm font-medium text-slate-700">제품명*</label>
                                            <HelpTooltip text="비료의 고유한 전체 이름을 입력하세요. 수정할 수 없으니 정확하게 입력해주세요." />
                                        </div>
                                        <input id="fert-name" type="text" name="name" value={fertilizerForm.name || ''} onChange={handleFertilizerFormChange} className={`p-2 border rounded-md w-full ${formErrors.name ? 'border-red-500' : ''}`} disabled={!!editingFertilizer} />
                                        {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="fert-usage" className="text-sm font-medium text-slate-700">구분*</label>
                                            <HelpTooltip text="이 비료가 주로 사용되는 구역(그린, 티, 페어웨이)을 선택하세요." />
                                        </div>
                                        <select id="fert-usage" name="usage" value={fertilizerForm.usage || ''} onChange={handleFertilizerFormChange} className={`p-2 border rounded-md bg-white w-full ${formErrors.usage ? 'border-red-500' : ''}`}>
                                            {USAGE_CATEGORIES.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        {formErrors.usage && <p className="text-red-500 text-xs mt-1">{formErrors.usage}</p>}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="fert-type" className="text-sm font-medium text-slate-700">종류*</label>
                                            <HelpTooltip text="비료의 물리적 형태나 특성(완효성, 액상 등)을 선택하세요." />
                                        </div>
                                        <select id="fert-type" name="type" value={fertilizerForm.type || ''} onChange={handleFertilizerFormChange} className={`p-2 border rounded-md bg-white w-full ${formErrors.type ? 'border-red-500' : ''}`}>
                                            {TYPE_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        {formErrors.type && <p className="text-red-500 text-xs mt-1">{formErrors.type}</p>}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="fert-price" className="text-sm font-medium text-slate-700">가격 (원)</label>
                                            <HelpTooltip text="단위 포장(unit)당 판매 가격을 원 단위로 입력하세요." />
                                        </div>
                                        <input id="fert-price" type="number" name="price" value={fertilizerForm.price ?? ''} onChange={handleFertilizerFormChange} className={`p-2 border rounded-md w-full ${formErrors.price ? 'border-red-500' : ''}`} />
                                        {formErrors.price && <p className="text-red-500 text-xs mt-1">{formErrors.price}</p>}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="fert-unit" className="text-sm font-medium text-slate-700">단위*</label>
                                            <HelpTooltip text="판매되는 포장 단위를 정확한 형식으로 입력하세요. 고체는 'kg', 액체는 'L'를 사용합니다. (예: 20kg, 10L)" />
                                        </div>
                                        <input id="fert-unit" type="text" name="unit" placeholder="예: 20kg, 10L" value={fertilizerForm.unit || ''} onChange={handleFertilizerFormChange} className={`p-2 border rounded-md w-full ${formErrors.unit ? 'border-red-500' : ''}`} />
                                        {formErrors.unit && <p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="fert-stock" className="text-sm font-medium text-slate-700">재고</label>
                                            <HelpTooltip text="현재 보유 중인 재고량을 kg(고체) 또는 L(액체) 단위로 입력하세요." />
                                        </div>
                                        <input id="fert-stock" type="number" name="stock" value={fertilizerForm.stock ?? ''} onChange={handleFertilizerFormChange} className={`p-2 border rounded-md w-full ${formErrors.stock ? 'border-red-500' : ''}`} />
                                        {formErrors.stock && <p className="text-red-500 text-xs mt-1">{formErrors.stock}</p>}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="fert-rate" className="text-sm font-medium text-slate-700">권장 사용량*</label>
                                            <HelpTooltip text="1제곱미터(㎡)당 권장 사용량을 정확한 형식으로 입력하세요. 고체는 'g/㎡', 액체는 'ml/㎡'를 사용합니다. (예: 15g/㎡, 2ml/㎡)" />
                                        </div>
                                        <input id="fert-rate" type="text" name="rate" placeholder="예: 15g/㎡, 2ml/㎡" value={fertilizerForm.rate || ''} onChange={handleFertilizerFormChange} className={`p-2 border rounded-md w-full ${formErrors.rate ? 'border-red-500' : ''}`} />
                                        {formErrors.rate && <p className="text-red-500 text-xs mt-1">{formErrors.rate}</p>}
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-2 cursor-pointer p-2 bg-slate-50 border rounded-md hover:bg-slate-100">
                                            <input 
                                                type="checkbox" 
                                                name="lowStockAlertEnabled" 
                                                checked={!!fertilizerForm.lowStockAlertEnabled} 
                                                onChange={(e) => setFertilizerForm(prev => ({ ...prev, lowStockAlertEnabled: e.target.checked }))} 
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            <span className="text-sm text-slate-700 font-medium">재고 부족 알림 활성화</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">제품 이미지</label>
                                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center min-h-[200px] relative bg-slate-50 hover:bg-slate-100 transition-colors">
                                        {fertilizerForm.imageUrl ? (
                                            <>
                                                <img src={fertilizerForm.imageUrl} alt="Preview" className="max-h-48 object-contain mb-2" />
                                                <button 
                                                    onClick={() => setFertilizerForm(prev => ({ ...prev, imageUrl: undefined }))}
                                                    className="absolute top-2 right-2 p-1 bg-red-100 rounded-full text-red-600 hover:bg-red-200"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <ImageIcon className="text-slate-400 mb-2" />
                                                <p className="text-xs text-slate-500 text-center">이미지를 업로드하거나<br/>여기로 드래그하세요</p>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </div>
                                    {formErrors.imageUrl && <p className="text-red-500 text-xs mt-1">{formErrors.imageUrl}</p>}
                                </div>
                            </div>

                            {/* --- Nutrient Info --- */}
                            <div>
                                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                    🧪 성분 함량 (%)
                                </h4>
                                <div className="p-4 bg-slate-50 rounded-lg border">
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        {NUTRIENTS.map(nutrient => (
                                            <div key={nutrient}>
                                                <label className="block text-xs font-semibold text-slate-500 mb-1">{nutrient}</label>
                                                <input 
                                                    type="number" 
                                                    name={nutrient} 
                                                    value={(fertilizerForm[nutrient as keyof Fertilizer] as string | number) ?? ''} 
                                                    onChange={handleFertilizerFormChange} 
                                                    placeholder="0"
                                                    className="w-full p-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500" 
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {fertilizerForm.npkRatio && (
                                    <p className="text-xs text-blue-600 mt-2 font-medium">
                                        * 자동 계산된 N-P-K 비율: {fertilizerForm.npkRatio}
                                    </p>
                                )}
                            </div>
                            
                            {/* --- Advanced Details --- */}
                            <details className="group">
                                <summary className="cursor-pointer text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1 select-none">
                                    <span className="transition-transform group-open:rotate-90">▶</span> 추가 상세 정보 (밀도, 농도 등)
                                </summary>
                                <div className="p-4 bg-slate-50 border rounded-lg mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label className="text-sm font-medium text-slate-700">비중 (밀도)</label>
                                            <HelpTooltip text="액상 비료의 경우 비중(1.0~1.5)을 입력하면 정확한 계산에 도움이 됩니다. 기본값 1.0" />
                                        </div>
                                        <input type="number" step="0.01" name="density" value={fertilizerForm.density ?? ''} onChange={handleFertilizerFormChange} className="w-full p-2 border rounded-md" placeholder="1.0" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label className="text-sm font-medium text-slate-700">농도 (%)</label>
                                            <HelpTooltip text="액상 제품의 희석 전 원액 농도를 입력하세요. (일반적으로 사용되지 않음)" />
                                        </div>
                                        <input type="number" step="0.1" name="concentration" value={fertilizerForm.concentration ?? ''} onChange={handleFertilizerFormChange} className="w-full p-2 border rounded-md" placeholder="0" />
                                    </div>
                                </div>
                            </details>

                            {/* --- Analysis Preview --- */}
                            <div className="border-t pt-4">
                                <h4 className="font-semibold text-slate-800 mb-3">📊 분석 미리보기</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                    <div className="bg-blue-50 p-3 rounded border border-blue-100">
                                        <p className="font-bold text-blue-800 mb-2">비용 분석 (1kg/L 당)</p>
                                        <div className="space-y-1 text-blue-900">
                                            <p>단위당 가격: <span className="font-mono">{costAnalysis.perKgOrL ? Math.round(costAnalysis.perKgOrL).toLocaleString() : '-'}</span> 원/{costAnalysis.unitType}</p>
                                            <p>질소(N) 1g당: <span className="font-mono">{costAnalysis.perN ? costAnalysis.perN.toFixed(1) : '-'}</span> 원</p>
                                            <p>인산(P) 1g당: <span className="font-mono">{costAnalysis.perP ? costAnalysis.perP.toFixed(1) : '-'}</span> 원</p>
                                            <p>칼륨(K) 1g당: <span className="font-mono">{costAnalysis.perK ? costAnalysis.perK.toFixed(1) : '-'}</span> 원</p>
                                        </div>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded border border-green-100">
                                        <p className="font-bold text-green-800 mb-2">투입량 분석 (1㎡ 당)</p>
                                        {applicationAnalysis ? (
                                            <div className="space-y-1 text-green-900">
                                                <p>제품 사용량: <span className="font-mono">{applicationAnalysis.rateVal}</span> {applicationAnalysis.unit}</p>
                                                <p>질소(N) 투입: <span className="font-mono font-bold">{applicationAnalysis.appliedN.toFixed(2)}</span> g</p>
                                                <p>인산(P) 투입: <span className="font-mono">{applicationAnalysis.appliedP.toFixed(2)}</span> g</p>
                                                <p>칼륨(K) 투입: <span className="font-mono">{applicationAnalysis.appliedK.toFixed(2)}</span> g</p>
                                            </div>
                                        ) : (
                                            <p className="text-green-600 italic">권장 사용량 형식이 올바르지 않습니다.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            {/* --- Rate Calculator Helper --- */}
                            <details className="group">
                                <summary className="cursor-pointer text-sm font-semibold text-slate-600 mt-2 flex items-center gap-1 select-none">
                                    <span className="transition-transform group-open:rotate-90">▶</span> 권장 사용량 역산 계산기
                                </summary>
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mt-2 animate-fadeIn">
                                    <p className="text-xs text-yellow-800 mb-3">목표 성분량을 기준으로 제품 사용량을 계산하여 입력합니다.</p>
                                    <div className="flex items-end gap-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-yellow-700 mb-1">기준 성분</label>
                                            <select value={rateCalcTargetNutrient} onChange={(e) => setRateCalcTargetNutrient(e.target.value as any)} className="p-1.5 border rounded text-xs">
                                                <option value="N">질소(N)</option>
                                                <option value="P">인산(P)</option>
                                                <option value="K">칼륨(K)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-yellow-700 mb-1">목표 투입량(g/㎡)</label>
                                            <input type="number" value={rateCalcTargetAmount} onChange={(e) => setRateCalcTargetAmount(e.target.value)} className="p-1.5 border rounded w-20 text-xs" />
                                        </div>
                                        <button 
                                            onClick={handleApplyCalculatedRate} 
                                            className="px-3 py-1.5 bg-yellow-600 text-white text-xs font-bold rounded hover:bg-yellow-700 disabled:opacity-50"
                                            disabled={rateCalculationResult === null}
                                        >
                                            결과 적용: {rateCalculationResult ? rateCalculationResult.toFixed(2) : '-'}
                                        </button>
                                    </div>
                                </div>
                            </details>

                        </div>
                        <div className="p-6 border-t bg-slate-50 flex justify-end gap-3 sticky bottom-0">
                            <button onClick={() => setIsFertilizerModalOpen(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors">
                                취소
                            </button>
                            <button onClick={handleSaveFertilizer} className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-md transition-colors flex items-center gap-2">
                                <PlusIcon /> 저장하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {isBulkEditModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-4 border-b">
                            <h3 className="text-lg font-semibold">일괄 편집 ({selectedFertilizers.size}개 항목)</h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">대상 항목</label>
                                <select 
                                    value={bulkEditConfig.target} 
                                    onChange={(e) => setBulkEditConfig(prev => ({ ...prev, target: e.target.value as any }))}
                                    className="w-full p-2 border rounded-md"
                                >
                                    <option value="price">가격</option>
                                    <option value="stock">재고</option>
                                    <option value="lowStockAlertEnabled">재고 부족 알림</option>
                                </select>
                            </div>
                            
                            {bulkEditConfig.target === 'lowStockAlertEnabled' ? (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">설정 값</label>
                                    <select
                                        value={bulkEditConfig.value}
                                        onChange={(e) => setBulkEditConfig(prev => ({ ...prev, value: e.target.value }))}
                                        className="w-full p-2 border rounded-md"
                                    >
                                        <option value="">선택하세요</option>
                                        <option value="true">활성화 (ON)</option>
                                        <option value="false">비활성화 (OFF)</option>
                                    </select>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">변경 방식</label>
                                        <select 
                                            value={bulkEditConfig.operation} 
                                            onChange={(e) => setBulkEditConfig(prev => ({ ...prev, operation: e.target.value }))}
                                            className="w-full p-2 border rounded-md"
                                        >
                                            <option value="set">값 설정 (변경)</option>
                                            <option value="add">값 더하기 (+)</option>
                                            <option value="subtract">값 빼기 (-)</option>
                                            {bulkEditConfig.target === 'price' && (
                                                <>
                                                    <option value="percent_increase">퍼센트 인상 (%)</option>
                                                    <option value="percent_decrease">퍼센트 인하 (%)</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">값</label>
                                        <input 
                                            type="number" 
                                            value={bulkEditConfig.value} 
                                            onChange={(e) => setBulkEditConfig(prev => ({ ...prev, value: e.target.value }))}
                                            className="w-full p-2 border rounded-md" 
                                            placeholder="숫자 입력"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 rounded-b-lg">
                            <button onClick={() => setIsBulkEditModalOpen(false)} className="px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50">취소</button>
                            <button onClick={handleApplyBulkEdit} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">적용하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
