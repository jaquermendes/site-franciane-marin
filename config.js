// Configuração do site e do painel.
window.SITE_CONFIG = {
  // URL do Apps Script publicado (veja LEIA-ME.md). No computador, usa o
  // servidor de teste (node servidor-local.js) automaticamente.
  agendaUrl: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/api' : 'https://script.google.com/macros/s/AKfycbzPO4Dofef2Gbru3w9-cp9ZYpR9YhYNBeUCUApHm12nYc-ouEOg04CF9k0KnaGsEyVU/exec',

  whatsapp: '5516997498570',

  // Consultório (aparece no site e nas mensagens do WhatsApp das consultas presenciais).
  endereco: 'Espaço Vida · Avenida Raphael Logatti, 866 · Araraquara/SP · 14806-020',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Avenida+Raphael+Logatti%2C+866+-+Araraquara+-+SP%2C+14806-020',

  notas: {
    presencial: 'Espaço Vida, Av. Raphael Logatti, 866, Araraquara. Inclui avaliação corporal completa.',
    online: 'Por vídeo, para qualquer cidade do Brasil. Horários diferentes do presencial.'
  }
};
