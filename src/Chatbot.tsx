
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
  const [error, setError] = useState<string | null>(null);
  
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      const apiKey = process.env.API_KEY || '';
      const ai = new GoogleGenAI({apiKey});
      chatRef.current = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: `You are "TurfBot", a specialized AI agronomist for a turf fertilizer management application. Your expertise covers:
1.  **General Turf Management:** Lawn care, fertilization, etc.
2.  **Grass Growth Cycles:** Detailed knowledge of growth periods for both cool-season (e.g., Bentgrass, Kentucky Bluegrass) and warm-season (e.g., Zoysia grass) turf.
3.  **Disease Diagnosis:** Identifying common turf diseases from user descriptions of symptoms (e.g., brown patch, dollar spot, fairy ring), including their causes.
4.  **Pest and Disease Control:** Recommending specific, practical control methods (both chemical and cultural) for various pests and diseases.

You MUST remember the user's previous questions to provide context-aware, follow-up answers.
Your goal is to provide professional, clear, and actionable advice.
Always respond in Korean.`,
        }
      });
      setMessages([{ role: 'model', content: '안녕하세요! 저는 잔디 관리 전문 AI, TurfBot입니다. 잔디 생육 주기, 병충해 진단 등 무엇이든 물어보세요.' }]);
    } else {
        setMessages([]);
        setInput('');
        setIsLoading(false);
        setError(null);
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
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
        if (!chatRef.current) {
            throw new Error("Chat is not initialized.");
        }
        const response = await chatRef.current.sendMessage({ message: input });
        const modelMessage: ChatMessage = { role: 'model', content: response.text ?? '죄송합니다, 답변을 생성하지 못했습니다.' };
        setMessages(prev => [...prev, modelMessage]);

    } catch (err) {
        console.error("Error sending message to AI:", err);
        const errorMessage = '죄송합니다, 답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        setMessages(prev => [...prev, { role: 'model', content: errorMessage }]);
        setError(errorMessage);
    } finally {
        setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-end sm:items-center" onClick={onClose}>
      <div 
        className="bg-white rounded-t-lg sm:rounded-lg shadow-xl w-full max-w-lg h-[80vh] max-h-[700px] flex flex-col transform transition-transform duration-300 ease-in-out"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-lg">
          <h2 className="text-lg font-semibold text-slate-800">AI 챗봇 (TurfBot)</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200" aria-label="Close chat">
            <CloseIcon />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xs md:max-w-md p-3 rounded-2xl ${
                  msg.role === 'user' 
                    ? 'bg-purple-600 text-white rounded-br-none' 
                    : 'bg-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                <p className="text-sm" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br />') }} />
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
                 <div className="bg-slate-200 text-slate-800 rounded-2xl p-3 rounded-bl-none">
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                    </div>
                </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t bg-white rounded-b-lg">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="메시지를 입력하세요..."
              className="w-full p-3 border rounded-full focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
              disabled={isLoading}
              aria-label="Chat input"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-purple-600 text-white p-3 rounded-full hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
};
