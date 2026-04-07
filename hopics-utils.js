// ── HOPICS Shared Utilities ──────────────────────────────────
// Include this script on every page: <script src="hopics-utils.js"></script>

// ── GAS URL ───────────────────────────────────────────────────
var HOPICS_GAS_URL = 'https://script.google.com/macros/s/AKfycbxivCGau_AAvXVPa20svMiZKRmm2IXqk6vT7KL_nmnCcIR8pz2wwUHekONomebDaM0L2w/exec';

// ── gasGet ────────────────────────────────────────────────────
// Fetch data from GAS backend. Returns a Promise.
// Usage: gasGet('listUsers').then(function(data) { ... });
//        gasGet('getThreads', { user: email, archived: false }).then(...);
// Uses JSONP internally so it works cross-origin without CORS headers.
function gasGet(action, params) {
    return new Promise(function(resolve, reject) {
        var base = window.GOOGLE_SCRIPT_URL || HOPICS_GAS_URL;
        var cbName = '_gasGet_' + Date.now() + '_' + (Math.random() * 1e9 | 0);
        var qs = 'action=' + encodeURIComponent(action);
        if (params) {
            Object.keys(params).forEach(function(k) {
                if (params[k] !== undefined && params[k] !== null) {
                    qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
                }
            });
        }
        var timer = setTimeout(function() {
            try { delete window[cbName]; } catch(e) {}
            reject(new Error('gasGet timeout: ' + action));
        }, 30000);
        window[cbName] = function(data) {
            clearTimeout(timer);
            try { delete window[cbName]; } catch(e) {}
            resolve(data);
        };
        var s = document.createElement('script');
        s.src = base + '?' + qs + '&callback=' + cbName;
        s.onerror = function() {
            clearTimeout(timer);
            try { delete window[cbName]; } catch(e) {}
            reject(new Error('gasGet error: ' + action));
        };
        document.head.appendChild(s);
    });
}

// ── Background Session Refresh ────────────────────────────────
// Silently re-verifies the logged-in user's role/name/program on every page
// load. If an admin changed their role, the session updates immediately.
// If the account was deactivated, they are signed out.
(function refreshSession() {
    var sess = null;
    try { sess = JSON.parse(sessionStorage.getItem('hopics_user') || 'null'); } catch(e) {}
    if (!sess || !sess.email) return;  // not logged in — nothing to refresh

    var cbName = '_sessRefresh_' + Date.now();
    var done   = false;
    var timer  = setTimeout(function() {
        done = true;
        try { delete window[cbName]; } catch(e) {}
    }, 20000);

    window[cbName] = function(data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cbName]; } catch(e) {}
        if (!data) return;

        console.log('[HOPICS] verifyUser response for', sess.email, ':', data);

        if (data.authorized === false) {
            console.warn('[HOPICS] User not authorized — redirecting to login. Check that', sess.email, 'exists in the Users sheet with Status = Active.');
            sessionStorage.removeItem('hopics_user');
            if (window.location.pathname.indexOf('login') === -1 &&
                window.location.pathname.indexOf('index') === -1) {
                window.location.replace('login.html');
            }
            return;
        }

        if (data.authorized === true) {
            var roleChanged = data.role && data.role !== sess.role;
            var changed = roleChanged ||
                          (data.name    !== sess.name)    ||
                          (data.program !== sess.program);
            if (changed) {
                sess.role    = data.role    || sess.role;
                sess.name    = data.name    || sess.name;
                sess.program = data.program || sess.program;
                sessionStorage.setItem('hopics_user', JSON.stringify(sess));

                if (roleChanged) {
                    window.location.reload();
                    return;
                }

                var nm = document.getElementById('sidebarName');
                if (nm && data.name) nm.textContent = data.name;
            }
        }
    };

    var s = document.createElement('script');
    s.src = HOPICS_GAS_URL + '?action=verifyUser&email=' + encodeURIComponent(sess.email) + '&callback=' + cbName;
    s.onerror = function() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch(e) {}
    };
    document.head.appendChild(s);
})();

// ── Collapsible Sidebar ───────────────────────────────────────
// Auto-injects a hamburger toggle into .sidebar-brand on DOMContentLoaded
(function initSidebarToggle() {
    function setup() {
        var brand = document.querySelector('.sidebar-brand');
        var sidebar = document.querySelector('.app-sidebar');
        if (!brand || !sidebar) return;

        // Inject toggle button
        var btn = document.createElement('button');
        btn.className = 'sidebar-toggle-btn';
        btn.setAttribute('aria-label', 'Toggle sidebar');
        btn.innerHTML = '<div class="hb-line"></div><div class="hb-line"></div><div class="hb-line"></div>';
        brand.appendChild(btn);

        // Restore saved state
        var collapsed = localStorage.getItem('hopics_sidebar_collapsed') === '1';
        if (collapsed) sidebar.classList.add('sidebar-collapsed');

        btn.addEventListener('click', function() {
            sidebar.classList.toggle('sidebar-collapsed');
            localStorage.setItem('hopics_sidebar_collapsed',
                sidebar.classList.contains('sidebar-collapsed') ? '1' : '0');
        });

        // Add tooltips to nav items when collapsed
        sidebar.querySelectorAll('.sidebar-nav a').forEach(function(a) {
            var spanText = a.querySelector('span');
            if (spanText) a.setAttribute('title', spanText.textContent.trim());
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();

// ── CSV Export ────────────────────────────────────────────────
// Usage: exportTableToCSV(tableId, filename)
//        exportArrayToCSV(headers, rows, filename)
function exportTableToCSV(tableId, filename) {
    var table = document.getElementById(tableId);
    if (!table) { showToast('No data to export', 'error'); return; }
    var rows = Array.from(table.querySelectorAll('tr'));
    var csv  = rows.map(function(row) {
        return Array.from(row.querySelectorAll('th,td')).map(function(cell) {
            var text = cell.innerText.replace(/"/g, '""').replace(/\n/g, ' ').trim();
            return '"' + text + '"';
        }).join(',');
    }).join('\n');
    _downloadCSV(csv, filename || 'export.csv');
}

function exportArrayToCSV(headers, rows, filename) {
    var csv = [headers.map(function(h) { return '"' + h + '"'; }).join(',')];
    rows.forEach(function(row) {
        csv.push(row.map(function(cell) {
            return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
        }).join(','));
    });
    _downloadCSV(csv.join('\n'), filename || 'export.csv');
}

function _downloadCSV(csv, filename) {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported ' + filename, 'success');
}

// ── Toast notification ────────────────────────────────────────
// Usage: showToast('Referral saved!', 'success')
// Types: 'success' | 'error' | 'info' (default)
function showToast(msg, type) {
    let toast = document.getElementById('_hopics_toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = '_hopics_toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className   = 'toast-' + (type || 'info');
    // Force reflow so transition replays
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 3200);
}

// ── Message Notification Poller ───────────────────────────────
// Runs on every page except messages.html (which has its own poller).
// Polls GAS every 60s for new unread threads and shows a popup card.
(function initMsgNotifications() {
    if (window.location.pathname.indexOf('messages') !== -1) return;

    var _lastUnread = 0;
    var _firstPoll  = true;

    // ── Browser notification permission ──────────────────────
    function requestPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    function showBrowserNotif(title, body) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        var n = new Notification(title, { body: body });
        n.onclick = function() { window.location.href = 'messages.html'; };
    }

    // ── In-app popup card ────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('_msgNotifCSS')) return;
        var s = document.createElement('style');
        s.id = '_msgNotifCSS';
        s.textContent = [
            '#_msgNotifCard{position:fixed;top:1.25rem;right:1.25rem;z-index:9999;background:#fff;',
            'border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);border:1px solid #e5e5ea;',
            'padding:1rem 1.25rem;max-width:320px;min-width:260px;display:flex;flex-direction:column;',
            'gap:.5rem;animation:_msgIn .35s cubic-bezier(.22,1,.36,1) both;}',
            '@keyframes _msgIn{from{opacity:0;transform:translateY(-12px) scale(.97)}to{opacity:1;transform:none}}',
            '._mnH{display:flex;align-items:center;gap:.625rem;}',
            '._mnAv{width:36px;height:36px;border-radius:50%;background:#ffd700;display:grid;place-items:center;',
            'font-weight:700;font-size:.9rem;color:#111;flex-shrink:0;}',
            '._mnTitle{font-weight:700;font-size:.875rem;color:#1d1d1f;}',
            '._mnSub{font-size:.75rem;color:#6e6e73;}',
            '._mnPrev{font-size:.825rem;color:#3a3a3c;line-height:1.4;overflow:hidden;',
            'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
            '._mnActs{display:flex;gap:.5rem;margin-top:.25rem;}',
            '._mnBtn{padding:.4rem .875rem;border-radius:8px;font-size:.8rem;font-weight:600;border:none;cursor:pointer;}',
            '._mnView{background:#ffd700;color:#111;} ._mnX{background:#f5f5f7;color:#3a3a3c;margin-left:auto;}'
        ].join('');
        document.head.appendChild(s);
    }

    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function showCard(senderEmail, preview, count) {
        injectStyles();
        var old = document.getElementById('_msgNotifCard');
        if (old) old.remove();

        var initial = (senderEmail || '?').charAt(0).toUpperCase();
        var countLabel = count > 1 ? count + ' new messages' : 'New message';

        var card = document.createElement('div');
        card.id = '_msgNotifCard';
        card.innerHTML =
            '<div class="_mnH">' +
                '<div class="_mnAv">' + initial + '</div>' +
                '<div><div class="_mnTitle">' + countLabel + '</div>' +
                '<div class="_mnSub">from ' + esc(senderEmail) + '</div></div>' +
                '<button class="_mnBtn _mnX" onclick="event.stopPropagation();document.getElementById(\'_msgNotifCard\').remove();">✕</button>' +
            '</div>' +
            (preview ? '<div class="_mnPrev">' + esc(preview) + '</div>' : '') +
            '<div class="_mnActs"><button class="_mnBtn _mnView" onclick="window.location.href=\'messages.html\'">View Messages</button></div>';

        card.style.cursor = 'pointer';
        card.onclick = function() { window.location.href = 'messages.html'; };
        document.body.appendChild(card);
        setTimeout(function() { if (card.parentNode) card.remove(); }, 8000);
    }

    // ── Nav badge (works on all pages) ───────────────────────
    function updateNavBadge(count) {
        var link = document.querySelector('.sidebar-nav a[href="messages.html"]');
        if (!link) return;
        var badge = link.querySelector('.nav-unread-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-unread-badge';
                badge.style.cssText = 'background:#ef4444;color:#fff;border-radius:99px;font-size:.65rem;font-weight:700;padding:.1rem .45rem;margin-left:auto;flex-shrink:0;';
                link.appendChild(badge);
            }
            badge.textContent = count > 99 ? '99+' : count;
        } else if (badge) {
            badge.remove();
        }
    }

    // ── Poll ─────────────────────────────────────────────────
    function poll() {
        var sess = null;
        try { sess = JSON.parse(sessionStorage.getItem('hopics_user') || 'null'); } catch(e) {}
        if (!sess || !sess.email) return;

        gasGet('getThreads', { user: sess.email, archived: false })
            .then(function(data) {
                if (!data || !data.success || !Array.isArray(data.threads)) return;
                var totalUnread = data.threads.reduce(function(n, t) { return n + (t.unreadCount || 0); }, 0);
                updateNavBadge(totalUnread);

                if (!_firstPoll && totalUnread > _lastUnread) {
                    // Find newest unread thread for preview
                    var unreadThreads = data.threads.filter(function(t) { return (t.unreadCount || 0) > 0; });
                    var first = unreadThreads[0] || {};
                    var senderEmail = (first.participants || []).find(function(p) { return p !== sess.email; }) || 'Someone';
                    var preview = first.lastMessage || '';
                    showCard(senderEmail, preview, totalUnread);
                    showBrowserNotif('New message from ' + senderEmail, preview.substring(0, 80) || 'You have a new message');
                    playChime('receive');
                }

                _lastUnread  = totalUnread;
                _firstPoll   = false;
            })
            .catch(function() {});
    }

    function start() {
        requestPermission();
        setTimeout(poll, 5000);        // first poll 5s after page load
        setInterval(poll, 60000);      // then every 60s
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

// ── Chime / notification sound ────────────────────────────────
// Generates a short tone using the Web Audio API — no file needed
// Usage: playChime('send') | playChime('receive') | playChime('success') | playChime('error')
function playChime(type) {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        var now = ctx.currentTime;

        if (type === 'send') {
            // Short upward blip
            osc.type = 'sine';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.linearRampToValueAtTime(680, now + 0.12);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.18);
            osc.start(now);
            osc.stop(now + 0.18);
        } else if (type === 'receive') {
            // Two-note ding
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, now);
            osc.frequency.setValueAtTime(880, now + 0.13);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.28);
            osc.start(now);
            osc.stop(now + 0.28);
        } else if (type === 'success') {
            // Ascending three-note
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523, now);
            osc.frequency.setValueAtTime(659, now + 0.1);
            osc.frequency.setValueAtTime(784, now + 0.2);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'error') {
            // Low descending
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(180, now + 0.22);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else {
            // Default soft click
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        }
    } catch (e) {
        // AudioContext not available — silent fail
    }
}
