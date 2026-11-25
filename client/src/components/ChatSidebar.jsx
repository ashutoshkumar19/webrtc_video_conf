import { useEffect, useRef, useState, useCallback } from 'react';
import { SendHorizontal, X, User as UserIcon } from 'lucide-react';
import { useStore } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { formatTimestamp, initials } from '@/lib/utils';
import MentionDropdown from './MentionDropdown';

export default function ChatSidebar({ open, onClose, socket }) {
  const {
    messages, input, mentionQuery, mentionSuggestions, me, participants, setInput, setMessages, addMessage, setMentionQuery, setMentionSuggestions,
    setMentionNotification, clearMentionNotification,
  } = useStore();
  const { toast } = useToast();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages]);

  useEffect(() => {
    if (!socket) return;
    socket.on('mention-notification', (msg) => {
      setMentionNotification(msg);
      toast({ title: 'You were mentioned', description: `${msg.fromName}: ${msg.message}`, variant: 'default' });
    });
    return () => {
      socket.off('mention-notification');
    };
  }, [socket, setMentionNotification, toast]);

  const sendMessage = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const tempId = 'temp-' + Date.now();
    const ownMsg = {
      id: tempId,
      tempId,
      from: me?.socketId,
      fromName: me?.name,
      message: text,
      mentions: [],
      timestamp: Date.now(),
      own: true,
      status: 'sending',
    };
    addMessage(ownMsg);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    getSocket()?.emit(
      'chat-message',
      { roomId: useStore.getState().roomId, message: text, tempId },
    );
    setInput('');
    setMentionQuery('');
    setMentionSuggestions([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    if (value.includes('@')) {
      const afterAt = value.slice(value.lastIndexOf('@') + 1);
      setMentionQuery(afterAt);
      const suggestions = participants.filter(
        (p) => p.name.toLowerCase().includes(afterAt.toLowerCase()) && p.socketId !== me?.socketId
      );
      setMentionSuggestions(suggestions.slice(0, 8));
    } else {
      setMentionQuery('');
      setMentionSuggestions([]);
    }
  };

  const insertMention = (name) => {
    const value = input;
    const atIndex = value.lastIndexOf('@');
    const before = atIndex === -1 ? value : value.slice(0, atIndex);
    const newValue = `${before}@${name} `;
    setInput(newValue);
    setMentionQuery('');
    setMentionSuggestions([]);
    inputRef.current?.focus();
  };

  const getSocket = () => useStore.getState().socket;

  return (
    <div
      className={`flex h-full flex-col bg-[#202124] border-l border-[#3c4043] ${
        open ? 'w-[360px] flex' : 'w-0 overflow-hidden transition-width duration-300'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[#3c4043] px-5 py-4">
        <h3 className="text-lg font-normal text-[#e8eaed]">In-call messages</h3>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#3c4043] transition-colors"
          aria-label="Close chat"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.map((msg) => {
          const own = msg.own;
          const showMentionBadge = own && msg.mentions && msg.mentions.length > 0;
          return (
            <div
              key={msg.id || msg.tempId}
              className="flex gap-3 animate-fade-in"
            >
              {!own && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-slate-200">
                  {initials(msg.fromName)}
                </div>
              )}
              <div className={`flex flex-col ${
                own ? 'items-end' : 'items-start'
              } max-w-[80%] ${own ? 'ml-auto' : 'mr-auto'}`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  own
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/50'
                }`}>
                  {renderMessageContent(msg.message, own)}
                  {showMentionBadge && (
                    <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-600/20 text-blue-300 border border-blue-600/30">
                      <UserIcon className="w-3 h-3" /> Mentioned {msg.mentions.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-slate-500 self-end">
                  {formatTimestamp(msg.timestamp)}
                  {msg.status === 'sending' && <span className="ml-2 animate-pulse text-xs">sending</span>}
                </div>
              </div>
              {own && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-semibold text-white">
                  {initials(me?.name || 'U')}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[#3c4043] p-3 bg-[#202124]">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            className="w-full bg-[#28292c] border border-[#3c4043] rounded-full px-4 pr-12 py-2.5 text-sm text-[#e8eaed] placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8] transition-colors"
            placeholder="Send a message to everyone"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-[#8ab4f8] disabled:text-[#5f6368] disabled:cursor-not-allowed hover:bg-[#3c4043] transition-colors flex items-center justify-center"
            aria-label="Send message"
          >
            <SendHorizontal className="w-4 h-4" />
          </button>
          {mentionSuggestions.length > 0 && mentionQuery && (
            <MentionDropdown
              participants={participants}
              query={mentionQuery}
              visible
              onSelect={insertMention}
              onDismiss={() => {
                setMentionQuery('');
                setMentionSuggestions([]);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function renderMessageContent(text, own) {
  const mentionRegex = /@([\w\-]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'mention', content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return (
    <span className="leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <span
              key={i}
              className={`rounded-md px-1.5 py-0.5 font-medium ${
                own
                  ? 'bg-blue-600/30 text-blue-100 border border-blue-500/40'
                  : 'bg-slate-700/50 text-blue-300 border border-blue-500/30'
              }`}
            >
              {part.content}
            </span>
          );
        }
        return <span key={i}>{part.content}</span>;
      })}
    </span>
  );
}
