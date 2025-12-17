
import React, { useState } from 'react';
import * as api from './api';

interface LoginProps {
  onLogin: (username: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [golfCourse, setGolfCourse] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setIsLoading(true);
    
    try {
        const result = await api.validateUser(username.trim(), password);

        if (result === 'pending') {
            setError('계정 승인 대기 중입니다. 관리자의 승인을 기다려주세요.');
        } else if (result) {
            onLogin(result.username);
        } else {
            setError('사용자 이름 또는 비밀번호가 잘못되었습니다.');
        }
    } catch (err) {
        setError('로그인 중 오류가 발생했습니다.');
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    
    if (!username || !password || !golfCourse) {
        setError('모든 필드를 입력해주세요.');
        setIsLoading(false);
        return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      setIsLoading(false);
      return;
    }
    if (username.trim().toLowerCase() === 'admin') {
        setError('\'admin\'은 예약된 사용자 이름입니다. 다른 이름을 사용해주세요.');
        setIsLoading(false);
        return;
    }
    
    setIsLoading(true);

    try {
        const result = await api.createUser(username.trim(), password, golfCourse.trim());
        
        if (result === 'exists') {
            setError('이미 사용 중인 사용자 이름입니다.');
        } else if (result === 'invalid') {
            setError('사용자 이름, 골프장 명, 비밀번호를 모두 입력해주세요.');
        } else if (result) {
            // Successful signup
            setInfoMessage('회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인이 가능합니다.');
            setIsSigningUp(false); // Switch back to login view
            setPassword('');
            setConfirmPassword('');
        } else {
            setError('알 수 없는 오류가 발생했습니다.');
        }
    } catch (err) {
        setError('회원가입 중 오류가 발생했습니다.');
    } finally {
        setIsLoading(false);
    }
  };

  const clearForm = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setGolfCourse('');
    setError('');
    setInfoMessage('');
  };

  const toggleForm = () => {
    clearForm();
    setIsSigningUp(!isSigningUp);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-100 p-4 font-sans">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-sm border border-slate-200">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-slate-800 mb-2">
                {isSigningUp ? '회원가입' : '로그인'}
            </h1>
            <p className="text-sm text-slate-500">
            {isSigningUp 
                ? '새 계정을 만들어 데이터를 관리하세요.'
                : 'AI Turf Management에 오신 것을 환영합니다.'
            }
            </p>
        </div>

        {infoMessage && (
            <div className="mb-6 p-4 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 flex items-start gap-2">
                <span>✅</span>
                <span>{infoMessage}</span>
            </div>
        )}

        {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-start gap-2">
                <span>⚠️</span>
                <span>{error}</span>
            </div>
        )}

        {isSigningUp ? (
          <form onSubmit={handleSignUp} className="space-y-5">
            <div>
              <label htmlFor="username-signup" className="block text-sm font-bold text-slate-700 mb-1">사용자 이름</label>
              <input
                id="username-signup"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                placeholder="예: 김그린"
                required
              />
            </div>
            <div>
              <label htmlFor="golfcourse-signup" className="block text-sm font-bold text-slate-700 mb-1">골프장 명</label>
              <input
                id="golfcourse-signup"
                type="text"
                value={golfCourse}
                onChange={(e) => setGolfCourse(e.target.value)}
                className="block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                placeholder="예: 이앤엘골프클럽"
                required
              />
            </div>
            <div>
              <label htmlFor="password-signup" className="block text-sm font-bold text-slate-700 mb-1">비밀번호</label>
              <input
                id="password-signup"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                placeholder="비밀번호 입력"
                required
              />
            </div>
             <div>
              <label htmlFor="confirm-password" className="block text-sm font-bold text-slate-700 mb-1">비밀번호 확인</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                placeholder="비밀번호 다시 입력"
                required
              />
            </div>
            <button 
                type="submit" 
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? '처리 중...' : '회원가입 신청'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="username-login" className="block text-sm font-bold text-slate-700 mb-1">사용자 이름</label>
              <input
                id="username-login"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                className="block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                placeholder="아이디를 입력하세요"
                required
              />
            </div>
            <div>
              <label htmlFor="password-login" className="block text-sm font-bold text-slate-700 mb-1">비밀번호</label>
              <input
                id="password-login"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                placeholder="비밀번호를 입력하세요"
                required
              />
            </div>
            <button 
                type="submit" 
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        )}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-600">
            {isSigningUp ? '이미 계정이 있으신가요?' : '아직 계정이 없으신가요?'}
          </p>
          <button 
            onClick={toggleForm} 
            className="mt-2 font-bold text-blue-600 hover:text-blue-800 transition-colors text-sm hover:underline"
          >
            {isSigningUp ? '로그인 화면으로 이동' : '새 계정 만들기'}
          </button>
        </div>
      </div>
    </div>
  );
};
