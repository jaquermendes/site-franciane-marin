// Configuração do site e do painel.
window.SITE_CONFIG = {
  // URL do Apps Script publicado (veja LEIA-ME.md). No computador, usa o
  // servidor de teste (node servidor-local.js) automaticamente.
  agendaUrl: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/api' : 'https://script.google.com/macros/s/AKfycbzPO4Dofef2Gbru3w9-cp9ZYpR9YhYNBeUCUApHm12nYc-ouEOg04CF9k0KnaGsEyVU/exec',

  whatsapp: '5516997498570',

  notas: {
    presencial: 'Espaço Vida, Araraquara. Inclui avaliação corporal completa.',
    online: 'Por vídeo, para qualquer cidade do Brasil. Horários diferentes do presencial.'
  }
};
