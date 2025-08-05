/**
 * Challenge/Dashboard Page JavaScript (v2 - Rewritten for Stability)
 * Handles real-time behavioral monitoring and dashboard functionality.
 * This version corrects multiple conflicting implementations from the original file.
 */

class DashboardManager {
    constructor() {
        // Core session properties
        this.socket = null;
        this.sessionId = localStorage.getItem('session_id');
        this.userId = localStorage.getItem('user_id');
        this.username = localStorage.getItem('username');

        // State management
        this.isMonitoring = false;
        this.behavioralBuffer = {
            keystroke: [],
            mouse: []
        };
        this.dataSendInterval = null;

        // UI Element Cache
        this.elements = {};
        this.charts = {};

        // Authentication State
        this.authScoreHistory = [];
        this.anomalyScoreHistory = [];

        this.initialize();
    }

    /**
     * Main initialization function
     */
    initialize() {
        if (!this.sessionId || !this.userId) {
            console.error("No session found. Redirecting to login.");
            window.location.href = '/login';
            return;
        }

        this.cacheElements();
        this.setupEventListeners();
        this.connectWebSocket();
        this.initializeCharts();
        this.updateUserInfo();
        this.startMonitoring();
    }

    /**
     * Cache all necessary DOM elements for performance.
     */
    cacheElements() {
        const ids = [
            'pageTitle', 'sidebarToggle', 'sidebar', 'authStatus', 'statusIndicator',
            'statusText', 'sidebarUsername', 'notificationBtn', 'notificationBadge',
            'notificationDropdown', 'notificationList', 'markAllRead', 'securityScore',
            'securityScoreCircle', 'authScore', 'confidenceLevel', 'anomalyRisk',
            'keystrokeSamples', 'mouseSamples', 'monitorStatus', 'recentActivityList',
            'activityTableBody', 'activityFilter', 'dateFilter', 'refreshActivity',
            'runSecurityCheck', 'updateModels', 'exportLogs', 'testBehavior',
            'enableRealTimeAuth', 'enableAnomalyAlerts', 'enableDriftDetection',
            'authThreshold', 'anomalySensitivity', 'securityAlertModal', 'alertTitle',
            'alertMessage', 'alertDetails', 'acknowledgeAlert', 'investigateAlert',
            'testArea', 'startTest', 'stopTest', 'logoutBtn'
        ];
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });

        this.elements.navLinks = document.querySelectorAll('.nav-link');
        this.elements.contentSections = document.querySelectorAll('.content-section');
    }

    /**
     * Set up all event listeners for the dashboard.
     */
    setupEventListeners() {
        // Main navigation
        this.elements.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSection(link.dataset.section);
            });
        });

        // Logout
        this.elements.logoutBtn.addEventListener('click', () => this.logout());

        // Real-time monitoring events (system-wide)
        document.addEventListener('keydown', (e) => this.captureEvent(e, 'keystroke'));
        document.addEventListener('keyup', (e) => this.captureEvent(e, 'keystroke'));
        document.addEventListener('mousemove', (e) => this.captureEvent(e, 'mouse'));
        document.addEventListener('mousedown', (e) => this.captureEvent(e, 'mouse'));
        document.addEventListener('mouseup', (e) => this.captureEvent(e, 'mouse'));
    }

    /**
     * Connect to the backend via WebSocket.
     */
    connectWebSocket() {
        this.socket = io({
            transports: ['websocket'],
            upgrade: false
        });

        this.socket.on('connect', () => {
            console.log('WebSocket connected successfully.');
            this.socket.emit('join_session', { session_id: this.sessionId });
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.warn('WebSocket disconnected.');
            this.updateConnectionStatus(false);
        });

        this.socket.on('session_joined', (data) => {
            console.log('Session joined:', data.message);
            this.updateStatusIndicator('Authenticated', 'green');
        });

        this.socket.on('auth_result', (data) => {
            this.handleAuthResult(data);
        });

        this.socket.on('session_error', (data) => {
            console.error('Session error:', data.error);
            alert('Your session has expired. Please log in again.');
            this.logout();
        });
    }

    /**
     * Initialize all charts for the dashboard.
     */
    initializeCharts() {
        const behaviorCtx = document.getElementById('behaviorChart');
        if (behaviorCtx) {
            this.charts.behaviorChart = new Chart(behaviorCtx, this.getChartConfig());
        }
    }

    /**
     * Get the configuration for the main behavior chart.
     */
    getChartConfig() {
        return {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Authenticity Score',
                    data: [],
                    borderColor: 'rgb(99, 102, 241)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Anomaly Score',
                    data: [],
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { min: 0, max: 1 },
                },
            }
        };
    }

    /**
     * Start the real-time data collection and sending process.
     */
    startMonitoring() {
        this.isMonitoring = true;
        this.updateMonitoringStatus(true);

        if (this.dataSendInterval) {
            clearInterval(this.dataSendInterval);
        }

        // Send data to the backend every 5 seconds
        this.dataSendInterval = setInterval(() => {
            this.sendBehavioralData();
        }, 5000);
    }

    /**
     * Stop the data collection process.
     */
    stopMonitoring() {
        this.isMonitoring = false;
        this.updateMonitoringStatus(false);
        if (this.dataSendInterval) {
            clearInterval(this.dataSendInterval);
            this.dataSendInterval = null;
        }
    }

    /**
     * Generic event capture function.
     */
    captureEvent(e, type) {
        if (!this.isMonitoring) return;

        let eventData = {
            type: e.type,
            timestamp: performance.now()
        };

        if (type === 'keystroke') {
            eventData.key = e.key;
            this.behavioralBuffer.keystroke.push(eventData);
        } else if (type === 'mouse') {
            eventData.x = e.clientX;
            eventData.y = e.clientY;
            if (e.type !== 'mousemove') {
                 eventData.button = e.button;
            }
            this.behavioralBuffer.mouse.push(eventData);
        }
    }

    /**
     * Send collected behavioral data to the backend.
     */
    sendBehavioralData() {
        if (!this.socket || !this.isMonitoring) return;

        const hasKeystrokeData = this.behavioralBuffer.keystroke.length > 5;
        const hasMouseData = this.behavioralBuffer.mouse.length > 10;

        if (hasKeystrokeData) {
            this.socket.emit('behavioral_data', {
                type: 'keystroke',
                events: this.behavioralBuffer.keystroke,
                timestamp: Date.now()
            });
            this.elements.keystrokeSamples.textContent = parseInt(this.elements.keystrokeSamples.textContent) + this.behavioralBuffer.keystroke.length;
            this.behavioralBuffer.keystroke = [];
        }

        if (hasMouseData) {
            this.socket.emit('behavioral_data', {
                type: 'mouse',
                events: this.behavioralBuffer.mouse,
                timestamp: Date.now()
            });
            this.elements.mouseSamples.textContent = parseInt(this.elements.mouseSamples.textContent) + this.behavioralBuffer.mouse.length;
            this.behavioralBuffer.mouse = [];
        }
    }

    /**
     * Handle the authentication result from the backend.
     */
    handleAuthResult(data) {
        const authScore = parseFloat(data.authenticity_score || 0);
        const anomalyScore = parseFloat(data.anomaly_score || 0);
        const confidence = parseFloat(data.confidence || 0);

        // Update dashboard widgets
        this.elements.authScore.textContent = authScore.toFixed(2);
        this.elements.confidenceLevel.textContent = `${(confidence * 100).toFixed(0)}%`;
        this.elements.anomalyRisk.textContent = anomalyScore < 0.4 ? 'Low' : anomalyScore < 0.7 ? 'Medium' : 'High';
        
        if (authScore >= 0.8) {
            this.updateStatusIndicator('Authenticated', 'green');
        } else if (authScore >= 0.5) {
            this.updateStatusIndicator('Risk Detected', 'yellow');
        } else {
            this.updateStatusIndicator('High Risk', 'red');
        }

        // Update chart data
        this.updateChart(authScore, anomalyScore);
    }

    /**
     * Update the behavior chart with new data.
     */
    updateChart(authScore, anomalyScore) {
        const chart = this.charts.behaviorChart;
        if (!chart) return;

        const now = new Date().toLocaleTimeString();

        // Add new data
        chart.data.labels.push(now);
        chart.data.datasets[0].data.push(authScore);
        chart.data.datasets[1].data.push(anomalyScore);

        // Keep the chart to a fixed number of data points
        const maxDataPoints = 30;
        if (chart.data.labels.length > maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(dataset => dataset.data.shift());
        }
        chart.update();
    }

    /**
     * Show a specific content section.
     */
    showSection(sectionId) {
        this.elements.contentSections.forEach(section => section.classList.remove('active'));
        const activeSection = document.getElementById(`${sectionId}Section`);
        if (activeSection) {
            activeSection.classList.add('active');
        }
        this.elements.pageTitle.textContent = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
    }

    /**
     * Update user info display.
     */
    updateUserInfo() {
        if (this.elements.sidebarUsername) {
            this.elements.sidebarUsername.textContent = this.username;
        }
    }

    /**
     * Update the main connection status indicator.
     */
    updateConnectionStatus(isConnected) {
        const dot = this.elements.statusIndicator.querySelector('.status-dot');
        if (isConnected) {
            dot.style.background = 'var(--secondary-color)';
            this.elements.statusText.textContent = "Connected";
        } else {
            dot.style.background = 'var(--danger-color)';
            this.elements.statusText.textContent = "Disconnected";
        }
    }

    /**
     * Update the real-time authentication status indicator.
     */
    updateStatusIndicator(text, color) {
        this.elements.statusText.textContent = text;
        const dot = this.elements.statusIndicator.querySelector('.status-dot');
        dot.className = `status-dot ${color}`;
    }
    
    /**
     * Update monitoring status text.
     */
    updateMonitoringStatus(isActive) {
         if (this.elements.monitorStatus) {
            const dot = this.elements.monitorStatus.querySelector('.status-dot');
            const text = this.elements.monitorStatus.querySelector('span');
            dot.classList.toggle('active', isActive);
            text.textContent = isActive ? 'Active' : 'Stopped';
        }
    }

    /**
     * Log the user out.
     */
    async logout() {
        this.stopMonitoring();
        if (this.socket) {
            this.socket.disconnect();
        }

        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: this.sessionId })
            });
        } catch (error) {
            console.error('Logout request failed:', error);
        } finally {
            localStorage.clear();
            window.location.href = '/login';
        }
    }
}

// Initialize the dashboard when the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
    new DashboardManager();
    console.log('🛡️ Behavioral Authentication Dashboard Initialized');
});