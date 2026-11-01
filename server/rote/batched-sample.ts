import { createHash } from 'node:crypto';
import { batchedPayoutSample } from '../../shared/rote/samples.js';
import { parseFile } from './io.js';
import { saveImport,runStep,type Scope } from './repository.js';
import { createTask } from './workflow.js';
export async function prepareBatchedSample(scope:Scope){
 const task=await createTask('Sample batched payout reconciliation','Synthetic USD settlements: batched transactions, refunds, rounded fees, 1–3 day bank delays and reordered statements. Monetary checks use integer cents.',{},scope),weeks=[];
 const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
 for(let week=1;week<=3;week++){
  const sample=batchedPayoutSample(week);
  const p=await saveImport(await parseFile(Buffer.from(sample.payouts),'p.csv'),`sample-batched-payouts-week-${week}.csv`,scope,{sha256:hash(sample.payouts),sample:true}),b=await saveImport(await parseFile(Buffer.from(sample.bank),'b.csv'),`sample-batched-bank-week-${week}.csv`,scope,{sha256:hash(sample.bank),sample:true});
  const inputs={payouts:p.outputTableId,bank:b.outputTableId};
  if(week===3){weeks.push({inputs,outputTableId:null,sourceOutputTableId:null});continue;}
  const expected=await saveImport(sample.expected,`sample-batched-reference-week-${week}`,scope,{sha256:hash(JSON.stringify(sample.expected)),sample:true});let sourceOutputTableId:string|null=null;
  if(week===1){
   let left=await runStep('parse_number',inputs.payouts,{column:'net_cents'},scope);
   left=await runStep('parse_date',left.outputTableId,{column:'expected_date',formats:['yyyy-MM-dd'],timezone:'UTC'},scope);
   left=await runStep('group_aggregate',left.outputTableId,{keys:['settlement_id','expected_date'],aggregates:[{op:'sum',column:'net_cents',newColumn:'net_cents'},{op:'count',newColumn:'transaction_count'}]},scope);
   let right=await runStep('parse_number',inputs.bank,{column:'amount_minor'},scope);
   right=await runStep('parse_date',right.outputTableId,{column:'booking_date',formats:['dd/MM/yyyy'],timezone:'UTC'},scope);
   right=await runStep('validate',right.outputTableId,{unique:[['reference']],nonNull:['reference','amount_minor','booking_date']},scope);
   let out=await runStep('join',left.outputTableId,{rightTableId:right.outputTableId,keys:[{left:'settlement_id',right:'reference'}],type:'left',date:{left:'expected_date',right:'booking_date',windowDays:3}},scope);
   out=await runStep('compute_column',out.outputTableId,{newColumn:'delta_cents',formula:'[net_cents] - [amount_minor]'},scope);
   out=await runStep('compute_column',out.outputTableId,{newColumn:'squared_delta',formula:'[delta_cents] * [delta_cents]'},scope);
   out=await runStep('validate',out.outputTableId,{unique:[['settlement_id']],nonNull:['settlement_id','amount_minor','transaction_count'],sumEquals:[{column:'squared_delta',value:0}],rowCount:{min:1,max:100000}},scope);
   out=await runStep('select_columns',out.outputTableId,{columns:sample.expected.columns},scope);sourceOutputTableId=out.outputTableId;
  }
  weeks.push({inputs,outputTableId:expected.outputTableId,sourceOutputTableId});
 }
 return {taskId:task.id,training:weeks[0]!,holdout:weeks[1]!,next:weeks[2]!};
}
