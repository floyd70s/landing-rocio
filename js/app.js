// Landing · Rocío Zacconi. Reserva de horas contra la API pública de SGA (único punto de unión entre ambos sistemas).
const API = (window.LANDING_CONFIG?.API_URL || '/api').replace(/\/$/, '');
const $ = (s, r = document) => r.querySelector(s);

/* ───────── Utilidades ───────── */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Safe { constructor(s) { this.s = s; } }
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : v == null || v === false ? '' : esc(v));
const html = (st, ...v) => new Safe(st.reduce((o, s, i) => o + s + (i < v.length ? part(v[i]) : ''), ''));
const mount = (el, safe) => { el.innerHTML = safe.s; };

const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clp = (n) => '$' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const diaLargo = (iso) => mayus(new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }));
const diaCorto = (iso) => mayus(new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''));
const horaDe = (iso) => iso.split('T')[1].slice(0, 5);

/** RUT chileno (módulo 11). Devuelve '12.345.678-5' o null si es inválido. */
function validarRut(v) {
  const clean = String(v ?? '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{6,8}[\dK]$/.test(clean)) return null;
  const body = clean.slice(0, -1), dv = clean.slice(-1);
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (sum % 11);
  const exp = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return dv === exp ? `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}` : null;
}

async function api(method, url, body) {
  let res;
  try {
    res = await fetch(API + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    console.error('[reservas] fallo de red hacia', API + url, err);
    const e = new Error('No pudimos conectarnos con el sistema de reservas. Revisa tu conexión e inténtalo nuevamente.'); e.red = true; throw e;
  }
  let data = null;
  if ((res.headers.get('content-type') || '').includes('json')) data = await res.json();
  if (!res.ok) { const e = new Error(data?.error || `Error ${res.status}`); e.status = res.status; throw e; }
  return data;
}

/* ───────── Estado ───────── */
const root = $('#agenda');
let d = null;                       // disponibilidad + información (viene de SGA)
const S = { mes: null, vista: 'reservar', screen: 'reservar', dia: null, slot: null, form: {}, errores: {}, error: '', enviando: false, reserva: null, consulta: null, aviso: '' };

/* ───────── Información de la asesoría (desde SGA) ───────── */
function pintarInfo() {
  const i = d.info;
  $('#dato-min').textContent = `${i.duracion_min} min`;
  mount($('#as-facts'), html`<div><dt>Duración</dt><dd>${i.duracion_min} minutos</dd></div><div><dt>Modalidad</dt><dd>${i.modalidad}</dd></div><div><dt>Costo</dt><dd>${clp(i.costo)}</dd></div>`);
  $('#as-pago').textContent = i.pago;
  $('#ag-sub').textContent = i.cierre;
  mount($('#as-detalles'), html`
    <details class="sec" open><summary>Propósito</summary><div class="cuerpo"><p>${i.proposito}</p></div></details>
    <details class="sec"><summary>Qué puedes esperar</summary><div class="cuerpo"><ul class="check">${i.esperar.map((x) => html`<li>${x}</li>`)}</ul></div></details>
    <details class="sec"><summary>Preparación requerida</summary><div class="cuerpo"><p>Para aprovechar mejor la asesoría, se solicita:</p><ul class="check">${i.preparacion.map((x) => html`<li>${x}</li>`)}</ul></div></details>
    <details class="sec"><summary>Políticas importantes</summary><div class="cuerpo">${i.politicas.map((p) => html`<p><strong>${p.titulo}:</strong> ${p.texto}</p>`)}</div></details>
    <details class="sec"><summary>Confidencialidad</summary><div class="cuerpo"><p>${i.confidencialidad}</p></div></details>`);
  const tel = i.soporte_tel;
  if (tel) mount($('#soporte'), html` · Soporte técnico: <a href="tel:${tel.replace(/[^+\d]/g, '')}">${tel}</a>`);
}

/* ───────── Pantallas del widget ───────── */
const tabs = () => html`<div class="vista" role="group" aria-label="¿Qué deseas hacer?">
  <button type="button" data-a="vista" data-v="reservar" aria-pressed="${S.vista === 'reservar'}">Reservar asesoría</button>
  <button type="button" data-a="vista" data-v="codigo" aria-pressed="${S.vista === 'codigo'}">Ya tengo un código</button></div>`;

/* Calendario mensual: se puede elegir cualquier fecha dentro del rango; los días sin horas se muestran atenuados. */
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const pad2 = (n) => String(n).padStart(2, '0');
const calendario = () => {
  const r = d.rango || { desde: d.dias[0]?.fecha, hasta: d.dias.at(-1)?.fecha };
  const [y, m] = (S.mes || (S.dia || r.desde).slice(0, 7)).split('-').map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=dom
  const offset = (primero + 6) % 7; // semana parte en lunes
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const libres = new Set(d.dias.map((x) => x.fecha));
  const mesIso = (yy, mm) => { const dt = new Date(Date.UTC(yy, mm - 1, 1)); return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`; };
  const prev = mesIso(y, m - 1), next = mesIso(y, m + 1);
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(html`<span class="vacio"></span>`);
  for (let n = 1; n <= total; n++) {
    const f = `${y}-${pad2(m)}-${pad2(n)}`;
    const fuera = f < r.desde || f > r.hasta;
    const cls = [f === S.dia ? 'sel' : '', libres.has(f) ? 'libre' : 'sin', f === r.desde ? 'hoy' : ''].join(' ');
    celdas.push(fuera ? html`<span class="fuera" aria-hidden="true">${n}</span>` : html`<button type="button" data-a="dia" data-d="${f}" class="${cls}" aria-pressed="${f === S.dia}" aria-label="${diaLargo(f)}${libres.has(f) ? '' : ', sin horas disponibles'}">${n}</button>`);
  }
  return html`<div class="cal" role="group" aria-label="Calendario">
    <div class="cal-nav"><button type="button" data-a="mes" data-m="${prev}" aria-label="Mes anterior" ${prev < r.desde.slice(0, 7) ? html`disabled` : ''}>‹</button>
      <strong>${mayus(MESES[m - 1])} ${y}</strong>
      <button type="button" data-a="mes" data-m="${next}" aria-label="Mes siguiente" ${next > r.hasta.slice(0, 7) ? html`disabled` : ''}>›</button></div>
    <div class="cal-sem" aria-hidden="true"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
    <div class="cal-grid">${celdas}</div></div>`;
};
const selectorHorario = () => {
  const dia = d.dias.find((x) => x.fecha === S.dia);
  const sig = d.dias.find((x) => x.fecha > (S.dia || ''));
  return html`<p class="paso-t">Elige el día</p>${calendario()}
    <p class="paso-t" style="margin-top:14px">Elige la hora${S.dia ? html` · <span class="muted">${diaLargo(S.dia)}</span>` : ''}</p>
    ${dia ? html`<div class="horas" role="group" aria-label="Horas disponibles">${dia.slots.map((h) => html`<button type="button" data-a="hora" data-h="${h}" class="${h === S.slot ? 'sel' : ''}" aria-pressed="${h === S.slot}">${h}</button>`)}</div>`
      : html`<p class="sin-horas">${S.dia ? 'No hay horas disponibles ese día.' : 'Selecciona una fecha.'}${sig ? html` <button type="button" class="link" data-a="dia" data-d="${sig.fecha}">Ver el próximo día con horas (${diaCorto(sig.fecha)})</button>` : ''}</p>`}
    ${d.rango?.aviso_horas ? html`<p class="nota-aviso">Las reservas requieren al menos ${d.rango.aviso_horas} horas de anticipación.</p>` : ''}`;
};
const sinHoras = () => html`<p>Por ahora no hay horas disponibles. Escríbenos${d.info.soporte_tel ? html` o llámanos al <a href="tel:${d.info.soporte_tel.replace(/[^+\d]/g, '')}">${d.info.soporte_tel}</a>` : ''} y te ayudaremos a coordinar.</p>`;

function campo(id, label, { tipo = 'text', req = true, ayuda = '', auto = '' } = {}) {
  const err = S.errores[id];
  return html`<div class="campo"><label for="c-${id}">${label}${req ? ' *' : ''}</label>
    <input id="c-${id}" name="${id}" type="${tipo}" value="${S.form[id] || ''}" ${req ? html`required` : ''} ${auto ? html`autocomplete="${auto}"` : html`autocomplete="off"`} ${err ? html`aria-invalid="true" aria-describedby="e-${id}"` : ayuda ? html`aria-describedby="h-${id}"` : ''}>
    ${ayuda && !err ? html`<div class="ayuda" id="h-${id}">${ayuda}</div>` : ''}${err ? html`<div class="err" id="e-${id}">${err}</div>` : ''}</div>`;
}

function pantallaReservar() {
  if (!d.dias.length) return html`${tabs()}${sinHoras()}`;
  return html`${tabs()}
    ${S.aviso ? html`<div class="alerta ok" role="status">${S.aviso}</div>` : ''}
    ${selectorHorario()}
    ${S.slot ? html`<form id="form" novalidate>
      <p class="elegida">${diaLargo(S.dia)} · ${S.slot} h</p>
      ${S.error ? html`<div class="alerta" role="alert" tabindex="-1" id="alerta">${S.error}</div>` : ''}
      ${campo('nombre', 'Nombre completo', { auto: 'name' })}
      <div class="dos">${campo('email', 'Correo electrónico', { tipo: 'email', auto: 'email', ayuda: 'Aquí recibirás el link o los datos de pago y la invitación a la reunión.' })}${campo('telefono', 'Teléfono', { tipo: 'tel', auto: 'tel' })}</div>
      ${campo('rut', 'RUT', { ayuda: 'Ej. 12.345.678-5. Lo usamos para identificarte como cliente.' })}
      <div class="campo"><label for="c-motivo">Cuéntanos brevemente tu situación (opcional)</label><textarea id="c-motivo" name="motivo" rows="3">${S.form.motivo || ''}</textarea></div>
      <div class="campo hp" aria-hidden="true"><label>No completar<input name="web" tabindex="-1" autocomplete="off"></label></div>
      <div class="campo chk"><label><input type="checkbox" name="acepta_politicas" ${S.form.acepta_politicas ? html`checked` : ''}>He leído y acepto las políticas de reprogramación, puntualidad y reembolso, y que la cita se confirma con el pago.</label>${S.errores.acepta_politicas ? html`<div class="err">${S.errores.acepta_politicas}</div>` : ''}</div>
      <div class="campo chk"><label><input type="checkbox" name="consentimiento" ${S.form.consentimiento ? html`checked` : ''}>Autorizo el uso de mis datos personales para gestionar esta reserva y contactarme. La información es confidencial y no se usará para otros fines.</label>${S.errores.consentimiento ? html`<div class="err">${S.errores.consentimiento}</div>` : ''}</div>
      <button class="btn primary block" ${S.enviando ? html`disabled aria-busy="true"` : ''}>${S.enviando ? 'Reservando…' : 'Reservar asesoría'}</button>
    </form>` : html`<p class="ayuda" style="margin-top:8px;color:var(--medio)">Elige una hora para continuar.</p>`}`;
}

const bloqueTransferencia = (t, codigo) => !t ? '' : html`<div class="cab-transfer"><h2>Datos para transferir</h2><button type="button" class="btn-copiar" data-a="copiar-pago" aria-label="Copiar los datos para transferir" title="Copiar datos">Copiar datos</button></div>
    <dl class="resumen transfer"><dt>Titular</dt><dd>${t.titular}</dd><dt>RUT</dt><dd>${t.rut}</dd><dt>Banco</dt><dd>${t.banco}</dd><dt>Tipo de cuenta</dt><dd>${t.tipo_cuenta}</dd><dt>N° de cuenta</dt><dd>${t.numero}</dd><dt>Correo</dt><dd>${t.email}</dd></dl>
    <p class="pol">Indica tu código de reserva <strong>${codigo}</strong> y envía el comprobante a <strong>${t.email}</strong>. Tu cita se confirma al recibir el pago.</p>`;

function pantallaConfirmacion() {
  const r = S.reserva, i = d.info;
  return html`<p class="paso-t" style="text-align:center">Confirmación de reserva</p>
    <h2 style="text-align:center">¡Reserva realizada!</h2>
    <p style="text-align:center;color:var(--medio)">Gracias, ${r.nombre.split(/\s+/)[0]}. Tu hora quedó reservada y se confirma con el pago.</p>
    <div class="ticket" role="status"><div class="etq">Tu código de reserva</div><div class="codigo">${r.codigo}</div><button type="button" class="btn sm" data-a="copiar">Copiar código</button></div>
    <p style="text-align:center;font-size:.9rem;color:var(--medio);margin:-8px 0 20px">Guárdalo: lo necesitarás para consultar o reprogramar tu reserva.</p>
    <dl class="resumen"><dt>Asesoría</dt><dd>${i.titulo}</dd><dt>Fecha</dt><dd>${diaLargo(r.inicio)}</dd><dt>Hora</dt><dd>${horaDe(r.inicio)} h (${i.duracion_min} minutos)</dd><dt>Modalidad</dt><dd>${i.modalidad}</dd><dt>Costo</dt><dd>${clp(r.monto ?? i.costo)}</dd><dt>Pago</dt><dd><span class="estado">Pendiente</span></dd></dl>
    ${bloqueTransferencia(r.transferencia, r.codigo)}
    <h2>Qué sigue</h2>
    <ol class="sigue"><li>Realiza la transferencia con los datos de abajo (también te llegan en la invitación a <strong>${r.email}</strong>).</li><li><strong>Tu cita se confirma con el pago.</strong></li>
      ${r.invitacion_calendario ? html`<li>Te enviamos además una invitación de calendario a ese correo, con el enlace de la videollamada.</li>` : ''}
      <li>Ten a mano documentos relevantes y datos de causas previas. Si es necesario, deberás facilitar tu Clave Única para revisar el estado de la causa en el Poder Judicial.</li></ol>
    <h2>Recuerda</h2>${i.politicas.map((p) => html`<p class="pol"><strong>${p.titulo}:</strong> ${p.texto}</p>`)}
    <div class="acciones"><button type="button" class="btn" data-a="imprimir">Imprimir o guardar esta confirmación</button><button type="button" class="btn" data-a="otra">Hacer otra reserva</button></div>`;
}

function tarjetaReserva(r) {
  const cancelada = r.estado === 'cancelada';
  const pagoTxt = { pendiente: 'pendiente de pago', pagado: 'pagada', no_aplica: 'sin cobro' }[r.pago_estado] || r.pago_estado;
  return html`<div class="ticket"><div class="etq">Código de reserva</div><div class="codigo">${r.codigo}</div></div>
    <dl class="resumen"><dt>Estado</dt><dd>${cancelada ? html`<span class="estado gris">Cancelada</span>` : html`<span class="estado ${r.pago_estado === 'pagado' ? 'ok' : ''}">${r.pago_estado === 'pagado' ? 'Confirmada' : 'Reservada · ' + pagoTxt}</span>`}</dd>
      <dt>Fecha</dt><dd>${diaLargo(r.inicio)}</dd><dt>Hora</dt><dd>${horaDe(r.inicio)} h</dd>
      ${r.monto != null ? html`<dt>Costo</dt><dd>${clp(r.monto)}</dd>` : ''}
      ${r.meet_url && r.pago_estado === 'pagado' ? html`<dt>Videollamada</dt><dd><a href="${r.meet_url}" rel="noopener">Abrir enlace de Meet</a></dd>` : ''}</dl>
    ${cancelada ? '' : bloqueTransferencia(r.transferencia, r.codigo)}
    ${cancelada ? '' : r.puede_reprogramar ? html`<button class="btn" data-a="reprogramar">Reprogramar mi hora (una sola vez)</button>` : html`<p style="font-size:.92rem;color:var(--medio)">${r.motivo_no_reprogramar}</p>`}`;
}

function pantallaCodigo() {
  return html`${tabs()}
    ${S.aviso ? html`<div class="alerta ok" role="status">${S.aviso}</div>` : ''}
    <form id="form-codigo" novalidate>
      ${S.error ? html`<div class="alerta" role="alert" tabindex="-1" id="alerta">${S.error}</div>` : ''}
      <div class="dos"><div class="campo"><label for="cc">Código de reserva</label><input id="cc" name="codigo" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="RZ-XXXXXX" value="${S.form.codigo || S.consulta?.codigo || ''}"></div>
        <div class="campo"><label for="ce">Correo electrónico</label><input id="ce" name="email" type="email" required autocomplete="email" value="${S.form.cemail || S.consulta?._email || ''}"></div></div>
      <button class="btn primary block" ${S.enviando ? html`disabled aria-busy="true"` : ''}>${S.enviando ? 'Consultando…' : 'Consultar mi reserva'}</button>
    </form>
    ${S.consulta ? html`<div style="margin-top:24px">${tarjetaReserva(S.consulta)}</div>` : ''}`;
}

function pantallaReprogramar() {
  const r = S.consulta;
  return html`<p class="paso-t" style="text-align:center">Reprogramación</p><h2 style="text-align:center">Elige tu nuevo horario</h2>
    <p style="text-align:center;color:var(--medio);margin-bottom:18px">Solo puedes reprogramar una vez, y no será posible hacerlo de nuevo.</p>
    <p style="font-size:.92rem;color:var(--medio)">Reserva <strong>${r.codigo}</strong> · hora actual: ${diaLargo(r.inicio)}, ${horaDe(r.inicio)} h</p>
    ${S.error ? html`<div class="alerta" role="alert" tabindex="-1" id="alerta">${S.error}</div>` : ''}
    ${d.dias.length ? html`${selectorHorario()}${S.slot ? html`<p class="elegida">${diaLargo(S.dia)} · ${S.slot} h</p>` : ''}` : sinHoras()}
    <div class="acciones" style="justify-content:flex-start"><button class="btn primary" data-a="confirmar-reprog" ${S.slot && !S.enviando ? '' : html`disabled`}>Confirmar nuevo horario</button><button class="btn" data-a="volver-codigo">Volver</button></div>`;
}

function dibujar({ enfocarAlerta = false } = {}) {
  const pantalla = { reservar: pantallaReservar, confirmacion: pantallaConfirmacion, codigo: pantallaCodigo, reprogramar: pantallaReprogramar }[S.screen];
  mount(root, pantalla());
  if (enfocarAlerta) $('#alerta', root)?.focus();
}

/* ───────── Acciones ───────── */
const guardarForm = () => {
  const f = $('#form', root); if (!f) return;
  for (const k of ['nombre', 'email', 'telefono', 'rut', 'motivo']) S.form[k] = f.elements[k]?.value ?? '';
  S.form.acepta_politicas = f.elements.acepta_politicas?.checked; S.form.consentimiento = f.elements.consentimiento?.checked;
};
async function refrescar() {
  const nd = await api('GET', '/public/reserva/disponibilidad');
  d.dias = nd.dias; d.rango = nd.rango; S.slot = null;
  if (!d.dias.find((x) => x.fecha === S.dia)) S.dia = d.dias[0]?.fecha || null;
}

root.addEventListener('input', (e) => { if (e.target.closest('#form') && e.target.name) { guardarForm(); if (S.errores[e.target.name]) { delete S.errores[e.target.name]; } } });
root.addEventListener('focusout', (e) => { if (e.target.name === 'rut' && e.target.value.trim()) { const f = validarRut(e.target.value); if (f) { e.target.value = f; S.form.rut = f; } } });

root.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'vista') { guardarForm(); S.vista = b.dataset.v; S.screen = S.vista; S.error = ''; S.aviso = ''; return dibujar(); }
  if (a === 'dia') { guardarForm(); S.dia = b.dataset.d; S.mes = S.dia.slice(0, 7); S.slot = null; return dibujar(); }
  if (a === 'mes') { guardarForm(); S.mes = b.dataset.m; return dibujar(); }
  if (a === 'hora') { guardarForm(); S.slot = b.dataset.h; dibujar(); return $('#c-nombre', root)?.focus(); }
  if (a === 'copiar') { try { await navigator.clipboard.writeText(S.reserva.codigo); b.textContent = '¡Copiado!'; } catch { window.prompt('Copia tu código:', S.reserva.codigo); } return; }
  if (a === 'copiar-pago') {
    const t = (S.reserva || S.consulta)?.transferencia, cod = (S.reserva || S.consulta)?.codigo;
    if (!t) return;
    const texto = ['Datos para transferencia', t.titular, `RUT: ${t.rut}`, t.banco, t.tipo_cuenta, `N° de cuenta: ${t.numero}`, `Correo: ${t.email}`, cod ? `Código de reserva: ${cod}` : null].filter(Boolean).join('\n');
    const antes = b.textContent;
    try { await navigator.clipboard.writeText(texto); b.textContent = '¡Copiado!'; } catch { window.prompt('Copia los datos:', texto); }
    setTimeout(() => { b.textContent = antes; }, 1800);
    return;
  }
  if (a === 'imprimir') return window.print();
  if (a === 'otra') { S.screen = 'reservar'; S.vista = 'reservar'; S.slot = null; S.form = {}; S.reserva = null; return dibujar(); }
  if (a === 'reprogramar') { S.error = ''; S.slot = null; S.screen = 'reprogramar'; try { await refrescar(); } catch { /* se usa la lista anterior */ } S.dia = d.dias[0]?.fecha || null; return dibujar(); }
  if (a === 'volver-codigo') { S.screen = 'codigo'; S.error = ''; return dibujar(); }
  if (a === 'confirmar-reprog') {
    S.enviando = true; S.error = ''; dibujar();
    try {
      const nuevo = await api('POST', '/public/reserva/reprogramar', { codigo: S.consulta.codigo, email: S.consulta._email, inicio: `${S.dia}T${S.slot}` });
      S.consulta = { ...nuevo, _email: S.consulta._email }; S.screen = 'codigo'; S.vista = 'codigo'; S.slot = null;
      S.aviso = 'Tu reserva fue reprogramada. Si tienes la invitación en tu calendario, se actualizó automáticamente.';
      S.enviando = false; dibujar(); root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      S.enviando = false; S.error = ex.message;
      if (ex.status === 409) { await refrescar().catch(() => {}); }
      dibujar({ enfocarAlerta: true });
    }
  }
});

root.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'form') return enviarReserva(e.target);
  if (e.target.id === 'form-codigo') return consultar(e.target);
});

async function enviarReserva(f) {
  guardarForm();
  const v = S.form, err = {};
  if (!v.nombre?.trim()) err.nombre = 'Ingresa tu nombre completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email?.trim() || '')) err.email = 'Ingresa un correo válido.';
  if (!v.telefono?.trim()) err.telefono = 'Ingresa tu teléfono.';
  const rut = validarRut(v.rut);
  if (!v.rut?.trim()) err.rut = 'Ingresa tu RUT.'; else if (!rut) err.rut = 'El RUT no es válido: revisa el número y el dígito verificador (ej. 12.345.678-5).';
  if (!v.acepta_politicas) err.acepta_politicas = 'Debes aceptar las políticas de la asesoría para reservar.';
  if (!v.consentimiento) err.consentimiento = 'Debes autorizar el uso de tus datos para reservar.';
  S.errores = err; S.error = '';
  if (Object.keys(err).length) {
    dibujar();
    const primero = ['nombre', 'email', 'telefono', 'rut'].find((k) => err[k]);
    return primero ? $(`#c-${primero}`, root)?.focus() : $('.err', root)?.scrollIntoView({ block: 'center' });
  }
  S.form.rut = rut; S.enviando = true; dibujar();
  try {
    const r = await api('POST', '/public/reserva', { nombre: v.nombre.trim(), email: v.email.trim(), telefono: v.telefono.trim(), rut, motivo: v.motivo || '', web: f.elements.web?.value || '',
      consentimiento: true, acepta_politicas: true, inicio: `${S.dia}T${S.slot}` });
    S.reserva = { ...r, nombre: v.nombre.trim(), email: v.email.trim().toLowerCase() };
    S.enviando = false; S.screen = 'confirmacion'; S.form = {}; dibujar();
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.title = `Reserva ${r.codigo} · Abogada Rocío Zacconi`;
  } catch (ex) {
    S.enviando = false; S.error = ex.message;
    if (ex.status === 409) await refrescar().catch(() => {});
    dibujar({ enfocarAlerta: true });
  }
}

async function consultar(f) {
  S.form.codigo = f.codigo.value; S.form.cemail = f.email.value; S.error = ''; S.aviso = ''; S.enviando = true; dibujar();
  try {
    const r = await api('POST', '/public/reserva/consultar', { codigo: S.form.codigo, email: S.form.cemail });
    S.consulta = { ...r, _email: S.form.cemail.trim() }; S.enviando = false; dibujar();
  } catch (ex) { S.consulta = null; S.enviando = false; S.error = ex.message; dibujar({ enfocarAlerta: true }); }
}

/* ───────── Foto de Rocío: si img/rocio.jpg aún no existe se muestra el monograma de la marca ───────── */
{
  const foto = $('#foto'), retrato = $('#retrato');
  const sinFoto = () => retrato.classList.add('sin-foto');
  foto.addEventListener('error', sinFoto);
  if (foto.complete && foto.naturalWidth === 0) sinFoto();
}

/* ───────── Inicio ───────── */
$('#anio').textContent = new Date().getFullYear();
if (window.LANDING_CONFIG?.INSTAGRAM) $('#ig').href = `https://instagram.com/${window.LANDING_CONFIG.INSTAGRAM}`;
api('GET', '/public/reserva/disponibilidad')
  .then((x) => { d = x; S.dia = d.dias[0]?.fecha || null; S.mes = S.dia ? S.dia.slice(0, 7) : null; pintarInfo(); dibujar(); })
  .catch((e) => {
    mount(root, html`<div class="alerta" role="alert">${e.message}</div><p style="color:var(--medio)">Si el problema continúa, escríbenos por Instagram <a href="https://instagram.com/soyrociozacconi" rel="noopener">@soyrociozacconi</a>.</p>`);
    mount($('#as-detalles'), html`<p class="cargando">La información de la asesoría no está disponible en este momento.</p>`);
  });
