(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',function(){
    const M=window.OMAXManual,el=id=>document.getElementById(id),storageKey='jetkorea-field-calculator-v2';
    if(!M||!el('fieldForm'))return;
    const keys=Object.keys(M.DEFAULTS),format=(v,d=2)=>v.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
    let lastResult=null;
    function restore(values){for(const key of keys)el('field_'+key).value=values[key];}
    function read(){const p={};for(const key of keys){const value=el('field_'+key).value;if(!value.trim())throw new Error(M.LABELS[key]+' 값을 입력하세요.');p[key]=Number(value);}return p;}
    function cell(label,value){const row=document.createElement('div');row.className='field-result-row';
      const a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;row.append(a,b);return row;}
    function render(){
      const out=el('fieldDetails'),notes=el('fieldNotes');out.replaceChildren();notes.replaceChildren();
      try{
        if(el('fieldAutoPierces').checked){const holes=Number(el('field_holes').value);el('field_pierces').value=Number.isFinite(holes)?holes+1:'';}
        el('field_pierces').disabled=el('fieldAutoPierces').checked;
        const r=M.estimate(read());lastResult=r;
        el('fieldTime').textContent=format(r.totalMin)+'분';
        el('fieldPerPart').textContent='개당 '+format(r.perPartMin)+'분 × '+r.params.quantity+'개';
        el('fieldStatus').textContent=r.conditionsMatch&&r.params.thicknessMm>=10&&r.params.thicknessMm<=70&&r.params.quality===3?'기준 조건으로 계산':'변경 조건의 근사값';
        el('fieldError').textContent='';
        out.append(cell('현재 품질 직선속도',format(r.speed)+' mm/min'),cell('개당 기본 절단시간',format(r.nominalMin)+'분'),
          cell('개당 진입·이탈',format(r.leadMin)+'분'),cell('개당 코너·곡선·타공 보정',format(r.cornerMin+r.curveMin+r.holeMin)+'분'),
          cell('개당 이동·릴레이',format(r.traverseMin+r.relayMin)+'분'),cell('예상 연마재 / 전체 수량',format(r.abrasiveKg)+' kg'));
        if(r.params.marginPercent>0)out.append(cell('여유 '+r.params.marginPercent+'% 포함',format(r.quoteMin)+'분'));
        for(const note of r.notes){const p=document.createElement('p');p.textContent=note;notes.append(p);}
        el('fieldSpeeds').replaceChildren(...r.qSpeeds.map((v,i)=>cell('Q'+(i+1),format(v)+' mm/min')));
        try{localStorage.setItem(storageKey,JSON.stringify({params:r.params,autoPierces:el('fieldAutoPierces').checked}));el('fieldSaved').textContent='마지막 입력값을 이 기기에 저장했습니다.';}catch(e){el('fieldSaved').textContent='이 환경에서는 입력값 자동 저장을 사용할 수 없습니다.';}
      }catch(error){lastResult=null;el('fieldTime').textContent='—';el('fieldPerPart').textContent='입력값을 확인해 주세요.';el('fieldStatus').textContent='계산 대기';el('fieldError').textContent=error.message;el('fieldSpeeds').replaceChildren();}
    }
    restore(M.DEFAULTS);
    try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&saved.params){restore(M.normalize(saved.params));el('fieldAutoPierces').checked=saved.autoPierces!==false;}}catch(e){/* corrupted or unavailable storage: defaults */}
    el('fieldForm').addEventListener('input',render);el('fieldForm').addEventListener('change',render);
    el('fieldForm').addEventListener('submit',event=>{event.preventDefault();render();});
    el('fieldReset').addEventListener('click',()=>{restore(M.DEFAULTS);el('fieldAutoPierces').checked=true;render();});
    for(const button of document.querySelectorAll('[data-field-preset]'))button.addEventListener('click',()=>{
      const presets={rectangle:{corners90:4,holes:0,outerCurvePercent:0},notch:{corners90:12,holes:0,outerCurvePercent:0},
        circle:{corners90:0,holes:0,outerCurvePercent:100},holes:{corners90:4,holes:6,outerCurvePercent:0}};
      const values={lengthMm:1000,cornersGentle:0,cornersSharp:0,holeDiameterMm:20,...presets[button.dataset.fieldPreset]};
      for(const [key,value]of Object.entries(values))el('field_'+key).value=value;
      el('fieldAutoPierces').checked=true;render();
    });
    el('fieldCopy').addEventListener('click',async()=>{
      if(!lastResult)return;const r=lastResult,p=r.params;
      const text='가공성 '+p.machineability+' / '+p.thicknessMm+'mm / Q'+p.quality+'\n압력 '+p.pressureBar+'bar / 오리피스 '+p.orificeMm+'mm / 노즐 '+p.nozzleMm+'mm\n연마제 '+p.abrasiveGMin+'g/min / '+p.grit+'Mesh\n총 절단길이 '+p.lengthMm+'mm / 타공 '+p.holes+' / 피어싱 '+p.pierces+'\n코너(90°/완만/급함): '+p.corners90+'/'+p.cornersGentle+'/'+p.cornersSharp+'\n개당 '+format(r.perPartMin)+'분 × '+p.quantity+'개 = '+format(r.totalMin)+'분\n근사 계산값이며 실제 가공시간과 차이가 있을 수 있습니다.';
      try{await navigator.clipboard.writeText(text);el('fieldSaved').textContent='계산 결과를 복사했습니다.';}catch(e){el('fieldSaved').textContent='복사가 지원되지 않습니다. 화면의 결과를 확인해 주세요.';}
    });
    render();
  });
})();
