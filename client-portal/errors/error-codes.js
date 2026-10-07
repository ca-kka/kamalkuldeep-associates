import catalog from "./error-codes.json" with {type:"json"};

export function getKKAError(code){
  return catalog.codes?.[code]||catalog.codes?.["KKA-SYS-0001"];
}

export function makeKKAError(code,details={}){
  const def=getKKAError(code);
  return {code,title:def.title,severity:def.severity,userMessage:def.userMessage,adminAction:def.adminAction,retryable:def.retryable,details};
}

export function safeErrorResponse(code,referenceId=null){
  const e=getKKAError(code);
  return {error:e.userMessage,error_code:code,reference_id:referenceId};
}
