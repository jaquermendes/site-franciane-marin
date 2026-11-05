(function () {
  'use strict';

  var CONFIG = window.SITE_CONFIG || {};
  var URL_API = CONFIG.agendaUrl;
  var DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

  var estado = { token: null, painel: null, modo: 'presencial', modoSemana: 'presencial', diaIdx: 0, semana: null };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Utilidades ----------
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = attrs[k];
      else if (k === 'classe') n.className = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return n;
  }
  function deISO(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dataLonga(iso) { var d = deISO(iso); return DIAS_LONGOS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function dataCurta(iso) { var d = deISO(iso); return DIAS_CURTOS[d.getDay()].toLowerCase() + ', ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function horaValida(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(h); }
  function guardar(chave, valor) { try { if (valor) sessionStorage.setItem(chave, valor); else sessionStorage.removeItem(chave); } catch (e) { /* sem armazenamento */ } }
  function ler(chave) { try { return sessionStorage.getItem(chave); } catch (e) { return null; } }

  function avisar(texto, ok) {
    var a = $('aviso');
    a.textContent = texto || '';
    a.hidden = !texto;
    a.classList.toggle('ok', !!ok);
    if (texto && ok) setTimeout(function () { if (a.textContent === texto) a.hidden = true; }, 2500);
  }

  function chamar(acao, dados) {
    var corpo = Object.assign({ acao: acao, token: estado.token }, dados || {});
    return fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (resp && resp.erro === 'sessao') { sair(true); throw new Error('sessao'); }
        return resp;
      });
  }

  // ---------- Login ----------
  $('ver-senha').addEventListener('click', function () {
    var campo = $('senha');
    var mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    this.setAttribute('aria-pressed', String(mostrar));
    this.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
    campo.focus();
  });

  $('form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var usuario = $('usuario').value.trim();
    var senha = $('senha').value;
    if (!usuario || !senha) { $('erro-login').textContent = 'Preencha usuário e senha.'; return; }
    if (!URL_API) { $('erro-login').textContent = 'A agenda ainda não foi ligada (veja o LEIA-ME).'; return; }
    $('entrar').disabled = true;
    $('entrar').textContent = 'Entrando...';
    chamar('login', { usuario: usuario, senha: senha }).then(function (resp) {
      if (!resp.ok) { $('erro-login').textContent = 'Usuário ou senha incorretos.'; return; }
      estado.token = resp.token;
      guardar('fm_token', resp.token);
      $('senha').value = '';
      $('senha').type = 'password';
      $('ver-senha').setAttribute('aria-pressed', 'false');
      $('erro-login').textContent = '';
      abrirPainel();
    }).catch(function () {
      $('erro-login').textContent = 'Não consegui conectar. Tente de novo.';
    }).then(function () {
      $('entrar').disabled = false;
      $('entrar').textContent = 'Entrar';
    });
  });

  function sair(expirou) {
    if (estado.token && !expirou) chamar('sair').catch(function () {});
    estado.token = null;
    estado.painel = null;
    guardar('fm_token', null);
    $('tela-painel').hidden = true;
    $('tela-login').hidden = false;
    if (expirou) $('erro-login').textContent = 'Sua sessão expirou. Entre de novo.';
    $('usuario').focus();
  }
  $('sair').addEventListener('click', function () { sair(false); });

  function abrirPainel() {
    $('tela-login').hidden = true;
    $('tela-painel').hidden = false;
    recarregar();
  }

  function recarregar() {
    return chamar('painel').then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro);
      estado.painel = resp;
      estado.semana = JSON.parse(JSON.stringify(resp.semana));
      desenharTudo();
    }).catch(function (e) {
      if (e.message !== 'sessao') avisar('Não consegui carregar o painel. Recarregue a página.');
    });
  }

  function desenharTudo() {
    desenharDias();
    desenharDetalhe();
    desenharSemana();
    desenharSolicitacoes();
    desenharAgenda();
  }

  // ---------- Abas ----------
  var abas = { dias: $('tab-dias'), semana: $('tab-semana'), solicitacoes: $('tab-solicitacoes'), agenda: $('tab-agenda') };
  Object.keys(abas).forEach(function (nome) {
    abas[nome].addEventListener('click', function () {
      Object.keys(abas).forEach(function (o) {
        abas[o].setAttribute('aria-selected', String(o === nome));
        $('aba-' + o).hidden = o !== nome;
      });
      avisar('');
    });
  });

  // ---------- Agenda geral ----------
  var DIAS_AGENDA = 14;
  var MODOS_AGENDA = ['presencial', 'online'];

  function reservasDoDia(iso) {
    return (estado.painel.solicitacoes || []).filter(function (s) {
      return s.data === iso && (s.status === 'confirmada' || s.status === 'aguardando');
    }).sort(function (a, b) { return a.horario.localeCompare(b.horario); });
  }

  function livresDoDia(dia, modo) {
    var ocupados = reservasDoDia(dia.data).map(function (s) { return s.horario; });
    return dia[modo].atual.filter(function (h) { return ocupados.indexOf(h) === -1; });
  }

  // Um dia por vez, como a agenda de papel: cada horário é uma linha.
  // Linha ocupada mostra a paciente; linha livre já deixa marcar ali mesmo.
  estado.agendaIdx = 0;
  estado.rapido = null; // { data, horario, modo } da linha livre aberta para marcar
  // "dia": só os compromissos, para bater o olho; "horarios": a grade para marcar e tirar horários.
  estado.vistaAgenda = 'dia';
  estado.agAberto = null; // consulta com o "Mais" aberto no Meu dia

  function somarMin(h, min) {
    var t = +h.slice(0, 2) * 60 + +h.slice(3) + min;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  function faltaTexto(de, ate) {
    var m = (+ate.slice(0, 2) * 60 + +ate.slice(3)) - (+de.slice(0, 2) * 60 + +de.slice(3));
    if (m < 60) return 'em ' + m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return 'em ' + h + 'h' + (r ? String(r).padStart(2, '0') : '');
  }

  function cartaoProximo(s, agora) {
    var fim = somarMin(s.horario, estado.painel.duracaoMin || 60);
    var acontecendo = s.horario <= agora && agora < fim;
    return el('div', { classe: 'adm-ag-proximo' + (s.status === 'aguardando' ? ' aguardando' : '') }, [
      el('p', { classe: 'adm-ag-proximo-rotulo', texto: acontecendo ? 'Agora, até ' + fim : 'Próxima consulta · ' + faltaTexto(agora, s.horario) }),
      el('div', { classe: 'adm-ag-proximo-linha' }, [
        el('strong', { classe: 'adm-ag-proximo-hora', texto: s.horario }),
        el('div', { classe: 'adm-ag-quem' }, [
          el('strong', { texto: s.nome }),
          el('span', { texto: (s.modo === 'online' ? 'Online, por vídeo' : 'Presencial, no consultório') + (s.status === 'aguardando' ? ' · ainda não confirmou' : '') })
        ]),
        el('div', { classe: 'adm-ag-acoes' }, botoesReserva(s))
      ]),
      estado.agAberto === s.id ? el('div', { classe: 'adm-ag-proximo-detalhe' }, [cartaoConfirmada(s)]) : null
    ]);
  }

  function listaDoDia(reservas, bloqueados, eHoje, agora) {
    var duracao = estado.painel.duracaoMin || 60;
    var itens = reservas.map(function (s) { return { h: s.horario, reserva: s }; })
      .concat(bloqueados.map(function (h) { return { h: h }; }))
      .sort(function (a, b) { return a.h.localeCompare(b.h); });
    var proxima = eHoje ? reservas.filter(function (s) { return somarMin(s.horario, duracao) > agora; })[0] : null;
    var lista = el('ul', { classe: 'adm-ag-lista adm-ag-meudia' });
    itens.forEach(function (it) {
      var passou = eHoje && somarMin(it.h, duracao) <= agora;
      if (!it.reserva) {
        lista.appendChild(el('li', { classe: 'adm-ag-linha bloqueada' + (passou ? ' passou' : '') }, [
          el('strong', { classe: 'adm-ag-hora', texto: it.h }),
          el('span', { classe: 'adm-ag-livre', texto: 'Ocupado' })
        ]));
        return;
      }
      if (proxima && it.reserva === proxima) return;
      var linha = linhaReserva(it.reserva, true);
      if (passou) linha.classList.add('passou');
      lista.appendChild(linha);
      if (estado.agAberto === it.reserva.id) lista.appendChild(detalheReserva(it.reserva));
    });
    var partes = [];
    if (proxima) partes.push(cartaoProximo(proxima, agora));
    if (lista.children.length) partes.push(lista);
    if (!itens.length) {
      partes.push(el('div', { classe: 'adm-ag-vazio-dia' }, [
        el('p', { texto: 'Nenhum compromisso neste dia.' }),
        el('button', { type: 'button', classe: 'botao', texto: 'Ver horários livres', onclick: function () { estado.vistaAgenda = 'horarios'; desenharAgenda(); } })
      ]));
    } else if (eHoje && reservas.length && !proxima) {
      partes.push(el('p', { classe: 'adm-ag-fim', texto: 'As consultas de hoje já terminaram.' }));
    }
    return partes;
  }

  function horaAgora() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function rotuloDia(iso, i) {
    if (i === 0 && iso === hojeAgenda()) return 'Hoje';
    if (i === 1) return 'Amanhã';
    return DIAS_CURTOS[deISO(iso).getDay()];
  }

  function mascaraTelefone(valor) {
    if (/^\s*\+/.test(valor)) return valor;
    var d = valor.replace(/\D/g, '').slice(0, 11);
    return d.length <= 2 ? (d ? '(' + d : '') : '(' + d.slice(0, 2) + ') ' + (d.length <= 10 ? d.slice(2, 6) + (d.length > 6 ? '-' + d.slice(6) : '') : d.slice(2, 7) + '-' + d.slice(7));
  }

  // Hoje ou amanhã: os dias em que faz sentido mandar lembrete.
  function quandoLembrete(s) {
    var hoje = hojeAgenda();
    if (s.data === hoje) return 'hoje';
    var d = deISO(hoje); d.setDate(d.getDate() + 1);
    var amanha = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return s.data === amanha ? 'amanha' : null;
  }

  function botoesReserva(s) {
    var zap = String(s.telefone || '').replace(/\D/g, '');
    if (!zap) return [];
    if (s.status !== 'confirmada') {
      return [
        el('a', { classe: 'adm-ag-zap', href: 'https://wa.me/' + zap, target: '_blank', rel: 'noopener', texto: 'WhatsApp' }),
        el('button', { type: 'button', classe: 'adm-ag-botao', texto: 'Paciente confirmou', onclick: function () { mudarStatus(s, 'confirmada', null, 'Consulta confirmada.'); } })
      ];
    }
    var quando = quandoLembrete(s);
    var enviado = lembretesEnviados()[s.id];
    var botoes = [];
    if (quando) {
      var lembrete = el('a', {
        classe: 'adm-ag-zap' + (enviado ? ' enviado' : ''), href: linkWhatsapp(s, textoLembrete(s, quando)), target: '_blank', rel: 'noopener',
        texto: enviado ? '✓ Lembrete enviado' : 'Enviar lembrete'
      });
      lembrete.addEventListener('click', function () { marcarLembrete(s.id); setTimeout(desenharAgenda, 300); });
      botoes.push(lembrete);
    } else {
      botoes.push(el('a', { classe: 'adm-ag-zap', href: 'https://wa.me/' + zap, target: '_blank', rel: 'noopener', texto: 'WhatsApp' }));
    }
    var aberto = estado.agAberto === s.id;
    botoes.push(el('button', {
      type: 'button', classe: 'adm-ag-botao', 'aria-expanded': String(aberto), texto: aberto ? 'Fechar' : 'Mais',
      onclick: function () { estado.agAberto = aberto ? null : s.id; desenharAgenda(); }
    }));
    return botoes;
  }

  function linhaReserva(s, comAcoes) {
    var zap = String(s.telefone || '').replace(/\D/g, '');
    return el('li', { classe: 'adm-ag-linha ocupada ' + s.status }, [
      el('strong', { classe: 'adm-ag-hora', texto: s.horario }),
      el('div', { classe: 'adm-ag-quem' }, [
        el('strong', { texto: s.nome }),
        el('span', { texto: formatoDe(s) + ' · ' + (s.status === 'confirmada' ? 'Confirmada' : 'Aguardando resposta') })
      ]),
      comAcoes
        ? el('div', { classe: 'adm-ag-acoes' }, botoesReserva(s))
        : (zap ? el('a', { classe: 'adm-ag-zap', href: 'https://wa.me/' + zap, target: '_blank', rel: 'noopener', texto: 'WhatsApp' }) : null)
    ]);
  }

  // Detalhe da consulta aberto pelo "Mais": a mesma confirmação de antes, remarcar e cancelar.
  function detalheReserva(s) {
    return el('li', { classe: 'adm-ag-detalhe' }, [cartaoConfirmada(s)]);
  }

  function formRapido(dia, h, modo) {
    var nome = el('input', { 'aria-label': 'Nome da paciente', placeholder: 'Nome', autocomplete: 'off' });
    var tel = el('input', { 'aria-label': 'WhatsApp com DDD', placeholder: 'WhatsApp com DDD', type: 'tel', inputmode: 'tel' });
    var erro = el('p', { classe: 'adm-erro', 'aria-live': 'polite' });
    var salvar = el('button', { type: 'submit', classe: 'botao botao-rosa', texto: 'Marcar ' + h });
    tel.addEventListener('input', function () { tel.value = mascaraTelefone(tel.value); });
    var form = el('form', { classe: 'adm-ag-rapido', novalidate: 'novalidate' }, [
      el('p', { classe: 'adm-ag-rapido-titulo', texto: dataCurta(dia.data) + ' às ' + h + ' · ' + (modo === 'online' ? 'Online' : 'Presencial') }),
      el('div', { classe: 'adm-ag-rapido-campos' }, [nome, tel]),
      erro,
      el('div', { classe: 'adm-ag-rapido-acoes' }, [
        salvar,
        el('button', { type: 'button', classe: 'botao', texto: 'Cancelar', onclick: function () { estado.rapido = null; desenharAgenda(); } })
      ])
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var internacional = /^\s*\+/.test(tel.value);
      var digitos = tel.value.replace(/\D/g, '');
      var completo = internacional ? digitos : '55' + digitos;
      if (nome.value.trim().length < 2) { erro.textContent = 'Informe o nome.'; nome.focus(); return; }
      if (internacional ? digitos.length < 8 : digitos.length < 10) { erro.textContent = 'Informe o WhatsApp com DDD.'; tel.focus(); return; }
      salvar.disabled = true;
      chamar('manual', {
        nome: nome.value.trim(), modo: modo, data: dia.data, horario: h,
        telefone: '+' + completo, telefoneExibicao: internacional ? tel.value.trim() : '+55 ' + tel.value
      }).then(function (resp) {
        if (resp.erro === 'conflito') { erro.textContent = 'Esse horário acabou de ser reservado para ' + resp.com + '.'; return; }
        if (!resp.ok) throw new Error(resp.erro);
        estado.rapido = null;
        avisar('Marcado. Envie a confirmação em Solicitações online > "Aguardando resposta".', true);
        return recarregar();
      }).catch(function (e) {
        if (e.message !== 'sessao') erro.textContent = 'Não consegui salvar. Tente de novo.';
      }).then(function () { salvar.disabled = false; });
    });
    setTimeout(function () { nome.focus(); }, 0);
    return el('li', { classe: 'adm-ag-linha-form' }, [form]);
  }

  // Ocupado/Liberar mexem só neste dia (exceção); a semana padrão não muda.
  function trocarBloqueio(dia, h, bloquear) {
    var mudancas = [];
    MODOS_AGENDA.forEach(function (modo) {
      var info = dia[modo];
      var tem = info.atual.indexOf(h) > -1;
      var nova;
      if (bloquear && tem) nova = info.atual.filter(function (x) { return x !== h; });
      else if (!bloquear && !tem && info.padrao.indexOf(h) > -1) nova = info.atual.concat([h]).sort();
      else return;
      var igualPadrao = nova.join() === info.padrao.join();
      mudancas.push({ info: info, modo: modo, anterior: { atual: info.atual, personalizado: info.personalizado }, horarios: igualPadrao ? null : nova });
      info.atual = nova;
      info.personalizado = !igualPadrao;
    });
    if (!mudancas.length) return;
    estado.rapido = null;
    desenharAgenda();
    mudancas.reduce(function (p, m) {
      return p.then(function () {
        return chamar('salvarDia', { data: dia.data, modo: m.modo, horarios: m.horarios }).then(function (resp) {
          if (!resp.ok) throw new Error(resp.erro);
        });
      });
    }, Promise.resolve()).then(function () {
      avisar(bloquear ? h + ' ficou ocupado só neste dia.' : h + ' voltou a ficar livre.', true);
    }).catch(function (e) {
      if (e.message === 'sessao') return;
      mudancas.forEach(function (m) { m.info.atual = m.anterior.atual; m.info.personalizado = m.anterior.personalizado; });
      desenharAgenda();
      avisar('Não consegui salvar. Tente de novo.');
    });
  }

  function desenharAgenda() {
    var caixa = $('agenda-geral');
    caixa.innerHTML = '';
    var dias = estado.painel.dias.slice(0, DIAS_AGENDA);
    if (estado.agendaIdx >= dias.length) estado.agendaIdx = 0;

    var tira = el('div', { classe: 'adm-ag-dias', role: 'tablist', 'aria-label': 'Escolha o dia' });
    dias.forEach(function (dia, i) {
      var n = reservasDoDia(dia.data).length;
      tira.appendChild(el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(i === estado.agendaIdx), classe: 'adm-ag-dia',
        onclick: function () { estado.agendaIdx = i; estado.rapido = null; desenharAgenda(); }
      }, [
        el('span', { classe: 'adm-ag-dia-nome', texto: rotuloDia(dia.data, i) }),
        el('strong', { texto: String(deISO(dia.data).getDate()) }),
        el('span', { classe: 'adm-ag-dia-conta' + (n ? ' tem' : ''), texto: n ? n + (n > 1 ? ' consultas' : ' consulta') : 'livre' })
      ]));
    });

    var dia = dias[estado.agendaIdx];
    var reservas = reservasDoDia(dia.data);
    var eHoje = dia.data === hojeAgenda();
    var agora = horaAgora();
    var mapa = {};
    reservas.forEach(function (s) { mapa[s.horario] = { reserva: s }; });
    MODOS_AGENDA.forEach(function (modo) {
      livresDoDia(dia, modo).forEach(function (h) {
        if (eHoje && h <= agora) return;
        if (mapa[h] && mapa[h].reserva) return;
        mapa[h] = mapa[h] || { modos: [] };
        mapa[h].modos.push(modo);
      });
    });
    var bloqueadosDia = [];
    MODOS_AGENDA.forEach(function (modo) {
      dia[modo].padrao.forEach(function (h) {
        var aberto = MODOS_AGENDA.some(function (m) { return dia[m].atual.indexOf(h) > -1; });
        if (!aberto && !(mapa[h] && mapa[h].reserva) && bloqueadosDia.indexOf(h) === -1) bloqueadosDia.push(h);
        if (mapa[h] || (eHoje && h <= agora)) return;
        var emAlgum = MODOS_AGENDA.some(function (m) { return dia[m].atual.indexOf(h) > -1; });
        if (!emAlgum) mapa[h] = { bloqueado: true };
      });
    });
    var horas = Object.keys(mapa).sort();
    var livres = horas.filter(function (h) { return !mapa[h].reserva && !mapa[h].bloqueado; }).length;

    var lista = el('ul', { classe: 'adm-ag-lista' });
    horas.forEach(function (h) {
      var item = mapa[h];
      if (item.reserva) { lista.appendChild(linhaReserva(item.reserva)); return; }
      if (item.bloqueado) {
        lista.appendChild(el('li', { classe: 'adm-ag-linha bloqueada' }, [
          el('strong', { classe: 'adm-ag-hora', texto: h }),
          el('span', { classe: 'adm-ag-livre', texto: 'Ocupado' }),
          el('div', { classe: 'adm-ag-marcar' }, [
            el('button', { type: 'button', classe: 'adm-ag-botao', texto: 'Liberar', onclick: function () { trocarBloqueio(dia, h, false); } })
          ])
        ]));
        return;
      }
      var aberto = estado.rapido && estado.rapido.data === dia.data && estado.rapido.horario === h;
      lista.appendChild(el('li', { classe: 'adm-ag-linha livre' + (aberto ? ' aberta' : '') }, [
        el('strong', { classe: 'adm-ag-hora', texto: h }),
        el('span', { classe: 'adm-ag-livre', texto: 'Livre' }),
        el('div', { classe: 'adm-ag-marcar' }, item.modos.map(function (modo) {
          var ativo = aberto && estado.rapido.modo === modo;
          return el('button', {
            type: 'button', classe: 'adm-ag-botao' + (ativo ? ' ativo' : ''),
            texto: '+ ' + (modo === 'online' ? 'Online' : 'Presencial'),
            onclick: function () { estado.rapido = { data: dia.data, horario: h, modo: modo }; desenharAgenda(); }
          });
        }).concat([
          el('button', { type: 'button', classe: 'adm-ag-botao adm-ag-bloquear', texto: 'Ocupado', title: 'Tira este horário só neste dia', onclick: function () { trocarBloqueio(dia, h, true); } })
        ]))
      ]));
      if (aberto) lista.appendChild(formRapido(dia, h, estado.rapido.modo));
    });
    if (!horas.length) {
      lista.appendChild(el('li', { classe: 'adm-ag-vazio', texto: eHoje ? 'Nada marcado e nenhum horário livre no resto de hoje.' : 'Nenhum horário aberto neste dia. Abra horários na aba "Horários disponíveis".' }));
    }

    var semConfirmar = reservas.filter(function (s) { return s.status !== 'confirmada'; }).length;
    var resumo = (reservas.length ? reservas.length + (reservas.length > 1 ? ' consultas' : ' consulta') : 'Nenhuma consulta') +
      (semConfirmar ? ' · ' + semConfirmar + ' sem confirmar' : '') +
      (bloqueadosDia.length ? ' · ' + bloqueadosDia.length + (bloqueadosDia.length > 1 ? ' ocupados' : ' ocupado') : '');
    var vista = el('div', { classe: 'adm-ag-vista', role: 'tablist', 'aria-label': 'Como ver o dia' }, [
      ['dia', 'Meu dia'], ['horarios', 'Horários']
    ].map(function (v) {
      return el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(estado.vistaAgenda === v[0]), texto: v[1],
        onclick: function () { estado.vistaAgenda = v[0]; estado.rapido = null; desenharAgenda(); }
      });
    }));

    caixa.appendChild(tira);
    if (estado.vistaAgenda === 'dia') {
      caixa.appendChild(el('section', { classe: 'adm-cartao adm-ag-dia-cartao' }, [
        el('div', { classe: 'adm-ag-cabeca' }, [
          el('div', {}, [el('h3', { texto: dataLonga(dia.data) }), el('p', { texto: resumo })]),
          vista
        ])
      ].concat(listaDoDia(reservas, bloqueadosDia.sort(), eHoje, agora))));
      return;
    }
    caixa.appendChild(el('section', { classe: 'adm-cartao adm-ag-dia-cartao' }, [
      el('div', { classe: 'adm-ag-cabeca' }, [
        el('div', {}, [
          el('h3', { texto: dataLonga(dia.data) }),
          el('p', { texto: (reservas.length ? reservas.length + (reservas.length > 1 ? ' consultas' : ' consulta') : 'Nenhuma consulta') + ' · ' + livres + (livres === 1 ? ' horário livre' : ' horários livres') })
        ]),
        vista
      ]),
      el('button', { type: 'button', classe: 'botao adm-ag-outro', texto: '+ Marcar em outro horário', onclick: function () { abrirManual(dia.data); } }),
      lista
    ]));
  }

  // Formulário de atendimento manual.
  var formManual = $('form-manual');
  function abrirManual(iso) {
    formManual.hidden = false;
    $('m-data').value = iso || hojeAgenda();
    $('m-erro').textContent = '';
    atualizarLivresManual();
    formManual.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('m-nome').focus();
  }
  function hojeAgenda() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function atualizarLivresManual() {
    var caixa = $('m-livres');
    caixa.innerHTML = '';
    var dia = (estado.painel.dias || []).filter(function (d) { return d.data === $('m-data').value; })[0];
    if (!dia) return;
    var livres = livresDoDia(dia, $('m-modo').value);
    if (!livres.length) { caixa.appendChild(el('span', { classe: 'adm-vazio', texto: 'Sem horários livres da agenda neste dia. Você pode digitar outro horário.' })); return; }
    caixa.appendChild(el('span', { classe: 'adm-manual-rotulo', texto: 'Livres neste dia:' }));
    livres.forEach(function (h) {
      caixa.appendChild(el('button', { type: 'button', classe: 'adm-chip-hora' + ($('m-hora').value === h ? ' ativo' : ''), texto: h, onclick: function () { $('m-hora').value = h; atualizarLivresManual(); } }));
    });
  }
  $('m-cancelar').addEventListener('click', function () { formManual.hidden = true; formManual.reset(); });
  $('m-data').addEventListener('change', atualizarLivresManual);
  $('m-modo').addEventListener('change', atualizarLivresManual);
  $('m-hora').addEventListener('input', atualizarLivresManual);
  $('m-pais').addEventListener('change', function () { $('m-codigo').hidden = $('m-pais').value !== 'outro'; });
  $('m-telefone').addEventListener('input', function () {
    if ($('m-pais').value !== '55') return;
    var d = $('m-telefone').value.replace(/\D/g, '').slice(0, 11);
    var t = d.length <= 2 ? (d ? '(' + d : '') : '(' + d.slice(0, 2) + ') ' + (d.length <= 10 ? d.slice(2, 6) + (d.length > 6 ? '-' + d.slice(6) : '') : d.slice(2, 7) + '-' + d.slice(7));
    $('m-telefone').value = t;
  });

  formManual.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = $('m-nome').value.trim();
    var codigo = $('m-pais').value === 'outro' ? $('m-codigo').value.replace(/\D/g, '') : $('m-pais').value;
    var digitos = $('m-telefone').value.replace(/\D/g, '');
    var erro = '';
    if (nome.length < 2) erro = 'Informe o nome.';
    else if (!codigo || (codigo === '55' ? digitos.length < 10 : digitos.length < 6)) erro = 'Informe o WhatsApp com DDD.';
    else if (!$('m-data').value) erro = 'Escolha o dia.';
    else if (!horaValida($('m-hora').value)) erro = 'Escolha o horário.';
    $('m-erro').textContent = erro;
    if (erro) return;
    var botao = $('m-salvar');
    botao.disabled = true;
    chamar('manual', {
      nome: nome, modo: $('m-modo').value, data: $('m-data').value, horario: $('m-hora').value,
      telefone: '+' + codigo + digitos, telefoneExibicao: '+' + codigo + ' ' + $('m-telefone').value
    }).then(function (resp) {
      if (resp.erro === 'conflito') { $('m-erro').textContent = 'Esse horário já está reservado para ' + resp.com + '.'; return; }
      if (!resp.ok) throw new Error(resp.erro);
      formManual.hidden = true;
      formManual.reset();
      avisar('Atendimento salvo. Ele está em Solicitações online > "Aguardando resposta" para você enviar a confirmação no WhatsApp.', true);
      return recarregar();
    }).catch(function (e) {
      if (e.message !== 'sessao') $('m-erro').textContent = 'Não consegui salvar. Tente de novo.';
    }).then(function () { botao.disabled = false; });
  });

  // ---------- Horários por dia ----------
  document.querySelectorAll('[data-modo]').forEach(function (b) {
    b.addEventListener('click', function () {
      estado.modo = b.getAttribute('data-modo');
      document.querySelectorAll('[data-modo]').forEach(function (o) { o.setAttribute('aria-checked', String(o === b)); });
      desenharDias();
      desenharDetalhe();
    });
  });

  function ocupadosDoDia(iso) {
    return (estado.painel.solicitacoes || []).filter(function (s) { return s.data === iso && (s.status === 'confirmada' || s.status === 'aguardando'); });
  }

  // Quem sugeriu cada horário do dia (só solicitações ainda não confirmadas).
  function sugestoesDoDia(iso) {
    var mapa = {};
    (estado.painel.solicitacoes || []).forEach(function (s) {
      if (s.status !== 'nova') return;
      s.opcoes.forEach(function (o) {
        if (o.data !== iso || s.modo !== estado.modo) return;
        (mapa[o.horario] = mapa[o.horario] || []).push(s.nome.split(' ')[0]);
      });
    });
    return mapa;
  }

  function desenharDias() {
    var caixa = $('lista-dias');
    caixa.innerHTML = '';
    estado.painel.dias.forEach(function (dia, i) {
      var info = dia[estado.modo];
      var d = deISO(dia.data);
      var resumo = info.atual.length ? info.atual.length + ' horário' + (info.atual.length > 1 ? 's' : '') : 'fechado';
      var classes = (info.atual.length ? '' : 'fechado') + (info.personalizado ? ' proprio' : '');
      caixa.appendChild(el('button', {
        type: 'button', role: 'radio', classe: classes.trim(), 'aria-checked': String(i === estado.diaIdx),
        'aria-label': dataLonga(dia.data) + ', ' + resumo,
        onclick: function () { estado.diaIdx = i; desenharDias(); desenharDetalhe(); }
      }, [el('span', { texto: DIAS_CURTOS[d.getDay()] }), el('strong', { texto: String(d.getDate()) }), el('small', { texto: resumo })]));
    });
  }

  function desenharDetalhe() {
    var caixa = $('detalhe-dia');
    caixa.innerHTML = '';
    var dia = estado.painel.dias[estado.diaIdx];
    var info = dia[estado.modo];
    var formato = estado.modo === 'online' ? 'Online' : 'Presencial';
    var ocupados = ocupadosDoDia(dia.data);
    var sugestoes = sugestoesDoDia(dia.data);
    var mapaOcupado = {};
    ocupados.forEach(function (s) { mapaOcupado[s.horario] = s; });

    var todos = {};
    info.padrao.concat(info.atual, Object.keys(mapaOcupado)).forEach(function (h) { todos[h] = true; });
    var lista = Object.keys(todos).sort();

    caixa.appendChild(el('div', { classe: 'adm-dia-cabeca' }, [
      el('h2', { texto: dataLonga(dia.data) + ' · ' + formato }),
      info.personalizado ? el('span', { classe: 'adm-selo', texto: 'Dia com horários próprios' }) : null
    ]));
    caixa.appendChild(el('p', { classe: 'adm-explica', texto: 'Toque num horário para liberar ou bloquear. Muda na hora no site.' }));

    var grade = el('div', { classe: 'adm-horarios' });
    if (!lista.length) grade.appendChild(el('p', { classe: 'adm-vazio', texto: 'Nenhum horário neste dia. Adicione um abaixo.' }));
    lista.forEach(function (h) {
      var s = mapaOcupado[h];
      if (s) {
        grade.appendChild(el('div', { classe: 'adm-horario ocupado', title: s.nome + ' · ' + s.modo }, [
          el('strong', { texto: h }), el('small', { texto: s.nome + (s.status === 'aguardando' ? ' · oferecido' : '') + (s.modo !== estado.modo ? ' (' + s.modo + ')' : '') })
        ]));
        return;
      }
      var livre = info.atual.indexOf(h) > -1;
      var quem = sugestoes[h];
      var legenda = (livre ? 'liberado' : 'bloqueado') + (quem ? ' · sugerido por ' + quem.join(', ') : '');
      grade.appendChild(el('button', {
        type: 'button', classe: 'adm-horario' + (quem ? ' sugerido' : ''), 'aria-pressed': String(livre),
        'aria-label': h + ', ' + legenda,
        onclick: function () {
          var nova = livre ? info.atual.filter(function (x) { return x !== h; }) : info.atual.concat([h]);
          salvarDia(dia, nova);
        }
      }, [el('strong', { texto: h }), el('small', { texto: legenda })]));
    });
    caixa.appendChild(grade);

    caixa.appendChild(el('div', { classe: 'adm-legenda' }, [
      el('span', { classe: 'l-livre', texto: 'Liberado no site' }),
      el('span', { classe: 'l-bloq', texto: 'Bloqueado' }),
      el('span', { classe: 'l-ocup', texto: 'Consulta confirmada' })
    ]));

    var entrada = el('input', { type: 'time', step: '900', 'aria-label': 'Novo horário' });
    var acoes = el('div', { classe: 'adm-acoes-dia' }, [
      el('div', { classe: 'adm-novo' }, [entrada, el('button', {
        type: 'button', classe: 'botao', texto: 'Adicionar horário',
        onclick: function () {
          var h = entrada.value;
          if (!horaValida(h)) { avisar('Escolha um horário para adicionar.'); entrada.focus(); return; }
          if (info.atual.indexOf(h) > -1) return;
          salvarDia(dia, info.atual.concat([h]));
        }
      })]),
      info.atual.length ? el('button', { type: 'button', classe: 'botao', texto: 'Fechar o dia', onclick: function () { salvarDia(dia, []); } }) : null,
      info.personalizado ? el('button', { type: 'button', classe: 'botao', texto: 'Voltar à semana padrão', onclick: function () { salvarDia(dia, null); } }) : null
    ]);
    caixa.appendChild(acoes);
  }

  function salvarDia(dia, horarios) {
    var info = dia[estado.modo];
    var anterior = { atual: info.atual, personalizado: info.personalizado };
    // Mostra na hora e desfaz se o servidor recusar.
    if (horarios === null) { info.atual = info.padrao.slice(); info.personalizado = false; }
    else { info.atual = horarios.slice().sort(); info.personalizado = true; }
    desenharDias();
    desenharDetalhe();
    chamar('salvarDia', { data: dia.data, modo: estado.modo, horarios: horarios }).then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro);
      avisar('Salvo.', true);
    }).catch(function (e) {
      if (e.message === 'sessao') return;
      info.atual = anterior.atual;
      info.personalizado = anterior.personalizado;
      desenharDias();
      desenharDetalhe();
      avisar('Não consegui salvar. Tente de novo.');
    });
  }

  // ---------- Semana padrão ----------
  document.querySelectorAll('[data-modo-semana]').forEach(function (b) {
    b.addEventListener('click', function () {
      estado.modoSemana = b.getAttribute('data-modo-semana');
      document.querySelectorAll('[data-modo-semana]').forEach(function (o) { o.setAttribute('aria-checked', String(o === b)); });
      desenharSemana();
    });
  });

  function desenharSemana() {
    var caixa = $('grade-semana');
    caixa.innerHTML = '';
    var grade = estado.semana[estado.modoSemana] = estado.semana[estado.modoSemana] || {};
    ORDEM_SEMANA.forEach(function (n) {
      var horas = (grade[n] || []).slice().sort();
      var chips = el('div', { classe: 'adm-chips' });
      if (!horas.length) chips.appendChild(el('span', { classe: 'adm-vazio', texto: 'Não atende' }));
      horas.forEach(function (h) {
        chips.appendChild(el('span', { classe: 'adm-chip' }, [h, el('button', {
          type: 'button', 'aria-label': 'Tirar ' + h + ' de ' + DIAS_LONGOS[n], texto: '×',
          onclick: function () { grade[n] = horas.filter(function (x) { return x !== h; }); marcarSemanaAlterada(); desenharSemana(); }
        })]));
      });
      var entrada = el('input', { type: 'time', step: '900', 'aria-label': 'Novo horário de ' + DIAS_LONGOS[n] });
      chips.appendChild(el('span', { classe: 'adm-novo' }, [entrada, el('button', {
        type: 'button', texto: 'Adicionar',
        onclick: function () {
          var h = entrada.value;
          if (!horaValida(h) || horas.indexOf(h) > -1) { entrada.focus(); return; }
          grade[n] = horas.concat([h]).sort();
          marcarSemanaAlterada();
          desenharSemana();
        }
      })]));
      caixa.appendChild(el('div', { classe: 'adm-semana-linha' }, [el('strong', { texto: DIAS_LONGOS[n] }), chips]));
    });
  }

  function marcarSemanaAlterada() { $('estado-semana').textContent = 'Alterações não salvas'; }

  $('salvar-semana').addEventListener('click', function () {
    var botao = $('salvar-semana');
    botao.disabled = true;
    $('estado-semana').textContent = 'Salvando...';
    chamar('salvarSemana', { semana: estado.semana }).then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro);
      $('estado-semana').textContent = 'Semana padrão salva.';
      return recarregar();
    }).catch(function (e) {
      if (e.message !== 'sessao') $('estado-semana').textContent = 'Não consegui salvar. Tente de novo.';
    }).then(function () { botao.disabled = false; });
  });

  // ---------- Solicitações ----------
  function textoOpcao(o) { return dataLonga(o.data).toLowerCase() + ', às ' + o.horario; }

  function comArtigo(o) {
    var dia = deISO(o.data).getDay();
    return (dia === 0 || dia === 6 ? 'no ' : 'na ') + textoOpcao(o);
  }

  function primeiroNome(s) { return String(s.nome).split(' ')[0]; }
  function formatoDe(s) { return s.modo === 'online' ? 'online' : 'presencial'; }

  // Mensagens editadas à mão e opção escolhida, por pedido, para não se perderem ao redesenhar.
  var rascunhos = {};
  var escolhas = {};

  function linkWhatsapp(s, texto) {
    return 'https://wa.me/' + String(s.telefone).replace(/\D/g, '') + '?text=' + encodeURIComponent(texto);
  }

  // Endereço com link do Maps para presencial; aviso simples para online.
  function textoLocal(s) {
    if (formatoDe(s) === 'online') return '💻 A consulta é online, por vídeo.';
    return '📍 Como chegar: ' + (CONFIG.endereco || 'Espaço Vida, Araraquara/SP') + (CONFIG.mapsUrl ? '\n' + CONFIG.mapsUrl : '');
  }

  function textoProposta(s, opcao) {
    return (estado.painel.mensagemProposta || estado.painel.mensagemWhatsapp || '')
      .replace(/\{nome\}/g, primeiroNome(s))
      .replace(/\{formato\}/g, formatoDe(s))
      .replace(/\{proposta\}/g, opcao ? comArtigo(opcao) : '')
      .replace(/\{local\}/g, textoLocal(s));
  }

  function textoConfirmacao(s) {
    return [
      'Olá, ' + primeiroNome(s) + '! 😊',
      '✅ Sua consulta ' + formatoDe(s) + ' está *confirmada ' + comArtigo(s) + '*.',
      textoLocal(s),
      '',
      'Se quiser, separei algumas dicas do que pode ajudar na consulta (nada é obrigatório, viu?):',
      'https://www.francianemarin.com.br/#preparo',
      '',
      'Qualquer dúvida, é só me chamar por aqui. Até lá!'
    ].join('\n');
  }

  function textoLembrete(s, quando) {
    var dia = quando === 'hoje' ? '*hoje, às ' + s.horario + '*' : '*amanhã, ' + dataLonga(s.data).toLowerCase() + ', às ' + s.horario + '*';
    return [
      'Olá, ' + primeiroNome(s) + '! 😊',
      '⏰ Passando para lembrar da sua consulta ' + formatoDe(s) + ' ' + dia + '.',
      textoLocal(s),
      '',
      'Se precisar remarcar, me avise por aqui. Até ' + (quando === 'hoje' ? 'já' : 'amanhã') + '!'
    ].join('\n');
  }

  // Lembretes já enviados ficam marcados neste aparelho (só para não mandar duas vezes).
  function lembretesEnviados() { try { return JSON.parse(localStorage.getItem('fm_lembretes') || '{}'); } catch (e) { return {}; } }
  function marcarLembrete(id) {
    try { var l = lembretesEnviados(); l[id] = Date.now(); localStorage.setItem('fm_lembretes', JSON.stringify(l)); } catch (e) { /* sem armazenamento */ }
  }

  function chegada(s) {
    var d = new Date(s.criadoEm);
    if (isNaN(d)) return '';
    return 'Chegou em ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') +
      ' às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  estado.solVista = 'andamento';

  function desenharSolicitacoes() {
    var caixa = $('lista-solicitacoes');
    caixa.innerHTML = '';
    var hoje = hojeISO();
    var porChegada = function (a, b) { return String(a.criadoEm).localeCompare(String(b.criadoEm)); };
    var todas = estado.painel.solicitacoes || [];
    var escolher = todas.filter(function (s) { return s.status === 'nova' && !s.resolvido; }).sort(porChegada);
    var aguardando = todas.filter(function (s) { return s.status === 'aguardando' && !s.resolvido; }).sort(porChegada);
    var canceladas = todas.filter(function (s) { return s.status === 'cancelada'; }).sort(porChegada).reverse();
    var historico = todas.filter(function (s) {
      return s.status !== 'cancelada' && ((s.resolvido && s.status !== 'confirmada') || (s.status === 'confirmada' && s.data < hoje));
    }).sort(porChegada).reverse();

    var pendentes = escolher.length + aguardando.length;
    $('contador-novas').textContent = String(pendentes);
    $('contador-novas').hidden = !pendentes;

    var vistas = [['andamento', 'Em andamento', pendentes], ['canceladas', 'Canceladas', canceladas.length], ['historico', 'Histórico', historico.length]];
    caixa.appendChild(el('div', { classe: 'adm-sol-vistas', role: 'tablist', 'aria-label': 'O que ver' }, vistas.map(function (v) {
      return el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(estado.solVista === v[0]),
        onclick: function () { estado.solVista = v[0]; desenharSolicitacoes(); }
      }, [v[1], el('span', { classe: 'adm-sol-vistas-num', texto: String(v[2]) })]);
    })));

    if (estado.solVista === 'canceladas') {
      caixa.appendChild(el('p', { classe: 'adm-explica', texto: 'Pedidos e consultas cancelados nos últimos 30 dias. Se a paciente quiser voltar, toque em Reativar e o pedido volta para "Escolher horário".' }));
      if (!canceladas.length) { caixa.appendChild(el('p', { classe: 'adm-vazio-linha', texto: 'Nenhum cancelamento nos últimos 30 dias.' })); return; }
      var ulc = el('ul', { classe: 'adm-cancel-lista' });
      canceladas.forEach(function (c) { ulc.appendChild(cartaoCancelada(c)); });
      caixa.appendChild(ulc);
      return;
    }
    if (estado.solVista === 'historico') {
      caixa.appendChild(el('p', { classe: 'adm-explica', texto: 'Consultas que já aconteceram e pedidos arquivados.' }));
      if (!historico.length) { caixa.appendChild(el('p', { classe: 'adm-vazio-linha', texto: 'Nada por aqui ainda.' })); return; }
      var ulh = el('ul', { classe: 'adm-linhas adm-hist-lista' });
      historico.forEach(function (h) { ulh.appendChild(cartaoHistorico(h)); });
      caixa.appendChild(ulh);
      return;
    }

    grupo(caixa, '1', 'Escolher horário', 'Abra o pedido, marque a melhor sugestão e envie a proposta.', escolher, cartaoEscolher, resumoEscolher, acaoEscolher);
    grupo(caixa, '2', 'Aguardando resposta', 'O horário oferecido fica reservado até a paciente responder.', aguardando, cartaoAguardando, resumoAguardando, acaoAguardando);
    caixa.appendChild(el('p', { classe: 'adm-vazio-linha', texto: 'Depois que a paciente confirma, a consulta sai daqui e fica na Agenda, onde você envia a confirmação, o lembrete, remarca ou cancela.' }));
  }

  // Cancelada: quem era, quando seria e como falar com ela; dá para reativar.
  function cartaoCancelada(c) {
    var zap = String(c.telefone || '').replace(/\D/g, '');
    var quando = isoValido(c.data)
      ? 'Era ' + dataCurta(c.data) + ' às ' + c.horario
      : 'Sugeriu ' + c.opcoes.map(function (o) { return dataCurta(o.data) + ' ' + o.horario; }).join(' · ');
    return el('li', { classe: 'adm-cancel' }, [
      el('div', { classe: 'adm-cancel-quem' }, [
        el('strong', { texto: c.nome }),
        el('span', { texto: formatoDe(c) + ' · ' + quando }),
        el('span', { classe: 'adm-cancel-chegada', texto: chegada(c) + (c.origem === 'painel' ? ' · marcado pelo painel' : ' · pelo site') })
      ]),
      el('div', { classe: 'adm-cancel-acoes' }, [
        zap ? el('a', { classe: 'adm-ag-zap', href: 'https://wa.me/' + zap, target: '_blank', rel: 'noopener', texto: 'WhatsApp' }) : null,
        el('button', { type: 'button', classe: 'adm-ag-botao', texto: 'Reativar', 'aria-label': 'Reativar o pedido de ' + c.nome, onclick: function () {
          if (c.resolvido) resolver(c, false);
          mudarStatus(c, 'nova', null, 'Pedido reativado. Ele voltou para "Escolher horário".');
          estado.solVista = 'andamento';
        } })
      ])
    ]);
  }

  // Pedidos abertos (expandidos) continuam abertos depois de recarregar a lista.
  var abertos = {};

  function grupo(caixa, numero, titulo, ajuda, lista, desenhar, resumo, acao) {
    caixa.appendChild(el('div', { classe: 'adm-etapa' }, [
      el('span', { classe: 'adm-etapa-num', texto: numero }),
      el('div', {}, [el('h2', { texto: titulo + ' (' + lista.length + ')' }), el('p', { texto: ajuda })])
    ]));
    if (!lista.length) { caixa.appendChild(el('p', { classe: 'adm-vazio-linha', texto: 'Nada por aqui.' })); return; }
    var ul = el('ul', { classe: 'adm-itens' });
    lista.forEach(function (s) {
      var item = el('details', { classe: 'adm-item' });
      var chaveAberto = s.id + ':' + s.status;
      if (abertos[chaveAberto]) item.setAttribute('open', '');
      var botaoAcao = acao(s, item);
      item.appendChild(el('summary', { classe: 'adm-item-linha' }, [
        el('span', { classe: 'adm-item-nome' }, [el('strong', { texto: s.nome }), el('small', { texto: formatoDe(s) })]),
        el('span', { classe: 'adm-item-resumo', texto: resumo(s) }),
        botaoAcao
      ]));
      item.appendChild(desenhar(s));
      // Botão Abrir/Fechar acompanha o estado do item.
      var alterna = item.querySelector('[data-alterna]');
      var atualizar = function () { if (alterna) alterna.textContent = item.open ? 'Fechar' : alterna.getAttribute('data-alterna'); };
      item.addEventListener('toggle', function () { abertos[chaveAberto] = item.open; atualizar(); });
      atualizar();
      ul.appendChild(el('li', {}, [item]));
    });
    caixa.appendChild(ul);
  }

  function resumoEscolher(s) {
    return s.opcoes.length + (s.opcoes.length > 1 ? ' sugestões' : ' sugestão') + ' · ' + s.opcoes.map(function (o) { return dataCurta(o.data) + ' ' + o.horario; }).join(' · ');
  }
  function resumoAguardando(s) { return 'Ofereceu ' + dataCurta(s.data) + ' às ' + s.horario; }

  // Botão da linha: não abre/fecha o item quando clicado, a não ser que seja a intenção.
  function botaoLinha(texto, classe, aoClicar) {
    return el('button', { type: 'button', classe: 'botao ' + classe, texto: texto, onclick: function (ev) { ev.preventDefault(); ev.stopPropagation(); aoClicar(); } });
  }
  function botaoAlterna(texto, classe, item) {
    var b = botaoLinha(texto, classe, function () { item.open = !item.open; });
    b.setAttribute('data-alterna', texto);
    return b;
  }
  function acaoEscolher(s, item) { return botaoAlterna('Escolher horário', 'botao-rosa', item); }
  function acaoAguardando(s, item) {
    return el('span', { classe: 'adm-item-botoes' }, [
      botaoAlterna('Abrir', 'botao-contorno', item),
      botaoLinha('Paciente confirmou', 'botao-rosa', function () { mudarStatus(s, 'confirmada', null, 'Consulta confirmada. Agora ela fica na Agenda.'); })
    ]);
  }

  function detalhesContato(s) {
    return el('p', { classe: 'adm-contato' }, [
      el('a', { href: 'https://wa.me/' + String(s.telefone).replace(/\D/g, ''), target: '_blank', rel: 'noopener', texto: s.telefoneExibicao || s.telefone }),
      ' · ' + chegada(s)
    ]);
  }

  function cabecalho(s) {
    return el('div', { classe: 'adm-sol-cabeca' }, [
      el('strong', { classe: 'adm-sol-nome', texto: s.nome }),
      el('span', { classe: 'adm-sol-quem', texto: (s.telefoneExibicao || s.telefone) + ' · ' + formatoDe(s) }),
      el('span', { classe: 'adm-chegada', texto: chegada(s) })
    ]);
  }

  // Caixa de mensagem editável + link do WhatsApp que acompanha o texto.
  function caixaMensagem(s, chave, padrao, rotuloBotao, aoClicar) {
    var texto = rascunhos[chave] || padrao;
    var botao = el('a', { classe: 'botao botao-whats', href: linkWhatsapp(s, texto), target: '_blank', rel: 'noopener', texto: rotuloBotao });
    if (aoClicar) botao.addEventListener('click', aoClicar);
    var idCampo = 'msg-' + chave.replace(/\W/g, '');
    var campo = el('textarea', { id: idCampo, classe: 'adm-msg-campo', rows: '6' });
    campo.value = texto;
    campo.addEventListener('input', function () {
      rascunhos[chave] = campo.value;
      botao.setAttribute('href', linkWhatsapp(s, campo.value));
    });
    var bloco = el('div', { classe: 'adm-msg' }, [
      el('div', { classe: 'adm-msg-topo' }, [
        el('label', { 'for': idCampo, texto: 'Mensagem para ' + primeiroNome(s) + ' (pode editar antes de enviar)' }),
        el('button', { type: 'button', classe: 'adm-msg-padrao', texto: 'Voltar ao padrão', onclick: function () {
          delete rascunhos[chave];
          campo.value = padrao;
          botao.setAttribute('href', linkWhatsapp(s, padrao));
        } })
      ]),
      campo
    ]);
    return { bloco: bloco, botao: botao };
  }

  function cartaoEscolher(s) {
    var escolhida = escolhas[s.id] || 0;
    var lista = el('div', { classe: 'adm-escolha', role: 'radiogroup', 'aria-label': 'Horário para oferecer a ' + s.nome });
    s.opcoes.forEach(function (o, i) {
      lista.appendChild(el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(i === escolhida), classe: 'adm-escolha-item',
        onclick: function () { escolhas[s.id] = i; abertos[s.id + ':' + s.status] = true; delete rascunhos[s.id + ':proposta']; desenharSolicitacoes(); }
      }, [
        el('span', { classe: 'adm-escolha-marca', 'aria-hidden': 'true' }),
        el('span', { classe: 'adm-escolha-texto' }, [el('strong', { texto: (i + 1) + 'ª sugestão' }), dataCurta(o.data) + ' às ' + o.horario])
      ]));
    });
    var opcao = s.opcoes[escolhida];
    var msg = caixaMensagem(s, s.id + ':proposta', textoProposta(s, opcao), 'Enviar proposta no WhatsApp', function () {
      // O WhatsApp abre numa aba nova; aqui o pedido passa para "Aguardando resposta".
      mudarStatus(s, 'aguardando', escolhida, 'Proposta enviada. O pedido foi para "Aguardando resposta".');
    });
    return el('div', { classe: 'adm-item-corpo' }, [
      detalhesContato(s),
      el('p', { classe: 'adm-passo', texto: 'Qual horário você quer oferecer?' }),
      lista,
      msg.bloco,
      el('div', { classe: 'adm-sol-acoes' }, [
        msg.botao,
        botaoCancelar(s)
      ])
    ]);
  }

  function cartaoAguardando(s) {
    var oferecido = { data: s.data, horario: s.horario };
    var msg = caixaMensagem(s, s.id + ':proposta', textoProposta(s, oferecido), 'Reenviar proposta no WhatsApp');
    return el('div', { classe: 'adm-item-corpo' }, [
      detalhesContato(s),
      el('p', { classe: 'adm-oferecido' }, ['Você ofereceu ', el('strong', { texto: dataCurta(s.data) + ' às ' + s.horario }), '. Quando ' + primeiroNome(s) + ' responder, registre aqui.']),
      el('div', { classe: 'adm-sol-acoes' }, [
        el('button', { type: 'button', classe: 'botao', texto: 'Oferecer outro horário', onclick: function () { mudarStatus(s, 'nova', null, 'Escolha outro horário para oferecer.'); } }),
        botaoCancelar(s)
      ]),
      el('details', { classe: 'adm-reenviar' }, [el('summary', { texto: 'Reenviar a proposta no WhatsApp' }), msg.bloco, msg.botao])
    ]);
  }

  function cartaoConfirmada(s) {
    var msg = caixaMensagem(s, s.id + ':confirmacao', textoConfirmacao(s), 'Enviar confirmação no WhatsApp');
    var data = el('input', { type: 'date', min: hojeISO(), 'aria-label': 'Nova data' });
    var hora = el('input', { type: 'time', step: '900', 'aria-label': 'Novo horário' });
    data.value = s.data;
    hora.value = s.horario;
    var form = el('div', { classe: 'adm-remarcar', hidden: 'hidden' }, [
      el('p', { texto: 'Nova data e horário:' }),
      el('div', { classe: 'adm-novo' }, [data, hora, el('button', { type: 'button', classe: 'botao botao-rosa', texto: 'Salvar nova data', onclick: function () {
        if (!data.value || !horaValida(hora.value)) { avisar('Escolha a nova data e o horário.'); return; }
        remarcar(s, data.value, hora.value);
      } })])
    ]);
    return el('div', { classe: 'adm-item-corpo' }, [
      detalhesContato(s),
      el('p', { classe: 'adm-sol-quando' }, [el('span', { classe: 'adm-status confirmada', texto: 'Confirmada' }), ' ' + dataCurta(s.data) + ' às ' + s.horario]),
      msg.bloco,
      el('div', { classe: 'adm-sol-acoes' }, [
        msg.botao,
        el('button', { type: 'button', classe: 'botao', texto: 'Remarcar', onclick: function () { form.hidden = !form.hidden; } }),
        botaoCancelar(s)
      ]),
      form
    ]);
  }

  function cartaoHistorico(s) {
    var rotulo = s.status === 'cancelada' ? 'Cancelada' : s.status === 'confirmada' ? 'Consulta realizada' : 'Arquivado';
    var quando = isoValido(s.data) ? dataCurta(s.data) + ' às ' + s.horario : s.opcoes.map(function (o) { return dataCurta(o.data) + ' ' + o.horario; }).join(' · ');
    return el('li', { classe: 'adm-linha' }, [
      el('span', { classe: 'adm-linha-texto' }, [el('strong', { texto: s.nome }), ' · ' + quando + ' · ', el('span', { classe: 'adm-linha-rotulo', texto: rotulo })]),
      s.status === 'confirmada' ? null : el('button', {
        type: 'button', classe: 'botao', texto: s.status === 'cancelada' ? 'Reativar' : 'Reabrir',
        'aria-label': (s.status === 'cancelada' ? 'Reativar' : 'Reabrir') + ' o pedido de ' + s.nome,
        onclick: function () {
          if (s.resolvido) resolver(s, false);
          if (s.status === 'cancelada') mudarStatus(s, 'nova', null, 'Pedido reativado. Ele voltou para "Escolher horário".');
        }
      })
    ]);
  }

  function isoValido(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)); }

  function botaoCancelar(s) {
    return el('button', { type: 'button', classe: 'botao', texto: 'Cancelar', onclick: function () {
      var reservado = s.status === 'confirmada' || s.status === 'aguardando';
      if (window.confirm('Cancelar o pedido de ' + s.nome + '?' + (reservado ? ' O horário volta a ficar livre no site.' : ''))) mudarStatus(s, 'cancelada', null, 'Pedido cancelado.');
    } });
  }

  function mudarStatus(s, status, opcao, mensagem) {
    chamar('status', { id: s.id, status: status, opcao: opcao }).then(function (resp) {
      if (resp.erro === 'conflito') { avisar('Esse horário já está reservado para ' + resp.com + '. Escolha outra opção.'); return; }
      if (!resp.ok) throw new Error(resp.erro);
      avisar(mensagem || 'Atualizado.', true);
      return recarregar();
    }).catch(function (e) {
      if (e.message !== 'sessao') avisar('Não consegui atualizar. Tente de novo.');
    });
  }

  function remarcar(s, data, horario) {
    chamar('remarcar', { id: s.id, data: data, horario: horario }).then(function (resp) {
      if (resp.erro === 'conflito') { avisar('Esse horário já está reservado para ' + resp.com + '.'); return; }
      if (resp.erro === 'passado') { avisar('Escolha uma data que ainda não passou.'); return; }
      if (!resp.ok) throw new Error(resp.erro);
      delete rascunhos[s.id + ':confirmacao'];
      avisar('Consulta remarcada. Envie a nova confirmação no WhatsApp.', true);
      return recarregar();
    }).catch(function (e) {
      if (e.message !== 'sessao') avisar('Não consegui remarcar. Tente de novo.');
    });
  }

  function resolver(s, valor) {
    chamar('resolver', { id: s.id, resolvido: valor }).then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro);
      avisar(valor ? 'Pedido arquivado.' : 'Pedido reaberto.', true);
      return recarregar();
    }).catch(function (e) {
      if (e.message !== 'sessao') avisar('Não consegui atualizar. Tente de novo.');
    });
  }

  // ---------- Início ----------
  var salvo = ler('fm_token');
  if (salvo && URL_API) {
    estado.token = salvo;
    abrirPainel();
  } else {
    $('usuario').focus();
  }
})();
