// Shared public-site chrome. Every public page gets the same primary
// navigation and the same compact closing download moment without copying
// component markup across the static site.
(function sharedSiteChrome() {
  'use strict';

  var appUrl = 'https://apps.apple.com/us/app/proudme-healthy-habits/id6772700786';
  var path = window.location.pathname;
  var isHome = path === '/' || path === '/index.html';
  var isBlog = path === '/blog/' || path.indexOf('/blog/') === 0;
  var isContact = path === '/contact/' || path === '/contact/index.html';
  var nav = document.querySelector('.nav');

  if (nav) {
    var sectionPrefix = isHome ? '' : '/';
    nav.innerHTML =
      '<div class="nav__inner">' +
        '<a class="nav__brand" href="/" aria-label="ProudMe home">' +
          '<img class="nav__brand-mark" src="/assets/logo-mark-brand.svg" alt="" width="38" height="38">' +
          '<span>ProudMe</span>' +
        '</a>' +
        '<button class="nav__toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Open navigation menu">' +
          '<span class="nav__toggle-bar"></span><span class="nav__toggle-bar"></span><span class="nav__toggle-bar"></span>' +
        '</button>' +
        '<nav id="nav-links" class="nav__links' + (isHome ? ' nav__links--progress' : '') + '" aria-label="Primary">' +
          '<a href="' + sectionPrefix + '#how-it-works">How it works</a>' +
          '<a href="' + sectionPrefix + '#learn">Learn</a>' +
          '<a href="' + sectionPrefix + '#safety">Safety</a>' +
          '<a href="/blog/"' + (isBlog ? ' aria-current="page"' : '') + '>Blog</a>' +
          '<a href="' + sectionPrefix + '#contact"' + (isContact ? ' aria-current="page"' : '') + '>Contact</a>' +
          '<a class="nav__download" href="' + appUrl + '" target="_blank" rel="noopener" data-campaign="web-nav">Download app now</a>' +
          (isHome ? '<span class="nav__indicator" aria-hidden="true"></span>' : '') +
        '</nav>' +
      '</div>';
  }

  if (!isHome) {
    Array.prototype.forEach.call(document.querySelectorAll('.download-banner'), function (banner) {
      banner.remove();
    });

    var main = document.querySelector('main');
    if (main && !main.querySelector('.conversion')) {
      var closingCta = document.createElement('section');
      closingCta.className = 'conversion conversion--compact section';
      closingCta.setAttribute('aria-labelledby', 'sitewide-cta-title');
      closingCta.innerHTML =
        '<div class="container container--wide conversion__intro">' +
          '<div class="conversion__copy">' +
            '<span class="section__eyebrow">Available now · Free</span>' +
            '<h2 id="sitewide-cta-title">Give today’s small win somewhere to grow.</h2>' +
            '<p>Set one doable goal, notice the effort, and let ProudMe help the next healthy choice feel possible.</p>' +
            '<div class="conversion__proof" aria-label="ProudMe app highlights">' +
              '<span>Free to use</span><span>No ads</span><span>iPhone + iPad</span>' +
            '</div>' +
            '<div class="conversion__action">' +
              '<a class="cta-pill" href="' + appUrl + '" target="_blank" rel="noopener" data-campaign="web-sitewide"><span aria-hidden="true">📲</span> Download on the App Store</a>' +
              '<small>For kids and teens ages 7–13+ · Parent-first privacy</small>' +
            '</div>' +
          '</div>' +
          '<div class="conversion__visual" aria-hidden="true">' +
            '<span class="conversion__orbit conversion__orbit--outer"></span>' +
            '<span class="conversion__orbit conversion__orbit--inner"></span>' +
            '<span class="conversion__milestone conversion__milestone--one"><b>1</b> Pick a goal</span>' +
            '<span class="conversion__milestone conversion__milestone--two"><b>2</b> Log a win</span>' +
            '<span class="conversion__milestone conversion__milestone--three"><b>3</b> Keep improving</span>' +
            '<span class="conversion__milestone conversion__milestone--four"><b>4</b> Feel proud</span>' +
            '<div class="pebble-mascot pebble-mascot--cta"><div class="pebble-mascot__face">' +
              '<span class="pebble-mascot__eye pebble-mascot__eye--l"></span><span class="pebble-mascot__eye pebble-mascot__eye--r"></span>' +
              '<span class="pebble-mascot__cheek pebble-mascot__cheek--l"></span><span class="pebble-mascot__cheek pebble-mascot__cheek--r"></span><span class="pebble-mascot__mouth"></span>' +
            '</div></div>' +
          '</div>' +
        '</div>';
      main.appendChild(closingCta);
    }
  }
})();

// Ordered homepage scroll progress. The active state is calculated from the
// page's actual section order, so it cannot jump backward when observer
// callbacks arrive in a different order.
(function orderedScrollProgress() {
  'use strict';

  var nav = document.querySelector('.nav');
  var linksWrap = document.getElementById('nav-links');
  var indicator = linksWrap && linksWrap.querySelector('.nav__indicator');
  var links = linksWrap ? Array.prototype.slice.call(linksWrap.querySelectorAll('a[href^="#"]')) : [];
  var entries = links.map(function (link) {
    return { link: link, section: document.getElementById(link.getAttribute('href').slice(1)) };
  }).filter(function (entry) { return entry.section; });
  if (!nav || !entries.length) return;

  var activeIndex = -1;
  var ticking = false;

  function positionIndicator(link) {
    if (!indicator || !link || window.innerWidth < 900) return;
    indicator.style.width = link.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + link.offsetLeft + 'px)';
    indicator.classList.add('is-visible');
  }

  function setActive(nextIndex) {
    if (nextIndex === activeIndex) {
      if (nextIndex >= 0) positionIndicator(entries[nextIndex].link);
      return;
    }
    activeIndex = nextIndex;
    entries.forEach(function (entry, index) {
      if (index === nextIndex) entry.link.setAttribute('aria-current', 'true');
      else entry.link.removeAttribute('aria-current');
    });
    if (nextIndex >= 0) positionIndicator(entries[nextIndex].link);
    else if (indicator) indicator.classList.remove('is-visible');
  }

  function update() {
    ticking = false;
    var reference = window.scrollY + nav.offsetHeight + (window.innerHeight * 0.28);
    var nextIndex = -1;
    entries.forEach(function (entry, index) {
      if (entry.section.offsetTop <= reference) nextIndex = index;
    });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      nextIndex = entries.length - 1;
    }
    setActive(nextIndex);
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  window.addEventListener('load', requestUpdate);
  requestUpdate();
})();

// Contact form: POST as JSON to the ProudMe backend at /contact/public,
// show inline success/error. Replaced the prior Formspree integration
// in Phase 2B (2026-05-19); the backend now both persists the message
// to ContactMessage and dispatches the SendGrid email to the lab inbox.
// Rate-limited at 3/hour/IP server-side; spam guards are server-side too.
(function () {
  'use strict';
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('contact-status');
  var submitBtn = form.querySelector('.contact__submit');
  var BACKEND_URL = 'https://proudme-backend.onrender.com';
  var FALLBACK_EMAIL = 'pklab@lsu.edu';

  function setStatus(kind, text) {
    if (!status) return;
    status.className = 'contact__status contact__status--' + kind;
    status.textContent = text;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var honeypot = String(data.get('_honeypot') || '').trim();
    // Silent-accept on honeypot fill. Bots filling hidden fields get the
    // success state so the operator doesn't waste eyeballs on filtered
    // submissions, and the bot doesn't learn the field is a trap.
    if (honeypot) {
      form.reset();
      setStatus('success', "Thanks! We'll reply within a few days.");
      return;
    }
    var name = String(data.get('name') || '').trim();
    var email = String(data.get('email') || '').trim();
    var subject = String(data.get('subject') || '').trim();
    var topic = String(data.get('topic') || 'general').trim();
    var message = String(data.get('message') || '').trim();

    if (!name || !email || !message) {
      setStatus('error', 'Please fill in name, email, and message.');
      return;
    }
    if (message.length < 10) {
      setStatus('error', 'Message must be at least 10 characters.');
      return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }
    setStatus('sending', 'Sending your message.');

    fetch(BACKEND_URL + '/contact/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ name: name, email: email, topic: topic, subject: subject, message: message }),
      credentials: 'omit',
      mode: 'cors'
    }).then(function (res) {
      if (res.status === 429) {
        setStatus('error', 'Too many submissions from this network. Try again in an hour.');
        return;
      }
      if (res.ok) {
        form.reset();
        setStatus('success', "Thanks! We'll reply within a few days.");
        return;
      }
      return res.json().then(function (json) {
        var msg = (json && json.message) ? String(json.message) : '';
        setStatus('error', msg || ('Something went wrong. Email us at ' + FALLBACK_EMAIL + ' directly.'));
      }).catch(function () {
        setStatus('error', 'Something went wrong. Email us at ' + FALLBACK_EMAIL + ' directly.');
      });
    }).catch(function () {
      setStatus('error', 'Network error. Email us at ' + FALLBACK_EMAIL + ' directly.');
    }).then(function () {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send message'; }
    });
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

// Mobile nav toggle: hamburger opens a dropdown below 900px.
// Auto-closes on link tap, Escape, or viewport widening.
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
    if (window.innerWidth >= 900 && nav.classList.contains('is-open')) closeMenu();
  });
})();
