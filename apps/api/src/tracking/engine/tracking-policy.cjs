const TIME_ZONE='America/Bogota';
const timeParts=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const dayNumbers={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
function minuteOfDay(value){
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('Las horas deben usar HH:mm.');
 const [hour,minute]=value.split(':').map(Number);return hour*60+minute;
}
function validatePolicy(value){
 if(!value||![30,60].includes(value.slowSeconds)||!Array.isArray(value.vehicleIds)||!value.vehicleIds.every(id=>Number.isSafeInteger(id)&&id>0))throw new Error('Configura vehículos y frecuencia reducida de 30 o 60 segundos.');
 if(!Array.isArray(value.workWindows)||!value.workWindows.length)throw new Error('Define los días y el horario de trabajo antes de activar el seguimiento continuo.');
 for(const window of value.workWindows){
  if(!Array.isArray(window.days)||!window.days.length||!window.days.every(day=>Number.isInteger(day)&&day>=0&&day<=6))throw new Error('Los días válidos son 0=domingo a 6=sábado.');
  if(minuteOfDay(window.start)===minuteOfDay(window.end))throw new Error('Inicio y fin del horario deben ser distintos.');
 }
 return structuredClone(value);
}
function isWorkingTime(policy,now=Date.now()){
 const parts=Object.fromEntries(timeParts.formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const day=dayNumbers[parts.weekday],minute=Number(parts.hour)*60+Number(parts.minute);
 return policy.workWindows.some(window=>{
  const start=minuteOfDay(window.start),end=minuteOfDay(window.end);
  return start<end?window.days.includes(day)&&minute>=start&&minute<end
   :(window.days.includes(day)&&minute>=start)||(window.days.includes((day+6)%7)&&minute<end);
 });
}
function devicePolicy(policy,deviceId,now=Date.now()){
 const vehicle=policy.vehicleIds.includes(deviceId),continuous=vehicle&&isWorkingTime(policy,now);
 return {assetKind:vehicle?'vehicle':'machine',mode:continuous?'continuous':'reduced',intervalSeconds:continuous?0:policy.slowSeconds,roadMatching:vehicle,timeZone:TIME_ZONE};
}
// Each device has its own clock. A busy truck never advances a machine's timer.
class PublicationCadence{
 constructor(policy){this.policy=validatePolicy(policy);this.last=new Map();}
 due(deviceId,now=Date.now()){
  const cadence=devicePolicy(this.policy,deviceId,now),previous=this.last.get(deviceId);
  return previous===undefined||cadence.intervalSeconds===0||now-previous>=cadence.intervalSeconds*1000;
 }
 mark(deviceId,now=Date.now()){this.last.set(deviceId,now);}
}
module.exports={TIME_ZONE,validatePolicy,isWorkingTime,devicePolicy,PublicationCadence};

class FleetPublication{
 constructor(policy){this.cadence=new PublicationCadence(policy);this.snapshots=new Map();}
 project(fleet,now=Date.now()){
  const present=new Set(fleet.devices.map(d=>d.id));
  for(const id of this.snapshots.keys())if(!present.has(id)){this.snapshots.delete(id);this.cadence.last.delete(id);}
  const devices=fleet.devices.map(device=>{
   if(this.cadence.due(device.id,now)||!this.snapshots.has(device.id)){this.snapshots.set(device.id,device);this.cadence.mark(device.id,now);}
   return {...this.snapshots.get(device.id),trackingPolicy:devicePolicy(this.cadence.policy,device.id,now)};
  });
  return {...fleet,refreshSeconds:devices.some(d=>d.trackingPolicy.mode==='continuous')?15:this.cadence.policy.slowSeconds,devices};
 }
}
// Coalesce notifications separately per asset; GPS ingestion is not throttled.
class CadencedNotifications{
 constructor(policy,publish){this.cadence=new PublicationCadence(policy);this.publish=publish;this.pending=new Set();}
 push(ids,now=Date.now()){ids.forEach(id=>this.pending.add(id));this.flush(now);}
 flush(now=Date.now()){
  const due=[...this.pending].filter(id=>this.cadence.due(id,now));if(!due.length)return;
  due.forEach(id=>{this.pending.delete(id);this.cadence.mark(id,now);});this.publish(due);
 }
}
module.exports.FleetPublication=FleetPublication;
module.exports.CadencedNotifications=CadencedNotifications;
