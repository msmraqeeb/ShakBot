import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send, Menu, Loader2, Sparkles, Mic, Image as ImageIcon, X } from 'lucide-react';
import { ChatSession, Message, Role, User, Attachment } from './types';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { LoginScreen } from './components/LoginScreen';
import { createGenAIChat, sendMessageStream, generateSessionTitle, sendImageEditMessage } from './services/geminiService';
import { logout } from './services/authService';

// Updated with the user provided Unsplash URL
const SHAKIL_AVATAR_URL = "https://images.unsplash.com/photo-1633957897986-70e83293f3ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMGF2YXRhcnxlbnwwfHx8fDE3NjQ2NTQwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080";

const App: React.FC = () => {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // --- State ---
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Attachment | null>(null);
  
  // Refs for scrolling and chat persistence
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInstanceRef = useRef<any>(null); // To store the GoogleGenAI Chat object
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---

  // Load User from Local Storage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('shakbot_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user from local storage");
      }
    }
  }, []);

  const getCurrentSession = useCallback(() => {
    return sessions.find(s => s.id === currentSessionId);
  }, [sessions, currentSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessions, currentSessionId, isLoading, selectedImage]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  // --- Auth Logic ---
  
  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    localStorage.setItem('shakbot_user', JSON.stringify(loggedInUser));
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    localStorage.removeItem('shakbot_user');
    setSessions([]); // Clear sessions on logout for security
    setCurrentSessionId(null);
  };

  // --- Image Upload Logic ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64String = reader.result as string;
              // Extract pure base64 and mime type
              const matches = base64String.match(/^data:(.+);base64,(.+)$/);
              if (matches) {
                  setSelectedImage({
                      type: 'image',
                      mimeType: matches[1],
                      data: matches[2]
                  });
              }
          };
          reader.readAsDataURL(file);
      }
      // Reset input so same file can be selected again if needed
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const clearImage = () => {
      setSelectedImage(null);
  };

  // --- Voice Input Logic ---
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input. Please try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    // Use the browser's language setting for better multilingual support
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    // Set continuous to true so it doesn't stop after the first sentence
    recognition.continuous = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let newText = '';
      // Iterate through results starting from resultIndex to handle continuous input correctly
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          newText += event.results[i][0].transcript;
        }
      }

      if (newText) {
        setInput((prev) => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${newText}` : newText;
        });
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        alert("Microphone access denied. Please allow microphone permissions in your browser settings.");
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // --- Core Logic ---

  const createNewSession = useCallback(() => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
    };
    setSessions(prev => [...prev, newSession]);
    setCurrentSessionId(newSession.id);
    chatInstanceRef.current = createGenAIChat([]); // Fresh Gemini Chat instance
    setIsSidebarOpen(false);
  }, []);

  // Restore Chat Instance when switching sessions
  useEffect(() => {
    if (!user) return; // Don't manage sessions if not logged in

    if (!currentSessionId) {
       if (sessions.length > 0) {
         setCurrentSessionId(sessions[sessions.length - 1].id);
       } else {
         createNewSession();
       }
       return;
    }

    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
      // Re-create the Gemini Chat object with the history of the selected session
      chatInstanceRef.current = createGenAIChat(session.messages);
    }
  }, [currentSessionId, createNewSession, sessions.length, user]);

  const handleSendMessage = async () => {
    if ((!input.trim() && !selectedImage) || !currentSessionId || isLoading) return;

    // Stop listening if sending message
    if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
    }

    const userText = input.trim();
    const attachedImage = selectedImage;
    
    // Clear inputs
    setInput('');
    setSelectedImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMessage: Message = {
      id: uuidv4(),
      role: Role.USER,
      text: userText || (attachedImage ? "Image uploaded" : ""),
      timestamp: Date.now(),
      attachment: attachedImage || undefined
    };

    // Update UI immediately
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: [...session.messages, userMessage]
        };
      }
      return session;
    }));

    setIsLoading(true);

    try {
      if (attachedImage) {
          // --- Multimodal Request (Nano Banana / Gemini 2.5 Flash Image) ---
          
          const result = await sendImageEditMessage(userText, attachedImage.data, attachedImage.mimeType);

          const botMessage: Message = {
              id: uuidv4(),
              role: Role.MODEL,
              text: result.text || (result.attachment ? "Here is the result." : "I processed the image."),
              timestamp: Date.now(),
              attachment: result.attachment
          };

          setSessions(prev => prev.map(session => {
            if (session.id === currentSessionId) {
              return { ...session, messages: [...session.messages, botMessage] };
            }
            return session;
          }));

      } else {
          // --- Standard Text Chat Request ---
          
          // Ensure chat instance exists
          if (!chatInstanceRef.current) {
            chatInstanceRef.current = createGenAIChat(getCurrentSession()?.messages || []);
          }

          // Placeholder for bot message
          const botMessageId = uuidv4();
          const botMessagePlaceholder: Message = {
            id: botMessageId,
            role: Role.MODEL,
            text: '',
            timestamp: Date.now()
          };

          setSessions(prev => prev.map(session => {
            if (session.id === currentSessionId) {
              return { ...session, messages: [...session.messages, botMessagePlaceholder] };
            }
            return session;
          }));

          // Stream response
          let accumulatedText = '';
          const stream = await sendMessageStream(chatInstanceRef.current, userText);

          for await (const chunk of stream) {
            accumulatedText += chunk;
            
            setSessions(prev => prev.map(session => {
              if (session.id === currentSessionId) {
                const updatedMessages = session.messages.map(msg => 
                  msg.id === botMessageId ? { ...msg, text: accumulatedText } : msg
                );
                return { ...session, messages: updatedMessages };
              }
              return session;
            }));
          }
      }

      // Generate Title if this was the first turn
      const currentSession = getCurrentSession();
      if (currentSession && currentSession.messages.length <= 1) { 
         generateSessionTitle(userText || "Image Edit").then(title => {
             setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title } : s));
         });
      }

    } catch (error) {
      console.error("Failed to send message", error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: Role.MODEL,
        text: "I apologize, but I encountered an error communicating with my servers. Please try again.",
        timestamp: Date.now(),
        isError: true
      };
      
      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          return { ...session, messages: [...session.messages, errorMessage] };
        }
        return session;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enable enter to go to new line (default behavior).
    // Send message only on Ctrl + Enter or Cmd + Enter.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    if (currentSessionId === id) {
      setCurrentSessionId(newSessions.length > 0 ? newSessions[newSessions.length - 1].id : null);
    }
  };

  const currentSession = getCurrentSession();

  // --- Auth Gate ---
  if (!user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} isLoading={isAuthLoading} />;
  }

  // --- Main App Render ---
  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      <Sidebar 
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={setCurrentSessionId}
        onNewChat={createNewSession}
        onDeleteSession={deleteSession}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Mobile Header */}
        <div className="md:hidden h-16 bg-blue-900 border-b border-blue-800 flex items-center px-4 justify-between z-10 shrink-0 shadow-md">
            <button onClick={() => setIsSidebarOpen(true)} className="text-white p-2">
                <Menu />
            </button>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border border-yellow-400 overflow-hidden">
                     <img src={SHAKIL_AVATAR_URL} alt="S" className="w-full h-full object-cover" />
                </div>
                <span className="text-white font-bold text-lg">ShakBot</span>
            </div>
            <div className="w-8"></div> {/* Spacer for balance */}
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4">
          <div className="max-w-3xl mx-auto min-h-full flex flex-col">
            
            {!currentSession || currentSession.messages.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center opacity-80 p-8">
                  <div className="w-32 h-32 bg-red-600 rounded-full flex items-center justify-center mb-6 shadow-xl border-4 border-yellow-400 overflow-hidden">
                      <img src={SHAKIL_AVATAR_URL} alt="Shakil" className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-3xl font-bold text-blue-900 mb-2">Hello, {user.name.split(' ')[0]}!</h2>
                  <p className="text-lg text-slate-600 max-w-md leading-relaxed mb-6">
                    I'm Shakil, your multilingual AI assistant. Ask me anything, or upload an image to edit it with my Nano Banana powers!
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
                      {["Write a story about a kryptonite planet", "Translate 'Hope' into 5 languages", "How do I bake a cake?", "Debug this React code"].map((suggestion, idx) => (
                          <button 
                            key={idx}
                            onClick={() => {
                                setInput(suggestion);
                                if(textareaRef.current) textareaRef.current.focus();
                            }}
                            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-sm text-left text-blue-900 hover:border-yellow-400 hover:shadow-md transition-all"
                          >
                             <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-yellow-500" />
                                {suggestion}
                             </div>
                          </button>
                      ))}
                  </div>
               </div>
            ) : (
              <>
                {currentSession.messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 text-slate-500 text-sm ml-2 animate-pulse">
                     <Loader2 className="animate-spin" size={16} />
                     <span>Shakil is thinking...</span>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
              </>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white/80 backdrop-blur-md border-t border-slate-200">
            <div className={`max-w-3xl mx-auto flex flex-col gap-2`}>
                
                {/* Image Preview */}
                {selectedImage && (
                    <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg w-fit border border-slate-200 animate-in fade-in slide-in-from-bottom-2">
                        <div className="h-16 w-16 rounded-md overflow-hidden bg-slate-200">
                            <img 
                                src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} 
                                alt="Preview" 
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-600">Image attached</span>
                            <span className="text-[10px] text-slate-400">Ready to edit/analyze</span>
                        </div>
                        <button 
                            onClick={clearImage}
                            className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition-colors ml-2"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                <div className={`
                flex items-end gap-2 bg-slate-100 p-2 rounded-3xl border transition-all shadow-sm
                ${isListening ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'}
                `}>
                    
                    {/* File Input (Hidden) */}
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden" 
                        accept="image/*"
                        onChange={handleFileSelect}
                    />

                    {/* Image Upload Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            p-3 rounded-full flex items-center justify-center transition-all duration-300
                            ${selectedImage 
                                ? 'bg-blue-100 text-blue-600' 
                                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}
                        `}
                        title="Upload image"
                        disabled={isListening}
                    >
                        <ImageIcon size={20} />
                    </button>

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isListening ? "Listening..." : "Ask Shakil anything..."}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 placeholder-slate-400 resize-none py-3 px-2 max-h-32 min-h-[44px]"
                        rows={1}
                    />
                    
                    {/* Microphone Button */}
                    <button
                        onClick={toggleListening}
                        className={`
                            p-3 rounded-full flex items-center justify-center transition-all duration-300
                            ${isListening 
                                ? 'bg-red-600 text-yellow-300 shadow-[0_0_15px_rgba(220,38,38,0.6)] scale-110' 
                                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}
                        `}
                        title={isListening ? "Stop listening" : "Start voice input"}
                    >
                        <Mic size={20} className={isListening ? "animate-pulse" : ""} />
                    </button>

                    <button
                        onClick={handleSendMessage}
                        disabled={(!input.trim() && !selectedImage) || isLoading}
                        className={`
                            p-3 rounded-full flex items-center justify-center transition-all duration-200
                            ${(!input.trim() && !selectedImage) || isLoading 
                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                                : 'bg-red-600 hover:bg-red-700 text-yellow-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0'}
                        `}
                    >
                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} fill="currentColor" />}
                    </button>
                </div>
            </div>
            <div className="text-center mt-2">
                 <p className="text-[10px] text-slate-400">Shakil can make mistakes. Verify important information.</p>
            </div>
        </div>

      </div>
    </div>
  );
};

export default App;