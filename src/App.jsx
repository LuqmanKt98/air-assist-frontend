import { useState, useEffect, useRef } from 'react'
import PWABadge from './PWABadge.jsx'
import useOpenAIRealtime from './hooks/useOpenAIRealtime.js'
import config from './config/env.js'
import './App.css'

function App() {
  const [isListening, setIsListening] = useState(false)
  const [bluetoothDevice, setBluetoothDevice] = useState(null)
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false)
  const [isN8nConnected, setIsN8nConnected] = useState(false)
  const [n8nUrl, setN8nUrl] = useState(() => {
    return localStorage.getItem('n8n_url') || config.defaultN8nUrl
  })
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: `Hello! I'm ${config.appName}. Connect your Bluetooth earpiece and configure OpenAI Realtime API or n8n to start.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: "assistant"
    }
  ])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [error, setError] = useState('')
  const [speechSupported, setSpeechSupported] = useState(true)
  const [lastCommand, setLastCommand] = useState('')
  const [lastCommandTime, setLastCommandTime] = useState(0)
  const [openaiApiKey, setOpenaiApiKey] = useState(() => {
    return localStorage.getItem('openai_api_key') || ''
  })
  const [backendHasApiKey, setBackendHasApiKey] = useState(false)
  const initializationRef = useRef(false)
  const [useOpenAI, setUseOpenAI] = useState(() => {
    const stored = localStorage.getItem('use_openai')
    console.log('🔧 Initial useOpenAI state from localStorage:', stored)
    return stored === 'true'
  })
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  // const mediaRecorderRef = useRef(null)
  // const audioChunksRef = useRef([])

  // OpenAI Realtime hook
  const {
    isConnected: isOpenAIConnected,
    isConnecting: isOpenAIConnecting,
    error: openAIError,
    messages: openAIMessages,
    connect: connectOpenAI,
    disconnect: disconnectOpenAI,
    sendTextMessage,
    // sendAudioBlob,
    clearMessages: clearOpenAIMessages
  } = useOpenAIRealtime()

  // Auto scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Sync OpenAI messages with local messages
  useEffect(() => {
    if (useOpenAI && openAIMessages.length > 0) {
      console.log('🔄 Syncing OpenAI messages:', openAIMessages)

      // Convert OpenAI messages to local message format
      const convertedMessages = openAIMessages.map(msg => ({
        id: msg.id || Date.now() + Math.random(),
        text: msg.content || msg.text || '',
        timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: msg.role === 'user' ? 'user' : 'assistant'
      }))

      console.log('📝 Converted messages:', convertedMessages)

      // Update local messages with OpenAI messages
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const newMessages = convertedMessages.filter(m => !existingIds.has(m.id) && m.text.trim())
        console.log('➕ Adding new messages:', newMessages)
        return [...prev, ...newMessages]
      })
    }
  }, [openAIMessages, useOpenAI])

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true  // Enable continuous listening
      recognitionRef.current.interimResults = true  // Enable interim results for better UX
      recognitionRef.current.lang = 'en-US'
      recognitionRef.current.maxAlternatives = 1

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          } else {
            interimTranscript += event.results[i][0].transcript
          }
        }

        // Only process final results
        if (finalTranscript) {
          const trimmedCommand = finalTranscript.trim().toLowerCase()
          const now = Date.now()

          // Prevent duplicate commands within 3 seconds
          if (trimmedCommand === lastCommand.toLowerCase() && (now - lastCommandTime) < 3000) {
            console.log('🚫 Ignoring duplicate command:', trimmedCommand)
            return
          }

          // Ignore very short commands (likely noise)
          if (trimmedCommand.length < 3) {
            console.log('🚫 Ignoring short command:', trimmedCommand)
            return
          }

          setLastCommand(finalTranscript.trim())
          setLastCommandTime(now)
          addMessage(finalTranscript, 'user')
          processVoiceCommand(finalTranscript)
        }
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setError(`Speech recognition error: ${event.error}`)
        setIsListening(false)
      }

      recognitionRef.current.onend = () => {
        console.log('🛑 Speech recognition ended')
        setIsListening(false)
      }
    } else {
      setSpeechSupported(false)
      setError('Speech recognition is not supported in this browser')
    }
  }, [])

  // Check n8n connection only when URL changes and in n8n mode
  useEffect(() => {
    // Only auto-connect if we're explicitly in n8n mode and URL is valid
    if (!useOpenAI && n8nUrl && localStorage.getItem('use_openai') === 'false') {
      console.log('🔗 n8n URL changed, testing connection in n8n mode')
      // Add a small delay to ensure state is stable
      setTimeout(() => {
        if (!useOpenAI && localStorage.getItem('use_openai') === 'false') {
          checkN8nConnection()
        }
      }, 100)
    }
  }, [n8nUrl]) // Remove useOpenAI from dependencies to prevent auto-reconnection

  // Check backend API key on mount and auto-connect
  useEffect(() => {
    const initializeConnection = async () => {
      if (initializationRef.current) return;
      initializationRef.current = true;

      console.log('🚀 Initializing connection...')

      // Check if backend has API key configured
      const hasBackendKey = await checkBackendApiKey()

      // If using OpenAI mode and backend has key, auto-connect
      if (useOpenAI && hasBackendKey && localStorage.getItem('use_openai') === 'true') {
        console.log('🔄 Auto-connecting to OpenAI with backend key...')
        setTimeout(() => {
          if (!isOpenAIConnected) {
            connectOpenAI('backend-configured')
          }
        }, 500)
      }
    }

    initializeConnection()
  }, []) // Run once on mount

  // Auto-connect to OpenAI only when switching to OpenAI mode
  useEffect(() => {
    if (useOpenAI && !isOpenAIConnected && openaiApiKey && localStorage.getItem('use_openai') === 'true' && !initializationRef.current) {
      console.log('🔄 Auto-connecting to OpenAI due to provider switch')
      // Ensure n8n is disconnected first
      setIsN8nConnected(false)
      localStorage.setItem('n8n_connected', 'false')
      // Add delay to ensure clean state
      setTimeout(() => {
        if (useOpenAI && localStorage.getItem('use_openai') === 'true') {
          connectOpenAI(openaiApiKey)
        }
      }, 100)
    }
  }, [useOpenAI, isOpenAIConnected, openaiApiKey]) // Optimized dependencies

  // Monitor and fix connection state synchronization
  useEffect(() => {
    if (!useOpenAI) return

    const checkConnectionState = () => {
      // Check if we have audio responses coming in (indicates OpenAI is working)
      const hasRecentOpenAIActivity = openAIMessages.length > 0 ||
        (localStorage.getItem('openai_connected') === 'true' && openaiApiKey)

      if (hasRecentOpenAIActivity && !isOpenAIConnected) {
        console.log('🔧 Fixing connection state: OpenAI is responding but state shows disconnected')
        // Force reconnection to sync state
        connectOpenAI(openaiApiKey)
      }
    }

    // Check connection state every 3 seconds when OpenAI mode is enabled
    const interval = setInterval(checkConnectionState, 3000)
    return () => clearInterval(interval)
  }, [useOpenAI, isOpenAIConnected, openAIMessages.length, openaiApiKey, connectOpenAI])

  // Ensure useOpenAI state is properly synchronized
  useEffect(() => {
    if (initializationRef.current) {
      console.log('🔧 useOpenAI state changed to:', useOpenAI)
    }
    localStorage.setItem('use_openai', useOpenAI.toString())

    // Provider isolation: ensure only one provider is connected at a time
    if (useOpenAI && isN8nConnected) {
      console.log('⚠️ Provider isolation: Disconnecting n8n when switching to OpenAI')
      setIsN8nConnected(false)
      localStorage.setItem('n8n_connected', 'false')
    } else if (!useOpenAI && isOpenAIConnected) {
      console.log('⚠️ Provider isolation: Disconnecting OpenAI when switching to n8n')
      disconnectOpenAI()
    }
  }, [useOpenAI, isN8nConnected, isOpenAIConnected])

  // Sync state with localStorage on mount and when localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const storedValue = localStorage.getItem('use_openai')
      const shouldUseOpenAI = storedValue === 'true'
      if (useOpenAI !== shouldUseOpenAI) {
        console.log('🔄 Syncing useOpenAI state with localStorage:', shouldUseOpenAI)
        setUseOpenAI(shouldUseOpenAI)
      }
    }

    // Check on mount
    handleStorageChange()

    // Listen for storage changes
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  // Check fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const processVoiceCommand = async (command) => {
    setIsProcessing(true)

    // Stop listening while processing to avoid interference
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
    }

    // Debug logging to understand the routing decision
    console.log('🎯 Processing voice command:', command)
    console.log('🔧 useOpenAI:', useOpenAI)
    console.log('🔧 isOpenAIConnected:', isOpenAIConnected)
    console.log('🔧 isN8nConnected:', isN8nConnected)
    console.log('🔧 openaiApiKey present:', !!openaiApiKey)
    console.log('🔧 localStorage use_openai:', localStorage.getItem('use_openai'))

    // Use localStorage as source of truth for routing decision
    const storedUseOpenAI = localStorage.getItem('use_openai') === 'true'
    const shouldUseOpenAI = storedUseOpenAI
    console.log('🔧 Decision: Will use', shouldUseOpenAI ? 'OpenAI' : 'n8n', '(from localStorage)')

    // Sync state if out of sync
    if (useOpenAI !== storedUseOpenAI) {
      console.log('🔄 State out of sync, correcting useOpenAI to:', storedUseOpenAI)
      setUseOpenAI(storedUseOpenAI)
    }

    // Additional safety check
    if (shouldUseOpenAI && isN8nConnected) {
      console.log('⚠️ WARNING: OpenAI mode selected but n8n is connected - forcing n8n disconnect')
      setIsN8nConnected(false)
      localStorage.setItem('n8n_connected', 'false')
    }

    try {
      // Use the selected provider (simplified routing)
      if (shouldUseOpenAI) {
        // Use OpenAI Realtime API
        console.log('📤 Sending to OpenAI:', command)
        await sendTextMessage(command)
        console.log('✅ OpenAI message sent successfully')
      } else {
        // Send to n8n webhook directly
        console.log('📤 Sending to n8n:', command)
        const response = await fetch(n8nUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            command,
            timestamp: new Date().toISOString(),
            type: 'voice_command'
          })
        })

        if (response.ok) {
          const result = await response.text()
          console.log('📥 n8n response:', result)
          try {
            const jsonResult = JSON.parse(result)
            addMessage(jsonResult.response || jsonResult.message || "Command processed successfully", 'assistant')
          } catch {
            addMessage(result || "Command processed successfully", 'assistant')
          }
          setIsN8nConnected(true)
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      }
    } catch (err) {
      console.error('❌ Error processing command:', err)
      if (useOpenAI && isOpenAIConnected) {
        addMessage(`OpenAI Error: ${err.message}. Please check your connection.`, 'assistant')
      } else {
        setIsN8nConnected(false)
        addMessage(`N8N Error: ${err.message}. Using fallback response: "${command}"`, 'assistant')
      }
    } finally {
      setIsProcessing(false)
      // No need to restart - continuous mode handles this automatically
    }
  }

  const checkBackendApiKey = async () => {
    try {
      console.log('🔑 Checking backend API key status...')
      const response = await fetch(`${config.backendUrl}/api/key-status`)

      if (response.ok) {
        const data = await response.json()
        console.log('🔑 Backend API key status:', data)
        setBackendHasApiKey(data.hasApiKey)

        if (data.hasApiKey && data.keyPrefix) {
          // If backend has API key and frontend doesn't have one, use backend's
          if (!openaiApiKey) {
            console.log('🔄 Backend has API key, auto-connecting...')
            setOpenaiApiKey('backend-configured')
            localStorage.setItem('openai_api_key', 'backend-configured')
            return true
          }
        }
      }
      return false
    } catch (error) {
      console.error('❌ Error checking backend API key:', error)
      setBackendHasApiKey(false)
      return false
    }
  }

  const checkN8nConnection = async () => {
    try {
      // Check localStorage as source of truth for current mode
      const currentMode = localStorage.getItem('use_openai') === 'true'

      // Only test connection if we're in n8n mode
      if (currentMode) {
        console.log('🚫 Skipping n8n connection test - OpenAI mode is active (from localStorage)')
        setIsN8nConnected(false)
        return
      }

      console.log('🔗 Testing n8n connection in n8n mode')

      // Test the webhook with a ping message
      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'connection_test',
          message: 'ping',
          timestamp: new Date().toISOString()
        })
      })

      setIsN8nConnected(response.ok)

      if (response.ok) {
        console.log('N8N connection test successful')
      } else {
        console.warn(`N8N connection test failed: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('N8N connection test error:', error)
      setIsN8nConnected(false)
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const clearMessages = () => {
    setMessages([{
      id: Date.now(),
      text: "Messages cleared. How can I help you?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: "assistant"
    }])
  }

  const addMessage = (text, type) => {
    const newMessage = {
      id: Date.now(),
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type
    }
    setMessages(prev => [...prev, newMessage])
  }

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start()
        setIsListening(true)
        console.log('🎤 Started continuous listening')
      } catch (e) {
        console.error('Failed to start listening:', e.message)
      }
    }
  }

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop()
        setIsListening(false)
        console.log('🛑 Stopped continuous listening')
      } catch (e) {
        console.error('Failed to stop listening:', e.message)
      }
    }
  }

  const connectBluetooth = async () => {
    try {
      if (!navigator.bluetooth) {
        alert('Bluetooth is not supported in this browser')
        return
      }

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'generic_attribute']
      })

      await device.gatt.connect()
      setBluetoothDevice(device)
      setIsBluetoothConnected(true)

      device.addEventListener('gattserverdisconnected', () => {
        setIsBluetoothConnected(false)
        setBluetoothDevice(null)
      })

    } catch (error) {
      console.error('Bluetooth connection failed:', error)
      alert('Failed to connect to Bluetooth device: ' + error.message)
    }
  }

  const disconnectBluetooth = () => {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
      bluetoothDevice.gatt.disconnect()
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            AIRASSIST
          </div>
        </div>
        <div className="header-right">
          <span className="user-info">Guest User</span>
          <button className="help-btn" onClick={() => setShowHelpModal(true)}>?</button>
          <button className="settings-btn" onClick={() => setShowSettingsModal(true)}>
            
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-item">
          <span className={`status-indicator ${isBluetoothConnected ? 'connected' : 'disconnected'}`}></span>
          Bluetooth: {isBluetoothConnected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="status-item">
          <span className={`status-indicator ${isOpenAIConnected ? 'connected' : 'disconnected'}`}></span>
          OpenAI: {isOpenAIConnected ? 'Connected' : isOpenAIConnecting ? 'Connecting...' : 'Disconnected'}
        </div>
        <div className="status-item">
          <span className={`status-indicator ${isN8nConnected ? 'connected' : 'disconnected'}`}></span>
          n8n: {isN8nConnected ? 'Connected' : 'Disconnected'}
        </div>
        <button className="connect-devices-btn" onClick={connectBluetooth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.71,7.71L12,2H11V9.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L11,14.41V22H12L17.71,16.29L13.41,12L17.71,7.71Z M13,5.83L15.17,8L13,10.17V5.83Z M13,13.83L15.17,16L13,18.17V13.83Z"/>
          </svg>
          Connect Devices
        </button>
      </div>

      {/* Chat Messages */}
      <div className="chat-container">
        <div className="messages">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.type}`}>
              <div className="message-bubble">
                {message.text}
              </div>
              <div className="message-time">{message.timestamp}</div>
            </div>
          ))}
          
          {isProcessing && (
            <div className="message assistant">
              <div className="message-bubble processing">
                Processing...
              </div>
              <div className="message-time">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Start Listening Button */}
      <div className="listening-controls">
        <button 
          className={`start-listening-btn ${isListening ? 'listening' : ''}`}
          onClick={isListening ? stopListening : startListening}
          // disabled={!recognitionRef.current}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
          </svg>
          {isListening ? 'Stop Listening' : 'Start Listening'}
        </button>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Help & Instructions</h2>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="help-section">
                <h3>🎤 Voice Commands</h3>
                <p>Click &ldquo;Start Listening&rdquo; to begin voice recognition. Speak clearly and the app will process your commands.</p>
              </div>
              <div className="help-section">
                <h3>📱 Bluetooth Connection</h3>
                <p>Connect your Bluetooth earpiece for hands-free operation. Click &ldquo;Connect Devices&rdquo; to pair.</p>
              </div>
              <div className="help-section">
                <h3>🔗 n8n Integration</h3>
                <p>Configure n8n URL in settings to enable advanced automation workflows.</p>
              </div>
              <div className="help-section">
                <h3>💡 Tips</h3>
                <ul>
                  <li>Ensure microphone permissions are granted</li>
                  <li>Use in a quiet environment for best results</li>
                  <li>Keep n8n server running for full functionality</li>
                </ul>
              </div>
              {error && (
                <div className="help-section error-section">
                  <h3>⚠️ Current Issues</h3>
                  <p>{error}</p>
                </div>
              )}
              {!speechSupported && (
                <div className="help-section error-section">
                  <h3>⚠️ Browser Compatibility</h3>
                  <p>Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="settings-section">
                <h3>AI Provider Selection</h3>
                <div className="input-group">
                  <div className="radio-group" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Prevent multiple clicks
                    if (e.target.closest('.radio-group').dataset.switching === 'true') {
                      return;
                    }
                    e.target.closest('.radio-group').dataset.switching = 'true';

                    console.log('🔄 Switching to n8n - disconnecting from OpenAI');

                    // Disconnect from OpenAI when switching to n8n
                    if (isOpenAIConnected) {
                      disconnectOpenAI();
                    }

                    // Ensure clean state - set n8n disconnected first
                    setIsN8nConnected(false);
                    localStorage.setItem('n8n_connected', 'false');

                    // Switch to n8n mode
                    setUseOpenAI(false);
                    localStorage.setItem('use_openai', 'false');

                    // Connect to n8n only after state is clean
                    setTimeout(() => {
                      const currentMode = localStorage.getItem('use_openai');
                      if (currentMode === 'false') {
                        console.log('🔗 Connecting to n8n after state cleanup');
                        checkN8nConnection();
                      }
                      e.target.closest('.radio-group').dataset.switching = 'false';
                    }, 300);

                    console.log('✅ Switched to n8n mode');
                  }}>
                    <input
                      type="radio"
                      id="n8nProvider"
                      name="aiProvider"
                      checked={!useOpenAI}
                      readOnly
                    />
                    <label htmlFor="n8nProvider">Use n8n Webhook</label>
                  </div>
                  <div className="radio-group" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Prevent multiple clicks
                    if (e.target.closest('.radio-group').dataset.switching === 'true') {
                      return;
                    }
                    e.target.closest('.radio-group').dataset.switching = 'true';

                    console.log('🔄 Switching to OpenAI - disconnecting from n8n');

                    // Ensure n8n is completely disconnected
                    setIsN8nConnected(false);
                    localStorage.setItem('n8n_connected', 'false');

                    // Switch to OpenAI mode
                    setUseOpenAI(true);
                    localStorage.setItem('use_openai', 'true');

                    setTimeout(() => {
                      e.target.closest('.radio-group').dataset.switching = 'false';
                    }, 300);

                    console.log('✅ Switched to OpenAI mode');
                  }}>
                    <input
                      type="radio"
                      id="openaiProvider"
                      name="aiProvider"
                      checked={useOpenAI}
                      readOnly
                    />
                    <label htmlFor="openaiProvider">Use OpenAI Realtime API</label>
                  </div>
                </div>
              </div>

              {useOpenAI ? (
                <div className="settings-section" key="openai-settings">
                  <h3>OpenAI Realtime Configuration</h3>
                  <div className="input-group">
                    <label htmlFor="openai-key">OpenAI API Key:</label>
                    {backendHasApiKey && (
                      <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#2d5a27', borderRadius: '4px', fontSize: '14px' }}>
                        ✅ Backend API key configured and ready to use
                      </div>
                    )}
                    <input
                      id="openai-key"
                      type="password"
                      value={openaiApiKey === 'backend-configured' ? 'Using backend configuration' : openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder={backendHasApiKey ? "Backend key configured" : "sk-..."}
                      disabled={openaiApiKey === 'backend-configured'}
                    />
                    <button
                      onClick={() => {
                        if (isOpenAIConnected) {
                          disconnectOpenAI();
                        } else {
                          const keyToUse = openaiApiKey === 'backend-configured' ? 'backend-configured' : openaiApiKey;
                          connectOpenAI(keyToUse);
                        }
                      }}
                      className={`test-connection-btn ${isOpenAIConnected ? 'disconnect-btn' : ''}`}
                      disabled={isOpenAIConnecting || (!openaiApiKey && !backendHasApiKey)}
                    >
                      {isOpenAIConnecting ? 'Connecting...' : isOpenAIConnected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                  <div className="connection-status">
                    Status: <span className={isOpenAIConnected ? 'status-connected' : 'status-disconnected'}>
                      {isOpenAIConnected ? 'Connected' : isOpenAIConnecting ? 'Connecting...' : 'Disconnected'}
                    </span>
                    {openAIError && (
                      <div className="error-message">Error: {openAIError}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="settings-section" key="n8n-settings">
                  <h3>n8n Configuration</h3>
                  <div className="input-group">
                    <label htmlFor="n8n-url">n8n Server URL:</label>
                    <input
                      id="n8n-url"
                      type="url"
                      value={n8nUrl}
                      onChange={(e) => {
                        const newUrl = e.target.value;
                        setN8nUrl(newUrl);
                        localStorage.setItem('n8n_url', newUrl);
                      }}
                      placeholder={config.defaultN8nUrl}
                    />
                    <button onClick={checkN8nConnection} className="test-connection-btn">
                      Test Connection
                    </button>
                  </div>
                  <div className="connection-status">
                    Status: <span className={isN8nConnected ? 'status-connected' : 'status-disconnected'}>
                      {isN8nConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="settings-section">
                <h3>Actions</h3>
                <div className="action-buttons">
                  <button onClick={() => {
                    clearMessages();
                    if (useOpenAI) clearOpenAIMessages();
                  }} className="action-btn">
                    Clear Messages
                  </button>
                  <button onClick={toggleFullscreen} className="action-btn">
                    {isFullScreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  </button>
                  {isBluetoothConnected && (
                    <button onClick={disconnectBluetooth} className="action-btn disconnect-btn">
                      Disconnect Bluetooth
                    </button>
                  )}
                  {useOpenAI && isOpenAIConnected && (
                    <button onClick={async () => {
                      console.log('🧪 Testing OpenAI connection...')
                      const testMessage = 'Hello, this is a test message. Please respond.'
                      try {
                        addMessage(testMessage, 'user')
                        await sendTextMessage(testMessage)
                        console.log('✅ Test message sent to OpenAI')
                      } catch (error) {
                        console.error('❌ Test message failed:', error)
                        addMessage(`Test failed: ${error.message}`, 'assistant')
                      }
                    }} className="action-btn">
                      Test OpenAI Connection
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <PWABadge />
    </div>
  )
}

export default App
