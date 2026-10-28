const assert=require('node:assert/strict');
const M=require('../manual-time.js');
const base=require('../omax-approx.js');
function runTests(){
  let checks=0;const ok=(v,msg)=>{assert.ok(v,msg);checks++;};
  const close=(a,b,eps=1e-7)=>ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
  const fail=fn=>{assert.throws(fn);checks++;};
  const shapes=[{corners90:4,holes:0,pierces:1,outerCurvePercent:0},
    {corners90:12,holes:0,pierces:1,outerCurvePercent:0},
    {corners90:0,holes:0,pierces:1,outerCurvePercent:100},
    {corners90:4,holes:6,pierces:7,outerCurvePercent:0}];
  const rows=[];
  for(let s=0;s<shapes.length;s++)for(let i=0;i<3;i++){
    const result=M.estimate({...shapes[s],thicknessMm:base.THICKNESSES[i]});
    const observed=base.REFERENCES[s].totalMin[i],errorPct=100*Math.abs(result.totalMin-observed)/observed;
    ok(errorPct<1,'manual calibration regression');close(result.cutMin,base.REFERENCES[s].cutMin[i]);
    rows.push({drawing:base.REFERENCES[s].id,thicknessMm:base.THICKNESSES[i],reportedMin:observed,predictedMin:result.totalMin,errorPct});
  }
  const reference=M.estimate();
  close(M.estimate({quantity:3}).totalMin,reference.totalMin*3);
  close(M.estimate({marginPercent:10}).quoteMin,reference.totalMin*1.1);
  close(M.estimate({holes:6,pierces:7}).nominalMin,reference.nominalMin); // no duplicate hole perimeters
  ok(M.estimate({holes:6,pierces:7}).totalMin>reference.totalMin,'hole/pierce effect');
  ok(M.estimate({pierces:2}).totalMin>reference.totalMin,'independent piercing count');
  ok(M.estimate({pierces:0}).totalMin<reference.totalMin,'edge start');
  ok(M.estimate({lengthMm:2000}).totalMin>reference.totalMin,'length');
  ok(M.estimate({machineability:300}).speed>reference.speed,'machinability');
  ok(M.estimate({pressureBar:4000}).speed>reference.speed,'pressure');
  ok(M.estimate({orificeMm:0.35}).speed>reference.speed,'legacy orifice scaling');
  ok(M.estimate({nozzleMm:1.1}).speed>reference.speed,'legacy nozzle scaling');
  ok(M.estimate({abrasiveGMin:600}).speed>reference.speed,'abrasive');
  ok(M.estimate({grit:100}).speed!==reference.speed,'grit');
  ok(M.estimate({corners90:8}).totalMin>reference.totalMin,'90 degree corners');
  ok(M.estimate({cornersGentle:8}).totalMin>reference.totalMin,'gentle corners');
  ok(M.estimate({cornersSharp:8}).totalMin>M.estimate({cornersGentle:8}).totalMin,'sharp > gentle');
  for(const t of [0.1,1,5,10,25,40,55,70,100,300])for(const q of [1,2,3,4,5]){
    const r=M.estimate({thicknessMm:t,quality:q});ok(Number.isFinite(r.totalMin)&&r.totalMin>0,'finite extrapolation');
  }
  for(const key of Object.keys(M.RULES)){
    fail(()=>M.estimate({[key]:NaN}));fail(()=>M.estimate({[key]:Infinity}));fail(()=>M.estimate({[key]:M.RULES[key][1]+1}));
  }
  fail(()=>M.estimate({nozzleMm:0.25,orificeMm:0.3}));
  fail(()=>M.estimate({holes:1.5}));fail(()=>M.estimate({quantity:0}));
  ok(!M.estimate({pressureBar:4000}).conditionsMatch,'unverified conditions marked');
  ok(M.estimate({thicknessMm:100}).notes.some(n=>n.includes('외삽')),'extrapolation marked');
  ok(M.estimate({quality:5}).notes.some(n=>n.includes('Q5')),'quality marked');
  return {checks,maxCalibrationErrorPct:Math.max(...rows.map(r=>r.errorPct)),rows};
}
if(require.main===module)console.log(JSON.stringify(runTests(),null,2));
module.exports={runTests};
