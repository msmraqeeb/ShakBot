import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Role } from '../types';
import { User, AlertCircle, Volume2, Loader2, StopCircle, Copy, Check } from 'lucide-react';
import { generateSpeech, playAudioBuffer } from '../services/geminiService';

interface MessageBubbleProps {
  message: Message;
}

// Updated with the user provided Unsplash URL
const SHAKIL_AVATAR_URL = "https://images.unsplash.com/photo-1633957897986-70e83293f3ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMGF2YXRhcnxlbnwwfHx8fDE3NjQ2NTQwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080";

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === Role.USER;
  const isError = message.isError;

  // TTS State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Copy State
  const [isCopied, setIsCopied] = useState(false);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {
          // Ignore error if already stopped
        }
      }
    };
  }, []);

  const handlePlayAudio = async () => {
    // If playing, stop it
    if (isPlaying) {
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {
            // ignore
        }
      }
      setIsPlaying(false);
      return;
    }

    // Start playback
    setIsLoadingAudio(true);
    try {
      const audioBuffer = await generateSpeech(message.text);
      const source = await playAudioBuffer(audioBuffer);
      audioSourceRef.current = source;
      setIsPlaying(true);

      // Reset state when audio finishes naturally
      source.onended = () => {
        setIsPlaying(false);
        audioSourceRef.current = null;
      };
    } catch (error) {
      console.error("Failed to play audio:", error);
      // Optional: Show a toast or error UI here
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[92%] md:max-w-[75%] gap-2 md:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shadow-lg overflow-hidden border-2
          ${isUser ? 'bg-blue-600 text-white border-blue-500' : isError ? 'bg-red-950 text-red-500 border-red-800' : 'bg-red-600 border-yellow-400'}
        `}>
          {isUser ? (
             <User size={16} className="md:w-5 md:h-5" />
          ) : isError ? (
             <AlertCircle size={16} className="md:w-5 md:h-5" />
          ) : (
             <img 
               src={SHAKIL_AVATAR_URL} 
               alt="Shakil AI" 
               className="w-full h-full object-cover"
             />
          )}
        </div>

        {/* Message Content */}
        <div className={`
          flex flex-col p-3 md:p-4 rounded-2xl shadow-lg overflow-hidden text-sm md:text-base relative group backdrop-blur-md
          ${isUser 
            ? 'bg-blue-600 text-white rounded-tr-none' 
            : isError
              ? 'bg-red-950/80 border border-red-800/50 text-red-200 rounded-tl-none'
              : 'bg-slate-900/80 border-l-4 border-yellow-400 text-slate-100 rounded-tl-none border-t border-r border-b border-white/5'
          }
        `}>
          {/* Header for Shakil */}
          {!isUser && !isError && (
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] md:text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
                Shakil AI
                </span>
            </div>
          )}

          {/* Image Attachment (User upload or Model Generation) */}
          {message.imageUrl && (
            <div className="mb-3 rounded-lg overflow-hidden border border-white/10 shadow-sm max-w-sm">
                <img 
                    src={message.imageUrl} 
                    alt="Content" 
                    className="w-full h-auto object-contain bg-slate-900/50" 
                />
            </div>
          )}

          <div className={`
            prose prose-sm md:prose-base prose-invert max-w-none break-words
            prose-headings:mt-8 prose-headings:mb-4 prose-headings:font-bold prose-headings:text-yellow-400
            prose-p:my-4 prose-p:leading-7
            prose-ul:my-4 prose-li:my-2
            prose-strong:text-yellow-400
          `}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : (
              <ReactMarkdown>{message.text}</ReactMarkdown>
            )}
          </div>
          
          <div className="flex items-center justify-between mt-2 min-h-[20px]">
            <span className={`text-[10px] opacity-70 ${isUser ? 'text-blue-100' : 'text-slate-400'}`}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            <div className="flex items-center gap-1">
                {/* Copy Button */}
                <button
                    onClick={handleCopy}
                    className={`
                        p-1.5 rounded-full transition-all flex items-center gap-1
                        opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100
                        ${isUser 
                            ? 'text-blue-200 hover:bg-blue-500 hover:text-white' 
                            : 'text-slate-500 hover:bg-white/10 hover:text-blue-300'}
                    `}
                    title="Copy text"
                >
                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>

                {/* TTS Button - Only for Shakil's messages that aren't errors */}
                {!isUser && !isError && (
                    <button 
                        onClick={handlePlayAudio}
                        disabled={isLoadingAudio}
                        className={`
                            p-1.5 rounded-full transition-all flex items-center gap-1
                            ${isPlaying 
                                ? 'bg-red-900/50 text-red-400 ring-2 ring-red-800' 
                                : 'bg-white/5 text-slate-400 hover:bg-blue-900/30 hover:text-blue-300'}
                        `}
                        title="Read aloud"
                    >
                        {isLoadingAudio ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : isPlaying ? (
                            <>
                                <StopCircle size={14} className="animate-pulse" />
                                <span className="text-[10px] font-medium hidden sm:inline">Stop</span>
                            </>
                        ) : (
                            <Volume2 size={14} />
                        )}
                    </button>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};