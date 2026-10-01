/* 画像はPOSTで送り、保存結果を短いJSONPリクエストで確認する。 */
(() => {
  function request(api,params) {
    return new Promise((resolve,reject)=>{
      const cb='__rankV2_'+Date.now()+'_'+Math.random().toString(36).slice(2),script=document.createElement('script');
      const clean=()=>{clearTimeout(timer);delete window[cb];script.remove();};
      const timer=setTimeout(()=>{clean();reject(new Error('ランキング通信がタイムアウトしました。'));},8000);
      window[cb]=data=>{clean();resolve(data);};
      script.onerror=()=>{clean();reject(new Error('ランキング通信に失敗しました。'));};
      script.src=api+'?'+new URLSearchParams({...params,callback:cb,_:Date.now()});
      document.body.appendChild(script);
    });
  }
  window.MonpatchRanking = {
    async submit(api,payload) {
      const playerId=window.MonpatchIdentity.getId();
      const requestId='r_'+crypto.randomUUID().replace(/-/g,'');
      const avatarData=localStorage.getItem('match3_profile_avatar')||'';
      if(avatarData.length>30000)throw new Error('アイコンを選び直してください。');
      // 旧APIへの書き込みを避け、再デプロイ不足を明確に表示する。
      const info=await request(api,{minutes:payload.minutes,interference:payload.interference});
      if(info.schema!==2)throw new Error('ランキング側の更新が必要です（Apps Script 2.67）。');
      const body=new URLSearchParams({...payload,playerId,requestId,avatarData});
      const controller=new AbortController();
      const deadline=setTimeout(()=>controller.abort(),25000);
      try{
        await fetch(api,{method:'POST',mode:'no-cors',body,signal:controller.signal,credentials:'omit'});
      }finally{clearTimeout(deadline);}
      const end=Date.now()+35000;
      while(Date.now()<end){
        const data=await request(api,{action:'status',requestId});
        if(!data.pending){if(!data.ok)throw new Error(data.error||'登録できませんでした。');return data;}
        await new Promise(resolve=>setTimeout(resolve,900));
      }
      throw new Error('保存結果を確認できませんでした。もう一度登録してください。');
    },
    avatarMarkup(value,name) {
      const valid=typeof value==='string' && value.length<=30000 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value);
      if(valid)return '<img class="rankPlayerIcon" src="'+value+'" alt="">';
      const initials=Array.from(String(name||'?')).slice(0,2).join('').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      return '<span class="rankPlayerIcon rankPlayerInitials">'+initials+'</span>';
    }
  };
})();
