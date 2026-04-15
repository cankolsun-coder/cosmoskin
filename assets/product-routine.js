(function(){
  function removeRoutineModules(){
    document.querySelectorAll('.product-routine').forEach((node) => node.remove());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeRoutineModules, { once: true });
  } else {
    removeRoutineModules();
  }
})();
