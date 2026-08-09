'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, MessageCircle } from 'lucide-react';
import { ChatSessionListItem } from '@/api-client';

interface ChatHistoryProps {
  history: ChatSessionListItem[]; // Change this line
  onLoadConversation: (conversationId: string) => void;
  onClose: () => void;
  isLoading: unknown;
}

export function ChatHistory({ history, onLoadConversation, onClose }: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredHistory = history.filter((conversation) => {
    const searchLower = searchQuery.toLowerCase();
    return conversation.title?.toLowerCase().includes(searchLower);
  });

  const getConversationPreview = (session: ChatSessionListItem) => {
    return `Chat session: ${session.title}`;
  };

  const handleLoadConversation = (conversationId: string) => {
    onLoadConversation(conversationId);
    onClose();
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* History List */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-sm">No conversations found</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery
                    ? 'Try adjusting your search terms'
                    : 'Start chatting to see your history here'}
                </p>
              </div>
            </div>
          ) : (
            filteredHistory.map((session) => (
              <div
                key={session.conversation_id}
                className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => handleLoadConversation(session.conversation_id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm truncate">
                        {session.title || 'Untitled Conversation'}
                      </h4>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {getConversationPreview(session)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        <span>Chat ID: {session.chat_id}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
