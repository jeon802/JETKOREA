const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../omax-approx.js');

function runTests() {
  let checks=0;
  const check=(condition,message)=>{assert.ok(condition,message);checks++;};
  const close=(a,b,tolerance=1e-6)=>check(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
  const throws=(fn)=>{assert.throws(fn);checks++;};
  const rows=[];
  for(const ref of model.REFERENCES){
    const text=fs.readFileSync(path.join(__dirname,'fixtures',ref.fixture+'.ord'),'utf8');
    const geometry=model.geometryFromOrd(text);
    close(geometry.productMm,1000,1e-5);
    close(geometry.leadMm,ref.profiles*15,1e-5);
    close(geometry.rawCutMm,ref.rawCutMm,1e-5);
    close(geometry.traverseMm,ref.traverseMm,1e-5);
    close(geometry.convex90,ref.convex90,1e-5);
    close(geometry.concave90,ref.concave90,1e-5);
    check(geometry.profiles===ref.profiles,'profile count');
    check(geometry.circles.length===ref.circles.length,'circle count');
    for(let i=0;i<3;i++){
      const predicted=model.estimateOrd(text,model.THICKNESSES[i]);
      const errorPct=100*Math.abs(predicted.totalMin-ref.totalMin[i])/ref.totalMin[i];
      check(errorPct<1,'Calibration residual exceeds 1%: '+ref.id);
      close(predicted.cutMin,ref.cutMin[i],1e-6);
      close(predicted.q3Speed,model.SPEEDS[i][2],1e-10);
      rows.push({drawing:ref.id,thicknessMm:model.THICKNESSES[i],reportedMin:ref.totalMin[i],
        predictedMin:predicted.totalMin,errorPct});
    }
    // Translation and rotation must not change lengths, features, or estimates.
    const transformed=text.trim().split(/\r?\n/).map(line=>{
      const [x,y,b,q]=line.split(',').map(Number);return [-y+100,x-30,b,q].join(',');
    }).join('\n');
    close(model.estimateOrd(text,40).totalMin,model.estimateOrd(transformed,40).totalMin,1e-6);
    // Mirror geometry and reverse offset side: same physical compensated side.
    const mirrored=text.trim().split(/\r?\n/).map(line=>{
      const [x,y,b,q]=line.split(',').map(Number);return [-x,y,-b,-q].join(',');
    }).join('\n');
    close(model.estimateOrd(text,40).totalMin,model.estimateOrd(mirrored,40).totalMin,1e-6);
  }
  for(let t=10;t<=70;t+=0.5){
    const estimate=model.estimateGeometry(model.referenceGeometry('01_RECT_4x90'),t);
    check(Number.isFinite(estimate.totalMin)&&estimate.totalMin>0,'finite interpolation');
    if(t>10)check(estimate.totalMin>model.estimateGeometry(model.referenceGeometry('01_RECT_4x90'),t-0.5).totalMin,'monotonic thickness');
  }
  for(let q=1;q<=5;q++)for(let i=0;i<3;i++)close(model.idealSpeed(model.THICKNESSES[i],q),model.SPEEDS[i][q-1]);
  const fixture=fs.readFileSync(path.join(__dirname,'fixtures','rectangle.ord'),'utf8');
  throws(()=>model.estimateOrd(fixture,0));
  throws(()=>model.estimateOrd(fixture,71));
  throws(()=>model.estimateOrd(fixture,NaN));
  throws(()=>model.estimateOrd(fixture,10,{quality:5}));
  throws(()=>model.estimateOrd(fixture,10,{machineability:200}));
  throws(()=>model.parseOrd('0,0,0,3\n1,1,0,Q3'));
  throws(()=>model.parseOrd('0,0,0,3\n1,1,,0'));
  throws(()=>model.parseOrd('0,0,0,2\n1,1,0,0'));
  throws(()=>model.geometryFromOrd('0,0,0,0\n1,1,0,0'));
  throws(()=>model.geometryFromOrd('0,0,0,-9\n0,0,0,-3\n1,1,0,0'));
  throws(()=>model.idealSpeed(40,0));
  // A point's B/Q apply to its outgoing segment, not its incoming segment.
  const circleGeometry=model.geometryFromOrd(fs.readFileSync(path.join(__dirname,'fixtures','circle.ord'),'utf8'));
  close(circleGeometry.circles[0],500/Math.PI,1e-5);
  check(circleGeometry.profiles===1,'arcs must remain one circle');
  return {checks,maxCalibrationErrorPct:Math.max(...rows.map(row=>row.errorPct)),rows};
}
if(require.main===module)console.log(JSON.stringify(runTests(),null,2));
module.exports={runTests};
