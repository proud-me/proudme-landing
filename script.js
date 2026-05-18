// Tiny progressive-enhancement script. The site fully works without it.
// We only handle: (1) closing the nav after an anchor click on small screens,
// (2) flagging the active section while scrolling so the nav can highlight.

(function () {
  'use strict';

  // Highlight the active section in the top nav based on scroll position.
  // Best-effort, falls back to no highlighting if IntersectionObserver isn't
  // available (older browsers).
  if (!('IntersectionObserver' in window)) return;

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav__links a[href^="#"]')
  );
  if (!navLinks.length) return;

  var byId = {};
  navLinks.forEach(function (link) {
    var id = link.getAttribute('href').slice(1);
    if (id) byId[id] = link;
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var link = byId[entry.target.id];
      if (!link) return;
      if (entry.isIntersecting) {
        navLinks.forEach(function (l) { l.removeAttribute('aria-current'); });
        link.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

  Object.keys(byId).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) observer.observe(el);
  });
})();

// Contact form: POST to Formspree, show inline success/error.
// While the form action still contains the {FORMSPREE_FORM_ID} placeholder
// (i.e. before Formspree has been set up on proudmeresearch@gmail.com),
// fall back to a mailto link so the form is never broken in production.
(function () {
  'use strict';
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('contact-status');
  var submitBtn = form.querySelector('.contact__submit');
  var FALLBACK_EMAIL = 'proudmeresearch@gmail.com';

  function setStatus(kind, text) {
    if (!status) return;
    status.className = 'contact__status contact__status--' + kind;
    status.textContent = text;
  }

  form.addEventListener('submit', function (e) {
    var action = form.getAttribute('action') || '';
    var formspreeReady = action.indexOf('{FORMSPREE_FORM_ID}') === -1;

    if (!formspreeReady) {
      // Fallback: open user's mail client until Formspree is wired up.
      e.preventDefault();
      var data = new FormData(form);
      var name = String(data.get('name') || '').trim();
      var email = String(data.get('email') || '').trim();
      var message = String(data.get('message') || '').trim();
      if (!name || !email || !message) {
        setStatus('error', 'Please fill in name, email, and message.');
        return;
      }
      var subject = encodeURIComponent('Contact from ' + name);
      var body = encodeURIComponent(message + '\n\nFrom: ' + name + ' (' + email + ')');
      window.location.href = 'mailto:' + FALLBACK_EMAIL + '?subject=' + subject + '&body=' + body;
      return;
    }

    // Formspree mode: fetch POST, stay on page, show inline result.
    e.preventDefault();
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }
    setStatus('sending', 'Sending your message.');

    fetch(action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (res.ok) {
        form.reset();
        setStatus('success', "Thanks! We'll reply within a few days.");
      } else {
        return res.json().then(function (json) {
          var errors = (json && json.errors) ? json.errors.map(function (e) { return e.message; }).join(', ') : '';
          setStatus('error', errors || ('Something went wrong. Email us at ' + FALLBACK_EMAIL + ' directly.'));
        }).catch(function () {
          setStatus('error', 'Something went wrong. Email us at ' + FALLBACK_EMAIL + ' directly.');
        });
      }
    }).catch(function () {
      setStatus('error', 'Network error. Email us at ' + FALLBACK_EMAIL + ' directly.');
    }).then(function () {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send message'; }
    });
  });
})();

// CTA toast: matches the in-app toast (white card, gold left bar, slide-in
// from top, auto-dismiss after 2.6s, tap to dismiss). Single-instance.
(function () {
  'use strict';
  var btn = document.getElementById('cta-download');
  var root = document.getElementById('toast-root');
  if (!btn || !root) return;

  var dismissTimer = null;

  function showToast(message) {
    root.innerHTML = '';
    if (dismissTimer) clearTimeout(dismissTimer);

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');

    var bar = document.createElement('span');
    bar.className = 'toast__bar';
    bar.setAttribute('aria-hidden', 'true');

    var body = document.createElement('div');
    body.className = 'toast__body';
    body.textContent = message;

    toast.appendChild(bar);
    toast.appendChild(body);
    root.appendChild(toast);

    function dismiss() {
      toast.classList.add('toast--leaving');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    }

    toast.addEventListener('click', dismiss);
    dismissTimer = setTimeout(dismiss, 2600);
  }

  btn.addEventListener('click', function () {
    showToast(btn.getAttribute('data-toast') || 'Coming soon.');
  });
})();

// Hero demo: a JS-driven typewriter that types Pebble's message
// one character at a time, 20 rotation messages with kid-friendly
// per-message timing, 3 quick-reply chips rotating through 20 preset
// prompts in sync with the typewriter, and a clickable mascot that
// shuffles the visible chip set.
(function () {
  'use strict';
  var msg = document.getElementById('hero-demo-msg');
  var cursor = document.querySelector('.hero__demo-msg-cursor');
  var typingDots = document.querySelector('.hero__demo-typing-dots');
  var chipRow = document.getElementById('hero-demo-chips');
  var chipCount = document.getElementById('hero-demo-chip-count');
  var mascot = document.querySelector('.hero__demo-mascot');
  if (!msg) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var messages = [
    'Nice work logging breakfast! Want to add a veggie target today?',
    'How are you feeling after that walk?',
    '9 hours of sleep last night, that’s a streak!',
    'Crunchy or smooth, what’s your favorite snack?',
    'Want to try a 5-minute stretch break before homework?',
    'Two glasses of water down, three to go. You got this.',
    'Bedtime in an hour, ready to wind down with a story?',
    'Rainbow plate today? Let’s count the colors.',
    'You unlocked the Veggie Master badge! That’s a big one.',
    'Recess was fun? Tell me what you played.',
    'Screen time’s been low this week, proud of you.',
    'Want to log how you’re feeling before we start?',
    'Sleepy Pebble has new trivia. Want to play?',
    'Apple, banana, or berries with lunch today?',
    'Music or quiet for your dance break?',
    'You logged every day this week. Streak holding strong.',
    'Big day tomorrow. Earlier bedtime tonight?',
    'How was lunch? Anything you really liked?',
    'Soccer practice today? Don’t forget your water.',
    'Tough day? We can talk or pick a game, your call.'
  ];

  var prompts = [
    { q: 'Show my recent goals',       a: 'Your active goals are in the dashboard. Want to add a new one?' },
    { q: 'Give me a quick win today',  a: 'Drink one extra glass of water before lunch. Easy, but it counts!' },
    { q: 'How do I get more sleep?',   a: 'Set a bedtime alarm tonight. Even 15 minutes earlier helps a lot.' },
    { q: 'Tips to cut screen time',    a: 'Try the 20-20-20 rule: every 20 minutes, look 20 feet away for 20 seconds.' },
    { q: '3 fast healthy snacks',      a: 'Apple slices with peanut butter, baby carrots with hummus, or a banana.' },
    { q: 'Breakfast ideas?',           a: 'Eggs and toast with fruit hit all four food groups. Try it!' },
    { q: 'How much water?',            a: '5 to 7 glasses a day for kids. You are crushing it if you hit 5.' },
    { q: 'Got veggie ideas?',          a: 'Sneak spinach into a smoothie or roast carrots with cinnamon. So good.' },
    { q: 'Why is sleep important?',    a: 'Sleep helps your brain remember stuff and grow stronger. Big deal.' },
    { q: 'Help me set a goal',         a: 'How about: eat one vegetable at every meal this week? Start small.' },
    { q: 'I had a hard day',           a: 'I hear you. Want to talk or pick a quick game to unwind?' },
    { q: 'How am I doing?',            a: 'Check the progress charts! Your streak is looking strong.' },
    { q: 'Stretch break idea?',        a: 'Stand up, reach for the sky, then touch your toes. Three times. Go!' },
    { q: 'Rainbow plate?',             a: 'Red apple, orange carrot, green broccoli, blue berries, yellow corn.' },
    { q: 'How to get more badges?',    a: 'Log behaviors every day and try new things. Veggie Master is a popular start.' },
    { q: 'Pick a healthy snack',       a: 'Greek yogurt with berries. Sweet, filling, and packed with protein.' },
    { q: 'I forgot to log breakfast',  a: 'No worries, add it now. Better late than never, friend.' },
    { q: 'I want to try a new sport',  a: 'Awesome! What sounds fun: basketball, swimming, or biking?' },
    { q: 'How to get the streak badge?', a: 'Log at least one behavior every day for 7 days. You got this!' },
    { q: 'Tell me a fun fact',         a: 'A giraffe tongue is purple and 18 inches long. Wild, right?' }
  ];

  var CHIPS_PER_SET = 3;
  var NUM_SETS = Math.ceil(prompts.length / CHIPS_PER_SET);

  // Chips are frozen on a random set at page load. They only change when
  // the user clicks the mascot (shuffle) or reloads the page. The old
  // time-based rotation made the widget feel restless and made the
  // typewriter / chip pairing confusing.
  var chipStartIdx = Math.floor(Math.random() * NUM_SETS) * CHIPS_PER_SET;
  var msgIndex = Math.floor(Math.random() * messages.length);
  var isHolding = false;
  // Increment to cancel any in-flight typer (rapid chip clicks, mascot
  // shuffles mid-type, anything else that needs a clean abort).
  var typerToken = 0;

  function setTyping(on) {
    if (typingDots) typingDots.classList.toggle('is-active', on);
  }

  // Per-character render driven by rAF. perChar scales inversely with
  // length so short messages don't crawl and long messages don't flash.
  // Hold time after typing scales with length so long answers get
  // enough reading time without short ones lingering awkwardly.
  function typeMessage(text, onDone) {
    var myToken = ++typerToken;
    if (reducedMotion) {
      msg.textContent = text;
      setTyping(false);
      if (onDone) {
        setTimeout(function () {
          if (myToken === typerToken) onDone();
        }, Math.max(5000, text.length * 80));
      }
      return;
    }
    msg.textContent = '';
    setTyping(true);
    var i = 0;
    var perChar = Math.max(28, Math.min(70, 2200 / Math.max(text.length, 1)));
    var last = performance.now();
    function step(now) {
      if (myToken !== typerToken) return;
      if (now - last >= perChar) {
        i++;
        msg.textContent = text.slice(0, i);
        last = now;
      }
      if (i < text.length) {
        requestAnimationFrame(step);
      } else {
        setTyping(false);
        if (onDone) {
          setTimeout(function () {
            if (myToken === typerToken) onDone();
          }, Math.max(2800, text.length * 60));
        }
      }
    }
    requestAnimationFrame(step);
  }

  function renderChips() {
    if (!chipRow) return;
    var chips = chipRow.querySelectorAll('.hero__demo-chip');
    chips.forEach(function (chip, i) {
      var idx = (chipStartIdx + i) % prompts.length;
      chip.textContent = prompts[idx].q;
      chip.setAttribute('data-prompt-idx', String(idx));
    });
    if (chipCount) chipCount.textContent = '';
  }

  // Drives the typewriter auto-rotation. Called as typeMessage's onDone
  // callback so each next message only fires after the current one
  // finished typing and held. Only messages rotate here, chips are
  // intentionally frozen (set on load + shuffled on mascot click only).
  function nextRotation() {
    if (isHolding) return;
    msgIndex = (msgIndex + 1) % messages.length;
    typeMessage(messages[msgIndex], nextRotation);
  }

  renderChips();

  if (chipRow) {
    var allChips = Array.prototype.slice.call(chipRow.querySelectorAll('.hero__demo-chip'));
    allChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var idx = parseInt(chip.getAttribute('data-prompt-idx'), 10);
        var prompt = prompts[idx];
        if (!prompt) return;
        isHolding = true;
        if (!reducedMotion) {
          chip.classList.add('is-pressed');
          setTimeout(function () { chip.classList.remove('is-pressed'); }, 220);
          if (mascot) {
            mascot.classList.remove('is-reacting');
            // Force reflow so re-adding the class restarts the keyframe.
            void mascot.offsetWidth;
            mascot.classList.add('is-reacting');
            setTimeout(function () { mascot.classList.remove('is-reacting'); }, 800);
          }
        }
        // typeMessage's token-abort means re-clicking another chip while
        // a response is still typing cleanly cancels the prior typer and
        // starts the new one from empty (no ghost text from the previous).
        typeMessage(prompt.a, function () {
          isHolding = false;
          nextRotation();
        });
      });
    });
  }

  if (mascot) {
    var shufflePrompts = function () {
      chipStartIdx = (chipStartIdx + CHIPS_PER_SET) % prompts.length;
      chipStartIdx = chipStartIdx - (chipStartIdx % CHIPS_PER_SET);
      renderChips();
      if (!reducedMotion) {
        mascot.classList.remove('is-wiggling');
        void mascot.offsetWidth;
        mascot.classList.add('is-wiggling');
        setTimeout(function () { mascot.classList.remove('is-wiggling'); }, 600);
      }
    };
    mascot.addEventListener('click', shufflePrompts);
    mascot.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        shufflePrompts();
      }
    });
  }

  // Kickoff: the initial textContent set in HTML gets overwritten as
  // soon as the typer starts, which is the intent (it acts as SSR
  // fallback if JS fails).
  typeMessage(messages[msgIndex], nextRotation);
})();

// Mobile nav toggle: hamburger opens a dropdown of the 5 anchor links
// at <=599px. Auto-closes on link tap, Escape, or viewport widening.
(function navToggle() {
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav__toggle');
  var links = document.getElementById('nav-links');
  if (!nav || !toggle || !links) return;

  function closeMenu() {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
    document.body.classList.remove('nav-is-open');
  }
  function openMenu() {
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation menu');
    document.body.classList.add('nav-is-open');
  }
  toggle.addEventListener('click', function () {
    if (nav.classList.contains('is-open')) { closeMenu(); } else { openMenu(); }
  });
  Array.prototype.forEach.call(links.querySelectorAll('a'), function (a) {
    a.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) closeMenu();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 599 && nav.classList.contains('is-open')) closeMenu();
  });
})();
