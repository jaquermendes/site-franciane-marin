(function () {
  'use strict';

  var CONFIG = window.SITE_CONFIG || {};
  var DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DDDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99];

  var MAX_OPCOES = 3;
  // escolhidos: { data, horario } na ordem em que a pessoa tocou (1ª, 2ª, 3ª opção).
  var estado = { modo: 'presencial', dias: { presencial: null, online: null }, diaIdx: 0, escolhidos: [], enviando: false };

  var $ = function (id) { return document.getElementById(id); };
  var form = $('form-agenda');
  if (!form) return;
  var etapas = form.querySelectorAll('.etapa');
  var elDias = $('dias');
  var elHorarios = $('horarios');
  var elEstado = $('estado-horarios');
  var elContinuar = $('continuar');
  var elContinuarTexto = $('continuar-texto');
  var elNota = $('nota-modo');
  var elPais = $('pais');
  var elCodigoOutro = $('codigo-outro');
  var elTelefone = $('telefone');
  var elNome = $('nome');
  var elEnviar = $('enviar');
  var elEscolhidos = $('escolhidos');
  var elContador = $('contador-opcoes');
  var elLimite = $('limite-opcoes');

  // ---------- Datas ----------
  function paraISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function deISO(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function dataCurta(iso) {
    var d = deISO(iso);
    return DIAS_CURTOS[d.getDay()].toLowerCase() + ', ' + d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function dataPorExtenso(iso) {
    var d = deISO(iso);
    return DIAS_LONGOS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()];
  }

  // ---------- Horários ----------
  function buscarAgenda(modo) {
    var url = CONFIG.agendaUrl + (CONFIG.agendaUrl.indexOf('?') > -1 ? '&' : '?') + 'modo=' + encodeURIComponent(modo);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('agenda ' + r.status);
      return r.json();
    }).then(function (json) {
      return json.dias || [];
    });
  }

  function carregar(modo, forcar) {
    if (estado.dias[modo] && !forcar) return Promise.resolve(estado.dias[modo]);
    if (!CONFIG.agendaUrl) return Promise.reject(new Error('sem agenda'));
    return buscarAgenda(modo).then(function (dias) {
      estado.dias[modo] = dias;
      return dias;
    });
  }

  function mostrarEstado(texto) {
    elEstado.textContent = texto || '';
    elEstado.hidden = !texto;
  }

  function atualizarHorarios(forcar) {
    var modo = estado.modo;
    elDias.innerHTML = '';
    elHorarios.innerHTML = '';
    mostrarEstado('Buscando horários livres...');
    atualizarBotao();
    carregar(modo, forcar).then(function (dias) {
      if (modo !== estado.modo) return;
      if (!dias.length) {
        mostrarEstado('Sem horários livres nos próximos dias. Chame no WhatsApp que a Franciane encaixa você.');
        return;
      }
      mostrarEstado('');
      if (estado.diaIdx >= dias.length) estado.diaIdx = 0;
      desenharDias(dias);
      desenharHorarios(dias[estado.diaIdx]);
    }).catch(function () {
      mostrarEstado(CONFIG.agendaUrl ? 'Não consegui carregar a agenda agora. Tente de novo em instantes ou chame no WhatsApp.' : 'A agenda online está sendo configurada. Chame no WhatsApp para marcar.');
    });
  }

  function posicao(data, horario) {
    for (var i = 0; i < estado.escolhidos.length; i++) {
      if (estado.escolhidos[i].data === data && estado.escolhidos[i].horario === horario) return i;
    }
    return -1;
  }

  function desenharDias(dias) {
    elDias.innerHTML = '';
    dias.forEach(function (dia, i) {
      var d = deISO(dia.data);
      var marcados = estado.escolhidos.filter(function (o) { return o.data === dia.data; }).length;
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === estado.diaIdx));
      b.setAttribute('aria-label', dataPorExtenso(dia.data) + (marcados ? ', ' + marcados + ' escolhido' + (marcados > 1 ? 's' : '') : ''));
      b.innerHTML = '<span>' + DIAS_CURTOS[d.getDay()] + '</span><strong>' + d.getDate() + '</strong>' + (marcados ? '<i class="marca-dia" aria-hidden="true">' + marcados + '</i>' : '');
      b.addEventListener('click', function () {
        estado.diaIdx = i;
        desenharDias(dias);
        desenharHorarios(dia);
      });
      elDias.appendChild(b);
    });
  }

  function desenharHorarios(dia) {
    elHorarios.innerHTML = '';
    dia.horarios.forEach(function (h) {
      var pos = posicao(dia.data, h);
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(pos > -1));
      b.setAttribute('aria-label', h + (pos > -1 ? ', ' + (pos + 1) + 'ª opção' : ''));
      b.innerHTML = h + (pos > -1 ? '<i class="marca-opcao" aria-hidden="true">' + (pos + 1) + 'ª</i>' : '');
      b.addEventListener('click', function () { alternar(dia, h); });
      elHorarios.appendChild(b);
    });
  }

  function alternar(dia, h) {
    var pos = posicao(dia.data, h);
    if (pos > -1) {
      estado.escolhidos.splice(pos, 1);
    } else if (estado.escolhidos.length >= MAX_OPCOES) {
      elLimite.hidden = false;
      return;
    } else {
      estado.escolhidos.push({ data: dia.data, horario: h });
    }
    redesenhar();
  }

  function redesenhar() {
    var dias = estado.dias[estado.modo] || [];
    if (dias.length) {
      desenharDias(dias);
      desenharHorarios(dias[estado.diaIdx]);
    }
    desenharEscolhidos();
    atualizarBotao();
  }

  function desenharEscolhidos() {
    var n = estado.escolhidos.length;
    elContador.textContent = n + ' de ' + MAX_OPCOES;
    elEscolhidos.innerHTML = '';
    elEscolhidos.hidden = !n;
    if (n < MAX_OPCOES) elLimite.hidden = true;
    estado.escolhidos.forEach(function (o, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span><strong>' + (i + 1) + 'ª opção</strong> ' + dataCurta(o.data) + ' às ' + o.horario + '</span>';
      var tirar = document.createElement('button');
      tirar.type = 'button';
      tirar.setAttribute('aria-label', 'Tirar ' + (i + 1) + 'ª opção');
      tirar.textContent = '×';
      tirar.addEventListener('click', function () { estado.escolhidos.splice(i, 1); redesenhar(); });
      li.appendChild(tirar);
      elEscolhidos.appendChild(li);
    });
  }

  function atualizarBotao() {
    var n = estado.escolhidos.length;
    elContinuar.disabled = !n;
    elContinuarTexto.textContent = n ? 'Continuar com ' + n + (n > 1 ? ' opções' : ' opção') : 'Escolha de 1 a 3 horários';
  }

  // ---------- Etapas ----------
  function irPara(n) {
    etapas.forEach(function (el) { el.hidden = el.getAttribute('data-etapa') !== String(n); });
  }

  function formatoTexto() { return estado.modo === 'online' ? 'online' : 'presencial'; }

  function listaOpcoes(sep) {
    return estado.escolhidos.map(function (o, i) {
      return (i + 1) + 'ª opção: ' + dataPorExtenso(o.data) + ', às ' + o.horario;
    }).join(sep);
  }

  // ---------- Formato ----------
  form.querySelectorAll('.formato button').forEach(function (b) {
    b.addEventListener('click', function () {
      var modo = b.getAttribute('data-modo');
      if (modo === estado.modo) return;
      estado.modo = modo;
      estado.diaIdx = 0;
      estado.escolhidos = [];
      form.querySelectorAll('.formato button').forEach(function (o) {
        o.setAttribute('aria-checked', String(o === b));
      });
      elNota.textContent = (CONFIG.notas || {})[modo] || '';
      desenharEscolhidos();
      atualizarHorarios();
    });
  });

  elContinuar.addEventListener('click', function () {
    if (elContinuar.disabled) return;
    var r = $('resumo');
    r.innerHTML = '';
    var t = document.createElement('p');
    t.innerHTML = '<strong>Consulta ' + formatoTexto() + '</strong> · suas sugestões de horário:';
    var ol = document.createElement('ol');
    estado.escolhidos.forEach(function (o) {
      var li = document.createElement('li');
      li.textContent = dataPorExtenso(o.data) + ', às ' + o.horario;
      ol.appendChild(li);
    });
    r.appendChild(t);
    r.appendChild(ol);
    irPara(2);
    elNome.focus();
  });

  $('voltar').addEventListener('click', function () {
    irPara(1);
    elContinuar.focus();
  });

  $('nova').addEventListener('click', function () {
    estado.escolhidos = [];
    form.reset();
    elCodigoOutro.hidden = true;
    limparErros();
    desenharEscolhidos();
    irPara(1);
    atualizarHorarios(true);
  });

  // ---------- Telefone ----------
  function soDigitos(v) { return (v || '').replace(/\D/g, ''); }

  function codigoPais() {
    if (elPais.value === 'outro') return soDigitos(elCodigoOutro.value);
    return elPais.value;
  }

  function mascaraBrasil(digitos) {
    var d = digitos.slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    var ddd = '(' + d.slice(0, 2) + ') ';
    var resto = d.slice(2);
    if (resto.length <= 4) return ddd + resto;
    if (d.length <= 10) return ddd + resto.slice(0, 4) + '-' + resto.slice(4);
    return ddd + resto.slice(0, 5) + '-' + resto.slice(5);
  }

  elTelefone.addEventListener('input', function () {
    if (codigoPais() === '55') {
      var digitos = soDigitos(elTelefone.value);
      if (digitos.length > 11 && digitos.indexOf('55') === 0) digitos = digitos.slice(2);
      elTelefone.value = mascaraBrasil(digitos);
    }
    if (elTelefone.getAttribute('aria-invalid') === 'true') validarTelefone();
  });

  elPais.addEventListener('change', function () {
    var outro = elPais.value === 'outro';
    elCodigoOutro.hidden = !outro;
    elTelefone.placeholder = elPais.value === '55' ? '(16) 99999-9999' : 'Número com código de área';
    var digitos = soDigitos(elTelefone.value);
    elTelefone.value = elPais.value === '55' ? mascaraBrasil(digitos) : digitos;
    if (outro) elCodigoOutro.focus();
  });

  function erro(campo, idErro, msg) {
    campo.setAttribute('aria-invalid', msg ? 'true' : 'false');
    $(idErro).textContent = msg || '';
    return !msg;
  }

  function validarTelefone() {
    var codigo = codigoPais();
    var digitos = soDigitos(elTelefone.value);
    if (!digitos) return erro(elTelefone, 'erro-telefone', 'Informe seu WhatsApp com DDD.');
    if (codigo === '55') {
      var ddd = +digitos.slice(0, 2);
      if (digitos.length < 10) return erro(elTelefone, 'erro-telefone', 'Falta o DDD ou algum número. Exemplo: (16) 99999-9999.');
      if (DDDS.indexOf(ddd) === -1) return erro(elTelefone, 'erro-telefone', 'Esse DDD não existe. Confira os dois primeiros números.');
      if (digitos.length === 11 && digitos.charAt(2) !== '9') return erro(elTelefone, 'erro-telefone', 'Celular com 11 números começa com 9 depois do DDD.');
      return erro(elTelefone, 'erro-telefone', '');
    }
    if (!codigo || codigo.length > 4) return erro(elTelefone, 'erro-telefone', 'Informe o código do país.');
    if (digitos.length < 6 || digitos.length > 14) return erro(elTelefone, 'erro-telefone', 'Confira o número com o código de área.');
    return erro(elTelefone, 'erro-telefone', '');
  }

  function validarNome() {
    var ok = elNome.value.trim().length >= 2;
    return erro(elNome, 'erro-nome', ok ? '' : 'Como podemos te chamar?');
  }

  function limparErros() {
    erro(elNome, 'erro-nome', '');
    erro(elTelefone, 'erro-telefone', '');
  }

  elTelefone.addEventListener('blur', function () { if (elTelefone.value) validarTelefone(); });
  elNome.addEventListener('blur', function () { if (elNome.value) validarNome(); });

  // ---------- Envio ----------
  function enviar(dados) {
    // text/plain evita a checagem extra (CORS) que o Apps Script não responde.
    return fetch(CONFIG.agendaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(dados)
    }).then(function (r) { return r.json(); });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (estado.enviando) return;
    var nomeOk = validarNome();
    var telOk = validarTelefone();
    if (!nomeOk) { elNome.focus(); return; }
    if (!telOk) { elTelefone.focus(); return; }

    var codigo = codigoPais();
    var digitos = soDigitos(elTelefone.value);
    var dados = {
      acao: 'solicitar',
      modo: estado.modo,
      opcoes: estado.escolhidos.slice(),
      nome: elNome.value.trim(),
      telefone: '+' + codigo + digitos,
      telefoneExibicao: '+' + codigo + ' ' + (codigo === '55' ? mascaraBrasil(digitos) : digitos)
    };

    estado.enviando = true;
    elEnviar.setAttribute('aria-busy', 'true');
    elEnviar.querySelector('span').textContent = 'Enviando...';

    enviar(dados).then(function (resp) {
      if (resp && resp.ok) {
        var resumo = $('ok-resumo');
        resumo.innerHTML = '';
        var titulo = document.createElement('p');
        titulo.className = 'ok-formato';
        titulo.textContent = 'Consulta ' + formatoTexto() + ' · suas opções:';
        var ol = document.createElement('ol');
        ol.className = 'ok-opcoes';
        estado.escolhidos.forEach(function (o, i) {
          var li = document.createElement('li');
          var n = document.createElement('strong');
          n.textContent = (i + 1) + 'ª';
          li.appendChild(n);
          li.appendChild(document.createTextNode(' ' + dataPorExtenso(o.data) + ', às ' + o.horario));
          ol.appendChild(li);
        });
        var aviso = document.createElement('p');
        aviso.textContent = 'Em breve você recebe uma mensagem no ' + dados.telefoneExibicao + ' confirmando qual horário está disponível.';
        resumo.appendChild(titulo);
        resumo.appendChild(ol);
        resumo.appendChild(aviso);
        if (estado.modo === 'presencial' && CONFIG.mapsUrl) {
          var local = document.createElement('p');
          local.className = 'ok-local';
          local.appendChild(document.createTextNode('Local: ' + (CONFIG.endereco || 'Espaço Vida, Araraquara/SP') + '. '));
          var mapa = document.createElement('a');
          mapa.href = CONFIG.mapsUrl;
          mapa.target = '_blank';
          mapa.rel = 'noopener';
          mapa.textContent = 'Ver como chegar';
          local.appendChild(mapa);
          resumo.appendChild(local);
        }
        var msg = 'Oi, Franciane! Meu nome é ' + dados.nome + '. Acabei de pedir pelo site uma consulta ' + formatoTexto() + ' com estas sugestões de horário:\n' + listaOpcoes('\n');
        $('ok-whats').href = 'https://wa.me/' + (CONFIG.whatsapp || '') + '?text=' + encodeURIComponent(msg);
        irPara(3);
        form.querySelector('[data-etapa="3"]').focus();
        estado.dias[estado.modo] = null;
        return;
      }
      if (resp && resp.erro === 'ocupado') {
        var fora = (resp.indisponiveis || []).map(function (o) { return o.data + ' ' + o.horario; });
        estado.escolhidos = estado.escolhidos.filter(function (o) { return fora.indexOf(o.data + ' ' + o.horario) === -1; });
        alert('Um dos horários escolhidos acabou de ser fechado. Tirei ele da sua lista: confira e, se quiser, escolha outro.');
        irPara(1);
        desenharEscolhidos();
        atualizarHorarios(true);
        return;
      }
      throw new Error((resp && resp.erro) || 'falha');
    }).catch(function () {
      erro(elTelefone, 'erro-telefone', 'Não consegui enviar agora. Tente de novo ou chame no WhatsApp.');
    }).then(function () {
      estado.enviando = false;
      elEnviar.removeAttribute('aria-busy');
      elEnviar.querySelector('span').textContent = 'Enviar minhas sugestões';
    });
  });

  // ---------- Início ----------
  elNota.textContent = (CONFIG.notas || {}).presencial || '';
  desenharEscolhidos();
  atualizarHorarios();
})();
