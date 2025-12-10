
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    const result = await api.validateUser(username.trim(), password);

    if (result === 'pending') {
        setError('계정 승인 대기 중입니다. 관리자의 승인을 기다려주세요.');
    } else if (result) {
      onLogin(result.username);
    } else {
      setError('사용자 이름 또는 비밀번호가 잘못되었습니다.');
    }
  };
  
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (username.trim().toLowerCase() === 'admin') {
        setError('\'admin\'은 예약된 사용자 이름입니다. 다른 이름을 사용해주세요.');
        return;
    }

    const result = await api.createUser(username.trim(), password, golfCourse.trim());
    
    if (result === 'exists') {
        setError('이미 사용 중인 사용자 이름입니다.');
    } else if (result === 'invalid') {
        setError('사용자 이름, 골프장 명, 비밀번호를 모두 입력해주세요.');
    } else if (result) {
        // Successful signup
        setInfoMessage('회원가입이 완료되었습니다. 관리자 승인 후 로그인이 가능합니다.');
        setIsSigningUp(false); // Switch back to login view
        setPassword('');
        setConfirmPassword('');
    } else {
        setError('알 수 없는 오류가 발생했습니다.');
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
    <div className="flex justify-center items-center min-h-screen bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-4">{isSigningUp ? '회원가입' : '로그인'}</h1>
        <p className="text-center text-sm text-slate-500 mb-6">
          {isSigningUp 
            ? '새 계정을 만들어 데이터를 관리하세요.'
            : '이 앱은 사용자별로 데이터를 분리하여 저장합니다.'
          }
        </p>

        {infoMessage && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-md border border-green-200">
                {infoMessage}
            </div>
        )}

        {isSigningUp ? (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="username-signup" className="block text-sm font-medium text-slate-700">사용자 이름</label>
              <input
                id="username-signup"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="예: 김그린"
                required
              />
            </div>
            <div>
              <label htmlFor="golfcourse-signup" className="block text-sm font-medium text-slate-700">골프장 명</label>
              <input
                id="golfcourse-signup"
                type="text"
                value={golfCourse}
                onChange={(e) => setGolfCourse(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="예: 이앤엘골프클럽"
                required
              />
            </div>
            <div>
              <label htmlFor="password-signup" className="block text-sm font-medium text-slate-700">비밀번호</label>
              <input
                id="password-signup"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="비밀번호"
                required
              />
            </div>
             <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">비밀번호 확인</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="비밀번호 다시 입력"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
              회원가입 (관리자 승인 필요)
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username-login" className="block text-sm font-medium text-slate-700">사용자 이름</label>
              <input
                id="username-login"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="사용자 이름"
                required
              />
            </div>
            <div>
              <label htmlFor="password-login" className="block text-sm font-medium text-slate-700">비밀번호</label>
              <input
                id="password-login"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="비밀번호"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
              로그인
            </button>
          </form>
        )}
        <div className="mt-6 text-center text-sm">
          <button onClick={toggleForm} className="font-medium text-blue-600 hover:text-blue-500">
            {isSigningUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
          </button>
        </div>
      </div>
    </div>
  );
};
