/**
 * ai-widget.js
 * "Ask CFF AI" — a floating assistant widget available on every screen of
 * the app (role selection, sign-up, assessment, results). It is injected
 * directly into document.body so it persists no matter what the SPA
 * currently has rendered inside #root.
 *
 * Two modes, same as the rest of CFF's AI integration:
 *
 * 1. Real AI mode: POSTs to POST /api/chat (added in server/server.js),
 *    which calls the Anthropic API server-side using your ANTHROPIC_API_KEY.
 *    This is what runs once you've followed the README setup steps.
 *
 * 2. Demo fallback: if /api/chat is unreachable or not deployed (e.g. you
 *    open index.html directly as a file instead of via `npm start`), the
 *    widget answers common questions locally with simple keyword matching
 *    so it still feels useful. It is clearly not real AI in this mode.
 *
 * The API key is NEVER referenced here — this file only ever talks to our
 * own same-origin /api/chat endpoint.
 */

(function () {
  try {
    initCffAiWidget();
  } catch (err) {
    console.error('CFF: AI widget failed to initialize', err);
  }

  function initCffAiWidget() {
    var CHAT_ENDPOINT = ((window.CFF_CONFIG && window.CFF_CONFIG.API_BASE_URL) || '') + '/api/chat';

    var launcher = document.createElement('button');
    launcher.className = 'cff-ai-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open CFF AI assistant');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z"/>' +
      '<path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7L19 14z"/>' +
      '</svg><span class="cff-ai-dot" aria-hidden="true"></span>';

    var panel = document.createElement('div');
    panel.className = 'cff-ai-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'CFF AI assistant chat');
    panel.innerHTML =
      '<div class="cff-ai-header">' +
        '<div class="who">' +
          '<div class="avatar-ai"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z"/></svg></div>' +
          '<div><h4>CFF AI Assistant</h4><p>Online now</p></div>' +
        '</div>' +
        '<button type="button" class="cff-ai-close" aria-label="Close chat">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="cff-ai-messages" id="cff-ai-messages"></div>' +
      '<div class="cff-ai-chips" id="cff-ai-chips">' +
        '<button type="button" class="cff-ai-chip">What is CFF?</button>' +
        '<button type="button" class="cff-ai-chip">How does the assessment work?</button>' +
        '<button type="button" class="cff-ai-chip">Is my data private?</button>' +
        '<button type="button" class="cff-ai-chip">Which role should I pick?</button>' +
      '</div>' +
      '<form class="cff-ai-input-row" id="cff-ai-form">' +
        '<input type="text" id="cff-ai-input" placeholder="Ask about the assessment, your results, or how CFF works…" autocomplete="off" aria-label="Message">' +
        '<button type="submit" class="cff-ai-send" aria-label="Send message">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        '</button>' +
      '</form>' +
      '<p class="cff-ai-footnote">AI-generated answers may be inaccurate and are not professional advice.</p>';

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    var messagesEl = panel.querySelector('#cff-ai-messages');
    var chipsEl = panel.querySelector('#cff-ai-chips');
    var formEl = panel.querySelector('#cff-ai-form');
    var inputEl = panel.querySelector('#cff-ai-input');
    var closeEl = panel.querySelector('.cff-ai-close');
    var history = [];
    var greeted = false;

    function addMessage(role, text) {
      var msg = document.createElement('div');
      msg.className = 'cff-ai-msg ' + (role === 'user' ? 'user' : 'bot');
      msg.textContent = text;
      messagesEl.appendChild(msg);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      history.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
    }

    function showTyping() {
      var t = document.createElement('div');
      t.className = 'cff-ai-typing';
      t.id = 'cff-ai-typing-indicator';
      t.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      var t = document.getElementById('cff-ai-typing-indicator');
      if (t) t.remove();
    }

    function openPanel() {
      panel.classList.add('is-open');
      launcher.setAttribute('aria-expanded', 'true');
      if (!greeted) {
        greeted = true;
        addMessage(
          'bot',
          "Hi! I'm the CFF AI Assistant. Ask me how the Values Assessment works, which role to pick, or what happens to your data."
        );
      }
      inputEl.focus();
    }

    function closePanel() {
      panel.classList.remove('is-open');
      launcher.setAttribute('aria-expanded', 'false');
    }

    launcher.addEventListener('click', function () {
      panel.classList.contains('is-open') ? closePanel() : openPanel();
    });
    closeEl.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
    });

    chipsEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.cff-ai-chip');
      if (!chip) return;
      sendMessage(chip.textContent);
    });

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      sendMessage(text);
    });

    function sendMessage(text) {
      addMessage('user', text);
      chipsEl.style.display = 'none';
      showTyping();

      fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('No backend configured');
          return res.json();
        })
        .then(function (data) {
          hideTyping();
          addMessage('bot', data.reply || "Sorry, I didn't catch that — could you rephrase?");
        })
        .catch(function () {
          // /api/chat isn't reachable (e.g. static file preview with no
          // server running) — fall back to the local demo responder so the
          // widget still demonstrates the intended experience.
          setTimeout(function () {
            hideTyping();
            addMessage('bot', getDemoReply(text));
          }, 450 + Math.random() * 450);
        });
    }

    function getDemoReply(raw) {
      var text = raw.toLowerCase();

      if (/what is cff|about cff|what does cff|what.?s cff/.test(text)) {
        return "CFF (Company Formation Framework) is an assessment app that helps you understand your personal values, life journey, and the role you're best suited to play in building or working at a successful company — starting with a 13-question Values Assessment analysed by AI.";
      }
      if (/how.*assessment.*work|how does it work|13 question|how.*it work/.test(text)) {
        return "You'll answer 13 questions (things like how you spend your time, energy, and money) with 3 responses each. The AI looks at all 39 answers together and returns your top values, supporting values, behavioural patterns, and recommended next steps.";
      }
      if (/private|privacy|data|store|localstorage|security/.test(text)) {
        return "Your answers are saved locally in your browser (localStorage) so you can pick up where you left off. When you generate an analysis, your answers are sent to our server, which calls the AI provider — your raw answers are never stored on our server or shared elsewhere.";
      }
      if (/which role|visitor|business owner|employee|what role|role should/.test(text)) {
        return "Pick Visitor if you want personal clarity and life direction, Business Owner if you're exploring founder identity and company strategy, or Employee if you want to understand career alignment and where you can contribute most. You can always retake it under a different role.";
      }
      if (/sign ?up|password|login|account/.test(text)) {
        return "Signing up in this build just needs a name — no password required. It's a lightweight demo flow, not a production auth system yet.";
      }
      if (/price|cost|free|pay/.test(text)) {
        return "The assessment itself doesn't ask for payment in this build. Pricing/plans aren't part of this demo — check with whoever deployed this instance for their real offering.";
      }
      if (/result|analysis|output|report/.test(text)) {
        return "Your results include 3 top values and 5 supporting values (each with evidence and a confidence level), repeated themes, behavioural patterns, personal strengths, development areas, a values statement, and recommended next steps.";
      }
      if (/hi|hello|hey|good (morning|afternoon|evening)/.test(text)) {
        return "Hello! I can help with questions about the Values Assessment, your results, roles, or how your data is handled. What would you like to know?";
      }
      if (/thank/.test(text)) {
        return "You're welcome! Anything else you'd like to know about CFF?";
      }
      return "I'm running in offline demo mode right now, so I can only help with a few common topics — what CFF is, how the assessment works, roles, privacy, and results. Try one of the suggestions above, or rephrase your question.";
    }
  }
})();
