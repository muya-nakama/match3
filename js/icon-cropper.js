(() => {
  let active = false;
  window.cropPlayerIcon = async function(file) {
    if (active) throw new Error('画像の編集が完了していません。');
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('JPEG・PNG・WebP画像を選択してください。');
    if (file.size > 10 * 1024 * 1024) throw new Error('10MB以下の画像を選択してください。');
    active = true;
    const url = URL.createObjectURL(file), previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    const modal = document.createElement('div');
    modal.className = 'iconCropModal';
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','アイコン画像の切り取り');
    modal.innerHTML = '<div class="iconCropTitle">アイコンを切り取る</div><div class="iconCropArea"><img class="iconCropImage" alt="編集する画像" draggable="false"><div class="iconCropFrame"><div class="iconCropGrid"></div></div></div><div class="iconCropHint">画像を動かして位置を調整・2本指で拡大縮小</div><div class="iconCropZoom"><label>倍率 <input type="range" min="1" max="6" step="0.01" value="1" aria-label="画像の拡大率"></label><button type="button" class="iconCropReset">リセット</button></div><div class="iconCropActions"><button type="button" class="iconCropCancel">キャンセル</button><button type="button" class="iconCropDone">完了</button></div>';
    const area=modal.querySelector('.iconCropArea'), frame=modal.querySelector('.iconCropFrame'), img=modal.querySelector('img'), slider=modal.querySelector('input'), cancel=modal.querySelector('.iconCropCancel'), done=modal.querySelector('.iconCropDone');
    document.body.appendChild(modal); document.body.style.overflow='hidden';
    let scale=1,minScale=1,x=0,y=0,size=0,observer,finish;
    const pointers=new Map();
    function render() {
      scale=Math.max(minScale,Math.min(minScale*6,scale));
      const maxX=Math.max(0,(img.naturalWidth*scale-size)/2),maxY=Math.max(0,(img.naturalHeight*scale-size)/2);
      x=Math.max(-maxX,Math.min(maxX,x)); y=Math.max(-maxY,Math.min(maxY,y));
      img.style.width=img.naturalWidth+'px'; img.style.height=img.naturalHeight+'px';
      img.style.transform='translate(-50%,-50%) translate('+x+'px,'+y+'px) scale('+scale+')'; slider.value=scale/minScale;
    }
    function layout() {
      if(!img.naturalWidth)return;
      const rect=area.getBoundingClientRect(),oldSize=size,zoom=scale/minScale;
      size=Math.floor(Math.min(rect.width*.84,rect.height*.85,480));
      frame.style.width=frame.style.height=size+'px';
      minScale=Math.max(size/img.naturalWidth,size/img.naturalHeight); scale=minScale*(oldSize?zoom:1);
      if(oldSize){x*=size/oldSize;y*=size/oldSize;} render();
    }
    function zoomAt(nextScale,cx,cy) {
      const ratio=Math.max(minScale,Math.min(minScale*6,nextScale))/scale;
      x=cx-(cx-x)*ratio;y=cy-(cy-y)*ratio;scale*=ratio;render();
    }
    function geometry() {
      const ps=Array.from(pointers.values()).slice(0,2);
      if(ps.length<2)return null;
      return {cx:(ps[0].x+ps[1].x)/2,cy:(ps[0].y+ps[1].y)/2,distance:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)};
    }
    area.addEventListener('pointerdown',e=>{e.preventDefault();area.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});});
    area.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId))return;
      const old=pointers.get(e.pointerId),before=geometry();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===1){x+=e.clientX-old.x;y+=e.clientY-old.y;render();}
      else if(pointers.size===2&&before&&before.distance>0){
        const after=geometry(),rect=area.getBoundingClientRect();x+=after.cx-before.cx;y+=after.cy-before.cy;
        zoomAt(scale*after.distance/before.distance,after.cx-rect.left-rect.width/2,after.cy-rect.top-rect.height/2);
      }
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])area.addEventListener(event,e=>pointers.delete(e.pointerId));
    area.addEventListener('wheel',e=>{e.preventDefault();const rect=area.getBoundingClientRect();zoomAt(scale*Math.exp(-e.deltaY*.002),e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2);},{passive:false});
    slider.addEventListener('input',()=>zoomAt(minScale*Number(slider.value),0,0));
    function reset(){x=y=0;scale=minScale;render();}
    modal.querySelector('.iconCropReset').addEventListener('click',reset);area.addEventListener('dblclick',reset);
    function onKey(e){
      if(e.key==='Escape'){e.preventDefault();finish(null);}
      if(e.key==='Tab'){
        const list=Array.from(modal.querySelectorAll('button,input')),first=list[0],last=list[list.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    try{
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('画像を読み込めませんでした。'));img.src=url;});
      if(img.naturalWidth*img.naturalHeight>40000000)throw new Error('画像が大きすぎます。解像度を下げて選択してください。');
      layout();observer=new ResizeObserver(layout);observer.observe(area);cancel.focus();
      return await new Promise((resolve,reject)=>{
        finish=resolve;cancel.addEventListener('click',()=>resolve(null));document.addEventListener('keydown',onKey);
        done.addEventListener('click',()=>{
          try{
            render();const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
            const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
            const side=size/scale,sx=(img.naturalWidth-side)/2-x/scale,sy=(img.naturalHeight-side)/2-y/scale;
            ctx.drawImage(img,sx,sy,side,side,0,0,256,256);
            let data=canvas.toDataURL('image/webp',.75);
            if(data.length>30000||!data.startsWith('data:image/webp'))data=canvas.toDataURL('image/jpeg',.65);
            if(data.length>30000){const small=document.createElement('canvas');small.width=small.height=128;small.getContext('2d').drawImage(canvas,0,0,128,128);data=small.toDataURL('image/jpeg',.60);}
            if(data.length>30000)throw new Error('画像を小さくできませんでした。別の画像を選択してください。');
            resolve(data);
          }catch(e){reject(e);}
        });
      });
    }finally{
      observer?.disconnect();document.removeEventListener('keydown',onKey);modal.remove();URL.revokeObjectURL(url);
      document.body.style.overflow=previousOverflow;previousFocus?.focus();active=false;
    }
  };
})();
