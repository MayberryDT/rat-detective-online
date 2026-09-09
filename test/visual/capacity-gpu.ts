/** Optional asynchronous GPU measurement. Never blocks with finish/readback. */
export function gpuTimer(gl: WebGL2RenderingContext) {
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const pending:WebGLQuery[]=[];const samples:number[]=[];let current:WebGLQuery|null=null;
  const clear=()=>{for(const q of pending)gl.deleteQuery(q);pending.length=0;};
  return {
    supported:!!ext,
    begin(){
      if(!ext)return;
      if(gl.getParameter(ext.GPU_DISJOINT_EXT)){clear();return;}
      while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
        const q=pending.shift()!;samples.push(Number(gl.getQueryParameter(q,gl.QUERY_RESULT))/1e6);gl.deleteQuery(q);
      }
      if(pending.length>=8)return;
      current=gl.createQuery();if(current)gl.beginQuery(ext.TIME_ELAPSED_EXT,current);
    },
    end(){if(ext&&current){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(current);current=null;}},
    reset(){samples.length=0;clear();},
    finish(){clear();return samples.slice();},
  };
}
