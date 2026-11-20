// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
function closeMenu() {
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', '打开导航菜单');
  nav.classList.remove('open');
}
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
  nav.classList.toggle('open', open);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenu(); toggle.focus(); }
});
nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });

const creditCards = [...document.querySelectorAll('.credit-card')];
const creditSearch = document.querySelector('#credit-search');
if (creditSearch) {
  document.querySelector('.credits-toolbar').hidden = false;
  let category = '全部';
  const filters = [...document.querySelectorAll('[data-filter]')];
  const filterCredits = () => {
    const query = creditSearch.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of creditCards) {
      const match = (category === '全部' || card.dataset.category === category)
        && card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    }
    document.querySelector('#credit-count').textContent = `显示 ${visible} / ${creditCards.length} 个项目`;
    document.querySelector('#credit-empty').hidden = visible > 0;
  };
  creditSearch.addEventListener('input', filterCredits);
  for (const button of filters) {
    button.addEventListener('click', () => {
      category = button.dataset.filter;
      for (const filter of filters) filter.setAttribute('aria-pressed', String(filter === button));
      filterCredits();
    });
  }
  for (const image of document.querySelectorAll('.credit-logo')) {
    image.addEventListener('error', () => {
      image.hidden = true;
      const fallback = document.createElement('span');
      fallback.className = 'credit-monogram';
      fallback.textContent = image.closest('.credit-card').querySelector('h3').textContent.slice(0, 2);
      image.after(fallback);
    }, { once: true });
  }
}
