/* ==========================================================================
   BADMINTONPRO - VANILLA JAVASCRIPT LOGIC
   Awwwards Micro-Interactions, Scroll Reveal, Modal & Booking Workflow
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ------------------------------------------------------------------------
     0. DARK / LIGHT THEME TOGGLE (persisted; dark is the default)
     ------------------------------------------------------------------------ */
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleKnob = document.getElementById('theme-toggle-knob');

  const SUN_ICON = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>';
  const LIGHT_ICON = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function paintThemeIcon() {
    if (!themeToggleKnob) return;
    themeToggleKnob.querySelector('svg').innerHTML = isLight() ? LIGHT_ICON : SUN_ICON;
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const next = isLight() ? 'dark' : 'light';
      if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      localStorage.setItem('bp-theme', next);
      paintThemeIcon();
    });
  }

  paintThemeIcon();

  /* ------------------------------------------------------------------------
     1. STICKY NAVBAR TRANSITION ON SCROLL
     ------------------------------------------------------------------------ */
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  /* ------------------------------------------------------------------------
     2. MOBILE MENU TOGGLE
     ------------------------------------------------------------------------ */
  const mobileToggle = document.getElementById('mobile-toggle');
  const navLinks = document.getElementById('nav-links');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
      });
    });
  }

  /* ------------------------------------------------------------------------
     3. RIPPLE BUTTON MICRO-INTERACTION
     ------------------------------------------------------------------------ */
  const rippleButtons = document.querySelectorAll('.ripple-btn');
  rippleButtons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const circle = document.createElement('span');
      circle.classList.add('ripple');
      circle.style.top = y + 'px';
      circle.style.left = x + 'px';

      this.appendChild(circle);

      setTimeout(() => circle.remove(), 600);
    });
  });

  /* ------------------------------------------------------------------------
     4. ANIMATED STATISTICS COUNTER (IntersectionObserver)
     ------------------------------------------------------------------------ */
  const statNumbers = document.querySelectorAll('.stat-number');

  const counterObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target;
        const countTo = parseFloat(target.getAttribute('data-target'));
        
        if (!isNaN(countTo)) {
          let current = 0;
          const isFloat = countTo % 1 !== 0;
          const step = countTo / 40;
          const timer = setInterval(() => {
            current += step;
            if (current >= countTo) {
              current = countTo;
              clearInterval(timer);
            }
            if (isFloat) {
              target.innerText = current.toFixed(1) + ' ★';
            } else if (countTo >= 1000) {
              target.innerText = Math.floor(current).toLocaleString() + '+';
            } else {
              target.innerText = Math.floor(current);
            }
          }, 30);
        }
        observer.unobserve(target);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(stat => counterObserver.observe(stat));

  /* ------------------------------------------------------------------------
     5. BOOKING MODAL & SLOT SELECTION LOGIC
     ------------------------------------------------------------------------ */
  const bookingModal = document.getElementById('booking-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCourtName = document.getElementById('modal-court-name');
  const modalDateTime = document.getElementById('modal-date-time');
  const modalDuration = document.getElementById('modal-duration');
  const modalTotalPrice = document.getElementById('modal-total-price');
  const confirmForm = document.getElementById('confirm-booking-form');

  function openBookingModal(courtName, timeStr, durationHours, pricePerHour) {
    const total = durationHours * pricePerHour;
    
    modalCourtName.textContent = courtName || 'Court 01 - BWF Arena';
    modalDateTime.textContent = `Today, ${timeStr || '05:00 PM'}`;
    modalDuration.textContent = `${durationHours} Hour${durationHours > 1 ? 's' : ''}`;
    modalTotalPrice.textContent = `$${total.toFixed(2)}`;

    bookingModal.classList.add('active');
  }

  function closeBookingModal() {
    bookingModal.classList.remove('active');
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeBookingModal);
  }

  bookingModal?.addEventListener('click', (e) => {
    if (e.target === bookingModal) closeBookingModal();
  });

  // Quick Book Triggers on Court Cards
  document.querySelectorAll('.open-booking-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const courtName = e.target.getAttribute('data-court');
      const price = parseFloat(e.target.getAttribute('data-price')) || 30;
      openBookingModal(courtName, '05:00 PM', 2, price);
    });
  });

  // Interactive Availability Grid Slot Trigger
  document.querySelectorAll('.slot-cell.available').forEach(slot => {
    slot.addEventListener('click', () => {
      const time = slot.getAttribute('data-time');
      const court = slot.getAttribute('data-court');
      const priceStr = slot.textContent.replace('$', '');
      const price = parseFloat(priceStr) || 28;
      
      openBookingModal(`${court} (Selected Slot)`, time, 1, price);
    });
  });

  // Form Submit Handler
  confirmForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    closeBookingModal();

    // Custom Toast Notification
    showToast('🎉 Reservation Confirmed! Confirmation code #BP-' + Math.floor(1000 + Math.random() * 9000));
  });

  // Widget "Find Available Courts" Trigger
  const searchBtn = document.getElementById('search-courts-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const time = document.getElementById('booking-time').value;
      const duration = parseFloat(document.getElementById('booking-duration').value) || 2;
      openBookingModal('Court 01 - BWF Arena', time, duration, 30);
    });
  }

  /* ------------------------------------------------------------------------
     6. CUSTOM TOAST NOTIFICATION
     ------------------------------------------------------------------------ */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: var(--gradient-primary);
      color: #0F172A;
      padding: 16px 28px;
      border-radius: 9999px;
      font-family: var(--font-heading);
      font-weight: 700;
      box-shadow: 0 10px 30px rgba(34, 197, 94, 0.4);
      z-index: 4000;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    toast.innerText = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  /* ------------------------------------------------------------------------
     7. MASONRY GALLERY LIGHTBOX
     ------------------------------------------------------------------------ */
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');

  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('.gallery-img');
      if (img && lightboxModal && lightboxImg) {
        lightboxImg.src = img.src;
        lightboxModal.classList.add('active');
      }
    });
  });

  if (lightboxClose && lightboxModal) {
    lightboxClose.addEventListener('click', () => {
      lightboxModal.classList.remove('active');
    });

    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        lightboxModal.classList.remove('active');
      }
    });
  }

  /* ------------------------------------------------------------------------
     8. TESTIMONIALS CAROUSEL
     ------------------------------------------------------------------------ */
  const testimonialCards = document.querySelectorAll('.testimonial-card');
  const dots = document.querySelectorAll('.carousel-dots .dot');
  let currentTestimonial = 0;

  function showTestimonial(index) {
    testimonialCards.forEach((card, i) => {
      card.classList.toggle('active', i === index);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      currentTestimonial = parseInt(dot.getAttribute('data-index')) || 0;
      showTestimonial(currentTestimonial);
    });
  });

  // Auto rotate testimonials
  setInterval(() => {
    if (testimonialCards.length > 0) {
      currentTestimonial = (currentTestimonial + 1) % testimonialCards.length;
      showTestimonial(currentTestimonial);
    }
  }, 6000);

  /* ------------------------------------------------------------------------
     9. FAQ ACCORDION
     ------------------------------------------------------------------------ */
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const header = item.querySelector('.faq-header');
    header?.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  /* ------------------------------------------------------------------------
     10. SCROLL REVEAL ANIMATION FOR SECTIONS & CARDS
     ------------------------------------------------------------------------ */
  const revealElements = document.querySelectorAll('.court-card, .facility-card, .pricing-card, .service-card');
  
  revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealElements.forEach(el => revealObserver.observe(el));

});
