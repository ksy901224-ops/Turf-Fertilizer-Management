
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from '@google/genai';
import { ChatMessage } from './types';
import { CloseIcon, SendIcon } from './icons';

interface ChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Chatbot: React.FC<ChatbotProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        chatRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: {
            systemInstruction: `당신은 잔디 관리 전문 AI agronomist "TurfBot"입니다. 골프장 관리자들에게 전문적이고 실용적인 비료 처방 및 잔디 병충해 조언을 한국어로 친절하게 제공하세요. 이전 대화 맥락을 기억하여 답변하세요.`,
          }
        });
        if (messages.length === 0) {
            setMessages([{ role: 'model', content: '안녕하세요! TurfBot입니다. 잔디 관리나 비료 처방에 대해 궁금한 점을 물어보세요.' }]);
        }
      } catch (e) {
        console.error("AI Init error:", e);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
        if (!chatRef.current) throw new Error("AI not ready");
        const response = await chatRef.current.sendMessage({ message: currentInput });
        setMessages(prev => [...prev, { role: 'model', content: response.text ?? '답변을 생성하지 못했습니다.' }]);
    } catch (err) {
        console.error(err);
        setMessages(prev => [...prev, { role: 'model', content: '연결 오류가 발생했습니다. 다시 시도해주세요.' }]);
    } finally {
        setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-end sm:items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b flex justify-between items-center bg-indigo-600 text-white font-bold">
          <h2>TurfBot AI 전문가</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors"><CloseIcon /></button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm font-medium shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white p-3 rounded-2xl shadow-sm animate-pulse text-xs text-slate-400">답변 생성 중...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t bg-white">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="메시지를 입력하세요..."
              className="flex-1 p-3 bg-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
            <button disabled={isLoading || !input.trim()} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <SendIcon className="w-5 h-5" />
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
};
