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

  function textoProposta(s, opcao) {
    return (estado.painel.mensagemProposta || estado.painel.mensagemWhatsapp || '')
      .replace(/\{nome\}/g, primeiroNome(s))
      .replace(/\{formato\}/g, formatoDe(s))
      .replace(/\{proposta\}/g, opcao ? comArtigo(opcao) : '');
  }

  function textoConfirmacao(s) {
    return [
      'Olá, ' + primeiroNome(s) + '! 😊',
      '✅ Sua consulta ' + formatoDe(s) + ' está *confirmada ' + comArtigo(s) + '*.',
      '',
      'Quer se preparar melhor para a consulta? Separei algumas dicas aqui:',
      'https://www.francianemarin.com.br/#preparo',
      '',
      'Qualquer dúvida, é só me chamar por aqui. Até lá!',
      'Franciane Marin · Nutricionista'
    ].join('\n');
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

  function desenharSolicitacoes() {
    var caixa = $('lista-solicitacoes');
    caixa.innerHTML = '';
    var hoje = hojeISO();
    var porChegada = function (a, b) { return String(a.criadoEm).localeCompare(String(b.criadoEm)); };
    var porData = function (a, b) { return (a.data + a.horario).localeCompare(b.data + b.horario); };
    var todas = estado.painel.solicitacoes || [];
    var escolher = todas.filter(function (s) { return s.status === 'nova' && !s.resolvido; }).sort(porChegada);
    var aguardando = todas.filter(function (s) { return s.status === 'aguardando' && !s.resolvido; }).sort(porChegada);
    var confirmadas = todas.filter(function (s) { return s.status === 'confirmada' && s.data >= hoje; }).sort(porData);
    var canceladas = todas.filter(function (s) { return s.status === 'cancelada'; }).sort(porChegada).reverse();
    var historico = todas.filter(function (s) {
      return s.status !== 'cancelada' && ((s.resolvido && s.status !== 'confirmada') || (s.status === 'confirmada' && s.data < hoje));
    }).sort(porChegada).reverse();

    var pendentes = escolher.length + aguardando.length;
    $('contador-novas').textContent = String(pendentes);
    $('contador-novas').hidden = !pendentes;

    grupo(caixa, '1', 'Escolher horário', 'Abra o pedido, marque a melhor sugestão e envie a proposta.', escolher, cartaoEscolher, resumoEscolher, acaoEscolher);
    grupo(caixa, '2', 'Aguardando resposta', 'O horário oferecido fica reservado até a paciente responder.', aguardando, cartaoAguardando, resumoAguardando, acaoAguardando);
    grupo(caixa, '3', 'Consultas confirmadas', 'Próximas consultas. Abra para reenviar a confirmação, remarcar ou cancelar.', confirmadas, cartaoConfirmada, resumoConfirmada, acaoConfirmada);

    // Canceladas e histórico ficam fechados e em linhas curtas, para não ocupar espaço.
    listaCompacta(caixa, 'Canceladas (' + canceladas.length + ')', canceladas);
    listaCompacta(caixa, 'Arquivados e consultas realizadas (' + historico.length + ')', historico);
  }

  function listaCompacta(caixa, titulo, lista) {
    if (!lista.length) return;
    var ul = el('ul', { classe: 'adm-linhas' });
    lista.forEach(function (s) { ul.appendChild(cartaoHistorico(s)); });
    caixa.appendChild(el('details', { classe: 'adm-historico' }, [el('summary', { texto: titulo }), ul]));
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
      if (abertos[s.id]) item.setAttribute('open', '');
      item.addEventListener('toggle', function () { abertos[s.id] = item.open; });
      var botaoAcao = acao(s, item);
      item.appendChild(el('summary', { classe: 'adm-item-linha' }, [
        el('span', { classe: 'adm-item-nome' }, [el('strong', { texto: s.nome }), el('small', { texto: formatoDe(s) })]),
        el('span', { classe: 'adm-item-resumo', texto: resumo(s) }),
        botaoAcao
      ]));
      item.appendChild(desenhar(s));
      ul.appendChild(el('li', {}, [item]));
    });
    caixa.appendChild(ul);
  }

  function resumoEscolher(s) {
    return s.opcoes.length + (s.opcoes.length > 1 ? ' sugestões' : ' sugestão') + ' · ' + s.opcoes.map(function (o) { return dataCurta(o.data) + ' ' + o.horario; }).join(' · ');
  }
  function resumoAguardando(s) { return 'Ofereceu ' + dataCurta(s.data) + ' às ' + s.horario; }
  function resumoConfirmada(s) { return dataCurta(s.data) + ' às ' + s.horario; }

  // Botão da linha: não abre/fecha o item quando clicado, a não ser que seja a intenção.
  function botaoLinha(texto, classe, aoClicar) {
    return el('button', { type: 'button', classe: 'botao ' + classe, texto: texto, onclick: function (ev) { ev.preventDefault(); ev.stopPropagation(); aoClicar(); } });
  }
  function acaoEscolher(s, item) { return botaoLinha('Escolher horário', 'botao-rosa', function () { item.open = !item.open; }); }
  function acaoAguardando(s) {
    return botaoLinha('Paciente confirmou', 'botao-rosa', function () { mudarStatus(s, 'confirmada', null, 'Consulta confirmada. Ela está em "Consultas confirmadas".'); });
  }
  function acaoConfirmada(s, item) { return botaoLinha('Abrir', 'botao-contorno', function () { item.open = !item.open; }); }

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
        onclick: function () { escolhas[s.id] = i; abertos[s.id] = true; delete rascunhos[s.id + ':proposta']; desenharSolicitacoes(); }
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
