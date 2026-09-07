// Own-state-only, once per turn after refill and before reserve. Shared with
// the restricted preview; no target search or hidden-state access.
export function advanceManualSpinal(ship, weapon, intent) {
  const st=ship.spinal;if(!st)return '';
  st.manualControl=true;
  if(!ship.mounts.some(m=>m.kind==='spinal'&&!m.inop)){
    st.state='wrecked';st.charge=0;return 'Spinal offline; bank cleared.';
  }
  if(intent==='vent'&&st.state!=='cooldown'&&st.charge>0){
    st.charge=0;st.state='cooldown';st.cooldown=weapon.cooldownTurns??0;st.readyTurns=0;
    return 'Spinal vented: all charge lost; movement available; full cooldown begins.';
  }
  if(st.state==='cooldown'){
    st.cooldown=Math.max(0,st.cooldown-1);
    if(!st.cooldown)st.state='charging';
    return `Spinal cooling: ${st.cooldown} turn(s) remain; movement available. No charge this turn.`;
  }
  if(st.state==='ready'){
    const draw=Math.min(weapon.holdDrawPerTurn??0,Math.max(0,ship.power));
    ship.power-=draw;st.readyTurns++;
    return `Spinal ready: ${draw} P containment; translation locked; turning available.`;
  }
  if(st.charge<=0&&intent!=='charge')return 'Spinal cold: movement available. Prepare cannon to start one firing cycle.';
  const draw=Math.min(weapon.chargeDrawPerTurn??0,Math.max(0,ship.power));
  ship.power-=draw;st.charge+=draw;
  if(st.charge>=(weapon.chargeRequired??Infinity)){st.state='ready';st.readyTurns=0;}
  return `Spinal ${st.state}: ${st.charge}/${weapon.chargeRequired}; ${draw} P bank draw; ${st.charge>0?'translation locked; turning available':'no charge available'}.`;
}
