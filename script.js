// Site behavior: anchor scrolling, mobile menu, and scroll fade-in.
// The page is fully visible and usable without this file.
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    // Smooth scroll for anchor links. Focus follows so the next Tab starts at the target.
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
            history.pushState(null, '', anchor.getAttribute('href'));
        });
    });

    // Scroll fade-in. Content only starts hidden once this script is running,
    // so it stays visible if JavaScript fails, and reduced motion skips it.
    if (reducedMotion || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    });

    document.querySelectorAll('.content section').forEach((section) => {
        section.classList.add('fade-in');
        observer.observe(section);
    });
});
