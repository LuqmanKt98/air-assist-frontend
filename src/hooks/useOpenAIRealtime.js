import { useState, useEffect, useRef, useCallback } from 'react';
import OpenAIRealtimeService from '../services/openaiRealtime.js';

const useOpenAIRealtime = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [audioResponse, setAudioResponse] = useState(null);
  const serviceRef = useRef(null);
  const apiKeyRef = useRef(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = new OpenAIRealtimeService();
    
    // Check for stored connection state and auto-reconnect
    const storedApiKey = localStorage.getItem('openai_api_key');
    const wasConnected = localStorage.getItem('openai_connected') === 'true';
    
    if (storedApiKey && wasConnected) {
      apiKeyRef.current = storedApiKey;
      // Auto-reconnect after a short delay
      setTimeout(() => {
        // Call connect directly to avoid dependency issues
        if (!apiKeyRef.current) return;
        
        setIsConnecting(true);
        setError(null);

        const callbacks = {
          onConnect: () => {
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);
            localStorage.setItem('openai_api_key', storedApiKey);
            localStorage.setItem('openai_connected', 'true');
          },
          onDisconnect: () => {
            setIsConnected(false);
            setIsConnecting(false);
            localStorage.setItem('openai_connected', 'false');
          },
          onError: (error) => {
            setError(error.message || 'Connection error');
            setIsConnecting(false);
            setIsConnected(false);
            localStorage.setItem('openai_connected', 'false');
          },
          onMessage: (message) => {
            handleRealtimeMessage(message);
          }
        };

        serviceRef.current.connect(storedApiKey, callbacks).catch(error => {
          console.error('Auto-reconnect failed:', error);
        });
      }, 500);
    }
    
    return () => {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
      }
    };
  }, []);

  // Connect to OpenAI Realtime API
  const connect = useCallback(async (apiKey) => {
    if (!apiKey) {
      setError('API key is required');
      return;
    }

    setIsConnecting(true);
    setError(null);
    apiKeyRef.current = apiKey;

    const callbacks = {
      onConnect: () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        // Persist connection state
        localStorage.setItem('openai_api_key', apiKey);
        localStorage.setItem('openai_connected', 'true');
      },
      onDisconnect: () => {
        setIsConnected(false);
        setIsConnecting(false);
        // Clear connection state
        localStorage.setItem('openai_connected', 'false');
      },
      onError: (error) => {
        setError(error.message || 'Connection error');
        setIsConnecting(false);
        setIsConnected(false);
        // Clear connection state on error
        localStorage.setItem('openai_connected', 'false');
      },
      onMessage: (message) => {
        handleRealtimeMessage(message);
      }
    };

    try {
      await serviceRef.current.connect(apiKey, callbacks);
    } catch (error) {
      setError(error.message || 'Failed to connect');
      setIsConnecting(false);
      setIsConnected(false);
      localStorage.setItem('openai_connected', 'false');
    }
  }, []);

  // Disconnect from OpenAI Realtime API
  const disconnect = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
    }
    // Clear connection state
    localStorage.setItem('openai_connected', 'false');
    apiKeyRef.current = null;
  }, []);

  // Handle incoming messages from OpenAI
  const handleRealtimeMessage = useCallback((message) => {
    console.log('Realtime message:', message);
    
    switch (message.type) {
      case 'session.created':
        console.log('Session created:', message.session);
        break;
        
      case 'response.created':
        console.log('Response created:', message.response);
        break;
        
      case 'response.output_item.added':
        if (message.item.type === 'message') {
          setMessages(prev => [...prev, {
            id: message.item.id,
            role: message.item.role,
            content: message.item.content,
            timestamp: new Date().toISOString()
          }]);
        }
        break;
        
      case 'response.content_part.added':
        if (message.part.type === 'text') {
          setMessages(prev => {
            const updated = [...prev];
            const lastMessage = updated[updated.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = message.part.text;
            } else {
              updated.push({
                id: Date.now(),
                role: 'assistant',
                content: message.part.text,
                timestamp: new Date().toISOString()
              });
            }
            return updated;
          });
        } else if (message.part.type === 'audio') {
          setAudioResponse(message.part.audio);
        }
        break;
        
      case 'response.content_part.done':
        console.log('Content part done:', message.part);
        break;
        
      case 'response.done':
        console.log('Response done:', message.response);
        break;

      case 'response.text':
        // Handle Chat Completions API response
        console.log('📥 Chat Completions response:', message.text);
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'assistant',
          content: message.text,
          timestamp: new Date().toISOString()
        }]);
        break;

      case 'error':
        setError(message.error.message || 'API error');
        break;

      default:
        console.log('Unhandled message type:', message.type);
    }
  }, []);

  // Send text message
  const sendTextMessage = useCallback(async (text, options = {}) => {
    // Check both hook state and service state
    const serviceConnected = serviceRef.current && serviceRef.current.isConnected;
    const hasApiKey = localStorage.getItem('openai_api_key');

    if (!serviceRef.current || (!isConnected && !serviceConnected && !hasApiKey)) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    // If service is not connected but we have API key, try to reconnect
    if (!serviceConnected && hasApiKey) {
      console.log('🔄 Service disconnected, attempting to reconnect...');
      try {
        await serviceRef.current.connect(hasApiKey, {
          onConnect: () => {
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);
            localStorage.setItem('openai_connected', 'true');
          },
          onDisconnect: () => {
            setIsConnected(false);
            setIsConnecting(false);
            localStorage.setItem('openai_connected', 'false');
          },
          onError: (error) => {
            setError(error.message || 'Connection error');
            setIsConnecting(false);
            setIsConnected(false);
            localStorage.setItem('openai_connected', 'false');
          },
          onMessage: (message) => {
            handleRealtimeMessage(message);
          }
        });
      } catch (error) {
        console.error('Failed to reconnect:', error);
        throw new Error('Failed to reconnect to OpenAI');
      }
    }

    // Send to OpenAI (user message will be added by the calling component)
    await serviceRef.current.sendTextMessage(text, options);
  }, [isConnected, handleRealtimeMessage]);

  // Send audio message
  const sendAudioMessage = useCallback(async (audioData, options = {}) => {
    if (!serviceRef.current || !isConnected) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    await serviceRef.current.sendAudioMessage(audioData, options);
  }, [isConnected]);

  // Process audio blob and send
  const sendAudioBlob = useCallback(async (audioBlob, options = {}) => {
    if (!serviceRef.current || !isConnected) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    try {
      const audioData = await serviceRef.current.processAudioBlob(audioBlob);
      await serviceRef.current.sendAudioMessage(audioData, options);
    } catch (error) {
      setError('Failed to process audio: ' + error.message);
      throw error;
    }
  }, [isConnected]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setAudioResponse(null);
  }, []);

  // Create out-of-band response for classification
  const createClassificationResponse = useCallback((prompt, metadata = {}) => {
    if (!serviceRef.current || !isConnected) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    serviceRef.current.createOutOfBandResponse(prompt, { 
      topic: 'classification',
      ...metadata 
    });
  }, [isConnected]);

  return {
    // Connection state
    isConnected,
    isConnecting,
    error,
    
    // Connection methods
    connect,
    disconnect,
    
    // Messaging
    messages,
    audioResponse,
    sendTextMessage,
    sendAudioMessage,
    sendAudioBlob,
    clearMessages,
    
    // Advanced features
    createClassificationResponse,
    
    // Direct service access for advanced usage
    service: serviceRef.current
  };
};

export default useOpenAIRealtime;
