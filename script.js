// Site behavior: hero board, navigation, and scroll reveal
document.addEventListener('DOMContentLoaded', () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Decorative hero board, built from rows of letters ('.' is empty).
    const HERO_STACK = [
        '..........',
        '.........I',
        '.........I',
        '.........I',
        '.........I',
        '..........',
        '...OO.....',
        '.ZZOOTTT..',
        '.TZZSSTLI.',
        'TTTSSLLLI.',
        'JIIIILOOI.',
        'JJJLLLOOI.',
    ];

    const stack = document.querySelector('[data-hero-stack]');
    if (stack) {
        const frag = document.createDocumentFragment();
        HERO_STACK.forEach((row, r) => {
            row.split('').forEach((letter) => {
                const cell = document.createElement('span');
                cell.className = letter === '.' ? 'cell' : `cell blk b-${letter.toLowerCase()}`;
                // Bottom rows land first.
                if (letter !== '.') cell.style.setProperty('--delay', `${(HERO_STACK.length - r) * 70}ms`);
                frag.appendChild(cell);
            });
        });
        stack.appendChild(frag);
    }

    // Mobile menu
    const toggle = document.querySelector('.nav-toggle');
    const links = document.getElementById('nav-links');
    const setMenu = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        links.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    links.addEventListener('click', (e) => {
        if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && links.classList.contains('is-open')) {
            setMenu(false);
            toggle.focus();
        }
    });

    // Replay reopens the gate in place. Without the game script it falls back to ?play.
    document.querySelectorAll('[data-replay]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            if (!window.TetrisGate) return;
            e.preventDefault();
            setMenu(false);
            window.TetrisGate.open();
        });
    });

    // Navbar background on scroll
    const navbar = document.querySelector('.navbar');
    const updateNav = () => navbar.classList.toggle('is-scrolled', window.scrollY > 40);
    updateNav();
    window.addEventListener('scroll', updateNav, { passive: true });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
            history.pushState(null, '', anchor.getAttribute('href'));
        });
    });

    // Scroll reveal. Content only starts hidden once this script is running,
    // so it stays visible if JavaScript fails, and reduced motion skips it.
    if (reducedMotion || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    const reveal = (selector, stagger) => {
        document.querySelectorAll(selector).forEach((el, index) => {
            if (stagger) el.style.transitionDelay = `${index * stagger}s`;
            el.classList.add('reveal-on-scroll');
            observer.observe(el);
        });
    };

    reveal('main section:not(.hero) .section-header');
    reveal('.card', 0.08);
    reveal('.skill-category', 0.08);
    reveal('.level', 0.06);
    reveal('.stat, .scores, .contact-panel');
});

console.log('Hello, fellow developer. Interested in how this site was built? Let\'s connect.');
