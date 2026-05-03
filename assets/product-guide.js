(function(){
  const root = document.querySelector('.product-guide-v2');
  if(!root) return;
  const links = Array.from(root.querySelectorAll('.pgv2-step[href^="#"]'));
  const sections = Array.from(root.querySelectorAll('[data-guide-step]'));
  if(!links.length || !sections.length) return;
  links.forEach(link => {
    link.addEventListener('click', function(e){
      const target = document.querySelector(this.getAttribute('href'));
      if(!target) return;
      e.preventDefault();
      target.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
  const activate = (id) => { links.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === '#' + id)); };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
    if(visible[0]) activate(visible[0].target.id);
  }, {rootMargin:'-22% 0px -55% 0px', threshold:[0.15,0.3,0.5]});
  sections.forEach(section => observer.observe(section));
})();
