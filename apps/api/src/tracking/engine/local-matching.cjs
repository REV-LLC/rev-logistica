const { createHash } = require('node:crypto');
const TTL = 15 * 60_000;
const validCoordinate = p => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude) && Math.abs(p.latitude)<=90 && Math.abs(p.longitude)<=180;
function meters(a,b) {
 const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlng=(b.longitude-a.longitude)*rad;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlng/2)**2)));
}
function matchingGroups(history) {
 const result=[];
 for(const segment of history.segments) {
  let current=[];
  const flush=()=>{
   if(current.length>=2&&current.some(p=>meters(current[0],p)>=50)) {
    for(let start=0;start<current.length-1;start+=99)result.push(current.slice(start,start+100));
   }
   current=[];
  };
  for(const p of segment) {
   if(!validCoordinate(p)||!Number.isFinite(Date.parse(p.reportedAt))){flush();continue;}
   const previous=current.at(-1);
   if(previous&&(Date.parse(p.reportedAt)<=Date.parse(previous.reportedAt)||Date.parse(p.reportedAt)-Date.parse(previous.reportedAt)>600000)){flush();}
   const last=current.at(-1);
   if(!last||last.latitude!==p.latitude||last.longitude!==p.longitude)current.push(p);
  }
  flush();
 }
 return result;
}
// Valhalla encodes shapes with precision 6. Reject truncated or oversized data.
function decodeShape(encoded) {
 if(typeof encoded!=='string'||encoded.length>300000)throw new Error('Invalid shape');
 const path=[];let offset=0,latitude=0,longitude=0;
 const read=()=>{let value=0,shift=0,byte;
  do{if(offset>=encoded.length||shift>30)throw new Error('Truncated shape');byte=encoded.charCodeAt(offset++)-63;if(byte<0||byte>63)throw new Error('Invalid shape');value|=(byte&31)<<shift;shift+=5;}while(byte>=32);
  return value&1?~(value>>>1):value>>>1;
 };
 while(offset<encoded.length){latitude+=read();longitude+=read();const point={latitude:latitude/1e6,longitude:longitude/1e6};if(!validCoordinate(point)||path.length>=20000)throw new Error('Invalid coordinate');path.push(point);}
 return path;
}
function parseMatch(data,points) {
 const empty={segments:[],ids:[],through:null,confidences:[],partial:true,code:'NoMatch'};
 if(data.error||!Array.isArray(data.matched_points)||data.matched_points.length!==points.length)return empty;
 if(data.confidence_score!==undefined&&(!Number.isFinite(data.confidence_score)||data.confidence_score<.5||data.confidence_score>1))return empty;
 let path;try{path=decodeShape(data.shape);}catch{return empty;}
 if(path.length<2)return empty;
 const anchors=[];
 for(let i=0;i<points.length;i++){
  const match=data.matched_points[i];
  if(!['matched','interpolated'].includes(match?.type))continue;
  const point={latitude:match.lat,longitude:match.lon};
  if(!validCoordinate(point)||meters(points[i],point)>100)return empty;
  anchors.push({original:points[i],point,match});
 }
 if(anchors.length<2||meters(path[0],anchors[0].point)>100||meters(path.at(-1),anchors.at(-1).point)>100)return empty;
 const segments=[];let start=0;
 for(let i=0;i<anchors.length;i++){
  if(!anchors[i].match.begin_route_discontinuity)continue;
  const before=data.edges?.[anchors[i].match.edge_index],after=data.edges?.[anchors[i+1]?.match.edge_index];
  const end=before?.end_shape_index,next=after?.begin_shape_index;
  // Do not connect separate roads if a discontinuity cannot be located safely.
  if(!Number.isInteger(end)||!Number.isInteger(next)||end<start||next<=end||next>=path.length)return empty;
  const segment=path.slice(start,end+1);if(segment.length>1)segments.push(segment);start=next;
 }
 const tail=path.slice(start);if(tail.length>1)segments.push(tail);
 if(!segments.length)return empty;
 return {segments,ids:anchors.map(a=>a.original.id),through:anchors.at(-1).original.reportedAt,
  confidences:Number.isFinite(data.confidence_score)?[data.confidence_score]:[],partial:anchors.length<points.length||segments.length>1,code:'Ok'};
}
function failure(status,message){const e=new Error(message);e.getStatus=()=>status;return e;}
class LocalMatching {
 constructor({reserve=()=>{},record=()=>{},fetcher=fetch,now=Date.now,maxRequests=12,baseUrl='http://127.0.0.1:8002'}) {
  Object.assign(this,{reserve,record,fetcher,now,maxRequests,baseUrl});this.cache=new Map();this.pending=new Map();
 }
 async status() {
  try {
   const response=await this.fetcher(`${this.baseUrl}/status`,{signal:AbortSignal.timeout(2000),redirect:'error'});
   const status=await response.json();return {available:response.ok&&(status.has_tiles===true||(status.has_tiles===undefined&&Number.isFinite(status.tileset_last_modified)&&status.tileset_last_modified>0&&status.available_actions?.includes('trace_attributes'))),version:typeof status.version==='string'?status.version:null};
  }catch{return {available:false,version:null};}
 }
 async match(history) {
  const groups=matchingGroups(history);
  if(!groups.length)throw failure(400,'No hay suficientes posiciones con desplazamiento para ajustar este recorrido.');
  const signature=createHash('sha256').update(JSON.stringify([history.deviceId,groups.map(g=>g.map(p=>[p.id,p.latitude,p.longitude,p.reportedAt]))])).digest('hex');
  if(this.pending.has(signature))return this.pending.get(signature);
  const task=this.run(history,groups);this.pending.set(signature,task);
  try{return await task;}finally{this.pending.delete(signature);}
 }
 async run(history,groups) {
  const now=this.now();
  for(const [key,value] of this.cache)if(value.expires<=now)this.cache.delete(key);
  const segments=[],ids=new Set(),confidences=[];let requests=0,pending=false,partial=false,through=null;
  const consume=value=>{
   segments.push(...value.segments);for(const id of value.ids)ids.add(id);confidences.push(...value.confidences);
   if(value.through&&(!through||value.through>through))through=value.through;
   partial||=value.partial;
  };
  for(const points of groups) {
   const key=createHash('sha256').update(JSON.stringify([history.deviceId,points.map(p=>[p.id,p.latitude,p.longitude,p.reportedAt])])).digest('hex');
   const cached=this.cache.get(key);if(cached){consume(cached);continue;}
   if(requests>=this.maxRequests){pending=true;continue;}
   await this.reserve();requests++;
   let value={segments:[],ids:[],confidences:[],through:null,partial:true,code:'NetworkError'};
   let httpOk=false;const started=performance.now();
   try {
    const body={shape:points.map(p=>({lat:p.latitude,lon:p.longitude,time:Math.floor(Date.parse(p.reportedAt)/1000)})),
     costing:'auto',shape_match:'map_snap',use_timestamps:true,
     trace_options:{search_radius:75,gps_accuracy:15,breakage_distance:20000},
     filters:{action:'include',attributes:['shape','matched.point','matched.type','matched.edge_index','matched.begin_route_discontinuity','matched.end_route_discontinuity','matched.distance_from_trace_point','edge.begin_shape_index','edge.end_shape_index']}};
    const response=await this.fetcher(`${this.baseUrl}/trace_attributes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
    httpOk=response.ok;
    if(response.ok)value=parseMatch(await response.json(),points);else value.code=`HTTP${response.status}`;
   }catch{value.code='NetworkError';}
   await this.record({httpOk,matched:value.segments.length>0,code:value.code,durationMs:Math.round(performance.now()-started)});
   this.cache.set(key,{...value,expires:now+(value.segments.length?TTL:10000)});
   if(this.cache.size>256)this.cache.delete(this.cache.keys().next().value);
   consume(value);
  }
  const eligiblePointCount=new Set(groups.flat().map(p=>p.id)).size;
  partial||=pending||ids.size<eligiblePointCount;
  return {deviceId:history.deviceId,journeyId:history.journeyId,source:'valhalla',segments,through,matchedPointCount:ids.size,eligiblePointCount,
   coverage:eligiblePointCount?ids.size/eligiblePointCount:0,confidence:confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:null,
   requests,pending,partial,message:segments.length?`Recorrido estimado sobre calles. ${pending?'Procesando bloques restantes automáticamente. ':''}${partial?'Hay tramos sin coincidencia suficiente. ':''}El GPS original permanece disponible.`
    :'El motor local no encontró un ajuste utilizable. Se conserva el GPS como referencia discontinua.'};
 }
}
module.exports={LocalMatching,matchingGroups,parseMatch,decodeShape};
