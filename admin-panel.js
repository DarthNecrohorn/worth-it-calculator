'use strict';

(function(){
    const ADMIN_USER_ID = 'c3560d70-8b68-49f0-b3f1-9e248673553c';
    let activeSection = 'home';
    let feedbackLoaded = false;
    let usageLoaded = false;

    function $(id){ return document.getElementById(id); }

    function escapeHtml(value){
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function getSession(){
        if(!window.supabaseClient?.auth) return null;
        const result = await window.supabaseClient.auth.getSession();
        return result?.data?.session || null;
    }

    async function isAdmin(){
        try{
            const session = await getSession();
            return session?.user?.id === ADMIN_USER_ID;
        }catch(error){
            return false;
        }
    }

    function setStatus(message, type){
        const status = $('adminPanelStatus');
        if(!status) return;
        status.textContent = message || '';
        status.className = 'admin-panel-status' + (type ? ' ' + type : '');
    }

    function renderHome(){
        const content = $('adminPanelContent');
        if(!content) return;
        content.innerHTML = [
            '<div class="admin-panel-welcome">',
                '<div class="admin-panel-welcome-icon">🛠️</div>',
                '<div class="admin-panel-welcome-copy">',
                    '<strong>Private Admin Panel</strong>',
                    '<span>Choose a section below to manage Worth It privately.</span>',
                '</div>',
            '</div>',
            '<div class="admin-panel-section-grid">',
                '<button type="button" class="admin-panel-section-button" data-admin-section="feedback" onclick="showAdminSection(\'feedback\')">',
                    '<span class="admin-panel-section-icon">🐞</span>',
                    '<span class="admin-panel-section-copy"><strong>Suggestions &amp; Bugs</strong><small>Read feedback privately</small></span>',
                    '<span class="admin-panel-section-arrow">›</span>',
                '</button>',
                '<button type="button" class="admin-panel-section-button" data-admin-section="usage" onclick="showAdminSection(\'usage\')">',
                    '<span class="admin-panel-section-icon">📊</span>',
                    '<span class="admin-panel-section-copy"><strong>API Usage</strong><small>Track Worth It backend usage</small></span>',
                    '<span class="admin-panel-section-arrow">›</span>',
                '</button>',
            '</div>'
        ].join('');
    }

    function renderSectionHeader(title, subtitle, icon){
        return [
            '<div class="admin-panel-section-head">',
                '<button type="button" class="admin-panel-back-button" onclick="showAdminSection(\'home\')" aria-label="Back to Admin Panel">‹</button>',
                '<div class="admin-panel-section-heading">',
                    '<span>' + icon + '</span>',
                    '<div><h4>' + escapeHtml(title) + '</h4><p>' + escapeHtml(subtitle) + '</p></div>',
                '</div>',
            '</div>'
        ].join('');
    }

    function setActiveNav(){
        document.querySelectorAll('.admin-panel-section-button').forEach(function(button){
            button.classList.toggle('active', button.dataset.adminSection === activeSection);
        });
    }

    async function showAdminSection(section){
        if(!(await isAdmin())){ closeAdminPanel(); return; }
        activeSection = section === 'feedback' || section === 'usage' ? section : 'home';
        setStatus('');
        const content = $('adminPanelContent');
        if(!content) return;
        if(activeSection === 'home'){
            renderHome();
            setActiveNav();
            return;
        }
        if(activeSection === 'feedback'){
            content.innerHTML = renderSectionHeader('Suggestions & Bugs','Private feedback from Worth It users.','🐞') + '<div id="adminFeedbackArea"></div>';
            setActiveNav();
            feedbackLoaded = false;
            await loadFeedback();
            return;
        }
        content.innerHTML = renderSectionHeader('API Usage','Tracked Worth It backend requests.','📊') + '<div id="adminUsageArea"></div>';
        setActiveNav();
        usageLoaded = false;
        await loadUsage();
    }

    async function openAdminPanel(){
        if(!(await isAdmin())) return;
        const overlay = $('adminPanelOverlay');
        if(!overlay) return;
        overlay.classList.add('open');
        activeSection = 'home';
        feedbackLoaded = false;
        usageLoaded = false;
        setStatus('');
        renderHome();
        setActiveNav();
    }

    function closeAdminPanel(){ $('adminPanelOverlay')?.classList.remove('open'); }

    function renderFeedbackItem(item){
        const type = item?.type === 'suggestion' ? '💡 Suggestion' : '🐞 Bug';
        const date = item?.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date';
        return [
            '<article class="admin-feedback-modern-item">',
                '<div class="admin-feedback-modern-head"><span class="admin-feedback-modern-type">' + type + '</span><time>' + escapeHtml(date) + '</time></div>',
                '<div class="admin-feedback-modern-message">' + escapeHtml(item?.message || '') + '</div>',
                '<div class="admin-feedback-modern-page">Page: ' + escapeHtml(item?.page || 'Unknown') + '</div>',
            '</article>'
        ].join('');
    }

    async function loadFeedback(){
        const area = $('adminFeedbackArea');
        if(!area || feedbackLoaded) return;
        area.innerHTML = '<div class="admin-panel-loading"><span class="admin-panel-spinner"></span>Loading feedback...</div>';
        try{
            const session = await getSession();
            if(!session?.access_token) throw new Error('Please sign in again.');
            const response = await fetch('/api/admin-feedback',{ method:'GET', headers:{ Authorization:'Bearer ' + session.access_token }, cache:'no-store' });
            const result = await response.json().catch(function(){ return {}; });
            if(response.status === 403) throw new Error('Access denied.');
            if(!response.ok) throw new Error(result.error || 'Could not load feedback.');
            const feedback = Array.isArray(result.feedback) ? result.feedback : [];
            if(!feedback.length){
                area.innerHTML = '<div class="admin-panel-empty"><span>📭</span><strong>No feedback yet</strong><small>New bugs and suggestions will appear here.</small></div>';
                feedbackLoaded = true;
                return;
            }
            area.innerHTML = '<div class="admin-panel-list-head"><span>' + feedback.length + ' feedback item' + (feedback.length === 1 ? '' : 's') + '</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminFeedback()">↻ Refresh</button></div>' + '<div class="admin-feedback-modern-list">' + feedback.map(renderFeedbackItem).join('') + '</div>';
            feedbackLoaded = true;
        }catch(error){
            area.innerHTML = '<div class="admin-panel-error"><strong>Could not load feedback</strong><span>' + escapeHtml(error?.message || 'Please try again.') + '</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminFeedback()">Try again</button></div>';
        }
    }

    async function refreshAdminFeedback(){ feedbackLoaded = false; await loadFeedback(); }

    function formatNumber(value){ return Number(value || 0).toLocaleString(); }
    function formatDateTime(value){
        if(!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
    }

    function renderUsageCard(api){
        const configured = Boolean(api?.configured);
        return [
            '<article class="admin-usage-card">',
                '<div class="admin-usage-card-top"><div><span class="admin-usage-category">' + escapeHtml(api?.category || 'API') + '</span><h5>' + escapeHtml(api?.name || 'API') + '</h5></div><span class="admin-usage-status ' + (configured ? 'is-configured' : 'is-missing') + '"><i></i>' + (configured ? 'Configured' : 'Missing key') + '</span></div>',
                '<p class="admin-usage-provider">' + escapeHtml(api?.provider || 'Unknown provider') + '</p>',
                '<div class="admin-usage-main-number"><strong>' + formatNumber(api?.totalRequests) + '</strong><span>total requests</span></div>',
                '<div class="admin-usage-metrics"><div><span>This month</span><strong>' + formatNumber(api?.monthRequests) + '</strong></div><div><span>Last 30 days</span><strong>' + formatNumber(api?.last30DaysRequests) + '</strong></div></div>',
                '<div class="admin-usage-meta"><div><span>Endpoint</span><code>' + escapeHtml(api?.endpoint || '—') + '</code></div><div><span>Last tracked</span><strong>' + escapeHtml(formatDateTime(api?.lastSeenAt)) + '</strong></div></div>',
            '</article>'
        ].join('');
    }

    async function loadUsage(){
        const area = $('adminUsageArea');
        if(!area || usageLoaded) return;
        area.innerHTML = '<div class="admin-panel-loading"><span class="admin-panel-spinner"></span>Loading API usage...</div>';
        try{
            const session = await getSession();
            if(!session?.access_token) throw new Error('Please sign in again.');
            const response = await fetch('/api/admin-stats',{ method:'GET', headers:{ Authorization:'Bearer ' + session.access_token }, cache:'no-store' });
            const result = await response.json().catch(function(){ return {}; });
            if(response.status === 403) throw new Error('Access denied.');
            if(!response.ok) throw new Error(result.error || 'Could not load API usage.');
            const apis = Array.isArray(result.apis) ? result.apis : [];
            const total = apis.reduce(function(sum,api){ return sum + Number(api.totalRequests || 0); },0);
            const month = apis.reduce(function(sum,api){ return sum + Number(api.monthRequests || 0); },0);
            const last30 = apis.reduce(function(sum,api){ return sum + Number(api.last30DaysRequests || 0); },0);
            area.innerHTML = [
                '<div class="admin-usage-summary-grid">',
                    '<div class="admin-usage-summary-card"><span>Total tracked</span><strong>' + formatNumber(total) + '</strong><small>Since tracking began</small></div>',
                    '<div class="admin-usage-summary-card"><span>This month</span><strong>' + formatNumber(month) + '</strong><small>Current calendar month</small></div>',
                    '<div class="admin-usage-summary-card"><span>Last 30 days</span><strong>' + formatNumber(last30) + '</strong><small>Rolling 30-day window</small></div>',
                '</div>',
                '<div class="admin-usage-note"><span>ℹ️</span><div><strong>Usage tracking</strong><p>These counters track requests handled by the Worth It backend. Provider dashboards can show lower numbers because caching can prevent an upstream request.</p></div></div>',
                '<div class="admin-usage-toolbar"><span>' + apis.length + ' API services</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminUsage()">↻ Refresh</button></div>',
                '<div class="admin-usage-grid">' + apis.map(renderUsageCard).join('') + '</div>',
                '<div class="admin-usage-footer">Tracking starts from the deployment that enabled this feature. Historical provider usage cannot be reconstructed from the website itself.</div>'
            ].join('');
            usageLoaded = true;
        }catch(error){
            area.innerHTML = '<div class="admin-panel-error"><strong>Could not load API usage</strong><span>' + escapeHtml(error?.message || 'Please try again.') + '</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminUsage()">Try again</button></div>';
        }
    }

    async function refreshAdminUsage(){ usageLoaded = false; await loadUsage(); }

    async function updateAdminPanelButton(){
        const button = $('adminPanelNavBtn');
        if(!button) return;
        button.style.display = (await isAdmin()) ? '' : 'none';
    }

    window.openAdminPanel = openAdminPanel;
    window.closeAdminPanel = closeAdminPanel;
    window.showAdminSection = showAdminSection;
    window.refreshAdminFeedback = refreshAdminFeedback;
    window.refreshAdminUsage = refreshAdminUsage;
    window.openAdminFeedback = openAdminPanel;
    window.closeAdminFeedback = closeAdminPanel;
    window.loadAdminFeedback = refreshAdminFeedback;

    $('adminPanelOverlay')?.addEventListener('click',function(event){
        if(event.target === $('adminPanelOverlay')) closeAdminPanel();
    });

    document.addEventListener('keydown',function(event){
        if(event.key === 'Escape' && $('adminPanelOverlay')?.classList.contains('open')) closeAdminPanel();
    });

    if(window.supabaseClient?.auth){
        window.supabaseClient.auth.onAuthStateChange(function(){ updateAdminPanelButton(); });
    }

    updateAdminPanelButton();
})();
