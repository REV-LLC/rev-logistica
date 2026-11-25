import { RoadMatching, trails } from './road-matching';

describe('Roads matching keeps raw GPS and shared consumption boundaries',()=>{
 const now=Date.now();
 const points=Array.from({length:10},(_,i)=>({latitude:3.44+i*.0001,longitude:-76.53,reportedAt:new Date(now-(9-i)*10000).toISOString()}));
 const history={deviceId:3,to:new Date(now).toISOString(),segments:[points]};
 const response=()=>new Response(JSON.stringify({snappedPoints:points.map((p,i)=>({location:{latitude:p.latitude,longitude:p.longitude},originalIndex:i}))}));
 it('never transmits when disabled and never exceeds an exhausted shared reservation',async()=>{
  const fetcher=jest.fn(),reserve=jest.fn().mockResolvedValue(false);
  const disabled=new RoadMatching({enabled:false,key:'test',reserve,fetcher});
  await expect(disabled.match(history)).rejects.toMatchObject({status:503});
  expect(reserve).not.toHaveBeenCalled();
  const enabled=new RoadMatching({enabled:true,key:'test',reserve,fetcher});
  await expect(enabled.match(history)).rejects.toMatchObject({status:503});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('reserves before each request and returns a separate estimated geometry',async()=>{
  const reserve=jest.fn().mockResolvedValue(true),fetcher=jest.fn().mockImplementation(async()=>{expect(reserve).toHaveBeenCalledTimes(1);return response();});
  const matcher=new RoadMatching({enabled:true,key:'private',reserve,fetcher});
  const matched=await matcher.match(history);
  expect(matched).toMatchObject({source:'google-roads',matchedPointCount:10,through:history.to});
  expect(history.segments[0]).toBe(points);
  expect(JSON.stringify(matched)).not.toContain('private');
 });
 it('rejects partial or implausibly shifted geometry without substituting raw positions',async()=>{
  const matcher=new RoadMatching({enabled:true,key:'test',reserve:async()=>true,fetcher:async()=>new Response(JSON.stringify({snappedPoints:[{location:{latitude:4,longitude:-76},originalIndex:0}]}))});
  await expect(matcher.match(history)).rejects.toMatchObject({status:503});
  expect(history.segments[0]).toBe(points);
 });
 it('does not adjust stationary jitter or bridge gaps and caps requests to 100 input points',()=>{
  expect(trails({...history,segments:[points.map(p=>({...p,latitude:3.44}))]})).toEqual([]);
  const jitter=Array.from({length:100},(_,i)=>({...points[0],latitude:3.44+(i%2)*.00002,reportedAt:new Date(now-(99-i)*5000).toISOString()}));
  expect(trails({...history,segments:[jitter]})).toEqual([]);
  const long=Array.from({length:120},(_,i)=>({...points[0],latitude:3.44+i*.0001,reportedAt:new Date(now-(119-i)*5000).toISOString()}));
  expect(trails({...history,segments:[long]}).flat().length).toBeLessThanOrEqual(100);
 });
});
