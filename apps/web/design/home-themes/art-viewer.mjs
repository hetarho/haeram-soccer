import { concepts } from './art-directions.mjs';

if (new URLSearchParams(location.search).has('board')) document.body.classList.add('board');

const studies = document.getElementById('studies');
const picker = document.getElementById('picker');
const preview = document.getElementById('home-preview');

for (const concept of concepts) {
  const card = document.createElement('a');
  card.className = `study-card${concept.recommended ? ' recommended' : ''}`;
  card.href = '#detail';
  card.innerHTML = `<div class="card-label"><h2 class="card-title"><span class="card-number">${concept.number}</span>${concept.name}</h2>${concept.recommended ? '<span class="recommend">추천</span>' : ''}</div><img src="./captures/${concept.image}" alt="${concept.name} 홈 아트 방향 시안" width="1380" height="920"><div class="card-copy"><strong>${concept.mood}</strong><p>삽화 · ${concept.art}<br>아이콘 · ${concept.icons}<br>UI · ${concept.controls}</p></div>`;
  card.addEventListener('click', () => select(concept.id));
  studies.append(card);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${concept.number} ${concept.name}`;
  button.dataset.theme = concept.id;
  button.addEventListener('click', () => select(concept.id));
  picker.append(button);
}

function select(id) {
  const concept = concepts.find((item) => item.id === id);
  document.getElementById('detail-title').textContent = concept.name;
  document.getElementById('detail-description').textContent = concept.description;
  for (const button of picker.children)
    button.setAttribute('aria-pressed', String(button.dataset.theme === id));
  preview.src = `./captures/${concept.image}`;
  preview.alt = `${concept.name} 홈 아트 방향 시안`;
  document.getElementById('original-link').href = preview.src;
  const spec = document.getElementById('direction-spec');
  spec.replaceChildren();
  for (const [label, value] of [
    ['삽화', concept.art],
    ['아이콘', concept.icons],
    ['UI 재질', concept.controls],
  ]) {
    const item = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    item.append(term, description);
    spec.append(item);
  }
}

select('clay');
