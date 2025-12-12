import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send, Menu, Loader2, Sparkles, Mic, X, ImagePlus, Palette, Zap, Brain, MicOff } from 'lucide-react';
import { ChatSession, Message, Role, User } from './types';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { LoginScreen } from './components/LoginScreen';
import { AdminPanel } from './components/AdminPanel';
import HeroicBackground from './components/HeroicBackground';
import { createGenAIChat, sendMessageStream, generateSessionTitle, refineUserMemory, generateImageEdit } from './services/geminiService';
import { logout, getCurrentUser } from './services/authService';
import * as dbService from './services/dbService';

// Updated with the user provided Unsplash URL
const SHAKIL_AVATAR_URL = "https://images.unsplash.com/photo-1633957897986-70e83293f3ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMGF2YXRhcnxlbnwwfHx8fDE3NjQ2NTQwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080";

interface SelectedImage {
    data: string;
    mimeType: string;
}

const App: React.FC = () => {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- State ---
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Voice Input State
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState(''); // Text currently being spoken
  
  const [userMemory, setUserMemory] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [isImageGenMode, setIsImageGenMode] = useState(false);
  
  // Model Selection State
  const [currentModel, setCurrentModel] = useState<'gemini-2.5-flash' | 'gemini-3-pro-preview'>('gemini-2.5-flash');
  
  // Refs for scrolling and chat persistence
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInstanceRef = useRef<any>(null); // To store the GoogleGenAI Chat object
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Voice Refs - The "Hard Code" Logic
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false); // Sync ref to track intent
  const silenceTimerRef = useRef<any>(null); // To detect when user stops speaking
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---

  // Check for existing session on mount
  useEffect(() => {
    getCurrentUser().then(foundUser => {
        if (foundUser) {
            handleLoginSuccess(foundUser);
        } else {
            setIsAuthLoading(false);
        }
    });
  }, []);

  // Helper to load memory and sessions for a specific user from Supabase
  const loadUserData = async (userData: User) => {
    setIsAuthLoading(true);
    try {
        // 1. Load Memory
        const memory = await dbService.fetchUserMemory(userData.id);
        setUserMemory(memory);

        // 2. Load Chat History
        const loadedSessions = await dbService.fetchUserSessions(userData.id);
        setSessions(loadedSessions);
        
        if (loadedSessions.length > 0) {
            setCurrentSessionId(loadedSessions[loadedSessions.length - 1].id);
        }
    } catch (e) {
        console.error("Failed to load user data", e);
    } finally {
        setIsAuthLoading(false);
    }
  };

  const getCurrentSession = useCallback(() => {
    return sessions.find(s => s.id === currentSessionId);
  }, [sessions, currentSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessions, currentSessionId, isLoading]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input, interimTranscript]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  // --- Auth Logic ---
  
  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    
    // Clear previous state
    setSessions([]);
    setCurrentSessionId(null);
    setUserMemory('');

    if (!loggedInUser.isAdmin) {
        loadUserData(loggedInUser);
    } else {
        setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setUserMemory('');
    setSessions([]); 
    setCurrentSessionId(null);
  };

  // --- Voice Input Logic ---

  const stopListening = useCallback(() => {
    isListeningRef.current = false; 
    
    if (recognitionRef.current) {
        try {
            recognitionRef.current.stop();
        } catch(e) {}
    }
    
    if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
    }
    
    setIsListening(false);
    setInterimTranscript('');
    
    if (navigator.vibrate) navigator.vibrate(50);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    if (recognitionRef.current) {
         isListeningRef.current = false;
         recognitionRef.current.onend = null;
         try { recognitionRef.current.stop(); } catch(e) {}
    }

    if (navigator.vibrate) navigator.vibrate(50);

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false; 
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
            stopListening(); 
        }, 2500);

        let finalTranscript = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        if (finalTranscript) {
            setInput(prev => {
                const trimmed = prev.trim();
                const spacer = trimmed.length > 0 && !trimmed.endsWith(' ') ? ' ' : '';
                return trimmed + spacer + finalTranscript;
            });
        }
        
        setInterimTranscript(interim);
    };

    recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
        
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
             stopListening();
        }, 5000);
    };

    recognition.onerror = (event: any) => {
        console.warn("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
            stopListening();
            alert("Microphone permission denied.");
        }
    };

    recognition.onend = () => {
        if (isListeningRef.current) {
            try {
                recognition.start();
            } catch (e) {
                stopListening();
            }
        } else {
            setIsListening(false);
            setInterimTranscript('');
        }
    };

    recognitionRef.current = recognition;
    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start", e);
    }

  }, [stopListening]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // --- Image Input Logic ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const data = loadEvent.target?.result as string;
        setSelectedImage({
            data: data,
            mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  // --- Core Logic ---

  const createNewSession = useCallback(async () => {
    if (!user) return;
    const newId = uuidv4();
    const title = 'New Conversation';
    
    // Optimistic UI update
    const newSession: ChatSession = {
      id: newId,
      title: title,
      messages: [],
      createdAt: Date.now(),
    };
    setSessions(prev => [...prev, newSession]);
    setCurrentSessionId(newId);
    setIsSidebarOpen(false);

    // Save to DB
    await dbService.createSession(user.id, newId, title);

    chatInstanceRef.current = createGenAIChat(currentModel, [], userMemory); 
  }, [userMemory, currentModel, user]);

  // Restore Chat Instance when switching sessions
  useEffect(() => {
    if (!user || user.isAdmin) return; 

    if (!currentSessionId) {
       return;
    }

    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
      chatInstanceRef.current = createGenAIChat(currentModel, session.messages, userMemory);
    }
  }, [currentSessionId, sessions, user, userMemory, currentModel]);

  const handleSendMessage = async () => {
    if (!user) return;

    // If no session exists, create one first
    if (!currentSessionId && sessions.length === 0) {
        // Manually trigger for the new session logic
        const newId = uuidv4();
        const title = 'New Conversation';
        
        // Optimistic UI
        const newSession: ChatSession = {
            id: newId,
            title: title,
            messages: [],
            createdAt: Date.now(),
        };
        setSessions(prev => [...prev, newSession]);
        setCurrentSessionId(newId);
        
        // DB
        await dbService.createSession(user.id, newId, title);
        
        chatInstanceRef.current = createGenAIChat(currentModel, [], userMemory);
        await processMessage(newId, newSession.messages);
        return;
    }
    
    if (currentSessionId) {
        const currentSession = sessions.find(s => s.id === currentSessionId);
        await processMessage(currentSessionId, currentSession?.messages || []);
    }
  };

  const processMessage = async (sessionId: string, currentMessages: Message[]) => {
    if ((!input.trim() && !selectedImage) || isLoading || !user) return;

    if (isListening) {
        stopListening();
    }

    const userText = input.trim();
    const attachedImage = selectedImage; 
    const usingImageModel = isImageGenMode || !!attachedImage;

    // Reset Input UI
    setInput('');
    setSelectedImage(null);
    if (isImageGenMode) setIsImageGenMode(false); 
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMessage: Message = {
      id: uuidv4(),
      role: Role.USER,
      text: userText,
      imageUrl: attachedImage?.data,
      timestamp: Date.now()
    };

    // Update UI immediately
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        return {
          ...session,
          messages: [...session.messages, userMessage]
        };
      }
      return session;
    }));

    setIsLoading(true);

    // Save User Message to DB
    await dbService.saveMessage(sessionId, userMessage);

    try {
      if (usingImageModel) {
        // --- Image Mode ---
        const response = await generateImageEdit(userText, attachedImage?.data, attachedImage?.mimeType);

        const botMessage: Message = {
            id: uuidv4(),
            role: Role.MODEL,
            text: response.text || (response.imageUrl ? (attachedImage ? "Here is the edited image:" : "Here is the generated image:") : "Done."),
            imageUrl: response.imageUrl,
            timestamp: Date.now()
        };

        setSessions(prev => prev.map(session => {
            if (session.id === sessionId) {
                return { ...session, messages: [...session.messages, botMessage] };
            }
            return session;
        }));
        
        await dbService.saveMessage(sessionId, botMessage);

      } else {
         // --- Text Mode ---
         chatInstanceRef.current = createGenAIChat(currentModel, currentMessages, userMemory);

        const botMessageId = uuidv4();
        const botMessagePlaceholder: Message = {
            id: botMessageId,
            role: Role.MODEL,
            text: '',
            timestamp: Date.now()
        };

        setSessions(prev => prev.map(session => {
            if (session.id === sessionId) {
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
            if (session.id === sessionId) {
                const updatedMessages = session.messages.map(msg => 
                msg.id === botMessageId ? { ...msg, text: accumulatedText } : msg
                );
                return { ...session, messages: updatedMessages };
            }
            return session;
            }));
        }

        // Save Bot Message to DB
        const finalBotMessage: Message = {
            ...botMessagePlaceholder,
            text: accumulatedText
        };
        await dbService.saveMessage(sessionId, finalBotMessage);

        // Refine memory
        if (user) {
            refineUserMemory(userMemory, userText, accumulatedText).then(async newMemory => {
                if (newMemory !== userMemory) {
                    console.log("Memory updated");
                    setUserMemory(newMemory);
                    await dbService.saveUserMemory(user.id, newMemory);
                }
            });
        }
      }

      // Generate title if needed
      setSessions(prev => {
          const s = prev.find(s => s.id === sessionId);
          if (s && s.messages.length === 2) {
              generateSessionTitle(userText).then(async title => {
                  setSessions(curr => curr.map(x => x.id === sessionId ? { ...x, title } : x));
                  await dbService.updateSessionTitle(sessionId, title);
              });
          }
          return prev;
      });

    } catch (error: any) {
      console.error("Failed to send message", error);
      
      let errorText = "I apologize, but I encountered an error. Please try again.";
      
      // Robust Error Parsing for 429 / Quota
      let errorMessageString = '';
      if (error) {
          if (typeof error === 'string') {
            errorMessageString = error;
          } else if (error instanceof Error) {
            errorMessageString = error.message;
          } 
          try {
            const jsonString = JSON.stringify(error);
            errorMessageString += ' ' + jsonString;
          } catch (e) {
            // ignore
          }
      }
      
      const errorCode = error?.error?.code || error?.status || error?.code;
      const errorStatus = error?.error?.status || error?.statusText;

      if (errorMessageString.includes('429') || errorCode === 429 || errorStatus === 'RESOURCE_EXHAUSTED') {
        errorText = "⚠️ **Rate Limit Exceeded**: My energy is temporarily depleted (Error 429). I am automatically retrying... if this persists, please wait 30 seconds.";
      }

      const errorMessage: Message = {
        id: uuidv4(),
        role: Role.MODEL,
        text: errorText,
        timestamp: Date.now(),
        isError: true
      };
      
      setSessions(prev => prev.map(session => {
        if (session.id === sessionId) {
          return { ...session, messages: [...session.messages, errorMessage] };
        }
        return session;
      }));

      // Don't save transient errors to DB? Or maybe we should. Let's save them so user sees what happened.
      await dbService.saveMessage(sessionId, errorMessage);

    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Optimistic Delete
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    
    if (currentSessionId === id) {
      setCurrentSessionId(newSessions.length > 0 ? newSessions[newSessions.length - 1].id : null);
    }

    await dbService.deleteSession(id);
  };

  const currentSession = getCurrentSession();

  // --- Auth Gate ---
  if (!user && !isAuthLoading) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} isLoading={isAuthLoading} />;
  }
  
  // Loading spinner while checking session
  if (isAuthLoading && !user) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-white">
              <Loader2 className="animate-spin mb-4" size={32} />
          </div>
      )
  }

  // --- Admin Mode ---
  if (user?.isAdmin) {
      return <AdminPanel onLogout={handleLogout} currentUser={user} />;
  }

  // --- Main App Render ---
  if (!user) return null; // Should be handled by loading or login screen

  return (
    <div className="flex h-dvh text-slate-100 font-sans overflow-hidden relative selection:bg-red-500/30">
      
      {/* Interactive Superman Background (z-0) */}
      <HeroicBackground />

      <Sidebar 
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={setCurrentSessionId}
        onNewChat={createNewSession}
        onDeleteSession={handleDeleteSession}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Content (Transparent background to show HeroicBackground) */}
      <div className="flex-1 flex flex-col h-full relative w-full z-10">
        
        {/* Universal Header (Glass) */}
        <div className="h-14 md:h-16 bg-blue-950/40 backdrop-blur-md border-b border-white/10 flex items-center px-3 md:px-4 justify-between z-10 shrink-0">
            <div className="flex items-center gap-2 md:gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-white p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors">
                    <Menu size={24} />
                </button>
                {/* Logo / Brand - Visible on Desktop, condensed on mobile */}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border border-yellow-400 overflow-hidden shrink-0">
                        <img src={SHAKIL_AVATAR_URL} alt="S" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-white font-bold text-lg hidden sm:block drop-shadow-md">ShakBot</span>
                </div>
            </div>

            {/* Model Switcher */}
            <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                <button
                    onClick={() => setCurrentModel('gemini-2.5-flash')}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                        ${currentModel === 'gemini-2.5-flash' 
                            ? 'bg-yellow-400 text-blue-900 shadow-sm' 
                            : 'text-blue-200 hover:text-white hover:bg-white/10'}
                    `}
                    title="Flash Model: Fast and efficient"
                >
                    <Zap size={14} />
                    <span className="hidden sm:inline">Fast</span>
                </button>
                <button
                    onClick={() => setCurrentModel('gemini-3-pro-preview')}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                        ${currentModel === 'gemini-3-pro-preview' 
                            ? 'bg-red-600 text-white shadow-sm' 
                            : 'text-blue-200 hover:text-white hover:bg-white/10'}
                    `}
                    title="Pro Model: Complex reasoning"
                >
                    <Brain size={14} />
                    <span className="hidden sm:inline">Smart</span>
                </button>
            </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-2 md:px-4 pt-4 md:pt-6 pb-4 scroll-smooth">
          <div className="max-w-6xl mx-auto w-full min-h-full flex flex-col">
            
            {!currentSession || currentSession.messages.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center p-4 md:p-8">
                  <div className="w-24 h-24 md:w-32 md:h-32 bg-red-600 rounded-full flex items-center justify-center mb-6 shadow-2xl border-4 border-yellow-400 overflow-hidden relative group">
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
                      <img src={SHAKIL_AVATAR_URL} alt="Shakil" className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 drop-shadow-md">Hello, {user.name.split(' ')[0]}!</h2>
                  <p className="text-base md:text-lg text-slate-200 font-medium max-w-md leading-relaxed mb-6 drop-shadow-sm">
                    I'm Shakil. I can chat in any language, generate images, and help you with your queries.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                      {["Write a story about a kryptonite planet", "Translate 'Hope' into 5 languages", "Debug this React code", "Create an image of a futuristic city"].map((suggestion, idx) => (
                          <button 
                            key={idx}
                            onClick={() => {
                                setInput(suggestion);
                                if(textareaRef.current) textareaRef.current.focus();
                            }}
                            className="bg-slate-900/60 backdrop-blur-sm p-3 md:p-4 rounded-xl shadow-lg border border-white/10 text-sm text-left text-blue-100 hover:border-yellow-400 hover:bg-slate-800/80 hover:text-white transition-all group"
                          >
                             <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-yellow-500 shrink-0 group-hover:text-yellow-400" />
                                <span>{suggestion}</span>
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
                  <div className="flex items-center gap-2 text-slate-300 font-medium text-sm ml-2 animate-pulse bg-slate-900/50 p-2 rounded-lg self-start border border-white/10 backdrop-blur-sm">
                     <Loader2 className="animate-spin" size={16} />
                     <span>Shakil is {currentModel === 'gemini-3-pro-preview' ? 'thinking deeply...' : 'working...'}</span>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
              </>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 md:p-4 bg-slate-950/60 backdrop-blur-xl border-t border-white/10 transition-colors duration-300">
            {/* Image Preview */}
            {selectedImage && (
                <div className="max-w-6xl w-full mx-auto mb-2 flex">
                    <div className="relative group">
                        <img 
                            src={selectedImage.data} 
                            alt="Selected" 
                            className="h-16 md:h-20 w-auto rounded-lg border border-slate-500 shadow-lg"
                        />
                        <button 
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-500 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            {/* Voice Interim Preview Overlay (Floating above input) */}
            {isListening && interimTranscript && (
               <div className="max-w-6xl w-full mx-auto mb-2">
                   <div className="bg-red-950/80 backdrop-blur-md text-red-100 text-sm px-3 py-2 rounded-lg border border-red-800/50 italic flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-bottom-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span>{interimTranscript}</span>
                   </div>
               </div>
            )}

            {/* Hidden File Input - Moved outside conditional so it's always available */}
            <input 
                type="file" 
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Input Container - Conditional Rendering for Gen Mode vs Chat Mode */}
            {isImageGenMode ? (
              // IMAGE GENERATION MODE BAR
              <div className="max-w-6xl w-full mx-auto relative flex items-center gap-2 bg-indigo-950/90 backdrop-blur-lg p-2 rounded-3xl border border-indigo-500/50 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
                 <button
                    onClick={() => setIsImageGenMode(false)}
                    className="p-3 rounded-full flex items-center justify-center text-indigo-300 hover:bg-indigo-800 hover:text-white transition-colors"
                    title="Cancel Image Generation"
                >
                    <X size={20} />
                </button>
                
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-full flex items-center justify-center text-indigo-300 hover:bg-indigo-800 hover:text-white transition-colors"
                    title="Upload Reference Image"
                >
                    <ImagePlus size={20} />
                </button>

                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe image..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-indigo-300 resize-none py-3 px-2 max-h-32 min-h-[44px] text-base"
                    rows={1}
                />

                <button
                    onClick={handleSendMessage}
                    disabled={(!input.trim() && !selectedImage) || isLoading}
                    className={`
                        p-3 rounded-full flex items-center justify-center transition-all duration-200 shrink-0
                        ${(!input.trim() && !selectedImage) || isLoading 
                            ? 'bg-indigo-900/50 text-indigo-500 cursor-not-allowed' 
                            : 'bg-yellow-400 hover:bg-yellow-300 text-indigo-900 shadow-md hover:shadow-lg transform hover:-translate-y-0.5'}
                    `}
                    title="Generate Image"
                >
                    {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} fill="currentColor" />}
                </button>
              </div>
            ) : (
              // STANDARD CHAT MODE BAR
              <div className={`
                max-w-6xl w-full mx-auto relative flex items-end gap-1 md:gap-2 bg-slate-900/60 backdrop-blur-md p-1.5 md:p-2 rounded-3xl border transition-all duration-500 ease-in-out
                ${isListening 
                  ? 'border-red-500/50 shadow-[0_0_25px_rgba(220,38,38,0.25)] ring-1 ring-red-500/30 bg-gradient-to-r from-red-950/30 via-slate-900/60 to-red-950/30' 
                  : 'border-white/10 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30 shadow-lg'}
              `}>
                  
                  {/* Left Side Tools: Add, Image, Palette */}
                  <div className="flex items-center">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 md:p-3 rounded-full flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                        title="Upload image"
                    >
                        <ImagePlus size={20} />
                    </button>
                    <button
                        onClick={() => setIsImageGenMode(true)}
                        className="p-2 md:p-3 rounded-full flex items-center justify-center text-slate-400 hover:bg-purple-500/20 hover:text-purple-300 transition-colors"
                        title="Create Image"
                    >
                        <Palette size={20} />
                    </button>
                  </div>

                  <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={isListening ? "Listening..." : "Ask Shakil..."}
                      className="flex-1 bg-transparent border-none focus:ring-0 text-slate-100 placeholder-slate-500 resize-none py-3 px-2 max-h-32 min-h-[44px] text-base"
                      rows={1}
                  />
                  
                  {/* Microphone Button */}
                  <button
                      onClick={toggleListening}
                      className={`
                          p-2 md:p-3 rounded-full flex items-center justify-center transition-all duration-300 relative z-10 group shrink-0
                          ${isListening 
                              ? 'bg-red-600 text-white shadow-red-500/50 scale-110' 
                              : 'text-slate-400 hover:bg-white/10 hover:text-white'}
                      `}
                      title={isListening ? "Stop listening" : "Voice Input"}
                  >
                      {isListening ? (
                         <>
                           {/* Visual Waveform Effect */}
                           <span className="absolute inset-0 rounded-full bg-red-400 opacity-20 animate-ping"></span>
                           <span className="absolute -inset-1 rounded-full border border-red-500/50 opacity-0 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]"></span>
                           <div className="relative z-10 animate-pulse">
                               <MicOff size={20} />
                           </div>
                         </>
                      ) : (
                         <Mic size={20} />
                      )}
                  </button>

                  <button
                      onClick={handleSendMessage}
                      disabled={(!input.trim() && !selectedImage) || isLoading}
                      className={`
                          p-2 md:p-3 rounded-full flex items-center justify-center transition-all duration-200 shrink-0
                          ${(!input.trim() && !selectedImage) || isLoading 
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                              : 'bg-red-600 hover:bg-red-700 text-yellow-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0'}
                      `}
                  >
                      {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} fill="currentColor" />}
                  </button>
              </div>
            )}

            <div className="text-center mt-2 hidden md:block">
                 <p className="text-[10px] text-slate-400/60 font-medium">Shakil can make mistakes. Verify important information.</p>
            </div>
        </div>

      </div>
    </div>
  );
};

export default App;
