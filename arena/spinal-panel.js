import {advanceManualSpinal} from '../src/tactical/spinal-control.js';
import {publicWeaponGeometry} from '../src/tactical/resolver.js';
import {escapeHTML as esc} from './command-model.js';
export function spinalPanel(ship,order,view,enabled){
  if(!ship.spinal)return '';
  const m=ship.mounts.find(m=>m.kind==='spinal'),w=m?.weapon||{},st=ship.spinal;
  const offline=ship.destroyed||!m||m.inop;
  const locked=!offline&&w.immobileWhileCharging&&(st.state==='ready'||st.charge>0);
  const state=offline?'OFFLINE':st.state==='ready'?'READY':st.state==='cooldown'?'COOLING':st.charge>0?'CHARGING':'COLD';
  const projected=structuredClone(ship);projected.power=ship.fullPower;
  const next=offline?'Weapon unavailable.':advanceManualSpinal(projected,w,order?.spinal);
  const reserve=Math.round(projected.power*(order?.reserve??.3));
  const contacts=view.contacts.map(c=>({...c,destroyed:false,cloaked:false}));
  const tuning={battle:{terrain:view.terrain,terrainRules:view.rules.terrain,sameHexNoFire:view.rules.movement.sameHexNoFire}};
  const target=contacts.find(c=>c.id===order?.target);
  const legal=m?contacts.filter(c=>!publicWeaponGeometry(ship,m,c,tuning)):[];
  let firing=target&&m?`Preferred target: ${publicWeaponGeometry(ship,m,target,tuning)||'in arc and range with clear line'}. May use another eligible contact.`:
    legal.length?`Automatic target: heaviest eligible contact. May wait up to ${w.holdForCapitalTurns??0} turns for a capital target.`:'No current contact offers a clear shot in arc and range.';
  if(offline)firing='Cannon unavailable.';
  else if(state==='READY'&&ship.power-ship.reserve<(w.firePower??0))firing=`Current spendable power below ${w.firePower} P firing cost. `+firing;
  return `<strong>${offline?'OFFLINE':locked?'IMMOBILE':'MOBILE'} · ${state} · Bank ${st.charge}/${w.chargeRequired??'—'}${state==='COOLING'?` · ${st.cooldown}t`:''}</strong>
    <progress aria-label="Spinal charge" max="${w.chargeRequired||1}" value="${Math.min(st.charge,w.chargeRequired||1)}"></progress>
    <div class="spinal-buttons"><button data-spinal="charge" ${!enabled||offline||st.charge>0||st.state==='cooldown'?'disabled':''}>${order?.spinal==='charge'?'Cancel preparation':'Prepare cannon'}</button><button data-spinal="vent" ${!enabled||offline||st.charge<=0?'disabled':''}>${order?.spinal==='vent'?'Cancel abort':'Abort charge & move'}</button></div>
    ${!enabled||order?.spinal||(locked&&state!=='READY')?`<p>${!enabled?'Recorded state; orders unavailable.':order?.spinal==='vent'?`Execute: lose ${st.charge} charge; move; cooldown ${w.cooldownTurns}.`:order?.spinal==='charge'?'Execute: start charging here; forward movement locks.':'Translation locked; turning allowed.'}</p>`:''}
    ${state==='READY'?`<p class="spinal-firing" title="${esc(firing)}">${esc(firing.split('. ')[0])}</p>`:''}
    <details><summary>Power & firing status</summary><p>${esc(next)}</p><p>Next refill ${ship.fullPower} P → bank/holding ${ship.fullPower-projected.power} P → ${projected.power} P left; ${reserve} reserved, ${Math.max(0,projected.power-reserve)} ordinarily spendable. Reserve is not spent.</p><p>${esc(firing)} Hold & fire is required to shoot; maneuvering uses that action. Turning remains possible while planted.</p><p>Charging up to ${w.chargeDrawPerTurn} P/turn; holding up to ${w.holdDrawPerTurn} P/turn; firing ${w.firePower} P. Abort loses the entire bank and starts ${w.cooldownTurns} turns of cooldown. No automatic rearming after a shot.</p></details>`;
}
