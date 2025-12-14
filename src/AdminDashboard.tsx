
import React, { useState, useEffect, useMemo } from 'react';
import * as api from './api';
import * as XLSX from 'xlsx';
import { UserDataSummary, Fertilizer, LogEntry } from './types';
import { LogoutIcon, DashboardIcon, UsersIcon, PlusIcon, TrashIcon, CloseIcon, ClipboardListIcon, SparklesIcon, DownloadIcon, PencilIcon, UploadIcon } from './icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FERTILIZER_TYPE_GROUPS } from './constants';

interface AdminDashboardProps {
    user: string;
    onLogout: () => void;
}

// --- Helper for Excel Export ---
const exportUserLogsToExcel = (userData: UserDataSummary) => {
    if (!userData.logs || userData.logs.length === 0) {
        alert(`${userData.username}님의 기록된 데이터가 없습니다.`);
        return;
    }

    const dataToExport = userData.logs.map(log => {
        const row: any = {
            '날짜': log.date,
            '사용자': userData.username,
            '골프장': userData.golfCourse,
            '제품명': log.product,
            '구분': log.usage,
            '면적(㎡)': log.area,
            '사용량': `${log.applicationRate}${log.applicationUnit}`,
            '총 비용(원)': Math.round(log.totalCost),
        };
        
        if (log.topdressing) {
            row['배토(mm)'] = log.topdressing;
        }

        const NUTRIENTS = ['N','P','K','Ca','Mg','S','Fe','Mn','Zn','Cu','B','Mo','Cl','Na','Si','Ni','Co','V'];
        NUTRIENTS.forEach(n => {
            if (log.nutrients && log.nutrients[n] > 0) {
                row[`${n} (g)`] = log.nutrients[n];
            }
        });
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '시비 일지');
    XLSX.writeFile(workbook, `${userData.username}_${userData.golfCourse}_시비일지.xlsx`);
};

// --- User Detail Modal ---
interface UserDetailModalProps {
    userData: UserDataSummary;
    onClose: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const UserDetailModal: React.FC<UserDetailModalProps> = ({ userData, onClose }) => {
    const logs = userData.logs || [];
    
    // Simple cost calculation for demo
    const totalCost = logs.reduce((sum, l) => sum + l.totalCost, 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-800">{userData.username} ({userData.golfCourse})</h2>
                    <div className="flex gap-2">
                        <button onClick={() => exportUserLogsToExcel(userData)} className="px-3 py-1 bg-green-600 text-white rounded text-sm">엑셀 저장</button>
                        <button onClick={onClose}><CloseIcon /></button>
                    </div>
                </div>
                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-blue-50 p-4 rounded">
                            <p className="text-xs text-blue-800 font-bold">총 비용</p>
                            <p className="text-xl font-bold text-blue-900">{Math.round(totalCost).toLocaleString()}원</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded">
                            <p className="text-xs text-slate-600 font-bold">총 기록 수</p>
                            <p className="text-xl font-bold text-slate-800">{logs.length}건</p>
                        </div>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100">
                            <tr>
                                <th className="p-2">날짜</th>
                                <th className="p-2">제품</th>
                                <th className="p-2 text-right">비용</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.id} className="border-b">
                                    <td className="p-2">{log.date}</td>
                                    <td className="p-2">{log.product}</td>
                                    <td className="p-2 text-right">{Math.round(log.totalCost).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    const [allUsersData, setAllUsersData] = useState<UserDataSummary[]>([]);
    const [masterFertilizers, setMasterFertilizers] = useState<Fertilizer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<UserDataSummary | null>(null);

    // Real-time Subscriptions
    useEffect(() => {
        setIsLoading(true);
        
        // 1. Subscribe to Users Collection
        const unsubUsers = api.subscribeToUsers((users) => {
            // 2. Subscribe to All App Data (Logs, etc.)
            // Note: In a real scalable app, we wouldn't fetch ALL logs at once.
            // But for this dashboard view, we aggregate.
            const unsubAppData = api.subscribeToAllAppData((appDataMap) => {
                const summary: UserDataSummary[] = users.map(u => {
                    if (u.username === 'admin') return null;
                    const data = appDataMap[u.username] || {};
                    const logs = data.logs || [];
                    const fertilizers = data.fertilizers || [];
                    const totalCost = logs.reduce((sum: number, l: any) => sum + (l.totalCost || 0), 0);
                    let lastActivity = null;
                    if (logs.length > 0) {
                        lastActivity = [...logs].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date;
                    }
                    return {
                        username: u.username,
                        golfCourse: u.golfCourse,
                        isApproved: u.isApproved ?? true,
                        logs,
                        fertilizers,
                        logCount: logs.length,
                        totalCost,
                        lastActivity
                    };
                }).filter(Boolean) as UserDataSummary[];
                
                setAllUsersData(summary);
                
                // Update master list from admin appData
                const adminData = appDataMap['admin'];
                if (adminData && adminData.fertilizers) {
                    setMasterFertilizers(adminData.fertilizers);
                }
                
                setIsLoading(false);
            });
            
            return () => unsubAppData();
        });

        return () => unsubUsers();
    }, []);

    const handleApprove = async (username: string) => {
        if(window.confirm('승인하시겠습니까?')) await api.approveUser(username);
    };

    const handleDelete = async (username: string) => {
        if(window.confirm('사용자를 삭제하시겠습니까?')) await api.deleteUser(username);
    };

    if (isLoading) return <div className="p-8 text-center">Loading Admin Data...</div>;

    const pendingUsers = allUsersData.filter(u => !u.isApproved);
    const approvedUsers = allUsersData.filter(u => u.isApproved);

    return (
        <div className="min-h-screen bg-slate-100 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <header className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                    <h1 className="text-2xl font-bold flex items-center gap-2"><DashboardIcon /> 관리자 대시보드</h1>
                    <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-200 rounded hover:bg-slate-300"><LogoutIcon /> 로그아웃</button>
                </header>

                {pendingUsers.length > 0 && (
                    <section className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded shadow">
                        <h2 className="text-lg font-bold text-amber-800 mb-4">⏳ 승인 대기 ({pendingUsers.length})</h2>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {pendingUsers.map(u => (
                                <div key={u.username} className="bg-white p-4 rounded border shadow-sm">
                                    <p className="font-bold">{u.username}</p>
                                    <p className="text-sm text-slate-500">{u.golfCourse}</p>
                                    <div className="mt-3 flex gap-2">
                                        <button onClick={() => handleApprove(u.username)} className="flex-1 bg-green-500 text-white py-1 rounded text-sm">승인</button>
                                        <button onClick={() => handleDelete(u.username)} className="flex-1 bg-red-500 text-white py-1 rounded text-sm">거절</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="p-4 border-b bg-slate-50"><h2 className="font-bold text-slate-700">사용자 목록 ({approvedUsers.length})</h2></div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600">
                            <tr>
                                <th className="p-3">사용자</th>
                                <th className="p-3">골프장</th>
                                <th className="p-3">최근 활동</th>
                                <th className="p-3">기록 수</th>
                                <th className="p-3">총 비용</th>
                                <th className="p-3">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {approvedUsers.map(u => (
                                <tr key={u.username} className="border-b hover:bg-slate-50">
                                    <td className="p-3 font-medium">{u.username}</td>
                                    <td className="p-3">{u.golfCourse}</td>
                                    <td className="p-3 text-slate-500">{u.lastActivity || '-'}</td>
                                    <td className="p-3">{u.logCount}</td>
                                    <td className="p-3">{Math.round(u.totalCost).toLocaleString()}원</td>
                                    <td className="p-3 flex gap-2">
                                        <button onClick={() => setSelectedUser(u)} className="px-2 py-1 border rounded hover:bg-slate-100">상세</button>
                                        <button onClick={() => handleDelete(u.username)} className="text-red-500 hover:text-red-700"><TrashIcon /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </div>
            {selectedUser && <UserDetailModal userData={selectedUser} onClose={() => setSelectedUser(null)} />}
        </div>
    );
};
