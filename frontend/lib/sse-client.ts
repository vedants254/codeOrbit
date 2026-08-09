/**
 * Server-Sent Events client for real-time documentation generation progress
 */

import { useState, useEffect, useRef } from 'react';

export interface ProgressUpdate {
  timestamp: number;
  message: string;
  task_id: string;
  type?: string;
  status?: string;
  currentPage?: number;
  totalPages?: number;
  error?: string;
}

export interface SSEEventHandlers {
  onProgress?: (update: ProgressUpdate) => void;
  onStatusChange?: (status: string, message: string) => void;
  onComplete?: (status: string, message: string, error?: string) => void;
  onError?: (error: string) => void;
}

export class DocumentationSSEClient {
  private eventSource: EventSource | null = null;
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8003') {
    this.baseUrl = baseUrl;
  }

  /**
   * Start streaming progress updates for a documentation generation task
   */
  startStreaming(taskId: string, handlers: SSEEventHandlers): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const url = `${this.baseUrl}/api/documentation/progress-stream/${taskId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'status':
            handlers.onStatusChange?.(data.status, data.message);
            break;

          case 'complete':
            handlers.onComplete?.(data.status, data.final_message, data.error);
            this.stopStreaming();
            break;

          default:
            // Regular progress update
            handlers.onProgress?.(data as ProgressUpdate);
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
        handlers.onError?.('Error parsing progress update');
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      handlers.onError?.('Connection error');
      this.stopStreaming();
    };

    this.eventSource.onopen = () => {
      console.log('SSE connection opened for task:', taskId);
    };
  }

  /**
   * Stop streaming and close the connection
   */
  stopStreaming(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}

/**
 * Hook for using SSE documentation progress streaming
 */
export function useDocumentationProgress(taskId: string | null) {
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<DocumentationSSEClient | null>(null);

  useEffect(() => {
    if (!taskId) return;

    if (!clientRef.current) {
      clientRef.current = new DocumentationSSEClient();
    }

    const handlers: SSEEventHandlers = {
      onProgress: (update) => {
        setProgressUpdates((prev) => [...prev, update]);
        setCurrentMessage(update.message);
      },

      onStatusChange: (status, message) => {
        setCurrentStatus(status);
        setCurrentMessage(message);
      },

      onComplete: (status, message, error) => {
        setCurrentStatus(status);
        setCurrentMessage(message);
        if (error) {
          setError(error);
        }
        setIsStreaming(false);
      },

      onError: (errorMsg) => {
        setError(errorMsg);
        setIsStreaming(false);
      },
    };

    setIsStreaming(true);
    setError(null);
    clientRef.current.startStreaming(taskId, handlers);

    return () => {
      clientRef.current?.stopStreaming();
      setIsStreaming(false);
    };
  }, [taskId]);

  const stopStreaming = () => {
    clientRef.current?.stopStreaming();
    setIsStreaming(false);
  };

  return {
    progressUpdates,
    currentStatus,
    currentMessage,
    isStreaming,
    error,
    stopStreaming,
    clearProgress: () => setProgressUpdates([]),
  };
}
