// ── HOPICS Shared Utilities ──────────────────────────────────
// Include this script on every page: <script src="hopics-utils.js"></script>

// ── Background Session Refresh ────────────────────────────────
// Silently re-verifies the logged-in user's role/name/program on every page
// load. If an admin changed their role, the session updates immediately.
// If the account was deactivated, they are signed out.
(function refreshSession() {
    var HOPICS_GAS_URL = 'https://script.google.com/macros/s/AKfycbxivCGau_AAvXVPa20svMiZKRmm2IXqk6vT7KL_nmnCcIR8pz2wwUHekONomebDaM0L2w/exec';

    var sess = null;
    try { sess = JSON.parse(sessionStorage.getItem('hopics_user') || 'null'); } catch(e) {}
    if (!sess || !sess.email) return;  // not logged in — nothing to refresh

    var cbName = '_sessRefresh_' + Date.now();
    var done   = false;

    // Timeout: if GAS doesn't respond in 20s, silently give up (don't block the user)
    var timer = setTimeout(function() {
        done = true;
        try { delete window[cbName]; } catch(e) {}
    }, 20000);

    window[cbName] = function(data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cbName]; } catch(e) {}

        if (!data) return;

        if (data.authorized === false) {
            // Account deactivated — sign out
            sessionStorage.removeItem('hopics_user');
            if (window.location.pathname.indexOf('login') === -1 &&
                window.location.pathname.indexOf('index') === -1) {
                window.location.replace('login.html');
            }
            return;
        }

        if (data.authorized === true) {
            var changed = (data.role    !== sess.role)    ||
                          (data.name    !== sess.name)    ||
                          (data.program !== sess.program);
            if (changed) {
                sess.role    = data.role    || sess.role;
                sess.name    = data.name    || sess.name;
                sess.program = data.program || sess.program;
                sessionStorage.setItem('hopics_user', JSON.stringify(sess));

                // Update profile pill name if visible on this page
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
