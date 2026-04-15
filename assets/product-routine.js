
(function(){
  const PRODUCT_ROUTINE_DATA = {
    "torriden-divein-serum": {
      usage: "Temizleme sonrası hafif nemli cilde 2-3 damla uygulayın. Sabah ve akşam nemlendirici öncesinde kullanılabilir.",
      place: "Temizleme sonrası, krem öncesi nem katmanında yer alır.",
      recommended: [
        { name: "DIVE-IN Watery Sun Serum", reason: "Gündüz rutini için SPF ile tamamlanır." },
        { name: "Advanced Snail 96 Mucin Essence", reason: "Serum öncesi ekstra nem ve bariyer desteği sağlar." }
      ],
      routines: ["Yoğun Nem Rutini", "Bariyer Desteği Rutini"]
    },
    "cosrx-snail": {
      usage: "Tonik sonrası 1-2 pompa uygulayın. Sabah ve akşam serum veya krem öncesi katmanlanabilir.",
      place: "Temizleme sonrası, serum ve krem öncesi esans adımında kullanılır.",
      recommended: [
        { name: "DIVE-IN Serum", reason: "Esans sonrası nem katmanını güçlendirir." },
        { name: "1025 Dokdo Cleanser", reason: "Nazik bir başlangıç ile rutini dengeler." }
      ],
      routines: ["Nem Dengesi Rutini", "Bariyer Desteği Rutini"]
    },
    "roundlab-cleanser": {
      usage: "Islak cilde nazikçe masaj yaparak uygulayın, ardından durulayın. Sabah ve akşam kullanılabilir.",
      place: "Rutinin ilk adımıdır; cildi sonraki serum ve krem adımlarına hazırlar.",
      recommended: [
        { name: "DIVE-IN Serum", reason: "Temizleme sonrası nem desteği sağlar." },
        { name: "Relief Sun SPF50+ PA++++", reason: "Sabah rutininin son adımını tamamlar." }
      ],
      routines: ["Günlük Başlangıç Rutini", "Dengeli Temizlik Rutini"]
    },
    "boj-glow": {
      usage: "Temizleme ve tonik sonrası 2-3 damla uygulayın. Akşam rutininde veya sabah SPF ile birlikte kullanılabilir.",
      place: "Temizleme sonrası hedef bakım serum adımında yer alır.",
      recommended: [
        { name: "Relief Sun SPF50+ PA++++", reason: "Gündüz kullanımında koruma ile desteklenmesi önerilir." },
        { name: "1025 Dokdo Cleanser", reason: "Nazik bir temizleme adımıyla daha dengeli sonuç verir." }
      ],
      routines: ["Işıltı Rutini", "Eşit Ton Görünümü Rutini"]
    },
    "cosrx-vitc": {
      usage: "Temiz ve kuru cilde akşam rutininin serum adımında birkaç damla uygulayın. Gündüz kullanımında mutlaka SPF ile tamamlayın.",
      place: "Hedef bakım serum adımı olarak temizleme sonrası kullanılır.",
      recommended: [
        { name: "Relief Sun SPF50+ PA++++", reason: "C vitamini kullanımında gündüz koruma kritik adımdır." },
        { name: "Advanced Snail 96 Mucin Essence", reason: "Daha konforlu bir katmanlama sunar." }
      ],
      routines: ["Aydınlık Görünüm Rutini", "Akşam Hedef Bakım Rutini"]
    },
    "boj-relief": {
      usage: "Sabah rutininin son adımında yeterli miktarda uygulayın ve gün içinde gerektiğinde yenileyin.",
      place: "Gündüz rutininin son koruma adımıdır.",
      recommended: [
        { name: "DIVE-IN Serum", reason: "SPF öncesi hafif nem desteği sağlar." },
        { name: "Glow Serum", reason: "Sabah rutininin bakım katmanını güçlendirir." }
      ],
      routines: ["Günlük Koruma Rutini", "Şehir Rutini"]
    },
    "torriden-watery-sun": {
      usage: "Sabah rutininin sonunda uygulayın. Dışarıda uzun süre kalınacak günlerde yenileyin.",
      place: "Gündüz rutininin son, koruyucu adımıdır.",
      recommended: [
        { name: "DIVE-IN Serum", reason: "Hafif nem katmanı ile daha konforlu bir bitiş sağlar." },
        { name: "Advanced Snail 96 Mucin Essence", reason: "SPF öncesi esans desteği sunar." }
      ],
      routines: ["Su Bazlı Koruma Rutini", "Günlük Koruma Rutini"]
    },
    "roundlab-soybean-cream": {
      usage: "Serum sonrası yüz ve boyun bölgesine yeterli miktarda uygulayın. Sabah ve akşam kullanılabilir.",
      place: "Serum sonrası krem adımında kullanılır, nemi ciltte tutmaya yardımcı olur.",
      recommended: [
        { name: "DIVE-IN Serum", reason: "Krem öncesi nem katmanını destekler." },
        { name: "1025 Dokdo Cleanser", reason: "Dengeli bir başlangıç sunar." }
      ],
      routines: ["Bariyer Desteği Rutini", "Akşam Onarım Rutini"]
    },
    "boj-revive-eye": {
      usage: "Az miktarda ürünü göz çevresine nazikçe uygulayın. Akşam rutininde veya sabah hafif bakım olarak kullanılabilir.",
      place: "Serum sonrası, nemlendirici öncesi göz çevresi bakım adımında yer alır.",
      recommended: [
        { name: "Revive Serum Ginseng + Snail", reason: "Göz çevresi bakımını yüz serumuyla dengeler." },
        { name: "Bean Cream", reason: "Akşam rutininin nem katmanını tamamlar." }
      ],
      routines: ["Göz Çevresi Destek Rutini", "Akşam Bakım Rutini"]
    },
    "mixsoon-bean": {
      usage: "Tonik sonrası 1-2 pompa uygulayın. Sabah ve akşam serum katmanı olarak kullanılabilir.",
      place: "Temizleme sonrası serum/esans geçişinde yer alır.",
      recommended: [
        { name: "Bean Cream", reason: "Aynı rutin içinde nemi dengelemeye yardımcı olur." },
        { name: "Relief Sun SPF50+ PA++++", reason: "Gündüz rutinini koruma ile tamamlar." }
      ],
      routines: ["Dengeli Nem Rutini", "Günlük Katmanlı Rutin"]
    },
    "beauty-of-joseon-revive": {
      usage: "Temizleme sonrası serum adımında birkaç damla uygulayın. Sabah ve akşam kullanılabilir.",
      place: "Temizleme sonrası hedef bakım serum adımında yer alır.",
      recommended: [
        { name: "Revive Eye Serum", reason: "Aynı bakım çizgisini göz çevresine taşır." },
        { name: "Relief Sun SPF50+ PA++++", reason: "Gündüz rutini için koruma desteği sağlar." }
      ],
      routines: ["Canlı Görünüm Rutini", "Bariyer Destekli Rutin"]
    }
  };

  function esc(value) {
    return String(value || '').replace(/[&<>\"']/g, function(s) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[s];
    });
  }

  function buildMarkup(data) {
    const recs = (data.recommended || []).map(item => `
      <li class="product-routine__recommend-item">
        <strong>${esc(item.name)}</strong>
        <span>${esc(item.reason)}</span>
      </li>`).join('');
    const routines = (data.routines || []).map(item => `<span class="product-routine__tag">${esc(item)}</span>`).join('');
    return `
      <section class="product-routine" aria-label="Rutin detayı">
        <button class="product-routine__toggle" type="button" aria-expanded="false">
          <span>Rutin Detayı</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="product-routine__panel" hidden>
          <div class="product-routine__grid">
            <article class="product-routine__block">
              <div class="product-routine__label">Nasıl Kullanılır</div>
              <p>${esc(data.usage)}</p>
            </article>
            <article class="product-routine__block">
              <div class="product-routine__label">Rutindeki Yeri</div>
              <p>${esc(data.place)}</p>
            </article>
          </div>
          <article class="product-routine__block product-routine__block--stacked">
            <div class="product-routine__label">Birlikte Kullanılması Tavsiye Edilir</div>
            <ul class="product-routine__recommend-list">${recs}</ul>
          </article>
          <article class="product-routine__block product-routine__block--stacked">
            <div class="product-routine__label">Uyumlu Rutinler</div>
            <div class="product-routine__tags">${routines}</div>
          </article>
        </div>
      </section>`;
  }

  function insertRoutineModules() {
    document.querySelectorAll('.product-card').forEach(card => {
      if (card.querySelector('.product-routine')) return;
      const button = card.querySelector('[data-add-cart]');
      const body = card.querySelector('.product-body');
      if (!button || !body) return;
      const id = button.getAttribute('data-id');
      const data = PRODUCT_ROUTINE_DATA[id];
      if (!data) return;
      body.insertAdjacentHTML('beforeend', buildMarkup(data));
    });
  }

  function bindRoutineToggles() {
    document.addEventListener('click', function(event) {
      const toggle = event.target.closest('.product-routine__toggle');
      if (!toggle) return;
      const panel = toggle.nextElementSibling;
      if (!panel) return;
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      panel.hidden = expanded;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      insertRoutineModules();
      bindRoutineToggles();
    }, { once: true });
  } else {
    insertRoutineModules();
    bindRoutineToggles();
  }
})();
