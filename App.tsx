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
import { logout } from './services/authService';

// Updated with the user provided Unsplash URL
const SHAKIL_AVATAR_URL = "https://images.unsplash.com/photo-1633957897986-70e83293f3ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMGF2YXRhcnxlbnwwfHx8fDE3NjQ2NTQwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080";

interface SelectedImage {
    data: string;
    mimeType: string;
}

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

  // Load User from Local Storage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('shakbot_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        if (!parsedUser.isAdmin) {
            loadUserData(parsedUser);
        }
      } catch (e) {
        console.error("Failed to parse user from local storage");
      }
    }
  }, []);

  // Helper to load memory and sessions for a specific user
  const loadUserData = (userData: User) => {
    // 1. Load Memory
    const storedMemory = localStorage.getItem(`shakbot_memory_${userData.id}`);
    if (storedMemory) {
        setUserMemory(storedMemory);
    } else {
        setUserMemory('');
    }

    // 2. Load Chat History
    try {
        const storedSessions = localStorage.getItem(`shakbot_sessions_${userData.id}`);
        if (storedSessions) {
            const parsedSessions = JSON.parse(storedSessions);
            if (Array.isArray(parsedSessions)) {
                setSessions(parsedSessions);
                // Set current session to the most recent one if available
                if (parsedSessions.length > 0) {
                    setCurrentSessionId(parsedSessions[parsedSessions.length - 1].id);
                }
            }
        }
    } catch (e) {
        console.error("Failed to load sessions", e);
    }
  };

  // Save Sessions to Local Storage with Quota Management
  useEffect(() => {
    if (!user || user.isAdmin) return; // Admins don't save their view state to local storage sessions
    
    const key = `shakbot_sessions_${user.id}`;
    
    try {
        localStorage.setItem(key, JSON.stringify(sessions));
    } catch (e: any) {
        // Handle QuotaExceededError
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
            console.warn("Storage quota exceeded. Optimizing history...");
            
            // Strategy 1: Remove images from all sessions in storage (Heavy strings)
            // We map through sessions and remove imageUrls, but keep a placeholder text
            const textOnlySessions = sessions.map(s => ({
                ...s,
                messages: s.messages.map(m => {
                     // Check if it has a large image url (Base64)
                    if (m.imageUrl && m.imageUrl.length > 500) {
                        return { ...m, imageUrl: undefined, text: m.text + '\n\n*[Image hidden from history to save space]*' };
                    }
                    return m;
                })
            }));

            try {
                localStorage.setItem(key, JSON.stringify(textOnlySessions));
                console.log("History saved without images.");
            } catch (e2) {
                // Strategy 2: Keep only the last 5 sessions (Text Only)
                console.warn("Still full. Trimming old sessions.");
                const recentSessions = textOnlySessions.slice(-5);
                try {
                    localStorage.setItem(key, JSON.stringify(recentSessions));
                } catch (e3) {
                    console.error("Critically low storage. Could not save history.");
                }
            }
        }
    }
  }, [sessions, user]);

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
    localStorage.setItem('shakbot_user', JSON.stringify(loggedInUser));
    
    // Clear previous user state just in case
    setSessions([]);
    setCurrentSessionId(null);
    setUserMemory('');

    if (!loggedInUser.isAdmin) {
        // Load new user data only if not admin
        loadUserData(loggedInUser);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setUserMemory('');
    localStorage.removeItem('shakbot_user');
    setSessions([]); // Clear sessions from view
    setCurrentSessionId(null);
    // Note: We do NOT clear localStorage sessions here, so they persist for next login
  };

  // --- Voice Input Logic (Smart "Google Assistant" Style) ---

  const stopListening = useCallback(() => {
    isListeningRef.current = false; // Flag to prevent auto-restart
    
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
    
    // Vibrate to indicate stop
    if (navigator.vibrate) navigator.vibrate(50);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    // Cleanup any existing instance
    if (recognitionRef.current) {
         isListeningRef.current = false;
         recognitionRef.current.onend = null;
         try { recognitionRef.current.stop(); } catch(e) {}
    }

    // Vibrate start
    if (navigator.vibrate) navigator.vibrate(50);

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false; // We use manual restart loop for better mobile support
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // --- Core Logic for Text Handling ---
    recognition.onresult = (event: any) => {
        // Reset silence timer whenever we hear something
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
            stopListening(); // Auto-stop after 2.5 seconds of silence
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

        // Append final text to input
        if (finalTranscript) {
            setInput(prev => {
                const trimmed = prev.trim();
                // Add space if needed
                const spacer = trimmed.length > 0 && !trimmed.endsWith(' ') ? ' ' : '';
                return trimmed + spacer + finalTranscript;
            });
        }
        
        setInterimTranscript(interim);
    };

    recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
        
        // Start silence timer immediately (waiting for first word)
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
             // If no sound for 5 seconds at start, stop
             stopListening();
        }, 5000);
    };

    recognition.onerror = (event: any) => {
        console.warn("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
            stopListening();
            alert("Microphone permission denied.");
        }
        // 'no-speech' happens frequently, we handle it via loop
    };

    recognition.onend = () => {
        // The Restart Loop: If we are still "listening" (isListeningRef is true),
        // it means the browser stopped (due to silence or continuous=false),
        // but we want to keep going until our explicit Silence Timer kills it.
        if (isListeningRef.current) {
            try {
                recognition.start();
            } catch (e) {
                // If start fails (fast click), just stop
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
    // Reset file input so same file can be selected again if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
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
    // Pass userMemory and currentModel to the chat instance
    chatInstanceRef.current = createGenAIChat(currentModel, [], userMemory); 
    setIsSidebarOpen(false);
  }, [userMemory, currentModel]);

  // Restore Chat Instance when switching sessions
  useEffect(() => {
    if (!user || user.isAdmin) return; // Don't manage sessions if not logged in or admin

    if (!currentSessionId) {
       return;
    }

    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
      // Re-create the Gemini Chat object with the history, memory and CURRENT model
      // This ensures if we switch models, it picks it up on session switch
      chatInstanceRef.current = createGenAIChat(currentModel, session.messages, userMemory);
    }
  }, [currentSessionId, sessions, user, userMemory, currentModel]);

  const handleSendMessage = async () => {
    // If no session exists, create one first
    if (!currentSessionId && sessions.length === 0) {
        createNewSession();
        // Manually trigger for the new session logic
        const newId = uuidv4();
        const newSession: ChatSession = {
            id: newId,
            title: 'New Conversation',
            messages: [],
            createdAt: Date.now(),
        };
        setSessions(prev => [...prev, newSession]);
        setCurrentSessionId(newId);
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
    if ((!input.trim() && !selectedImage) || isLoading) return;

    // Stop listening if sending message
    if (isListening) {
        stopListening();
    }

    const userText = input.trim();
    const attachedImage = selectedImage; // Capture current state before reset
    const usingImageModel = isImageGenMode || !!attachedImage;

    // Reset Input UI
    setInput('');
    setSelectedImage(null);
    if (isImageGenMode) setIsImageGenMode(false); // Optional: Exit gen mode after sending?
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMessage: Message = {
      id: uuidv4(),
      role: Role.USER,
      text: userText,
      imageUrl: attachedImage?.data,
      timestamp: Date.now()
    };

    // Update UI immediately with user message
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

    try {
      
      // Check if this is an image edit/generation request
      
      if (usingImageModel) {
        // --- Image Editing / Generation Mode ---
        // gemini-2.5-flash-image handles both text-to-image and image-to-image (edit)
        
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

      } else {
         // --- Standard Chat Flow ---

         // Always ensure we have a fresh chat instance using the CURRENTLY selected model
         // This allows dynamic switching between Flash and Pro in the same chat
         // We pass the updated message history (excluding the one we just added? No, sdk history handles previous turns)
         // We pass `currentMessages` which is history *before* this new message.
         chatInstanceRef.current = createGenAIChat(currentModel, currentMessages, userMemory);

        // Placeholder for bot message
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

        // After a successful response, try to refine the memory in the background
        if (user) {
            // We only refine memory if the user sent text
            refineUserMemory(userMemory, userText, accumulatedText).then(newMemory => {
                // If memory changed, save it
                if (newMemory !== userMemory) {
                    console.log("Memory updated:", newMemory);
                    setUserMemory(newMemory);
                    localStorage.setItem(`shakbot_memory_${user.id}`, newMemory);
                }
            });
        }
      }

      // Generate title if needed (common for both flows)
      // Logic: if it WAS empty/new, now it has 2 messages.
      setSessions(prev => {
          const s = prev.find(s => s.id === sessionId);
          if (s && s.messages.length === 2) {
              generateSessionTitle(userText).then(title => {
                  setSessions(curr => curr.map(x => x.id === sessionId ? { ...x, title } : x));
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

      // Handle Rate Limits (429) specifically
      if (
        errorMessageString.includes('429') || 
        errorMessageString.toLowerCase().includes('quota') || 
        errorMessageString.includes('RESOURCE_EXHAUSTED') ||
        errorCode === 429 ||
        errorStatus === 'RESOURCE_EXHAUSTED'
      ) {
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

  // --- Admin Mode ---
  if (user.isAdmin) {
      return <AdminPanel onLogout={handleLogout} currentUser={user} />;
  }

  // --- Main App Render ---
  return (
    <div className="flex h-dvh text-slate-100 font-sans overflow-hidden relative selection:bg-red-500/30">
      
      {/* Interactive Superman Background (z-0) */}
      <HeroicBackground />

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