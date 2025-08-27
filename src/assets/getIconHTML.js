export default function getIconHTML(name, color, needNames) {
  const icon = `
    <svg
      xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"
      preserveAspectRatio="xMidYMid meet">
      <path fill="#000000" stroke="#000" stroke-width="0.5" d="M17 5H3c-1.1 0-2 .9-2 2v11h2c0 1.1.9 2 2 2s2-.9 2-2h8c0 1.1.9 2 2 2s2-.9 2-2h2V9l-5-4zM9 18.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm8 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zM16 12H4V7h12v5z"/>
      <!-- Windows/doors for shuttle -->
      <rect fill="#fff" x="5" y="8" width="2" height="2"/>
      <rect fill="#fff" x="8" y="8" width="2" height="2"/>
      <rect fill="#fff" x="11" y="8" width="2" height="2"/>
      <rect fill="#fff" x="14" y="8" width="2" height="2"/>
    </svg>
  `
  const html = `
    <div class="my-div-icon__inner">${icon}</div>
    ${needNames ? `<div class="my-div-icon__name">${name}</div>` : ''}
  `
  return html
}
