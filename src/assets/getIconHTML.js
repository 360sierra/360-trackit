export default function getIconHTML(name, color, needNames) {
  const icon = `
    <svg
      xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"
      preserveAspectRatio="xMidYMid meet">
      <!-- Vehicle body with proper scaling -->
      <path fill="#000000" stroke="#000" stroke-width="0.5" d="M16 6H4c-1 0-1.5.5-1.5 1.5v8h1.5c0 1 .5 1.5 1.5 1.5s1.5-.5 1.5-1.5h6c0 1 .5 1.5 1.5 1.5s1.5-.5 1.5-1.5h1.5v-6l-4-3.5z"/>
      <!-- Wheels properly positioned -->
      <circle fill="#333" cx="7" cy="16" r="1.2"/>
      <circle fill="#666" cx="7" cy="16" r="0.8"/>
      <circle fill="#333" cx="15" cy="16" r="1.2"/>
      <circle fill="#666" cx="15" cy="16" r="0.8"/>
      <!-- Windows/doors for shuttle - properly scaled -->
      <rect fill="#ffffff" stroke="#cccccc" stroke-width="0.1" x="5" y="8.5" width="2" height="1.5" rx="0.2"/>
      <rect fill="#ffffff" stroke="#cccccc" stroke-width="0.1" x="7.5" y="8.5" width="2" height="1.5" rx="0.2"/>
      <rect fill="#ffffff" stroke="#cccccc" stroke-width="0.1" x="10" y="8.5" width="2" height="1.5" rx="0.2"/>
      <rect fill="#ffffff" stroke="#cccccc" stroke-width="0.1" x="12.5" y="8.5" width="2" height="1.5" rx="0.2"/>
    </svg>
  `
  const html = `
    <div class="my-div-icon__inner">${icon}</div>
    ${needNames ? `<div class="my-div-icon__name">${name}</div>` : ''}
  `
  return html
}
