// Smooth reveal animations on scroll
document.addEventListener('DOMContentLoaded', () => {
    // Intersection Observer for scroll animations
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, observerOptions);

    // Observe all sections
    document.querySelectorAll('section').forEach(section => {
        section.classList.add('reveal-on-scroll');
        observer.observe(section);
    });

    // Observe project cards individually for staggered animation
    document.querySelectorAll('.project-card').forEach((card, index) => {
        card.style.transitionDelay = `${index * 0.1}s`;
        card.classList.add('reveal-on-scroll');
        observer.observe(card);
    });

    // Observe skill categories for staggered animation
    document.querySelectorAll('.skill-category').forEach((category, index) => {
        category.style.transitionDelay = `${index * 0.1}s`;
        category.classList.add('reveal-on-scroll');
        observer.observe(category);
    });

    // Observe experience items for staggered animation
    document.querySelectorAll('.experience-item').forEach((item, index) => {
        item.style.transitionDelay = `${index * 0.15}s`;
        item.classList.add('reveal-on-scroll');
        observer.observe(item);
    });

    // Navbar background on scroll
    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            navbar.style.background = 'rgba(10, 10, 11, 0.95)';
            navbar.style.backdropFilter = 'blur(10px)';
        } else {
            navbar.style.background = 'linear-gradient(to bottom, var(--color-bg), transparent)';
            navbar.style.backdropFilter = 'none';
        }
        
        lastScroll = currentScroll;
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add CSS for reveal animations
    const style = document.createElement('style');
    style.textContent = `
        .reveal-on-scroll {
            opacity: 0;
            transform: translateY(30px);
            transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), 
                        transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .reveal-on-scroll.revealed {
            opacity: 1;
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);

    // Cursor trail effect for added polish (optional, subtle)
    const hero = document.querySelector('.hero');
    if (hero && window.matchMedia('(min-width: 768px)').matches) {
        hero.addEventListener('mousemove', (e) => {
            const rect = hero.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            
            hero.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(201, 169, 98, 0.03) 0%, transparent 50%)`;
        });
    }
});

// Console greeting for developers
console.log('%c👋 Hello, fellow developer!', 'font-size: 20px; font-weight: bold;');
console.log('%cInterested in how this site was built? Let\'s connect!', 'font-size: 14px; color: #c9a962;');
