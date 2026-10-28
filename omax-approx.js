/* OMAX Model 4 empirical approximation, 2026-10-28.
 * Calibrated ONLY for the conditions below. Training fit is not independent accuracy.
 * No separate pierce dwell is added: its contribution is already in fitted residuals.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OMAXApprox = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CONDITIONS = Object.freeze({machineability:230,quality:3,pressureBar:3400.01,
    jewelMm:0.3302,mixingTubeMm:1.062,abrasiveGMin:450,mesh:80,toolOffsetMm:0.5,
    abrasiveIndex:1,cuttingModel:4,pierce:'High pressure / Intelli-PIERCE (brittle material)',tiltAJet:true,tiltingOnPath:false});
  const THICKNESSES = [10,40,70];
  const SPEEDS = [[763.34,654.68,410.70,295.01,228.24],
    [145.73,124.99,78.41,56.32,43.57],[68.24,58.53,36.72,26.37,20.41]];
  // Times are report minutes. 70 mm hours were converted: 1.3347*60, 1.3207*60.
  const REFERENCES = [
    {id:'01_RECT_4x90',fixture:'rectangle',rawCutMm:1015,traverseMm:275.1179674,traverses:1,
      convex90:3,concave90:0,circles:[],profiles:1,reportCutMm:1017.356,
      cutMin:[2.50,17.29,50.70],totalMin:[2.601,17.396,50.801],traverseMin:0.07,relayMin:0.04},
    {id:'03_NOTCH_12x90',fixture:'notch',rawCutMm:1015,traverseMm:173.9392418,traverses:1,
      convex90:7,concave90:4,circles:[],profiles:1,reportCutMm:1016.498,
      cutMin:[2.82,23.11,80.00],totalMin:[2.907,23.189,80.082],traverseMin:0.05,relayMin:0.04},
    {id:'05_CIRCLE_0CORNER',fixture:'circle',rawCutMm:1015,traverseMm:116.5535859,traverses:1,
      convex90:0,concave90:0,circles:[500/Math.PI],profiles:1,reportCutMm:1017.158,
      cutMin:[2.63,13.64,32.24],totalMin:[2.697,13.708,32.309],traverseMin:0.03,relayMin:0.04},
    {id:'07_RECT_6HOLES',fixture:'holes',rawCutMm:1105,traverseMm:440.1964025,traverses:7,
      convex90:3,concave90:0,circles:[10,10,10,10,10,10],profiles:7,reportCutMm:1082.605,
      cutMin:[3.57,22.14,78.85],totalMin:[3.963,22.541,79.242],traverseMin:0.14,relayMin:0.26}
  ];
  const EPS=1e-6, TAU=2*Math.PI;
  function finite(value,label){if(typeof value!=='number'||!Number.isFinite(value))throw new Error(label+' 값이 올바르지 않습니다.');return value;}
  function positive(value,label){finite(value,label);if(value<=0)throw new Error(label+'은 0보다 커야 합니다.');return value;}
  function norm(a){return Math.atan2(Math.sin(a),Math.cos(a));}
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function interpolate(thickness,values){
    positive(thickness,'두께');
    if(thickness<10||thickness>70)throw new Error('보정 범위는 두께 10~70mm입니다.');
    const exact=THICKNESSES.indexOf(thickness);if(exact>=0)return values[exact];
    const i=thickness<40?0:1;
    const w=Math.log(thickness/THICKNESSES[i])/Math.log(THICKNESSES[i+1]/THICKNESSES[i]);
    // Empirical interaction coefficients may be signed; they are not standalone
    // physical corner times. Interpolate those linearly in log(thickness).
    if(values.some(value=>value<=0))return values[i]*(1-w)+values[i+1]*w;
    return Math.exp(Math.log(values[i])*(1-w)+Math.log(values[i+1])*w);
  }
  function idealSpeed(thickness,quality=3){
    if(!Number.isInteger(quality)||quality<1||quality>5)throw new Error('품질은 Q1~Q5입니다.');
    return interpolate(thickness,SPEEDS.map(row=>row[quality-1]));
  }
  function parseOrd(text){
    if(typeof text!=='string'||text.length>5e6)throw new Error('5MB 이하의 ORD 텍스트가 필요합니다.');
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
    if(lines.length<2)throw new Error('ORD에는 최소 두 좌표가 필요합니다.');
    return lines.map((line,index)=>{
      const fields=line.split(',');
      if(fields.length!==4||fields.some(x=>!x.trim()))throw new Error((index+1)+'행: X,Y,B,Q 형식이 필요합니다.');
      const [x,y,b,q]=fields.map(Number);
      if(![x,y,b,q].every(Number.isFinite)||!Number.isInteger(q))throw new Error((index+1)+'행: 숫자를 확인하세요.');
      if(index<lines.length-1 && ![0,3,-3,9,-9].includes(q))throw new Error((index+1)+'행: 현재 Q3 / Lead / 이동 코드만 지원합니다.');
      // ORD coordinates are inches, regardless of MAKE's display units.
      return {x:x*25.4,y:y*25.4,b,q};
    });
  }
  function segment(a,z){
    const chord=distance(a,z),theta=4*Math.atan(a.b),heading=Math.atan2(z.y-a.y,z.x-a.x);
    if(chord<EPS)throw new Error('길이가 0인 경로 또는 단일 점 완전원은 지원하지 않습니다.');
    const r=Math.abs(a.b)<1e-12?null:chord*(1+a.b*a.b)/(4*Math.abs(a.b));
    const length=r===null?chord:r*Math.abs(theta);
    let center=null;
    if(r!==null){const h=chord*(1-a.b*a.b)/(4*a.b);center={x:(a.x+z.x)/2-h*(z.y-a.y)/chord,y:(a.y+z.y)/2+h*(z.x-a.x)/chord};}
    return {a,z,q:a.q,r,theta,length,center,startTangent:heading-theta/2,endTangent:heading+theta/2};
  }
  function geometryFromOrd(text){
    const points=parseOrd(text),segments=points.slice(0,-1).map((p,i)=>segment(p,points[i+1]));
    let productMm=0,leadMm=0,traverseMm=0,traverses=0,convex90=0,concave90=0;
    const profiles=[],chains=[];let profile=[],chain=[];
    const closeProfile=()=>{if(profile.length){profiles.push(profile);profile=[];}};
    for(const s of segments){
      if(Math.abs(s.q)===3){productMm+=s.length;profile.push(s);}else closeProfile();
      if(Math.abs(s.q)===9)leadMm+=s.length;
      if(s.q===0){traverseMm+=s.length;traverses++;if(chain.length){chains.push(chain);chain=[];}}
      else chain.push(s);
    }
    closeProfile();if(chain.length)chains.push(chain);
    if(!profiles.length)throw new Error('Q3 제품 윤곽을 찾지 못했습니다.');
    const circles=[],warnings=[],leadPairs=[];
    if(chains.length!==profiles.length)throw new Error('각 절단 경로에 하나의 연속된 제품 윤곽이 필요합니다.');
    for(const c of chains){
      const core=c.filter(s=>Math.abs(s.q)===3),leads=c.filter(s=>Math.abs(s.q)===9);
      if(!core.length)throw new Error('제품 윤곽 없는 리드 경로는 지원하지 않습니다.');
      if(leads.length!==2||Math.abs(c[0].q)!==9||Math.abs(c[c.length-1].q)!==9)throw new Error('진입·제품 윤곽·이탈 순서의 경로가 필요합니다.');
      if(c.some(s=>Math.sign(s.q)!==Math.sign(c[0].q)))throw new Error('하나의 윤곽 안에서 오프셋 방향이 변경됐습니다.');
      const pair=[c[0].length,c[c.length-1].length];leadPairs.push(pair);
      if(Math.abs(pair[0]-10)>0.1||Math.abs(pair[1]-5)>0.1)warnings.push('진입 10mm / 이탈 5mm와 다른 리드 길이: 추가 검증 필요');
      if(distance(core[0].a,core[core.length-1].z)>0.01)throw new Error('열린 제품 윤곽은 아직 보정되지 않았습니다.');
      const first=core[0],allArcs=core.every(s=>s.r!==null);
      const circle=allArcs && core.every(s=>Math.abs(s.r-first.r)<0.01&&distance(s.center,first.center)<0.01&&Math.sign(s.theta)===Math.sign(first.theta))
        && Math.abs(core.reduce((sum,s)=>sum+s.theta,0))>TAU-1e-5
        && Math.abs(core.reduce((sum,s)=>sum+s.theta,0))<TAU+1e-5;
      if(circle){
        const joins=[Math.abs(norm(first.startTangent-c[0].endTangent)),Math.abs(norm(c[c.length-1].startTangent-core[core.length-1].endTangent))];
        if(joins.some(a=>Math.abs(a-80*Math.PI/180)>0.02))warnings.push('원형 리드 연결각이 기준 80°와 다릅니다.');
        circles.push(first.r);
        if(first.r<9.99||first.r>500/Math.PI+0.01)warnings.push('원호 반경이 보정 기준 10~159.155mm 밖입니다.');
        const inward=first.theta*(c[0].q<0?1:-1)>0;
        if(!((Math.abs(first.r-10)<0.01&&inward)||(Math.abs(first.r-500/Math.PI)<0.01&&!inward)))
          warnings.push('기준과 다른 원 반경·내외 방향 조합: 추가 검증 필요');
      }else{
        if(allArcs||core.some(s=>s.r!==null))throw new Error('현재 모델은 직선 폐합 윤곽과 완전원 조합만 지원합니다.');
        const side=c[0].q<0?1:-1;
        // Include joins to leads: a rectangle has 3 traversed 90-degree turns.
        for(let i=1;i<c.length;i++){
          const turn=norm(c[i].startTangent-c[i-1].endTangent);if(Math.abs(turn)<1e-6)continue;
          const units=Math.pow(Math.abs(turn)/(Math.PI/2),2);
          if(turn*side<0)convex90+=units;else concave90+=units;
          if(Math.abs(Math.abs(turn)-Math.PI/2)>0.01)warnings.push('90° 이외의 코너는 각도 제곱 근사이며 추가 검증 필요');
        }
      }
    }
    return {productMm,leadMm,rawCutMm:productMm+leadMm,traverseMm,traverses,
      convex90,concave90,circles,profiles:profiles.length,leadPairs,warnings:[...new Set(warnings)]};
  }
  function coefficients(index){
    const v=SPEEDS[index][2],rect=REFERENCES[0],notch=REFERENCES[1],circle=REFERENCES[2],holes=REFERENCES[3];
    const convex=(rect.cutMin[index]-rect.rawCutMm/v)/3;
    return {convex,concave:(notch.cutMin[index]-notch.rawCutMm/v-7*convex)/4,
      circleLarge:circle.cutMin[index]-circle.rawCutMm/v,
      circleSmall:(holes.cutMin[index]-holes.rawCutMm/v-3*convex)/6};
  }
  // Least-squares traversal fit: distance plus per-move overhead, all 4 reports.
  function traversalFit(){
    let xx=0,xn=0,nn=0,xy=0,ny=0;
    for(const r of REFERENCES){xx+=r.traverseMm*r.traverseMm;xn+=r.traverseMm*r.traverses;nn+=r.traverses*r.traverses;xy+=r.traverseMm*r.traverseMin;ny+=r.traverses*r.traverseMin;}
    const determinant=xx*nn-xn*xn;
    return {perMm:(xy*nn-ny*xn)/determinant,perMove:(ny*xx-xy*xn)/determinant};
  }
  const TRAVERSE=traversalFit();
  function estimateGeometry(g,thicknessMm,conditions={}){
    for(const key of Object.keys(conditions)){
      if(!(key in CONDITIONS)||conditions[key]!==CONDITIONS[key])throw new Error('보정되지 않은 조건입니다: '+key);
    }
    for(const key of ['rawCutMm','traverseMm','traverses','convex90','concave90','profiles']){
      finite(g[key],key);if(g[key]<0)throw new Error(key+'은 음수일 수 없습니다.');
    }
    positive(g.rawCutMm,'절단길이');positive(g.profiles,'윤곽 수');
    if(!Number.isInteger(g.profiles)||!Number.isInteger(g.traverses))throw new Error('윤곽·이동 횟수는 정수여야 합니다.');
    if(!Array.isArray(g.circles))throw new Error('원호 반경 목록이 필요합니다.');
    const v=idealSpeed(thicknessMm),coefs=THICKNESSES.map((_,i)=>coefficients(i));
    const c={};for(const key of Object.keys(coefs[0]))c[key]=interpolate(thicknessMm,coefs.map(row=>row[key]));
    let circleMin=0;for(const r of g.circles){
      positive(r,'반경');
      // Only two radii are calibrated; radius interpolation/extrapolation is empirical.
      const weight=Math.log(r/10)/Math.log((500/Math.PI)/10);
      circleMin+=Math.exp(Math.log(c.circleSmall)*(1-weight)+Math.log(c.circleLarge)*weight);
    }
    const nominalMin=g.rawCutMm/v;
    const residualMin=c.convex*g.convex90+c.concave*g.concave90+circleMin;
    const cutMin=nominalMin+residualMin;
    const traverseMin=TRAVERSE.perMm*g.traverseMm+TRAVERSE.perMove*g.traverses;
    const relayMin=0.0033333333333333335+0.03666666666666667*g.profiles;
    const totalMin=cutMin+traverseMin+relayMin;
    if(!Number.isFinite(totalMin)||totalMin<=0)throw new Error('경로 규모가 계산 범위를 벗어났습니다.');
    return {thicknessMm,q3Speed:v,nominalMin,residualMin,cutMin,traverseMin,relayMin,totalMin,
      conditions:CONDITIONS,geometry:g,warnings:[...new Set([...(g.warnings||[]),
        '12건 보정 자료 기반의 근사값입니다. 새 도면의 ±10% 정확도는 아직 검증되지 않았습니다.',
        ...(!THICKNESSES.includes(thicknessMm)?['중간 두께는 로그 보간값입니다.']:[])])]};
  }
  function estimateOrd(text,thicknessMm,conditions){return estimateGeometry(geometryFromOrd(text),thicknessMm,conditions);}
  function referenceGeometry(id){
    const r=REFERENCES.find(row=>row.id===id);if(!r)throw new Error('알 수 없는 기준 도면입니다.');
    return {productMm:1000,leadMm:15*r.profiles,rawCutMm:r.rawCutMm,traverseMm:r.traverseMm,
      traverses:r.traverses,convex90:r.convex90,concave90:r.concave90,circles:r.circles.slice(),profiles:r.profiles,warnings:[]};
  }
  return {CONDITIONS,THICKNESSES,SPEEDS,REFERENCES,idealSpeed,parseOrd,geometryFromOrd,
    estimateGeometry,estimateOrd,referenceGeometry};
});
