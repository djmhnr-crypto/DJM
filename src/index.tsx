import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import authRoutes from './routes/auth'
import jobRoutes from './routes/jobs'
import timeLogRoutes from './routes/timeLogs'
import clientRoutes from './routes/clients'
import userRoutes from './routes/users'
import notificationRoutes from './routes/notifications'
import dashboardRoutes from './routes/dashboard'

type Bindings = {
  DB: D1Database
  JWT_SECRET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }))

// API Routes
app.route('/api/auth', authRoutes)
app.route('/api/jobs', jobRoutes)
app.route('/api/time-logs', timeLogRoutes)
app.route('/api/clients', clientRoutes)
app.route('/api/users', userRoutes)
app.route('/api/notifications', notificationRoutes)
app.route('/api/dashboard', dashboardRoutes)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Static files
app.use('/static/*', serveStatic({ root: './' }))

// SPA - serve index.html for all other routes
app.get('*', (c) => {
  return c.html(getHTML())
})

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>FieldVibe - Dispatch</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/plugin/relativeTime.min.js"></script>

  <style>
    :root {
      --primary: #4F46E5;
      --primary-dark: #3730A3;
      --secondary: #10B981;
      --danger: #EF4444;
      --warning: #F59E0B;
    }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .sidebar { transition: transform 0.3s ease; }
    .fade-in { animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .card-hover { transition: all 0.2s ease; }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.12); }
    .pulse-dot { animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
    .calendar-grid { display: grid; grid-template-columns: 60px repeat(7, 1fr); }
    .status-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
    .priority-urgent { border-left: 3px solid #EF4444; }
    .priority-high { border-left: 3px solid #F59E0B; }
    .priority-normal { border-left: 3px solid #3B82F6; }
    .priority-low { border-left: 3px solid #6B7280; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .modal-content { background: white; border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px rgba(0,0,0,0.25); }
    .nav-item { transition: all 0.15s ease; }
    .nav-item:hover { background: rgba(255,255,255,0.1); }
    .nav-item.active { background: rgba(255,255,255,0.2); }
    .timer-display { font-variant-numeric: tabular-nums; letter-spacing: 2px; }
    .tech-avatar { font-weight: 700; font-size: 14px; }
    .job-card { border-radius: 12px; transition: all 0.2s; }
    .job-card:hover { filter: brightness(0.97); }
    ::-webkit-scrollbar { width: 6px; } 
    ::-webkit-scrollbar-track { background: #f1f1f1; }
    ::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 3px; }
    .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e5e7eb; z-index: 40; }
    .toast { position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 360px; }
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); position: fixed; z-index: 40; height: 100vh; }
      .sidebar.open { transform: translateX(0); }
      .main-content { margin-left: 0 !important; }
    }
  </style>
</head>
<body class="bg-gray-50 text-gray-900">
  <div id="app">
    <div class="flex items-center justify-center h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p class="text-gray-500">Loading FieldVibe...</p>
      </div>
    </div>
  </div>
  <div id="toast-container" class="toast"></div>

  <script>
    dayjs.extend(dayjs_plugin_relativeTime);

    // =================== STATE ===================
    const state = {
      user: null, token: null, currentView: 'dashboard',
      jobs: [], clients: [], users: [], notifications: [],
      unreadCount: 0, activeLog: null, timerInterval: null,
      calendarDate: new Date(), calendarView: 'week',
      modalOpen: false, editingJob: null,
      dashboardStats: null, timeSummary: []
    };

    // =================== API ===================
    const api = axios.create({ baseURL: '/api' });
    api.interceptors.request.use(config => {
      if (state.token) config.headers.Authorization = 'Bearer ' + state.token;
      return config;
    });
    api.interceptors.response.use(r => r, err => {
      if (err.response?.status === 401) logout();
      return Promise.reject(err);
    });

    async function apiCall(method, url, data) {
      try {
        const r = await api({ method, url, data });
        return r.data;
      } catch (e) {
        const msg = e.response?.data?.error || e.message || 'Request failed';
        showToast(msg, 'error');
        throw e;
      }
    }

    // =================== AUTH ===================
    function saveAuth(token, user) {
      state.token = token; state.user = user;
      localStorage.setItem('fv_token', token);
      localStorage.setItem('fv_user', JSON.stringify(user));
    }
    function logout() {
      state.token = null; state.user = null;
      localStorage.removeItem('fv_token'); localStorage.removeItem('fv_user');
      if (state.timerInterval) clearInterval(state.timerInterval);
      renderApp();
    }
    async function login(email, password) {
      const data = await apiCall('post', '/auth/login', { email, password });
      saveAuth(data.token, data.user);
      await loadInitialData();
      renderApp();
    }

    // =================== DATA LOADING ===================
    async function loadInitialData() {
      try {
        const promises = [loadNotifications(), loadDashboardStats()];
        if (state.user.role === 'ADMIN') {
          promises.push(loadJobs(), loadClients(), loadUsers());
        } else {
          promises.push(loadActiveLog());
        }
        await Promise.all(promises);
      } catch(e) { console.error(e); }
    }

    async function loadJobs(params = {}) {
      const qp = new URLSearchParams(params).toString();
      state.jobs = await apiCall('get', '/jobs' + (qp ? '?' + qp : ''));
      return state.jobs;
    }
    async function loadClients() { state.clients = await apiCall('get', '/clients'); return state.clients; }
    async function loadUsers() { state.users = await apiCall('get', '/users'); return state.users; }
    async function loadNotifications() {
      state.notifications = await apiCall('get', '/notifications');
      const r = await apiCall('get', '/notifications/unread-count');
      state.unreadCount = r.count;
      return state.notifications;
    }
    async function loadDashboardStats() {
      state.dashboardStats = await apiCall('get', '/dashboard/stats');
      return state.dashboardStats;
    }
    async function loadActiveLog() {
      state.activeLog = await apiCall('get', '/time-logs/active');
      if (state.activeLog) startTimer();
      return state.activeLog;
    }
    async function loadTimeSummary(startDate, endDate) {
      const params = new URLSearchParams({ startDate: startDate || '', endDate: endDate || '' }).toString();
      state.timeSummary = await apiCall('get', '/time-logs/summary?' + params);
      return state.timeSummary;
    }

    // =================== TOAST ===================
    function showToast(message, type = 'success') {
      const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' };
      const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
      const el = document.createElement('div');
      el.className = \`flex items-center gap-3 px-4 py-3 rounded-xl text-white shadow-lg mb-2 fade-in \${colors[type]}\`;
      el.innerHTML = \`<i class="fas \${icons[type]}"></i><span class="text-sm font-medium">\${escHtml(message)}</span>\`;
      const container = document.getElementById('toast-container');
      container.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
    }

    function escHtml(str) {
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // =================== TIMER ===================
    function startTimer() {
      if (state.timerInterval) clearInterval(state.timerInterval);
      state.timerInterval = setInterval(updateTimerDisplay, 1000);
      updateTimerDisplay();
    }
    function updateTimerDisplay() {
      const el = document.getElementById('timer-display');
      if (!el || !state.activeLog) return;
      const start = new Date(state.activeLog.clock_in_time);
      const elapsed = Math.floor((Date.now() - start.getTime()) / 1000);
      const h = Math.floor(elapsed / 3600).toString().padStart(2,'0');
      const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2,'0');
      const s = (elapsed % 60).toString().padStart(2,'0');
      el.textContent = h + ':' + m + ':' + s;
    }

    // =================== COLORS & UTILS ===================
    function statusBadge(status) {
      const map = {
        ASSIGNED: 'bg-blue-100 text-blue-700',
        IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
        COMPLETED: 'bg-green-100 text-green-700',
        CANCELLED: 'bg-gray-100 text-gray-500'
      };
      const labels = { ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
      return \`<span class="status-badge \${map[status] || 'bg-gray-100 text-gray-600'}">\${labels[status] || status}</span>\`;
    }
    function priorityIcon(p) {
      const map = { URGENT: '🔴', HIGH: '🟠', NORMAL: '🔵', LOW: '⚪' };
      return map[p] || '🔵';
    }
    function avatarHtml(name, color, size = 'w-8 h-8') {
      const initials = name ? name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : '?';
      return \`<div class="\${size} rounded-full flex items-center justify-center tech-avatar text-white flex-shrink-0" style="background:\${color||'#6B7280'}">\${initials}</div>\`;
    }
    function formatDuration(minutes) {
      if (!minutes) return '-';
      const h = Math.floor(minutes / 60), m = minutes % 60;
      return h > 0 ? \`\${h}h \${m}m\` : \`\${m}m\`;
    }
    function formatTime(dt) { return dt ? dayjs(dt).format('h:mm A') : '-'; }
    function formatDate(dt) { return dt ? dayjs(dt).format('MMM D, YYYY') : '-'; }
    function formatDateTime(dt) { return dt ? dayjs(dt).format('MMM D, h:mm A') : '-'; }

    // =================== RENDER ENGINE ===================
    function renderApp() {
      const app = document.getElementById('app');
      if (!state.token || !state.user) { app.innerHTML = renderLogin(); bindLoginEvents(); return; }
      if (state.user.role === 'ADMIN') { app.innerHTML = renderAdminLayout(); bindAdminEvents(); }
      else { app.innerHTML = renderTechLayout(); bindTechEvents(); }
    }

    // =================== LOGIN PAGE ===================
    function renderLogin() {
      return \`
      <div class="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 flex items-center justify-center p-4">
        <div class="w-full max-w-md">
          <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
              <i class="fas fa-truck text-3xl text-indigo-600"></i>
            </div>
            <h1 class="text-3xl font-bold text-white">FieldVibe</h1>
            <p class="text-indigo-200 mt-1">Technician Dispatch Management</p>
          </div>
          <div class="bg-white rounded-2xl shadow-2xl p-8">
            <h2 class="text-xl font-semibold text-gray-800 mb-6">Sign In</h2>
            <div id="login-error" class="hidden bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 mb-4 text-sm"></div>
            <form id="login-form">
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <div class="relative">
                  <i class="fas fa-envelope absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input id="login-email" type="email" placeholder="you@fieldvibe.com" required
                    class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
              </div>
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div class="relative">
                  <i class="fas fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input id="login-password" type="password" placeholder="••••••••" required
                    class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
              </div>
              <button type="submit" id="login-btn"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <i class="fas fa-sign-in-alt"></i> Sign In
              </button>
            </form>
            <div class="mt-6 p-4 bg-gray-50 rounded-xl">
              <p class="text-xs font-semibold text-gray-500 mb-2">Demo Accounts (password: password123)</p>
              <div class="grid grid-cols-2 gap-2">
                <button onclick="demoLogin('admin@fieldvibe.com')" class="text-xs bg-indigo-100 text-indigo-700 rounded-lg px-3 py-2 hover:bg-indigo-200 transition font-medium">
                  <i class="fas fa-user-shield mr-1"></i> Admin
                </button>
                <button onclick="demoLogin('john.smith@fieldvibe.com')" class="text-xs bg-green-100 text-green-700 rounded-lg px-3 py-2 hover:bg-green-200 transition font-medium">
                  <i class="fas fa-hard-hat mr-1"></i> Technician
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>\`;
    }

    function demoLogin(email) {
      document.getElementById('login-email').value = email;
      document.getElementById('login-password').value = 'password123';
      document.getElementById('login-form').dispatchEvent(new Event('submit'));
    }

    function bindLoginEvents() {
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const errEl = document.getElementById('login-error');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Signing in...';
        errEl.classList.add('hidden');
        try {
          await login(document.getElementById('login-email').value, document.getElementById('login-password').value);
        } catch(err) {
          errEl.textContent = err.response?.data?.error || 'Invalid credentials'; errEl.classList.remove('hidden');
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Sign In';
        }
      });
    }

    // =================== ADMIN LAYOUT ===================
    function renderAdminLayout() {
      const views = {
        dashboard: renderAdminDashboard,
        jobs: renderJobsView,
        calendar: renderCalendar,
        clients: renderClientsView,
        technicians: renderTechniciansView,
        reports: renderReportsView,
        notifications: renderNotificationsView
      };
      const navItems = [
        { id: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard' },
        { id: 'calendar', icon: 'fa-calendar-alt', label: 'Calendar' },
        { id: 'jobs', icon: 'fa-briefcase', label: 'Jobs' },
        { id: 'technicians', icon: 'fa-hard-hat', label: 'Technicians' },
        { id: 'clients', icon: 'fa-building', label: 'Clients' },
        { id: 'reports', icon: 'fa-chart-bar', label: 'Reports' },
      ];

      const sidebarNav = navItems.map(item => \`
        <a href="#" onclick="navigate('\${item.id}'); return false;" 
          class="nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
          \${state.currentView === item.id ? 'active text-white bg-white/20' : 'text-indigo-200 hover:text-white'}">
          <i class="fas \${item.icon} w-5 text-center"></i>
          <span>\${item.label}</span>
        </a>
      \`).join('');

      return \`
      <div class="flex h-screen overflow-hidden">
        <!-- Sidebar -->
        <aside id="sidebar" class="sidebar w-60 bg-gradient-to-b from-indigo-700 to-indigo-900 flex flex-col flex-shrink-0 h-full z-40">
          <div class="p-5 border-b border-indigo-600">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
                <i class="fas fa-truck text-indigo-600 text-lg"></i>
              </div>
              <div>
                <h1 class="text-white font-bold text-base leading-tight">FieldVibe</h1>
                <p class="text-indigo-300 text-xs">Dispatch</p>
              </div>
            </div>
          </div>
          <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
            \${sidebarNav}
          </nav>
          <div class="p-3 border-t border-indigo-600">
            <button onclick="navigate('notifications')" class="w-full nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-indigo-200 hover:text-white transition-all">
              <div class="relative w-5 flex justify-center">
                <i class="fas fa-bell"></i>
                \${state.unreadCount > 0 ? \`<span class="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">\${state.unreadCount > 9 ? '9+' : state.unreadCount}</span>\` : ''}
              </div>
              <span>Notifications</span>
            </button>
            <div class="flex items-center gap-3 px-4 py-3 rounded-xl mt-1">
              \${avatarHtml(state.user.name, state.user.avatarColor)}
              <div class="flex-1 min-w-0">
                <p class="text-white text-sm font-medium truncate">\${escHtml(state.user.name)}</p>
                <p class="text-indigo-300 text-xs">Admin</p>
              </div>
              <button onclick="logout()" class="text-indigo-300 hover:text-white transition ml-1" title="Logout">
                <i class="fas fa-sign-out-alt text-sm"></i>
              </button>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <div class="main-content flex-1 flex flex-col overflow-hidden">
          <!-- Top Bar -->
          <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-3">
              <button id="sidebar-toggle" class="md:hidden text-gray-500 hover:text-gray-700" onclick="toggleSidebar()">
                <i class="fas fa-bars text-xl"></i>
              </button>
              <div>
                <h2 class="text-lg font-semibold text-gray-800 capitalize">\${state.currentView === 'dashboard' ? 'Dashboard' : state.currentView}</h2>
                <p class="text-xs text-gray-500">\${dayjs().format('dddd, MMMM D, YYYY')}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button onclick="navigate('notifications')" class="relative p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition">
                <i class="fas fa-bell text-lg"></i>
                \${state.unreadCount > 0 ? \`<span class="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">\${state.unreadCount > 9 ? '9+' : state.unreadCount}</span>\` : ''}
              </button>
              <button onclick="openJobModal()" class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                <i class="fas fa-plus"></i> New Job
              </button>
            </div>
          </header>

          <!-- Page Content -->
          <main class="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div id="main-view" class="fade-in">
              \${(views[state.currentView] || renderAdminDashboard)()}
            </div>
          </main>
        </div>
      </div>
      \${renderClientModal()}
      \${renderUserModal()}
      \`;
    }

    function toggleSidebar() {
      document.getElementById('sidebar')?.classList.toggle('open');
    }

    // =================== ADMIN DASHBOARD ===================
    function renderAdminDashboard() {
      const stats = state.dashboardStats;
      if (!stats) return \`<div class="text-center py-20 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>\`;

      const j = stats.jobs || {};
      const kpis = [
        { label: "Today's Jobs", value: j.today || 0, icon: 'fa-calendar-day', color: 'indigo', sub: 'scheduled' },
        { label: 'In Progress', value: j.in_progress || 0, icon: 'fa-play-circle', color: 'yellow', sub: 'active now' },
        { label: 'Completed This Week', value: j.week_completed || 0, icon: 'fa-check-circle', color: 'green', sub: 'jobs done' },
        { label: 'Active Technicians', value: (stats.techActivity || []).filter(t => t.active_log_id).length, icon: 'fa-hard-hat', color: 'blue', sub: \`of \${stats.technicians?.active || 0} total\` }
      ];
      const colorMap = { indigo: 'bg-indigo-50 text-indigo-600', yellow: 'bg-yellow-50 text-yellow-600', green: 'bg-green-50 text-green-600', blue: 'bg-blue-50 text-blue-600' };

      return \`
      <div class="space-y-6">
        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          \${kpis.map(k => \`
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 card-hover">
            <div class="flex items-start justify-between mb-3">
              <div class="w-10 h-10 \${colorMap[k.color]} rounded-xl flex items-center justify-center">
                <i class="fas \${k.icon}"></i>
              </div>
            </div>
            <p class="text-3xl font-bold text-gray-800">\${k.value}</p>
            <p class="text-sm font-medium text-gray-600 mt-0.5">\${k.label}</p>
            <p class="text-xs text-gray-400 mt-1">\${k.sub}</p>
          </div>
          \`).join('')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Today's Jobs -->
          <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-gray-800">Today's Schedule</h3>
              <button onclick="navigate('calendar')" class="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View Calendar →</button>
            </div>
            \${(stats.todayJobs || []).length === 0 ? \`
              <div class="text-center py-10 text-gray-400">
                <i class="fas fa-calendar-check text-3xl mb-2"></i>
                <p class="text-sm">No jobs scheduled today</p>
              </div>
            \` : (stats.todayJobs || []).map(job => \`
              <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer job-card mb-2 priority-\${(job.priority||'NORMAL').toLowerCase()}" onclick="viewJob('\${job.id}')">
                <div class="w-1 h-10 rounded-full flex-shrink-0" style="background:\${job.color}"></div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-gray-800 text-sm truncate">\${escHtml(job.title)}</p>
                  <p class="text-xs text-gray-500">\${escHtml(job.client_name||'')} • \${formatTime(job.scheduled_start)}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  \${avatarHtml(job.technician_name, job.avatar_color, 'w-7 h-7')}
                  \${statusBadge(job.status)}
                </div>
              </div>
            \`).join('')}
          </div>

          <!-- Technician Status -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-gray-800">Field Team</h3>
              <button onclick="navigate('technicians')" class="text-xs text-indigo-600 font-medium">Manage →</button>
            </div>
            <div class="space-y-3">
              \${(stats.techActivity || []).map(t => \`
              <div class="flex items-center gap-3">
                \${avatarHtml(t.name, t.avatar_color)}
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">\${escHtml(t.name)}</p>
                  <p class="text-xs text-gray-500 truncate">\${t.current_job ? escHtml(t.current_job) : t.specialty || 'Available'}</p>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <div class="w-2 h-2 rounded-full \${t.active_log_id ? 'bg-green-400 pulse-dot' : 'bg-gray-300'}"></div>
                  <span class="text-xs \${t.active_log_id ? 'text-green-600 font-medium' : 'text-gray-400'}">\${t.active_log_id ? 'On Job' : 'Available'}</span>
                </div>
              </div>
              \`).join('')}
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 class="font-semibold text-gray-800 mb-4">Recent Activity</h3>
          <div class="space-y-2">
            \${(stats.recentActivity || []).map(job => \`
            <div class="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer" onclick="viewJob('\${job.id}')">
              <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:\${job.color}"></div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-800 truncate">\${escHtml(job.title)}</p>
                <p class="text-xs text-gray-500">\${escHtml(job.client_name||'')} • \${escHtml(job.technician_name||'Unassigned')}</p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                \${statusBadge(job.status)}
                <span class="text-xs text-gray-400">\${dayjs(job.updated_at).fromNow()}</span>
              </div>
            </div>
            \`).join('')}
          </div>
        </div>
      </div>\`;
    }

    // =================== CALENDAR VIEW ===================
    function renderCalendar() {
      var today       = dayjs(state.calendarDate);
      var startOfWeek = today.startOf('week');
      var days        = [];
      for (var di = 0; di < 7; di++) days.push(startOfWeek.add(di, 'day'));

      // ─── 시간 범위 상수 ───────────────────────────────────
      var HOUR_START  = 7;    // 07:00 표시 시작
      var HOUR_END    = 20;   // 20:00 까지 표시 (12→13시간)
      var TOTAL_HOURS = HOUR_END - HOUR_START;  // 13
      var ROW_H       = 60;   // 1시간 = 60px (계산하기 쉽게 60으로)
      var GRID_H      = TOTAL_HOURS * ROW_H;    // 780px

      // ─── 이번 주 job 필터 ────────────────────────────────
      var weekStart = days[0].format('YYYY-MM-DD');
      var weekEnd   = days[6].format('YYYY-MM-DD');
      var weekJobs  = (state.jobs || []).filter(function(j) {
        if (!j.scheduledStart) return false;
        var d = j.scheduledStart.substring(0, 10); // "YYYY-MM-DD" fast slice
        return d >= weekStart && d <= weekEnd;
      });

      var gridCols = '52px repeat(7, minmax(0, 1fr))';

      // ─── 요일 헤더 ──────────────────────────────────────
      var todayStr = dayjs().format('YYYY-MM-DD');
      var dayHeaders = days.map(function(d) {
        var dStr    = d.format('YYYY-MM-DD');
        var isToday = dStr === todayStr;
        return '<div style="text-align:center;padding:8px 4px;border-right:1px solid #f3f4f6;min-width:0;">'
          + '<p style="font-size:11px;font-weight:600;color:#6b7280;margin:0;">' + d.format('ddd').toUpperCase() + '</p>'
          + '<div style="display:flex;align-items:center;justify-content:center;margin-top:2px;">'
          + '<span style="font-size:16px;font-weight:700;line-height:1;'
          + (isToday
              ? 'width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:#4f46e5;color:#fff;'
              : 'color:#374151;')
          + '">' + d.format('D') + '</span>'
          + '</div></div>';
      }).join('');

      // ─── 시간 눈금 라벨 ──────────────────────────────────
      var timeLabels = '';
      for (var h = HOUR_START; h <= HOUR_END; h++) {
        var ampm  = h >= 12 ? 'pm' : 'am';
        var h12   = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        var label = h12 + ampm;
        var topPx = (h - HOUR_START) * ROW_H;
        timeLabels += '<div style="position:absolute;top:' + topPx + 'px;right:6px;'
          + 'font-size:10px;font-weight:500;color:#9ca3af;line-height:1;transform:translateY(-7px);white-space:nowrap;">'
          + label + '</div>';
      }

      // ─── 수평 구분선 ────────────────────────────────────
      var hLines = '';
      for (var hh = 0; hh <= TOTAL_HOURS; hh++) {
        hLines += '<div style="position:absolute;left:0;right:0;top:' + (hh * ROW_H) + 'px;'
          + 'border-top:1px solid ' + (hh === 0 ? '#d1d5db' : '#f3f4f6') + ';pointer-events:none;"></div>';
        // 30분 보조선
        if (hh < TOTAL_HOURS) {
          hLines += '<div style="position:absolute;left:0;right:0;top:' + (hh * ROW_H + ROW_H / 2) + 'px;'
            + 'border-top:1px dashed #f9fafb;pointer-events:none;"></div>';
        }
      }

      // ─── 각 날짜 열: job 블록 절대 배치 ────────────────
      var dayCols = days.map(function(day) {
        var dStr    = day.format('YYYY-MM-DD');
        var isToday = dStr === todayStr;

        // 이 날의 job들 (scheduledStart의 날짜 기준)
        var dayJobs = weekJobs.filter(function(j) {
          return j.scheduledStart.substring(0, 10) === dStr;
        });

        // 시작 시간 순 정렬
        dayJobs.sort(function(a, b) {
          return (a.scheduledStart || '').localeCompare(b.scheduledStart || '');
        });

        // ── 겹침 처리: 컬럼 레이아웃 계산 ──────────────
        // columns[i] = i번 열의 현재까지 최대 end 시각(분 단위)
        var colEnds = [];
        var layout = dayJobs.map(function(j) {
          var startDj = dayjs(j.scheduledStart);
          var startMin = startDj.hour() * 60 + startDj.minute();
          var endDj   = j.scheduledEnd ? dayjs(j.scheduledEnd) : startDj.add(1, 'hour');
          var endMin  = endDj.hour() * 60 + endDj.minute();
          if (endMin <= startMin) endMin = startMin + 30; // 최소 30분

          // 배치할 열 선택 (endMin이 startMin보다 크거나 같은 열 제외)
          var col = 0;
          while (col < colEnds.length && colEnds[col] > startMin) col++;
          colEnds[col] = endMin;
          return { job: j, col: col, startMin: startMin, endMin: endMin };
        });
        var totalCols = colEnds.length || 1;

        var jobBlocks = layout.map(function(item) {
          var j        = item.job;
          var startMin = item.startMin;
          var endMin   = item.endMin;

          // 표시 범위 클램프 (HOUR_START ~ HOUR_END)
          var displayStart = Math.max(startMin, HOUR_START * 60);
          var displayEnd   = Math.min(endMin,   HOUR_END   * 60);
          if (displayEnd <= displayStart) return '';

          // px 위치 계산: (분 오프셋 / 60) * ROW_H
          var topPx    = ((displayStart - HOUR_START * 60) / 60) * ROW_H;
          var heightPx = Math.max(((displayEnd - displayStart) / 60) * ROW_H - 2, 20);

          // 너비/좌측 위치 (겹침 처리)
          var colW    = 100 / totalCols;
          var leftPct = item.col * colW;

          var jid       = j.id;
          var jtitle    = escHtml(j.title || '');
          var jcolor    = j.color || '#3B82F6';
          var timeRange = formatTime(j.scheduledStart) + ' – ' + formatTime(j.scheduledEnd);
          var jtech     = escHtml((j.technician && j.technician.name) || '');
          var showDetail = heightPx >= 38;

          return '<div onclick="viewJob(&quot;' + jid + '&quot;)" '
            + 'title="' + jtitle + ' (' + timeRange + ')"'
            + ' style="position:absolute;'
            + 'top:'    + topPx.toFixed(1)    + 'px;'
            + 'height:' + heightPx.toFixed(1) + 'px;'
            + 'left:calc('  + leftPct.toFixed(1) + '% + 2px);'
            + 'width:calc(' + colW.toFixed(1)    + '% - 4px);'
            + 'background:' + jcolor + ';'
            + 'border-radius:5px;'
            + 'padding:3px 6px;'
            + 'cursor:pointer;'
            + 'overflow:hidden;'
            + 'box-shadow:0 1px 4px rgba(0,0,0,0.18);'
            + 'border-left:3px solid rgba(0,0,0,0.18);'
            + 'z-index:2;'
            + 'transition:opacity 0.15s;"'
            + ' onmouseover="this.style.opacity=0.85"'
            + ' onmouseout="this.style.opacity=1">'
            + '<div style="font-size:11px;font-weight:700;color:#fff;'
            + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35;">'
            + jtitle + '</div>'
            + (showDetail
                ? '<div style="font-size:10px;color:rgba(255,255,255,0.88);'
                  + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;">'
                  + timeRange + (jtech ? ' · ' + jtech : '') + '</div>'
                : '')
            + '</div>';
        }).join('');

        return '<div style="position:relative;min-width:0;border-right:1px solid #f3f4f6;height:' + GRID_H + 'px;'
          + (isToday ? 'background:rgba(79,70,229,0.025);' : '') + '">'
          + hLines
          + jobBlocks
          + '</div>';
      }).join('');

      // ─── 현재 시각 표시선 ────────────────────────────────
      var nowLine = '';
      var nowDj   = dayjs();
      var nowMin  = nowDj.hour() * 60 + nowDj.minute();
      if (nowMin >= HOUR_START * 60 && nowMin < HOUR_END * 60) {
        var isThisWeek = todayStr >= weekStart && todayStr <= weekEnd;
        if (isThisWeek) {
          var nowTop = ((nowMin - HOUR_START * 60) / 60) * ROW_H;
          nowLine = '<div style="position:absolute;left:0;right:0;top:' + nowTop.toFixed(1) + 'px;'
            + 'border-top:2px solid #ef4444;z-index:4;pointer-events:none;">'
            + '<div style="position:absolute;left:-5px;top:-5px;width:10px;height:10px;'
            + 'border-radius:50%;background:#ef4444;"></div>'
            + '</div>';
        }
      }

      return '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">'
        // ── 헤더 바 ─────────────────────────────────────
        + '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f3f4f6;">'
        +   '<div style="display:flex;align-items:center;gap:6px;">'
        +     '<button onclick="changeWeek(-1)" class="p-2 hover:bg-gray-100 rounded-lg transition"><i class="fas fa-chevron-left" style="color:#4b5563;"></i></button>'
        +     '<span style="font-weight:600;font-size:14px;color:#111827;">' + days[0].format('MMM D') + ' – ' + days[6].format('MMM D, YYYY') + '</span>'
        +     '<button onclick="changeWeek(1)" class="p-2 hover:bg-gray-100 rounded-lg transition"><i class="fas fa-chevron-right" style="color:#4b5563;"></i></button>'
        +   '</div>'
        +   '<div style="display:flex;align-items:center;gap:8px;">'
        +     '<button onclick="goToToday()" class="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">Today</button>'
        +     '<button onclick="openJobModal()" class="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"><i class="fas fa-plus"></i> New Job</button>'
        +   '</div>'
        + '</div>'
        // ── 요일 헤더 행 ─────────────────────────────────
        + '<div style="display:grid;grid-template-columns:' + gridCols + ';border-bottom:1px solid #e5e7eb;">'
        +   '<div></div>' + dayHeaders
        + '</div>'
        // ── 시간 그리드 스크롤 영역 ──────────────────────
        + '<div style="overflow-y:auto;max-height:600px;">'
        +   '<div style="display:grid;grid-template-columns:' + gridCols + ';">'
        // 시간 라벨 열
        +     '<div style="position:relative;height:' + GRID_H + 'px;border-right:1px solid #e5e7eb;">'
        +       timeLabels
        +     '</div>'
        // 날짜 열 컨테이너 (nowLine 공유)
        +     '<div style="position:relative;grid-column:2/-1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));">'
        +       (nowLine
          ? '<div style="position:absolute;left:0;right:0;top:0;height:' + GRID_H + 'px;pointer-events:none;z-index:4;">' + nowLine + '</div>'
          : '')
        +       dayCols
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '</div>';
    }

    function changeWeek(dir) {
      state.calendarDate = dayjs(state.calendarDate).add(dir * 7, 'day').toDate();
      refreshView();
    }
    function goToToday() { state.calendarDate = new Date(); refreshView(); }

    // =================== JOBS VIEW ===================
    function renderJobsView() {
      const statusFilter = window._jobFilter || 'ALL';
      const filtered = statusFilter === 'ALL' ? state.jobs : state.jobs.filter(j => j.status === statusFilter);
      const tabs = ['ALL','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'];

      return \`
      <div class="space-y-4">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex gap-1 flex-wrap">
          \${tabs.map(t => \`<button onclick="filterJobs('\${t}')" class="px-4 py-2 rounded-xl text-sm font-medium transition flex-1 min-w-0
            \${statusFilter === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}">\${t === 'ALL' ? 'All Jobs' : t.replace('_',' ')}</button>\`).join('')}
        </div>
        <div class="space-y-3">
          \${filtered.length === 0 ? \`
            <div class="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <i class="fas fa-briefcase text-3xl text-gray-300 mb-3"></i>
              <p class="text-gray-500">No jobs found</p>
              <button onclick="openJobModal()" class="mt-3 text-indigo-600 text-sm font-medium hover:underline">Create a job →</button>
            </div>
          \` : filtered.map(job => renderJobCard(job)).join('')}
        </div>
      </div>\`;
    }

    function renderJobCard(job) {
      return \`
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 job-card cursor-pointer priority-\${(job.priority||'NORMAL').toLowerCase()} card-hover" onclick="viewJob('\${job.id}')">
        <div class="flex items-start gap-3">
          <div class="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style="background:\${job.color}"></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h3 class="font-semibold text-gray-800">\${escHtml(job.title)}</h3>
                <p class="text-sm text-gray-500 mt-0.5">\${escHtml(job.client?.name||'No Client')} \${job.serviceType ? '• ' + escHtml(job.serviceType) : ''}</p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                \${priorityIcon(job.priority)}
                \${statusBadge(job.status)}
              </div>
            </div>
            <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span><i class="far fa-clock mr-1"></i>\${formatDateTime(job.scheduledStart)}</span>
              \${job.locationAddress ? \`<span><i class="fas fa-map-marker-alt mr-1"></i>\${escHtml(job.locationAddress)}</span>\` : ''}
            </div>
          </div>
          <div class="flex-shrink-0 ml-2">
            \${job.technician ? avatarHtml(job.technician.name, job.technician.avatarColor) : \`<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><i class="fas fa-user-slash text-gray-400 text-sm"></i></div>\`}
          </div>
        </div>
      </div>\`;
    }

    function filterJobs(filter) {
      window._jobFilter = filter;
      refreshView();
    }

    // =================== TECHNICIANS VIEW ===================
    function renderTechniciansView() {
      const techs = state.users.filter(u => u.role === 'TECHNICIAN');
      return \`
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-500">\${techs.length} Technicians</h3>
          <button onclick="openUserModal()" class="flex items-center gap-2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition">
            <i class="fas fa-plus"></i> Add Technician
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          \${techs.map(t => \`
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover">
            <div class="flex items-center gap-3 mb-4">
              \${avatarHtml(t.name, t.avatar_color, 'w-12 h-12 text-lg')}
              <div>
                <h3 class="font-semibold text-gray-800">\${escHtml(t.name)}</h3>
                <p class="text-sm text-gray-500">\${escHtml(t.specialty||'General')}</p>
              </div>
              <div class="ml-auto">
                <span class="text-xs px-2 py-1 rounded-full font-medium \${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">\${t.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="bg-gray-50 rounded-xl p-2.5">
                <p class="text-xl font-bold text-gray-800">\${t.total_jobs||0}</p>
                <p class="text-xs text-gray-500">Total</p>
              </div>
              <div class="bg-yellow-50 rounded-xl p-2.5">
                <p class="text-xl font-bold text-yellow-600">\${t.active_jobs||0}</p>
                <p class="text-xs text-gray-500">Active</p>
              </div>
              <div class="bg-green-50 rounded-xl p-2.5">
                <p class="text-xl font-bold text-green-600">\${t.completed_jobs||0}</p>
                <p class="text-xs text-gray-500">Done</p>
              </div>
            </div>
            <div class="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
              <i class="fas fa-phone text-xs"></i>
              <span>\${escHtml(t.phone||'No phone')}</span>
            </div>
          </div>
          \`).join('')}
        </div>
      </div>\`;
    }

    // =================== CLIENTS VIEW ===================
    function renderClientsView() {
      return \`
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-500">\${state.clients.length} Clients</h3>
          <button onclick="openClientModal()" class="flex items-center gap-2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition">
            <i class="fas fa-plus"></i> Add Client
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          \${state.clients.map(c => \`
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h3 class="font-semibold text-gray-800">\${escHtml(c.name)}</h3>
                <p class="text-xs text-gray-400 mt-0.5">\${c.job_count||0} total jobs</p>
              </div>
              <button onclick="editClient('\${c.id}')" class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                <i class="fas fa-edit text-sm"></i>
              </button>
            </div>
            <div class="space-y-1.5 text-sm text-gray-600">
              \${c.phone ? \`<div class="flex items-center gap-2"><i class="fas fa-phone w-4 text-gray-400"></i>\${escHtml(c.phone)}</div>\` : ''}
              \${c.email ? \`<div class="flex items-center gap-2"><i class="fas fa-envelope w-4 text-gray-400"></i>\${escHtml(c.email)}</div>\` : ''}
              \${c.address ? \`<div class="flex items-center gap-2"><i class="fas fa-map-marker-alt w-4 text-gray-400"></i><span class="truncate">\${escHtml(c.address)}</span></div>\` : ''}
            </div>
            \${c.notes ? \`<p class="text-xs text-gray-400 mt-3 italic truncate">\${escHtml(c.notes)}</p>\` : ''}
          </div>
          \`).join('')}
        </div>
      </div>\`;
    }

    // =================== REPORTS VIEW ===================
    function renderReportsView() {
      const summary = state.timeSummary;
      if (summary.length === 0) loadTimeSummary().then(refreshView);

      const totalMins = summary.reduce((a,b) => a + (b.total_minutes||0), 0);
      const totalJobs = summary.reduce((a,b) => a + (b.jobs_worked||0), 0);

      return \`
      <div class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 class="font-semibold text-gray-800 mb-4">Weekly Time Summary</h3>
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="bg-indigo-50 rounded-xl p-4 text-center">
              <p class="text-2xl font-bold text-indigo-600">\${formatDuration(totalMins)}</p>
              <p class="text-sm text-indigo-500 font-medium">Total Hours</p>
            </div>
            <div class="bg-green-50 rounded-xl p-4 text-center">
              <p class="text-2xl font-bold text-green-600">\${totalJobs}</p>
              <p class="text-sm text-green-500 font-medium">Jobs Worked</p>
            </div>
          </div>
          \${summary.length === 0 ? \`<p class="text-gray-400 text-center py-8">Loading...</p>\` : \`
          <div class="space-y-3">
            \${summary.map(t => {
              const pct = totalMins > 0 ? Math.round((t.total_minutes||0) / totalMins * 100) : 0;
              return \`
              <div>
                <div class="flex items-center gap-3 mb-1.5">
                  \${avatarHtml(t.name, t.avatar_color)}
                  <div class="flex-1">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-medium text-gray-800">\${escHtml(t.name)}</span>
                      <span class="text-sm font-bold text-gray-600">\${formatDuration(t.total_minutes||0)}</span>
                    </div>
                    <p class="text-xs text-gray-500">\${t.specialty||''} • \${t.jobs_worked||0} jobs</p>
                  </div>
                </div>
                <div class="bg-gray-100 rounded-full h-2 ml-11">
                  <div class="h-2 rounded-full transition-all" style="width:\${pct}%; background:\${t.avatar_color}"></div>
                </div>
              </div>\`;
            }).join('')}
          </div>\`}
        </div>

        <!-- Job Status Breakdown -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 class="font-semibold text-gray-800 mb-4">Job Status Overview</h3>
          \${(() => {
            const stats = state.dashboardStats?.jobs || {};
            const items = [
              { label: 'Assigned', count: stats.assigned||0, color: '#3B82F6' },
              { label: 'In Progress', count: stats.in_progress||0, color: '#F59E0B' },
              { label: 'Completed', count: stats.completed||0, color: '#10B981' },
              { label: 'Cancelled', count: stats.cancelled||0, color: '#6B7280' }
            ];
            const total = items.reduce((a,b)=>a+b.count,0)||1;
            return items.map(item => \`
              <div class="flex items-center gap-3 mb-3">
                <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:\${item.color}"></div>
                <span class="text-sm text-gray-700 flex-1">\${item.label}</span>
                <span class="text-sm font-bold text-gray-800">\${item.count}</span>
                <div class="w-24 bg-gray-100 rounded-full h-2">
                  <div class="h-2 rounded-full" style="width:\${Math.round(item.count/total*100)}%; background:\${item.color}"></div>
                </div>
              </div>\`).join('');
          })()}
        </div>
      </div>\`;
    }

    // =================== NOTIFICATIONS VIEW ===================
    function renderNotificationsView() {
      const notifs = state.notifications;
      return \`
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div class="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 class="font-semibold text-gray-800">Notifications</h3>
          \${state.unreadCount > 0 ? \`<button onclick="markAllRead()" class="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Mark all read</button>\` : ''}
        </div>
        <div class="divide-y divide-gray-100">
          \${notifs.length === 0 ? \`
            <div class="text-center py-16 text-gray-400">
              <i class="fas fa-bell-slash text-3xl mb-3"></i>
              <p>No notifications</p>
            </div>
          \` : notifs.map(n => \`
          <div class="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer \${!n.is_read ? 'bg-indigo-50/50' : ''}" onclick="markRead('\${n.id}', '\${n.job_id||''}')">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 \${!n.is_read ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}">
              <i class="fas \${n.type === 'JOB_ASSIGNED' ? 'fa-briefcase' : n.type === 'JOB_COMPLETED' ? 'fa-check' : 'fa-bell'} text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800">\${escHtml(n.title)}</p>
              <p class="text-sm text-gray-600 mt-0.5">\${escHtml(n.message)}</p>
              <p class="text-xs text-gray-400 mt-1">\${dayjs(n.sent_at).fromNow()}</p>
            </div>
            \${!n.is_read ? '<div class="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-2"></div>' : ''}
          </div>
          \`).join('')}
        </div>
      </div>\`;
    }

    async function markRead(id, jobId) {
      await apiCall('put', '/notifications/' + id + '/read');
      await loadNotifications();
      if (jobId) viewJob(jobId);
      else refreshView();
    }
    async function markAllRead() {
      await apiCall('put', '/notifications/mark-all-read');
      await loadNotifications();
      refreshView();
    }

    // =================== TECHNICIAN LAYOUT ===================
    function renderTechLayout() {
      const tabs = [
        { id: 'dashboard', icon: 'fa-home', label: 'Home' },
        { id: 'myjobs', icon: 'fa-briefcase', label: 'My Jobs' },
        { id: 'notifications', icon: 'fa-bell', label: 'Alerts', badge: state.unreadCount },
        { id: 'profile', icon: 'fa-user', label: 'Profile' }
      ];
      const views = { dashboard: renderTechDashboard, myjobs: renderTechJobs, notifications: renderNotificationsView, profile: renderTechProfile };

      return \`
      <div class="min-h-screen bg-gray-50 pb-20">
        <!-- Mobile Header -->
        <header class="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 pt-safe-top pb-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              \${avatarHtml(state.user.name, state.user.avatarColor, 'w-10 h-10')}
              <div>
                <p class="text-white font-semibold">Hey, \${escHtml(state.user.name.split(' ')[0])}!</p>
                <p class="text-indigo-200 text-xs">\${state.user.specialty || 'Technician'}</p>
              </div>
            </div>
            <button onclick="navigate('notifications')" class="relative p-2 text-white">
              <i class="fas fa-bell text-xl"></i>
              \${state.unreadCount > 0 ? \`<span class="absolute top-1 right-1 bg-red-500 text-xs text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">\${state.unreadCount > 9 ? '9+' : state.unreadCount}</span>\` : ''}
            </button>
          </div>
          <!-- Active Job Timer -->
          \${state.activeLog ? \`
          <div class="mt-3 bg-white/15 rounded-2xl p-3 backdrop-blur-sm">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-2 h-2 bg-green-400 rounded-full pulse-dot"></div>
              <span class="text-white text-xs font-medium">ON THE CLOCK</span>
            </div>
            <p class="text-white font-bold truncate">\${escHtml(state.activeLog.job_title||'')}</p>
            <p class="text-indigo-200 text-xs">\${escHtml(state.activeLog.client_name||'')}</p>
            <div class="flex items-center justify-between mt-2">
              <span id="timer-display" class="text-white text-2xl font-mono font-bold timer-display">00:00:00</span>
              <button onclick="showClockOut('\${state.activeLog.id}')" class="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-1.5 rounded-xl font-medium transition">Clock Out</button>
            </div>
          </div>
          \` : ''}
        </header>

        <!-- Page Content -->
        <main class="px-4 py-4 fade-in" id="tech-main">
          \${(views[state.currentView] || renderTechDashboard)()}
        </main>

        <!-- Bottom Navigation -->
        <nav class="bottom-nav pb-safe-bottom">
          <div class="flex items-center justify-around py-2">
            \${tabs.map(t => \`
            <button onclick="navigate('\${t.id}')" class="flex flex-col items-center gap-1 px-4 py-2 relative transition-all">
              <div class="relative">
                <i class="fas \${t.icon} text-lg \${state.currentView === t.id ? 'text-indigo-600' : 'text-gray-400'}"></i>
                \${t.badge > 0 ? \`<span class="absolute -top-1 -right-2 bg-red-500 text-xs text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">\${t.badge > 9 ? '9+' : t.badge}</span>\` : ''}
              </div>
              <span class="text-xs font-medium \${state.currentView === t.id ? 'text-indigo-600' : 'text-gray-400'}">\${t.label}</span>
              \${state.currentView === t.id ? '<div class="absolute bottom-0 w-6 h-0.5 bg-indigo-600 rounded-full"></div>' : ''}
            </button>
            \`).join('')}
          </div>
        </nav>
      </div>\`;
    }

    function renderTechDashboard() {
      const stats = state.dashboardStats;
      if (!stats) return '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-2xl text-indigo-400"></i></div>';

      const upcoming = (stats.upcomingJobs || []).slice(0, 5);
      const today = upcoming.filter(j => dayjs(j.scheduled_start).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD'));

      return \`
      <div class="space-y-4">
        <!-- Quick Stats -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-2xl font-bold text-indigo-600">\${today.length}</p>
            <p class="text-sm text-gray-500">Today's Jobs</p>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-2xl font-bold text-green-600">\${stats.weekStats?.jobs_completed||0}</p>
            <p class="text-sm text-gray-500">Done This Week</p>
          </div>
        </div>

        <!-- Today's Jobs -->
        \${today.length > 0 ? \`
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 class="font-semibold text-gray-800 mb-3">Today's Jobs</h3>
          <div class="space-y-2">
            \${today.map(j => renderTechJobCard(j)).join('')}
          </div>
        </div>\` : \`
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <i class="fas fa-check-circle text-3xl text-green-400 mb-2"></i>
          <p class="text-gray-500">No jobs today!</p>
        </div>\`}

        <!-- Upcoming -->
        \${upcoming.filter(j => dayjs(j.scheduled_start).isAfter(dayjs().endOf('day'))).length > 0 ? \`
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 class="font-semibold text-gray-800 mb-3">Upcoming</h3>
          <div class="space-y-2">
            \${upcoming.filter(j => dayjs(j.scheduled_start).isAfter(dayjs().endOf('day'))).map(j => renderTechJobCard(j)).join('')}
          </div>
        </div>\` : ''}
      </div>\`;
    }

    function renderTechJobs() {
      const jobs = state.dashboardStats?.upcomingJobs || [];
      const allMyJobs = state.jobs.filter(j => j.technicianId === state.user.id);

      return \`
      <div class="space-y-3">
        <h2 class="font-bold text-gray-800 text-lg">My Jobs</h2>
        \${jobs.length === 0 && allMyJobs.length === 0 ? \`
          <div class="text-center py-16 bg-white rounded-2xl">
            <i class="fas fa-briefcase text-3xl text-gray-300 mb-3"></i>
            <p class="text-gray-500">No active jobs</p>
          </div>
        \` : [...jobs, ...allMyJobs.filter(j => !jobs.find(jj => jj.id === j.id))].map(j => renderTechJobCard(j, true)).join('')}
      </div>\`;
    }

    function renderTechJobCard(job, showDate = false) {
      const isActive = state.activeLog?.job_id === job.id;
      const canClockIn = !state.activeLog && ['ASSIGNED','IN_PROGRESS'].includes(job.status || job.status);

      return \`
      <div class="flex items-center gap-3 p-3 rounded-xl border \${isActive ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-gray-50'} cursor-pointer"
        onclick="showTechJobDetail('\${job.id}')">
        <div class="w-1 h-12 rounded-full flex-shrink-0" style="background:\${job.color||'#3B82F6'}"></div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-800 text-sm truncate">\${escHtml(job.title)}</p>
          <p class="text-xs text-gray-500 truncate">\${escHtml(job.client_name||'')}</p>
          <p class="text-xs text-gray-400">\${showDate ? formatDateTime(job.scheduled_start||job.scheduledStart) : formatTime(job.scheduled_start||job.scheduledStart)}</p>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          \${isActive ? '<div class="w-2 h-2 bg-green-500 rounded-full pulse-dot"></div>' : ''}
          \${statusBadge(job.status)}
        </div>
      </div>\`;
    }

    function renderTechProfile() {
      const u = state.user;
      const weekStats = state.dashboardStats?.weekStats || {};
      return \`
      <div class="space-y-4">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          \${avatarHtml(u.name, u.avatarColor, 'w-20 h-20 text-2xl mx-auto')}
          <h2 class="font-bold text-gray-800 text-xl mt-3">\${escHtml(u.name)}</h2>
          <p class="text-gray-500">\${escHtml(u.specialty||'Technician')}</p>
          <p class="text-sm text-gray-400">\${escHtml(u.email)}</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p class="text-2xl font-bold text-indigo-600">\${weekStats.jobs_completed||0}</p>
            <p class="text-sm text-gray-500">Jobs This Week</p>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p class="text-2xl font-bold text-green-600">\${formatDuration(weekStats.total_minutes||0)}</p>
            <p class="text-sm text-gray-500">Hours This Week</p>
          </div>
        </div>
        <button onclick="logout()" class="w-full bg-red-50 text-red-600 font-medium py-3 rounded-2xl border border-red-100 hover:bg-red-100 transition">
          <i class="fas fa-sign-out-alt mr-2"></i>Sign Out
        </button>
      </div>\`;
    }

    // =================== JOB DETAIL MODAL ===================
    async function viewJob(id) {
      try {
        const job = await apiCall('get', '/jobs/' + id);
        showJobDetailModal(job);
      } catch(e) {}
    }

    function showJobDetailModal(job) {
      const existing = document.getElementById('job-detail-modal');
      if (existing) existing.remove();

      const canEdit = state.user.role === 'ADMIN';
      const isMyJob = job.technicianId === state.user.id;
      const canClockIn = isMyJob && !state.activeLog && ['ASSIGNED','IN_PROGRESS'].includes(job.status);
      const isActiveJob = state.activeLog?.job_id === job.id;

      const el = document.createElement('div');
      el.id = 'job-detail-modal';
      el.className = 'modal-overlay';
      el.innerHTML = \`
      <div class="modal-content fade-in">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded-full" style="background:\${job.color}"></div>
            <h2 class="font-bold text-gray-800 text-lg">\${escHtml(job.title)}</h2>
          </div>
          <button onclick="document.getElementById('job-detail-modal').remove()" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="p-5 space-y-4">
          <!-- Status & Priority Row -->
          <div class="flex items-center gap-2 flex-wrap">
            \${statusBadge(job.status)}
            <span class="status-badge bg-gray-100 text-gray-600">\${priorityIcon(job.priority)} \${job.priority||'NORMAL'}</span>
            \${job.serviceType ? \`<span class="status-badge bg-blue-50 text-blue-600">\${escHtml(job.serviceType)}</span>\` : ''}
          </div>

          <!-- Key Info -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-gray-50 rounded-xl p-3">
              <p class="text-xs text-gray-500 mb-1">Scheduled Start</p>
              <p class="font-semibold text-gray-800 text-sm">\${formatDateTime(job.scheduledStart)}</p>
            </div>
            <div class="bg-gray-50 rounded-xl p-3">
              <p class="text-xs text-gray-500 mb-1">Scheduled End</p>
              <p class="font-semibold text-gray-800 text-sm">\${formatDateTime(job.scheduledEnd)}</p>
            </div>
          </div>

          <!-- Client -->
          \${job.client ? \`
          <div class="border border-gray-100 rounded-xl p-4">
            <div class="flex items-center gap-2 mb-2">
              <i class="fas fa-building text-gray-400"></i>
              <span class="font-medium text-gray-700">Client</span>
            </div>
            <p class="font-semibold text-gray-800">\${escHtml(job.client.name)}</p>
            \${job.client.phone ? \`<p class="text-sm text-gray-500 flex items-center gap-1.5 mt-1"><i class="fas fa-phone text-xs"></i>\${escHtml(job.client.phone)}</p>\` : ''}
            \${job.client.address ? \`<p class="text-sm text-gray-500 flex items-center gap-1.5 mt-1"><i class="fas fa-map-marker-alt text-xs"></i>\${escHtml(job.client.address)}</p>\` : ''}
          </div>\` : ''}

          <!-- Technician -->
          \${job.technician ? \`
          <div class="flex items-center gap-3">
            \${avatarHtml(job.technician.name, job.technician.avatarColor)}
            <div>
              <p class="text-xs text-gray-500">Assigned Technician</p>
              <p class="font-medium text-gray-800">\${escHtml(job.technician.name)}</p>
              <p class="text-xs text-gray-500">\${escHtml(job.technician.specialty||'')}</p>
            </div>
          </div>\` : '<p class="text-sm text-gray-400 italic">No technician assigned</p>'}

          <!-- Description -->
          \${job.description ? \`
          <div>
            <p class="text-xs text-gray-500 mb-1 font-medium">Description</p>
            <p class="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">\${escHtml(job.description)}</p>
          </div>\` : ''}

          <!-- Time Logs -->
          \${job.timeLogs && job.timeLogs.length > 0 ? \`
          <div>
            <p class="text-xs text-gray-500 mb-2 font-medium">Time Logs</p>
            \${job.timeLogs.map(tl => \`
            <div class="bg-gray-50 rounded-xl p-3 mb-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="font-medium text-gray-700">\${escHtml(tl.technician_name)}</span>
                <span class="text-green-600 font-bold">\${tl.total_minutes ? formatDuration(tl.total_minutes) : 'Active'}</span>
              </div>
              <p class="text-gray-500 text-xs mt-1">\${formatDateTime(tl.clock_in_time)} → \${tl.clock_out_time ? formatDateTime(tl.clock_out_time) : '...'}</p>
              \${tl.notes ? \`<p class="text-gray-400 text-xs italic mt-1">\${escHtml(tl.notes)}</p>\` : ''}
            </div>\`).join('')}
          </div>\` : ''}

          <!-- Actions -->
          <div class="flex gap-2 pt-2">
            \${canEdit ? \`
            <button onclick="editJob('\${job.id}'); document.getElementById('job-detail-modal').remove();" class="flex-1 bg-indigo-50 text-indigo-600 font-medium py-2.5 rounded-xl border border-indigo-200 hover:bg-indigo-100 transition text-sm">
              <i class="fas fa-edit mr-1"></i> Edit
            </button>
            \${job.status !== 'CANCELLED' && job.status !== 'COMPLETED' ? \`
            <button onclick="cancelJob('\${job.id}')" class="flex-1 bg-red-50 text-red-600 font-medium py-2.5 rounded-xl border border-red-200 hover:bg-red-100 transition text-sm">
              <i class="fas fa-times mr-1"></i> Cancel
            </button>\` : ''}
            \` : ''}
            \${canClockIn ? \`
            <button onclick="clockIn('\${job.id}'); document.getElementById('job-detail-modal').remove();" class="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 transition text-sm">
              <i class="fas fa-clock mr-1"></i> Clock In
            </button>
            \` : ''}
            \${isActiveJob ? \`
            <button onclick="showClockOut('\${state.activeLog.id}'); document.getElementById('job-detail-modal').remove();" class="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 transition text-sm">
              <i class="fas fa-stop-circle mr-1"></i> Clock Out
            </button>
            \` : ''}
            \${isMyJob && job.status === 'IN_PROGRESS' && !isActiveJob ? \`
            <button onclick="completeJob('\${job.id}'); document.getElementById('job-detail-modal').remove();" class="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 transition text-sm">
              <i class="fas fa-check mr-1"></i> Complete
            </button>
            \` : ''}
            \${job.locationAddress ? \`
            <a href="https://maps.google.com/maps?q=\${encodeURIComponent(job.locationAddress)}" target="_blank"
              class="flex-1 bg-blue-50 text-blue-600 font-medium py-2.5 rounded-xl border border-blue-200 hover:bg-blue-100 transition text-sm text-center">
              <i class="fas fa-directions mr-1"></i> Directions
            </a>\` : ''}
          </div>
        </div>
      </div>\`;
      document.body.appendChild(el);
      el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
    }

    async function showTechJobDetail(id) {
      await viewJob(id);
    }

    // =================== CLOCK IN/OUT ===================
    async function clockIn(jobId) {
      try {
        let lat, lng;
        try {
          const pos = await new Promise((res,rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout:5000}));
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch(e) {}
        const log = await apiCall('post', '/time-logs/clock-in', { jobId, lat, lng });
        state.activeLog = log;
        startTimer();
        showToast('Clocked in successfully! Timer started.', 'success');
        await loadDashboardStats();
        renderApp();
        updateTimerDisplay();
      } catch(e) {}
    }

    function showClockOut(timeLogId) {
      const existing = document.getElementById('clockout-modal');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.id = 'clockout-modal';
      el.className = 'modal-overlay';
      el.innerHTML = \`
      <div class="modal-content p-6 max-w-sm fade-in">
        <h3 class="font-bold text-gray-800 text-lg mb-2">Clock Out</h3>
        <p class="text-gray-500 text-sm mb-4">Add any notes about the job completion.</p>
        <textarea id="clockout-notes" placeholder="Job completion notes (optional)..." rows="3"
          class="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4 resize-none"></textarea>
        <div class="flex gap-3">
          <button onclick="document.getElementById('clockout-modal').remove()" class="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
          <button onclick="doClockOut('\${timeLogId}')" class="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 transition">
            <i class="fas fa-stop-circle mr-1"></i>Clock Out
          </button>
        </div>
      </div>\`;
      document.body.appendChild(el);
    }

    async function doClockOut(timeLogId) {
      try {
        let lat, lng;
        try {
          const pos = await new Promise((res,rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout:5000}));
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch(e) {}
        const notes = document.getElementById('clockout-notes')?.value || '';
        const log = await apiCall('post', '/time-logs/clock-out', { timeLogId, lat, lng, notes });
        state.activeLog = null;
        if (state.timerInterval) clearInterval(state.timerInterval);
        document.getElementById('clockout-modal')?.remove();
        const mins = log.total_minutes || 0;
        showToast(\`Clocked out! Total: \${formatDuration(mins)}\`, 'success');
        await loadDashboardStats();
        renderApp();
      } catch(e) {}
    }

    async function completeJob(jobId) {
      try {
        await apiCall('put', '/jobs/' + jobId, { status: 'COMPLETED' });
        showToast('Job marked as completed!', 'success');
        await loadDashboardStats();
        renderApp();
      } catch(e) {}
    }

    async function cancelJob(jobId) {
      if (!confirm('Cancel this job?')) return;
      try {
        await apiCall('put', '/jobs/' + jobId, { status: 'CANCELLED' });
        showToast('Job cancelled', 'info');
        await loadJobs();
        document.getElementById('job-detail-modal')?.remove();
        refreshView();
      } catch(e) {}
    }

    // =================== JOB MODAL (DOM append 방식) ===================
    function openJobModal(jobData) {
      var job = jobData || null;
      state.editingJob = job;
      // 이미 열린 모달 제거
      var existing = document.getElementById('job-modal-root');
      if (existing) existing.remove();

      var title  = job ? 'Edit Job' : 'Create New Job';
      var techs  = state.users.filter(function(u){ return u.role === 'TECHNICIAN' && u.is_active; });
      var colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#F97316'];
      var selColor  = (job && job.color) ? job.color : '#3B82F6';
      var startVal  = job ? dayjs(job.scheduledStart).format('YYYY-MM-DDTHH:mm')
                          : dayjs().add(1,'hour').startOf('hour').format('YYYY-MM-DDTHH:mm');
      var endVal    = job ? dayjs(job.scheduledEnd).format('YYYY-MM-DDTHH:mm')
                          : dayjs().add(2,'hour').startOf('hour').format('YYYY-MM-DDTHH:mm');

      var clientOpts = '<option value="">— Select Client —</option>'
        + state.clients.map(function(c){
            return '<option value="' + c.id + '"' + (job && job.clientId===c.id ? ' selected' : '') + '>' + escHtml(c.name) + '</option>';
          }).join('');

      var techOpts = '<option value="">— Unassigned —</option>'
        + techs.map(function(t){
            return '<option value="' + t.id + '"' + (job && job.technicianId===t.id ? ' selected' : '') + '>'
              + escHtml(t.name) + (t.specialty ? ' (' + t.specialty + ')' : '') + '</option>';
          }).join('');

      var serviceTypes = ['HVAC','Electrical','Plumbing','Inspection','Installation','Repair','Maintenance'];
      var serviceOpts  = '<option value="">— Select Type —</option>'
        + serviceTypes.map(function(s){
            return '<option value="' + s + '"' + (job && job.serviceType===s ? ' selected' : '') + '>' + s + '</option>';
          }).join('');

      var priorities = ['LOW','NORMAL','HIGH','URGENT'];
      var priorityOpts = priorities.map(function(p){
        return '<option value="' + p + '"' + ((job ? job.priority : 'NORMAL')===p ? ' selected' : '') + '>'
          + priorityIcon(p) + ' ' + p + '</option>';
      }).join('');

      var colorBtns = colors.map(function(c){
        return '<button type="button" class="jm-color" data-color="' + c + '" style="width:32px;height:32px;border-radius:50%;border:2px solid '
          + (c===selColor ? '#1f2937' : 'transparent') + ';background:' + c + ';cursor:pointer;transition:all .15s;'
          + (c===selColor ? 'transform:scale(1.15);' : '') + '"></button>';
      }).join('');

      var wrap = document.createElement('div');
      wrap.id = 'job-modal-root';
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';

      wrap.innerHTML =
        '<div style="background:#fff;border-radius:16px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,0.25);">'
        // 헤더
        + '<div style="padding:20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;border-radius:16px 16px 0 0;z-index:1;">'
        +   '<h2 style="font-size:18px;font-weight:700;color:#1f2937;margin:0;">' + title + '</h2>'
        +   '<button id="jm-close" type="button" style="padding:8px;color:#9ca3af;border:none;background:none;cursor:pointer;border-radius:8px;"><i class="fas fa-times"></i></button>'
        + '</div>'
        // 폼
        + '<form id="job-form" style="padding:20px;">'
        +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">'
        // 제목 (col-span-2)
        +     '<div style="grid-column:1/-1;">'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Job Title *</label>'
        +       '<input id="jf-title" type="text" required placeholder="e.g., HVAC Maintenance" value="' + escHtml((job && job.title)||'') + '" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">'
        +     '</div>'
        // 시작
        +     '<div>'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Start Time *</label>'
        +       '<input id="jf-start" type="datetime-local" required value="' + startVal + '" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">'
        +     '</div>'
        // 종료
        +     '<div>'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">End Time *</label>'
        +       '<input id="jf-end" type="datetime-local" required value="' + endVal + '" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">'
        +     '</div>'
        // 클라이언트
        +     '<div>'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Client</label>'
        +       '<select id="jf-client" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">' + clientOpts + '</select>'
        +     '</div>'
        // 기술자
        +     '<div>'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Technician</label>'
        +       '<select id="jf-tech" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">' + techOpts + '</select>'
        +     '</div>'
        // 서비스 유형
        +     '<div>'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Service Type</label>'
        +       '<select id="jf-service" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">' + serviceOpts + '</select>'
        +     '</div>'
        // 우선순위
        +     '<div>'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Priority</label>'
        +       '<select id="jf-priority" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">' + priorityOpts + '</select>'
        +     '</div>'
        // 주소 (col-span-2)
        +     '<div style="grid-column:1/-1;">'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Location Address</label>'
        +       '<input id="jf-location" type="text" placeholder="123 Main St, City, State" value="' + escHtml((job && job.locationAddress)||'') + '" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;">'
        +     '</div>'
        // 설명 (col-span-2)
        +     '<div style="grid-column:1/-1;">'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Description</label>'
        +       '<textarea id="jf-desc" rows="2" placeholder="Job details and requirements..." style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;resize:none;box-sizing:border-box;">' + escHtml((job && job.description)||'') + '</textarea>'
        +     '</div>'
        // 컬러 태그 (col-span-2)
        +     '<div style="grid-column:1/-1;">'
        +       '<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Color Tag</label>'
        +       '<div id="color-picker" style="display:flex;gap:8px;flex-wrap:wrap;">' + colorBtns + '</div>'
        +       '<input type="hidden" id="jf-color" value="' + selColor + '">'
        +     '</div>'
        +   '</div>'
        // 버튼
        +   '<div style="display:flex;gap:12px;margin-top:20px;">'
        +     '<button type="button" id="jm-cancel" style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:10px;color:#374151;font-size:13px;font-weight:500;background:#fff;cursor:pointer;">Cancel</button>'
        +     '<button type="submit" id="jm-submit" style="flex:1;padding:10px;border:none;border-radius:10px;background:#4f46e5;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">' + (job ? 'Save Changes' : 'Create Job') + '</button>'
        +   '</div>'
        + '</form>'
        + '</div>';

      document.body.appendChild(wrap);

      // 닫기
      function closeModal() { wrap.remove(); state.editingJob = null; }
      document.getElementById('jm-close').addEventListener('click', closeModal);
      document.getElementById('jm-cancel').addEventListener('click', closeModal);
      wrap.addEventListener('click', function(e){ if (e.target === wrap) closeModal(); });

      // 컬러 피커 이벤트
      wrap.querySelectorAll('.jm-color').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var c = btn.dataset.color;
          document.getElementById('jf-color').value = c;
          wrap.querySelectorAll('.jm-color').forEach(function(b) {
            b.style.border = '2px solid ' + (b.dataset.color === c ? '#1f2937' : 'transparent');
            b.style.transform = b.dataset.color === c ? 'scale(1.15)' : 'scale(1)';
          });
        });
      });

      // 폼 submit
      document.getElementById('job-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var submitBtn = document.getElementById('jm-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        var data = {
          title:           document.getElementById('jf-title').value,
          scheduledStart:  document.getElementById('jf-start').value,
          scheduledEnd:    document.getElementById('jf-end').value,
          clientId:        document.getElementById('jf-client').value   || null,
          technicianId:    document.getElementById('jf-tech').value     || null,
          serviceType:     document.getElementById('jf-service').value  || null,
          priority:        document.getElementById('jf-priority').value,
          locationAddress: document.getElementById('jf-location').value || null,
          description:     document.getElementById('jf-desc').value     || null,
          color:           document.getElementById('jf-color').value,
        };
        try {
          if (state.editingJob) {
            await apiCall('put', '/jobs/' + state.editingJob.id, data);
            showToast('Job updated!', 'success');
          } else {
            await apiCall('post', '/jobs', data);
            showToast('Job created!', 'success');
          }
          closeModal();
          await loadJobs();
          await loadDashboardStats();
          refreshView();
        } catch(err) {
          submitBtn.disabled = false;
          submitBtn.textContent = job ? 'Save Changes' : 'Create Job';
        }
      });
    }

    function closeJobModal() { var m = document.getElementById('job-modal-root'); if(m) m.remove(); state.editingJob = null; }

    async function editJob(id) {
      var job = await apiCall('get', '/jobs/' + id);
      openJobModal(job);
    }

    function bindJobForm() { /* openJobModal 내부에서 처리 */ }

    // =================== CLIENT MODAL ===================
    function renderClientModal() {
      return \`
      <div id="client-modal" class="modal-overlay hidden">
        <div class="modal-content max-w-md fade-in">
          <div class="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 text-lg" id="client-modal-title">Add Client</h2>
            <button onclick="closeClientModal()" class="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition"><i class="fas fa-times"></i></button>
          </div>
          <form id="client-form" class="p-5 space-y-4">
            <input type="hidden" id="cf-id">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Company Name *</label>
              <input id="cf-name" type="text" required placeholder="Acme Corporation"
                class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <input id="cf-phone" type="tel" placeholder="555-0100"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input id="cf-email" type="email" placeholder="info@company.com"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
              <input id="cf-address" type="text" placeholder="123 Business Ave, City, State"
                class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea id="cf-notes" rows="2" placeholder="Special instructions, preferences..."
                class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
            </div>
            <div class="flex gap-3 pt-2">
              <button type="button" onclick="closeClientModal()" class="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition text-sm">Cancel</button>
              <button type="submit" class="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition text-sm">Save Client</button>
            </div>
          </form>
        </div>
      </div>\`;
    }

    function openClientModal() { document.getElementById('client-modal')?.classList.remove('hidden'); }
    function closeClientModal() {
      document.getElementById('client-modal')?.classList.add('hidden');
      ['cf-id','cf-name','cf-phone','cf-email','cf-address','cf-notes'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    }

    async function editClient(id) {
      const c = await apiCall('get', '/clients/' + id);
      document.getElementById('cf-id').value = c.id;
      document.getElementById('cf-name').value = c.name || '';
      document.getElementById('cf-phone').value = c.phone || '';
      document.getElementById('cf-email').value = c.email || '';
      document.getElementById('cf-address').value = c.address || '';
      document.getElementById('cf-notes').value = c.notes || '';
      document.getElementById('client-modal-title').textContent = 'Edit Client';
      openClientModal();
    }

    function bindClientForm() {
      const form = document.getElementById('client-form');
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('cf-id').value;
        const data = { name: document.getElementById('cf-name').value, phone: document.getElementById('cf-phone').value, email: document.getElementById('cf-email').value, address: document.getElementById('cf-address').value, notes: document.getElementById('cf-notes').value };
        try {
          if (id) { await apiCall('put', '/clients/' + id, data); showToast('Client updated!', 'success'); }
          else { await apiCall('post', '/clients', data); showToast('Client added!', 'success'); }
          closeClientModal();
          await loadClients();
          refreshView();
        } catch(e) {}
      });
    }

    // =================== USER MODAL ===================
    function renderUserModal() {
      return \`
      <div id="user-modal" class="modal-overlay hidden">
        <div class="modal-content max-w-md fade-in">
          <div class="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 text-lg">Add Technician</h2>
            <button onclick="closeUserModal()" class="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition"><i class="fas fa-times"></i></button>
          </div>
          <form id="user-form" class="p-5 space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input id="uf-name" type="text" required placeholder="John Smith"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                <input id="uf-email" type="email" required placeholder="john@fieldvibe.com"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <input id="uf-phone" type="tel" placeholder="555-0100"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Specialty</label>
                <select id="uf-specialty" class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  \${['HVAC','Electrical','Plumbing','General','Inspection'].map(s => \`<option value="\${s}">\${s}</option>\`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                <input id="uf-password" type="password" required placeholder="••••••••"
                  class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <div class="flex gap-3 pt-2">
              <button type="button" onclick="closeUserModal()" class="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition text-sm">Cancel</button>
              <button type="submit" class="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition text-sm">Add Technician</button>
            </div>
          </form>
        </div>
      </div>\`;
    }
    function openUserModal() { document.getElementById('user-modal')?.classList.remove('hidden'); }
    function closeUserModal() { document.getElementById('user-modal')?.classList.add('hidden'); }

    function bindUserForm() {
      const form = document.getElementById('user-form');
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await apiCall('post', '/users', { name: document.getElementById('uf-name').value, email: document.getElementById('uf-email').value, phone: document.getElementById('uf-phone').value, specialty: document.getElementById('uf-specialty').value, password: document.getElementById('uf-password').value, role: 'TECHNICIAN' });
          showToast('Technician added!', 'success');
          closeUserModal();
          await loadUsers();
          refreshView();
        } catch(e) {}
      });
    }

    // =================== NAVIGATION ===================
    function navigate(view) {
      state.currentView = view;
      document.getElementById('sidebar')?.classList.remove('open');
      refreshView();
    }

    function refreshView() {
      if (!state.user) { renderApp(); return; }
      if (state.user.role === 'ADMIN') {
        const mainView = document.getElementById('main-view');
        if (mainView) {
          const views = { dashboard: renderAdminDashboard, jobs: renderJobsView, calendar: renderCalendar, clients: renderClientsView, technicians: renderTechniciansView, reports: renderReportsView, notifications: renderNotificationsView };
          mainView.innerHTML = (views[state.currentView] || renderAdminDashboard)();
          mainView.classList.remove('fade-in'); void mainView.offsetWidth; mainView.classList.add('fade-in');
          bindJobForm(); bindClientForm(); bindUserForm();
        } else { renderApp(); bindAdminEvents(); }
      } else {
        const techMain = document.getElementById('tech-main');
        if (techMain) {
          const views = { dashboard: renderTechDashboard, myjobs: renderTechJobs, notifications: renderNotificationsView, profile: renderTechProfile };
          techMain.innerHTML = (views[state.currentView] || renderTechDashboard)();
          techMain.classList.remove('fade-in'); void techMain.offsetWidth; techMain.classList.add('fade-in');
          if (state.activeLog) updateTimerDisplay();
        } else { renderApp(); bindTechEvents(); }
      }
    }

    function bindAdminEvents() {
      bindJobForm(); bindClientForm(); bindUserForm();
    }
    function bindTechEvents() {
      if (state.activeLog) updateTimerDisplay();
    }

    // =================== INIT ===================
    async function init() {
      const savedToken = localStorage.getItem('fv_token');
      const savedUser = localStorage.getItem('fv_user');
      if (savedToken && savedUser) {
        state.token = savedToken;
        state.user = JSON.parse(savedUser);
        try {
          const fresh = await api.get('/auth/me');
          state.user = fresh.data;
          localStorage.setItem('fv_user', JSON.stringify(fresh.data));
          await loadInitialData();
        } catch(e) { logout(); return; }
      }
      renderApp();
      if (state.user) startNotificationPoll();
    }

    function startNotificationPoll() {
      setInterval(async () => {
        if (!state.token) return;
        try {
          const r = await api.get('/notifications/unread-count');
          const prev = state.unreadCount;
          state.unreadCount = r.data.count;
          if (r.data.count > prev) {
            await loadNotifications();
            const bell = document.querySelector('.fa-bell');
            if (bell) { bell.style.animation = 'pulse 0.5s 3'; setTimeout(() => bell.style.animation = '', 1500); }
          }
        } catch(e) {}
      }, 30000);
    }

    window.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>`;
}

export default app
