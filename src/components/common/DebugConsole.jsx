import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import './DebugConsole.css';

const DebugConsole = () => {
    const [logs, setLogs] = useState([]);
    const [isOpen, setIsOpen] = useState(false); // Default to closed, user can open
    const [isVisible, setIsVisible] = useState(true); // Master toggle

    // Capture original console methods
    useEffect(() => {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const addLog = (type, args) => {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch (e) {
                        return '[Object]';
                    }
                }
                return String(arg);
            }).join(' ');

            setLogs(prev => [...prev.slice(-49), { // Keep last 50 logs
                type,
                message,
                timestamp: new Date().toLocaleTimeString()
            }]);
        };

        console.log = (...args) => {
            addLog('log', args);
            originalLog.apply(console, args);
        };

        console.error = (...args) => {
            addLog('error', args);
            originalError.apply(console, args);
        };

        console.warn = (...args) => {
            addLog('warn', args);
            originalWarn.apply(console, args);
        };

        return () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
        };
    }, []);

    const logsEndRef = useRef(null);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [logs, isOpen]);

    if (!isVisible) return <button className="debug-toggle-mini" onClick={() => setIsVisible(true)}>🐞</button>;

    return (
        <div className={`debug-console-container ${isOpen ? 'open' : 'closed'}`}>
            <div className="debug-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="header-left">
                    <Terminal size={16} />
                    <span>Debug Console ({logs.length})</span>
                </div>
                <div className="header-actions">
                    <button onClick={(e) => { e.stopPropagation(); setLogs([]); }} title="Clear">
                        <Trash2 size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIsVisible(false); }} title="Close">
                        <X size={16} />
                    </button>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </div>
            </div>

            {isOpen && (
                <div className="debug-content">
                    {logs.length === 0 && <div className="empty-logs">No logs yet...</div>}
                    {logs.map((log, index) => (
                        <div key={index} className={`log-entry ${log.type}`}>
                            <span className="timestamp">[{log.timestamp}]</span>
                            <pre className="message">{log.message}</pre>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            )}
        </div>
    );
};

export default DebugConsole;
