/* ==========================================================================
   Sutra Daily Lock-in Quote — deterministic daily selection
   ==========================================================================
   Selects one quote per local calendar day from SutraQuoteBank.
   Same quote for the entire day; new quote at midnight (local time).
   No network requests, no analytics, no Math.random() at render time.
   Works under file:// and served origins alike.
   ========================================================================== */

/* global window, document, SutraQuoteBank */

(function (global) {
    'use strict';

    // ---- Deterministic day number (UTC midnight boundaries) -------------------
    function getLocalDayNumber(date) {
        var d = date || new Date();
        return Math.floor(Date.UTC(
            d.getFullYear(),
            d.getMonth(),
            d.getDate()
        ) / 86400000);
    }

    // ---- Simple deterministic shuffle using the day as a seed ----------------
    // Uses a seeded LCG (linear congruential generator) so the permutation is
    // stable across reloads on the same day, changes on the next day, and never
    // calls Math.random().
    function seededShuffle(arr, seed) {
        var a = arr.slice();
        var n = a.length;
        var s = (seed >>> 0) + 1;       // ensure non-zero
        for (var i = n - 1; i > 0; i--) {
            // LCG step
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            var j = s % (i + 1);
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    // ---- Pick today's quote --------------------------------------------------
    function pickDailyQuote(bank, dayNumber) {
        if (!Array.isArray(bank) || bank.length === 0) return null;

        // Shuffle the bank with the day as seed so the order is stable per day.
        var shuffled = seededShuffle(bank, dayNumber);

        // Index into the shuffled array using the day number so adjacent days
        // never repeat and the cycle wraps cleanly.
        return shuffled[dayNumber % shuffled.length];
    }

    // ---- Hydrate the sidebar element -----------------------------------------
    function hydrate() {
        var bank = global.SutraQuoteBank;
        if (!Array.isArray(bank) || bank.length === 0) return;

        var container = document.getElementById('daily-lock-in-quote');
        var textEl = container && container.querySelector('.daily-lock-in-quote-text');
        var authorEl = container && container.querySelector('.daily-lock-in-quote-author');
        if (!container || !textEl || !authorEl) return;

        var dayNumber = getLocalDayNumber();
        var quote = pickDailyQuote(bank, dayNumber);
        if (!quote) return;

        // Use textContent — never innerHTML — to prevent XSS.
        textEl.textContent = '"' + quote.text + '"';
        authorEl.textContent = '- ' + quote.author;

        container.setAttribute('data-quote-id', quote.id);
        container.setAttribute('data-quote-category', quote.category || '');
        container.removeAttribute('aria-hidden');

        // Subtle one-time entrance opacity transition.
        container.classList.add('daily-lock-in-quote--hydrated');
    }

    // ---- Date-change watcher (wakes up at the next midnight) -----------------
    function scheduleMidnightRefresh() {
        var now = new Date();
        var msUntilMidnight = (
            Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1) -
            Date.now()
        ) + 1000;   // +1 s margin

        setTimeout(function () {
            hydrate();
            scheduleMidnightRefresh();  // reschedule for the following midnight
        }, Math.min(msUntilMidnight, 2147483647));  // clamp to max safe timeout
    }

    // ---- Public API ----------------------------------------------------------
    var SutraQuote = {
        hydrate: hydrate,
        pickDailyQuote: pickDailyQuote,
        getLocalDayNumber: getLocalDayNumber
    };

    global.SutraQuote = SutraQuote;

    // ---- Auto-init when DOM is ready ----------------------------------------
    function init() {
        hydrate();
        scheduleMidnightRefresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOMContentLoaded already fired (scripts at end of body).
        // Defer slightly so the sidebar is guaranteed to be rendered.
        setTimeout(init, 0);
    }

}(typeof window !== 'undefined' ? window : this));
