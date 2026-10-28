/* Field calculator. Empirical reference fit + legacy relative-condition scaling.
 * Different materials/pumps/nozzles/angles are estimates, not validated OMAX physics.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./omax-approx.js'));
  else root.OMAXManual=factory(root.OMAXApprox);
})(typeof globalThis!=='undefined'?globalThis:this,function(base){
  'use strict';
  const DEFAULTS=Object.freeze({machineability:230,thicknessMm:10,pressureBar:3400.01,
    orificeMm:0.3302,nozzleMm:1.062,abrasiveGMin:450,grit:80,quality:3,
    lengthMm:1000,holes:0,corners90:4,cornersGentle:0,cornersSharp:0,pierces:1,
    quantity:1,outerCurvePercent:0,holeDiameterMm:20,leadInMm:10,leadOutMm:5,marginPercent:0});
  const T=[10,40,70],R=base.REFERENCES;
  const RULES={machineability:[1,10000],thicknessMm:[0.1,300],pressureBar:[100,7000],
    orificeMm:[0.05,1.5],nozzleMm:[0.2,5],abrasiveGMin:[1,5000],grit:[20,240],quality:[1,5],
    lengthMm:[0.1,1e8],holes:[0,100000],corners90:[0,100000],cornersGentle:[0,100000],
    cornersSharp:[0,100000],pierces:[0,100001],quantity:[1,1e6],outerCurvePercent:[0,100],
    holeDiameterMm:[0.1,1000],leadInMm:[0,1000],leadOutMm:[0,1000],marginPercent:[0,300]};
  const LABELS={machineability:'가공성 계수',thicknessMm:'두께',pressureBar:'압력',orificeMm:'오리피스',
    nozzleMm:'노즐',abrasiveGMin:'연마제',grit:'입도',quality:'품질',lengthMm:'가공길이',holes:'타공수',
    corners90:'90도 코너',cornersGentle:'완만한 코너',cornersSharp:'급한 코너',pierces:'피어싱수',
    quantity:'수량',outerCurvePercent:'외곽 곡선비율',holeDiameterMm:'평균 타공직경',
    leadInMm:'진입 길이',leadOutMm:'이탈 길이',marginPercent:'여유율'};
  const INTEGERS=new Set(['quality','holes','corners90','cornersGentle','cornersSharp','pierces','quantity']);
  function normalize(input={}){
    const p={...DEFAULTS,...input};
    for(const key of Object.keys(RULES)){
      const v=p[key],[min,max]=RULES[key];
      if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(INTEGERS.has(key)&&!Number.isInteger(v)))
        throw new Error(LABELS[key]+' 입력을 확인하세요. 범위: '+min+'~'+max+(INTEGERS.has(key)?' (정수)':''));
    }
    if(p.nozzleMm<=p.orificeMm)throw new Error('노즐 직경은 오리피스 직경보다 커야 합니다.');
    return p;
  }
  function logCurve(t,values){
    const exact=T.indexOf(t);if(exact>=0)return values[exact];
    const i=t<40?0:1,w=Math.log(t/T[i])/Math.log(T[i+1]/T[i]);
    return Math.exp(Math.log(values[i])*(1-w)+Math.log(values[i+1])*w);
  }
  function referenceSpeed(t,q=3){return logCurve(t,base.SPEEDS.map(row=>row[q-1]));}
  function conditionFactor(p){
    // Relative exponents retained from the user's original JETKOREA speed equation.
    return Math.pow(p.machineability/230,1.15)*Math.pow(p.pressureBar/3400.01,1.82)
      *Math.pow(p.orificeMm/0.3302,0.20)*Math.pow(p.nozzleMm/1.062,0.20)
      *Math.pow(p.abrasiveGMin/450,0.30)*Math.max(0.85,Math.min(1.15,Math.pow(80/p.grit,0.12)));
  }
  function fittedValues(index){
    const v=base.SPEEDS[index][2],rect=R[0].cutMin[index]-1015/v,
      notch=R[1].cutMin[index]-1015/v;
    return {rectangle:rect,cornerExponent:Math.log(notch/rect)/Math.log(3),
      circle:R[2].cutMin[index]-1015/v,
      hole:(R[3].cutMin[index]-1105/v-rect)/6};
  }
  const ANCHORS=T.map((_,i)=>fittedValues(i));
  let xx=0,xn=0,nn=0,xy=0,ny=0;
  for(const r of R){xx+=r.traverseMm*r.traverseMm;xn+=r.traverseMm*r.traverses;nn+=r.traverses*r.traverses;xy+=r.traverseMm*r.traverseMin;ny+=r.traverses*r.traverseMin;}
  const det=xx*nn-xn*xn,MOVE_PER_MM=(xy*nn-ny*xn)/det,MOVE_PER_EVENT=(ny*xx-xy*xn)/det;
  function estimate(input={}){
    const p=normalize(input),f=conditionFactor(p),qRatio=referenceSpeed(p.thicknessMm,p.quality)/referenceSpeed(p.thicknessMm,3);
    const speed=referenceSpeed(p.thicknessMm,p.quality)*f,timeScale=1/(f*qRatio);
    const values={};for(const key of Object.keys(ANCHORS[0]))values[key]=logCurve(p.thicknessMm,ANCHORS.map(row=>row[key]));
    // Input counts refer to product corners, not ORD joins. Gentle=135° interior,
    // sharp=45° interior; squared turn-angle weights are provisional.
    const equivalent90=p.corners90+0.25*p.cornersGentle+2.25*p.cornersSharp;
    const cornerMin=equivalent90===0?0:values.rectangle*Math.pow(equivalent90/4,values.cornerExponent)*timeScale;
    const curveMin=values.circle*p.outerCurvePercent/100*timeScale;
    const diameterFactor=Math.max(0.5,Math.min(2,Math.pow(20/p.holeDiameterMm,0.25)));
    const holeMin=values.hole*p.holes*diameterFactor*timeScale;
    // lengthMm already includes hole perimeters. Hole circumference is NEVER added.
    const nominalMin=p.lengthMm/speed;
    const leadMm=(p.leadInMm+p.leadOutMm)*p.pierces,leadMin=leadMm/speed;
    // Pierce effects are integrated in leads/residuals/relays, not a second dwell.
    const cutMin=nominalMin+leadMin+cornerMin+curveMin+holeMin;
    const complexity=Math.max(0,Math.min(1,(equivalent90-4)/8)),curve=p.outerCurvePercent/100;
    const outerMove=(R[0].traverseMm+(R[1].traverseMm-R[0].traverseMm)*complexity)*(1-curve)+R[2].traverseMm*curve;
    const inferredMoveMm=p.pierces===0?0:outerMove*Math.sqrt(p.lengthMm/1000)+(R[3].traverseMm-R[0].traverseMm)*p.holes/6;
    const traverseMin=MOVE_PER_MM*inferredMoveMm+MOVE_PER_EVENT*p.pierces;
    const relayMin=p.pierces===0?0:0.0033333333333333335+0.03666666666666667*p.pierces;
    const perPartMin=cutMin+traverseMin+relayMin,totalMin=perPartMin*p.quantity;
    if(!Number.isFinite(totalMin)||totalMin<=0)throw new Error('입력 규모가 계산 범위를 벗어났습니다.');
    const conditionsMatch=['machineability','pressureBar','orificeMm','nozzleMm','abrasiveGMin','grit']
      .every(key=>Math.abs(p[key]-DEFAULTS[key])<=Math.max(1e-6,Math.abs(DEFAULTS[key])*0.00001));
    const notes=[];
    if(!conditionsMatch)notes.push('재질·압력·노즐 등의 변경은 기존 속도식의 상대 보정입니다. 해당 조건은 추가 검증이 필요합니다.');
    if(p.thicknessMm<10||p.thicknessMm>70)notes.push('두께 10~70mm 밖은 외삽값으로 오차가 커질 수 있습니다.');
    if(p.quality!==3)notes.push('Q'+p.quality+' 가공시간은 Q3 보정값의 속도비 근사입니다.');
    if(p.cornersGentle||p.cornersSharp)notes.push('완만한 코너는 내각 135°, 급한 코너는 내각 45° 기준 근사입니다.');
    if(p.holes&&p.holeDiameterMm!==20)notes.push('타공직경 보정은 Ø20mm 기준의 경험적 추정입니다.');
    if(p.pierces!==p.holes+1)notes.push('타공수와 피어싱수는 별도 반영했습니다. 이동·진입 시간은 자동 근사입니다.');
    if(p.leadInMm!==10||p.leadOutMm!==5)notes.push('기준 리드 길이(진입 10mm / 이탈 5mm)와 다릅니다.');
    notes.push('새 도면에서 ±10%는 목표이며 보장 범위가 아닙니다.');
    return {params:p,speed,qSpeeds:[1,2,3,4,5].map(q=>referenceSpeed(p.thicknessMm,q)*f),
      nominalMin,leadMin,cornerMin,curveMin,holeMin,cutMin,traverseMin,relayMin,perPartMin,totalMin,
      quoteMin:totalMin*(1+p.marginPercent/100),abrasiveKg:cutMin*p.quantity*p.abrasiveGMin/1000,
      leadMm,equivalent90,conditionsMatch,notes};
  }
  return {DEFAULTS,RULES,LABELS,estimate,normalize,referenceSpeed};
});
