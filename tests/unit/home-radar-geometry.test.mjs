import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{},Date};vm.createContext(context);vm.runInContext(fs.readFileSync('src/features/workspace/today-command-center.js','utf8'),context);const T=context.window.SutraTodayCenter;
test('radar preserves real due-date bands with deterministic bounded geometry',()=>{
 const now=new Date(2026,9,28,12),offsets=[-2,0,1,3,21];const items=offsets.map((d,i)=>({id:String(i),title:'Item '+i,due:new Date(2026,9,28+d),status:'open'}));
 const data=T.getUpcomingRadarItems(items,{now});assert.equal(data.zones[1].items[0].id,'2');assert.equal(data.zones[3].items[0].id,'4');
 const layout=T.computeRadarLayout(data,{now});assert.deepEqual(layout,T.computeRadarLayout(data,{now}));assert.ok(layout.every(p=>p.xPct>0&&p.xPct<100&&p.yPct>0&&p.yPct<100));
 assert.equal(T.getUpcomingRadarItems([],{now}).visibleCount,0);
 const many=Array.from({length:100},(_,i)=>({...items[1],id:String(i)}));const dense=T.getUpcomingRadarItems(many,{now});assert.equal(dense.zones[0].items.length,4);assert.equal(dense.zones[0].overflow,96);
 const narrow=T.getUpcomingRadarItems(many,{now,maxPerZone:{today:2}});assert.equal(narrow.zones[0].items.length,2);assert.equal(narrow.zones[0].overflow,98);
});
