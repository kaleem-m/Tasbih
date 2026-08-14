(() => {
  'use strict';

  const STORAGE_KEY = 'sukoon-tasbih-v1';
  const defaults = {
    session: 0,
    lifetime: 0,
    milestone: 33,
    behavior: 'keep',
    theme: 'dark',
    vibration: true,
    stopped: false,
    showTransliteration: true,
    showTranslation: true,
    arabicFont: 'amiri',
    activeRecitationId: null
  };

  const ARABIC_FONTS = {
    amiri: '"Amiri"',
    scheherazade: '"Scheherazade New"',
    'noto-naskh': '"Noto Naskh Arabic"'
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RING_CENTER = 100;
  const RING_RADIUS = 95;
  const LIT_BEAD_COUNT = 99;
  const COMPACT_EXIT_THRESHOLD = 8;
  const COMPACT_TRANSITION_DURATION = 900;
  /* A scripted jump with `behavior: 'auto'` lands in the same frame, so the guard that
     protects it only needs to outlive the scroll event it triggers. */
  const INSTANT_TRANSITION_DURATION = 120;
  /* Length of the scripted scroll flight. Chosen to glide on the same easing family and
     timescale as the .68–.72s CSS choreography so the viewport, bar, ornament, and
     library all settle together. */
  const COMPACT_SCROLL_DURATION = 700;
  const elements = {
    app: document.querySelector('#app-shell'),
    counterStage: document.querySelector('#counter-stage'),
    counterButton: document.querySelector('#counter-button'),
    counterValue: document.querySelector('#counter-value'),
    counterContent: document.querySelector('.ornament-content'),
    beadRing: document.querySelector('#bead-ring'),
    lifetimeValue: document.querySelector('#lifetime-value'),
    progressCount: document.querySelector('#progress-count'),
    milestoneLabel: document.querySelector('#milestone-label'),
    status: document.querySelector('#status-message'),
    resetButton: document.querySelector('#reset-button'),
    discoverButton: document.querySelector('#discover-button'),
    library: document.querySelector('#library'),
    categoryFilters: document.querySelector('#category-filters'),
    categoryTrack: document.querySelector('#category-track'),
    categoryPrevious: document.querySelector('#category-previous'),
    categoryNext: document.querySelector('#category-next'),
    collectionStatus: document.querySelector('#collection-status'),
    cardGrid: document.querySelector('#card-grid'),
    cardTemplate: document.querySelector('#recitation-card-template'),
    activeRecitation: document.querySelector('#active-recitation'),
    activeToggle: document.querySelector('#active-toggle'),
    activeKicker: document.querySelector('.active-kicker'),
    activeArabic: document.querySelector('#active-arabic'),
    activeDetails: document.querySelector('#active-details'),
    activeTransliteration: document.querySelector('#active-transliteration'),
    activeTranslation: document.querySelector('#active-translation'),
    activeClear: document.querySelector('#active-clear'),
    activeTrace: document.querySelector('#active-trace'),
    activeTraceArabic: document.querySelector('#active-trace-arabic'),
    settingsButton: document.querySelector('#settings-button'),
    settingsModal: document.querySelector('#settings-modal'),
    settingsForm: document.querySelector('#settings-form'),
    behaviorSelect: document.querySelector('#behavior-select'),
    themeToggle: document.querySelector('#theme-toggle'),
    vibrationToggle: document.querySelector('#vibration-toggle'),
    transliterationToggle: document.querySelector('#transliteration-toggle'),
    translationToggle: document.querySelector('#translation-toggle'),
    arabicFontSelect: document.querySelector('#arabic-font-select'),
    clearLifetimeButton: document.querySelector('#clear-lifetime-button'),
    confirmModal: document.querySelector('#confirm-modal'),
    confirmTitle: document.querySelector('#confirm-title'),
    confirmDescription: document.querySelector('#confirm-description'),
    confirmAction: document.querySelector('#confirm-action-button'),
    themeMeta: document.querySelector('meta[name="theme-color"]')
  };

  let state = loadState();
  let recitations = [];
  let categories = [];
  let selectedType = 'all';
  let selectedCategory = 'all';
  let confirmMode = 'session';
  let flashTimer;
  let lastLitIndex = -1;
  let scrollTicking = false;
  let lastScrollY = Math.max(0, window.scrollY);
  let compactTransitionTimer;
  let activeRecitationExpanded = false;
  let carouselSettleTimer;
  let isRecenteringCarousel = false;
  /* Both snaps drive window.scrollTo, which re-enters the scroll listener for the whole
     eased flight. Without this latch each direction re-triggers the other and the page
     oscillates, so every programmatic scroll owns the compact state until it settles. */
  let isProgrammaticScroll = false;
  let programmaticScrollTimer;
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== 'object') return { ...defaults };
      return {
        ...defaults,
        ...saved,
        session: Math.max(0, Number(saved.session) || 0),
        lifetime: Math.max(0, Number(saved.lifetime) || 0),
        milestone: [33, 99, 100].includes(Number(saved.milestone)) ? Number(saved.milestone) : 33,
        behavior: ['keep', 'loop', 'stop'].includes(saved.behavior) ? saved.behavior : 'keep',
        theme: ['light', 'dark'].includes(saved.theme) ? saved.theme : 'dark',
        arabicFont: ARABIC_FONTS[saved.arabicFont] ? saved.arabicFont : 'amiri',
        showTransliteration: saved.showTransliteration !== false,
        showTranslation: saved.showTranslation !== false,
        activeRecitationId: typeof saved.activeRecitationId === 'string' ? saved.activeRecitationId : null
      };
    } catch (error) {
      return { ...defaults };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
  }

  function buildBeadRing() {
    elements.beadRing.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < LIT_BEAD_COUNT; i += 1) {
      const angle = (i / LIT_BEAD_COUNT) * Math.PI * 2 - Math.PI / 2;
      const bead = document.createElementNS(SVG_NS, 'circle');
      const x = RING_CENTER + RING_RADIUS * Math.cos(angle);
      const y = RING_CENTER + RING_RADIUS * Math.sin(angle);
      bead.setAttribute('cx', x.toFixed(3));
      bead.setAttribute('cy', y.toFixed(3));
      bead.setAttribute('r', i % 11 === 0 ? '2.6' : '1.7');
      bead.classList.add('bead');
      bead.style.transformOrigin = `${x}px ${y}px`;
      fragment.appendChild(bead);
    }
    elements.beadRing.appendChild(fragment);
  }

  function updateBeadRing(displayProgress) {
    const ratio = state.milestone > 0 ? displayProgress / state.milestone : 0;
    const litCount = Math.round(ratio * LIT_BEAD_COUNT);
    const beads = elements.beadRing.children;
    for (let i = 0; i < beads.length; i += 1) beads[i].classList.toggle('is-lit', i < litCount);
    if (litCount > 0 && litCount - 1 !== lastLitIndex) {
      const edge = beads[litCount - 1];
      edge.classList.remove('is-edge');
      void edge.getBoundingClientRect();
      edge.classList.add('is-edge');
    }
    lastLitIndex = litCount - 1;
  }

  function applyPreferences() {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.setProperty('--arabic-font', ARABIC_FONTS[state.arabicFont]);
    document.body.classList.toggle('hide-transliteration', !state.showTransliteration);
    document.body.classList.toggle('hide-translation', !state.showTranslation);
    elements.themeMeta.content = state.theme === 'dark' ? '#0c1512' : '#f4efe6';
  }

  function render() {
    const cycleCount = state.session % state.milestone;
    const displayProgress = state.session > 0 && cycleCount === 0 ? state.milestone : cycleCount;
    const sessionText = formatNumber(state.session);
    elements.counterValue.textContent = sessionText;
    elements.counterContent.classList.toggle('is-long', sessionText.length >= 4 && sessionText.length < 7);
    elements.counterContent.classList.toggle('is-very-long', sessionText.length >= 7);
    elements.lifetimeValue.textContent = formatNumber(state.lifetime);
    elements.progressCount.textContent = displayProgress;
    elements.milestoneLabel.textContent = state.milestone;
    updateBeadRing(displayProgress);
    elements.counterButton.setAttribute('aria-label', `Count ${state.session}. Activate to add one.`);
    elements.counterButton.setAttribute('aria-disabled', String(state.stopped));
    elements.status.textContent = state.stopped ? 'Milestone reached — reset or change the setting to continue.' : '';
    applyPreferences();
    renderActiveRecitation();
  }

  function spawnRipple(event) {
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    if (event && typeof event.clientX === 'number' && (event.clientX || event.clientY)) {
      const rect = elements.counterButton.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      ripple.style.left = `${x - 42}%`;
      ripple.style.top = `${y - 42}%`;
      ripple.style.inset = 'auto';
      ripple.style.width = '84%';
      ripple.style.height = '84%';
    }
    elements.counterButton.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    window.setTimeout(() => ripple.remove(), 900);
  }

  function tickNumber() {
    elements.counterValue.classList.remove('tick');
    void elements.counterValue.offsetWidth;
    elements.counterValue.classList.add('tick');
  }

  function increment(event) {
    if (state.stopped) {
      announce('Milestone reached. Reset the session or change the milestone behavior to continue.');
      return;
    }
    state.session += 1;
    state.lifetime += 1;
    if (state.session % state.milestone === 0) {
      triggerMilestone();
      if (state.behavior === 'loop') state.session = 0;
      if (state.behavior === 'stop') state.stopped = true;
    }
    saveState();
    render();
    tickNumber();
    spawnRipple(event instanceof PointerEvent || event instanceof MouseEvent ? event : null);
    elements.counterButton.classList.add('is-pressed');
    window.setTimeout(() => elements.counterButton.classList.remove('is-pressed'), 110);
  }

  function triggerMilestone() {
    if (state.vibration && navigator.vibrate) navigator.vibrate([35, 40, 70]);
    window.clearTimeout(flashTimer);
    elements.app.classList.remove('milestone-flash');
    void elements.app.offsetWidth;
    elements.app.classList.add('milestone-flash');
    flashTimer = window.setTimeout(() => elements.app.classList.remove('milestone-flash'), 1000);
    announce(`Milestone of ${state.milestone} reached.`);
  }

  function announce(message) {
    elements.status.textContent = message;
    if (!state.stopped) window.setTimeout(() => {
      if (elements.status.textContent === message) elements.status.textContent = '';
    }, 2400);
  }

  function categoriesForSelectedType() {
    if (selectedType === 'all') return categories;
    return categories.filter((category) => category.type === selectedType);
  }

  function createFilterButton(label, value, isDuplicate = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-chip';
    button.dataset.category = value;
    button.textContent = label;
    button.title = label;
    button.classList.toggle('is-active', value === selectedCategory);
    button.setAttribute('aria-pressed', String(value === selectedCategory));
    if (isDuplicate) {
      button.dataset.carouselClone = 'true';
      button.tabIndex = -1;
    }
    button.addEventListener('click', () => {
      selectedCategory = value;
      elements.categoryTrack.querySelectorAll('.category-chip').forEach((chip) => {
        const active = chip.dataset.category === value;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      renderLibrary();
    });
    return button;
  }

  function carouselCategories() {
    return [
      { id: 'all', label: selectedType === 'all' ? 'All categories' : `All ${selectedType === 'dua' ? 'duas' : 'dhikr'}` },
      ...categoriesForSelectedType()
    ];
  }

  function centerCategoryCarousel() {
    const cycleWidth = elements.categoryTrack.scrollWidth / 3;
    if (!cycleWidth) return;
    isRecenteringCarousel = true;
    elements.categoryFilters.scrollLeft = cycleWidth;
    window.requestAnimationFrame(() => { isRecenteringCarousel = false; });
  }

  function keepCategoryCarouselInfinite() {
    if (isRecenteringCarousel) return;
    window.clearTimeout(carouselSettleTimer);
    carouselSettleTimer = window.setTimeout(() => {
      const cycleWidth = elements.categoryTrack.scrollWidth / 3;
      if (!cycleWidth) return;
      if (elements.categoryFilters.scrollLeft < cycleWidth * 0.5) {
        elements.categoryFilters.scrollLeft += cycleWidth;
      } else if (elements.categoryFilters.scrollLeft > cycleWidth * 1.5) {
        elements.categoryFilters.scrollLeft -= cycleWidth;
      }
    }, 80);
  }

  function moveCategoryCarousel(direction) {
    const firstChip = elements.categoryTrack.querySelector('.category-chip');
    const distance = firstChip ? firstChip.offsetWidth + 10 : 180;
    elements.categoryFilters.scrollBy({
      left: direction * distance,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  function renderCategoryFilters() {
    const availableCategories = carouselCategories();
    if (!availableCategories.some((category) => category.id === selectedCategory)) selectedCategory = 'all';
    const fragment = document.createDocumentFragment();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      availableCategories.forEach((category) => {
        fragment.appendChild(createFilterButton(category.label, category.id, cycle !== 1));
      });
    }
    elements.categoryTrack.replaceChildren(fragment);
    window.requestAnimationFrame(centerCategoryCarousel);
  }

  function renderLibrary() {
    const filtered = recitations.filter((item) => {
      const typeMatches = selectedType === 'all' || item.type === selectedType;
      const categoryMatches = selectedCategory === 'all' || item.category === selectedCategory;
      return typeMatches && categoryMatches;
    });
    const fragment = document.createDocumentFragment();
    filtered.forEach((item) => {
      const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
      card.dataset.id = item.id;
      card.classList.toggle('is-active', item.id === state.activeRecitationId);
      card.querySelector('.type-badge').textContent = item.type;
      card.querySelector('.count-badge').textContent = item.recommendedCount ? `${item.recommendedCount}× suggested` : '';
      card.querySelector('.card-arabic').textContent = item.arabic;
      card.querySelector('.card-transliteration').textContent = item.transliteration;
      card.querySelector('.card-translation').textContent = item.translation;
      card.querySelector('.card-source').textContent = item.source;
      const activeButton = card.querySelector('.set-active-button');
      if (item.id === state.activeRecitationId) activeButton.textContent = 'Active';
      activeButton.addEventListener('click', (event) => {
        event.preventDefault();
        setActiveRecitation(item.id);
      });
      fragment.appendChild(card);
    });
    elements.cardGrid.replaceChildren(fragment);
    elements.collectionStatus.textContent = filtered.length
      ? `${filtered.length} ${filtered.length === 1 ? 'remembrance' : 'remembrances'}`
      : 'No remembrances match these filters.';
  }

  function validateEntry(entry, categoryIdsByType) {
    const required = ['id', 'type', 'arabic', 'transliteration', 'translation', 'source'];
    return required.every((key) => typeof entry[key] === 'string' && entry[key].trim())
      && ['dua', 'dhikr'].includes(entry.type)
      && categoryIdsByType[entry.type]?.has(entry.category);
  }

  async function loadLibrary() {
    try {
      const manifestResponse = await fetch('data/index.json');
      if (!manifestResponse.ok) throw new Error(`Manifest request failed (${manifestResponse.status})`);
      const manifest = await manifestResponse.json();
      const categoryGroups = manifest.categories && typeof manifest.categories === 'object'
        ? manifest.categories
        : {};
      categories = ['dua', 'dhikr'].flatMap((type) => (
        Array.isArray(categoryGroups[type])
          ? categoryGroups[type].map((category) => ({ ...category, type }))
          : []
      ));
      const categoryIdsByType = {
        dua: new Set(categories.filter((category) => category.type === 'dua').map((category) => category.id)),
        dhikr: new Set(categories.filter((category) => category.type === 'dhikr').map((category) => category.id))
      };
      const dataFiles = Array.isArray(manifest.files) ? manifest.files : [];
      const files = await Promise.all(dataFiles.map(async (file) => {
        const response = await fetch(`data/${file}`);
        if (!response.ok) throw new Error(`${file} request failed (${response.status})`);
        const data = await response.json();
        return Array.isArray(data.entries)
          ? data.entries.filter((entry) => validateEntry(entry, categoryIdsByType))
          : [];
      }));
      recitations = files.flat();
      renderCategoryFilters();
      renderLibrary();
      renderActiveRecitation();
    } catch (error) {
      console.error('Unable to load the dua and dhikr collection.', error);
      elements.collectionStatus.textContent = 'The collection could not be loaded. Please refresh, or serve this folder from a local web server.';
    }
  }

  function setActiveRecitation(id) {
    if (state.activeRecitationId !== id) activeRecitationExpanded = false;
    state.activeRecitationId = id;
    saveState();
    renderActiveRecitation();
    renderLibrary();
    const item = recitations.find((entry) => entry.id === id);
    if (item) announce(`${item.type === 'dua' ? 'Dua' : 'Dhikr'} is now active.`);
  }

  /* The compact active dhikr is fixed to the viewport, so it no longer occupies space
     in the flow. Publish its real height as a custom property so the library can
     reserve exactly that much room and the scroll offsets stay in sync. */
  function syncActiveRecitationHeight() {
    const visible = !elements.activeRecitation.hidden;
    document.body.classList.toggle('has-active-recitation', visible);
    const height = visible ? elements.activeRecitation.offsetHeight : 0;
    document.documentElement.style.setProperty('--active-recitation-height', `${height}px`);
  }

  function renderActiveRecitation() {
    const item = recitations.find((entry) => entry.id === state.activeRecitationId);
    elements.activeRecitation.hidden = !item;
    elements.activeTrace.hidden = !item;
    if (!item) {
      activeRecitationExpanded = false;
      syncActiveRecitationHeight();
      return;
    }
    elements.activeTraceArabic.textContent = item.arabic;
    elements.activeTrace.setAttribute(
      'aria-label',
      `Active ${item.type}: ${item.transliteration}. Open the collection with it pinned.`
    );
    elements.activeKicker.textContent = `Active ${item.type}`;
    elements.activeArabic.textContent = item.arabic;
    elements.activeTransliteration.textContent = item.transliteration;
    elements.activeTranslation.textContent = item.translation;
    elements.activeToggle.setAttribute('aria-expanded', String(activeRecitationExpanded));
    elements.activeToggle.setAttribute('aria-label', `${activeRecitationExpanded ? 'Hide' : 'Show'} transliteration and translation for the active ${item.type}`);
    elements.activeDetails.hidden = !activeRecitationExpanded;
    syncActiveRecitationHeight();
  }

  function toggleActiveRecitationDetails() {
    activeRecitationExpanded = !activeRecitationExpanded;
    renderActiveRecitation();
  }

  function getCompactEnterThreshold() {
    return Math.min(96, Math.max(56, elements.counterStage.offsetHeight * 0.1));
  }

  function getCompactCounterHeight() {
    const styles = getComputedStyle(document.documentElement);
    return Number.parseFloat(styles.getPropertyValue('--compact-counter-height')) || 0;
  }

  function getLibraryScrollTarget() {
    // The library reserves the active recitation's height in its own padding, so only
    // offset the fixed counter here. Subtracting both would create a duplicate gap.
    return Math.max(0, elements.library.offsetTop - getCompactCounterHeight());
  }

  function finishCompactTransition() {
    window.clearTimeout(compactTransitionTimer);
    document.body.classList.remove('is-transitioning', 'is-returning');
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function preferredScrollBehavior() {
    return prefersReducedMotion() ? 'auto' : 'smooth';
  }

  /* Claim ownership of the scroll position for the length of a scripted jump.
     The flight keeps firing scroll events, and each one re-enters updateCompactState
     at an intermediate offset that reads as the opposite gesture — so an unguarded
     pair of snaps would bounce against each other forever. While the latch is held
     the compact state is frozen and only the scroll bookkeeping is kept current. */
  function holdScrollLatch() {
    isProgrammaticScroll = true;
    window.clearTimeout(programmaticScrollTimer);
  }

  function releaseScrollLatch() {
    window.clearTimeout(programmaticScrollTimer);
    isProgrammaticScroll = false;
    lastScrollY = Math.max(0, window.scrollY);
  }

  /* Deterministic rAF-driven eased scroll. Native smooth scrolling has a
     browser-defined curve and duration that never matches the CSS choreography and
     cannot be observed, which forced the latch to guess with a timer. Driving the
     flight ourselves keeps every layer gliding on the same easing for the same
     length of time — and reports the exact frame the movement settles so the latch
     is released precisely, never early or late. */
  const scrollEase = (t) => 1 - Math.pow(1 - t, 5);
  let scrollAnimation = null;

  function cancelScrollAnimation() {
    if (!scrollAnimation) return;
    window.cancelAnimationFrame(scrollAnimation.frame);
    scrollAnimation.cleanup();
    scrollAnimation = null;
  }

  function animateScrollTo(targetY, onSettled) {
    cancelScrollAnimation();
    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 1) {
      onSettled();
      return;
    }
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    /* The per-frame writes must land instantly; `html` opts into CSS smooth
       scrolling, which would otherwise turn every frame into its own eased flight. */
    root.style.scrollBehavior = 'auto';
    const direction = Math.sign(distance);
    const startTime = performance.now();

    /* Hand control back the moment the visitor takes over. Momentum from the
       triggering gesture keeps emitting same-direction wheel events for a while,
       so only a reversal — or a fresh touch — counts as an interruption. */
    const onWheel = (event) => {
      if ((event.deltaY || 0) * direction < 0) interrupt();
    };
    const onTouchStart = () => interrupt();
    const cleanup = () => {
      root.style.scrollBehavior = previousBehavior;
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
    };
    const interrupt = () => {
      cancelScrollAnimation();
      onSettled();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / COMPACT_SCROLL_DURATION);
      window.scrollTo(0, startY + distance * scrollEase(progress));
      if (progress < 1) {
        scrollAnimation.frame = window.requestAnimationFrame(step);
      } else {
        cleanup();
        scrollAnimation = null;
        onSettled();
      }
    };
    scrollAnimation = { frame: window.requestAnimationFrame(step), cleanup };
  }

  function performScrollFlight(targetY, behavior) {
    if (behavior === 'auto') {
      cancelScrollAnimation();
      window.scrollTo({ top: targetY, behavior: 'auto' });
      programmaticScrollTimer = window.setTimeout(releaseScrollLatch, INSTANT_TRANSITION_DURATION);
      return;
    }
    animateScrollTo(targetY, releaseScrollLatch);
  }

  /* The library's resting offset: the scroll position where the collection's top edge
     sits flush under the compact counter. Nothing but the inert hero spacer exists
     above it, so travelling below this point is always a request to go home. */
  function getLibraryRestingY() {
    return getLibraryScrollTarget();
  }

  function settleOnLibrary(behavior = 'smooth') {
    finishCompactTransition();
    document.body.classList.add('is-compact', 'is-transitioning');
    holdScrollLatch();

    // Wait until compact layout and its measured pinned content are committed before
    // calculating the destination. Every entry deliberately lands at the collection's
    // start; previous reading depth is never restored.
    window.requestAnimationFrame(() => {
      syncActiveRecitationHeight();
      window.requestAnimationFrame(() => {
        performScrollFlight(getLibraryRestingY(), behavior);
        compactTransitionTimer = window.setTimeout(finishCompactTransition, COMPACT_TRANSITION_DURATION);
      });
    });
  }

  /* The animated mirror of settleOnLibrary. Drop compact mode before the flight so the
     full hero owns the destination, then hold is-returning for matching reverse CSS
     choreography while the viewport glides home. */
  function returnToHero(behavior = 'smooth') {
    finishCompactTransition();
    document.body.classList.remove('is-compact');
    document.body.classList.add('is-returning');
    holdScrollLatch();
    window.requestAnimationFrame(() => {
      syncActiveRecitationHeight();
      performScrollFlight(0, behavior);
      compactTransitionTimer = window.setTimeout(finishCompactTransition, COMPACT_TRANSITION_DURATION);
    });
  }

  function updateCompactState() {
    const currentScrollY = Math.max(0, window.scrollY);
    const isCompact = document.body.classList.contains('is-compact');

    if (isProgrammaticScroll) {
      lastScrollY = currentScrollY;
      scrollTicking = false;
      return;
    }

    const scrollingUp = currentScrollY < lastScrollY;
    const restingY = getLibraryRestingY();

    if (!isCompact && currentScrollY >= getCompactEnterThreshold()) {
      // Once the visitor commits to scrolling down, always settle forward into the
      // collection. Native proximity snapping could instead choose the hero and pull
      // the page backwards, which made the old transition feel unpredictable.
      settleOnLibrary(preferredScrollBehavior());
    } else if (isCompact && scrollingUp && currentScrollY <= Math.max(0, restingY - getCompactEnterThreshold())) {
      // The deliberate mirror of the downward snap, and the reason it is safe to be
      // this eager: everything above the library's resting offset is the empty hero
      // spacer, so crossing below it while travelling upward can only ever mean the
      // visitor wants the full counter back. Matching the enter threshold means both
      // directions ask for the same small commitment and then finish the trip.
      returnToHero(preferredScrollBehavior());
    } else if (isCompact && currentScrollY <= COMPACT_EXIT_THRESHOLD && currentScrollY <= lastScrollY) {
      // Safety net for arrivals that bypass the gesture entirely — anchor jumps, Home
      // key, or a browser restoring a previous scroll position.
      finishCompactTransition();
      document.body.classList.remove('is-compact');
    }

    lastScrollY = currentScrollY;
    scrollTicking = false;
  }

  function openConfirmation(mode) {
    confirmMode = mode;
    const clearingLifetime = mode === 'lifetime';
    elements.confirmTitle.textContent = clearingLifetime ? 'Clear all-time count?' : 'Reset this session?';
    elements.confirmDescription.textContent = clearingLifetime
      ? 'This permanently returns your all-time dhikr count to zero. Your current session will remain.'
      : 'Your session count will return to zero. Your all-time count will stay safe.';
    elements.confirmAction.textContent = clearingLifetime ? 'Clear all-time' : 'Reset session';
    elements.confirmModal.showModal();
  }

  function handleConfirmedAction() {
    if (confirmMode === 'lifetime') state.lifetime = 0;
    else {
      state.session = 0;
      state.stopped = false;
    }
    saveState();
    render();
  }

  function populateSettings() {
    const milestoneInput = elements.settingsForm.querySelector(`input[name="milestone"][value="${state.milestone}"]`);
    if (milestoneInput) milestoneInput.checked = true;
    elements.behaviorSelect.value = state.behavior;
    elements.themeToggle.checked = state.theme === 'dark';
    elements.vibrationToggle.checked = state.vibration;
    elements.transliterationToggle.checked = state.showTransliteration;
    elements.translationToggle.checked = state.showTranslation;
    elements.arabicFontSelect.value = state.arabicFont;
  }

  elements.counterButton.addEventListener('click', increment);
  elements.resetButton.addEventListener('click', () => openConfirmation('session'));
  /* Every entry path starts at the collection's resting offset, matching the first
     downward scroll instead of restoring an earlier reading depth. */
  elements.discoverButton.addEventListener('click', () => {
    settleOnLibrary(preferredScrollBehavior());
  });
  elements.activeTrace.addEventListener('click', () => {
    // Tapping the trace is a request to see this specific dhikr, so it arrives already
    // expanded to its meaning rather than merely pinned.
    activeRecitationExpanded = true;
    renderActiveRecitation();
    settleOnLibrary(preferredScrollBehavior());
  });
  elements.activeToggle.addEventListener('click', toggleActiveRecitationDetails);
  elements.activeClear.addEventListener('click', () => setActiveRecitation(null));
  elements.categoryPrevious.addEventListener('click', () => moveCategoryCarousel(-1));
  elements.categoryNext.addEventListener('click', () => moveCategoryCarousel(1));
  elements.categoryFilters.addEventListener('scroll', keepCategoryCarouselInfinite, { passive: true });
  elements.categoryFilters.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    moveCategoryCarousel(event.key === 'ArrowLeft' ? -1 : 1);
  });

  document.querySelectorAll('.type-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedType = tab.dataset.type;
      selectedCategory = 'all';
      document.querySelectorAll('.type-tab').forEach((candidate) => {
        const active = candidate === tab;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-selected', String(active));
      });
      renderCategoryFilters();
      renderLibrary();
    });
  });

  elements.settingsButton.addEventListener('click', () => {
    populateSettings();
    elements.settingsModal.showModal();
  });
  elements.clearLifetimeButton.addEventListener('click', () => {
    elements.settingsModal.close();
    openConfirmation('lifetime');
  });

  elements.settingsForm.addEventListener('submit', (event) => {
    const submitter = event.submitter;
    if (!submitter || submitter.value !== 'save') return;
    const data = new FormData(elements.settingsForm);
    state.milestone = Number(data.get('milestone')) || 33;
    state.behavior = data.get('behavior') || 'keep';
    state.theme = elements.themeToggle.checked ? 'dark' : 'light';
    state.vibration = elements.vibrationToggle.checked;
    state.showTransliteration = elements.transliterationToggle.checked;
    state.showTranslation = elements.translationToggle.checked;
    state.arabicFont = ARABIC_FONTS[elements.arabicFontSelect.value] ? elements.arabicFontSelect.value : 'amiri';
    state.stopped = state.behavior === 'stop' && state.session > 0 && state.session % state.milestone === 0;
    saveState();
    render();
  });

  elements.themeToggle.addEventListener('change', () => {
    document.documentElement.dataset.theme = elements.themeToggle.checked ? 'dark' : 'light';
  });
  elements.arabicFontSelect.addEventListener('change', () => {
    document.documentElement.style.setProperty('--arabic-font', ARABIC_FONTS[elements.arabicFontSelect.value]);
  });
  elements.settingsModal.addEventListener('close', () => {
    if (elements.settingsModal.returnValue !== 'save') applyPreferences();
  });
  elements.confirmModal.addEventListener('close', () => {
    if (elements.confirmModal.returnValue === 'confirm') handleConfirmedAction();
  });

  document.addEventListener('keydown', (event) => {
    if (event.repeat || elements.settingsModal.open || elements.confirmModal.open) return;
    const tag = event.target.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(tag)) return;
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      increment();
    }
  });

  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      scrollTicking = true;
      window.requestAnimationFrame(updateCompactState);
    }
  }, { passive: true });

  /* The pinned card's height depends on wrapping, so re-measure whenever the layout
     can change: viewport resizes and late-loading Arabic webfonts both alter it. */
  window.addEventListener('resize', () => {
    syncActiveRecitationHeight();
    keepCategoryCarouselInfinite();
    if (document.body.classList.contains('is-compact')) {
      lastScrollY = Math.max(0, window.scrollY);
    }
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncActiveRecitationHeight);
  }
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(syncActiveRecitationHeight).observe(elements.activeRecitation);
  }

  [elements.settingsModal, elements.confirmModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.close('cancel');
    });
  });

  buildBeadRing();
  render();
  updateCompactState();
  loadLibrary();
})();
