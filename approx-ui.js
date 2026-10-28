(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',function(){
    const M=window.OMAXApprox,el=id=>document.getElementById(id);
    if(!M||!el('approxThickness'))return;
    let ordText=null,requestVersion=0,fileError=null;
    const names={'01_RECT_4x90':'기본 사각형','03_NOTCH_12x90':'12코너 노치',
      '05_CIRCLE_0CORNER':'원형','07_RECT_6HOLES':'사각형＋6홀'};
    const fixed=(v,d=3)=>v.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
    function item(label,value){const row=document.createElement('div');row.className='speed-item';
      const title=document.createElement('span'),result=document.createElement('strong');title.textContent=label;result.textContent=value;row.append(title,result);return row;}
    for(const r of M.REFERENCES){const option=document.createElement('option');option.value=r.id;option.textContent=names[r.id];el('approxReference').append(option);}
    function render(){
      const results=el('approxResult'),warnings=el('approxWarnings');results.replaceChildren();warnings.replaceChildren();
      try{
        if(fileError)throw new Error(fileError);
        const thickness=Number(el('approxThickness').value);
        const estimate=ordText!==null?M.estimateOrd(ordText,thickness):M.estimateGeometry(M.referenceGeometry(el('approxReference').value),thickness);
        results.append(item('총 예상시간',fixed(estimate.totalMin)+'분'),item('절단시간 근사',fixed(estimate.cutMin)+'분'),
          item('이동시간 근사',fixed(estimate.traverseMin)+'분'),item('릴레이시간 근사',fixed(estimate.relayMin)+'분'),
          item('Q3 이상 직선속도',fixed(estimate.q3Speed,2)+' mm/min'),
          item('제품 윤곽 / 윤곽 수',fixed(estimate.geometry.productMm,2)+' mm / '+estimate.geometry.profiles+'개'),
          item('진입＋이탈 길이',fixed(estimate.geometry.leadMm,2)+' mm'),
          item('보정 전 이동거리',fixed(estimate.geometry.traverseMm,2)+' mm'));
        for(const message of estimate.warnings){const p=document.createElement('p');p.textContent=message;warnings.append(p);}
        const speeds=el('approxSpeeds');speeds.replaceChildren();
        for(let q=1;q<=5;q++)speeds.append(item('Q'+q+' 이상 직선속도',fixed(M.idealSpeed(thickness,q),2)+' mm/min'));
      }catch(error){const p=document.createElement('p');p.className='error';p.textContent=error.message;results.append(p);el('approxSpeeds').replaceChildren();}
    }
    el('approxThickness').addEventListener('input',render);
    el('approxReference').addEventListener('change',()=>{requestVersion++;ordText=null;fileError=null;el('approxFile').value='';el('approxFileName').textContent='기준 도면 사용 중';render();});
    el('approxFile').addEventListener('change',async function(){
      const token=++requestVersion,file=this.files[0];if(!file)return;
      fileError=null;ordText=null;
      if(file.size>5e6){fileError='5MB 이하의 ORD 파일을 선택하세요.';this.value='';el('approxFileName').textContent='파일 오류';render();return;}
      fileError='ORD 파일을 읽고 있습니다.';render();
      try{const text=await file.text();if(token!==requestVersion)return;M.geometryFromOrd(text);fileError=null;ordText=text;el('approxFileName').textContent=file.name;render();}
      catch(error){if(token!==requestVersion)return;fileError=error.message;ordText=null;el('approxFileName').textContent='파일 오류';render();}
    });
    el('approxClearFile').addEventListener('click',()=>{requestVersion++;ordText=null;fileError=null;el('approxFile').value='';el('approxFileName').textContent='기준 도면 사용 중';render();});
    const tbody=el('approxCalibrationRows');let maxError=0;
    for(const ref of M.REFERENCES)for(let i=0;i<3;i++){
      const estimate=M.estimateGeometry(M.referenceGeometry(ref.id),M.THICKNESSES[i]);
      const error=100*Math.abs(estimate.totalMin-ref.totalMin[i])/ref.totalMin[i];maxError=Math.max(maxError,error);
      const tr=document.createElement('tr');
      for(const value of [names[ref.id],M.THICKNESSES[i]+'mm',fixed(ref.totalMin[i]),fixed(estimate.totalMin),fixed(error,2)+'%']){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);
    }
    el('approxFit').textContent='보정 자료 12건 재현 최대 오차 '+fixed(maxError,2)+'% · 새 도면 검증 전';render();
  });
})();
