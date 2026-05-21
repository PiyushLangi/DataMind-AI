// Interactions for DataMind AI

document.addEventListener('DOMContentLoaded', () => {
    // Reveal animations on scroll
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('opacity-100', 'translate-y-0');
                entry.target.classList.remove('opacity-0', 'translate-y-10');
            }
        });
    }, observerOptions);

    // Apply scroll reveal to cards and sections
    const revealElements = document.querySelectorAll('.glass, section h2, section p, .mockup-card');
    revealElements.forEach(el => {
        el.classList.add('transition-all', 'duration-700', 'opacity-0', 'translate-y-10');
        observer.observe(el);
    });

    // Mobile Menu Toggle (Simplified)
    const menuBtn = document.querySelector('nav button[md\\:hidden]');
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            alert('Mobile menu feature coming in the next iteration!');
        });
    }

    // Hover effect for the dashboard mockup to follow mouse slightly
    const mockup = document.querySelector('.mockup-card');
    if (mockup) {
        document.addEventListener('mousemove', (e) => {
            const xAxis = (window.innerWidth / 2 - e.pageX) / 50;
            const yAxis = (window.innerHeight / 2 - e.pageY) / 50;
            mockup.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
        });

        document.addEventListener('mouseleave', () => {
            mockup.style.transform = `rotateY(0deg) rotateX(0deg)`;
        });
    }
});
