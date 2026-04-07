// ── HOPICS Shared Utilities ──────────────────────────────────
// Include this script on every page: <script src="hopics-utils.js"></script>

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
