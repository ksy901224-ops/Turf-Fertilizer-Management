import React from 'react';

export const LoadingSpinner = () => (
    <div className="flex justify-center items-center min-h-screen bg-slate-100">
        <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
            <p className="mt-4 text-lg text-slate-700 font-semibold">데이터를 불러오는 중...</p>
        </div>
    </div>
);