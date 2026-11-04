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
  }

  // ---------- Abas ----------
  var abas = { dias: $('tab-dias'), semana: $('tab-semana'), solicitacoes: $('tab-solicitacoes') };
  Object.keys(abas).forEach(function (nome) {
    abas[nome].addEventListener('click', function () {
      Object.keys(abas).forEach(function (o) {
        abas[o].setAttribute('aria-selected', String(o === nome));
        $('aba-' + o).hidden = o !== nome;
      });
      avisar('');
    });
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
    return (estado.painel.solicitacoes || []).filter(function (s) { return s.data === iso && s.status === 'confirmada'; });
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
          el('strong', { texto: h }), el('small', { texto: s.nome + (s.modo !== estado.modo ? ' (' + s.modo + ')' : '') })
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

  function primeiraData(s) {
    if (s.status === 'confirmada' && s.data) return s.data + ' ' + s.horario;
    return s.opcoes.map(function (o) { return o.data + ' ' + o.horario; }).sort()[0] || '';
  }

  // Texto editado à mão por solicitação, para não se perder quando a lista é redesenhada.
  var rascunhos = {};
  // Qual sugestão ela vai oferecer na mensagem ("Consigo na sexta..."), por solicitação.
  var propostas = {};

  function comArtigo(o) {
    var dia = deISO(o.data).getDay();
    return (dia === 0 || dia === 6 ? 'no ' : 'na ') + textoOpcao(o);
  }

  function linkWhatsapp(s, texto) {
    return 'https://wa.me/' + String(s.telefone).replace(/\D/g, '') + '?text=' + encodeURIComponent(texto);
  }

  function textoWhatsapp(s) {
    var formato = s.modo === 'online' ? 'online' : 'presencial';
    var nome = String(s.nome).split(' ')[0];
    var texto;
    if (s.status === 'confirmada') {
      texto = 'Olá, ' + nome + '! Aqui é a Franciane Marin. Sua consulta ' + formato + ' está confirmada para ' + textoOpcao(s) + '. Qualquer dúvida, é só me chamar por aqui. Até lá!';
    } else {
      var proposta = s.opcoes[propostas[s.id] || 0] || s.opcoes[0];
      texto = (estado.painel.mensagemProposta || estado.painel.mensagemWhatsapp || '')
        .replace(/\{nome\}/g, nome)
        .replace(/\{formato\}/g, formato)
        .replace(/\{proposta\}/g, proposta ? comArtigo(proposta) : '');
    }
    return texto;
  }

  function chegada(s) {
    var d = new Date(s.criadoEm);
    if (isNaN(d)) return '';
    return 'Chegou em ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') +
      ' às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function desenharSolicitacoes() {
    var caixa = $('lista-solicitacoes');
    caixa.innerHTML = '';
    // Ordem de chegada: quem pediu primeiro aparece primeiro.
    var todas = (estado.painel.solicitacoes || []).slice().sort(function (a, b) {
      return String(a.criadoEm).localeCompare(String(b.criadoEm));
    });
    var abertas = todas.filter(function (s) { return !s.resolvido && s.status !== 'cancelada'; });
    var fechadas = todas.filter(function (s) { return s.resolvido || s.status === 'cancelada'; }).reverse();
    $('contador-novas').textContent = String(abertas.length);
    $('contador-novas').hidden = !abertas.length;

    caixa.appendChild(el('p', { classe: 'adm-explica', texto: 'Pedidos dos últimos 30 dias, em ordem de chegada.' }));
    caixa.appendChild(el('h2', { classe: 'adm-grupo', texto: 'A responder (' + abertas.length + ')' }));
    if (!abertas.length) caixa.appendChild(el('p', { classe: 'adm-cartao adm-vazio', texto: 'Tudo respondido por aqui.' }));
    abertas.forEach(function (s) { caixa.appendChild(cartao(s)); });

    if (fechadas.length) {
      caixa.appendChild(el('h2', { classe: 'adm-grupo', texto: 'Resolvidas e canceladas (' + fechadas.length + ')' }));
      fechadas.forEach(function (s) { caixa.appendChild(cartao(s)); });
    }
  }

  function cartao(s) {
    var fechada = s.resolvido || s.status === 'cancelada';
    var rotulo = { nova: 'Nova · escolha um horário', confirmada: 'Confirmada', cancelada: 'Cancelada' }[s.status] || s.status;
    var selos = el('div', { classe: 'adm-selos' }, [
      el('span', { classe: 'adm-status ' + s.status, texto: rotulo }),
      s.resolvido ? el('span', { classe: 'adm-status resolvido', texto: 'Resolvido' }) : null,
      el('span', { classe: 'adm-chegada', texto: chegada(s) })
    ]);
    var info = [selos, el('span', { classe: 'adm-sol-quem', texto: s.nome + ' · ' + (s.telefoneExibicao || s.telefone) + ' · ' + s.modo })];

    if (s.status === 'confirmada') {
      info.splice(1, 0, el('span', { classe: 'adm-sol-quando', texto: dataCurta(s.data) + ' às ' + s.horario }));
    } else {
      var opcoes = el('ol', { classe: 'adm-opcoes' });
      var oferecida = propostas[s.id] || 0;
      s.opcoes.forEach(function (o, i) {
        var ativa = s.status === 'nova' && !fechada;
        opcoes.appendChild(el('li', { classe: ativa && i === oferecida ? 'oferecida' : '' }, [
          el('span', {}, [el('strong', { texto: (i + 1) + 'ª opção ' }), dataCurta(o.data) + ' às ' + o.horario]),
          ativa ? el('div', { classe: 'adm-opcao-acoes' }, [
            el('button', {
              type: 'button', classe: 'botao', 'aria-pressed': String(i === oferecida),
              texto: i === oferecida ? 'Na mensagem' : 'Oferecer na mensagem',
              onclick: function () {
                propostas[s.id] = i;
                delete rascunhos[s.id + ':' + s.status];
                desenharSolicitacoes();
              }
            }),
            el('button', {
              type: 'button', classe: 'botao botao-rosa', texto: 'Confirmar este',
              'aria-label': 'Confirmar ' + dataCurta(o.data) + ' às ' + o.horario + ' para ' + s.nome,
              onclick: function () { mudarStatus(s, 'confirmada', i); }
            })
          ]) : null
        ]));
      });
      info.splice(1, 0, opcoes);
    }

    var botaoWhats = null;
    if (!fechada) {
      var chave = s.id + ':' + s.status;
      var texto = rascunhos[chave] || textoWhatsapp(s);
      botaoWhats = el('a', {
        classe: 'botao botao-whats', href: linkWhatsapp(s, texto), target: '_blank', rel: 'noopener',
        texto: s.status === 'confirmada' ? 'Enviar confirmação no WhatsApp' : 'Enviar no WhatsApp'
      });
      var idCampo = 'msg-' + s.id;
      var campo = el('textarea', { id: idCampo, classe: 'adm-msg-campo', rows: '6' });
      campo.value = texto;
      campo.addEventListener('input', function () {
        rascunhos[chave] = campo.value;
        botaoWhats.setAttribute('href', linkWhatsapp(s, campo.value));
      });
      info.push(el('div', { classe: 'adm-msg' }, [
        el('div', { classe: 'adm-msg-topo' }, [
          el('label', { 'for': idCampo, texto: 'Mensagem para ' + String(s.nome).split(' ')[0] + ' (pode editar antes de enviar)' }),
          el('button', { type: 'button', classe: 'adm-msg-padrao', texto: 'Voltar ao padrão', onclick: function () {
            delete rascunhos[chave];
            campo.value = textoWhatsapp(s);
            botaoWhats.setAttribute('href', linkWhatsapp(s, campo.value));
          } })
        ]),
        campo
      ]));
    }

    var acoes = el('div', { classe: 'adm-sol-acoes' }, [
      botaoWhats,
      s.status !== 'cancelada' ? el('button', {
        type: 'button', classe: 'botao' + (s.resolvido ? '' : ' botao-resolver'),
        texto: s.resolvido ? 'Reabrir' : 'Marcar como resolvido',
        onclick: function () { resolver(s, !s.resolvido); }
      }) : null,
      s.status === 'confirmada' && !fechada ? el('button', { type: 'button', classe: 'botao', texto: 'Trocar horário', onclick: function () { mudarStatus(s, 'nova'); } }) : null,
      s.status !== 'cancelada' && !fechada ? el('button', { type: 'button', classe: 'botao', texto: 'Cancelar', onclick: function () {
        if (window.confirm('Cancelar a solicitação de ' + s.nome + '?' + (s.status === 'confirmada' ? ' O horário volta a ficar livre no site.' : ''))) mudarStatus(s, 'cancelada');
      } }) : null,
      s.status === 'cancelada' ? el('button', { type: 'button', classe: 'botao', texto: 'Reativar', onclick: function () { mudarStatus(s, 'nova'); } }) : null
    ]);
    return el('article', { classe: 'adm-cartao adm-sol ' + s.status + (fechada ? ' fechada' : '') }, [el('div', { classe: 'adm-sol-info' }, info), acoes]);
  }

  function resolver(s, valor) {
    chamar('resolver', { id: s.id, resolvido: valor }).then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro);
      avisar(valor ? 'Marcado como resolvido.' : 'Reaberto.', true);
      return recarregar();
    }).catch(function (e) {
      if (e.message !== 'sessao') avisar('Não consegui atualizar. Tente de novo.');
    });
  }

  function mudarStatus(s, status, opcao) {
    chamar('status', { id: s.id, status: status, opcao: opcao }).then(function (resp) {
      if (resp.erro === 'conflito') { avisar('Esse horário já está confirmado para ' + resp.com + '. Escolha outra opção.'); return; }
      if (!resp.ok) throw new Error(resp.erro);
      avisar(status === 'confirmada' ? 'Confirmado. Agora é só mandar a confirmação no WhatsApp.' : 'Atualizado.', true);
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
