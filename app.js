(function () {
  'use strict';

  var CONFIG = window.SITE_CONFIG || {};
  var DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DDDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99];

  var estado = { modo: 'presencial', dias: { presencial: null, online: null }, diaIdx: 0, horario: null, enviando: false };

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

  // ---------- Datas ----------
  function paraISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function deISO(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
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

  function desenharDias(dias) {
    elDias.innerHTML = '';
    dias.forEach(function (dia, i) {
      var d = deISO(dia.data);
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === estado.diaIdx));
      b.setAttribute('aria-label', dataPorExtenso(dia.data));
      b.innerHTML = '<span>' + DIAS_CURTOS[d.getDay()] + '</span><strong>' + d.getDate() + '</strong>';
      b.addEventListener('click', function () {
        estado.diaIdx = i;
        estado.horario = null;
        desenharDias(dias);
        desenharHorarios(dia);
        atualizarBotao();
      });
      elDias.appendChild(b);
    });
  }

  function desenharHorarios(dia) {
    elHorarios.innerHTML = '';
    dia.horarios.forEach(function (h) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(h === estado.horario));
      b.textContent = h;
      b.addEventListener('click', function () {
        estado.horario = h;
        desenharHorarios(dia);
        atualizarBotao();
      });
      elHorarios.appendChild(b);
    });
  }

  function diaAtual() {
    var dias = estado.dias[estado.modo] || [];
    return dias[estado.diaIdx];
  }

  function atualizarBotao() {
    var dia = diaAtual();
    if (dia && estado.horario) {
      var d = deISO(dia.data);
      elContinuar.disabled = false;
      elContinuarTexto.textContent = 'Continuar com ' + DIAS_CURTOS[d.getDay()].toLowerCase() + ' ' + d.getDate() + ' às ' + estado.horario;
    } else {
      elContinuar.disabled = true;
      elContinuarTexto.textContent = 'Escolha um horário';
    }
  }

  // ---------- Etapas ----------
  function irPara(n) {
    etapas.forEach(function (el) { el.hidden = el.getAttribute('data-etapa') !== String(n); });
  }

  function textoResumo() {
    var dia = diaAtual();
    var formato = estado.modo === 'online' ? 'Consulta online' : 'Consulta presencial';
    return formato + ' · ' + dataPorExtenso(dia.data) + ' · ' + estado.horario;
  }

  // ---------- Formato ----------
  form.querySelectorAll('.formato button').forEach(function (b) {
    b.addEventListener('click', function () {
      var modo = b.getAttribute('data-modo');
      if (modo === estado.modo) return;
      estado.modo = modo;
      estado.diaIdx = 0;
      estado.horario = null;
      form.querySelectorAll('.formato button').forEach(function (o) {
        o.setAttribute('aria-checked', String(o === b));
      });
      elNota.textContent = (CONFIG.notas || {})[modo] || '';
      atualizarHorarios();
    });
  });

  elContinuar.addEventListener('click', function () {
    if (elContinuar.disabled) return;
    $('resumo').innerHTML = '<strong>' + textoResumo() + '</strong>';
    irPara(2);
    elNome.focus();
  });

  $('voltar').addEventListener('click', function () {
    irPara(1);
    elContinuar.focus();
  });

  $('nova').addEventListener('click', function () {
    estado.horario = null;
    form.reset();
    elCodigoOutro.hidden = true;
    limparErros();
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

    var dia = diaAtual();
    var codigo = codigoPais();
    var digitos = soDigitos(elTelefone.value);
    var dados = {
      acao: 'solicitar',
      modo: estado.modo,
      data: dia.data,
      horario: estado.horario,
      nome: elNome.value.trim(),
      telefone: '+' + codigo + digitos,
      telefoneExibicao: '+' + codigo + ' ' + (codigo === '55' ? mascaraBrasil(digitos) : digitos)
    };

    estado.enviando = true;
    elEnviar.setAttribute('aria-busy', 'true');
    elEnviar.querySelector('span').textContent = 'Enviando...';

    enviar(dados).then(function (resp) {
      if (resp && resp.ok) {
        $('ok-resumo').textContent = textoResumo() + '. Em breve você recebe uma mensagem no ' + dados.telefoneExibicao + '.';
        var msg = 'Oi, Franciane! Meu nome é ' + dados.nome + '. Acabei de solicitar pelo site uma consulta ' + (estado.modo === 'online' ? 'online' : 'presencial') + ' para ' + dataPorExtenso(dia.data) + ', às ' + estado.horario + '.';
        $('ok-whats').href = 'https://wa.me/' + (CONFIG.whatsapp || '') + '?text=' + encodeURIComponent(msg);
        irPara(3);
        form.querySelector('[data-etapa="3"]').focus();
        estado.dias[estado.modo] = null;
        return;
      }
      if (resp && resp.erro === 'ocupado') {
        alert('Esse horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.');
        estado.horario = null;
        irPara(1);
        atualizarHorarios(true);
        return;
      }
      throw new Error((resp && resp.erro) || 'falha');
    }).catch(function () {
      erro(elTelefone, 'erro-telefone', 'Não consegui enviar agora. Tente de novo ou chame no WhatsApp.');
    }).then(function () {
      estado.enviando = false;
      elEnviar.removeAttribute('aria-busy');
      elEnviar.querySelector('span').textContent = 'Solicitar este horário';
    });
  });

  // ---------- Início ----------
  elNota.textContent = (CONFIG.notas || {}).presencial || '';
  atualizarHorarios();
})();
