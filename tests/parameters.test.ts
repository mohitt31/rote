import { it,expect } from 'vitest';
import { parameterizePlan,planHash,replay } from '../server/rote/pipeline-engine.js';
import { fingerprint } from '../server/rote/fingerprint.js';
import type { Plan } from '../shared/rote/pipeline.js';
const table={columns:['x'],rows:[{x:'$1.00'}]};
const base:Plan={inputs:['input'],fingerprints:{input:fingerprint(table).hash},steps:[{action:'parse_number',input:'input:input',params:{column:'x',currency:'$'}}],output:'step:0'};
it('preserves original hashes and behavior while producing a distinct new parameterized plan',()=>{const original=planHash(base),p=parameterizePlan(base,[{step:0,path:['currency'],name:'currency'}]);expect(planHash(base)).toBe(original);expect(planHash(p)).not.toBe(original);expect(replay(p,{input:{columns:['x'],rows:[{x:'€2.00'}]}},{currency:'€'}).rows).toEqual([{x:2}]);expect(()=>replay(p,{input:table},{unknown:'x'})).toThrow(/Unknown/);expect(()=>replay(p,{input:table},{currency:1})).toThrow(/type/);});
it('rejects nonexistent paths, objects, dependency replacement and conflicting shared defaults',()=>{expect(()=>parameterizePlan(base,[{step:0,path:['missing'],name:'x'}])).toThrow();expect(()=>parameterizePlan(base,[{step:1,path:['currency'],name:'x'}])).toThrow();expect(()=>parameterizePlan(base,[{step:0,path:['__proto__'],name:'x'}])).toThrow();expect(()=>parameterizePlan(base,[{step:0,path:['currency'],name:'x'},{step:0,path:['column'],name:'x'}])).toThrow(/defaults/);});
