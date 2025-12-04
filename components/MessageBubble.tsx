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
      <div className={`flex max-w-[85%] md:max-w-[75%] gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md overflow-hidden border-2
          ${isUser ? 'bg-blue-600 text-white border-blue-500' : isError ? 'bg-red-100 text-red-600 border-red-200' : 'bg-red-600 border-yellow-400'}
        `}>
          {isUser ? (
             <User size={20} />
          ) : isError ? (
             <AlertCircle size={20} />
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
          flex flex-col p-4 rounded-2xl shadow-sm overflow-hidden text-sm md:text-base relative group
          ${isUser 
            ? 'bg-blue-600 text-white rounded-tr-none' 
            : isError
              ? 'bg-red-50 border border-red-200 text-red-800 rounded-tl-none'
              : 'bg-white border-l-4 border-yellow-400 text-slate-800 rounded-tl-none'
          }
        `}>
          {/* Header for Shakil */}
          {!isUser && !isError && (
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1">
                Shakil AI
                </span>
            </div>
          )}

          {/* Image Attachment */}
          {message.attachment && (
            <div className="mb-3 rounded-lg overflow-hidden border border-black/10">
                <img 
                    src={`data:${message.attachment.mimeType};base64,${message.attachment.data}`} 
                    alt="Attached content" 
                    className="w-full h-auto max-h-80 object-cover"
                />
            </div>
          )}

          <div className={`prose ${isUser ? 'prose-invert' : 'prose-slate'} max-w-none leading-relaxed break-words`}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : (
              <ReactMarkdown>{message.text}</ReactMarkdown>
            )}
          </div>
          
          <div className="flex items-center justify-between mt-2 min-h-[24px]">
            <span className={`text-[10px] opacity-70 ${isUser ? 'text-blue-100' : 'text-slate-400'}`}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            <div className="flex items-center gap-1">
                {/* Copy Button */}
                <button
                    onClick={handleCopy}
                    className={`
                        p-1.5 rounded-full transition-all flex items-center gap-1
                        opacity-0 group-hover:opacity-100 focus:opacity-100
                        ${isUser 
                            ? 'text-blue-200 hover:bg-blue-500 hover:text-white' 
                            : 'text-slate-400 hover:bg-slate-100 hover:text-blue-600'}
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
                                ? 'bg-red-100 text-red-600 ring-2 ring-red-200' 
                                : 'bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600'}
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