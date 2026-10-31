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
                '<button type="button" class="admin-panel-section-button" data-admin-section="reports" onclick="showAdminSection(&quot;reports&quot;)">',
                    '<span class="admin-panel-section-icon">⚑</span>',
                    '<span class="admin-panel-section-copy"><strong>User Reports</strong><small>Review and moderate profile reports</small></span>',
                    '<span class="admin-panel-section-arrow">›</span>',
                '</button>',
                '<button type="button" class="admin-panel-section-button" data-admin-section="economy" onclick="showAdminSection(\'economy\')">',
                    '<span class="admin-panel-section-icon">◈</span>',
                    '<span class="admin-panel-section-copy"><strong>Economy &amp; Transactions</strong><small>CALC balances, subscriptions and purchase history</small></span>',
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


    async function loadEconomyOverview(){
        const area = $('adminEconomyArea');
        if(!area) return;
        area.innerHTML = '<div class="admin-panel-loading"><span class="admin-panel-spinner"></span>Loading CALC transactions…</div>';
        try{
            const session = await getSession();
            if(!session?.access_token) throw new Error('Please sign in again.');
            const result = await window.supabaseClient.rpc('calc_admin_overview');
            if(result.error) throw result.error;
            const overview = Array.isArray(result.data) ? result.data[0] : result.data;
            if(!overview || typeof overview !== 'object') throw new Error('No economy overview was returned.');
            const rows = Array.isArray(overview.transactions) ? overview.transactions : [];
            const number = value => Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:3});
            const date = value => value ? new Date(value).toLocaleString() : '—';
            const cards = [
                ['Wallets',number(overview.wallet_count)],
                ['Premium Lite active',number(overview.active_premium_lite)],
                ['Premium active',number(overview.active_premium)],
                ['Outstanding CALC',number(overview.calc_balance_total)],
                ['Outstanding WIP',number(overview.wip_balance_total)]
            ];
            const table = rows.length ? '<div class="admin-platform-table-wrap"><table class="admin-platform-table"><thead><tr><th>Date</th><th>User</th><th>Type</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead><tbody>' +
                rows.map(item => {
                    const currency = item.currency === 'WIP' ? 'WIP' : 'CALC';
                    return '<tr><td>'+escapeHtml(date(item.created_at))+'</td><td>'+escapeHtml(item.username || item.email || 'Member')+'</td><td>'+escapeHtml(item.kind || '')+'</td><td>'+escapeHtml(number(item.amount))+' '+currency+'</td><td>'+escapeHtml(number(item.balance_after))+' '+currency+'</td><td>'+escapeHtml(item.status || '')+'</td></tr>';
                }).join('')+
                '</tbody></table></div>' : '<div class="admin-panel-empty"><span>◈</span><strong>No CALC transactions yet</strong><small>Daily rewards, calculator usage and subscription activity will appear here.</small></div>';
            area.innerHTML = '<div class="admin-usage-summary-grid">'+cards.map(card=>'<article class="admin-usage-summary-card"><span>'+escapeHtml(card[0])+'</span><strong>'+escapeHtml(card[1])+'</strong></article>').join('')+'</div>'+
                '<div class="admin-panel-list-head"><span>Latest '+rows.length+' transactions</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminEconomy()">↻ Refresh</button></div>'+table+
                '<div class="admin-panel-card" style="margin-top:16px"><strong>Bank payouts and payment provider</strong><p style="color:var(--muted);line-height:1.6;margin:8px 0 0">Bank account details are not stored in Worth It. Connect and verify a payout account directly in the approved payment provider dashboard. Paid CALC packs and real-money Premium remain disabled until the provider approves the product and webhook integration is configured.</p></div>';
        }catch(error){
            const message = String(error?.message || 'Could not load the economy overview.');
            area.innerHTML = '<div class="admin-panel-error"><strong>Could not load CALC transactions</strong><span>'+escapeHtml(/PGRST202|calc_admin_overview|schema cache/i.test(message)?'Apply the CALC economy SQL migration in Supabase first.':message)+'</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminEconomy()">Try again</button></div>';
        }
    }
    async function refreshAdminEconomy(){
        if(!(await isAdmin())){ closeAdminPanel(); return; }
        await loadEconomyOverview();
    }


    function isCommunityReportMigrationMissing(error){
        const code = String(error?.code || '');
        const message = String(error?.message || error?.details || '').toLowerCase();
        return ['42703','PGRST204','PGRST205'].includes(code) ||
            /admin_note|reviewed_at|schema cache|could not find the table|does not exist/.test(message);
    }
    async function loadUserReports(){
        const area = $('adminUserReportsArea');
        if(!area) return;
        area.innerHTML = '<div class="admin-panel-loading"><span class="admin-panel-spinner"></span>Loading user reports…</div>';
        try{
            const session = await getSession();
            if(!session?.access_token || !(await isAdmin())) throw new Error('Admin access required.');
            let migrationReady = true;
            let result = await window.supabaseClient.from('worth_it_user_reports')
                .select('id,created_at,reporter_worth_it_id,reported_worth_it_id,reported_username,reason,details,status,admin_note,reviewed_at')
                .order('created_at',{ascending:false}).limit(100);
            if(result.error && isCommunityReportMigrationMissing(result.error)){
                migrationReady = false;
                result = await window.supabaseClient.from('worth_it_user_reports')
                    .select('id,created_at,reporter_worth_it_id,reported_worth_it_id,reported_username,reason,details,status')
                    .order('created_at',{ascending:false}).limit(100);
            }
            if(result.error) throw result.error;
            const rows = Array.isArray(result.data) ? result.data : [];
            const readOnlyNotice = migrationReady ? '' :
                '<div class="admin-user-report-readonly-note"><strong>Preview is read-only for moderation.</strong><span>These reports are loaded from the current database. Status changes and private moderation notes will become available after the community migration is installed in the Preview database.</span></div>';
            if(!rows.length){
                area.innerHTML = readOnlyNotice + '<div class="admin-panel-empty"><span>✓</span><strong>No user reports</strong><small>New profile reports will appear here after a member submits one.</small></div>';
                return;
            }
            area.innerHTML = readOnlyNotice +
                '<div class="admin-panel-list-head"><span>'+rows.length+' latest reports</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminUserReports()">↻ Refresh</button></div>' +
                '<div class="admin-user-reports-list">'+rows.map(item=>{
                    const date = item.created_at ? new Date(item.created_at).toLocaleString() : '—';
                    const reporter = item.reporter_worth_it_id ? 'Worth It ID '+item.reporter_worth_it_id : 'Member';
                    const reported = item.reported_worth_it_id ? 'Worth It ID '+item.reported_worth_it_id : 'Unknown profile';
                    const options = ['open','reviewing','resolved','dismissed'].map(status=>'<option value="'+status+'"'+(item.status===status?' selected':'')+'>'+status.charAt(0).toUpperCase()+status.slice(1)+'</option>').join('');
                    const moderation = migrationReady ?
                        '<label>Status<select class="admin-user-report-status">'+options+'</select></label>'+
                        '<label>Private admin note<textarea class="admin-user-report-note" maxlength="1000" rows="2">'+escapeHtml(item.admin_note||'')+'</textarea></label>'+
                        '<button type="button" class="admin-panel-inline-button" onclick="moderateWorthItUserReport('+Number(item.id)+',this)">Save moderation update</button>'+
                        (item.reviewed_at?'<small>Last reviewed '+escapeHtml(new Date(item.reviewed_at).toLocaleString())+'</small>':'') :
                        '<p class="admin-user-report-readonly-hint">Status: <strong>'+escapeHtml(item.status||'open')+'</strong> · Moderation controls are unavailable until the Preview database migration is installed.</p>';
                    return '<article class="admin-user-report-card" data-report-id="'+Number(item.id)+'">'+
                        '<div class="admin-user-report-top"><div><strong>#'+Number(item.id)+' · '+escapeHtml(item.reason||'Other')+'</strong><small>'+escapeHtml(date)+'</small></div><span>'+escapeHtml(item.status||'open')+'</span></div>'+
                        '<p><strong>Reported:</strong> '+escapeHtml(item.reported_username||'Worth It member')+' · '+escapeHtml(reported)+'</p>'+
                        '<p><strong>Submitted by:</strong> '+escapeHtml(reporter)+'</p>'+
                        '<p class="admin-user-report-details">'+escapeHtml(item.details||'No extra details provided.')+'</p>'+
                        moderation+
                    '</article>';
                }).join('')+'</div>';
        }catch(error){
            area.innerHTML = '<div class="admin-panel-error"><strong>Could not load user reports</strong><span>'+escapeHtml(error?.message||'Please check the report table setup and try again.')+'</span><button type="button" class="admin-panel-inline-button" onclick="refreshAdminUserReports()">Try again</button></div>';
        }
    }
    async function refreshAdminUserReports(){
        if(!(await isAdmin())){ closeAdminPanel(); return; }
        await loadUserReports();
    }
    async function moderateWorthItUserReport(reportId,button){
        if(!(await isAdmin())){ closeAdminPanel(); return; }
        const card = button?.closest('.admin-user-report-card');
        const status = card?.querySelector('.admin-user-report-status')?.value || '';
        const note = card?.querySelector('.admin-user-report-note')?.value || '';
        if(!Number.isSafeInteger(Number(reportId)) || Number(reportId)<1 || !card || button.disabled) return;
        button.disabled = true;
        try{
            const result = await window.supabaseClient.rpc('admin_update_worth_it_user_report',{
                p_report_id:Number(reportId),p_status:status,p_admin_note:note
            });
            if(result.error) throw result.error;
            const payload = Array.isArray(result.data)?result.data[0]:result.data;
            if(!payload?.success) throw new Error(payload?.code==='REPORT_NOT_FOUND'?'This report no longer exists.':'The moderation update was not saved.');
            setStatus('Report #'+reportId+' updated.', 'success');
            await loadUserReports();
        }catch(error){
            setStatus(error?.message||'Could not update the report. Apply the community features SQL migration first.','error');
            button.disabled = false;
        }
    }

    async function showAdminSection(section){
        if(!(await isAdmin())){ closeAdminPanel(); return; }
        activeSection =
            section === 'feedback' ||
            section === 'usage' ||
            section === 'platform-usage' ||
            section === 'reports' ||
            section === 'economy'
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
        if(activeSection === 'reports'){
            content.innerHTML = renderSectionHeader('User Reports','Private reports submitted by Worth It members.','⚑') + '<div id="adminUserReportsArea"></div>';
            setActiveNav();
            await loadUserReports();
            return;
        }
        if(activeSection === 'economy'){
            content.innerHTML = renderSectionHeader('Economy & Transactions','Private CALC balances, subscription activity and purchase history.','◈') + '<div id="adminEconomyArea"></div>';
            setActiveNav();
            await loadEconomyOverview();
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
        const wallTime = Number(period?.wallTimeMs || 0);
        const cpuMedian = period?.cpuTimeP50Ms;
        const cpuP99 = period?.cpuTimeP99Ms;
        return [
            '<article class="admin-usage-card admin-platform-period-card">',
                '<div class="admin-usage-card-top"><div><span class="admin-usage-category">Pages Functions</span><h5>' + escapeHtml(title) + '</h5></div></div>',
                '<div class="admin-platform-metric-grid">',
                    renderPlatformMetric('Function requests', formatNumber(period?.requests)),
                    renderPlatformMetric('Errors', formatNumber(period?.errors)),
                    renderPlatformMetric('Subrequests', formatNumber(period?.subrequests), 'Outbound requests from Functions'),
                    renderPlatformMetric('CPU time (P50 median)', cpuMedian == null ? 'Unavailable' : formatDecimal(cpuMedian, 3) + ' ms', 'P99: ' + (cpuP99 == null ? 'Unavailable' : formatDecimal(cpuP99, 3) + ' ms') + ' per execution'),
                    renderPlatformMetric('Wall time total', formatDecimal(wallTime, 2) + ' ms', formatDecimal(period?.averageWallTimeMs, 3) + ' ms / request average'),
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
                    renderPlatformMetric('Estimated query time', formatDecimal(period?.queryTimeMs, 2) + ' ms', formatDecimal(period?.averageQueryTimeMs, 4) + ' ms weighted average per query'),
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
                '<p class="admin-platform-setup-footnote">Optional: set <code>CLOUDFLARE_PAGES_FUNCTION_SCRIPT_NAME</code> if the Pages Functions script cannot be detected automatically, or <code>CLOUDFLARE_D1_DATABASE_ID</code> to restrict metrics to one database.</p>',
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
                    '<div class="admin-usage-summary-card"><span>Median CPU time today</span><strong>' + (workers.available && workerToday.cpuTimeP50Ms != null ? formatDecimal(workerToday.cpuTimeP50Ms, 3) + ' ms' : 'Unavailable') + '</strong><small>' + (workers.available && workerToday.cpuTimeP99Ms != null ? 'P99: ' + formatDecimal(workerToday.cpuTimeP99Ms, 3) + ' ms per execution' : escapeHtml(workerAvailabilityLabel)) + '</small></div>',
                    '<div class="admin-usage-summary-card"><span>D1 rows read today</span><strong>' + (d1.available ? formatNumber(d1Today.rowsRead) : 'Unavailable') + '</strong><small>' + (d1.available ? formatNumber(d1Today.rowsWritten) + ' rows written · ' + formatNumber(d1Today.readQueries + d1Today.writeQueries) + ' queries' : escapeHtml(d1AvailabilityLabel)) + '</small></div>',
                '</div>'
            ].join('');

            const notes = [
                '<div class="admin-usage-note admin-platform-note"><span>ℹ️</span><div><strong>Cloudflare platform metrics — separate from API Usage</strong><p>Requests count Pages Functions invocations, subrequests count outbound calls from those functions, and CPU time is shown as P50 (median) and P99 per-execution percentiles rather than a summed total. D1 metrics are database-wide, not attributed to each individual signed-in user. Cloudflare retains D1 analytics for up to 31 days; ingestion delay and adaptive sampling can affect reported values.</p></div></div>'
            ].join('');

            let workerContent = '';
            if(workers.available){
                workerContent = [
                    '<div class="admin-platform-section-title"><h5>⚡ Pages Functions</h5><small>Script: ' + escapeHtml(workers.scriptName || 'worth-it-calculator') + '</small></div>',
                    '<div class="admin-platform-periods">',
                        renderWorkerPeriod('Today (UTC)', workers.today),
                        renderWorkerPeriod('This month (UTC)', workers.month),
                        renderWorkerPeriod('Last 30 days', workers.last30Days),
                    '</div>',
                    workers.last30Days?.possiblyTruncated
                        ? '<p class="admin-platform-warning">Cloudflare returned the maximum number of Pages Functions metric rows for the last 30 days. Historical totals may be incomplete; check CLOUDFLARE_PAGES_FUNCTION_SCRIPT_NAME if needed.</p>'
                        : ''
                ].join('');
            }else{
                const candidates = Array.isArray(workers.candidates) ? workers.candidates : [];
                workerContent = [
                    '<div class="admin-platform-warning"><strong>Pages Functions script not detected automatically.</strong><p>Set <code>CLOUDFLARE_PAGES_FUNCTION_SCRIPT_NAME</code> to the exact script name from Cloudflare Pages Functions Metrics.</p>',
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

        /*
         * Bugs & Suggestions is a public entry point. Everyone can open the
         * feedback form; sending still requires a valid signed-in session.
         * Reading submitted feedback remains protected by the admin-only panel
         * and its server-side authorization.
         */
        document.querySelectorAll('.feedback-nav-btn, .feedback-trigger').forEach(function(element){
            element.style.display = '';
        });
    }

    window.openAdminPanel = openAdminPanel;
    window.closeAdminPanel = closeAdminPanel;
    window.showAdminSection = showAdminSection;
    window.refreshAdminFeedback = refreshAdminFeedback;
    window.refreshAdminUsage = refreshAdminUsage;
    window.refreshAdminPlatformUsage = refreshAdminPlatformUsage;
    window.refreshAdminEconomy = refreshAdminEconomy;
    window.refreshAdminUserReports = refreshAdminUserReports;
    window.moderateWorthItUserReport = moderateWorthItUserReport;
    window.openAdminFeedback = openAdminPanel;
    window.closeAdminFeedback = closeAdminPanel;
    window.loadAdminFeedback = refreshAdminFeedback;


    document.addEventListener('keydown',function(event){
        if(event.key === 'Escape' && $('adminPanelOverlay')?.classList.contains('open')) closeAdminPanel();
    });

    if(window.supabaseClient?.auth){
        window.supabaseClient.auth.onAuthStateChange(function(){ updateAdminPanelButton(); });
    }

    updateAdminPanelButton();
})();
