'use strict';

(function(){
    const ADMIN_EMAIL = 'pedjasebez3545@gmail.com';
    let activeSection = 'home';
    let feedbackLoaded = false;
    let usageLoaded = false;
    let platformUsageLoaded = false;

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
            return String(session?.user?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
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
            '<div class="admin-panel-section-grid">',
                '<button type="button" class="admin-panel-section-button" data-admin-section="feedback" onclick="showAdminSection(\'feedback\')">',
                    '<span class="admin-panel-section-icon">🐞</span>',
                    '<span class="admin-panel-section-copy"><strong>Suggestions &amp; Bugs</strong><small>Read feedback privately</small></span>',
                    '<span class="admin-panel-section-arrow">›</span>',
                '</button>',
                '<button type="button" class="admin-panel-section-button" data-admin-section="usage" onclick="showAdminSection(\'usage\')">',
                    '<span class="admin-panel-section-icon">📊</span>',
                    '<span class="admin-panel-section-copy"><strong>API Usage</strong><small>Track external provider usage</small></span>',
                    '<span class="admin-panel-section-arrow">›</span>',
                '</button>',
                '<button type="button" class="admin-panel-section-button" data-admin-section="platform-usage" onclick="showAdminSection(\'platform-usage\')">',
                    '<span class="admin-panel-section-icon">⚙️</span>',
                    '<span class="admin-panel-section-copy"><strong>Platform Usage</strong><small>Cloudflare Workers, CPU &amp; D1</small></span>',
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
        activeSection =
            section === 'feedback' ||
            section === 'usage' ||
            section === 'platform-usage'
                ? section
                : 'home';
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
        if(activeSection === 'platform-usage'){
            content.innerHTML = renderSectionHeader('Platform Usage','Cloudflare Workers, execution time and D1 resource usage.','⚙️') + '<div id="adminPlatformUsageArea"></div>';
            setActiveNav();
            platformUsageLoaded = false;
            await loadPlatformUsage();
            return;
        }
        content.innerHTML = renderSectionHeader('API Usage','Tracked external-provider API usage.','📊') + '<div id="adminUsageArea"></div>';
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
        platformUsageLoaded = false;
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
        const configured =
            Boolean(
                api?.configured
            );

        const quotaType =
            String(
                api?.quotaType || "dynamic"
            );

        const isGrouped =
            api?.usageTrackedSeparately === false;

        const hasTodayRemaining =
            api?.todayRemaining !== null &&
            api?.todayRemaining !== undefined;

        const hasMonthRemaining =
            api?.monthRemaining !== null &&
            api?.monthRemaining !== undefined;

        const remainingValue =
            isGrouped
                ? "Grouped"
                : hasTodayRemaining
                    ? formatNumber(api.todayRemaining)
                    : hasMonthRemaining
                        ? formatNumber(api.monthRemaining)
                        : quotaType === "none"
                            ? "∞"
                            : quotaType === "dynamic"
                                ? "Account"
                                : "Provider";

        const remainingLabel =
            isGrouped
                ? "Usage tracking"
                : hasTodayRemaining
                    ? "Remaining today"
                    : hasMonthRemaining
                        ? "Remaining this month"
                        : quotaType === "none"
                            ? "No fixed quota"
                            : "Quota availability";

        const remainingDetail =
            isGrouped
                ? (
                    api?.trackingGroup
                        ? "Included in: " + api.trackingGroup
                        : "Included in grouped service tracking"
                )
                : hasTodayRemaining
                    ? (
                        api?.quotaLabel ||
                        "Daily limit"
                    )
                    : hasMonthRemaining
                        ? (
                            api?.quotaLabel ||
                            "Monthly limit"
                        )
                        : (
                            api?.quotaLabel ||
                            "Provider/account dependent"
                        );

        const secondaryRemaining =
            !isGrouped &&
            api?.monthRemaining !== null &&
            api?.monthRemaining !== undefined
                ? formatNumber(
                    api.monthRemaining
                )
                : null;

        const metricValue = value =>
            isGrouped
                ? "—"
                : formatNumber(value);

        const trackedValue =
            isGrouped
                ? "Grouped tracker"
                : formatDateTime(api?.lastSeenAt);

        return [
            '<article class="admin-usage-card">',
                '<div class="admin-usage-card-top">',
                    '<div>',
                        '<span class="admin-usage-category">' +
                            escapeHtml(
                                api?.category ||
                                "API"
                            ) +
                        '</span>',
                        '<h5>' +
                            escapeHtml(
                                api?.emoji ||
                                "🔌"
                            ) +
                            ' ' +
                            escapeHtml(
                                api?.name ||
                                "API"
                            ) +
                        '</h5>',
                    '</div>',
                    '<span class="admin-usage-status ' +
                        (
                            configured
                                ? "is-configured"
                                : "is-missing"
                        ) +
                    '"><i></i>' +
                        (
                            api?.configurationLabel ||
                            (
                                configured
                                    ? "Configured"
                                    : "Missing key"
                            )
                        ) +
                    '</span>',
                '</div>',
                '<p class="admin-usage-provider">' +
                    escapeHtml(
                        api?.provider ||
                        "Unknown provider"
                    ) +
                '</p>',
                '<div class="admin-usage-main-number">',
                    '<strong>' +
                        escapeHtml(
                            remainingValue
                        ) +
                    '</strong>',
                    '<span>' +
                        escapeHtml(
                            remainingLabel
                        ) +
                    '</span>',
                '</div>',
                '<div class="admin-usage-remaining-detail">' +
                    escapeHtml(
                        secondaryRemaining !== null
                            ? (
                                "This month: " +
                                secondaryRemaining
                            )
                            : remainingDetail
                    ) +
                '</div>',
                '<div class="admin-usage-metrics">',
                    '<div>',
                        '<span>Used today</span>',
                        '<strong>' +
                            metricValue(
                                api?.todayRequests
                            ) +
                        '</strong>',
                    '</div>',
                    '<div>',
                        '<span>This month</span>',
                        '<strong>' +
                            metricValue(
                                api?.monthRequests
                            ) +
                        '</strong>',
                    '</div>',
                    '<div>',
                        '<span>Last 30 days</span>',
                        '<strong>' +
                            metricValue(
                                api?.last30DaysRequests
                            ) +
                        '</strong>',
                    '</div>',
                '</div>',
                '<div class="admin-usage-meta">',
                    '<div>',
                        '<span>Quota</span>',
                        '<strong>' +
                            escapeHtml(
                                api?.quotaLabel ||
                                "Provider dependent"
                            ) +
                        '</strong>',
                    '</div>',
                    '<div>',
                        '<span>Last tracked</span>',
                        '<strong>' +
                            escapeHtml(
                                trackedValue
                            ) +
                        '</strong>',
                    '</div>',
                '</div>',
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


    function formatDecimal(value, digits = 2){
        const numeric = Number(value || 0);
        return Number.isFinite(numeric)
            ? numeric.toLocaleString(undefined, { maximumFractionDigits: digits })
            : '0';
    }

    function formatPlatformDateTime(value){
        if(!value) return '—';
        const date = new Date(value);
        if(Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('en-GB', {
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function formatBytes(value){
        const bytes = Math.max(0, Number(value) || 0);
        if(bytes < 1024) return formatNumber(bytes) + ' B';
        const units = ['KB','MB','GB','TB'];
        let amount = bytes / 1024;
        let index = 0;
        while(amount >= 1024 && index < units.length - 1){
            amount /= 1024;
            index += 1;
        }
        return formatDecimal(amount, 2) + ' ' + units[index];
    }

    function renderPlatformMetric(label, value, suffix = ''){
        return '<div class="admin-platform-metric">' +
            '<span>' + escapeHtml(label) + '</span>' +
            '<strong>' + escapeHtml(value) + '</strong>' +
            (suffix ? '<small>' + escapeHtml(suffix) + '</small>' : '') +
        '</div>';
    }

    function renderWorkerPeriod(title, period){
        const cpuTime = Number(period?.cpuTimeMs || 0);
        const wallTime = Number(period?.wallTimeMs || 0);
        return [
            '<article class="admin-usage-card admin-platform-period-card">',
                '<div class="admin-usage-card-top"><div><span class="admin-usage-category">Workers &amp; Pages Functions</span><h5>' + escapeHtml(title) + '</h5></div></div>',
                '<div class="admin-platform-metric-grid">',
                    renderPlatformMetric('API / Worker requests', formatNumber(period?.requests)),
                    renderPlatformMetric('Errors', formatNumber(period?.errors)),
                    renderPlatformMetric('Subrequests', formatNumber(period?.subrequests), 'Outbound requests from Functions'),
                    renderPlatformMetric('CPU time', formatDecimal(cpuTime, 2) + ' ms', formatDecimal(period?.averageCpuTimeMs, 4) + ' ms / request average'),
                    renderPlatformMetric('Wall time', formatDecimal(wallTime, 2) + ' ms', formatDecimal(period?.averageWallTimeMs, 3) + ' ms / request average'),
                '</div>',
            '</article>'
        ].join('');
    }

    function renderD1Period(title, period){
        return [
            '<article class="admin-platform-period-card">',
                '<h6>' + escapeHtml(title) + '</h6>',
                '<div class="admin-platform-metric-grid">',
                    renderPlatformMetric('Read queries', formatNumber(period?.readQueries)),
                    renderPlatformMetric('Write queries', formatNumber(period?.writeQueries)),
                    renderPlatformMetric('Rows read', formatNumber(period?.rowsRead)),
                    renderPlatformMetric('Rows written', formatNumber(period?.rowsWritten)),
                    renderPlatformMetric('Query time', formatDecimal(period?.queryTimeMs, 2) + ' ms', formatDecimal(period?.averageQueryTimeMs, 4) + ' ms average per query'),
                    renderPlatformMetric('Query response', formatBytes(period?.responseBytes)),
                '</div>',
            '</article>'
        ].join('');
    }

    function renderD1Database(database){
        const id = String(database?.id || '');
        const name = String(database?.name || id || 'D1 database');
        const sizeDate = database?.storageAsOf
            ? 'Last metric: ' + database.storageAsOf
            : 'Storage metric not available yet';
        return [
            '<article class="admin-platform-database">',
                '<div class="admin-platform-database-head">',
                    '<div><span class="admin-usage-category">Cloudflare D1</span><h5>' + escapeHtml(name) + '</h5><small>' + escapeHtml(id) + '</small></div>',
                    '<div class="admin-platform-database-size"><span>Database size</span><strong>' + escapeHtml(formatBytes(database?.storageBytes)) + '</strong><small>' + escapeHtml(sizeDate) + '</small></div>',
                '</div>',
                '<div class="admin-platform-periods">',
                    renderD1Period('Today (UTC)', database?.today),
                    renderD1Period('This month (UTC)', database?.month),
                    renderD1Period('Last 30 days', database?.last30Days),
                '</div>',
            '</article>'
        ].join('');
    }

    function renderPlatformConfigurationRequired(){
        return [
            '<div class="admin-platform-setup">',
                '<div class="admin-platform-setup-icon">🔐</div>',
                '<h5>Connect Cloudflare read-only analytics</h5>',
                '<p>This section reads Cloudflare’s own Workers and D1 metrics. It is separate from API Usage and does not create any additional D1 writes.</p>',
                '<ol>',
                    '<li>In Cloudflare, open <strong>Manage Account → API Tokens</strong> and create a custom token with <strong>Account Analytics Read</strong>.</li>',
                    '<li>Add the account-level <strong>D1 Read</strong> permission if you want database names and current database size to be shown. Analytics data may still be available without it, but database labels can fall back to IDs.</li>',
                    '<li>In <strong>Workers &amp; Pages → worth-it-calculator → Settings → Variables and Secrets</strong>, add <code>CLOUDFLARE_ACCOUNT_ID</code> as a plain-text variable and <code>CLOUDFLARE_API_TOKEN</code> as a secret.</li>',
                    '<li>Save the settings and redeploy the Pages project so the Functions receive the new values.</li>',
                '</ol>',
                '<p class="admin-platform-setup-footnote">Optional: set <code>CLOUDFLARE_WORKER_SCRIPT_NAME</code> if the Worker cannot be detected automatically, or <code>CLOUDFLARE_D1_DATABASE_ID</code> to restrict metrics to one database.</p>',
                '<button type="button" class="admin-panel-inline-button" onclick="refreshAdminPlatformUsage()">↻ Check again</button>',
            '</div>'
        ].join('');
    }

    async function loadPlatformUsage(){
        const area = $('adminPlatformUsageArea');
        if(!area || platformUsageLoaded) return;
        area.innerHTML = '<div class="admin-panel-loading"><span class="admin-panel-spinner"></span>Loading Cloudflare platform usage...</div>';

        try{
            const session = await getSession();
            if(!session?.access_token) throw new Error('Please sign in again.');

            const response = await fetch('/api/admin-platform-usage', {
                method: 'GET',
                headers: { Authorization: 'Bearer ' + session.access_token },
                cache: 'no-store'
            });

            const result = await response.json().catch(function(){ return {}; });

            if(response.status === 403 || response.status === 401){
                throw new Error(response.status === 403 ? 'Access denied.' : 'Please sign in again.');
            }

            if(response.status === 503 && result.code === 'configuration_required'){
                area.innerHTML = renderPlatformConfigurationRequired();
                platformUsageLoaded = true;
                return;
            }

            if(!response.ok || !result.success){
                const message = result.error || 'Could not load Cloudflare platform usage.';
                const detail = typeof result.detail === 'string' ? result.detail.trim().slice(0, 600) : '';
                throw new Error(detail && detail !== message ? message + ' — ' + detail : message);
            }

            const workers = result.workers || {};
            const d1 = result.d1 || {};
            const workerToday = workers.today || {};
            const d1Today = (d1.databases || []).reduce(function(total, database){
                total.rowsRead += Number(database?.today?.rowsRead || 0);
                total.rowsWritten += Number(database?.today?.rowsWritten || 0);
                total.queryTimeMs += Number(database?.today?.queryTimeMs || 0);
                total.readQueries += Number(database?.today?.readQueries || 0);
                total.writeQueries += Number(database?.today?.writeQueries || 0);
                return total;
            }, { rowsRead: 0, rowsWritten: 0, queryTimeMs: 0, readQueries: 0, writeQueries: 0 });

            const workerAvailabilityLabel = workers.available
                ? ''
                : 'Metric unavailable — Worker script was not detected';
            const d1AvailabilityLabel = d1.available
                ? ''
                : 'Metric unavailable — no D1 analytics returned';
            const summary = [
                '<div class="admin-usage-summary-grid">',
                    '<div class="admin-usage-summary-card"><span>Worker requests today</span><strong>' + (workers.available ? formatNumber(workerToday.requests) : 'Unavailable') + '</strong><small>' + (workers.available ? 'Cloudflare Functions invocations' : escapeHtml(workerAvailabilityLabel)) + '</small></div>',
                    '<div class="admin-usage-summary-card"><span>CPU time today</span><strong>' + (workers.available ? formatDecimal(workerToday.cpuTimeMs, 2) + ' ms' : 'Unavailable') + '</strong><small>' + (workers.available ? 'Actual Worker CPU time reported by Cloudflare' : escapeHtml(workerAvailabilityLabel)) + '</small></div>',
                    '<div class="admin-usage-summary-card"><span>D1 rows read today</span><strong>' + (d1.available ? formatNumber(d1Today.rowsRead) : 'Unavailable') + '</strong><small>' + (d1.available ? formatNumber(d1Today.rowsWritten) + ' rows written · ' + formatNumber(d1Today.readQueries + d1Today.writeQueries) + ' queries' : escapeHtml(d1AvailabilityLabel)) + '</small></div>',
                '</div>'
            ].join('');

            const notes = [
                '<div class="admin-usage-note admin-platform-note"><span>ℹ️</span><div><strong>Cloudflare platform metrics — separate from API Usage</strong><p>Requests count Worker / Pages Function invocations, subrequests count outbound calls from those functions, and CPU time is not the same as total response latency. D1 metrics are database-wide, not attributed to each individual signed-in user. Cloudflare retains D1 analytics for up to 31 days; ingestion delay and adaptive sampling can affect reported values.</p></div></div>'
            ].join('');

            let workerContent = '';
            if(workers.available){
                workerContent = [
                    '<div class="admin-platform-section-title"><h5>⚡ Workers &amp; Pages Functions</h5><small>Script: ' + escapeHtml(workers.scriptName || 'worth-it-calculator') + '</small></div>',
                    '<div class="admin-platform-periods">',
                        renderWorkerPeriod('Today (UTC)', workers.today),
                        renderWorkerPeriod('This month (UTC)', workers.month),
                        renderWorkerPeriod('Last 30 days', workers.last30Days),
                    '</div>',
                    workers.last30Days?.possiblyTruncated
                        ? '<p class="admin-platform-warning">Cloudflare returned the maximum number of Worker metric rows for the last 30 days. Historical totals may be incomplete; set CLOUDFLARE_WORKER_SCRIPT_NAME if needed.</p>'
                        : ''
                ].join('');
            }else{
                const candidates = Array.isArray(workers.candidates) ? workers.candidates : [];
                workerContent = [
                    '<div class="admin-platform-warning"><strong>Worker script not detected automatically.</strong><p>Set <code>CLOUDFLARE_WORKER_SCRIPT_NAME</code> to the exact script name from Cloudflare Workers &amp; Pages.</p>',
                    candidates.length
                        ? '<p>Recently active scripts: ' + candidates.map(item => escapeHtml(item.name)).join(', ') + '</p>'
                        : '<p>No recent Worker script names were returned by Cloudflare.</p>',
                    '</div>'
                ].join('');
            }

            let d1Content = '';
            if(Array.isArray(d1.databases) && d1.databases.length){
                d1Content = d1.databases.map(renderD1Database).join('');
                if(d1.scope === 'multiple-databases' && !d1.lookupAvailable){
                    d1Content += '<p class="admin-platform-warning">More than one D1 database was found, but database names could not be retrieved. Grant D1 Read to the Cloudflare token or set CLOUDFLARE_D1_DATABASE_ID to restrict metrics to Worth It.</p>';
                }else if(d1.scope === 'multiple-databases'){
                    d1Content += '<p class="admin-platform-warning">Metrics are currently shown for multiple databases because none was clearly named for Worth It. Set CLOUDFLARE_D1_DATABASE_ID to scope the data to the exact Worth It database.</p>';
                }
            }else{
                d1Content = '<div class="admin-panel-empty"><span>🗄️</span><strong>No D1 metrics returned</strong><small>Check the Account Analytics Read token permission and database activity.</small></div>';
            }

            area.innerHTML = [
                '<div class="admin-usage-toolbar"><span>Cloudflare platform analytics · Updated ' + escapeHtml(formatPlatformDateTime(result.generatedAt)) + ' UTC</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminPlatformUsage()">↻ Refresh</button></div>',
                summary,
                notes,
                workerContent,
                '<div class="admin-platform-section-title"><h5>🗄️ D1 database usage</h5><small>Read/write operations, rows, query time and storage</small></div>',
                d1Content,
                '<div class="admin-usage-footer">Platform usage data is retrieved live from Cloudflare Analytics. No D1 telemetry table is created. D1 history shown here is limited to the Cloudflare analytics retention window.</div>'
            ].join('');

            platformUsageLoaded = true;
        }catch(error){
            area.innerHTML = '<div class="admin-panel-error"><strong>Could not load Platform Usage</strong><span>' + escapeHtml(error?.message || 'Please try again.') + '</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminPlatformUsage()">Try again</button></div>';
        }
    }

    async function refreshAdminPlatformUsage(){
        platformUsageLoaded = false;
        await loadPlatformUsage();
    }

    async function updateAdminPanelButton(){
        const admin = await isAdmin();

        const button = $('adminPanelButton');
        if(button){
            button.style.display = admin ? '' : 'none';
        }

        /* Bugs & Suggestions is a private admin control on the header/footer. */
        document.querySelectorAll('.feedback-nav-btn, .feedback-trigger').forEach(function(element){
            element.style.display = admin ? '' : 'none';
        });
    }

    window.openAdminPanel = openAdminPanel;
    window.closeAdminPanel = closeAdminPanel;
    window.showAdminSection = showAdminSection;
    window.refreshAdminFeedback = refreshAdminFeedback;
    window.refreshAdminUsage = refreshAdminUsage;
    window.refreshAdminPlatformUsage = refreshAdminPlatformUsage;
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
